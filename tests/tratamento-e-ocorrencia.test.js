// @vitest-environment jsdom
/**
 * Migração 0015 — tratamento de alerta e ocorrência do diário como pendência.
 *
 * Prova, na Casa 14 (tests/casa14.fixture.js):
 *   - a chave do alerta é estável (o título muda com os dias, a chave não);
 *   - resolvido e adiado saem da contagem; em tratamento continua contando;
 *   - o alerta volta sozinho se piorar ou se o adiamento vencer;
 *   - ocorrência aberta vira pendência, e entra na causa-raiz certa;
 *   - validação espelha os CHECKs da migração;
 *   - a carga não quebra se a tabela nova ainda não existe no banco.
 */
import { describe, it, expect, vi, afterEach, afterAll, beforeEach } from 'vitest';
import { idTratamento, migrar } from '../src/nucleo/base.js';
import {
  alertasObra,
  causasRaizObra,
  chaveAlerta,
  diarioIndicadores,
  pendenciasObra,
  situacaoTratamento,
  tratamentoDoAlerta,
} from '../src/dominio/calculos.js';
import { apenasErros, validarDiario, validarTratamento } from '../src/dominio/validacao.js';
import { SUPA, TABELAS_DB } from '../src/dados/supabase.js';
import { HOJE, casa14, h } from './casa14.fixture.js';

const relogio = (iso) => vi.setSystemTime(new Date(`${iso}T12:00:00Z`));
vi.useFakeTimers();
beforeEach(() => relogio(HOJE));
afterAll(() => vi.useRealTimers());

const alerta = (o, re) => alertasObra(o).find((a) => re.test(a.titulo));
const marcar = (o, a, campos) => {
  o.tratamentos = [...o.tratamentos.filter((t) => t.chave !== a.chave), tratamentoDoAlerta(o, a, campos)];
};

describe('chave do alerta', () => {
  it('é tipo + registro, e não muda quando o título muda com os dias', () => {
    const o = casa14();
    const reboco = o.cronograma.find((e) => e.etapa === 'Reboco e requadros');
    const hoje = alerta(o, /Reboco e requadros atrasada/);
    expect(hoje.chave).toBe(`etapa-atrasada:${reboco.id}`);
    relogio(h(1));
    const amanha = alerta(o, /Reboco e requadros atrasada/);
    expect(amanha.titulo).not.toBe(hoje.titulo);
    expect(amanha.chave).toBe(hoje.chave);
    expect(chaveAlerta({ tipo: 'caixa-negativo', ref: { view: 'fluxo' } })).toBe('caixa-negativo:');
  });

  it('o tratamento tem id determinístico: tratar de novo atualiza, não duplica', () => {
    const o = casa14();
    const a = alerta(o, /Forro\/gesso não começou/);
    const t1 = tratamentoDoAlerta(o, a, { status: 'em_tratamento', responsavel: 'Gesso Arte' });
    o.tratamentos.push(t1);
    const t2 = tratamentoDoAlerta(o, a, { status: 'resolvido' });
    expect(t1.id).toBe(idTratamento(o.id, a.chave));
    expect(t2.id).toBe(t1.id);
    expect(t2.responsavel).toBe('Gesso Arte'); /* o que não mudou fica */
    expect(t2.sevMarcada).toBe(a.sev);
  });
});

describe('tratamento tira da contagem — ou não', () => {
  it('resolvido sai de pendenciasObra e das causas; o alerta continua visível como tratado', () => {
    const o = casa14();
    const antes = pendenciasObra(o).total;
    const a = alerta(o, /Forro\/gesso não começou/);
    marcar(o, a, { status: 'resolvido' });
    const p = pendenciasObra(o);
    expect(p.total).toBe(antes - 1);
    expect(p.tratados).toBe(1);
    expect(alerta(o, /Forro\/gesso não começou/).silenciado).toBe(true);
    expect(causasRaizObra(o).some((c) => c.principal.chave === a.chave)).toBe(false);
  });

  it('em tratamento continua contando — só diz quem está cuidando', () => {
    const o = casa14();
    const antes = pendenciasObra(o).total;
    marcar(o, alerta(o, /Forro\/gesso não começou/), { status: 'em_tratamento', responsavel: 'Júlio' });
    expect(pendenciasObra(o).total).toBe(antes);
    expect(alerta(o, /Forro\/gesso/).tratamento.responsavel).toBe('Júlio');
  });

  it('adiado sai até a data; no dia seguinte volta sozinho', () => {
    const o = casa14();
    const antes = pendenciasObra(o).total;
    marcar(o, alerta(o, /Forro\/gesso não começou/), { status: 'adiado', adiarAte: h(3) });
    expect(pendenciasObra(o).total).toBe(antes - 1);
    relogio(h(3));
    expect(alerta(o, /Forro\/gesso/).silenciado).toBe(true);
    relogio(h(4));
    const a = alerta(o, /Forro\/gesso/);
    expect(a.silenciado).toBe(false);
    expect(a.reaberto).toBe('o adiamento venceu');
  });

  it('resolvido volta se ficar mais grave (medição em aberto passa de 60 dias)', () => {
    const o = casa14();
    const a = alerta(o, /Medição 4 do CT-001 em aberto/);
    expect(a.sev).toBe(2);
    marcar(o, a, { status: 'resolvido' });
    expect(alerta(o, /Medição 4 do CT-001/).silenciado).toBe(true);
    relogio(h(16)); /* 61 dias em aberto: vira crítico */
    const depois = alerta(o, /Medição 4 do CT-001/);
    expect(depois.sev).toBe(3);
    expect(depois.silenciado).toBe(false);
    expect(depois.reaberto).toBe('ficou mais grave desde a marcação');
  });

  it('resolvido volta se o valor em jogo subir mais de 10%', () => {
    const a = { sev: 2, valor: 1200 };
    const t = { status: 'resolvido', sevMarcada: 2, valorMarcado: 1000 };
    expect(situacaoTratamento(t, a).silenciado).toBe(false);
    expect(situacaoTratamento(t, { sev: 2, valor: 1090 }).silenciado).toBe(true);
  });
});

describe('ocorrência do diário como pendência', () => {
  const comOcorrencia = (campos) => {
    const o = casa14();
    const d = o.diario.find((x) => /Piso parou/.test(x.ocorrencias));
    Object.assign(d, campos);
    return { o, d };
  };

  it('sem status é só registro: não vira alerta', () => {
    const o = casa14();
    expect(alertasObra(o).some((a) => a.tipo === 'ocorrencia')).toBe(false);
  });

  it('aberta há 12 dias (> 7) é crítica, com responsável e prazo no detalhe', () => {
    const { o } = comOcorrencia({ ocorrenciaStatus: 'aberta', ocorrenciaResponsavel: 'Júlio', ocorrenciaPrazo: h(2), etapa: 'Pisos e revestimentos' });
    const a = alertasObra(o).find((x) => x.tipo === 'ocorrencia');
    expect(a.sev).toBe(3);
    expect(a.detalhe).toContain('com Júlio');
    expect(a.detalhe).toContain('prazo');
  });

  it('ligada ao rejunte, entra na causa do material que trava Pisos — não vira outro problema', () => {
    const { o } = comOcorrencia({ ocorrenciaStatus: 'aberta', ocorrenciaResponsavel: 'Júlio' });
    const rejunte = o.materiais.find((m) => m.material === 'Rejunte');
    o.diario.find((x) => x.ocorrenciaStatus === 'aberta').ocorrenciaMaterialId = rejunte.id;
    const causa = causasRaizObra(o).find((c) => c.chave === 'etapa:pisos e revestimentos');
    const titulos = [causa.principal, ...causa.sintomas].map((x) => x.titulo);
    expect(titulos.some((t) => /Rejunte travando/.test(t))).toBe(true);
    expect(titulos.some((t) => /Ocorrência aberta/.test(t))).toBe(true);
    expect(titulos.some((t) => /Pisos e revestimentos atrasada/.test(t))).toBe(true);
    expect(causa.valor).toBe(1240); /* só o material soma: a ocorrência não conta o dinheiro de novo */
  });

  it('resolvida não é pendência; indicadores do diário contam abertas, vencidas e resolvidas', () => {
    const { o, d } = comOcorrencia({ ocorrenciaStatus: 'aberta', ocorrenciaPrazo: h(-1) });
    let ind = diarioIndicadores(o);
    expect(ind.ocorrenciasAbertas).toBe(1);
    expect(ind.ocorrenciasVencidas).toBe(1);
    d.ocorrenciaStatus = 'resolvida';
    d.ocorrenciaResolvidaEm = HOJE;
    ind = diarioIndicadores(o);
    expect(ind.ocorrenciasAbertas).toBe(0);
    expect(ind.ocorrenciasResolvidas).toBe(1);
    expect(alertasObra(o).some((a) => a.tipo === 'ocorrencia')).toBe(false);
  });
});

describe('validação — espelha os CHECKs da 0015', () => {
  const base = { chave: 'etapa-atrasada:x', status: 'em_tratamento', sevMarcada: 2, valorMarcado: 0 };

  it('tratamento: status fora da lista, adiado sem data e chave vazia são erros', () => {
    expect(apenasErros(validarTratamento({ ...base, status: 'novo' }))).toHaveLength(1);
    expect(apenasErros(validarTratamento({ ...base, status: 'adiado', adiarAte: '' }))).toHaveLength(1);
    expect(apenasErros(validarTratamento({ ...base, chave: ' ' }))).toHaveLength(1);
    expect(apenasErros(validarTratamento({ ...base, sevMarcada: 4 }))).toHaveLength(1);
    expect(validarTratamento(base)).toEqual([]);
  });

  it('adiar para uma data que já passou é alerta, não erro', () => {
    const p = validarTratamento({ ...base, status: 'adiado', adiarAte: h(-1) });
    expect(apenasErros(p)).toEqual([]);
    expect(p.some((x) => x.sev === 'alerta')).toBe(true);
  });

  it('ocorrência: status sem texto e prazo antes do registro são erros; sem responsável, alerta', () => {
    const d = { data: HOJE, efetivo: 0, ocorrencias: '', ocorrenciaStatus: 'aberta' };
    expect(apenasErros(validarDiario(d)).map((x) => x.campo)).toContain('ocorrencias');
    const d2 = { ...d, ocorrencias: 'Piso parou', ocorrenciaPrazo: h(-3), ocorrenciaResponsavel: 'Júlio' };
    expect(apenasErros(validarDiario(d2)).map((x) => x.campo)).toEqual(['ocorrenciaPrazo']);
    const d3 = { ...d, ocorrencias: 'Piso parou' };
    expect(apenasErros(validarDiario(d3))).toEqual([]);
    expect(validarDiario(d3).some((x) => x.campo === 'ocorrenciaResponsavel' && x.sev === 'alerta')).toBe(true);
    expect(validarDiario({ data: HOJE, efetivo: 0, ocorrencias: '' })).toEqual([]);
  });
});

describe('estado antigo e banco sem a migração', () => {
  it('migrar() dá tratamentos vazios e campos de ocorrência em branco a obra antiga', () => {
    const o = casa14();
    delete o.tratamentos;
    o.diario.forEach((d) => { delete d.ocorrenciaStatus; delete d.ocorrenciaPrazo; });
    const m = migrar({ obras: [o] }).obras[0];
    expect(m.tratamentos).toEqual([]);
    expect(m.diario.every((d) => d.ocorrenciaStatus === '' && d.ocorrenciaPrazo === '')).toBe(true);
  });

  it('a tabela de tratamento é opcional no mapa de sincronização', () => {
    const t = TABELAS_DB.find((x) => x.nome === 'alertas_tratamento');
    expect(t.opcional).toBe(true);
    expect(t.colecao).toBe('tratamentos');
  });

  describe('carga com banco que ainda não tem alertas_tratamento', () => {
    let original;
    beforeEach(() => { original = { sb: SUPA.sb, usuario: SUPA.usuario }; });
    afterEach(() => { SUPA.sb = original.sb; SUPA.usuario = original.usuario; SUPA.indisponiveis = new Set(); });

    const bancoFalso = (faltando) => ({
      from(nome) {
        const vazio = { data: [], error: null };
        return {
          select: () => ({
            limit: async () => (nome === faltando
              ? { data: null, error: { code: 'PGRST205', message: `Could not find the table 'public.${nome}'` } }
              : vazio),
            eq: () => Object.assign(Promise.resolve(vazio), { maybeSingle: async () => ({ data: null, error: null }) }),
          }),
        };
      },
    });

    it('abre sem a tabela, desliga o recurso e não tenta gravá-la', async () => {
      SUPA.sb = bancoFalso('alertas_tratamento');
      SUPA.usuario = { id: 'u1', email: 'a@b.c' };
      const estado = await SUPA.carregar();
      expect(estado.obras).toEqual([]);
      expect(SUPA.tabelaDisponivel('alertas_tratamento')).toBe(false);
      expect(SUPA.tabelaDisponivel('diario')).toBe(true);
    });

    it('tabela obrigatória faltando continua sendo erro', async () => {
      SUPA.sb = bancoFalso('diario');
      SUPA.usuario = { id: 'u1', email: 'a@b.c' };
      await expect(SUPA.carregar()).rejects.toBeTruthy();
    });
  });
});
