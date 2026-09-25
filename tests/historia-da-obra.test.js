/**
 * Onda 2 da auditoria tela a tela (25/09/2026) — "história e celular".
 *
 * Casa 14 da demonstração (tests/casa14.fixture.js). Prova:
 *   - valor agregado: IDP, IDC, custo no término e término projetado;
 *   - atraso da obra = término projetado − data contratual, um número só;
 *   - início atrasado e material de etapa concluída;
 *   - severidade por dinheiro e tempo, e causas-raiz;
 *   - frase-âncora situação → causa → ação;
 *   - cobertura do diário e dias impraticáveis.
 */
import { describe, it, expect, vi, afterAll } from 'vitest';
import { novaEtapaCronograma, novoMaterial } from '../src/nucleo/base.js';
import {
  alertasObra,
  causasRaizObra,
  diaImpraticavel,
  diarioIndicadores,
  etapaCalc,
  historiaObra,
  kpisObra,
  materialCalc,
  nivelIndice,
  pendenciasObra,
  prazoObra,
  saudeObra,
  valorAgregadoObra,
} from '../src/dominio/calculos.js';
import { HOJE, casa14, h } from './casa14.fixture.js';

vi.useFakeTimers();
vi.setSystemTime(new Date(`${HOJE}T12:00:00Z`));
afterAll(() => vi.useRealTimers());

const perto = (a, b, tol = 0.001) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);

describe('valor agregado', () => {
  const o = casa14();
  const va = valorAgregadoObra(o);
  const k = kpisObra(o);

  it('IDP = físico realizado / físico previsto hoje (76,4% — o número da auditoria)', () => {
    perto(va.realizado, 0.7643);
    perto(va.idp, va.realizado / va.previsto, 1e-9);
    expect(va.idp).toBeLessThan(0.95);
  });

  it('IDC compara só custo físico: VA = físico × custo físico previsto; CR = pago − não físico', () => {
    perto(va.va, k.progressoFisico * k.custoFisicoPrevisto, 0.01);
    perto(va.cr, k.totalPago - k.custoNaoFisico, 0.01);
    perto(va.idc, va.va / va.cr, 1e-9);
  });

  it('custo no término = custo físico previsto / IDC + custo não físico', () => {
    perto(va.eac, k.custoFisicoPrevisto / va.idc + k.custoNaoFisico, 0.01);
    perto(va.desvioCusto, va.eac - k.custoPrevisto, 0.01);
  });

  it('término projetado = início + duração do cronograma / IDP', () => {
    /* início h(-240), fim do cronograma h(+25): 265 dias; 265 / 0,854 ≈ 310 */
    expect(va.inicio).toBe(h(-240));
    expect(va.fimPlano).toBe(h(25));
    expect(va.termino).toBe(h(-240 + Math.round(265 / va.idp)));
    expect(va.atrasoProjetado).toBe(Math.round(265 / va.idp) - 240 + 10);
  });

  it('obra que ainda não deveria ter começado não tem IDP nem projeção pelo ritmo', () => {
    const o2 = casa14();
    o2.dataInicio = h(10);
    o2.cronograma = [Object.assign(novaEtapaCronograma('X'), { inicioPrevisto: h(10), fimPrevisto: h(40) })];
    const v = valorAgregadoObra(o2);
    expect(v.idp).toBeNull();
    expect(v.termino).toBe(h(40));
  });

  it('projeção nunca cai antes de hoje se ainda falta obra', () => {
    const o2 = casa14();
    o2.cronograma.forEach((e) => { e.progresso = 1; });
    o2.cronograma[0].progresso = 0.99;
    expect(valorAgregadoObra(o2).termino >= HOJE).toBe(true);
  });

  it('semáforo com os limiares da auditoria', () => {
    expect(nivelIndice(0.96, 'idp')).toBe('ok');
    expect(nivelIndice(0.9, 'idp')).toBe('atencao');
    expect(nivelIndice(0.84, 'idp')).toBe('critico');
    expect(nivelIndice(0.98, 'idc')).toBe('ok');
    expect(nivelIndice(0.95, 'idc')).toBe('atencao');
    expect(nivelIndice(0.9, 'idc')).toBe('critico');
    expect(nivelIndice(null, 'idp')).toBe('');
  });
});

describe('atraso da obra — um número só', () => {
  const o = casa14();
  const p = prazoObra(o);

  it('é término projetado − data contratual, e a saúde da carteira usa ele', () => {
    expect(p.atrasoDias).toBe(p.atrasoProjetado);
    expect(p.desvioDias).toBe(40); /* etapa mais atrasada: Reboco */
    expect(saudeObra(o).motivos[0].texto).toBe(`Atrasada ${p.atrasoDias}d`);
    expect(historiaObra(o).situacao[0].texto).toContain(`Atrasada ${p.atrasoDias} dias`);
  });
});

describe('cronograma e materiais', () => {
  const o = casa14();

  it('Forro em 0% com início vencido há 20 dias acende alerta de início atrasado', () => {
    const forro = o.cronograma.find((e) => e.etapa === 'Forro/gesso');
    const c = etapaCalc(forro);
    expect(c.situacao).toBe('NÃO INICIADO'); /* a situação da planilha não muda */
    expect(c.atrasoInicio).toBe(20);
    expect(alertasObra(o).some((a) => /Forro\/gesso não começou/.test(a.titulo))).toBe(true);
    expect(kpisObra(o).etapasInicioAtrasado).toBe(1);
  });

  it('material de etapa concluída não é mais "vencido" (o cimento da fundação)', () => {
    const cimento = o.materiais.find((m) => /Cimento/.test(m.material));
    const c = materialCalc(o, cimento);
    expect(c.saldo).toBeGreaterThan(0); /* sobra segue no custo, como na planilha */
    expect(c.etapaConcluida).toBe(true);
    expect(c.vencido).toBe(false);
    expect(alertasObra(o).some((a) => /Cimento/.test(a.titulo))).toBe(false);
  });

  it('material vencido de etapa em andamento trava a frente e é crítico', () => {
    const rejunte = o.materiais.find((m) => m.material === 'Rejunte');
    expect(materialCalc(o, rejunte).travaFrente).toBe(true);
    const a = alertasObra(o).find((x) => /Rejunte travando/.test(x.titulo));
    expect(a.sev).toBe(3);
  });

  it('comprado acima do necessário aparece como excesso', () => {
    const o2 = casa14();
    const m = Object.assign(novoMaterial(), { etapa: 'Pisos e revestimentos', material: 'Porcelanato', quantidadeNecessaria: 60, precoPrevisto: 47 });
    o2.materiais.push(m);
    o2.lancamentos.push({ id: 'l1', tipo: 'Material', materialId: m.id, quantidade: 60, precoUnitario: 47 },
      { id: 'l2', tipo: 'Material', materialId: m.id, quantidade: 60, precoUnitario: 47 });
    expect(materialCalc(o2, m).excesso).toBe(60);
  });
});

describe('alertas — severidade por dinheiro e tempo', () => {
  const o = casa14();
  const al = alertasObra(o);

  it('parcela sem crédito há mais de 15 dias é crítica, e "sem retorno" vem junto, não em outro alerta', () => {
    const parc = al.filter((a) => a.modulo === 'Recebimentos');
    expect(parc).toHaveLength(1);
    expect(parc[0].sev).toBe(3);
    expect(parc[0].valor).toBe(37500);
    expect(parc[0].detalhe).toContain('dias sem retorno');
  });

  it('medição em aberto: > 60 dias é crítica; até 60, atenção', () => {
    const med = al.filter((a) => a.modulo === 'Medições' && /em aberto/.test(a.titulo));
    expect(med.find((a) => a.dias === 108).sev).toBe(3);
    expect(med.find((a) => a.dias === 45).sev).toBe(2);
    expect(med.every((a) => a.valor > 0)).toBe(true);
  });

  it('etapa atrasada: > 30 dias é crítica', () => {
    const reboco = al.find((a) => /Reboco e requadros atrasada/.test(a.titulo));
    expect(reboco.sev).toBe(3);
    const pisos = al.find((a) => /Pisos e revestimentos atrasada/.test(a.titulo));
    expect(pisos.sev).toBe(2);
  });
});

describe('causas-raiz', () => {
  const o = casa14();
  const causas = causasRaizObra(o);

  it('rejunte que falta é a causa; Pisos atrasada é sintoma dele', () => {
    const r = causas.find((c) => /Rejunte/.test(c.titulo));
    expect(r.sintomas.map((s) => s.titulo)).toEqual(['Pisos e revestimentos atrasada em 10 dia(s)']);
  });

  it('etapas do mesmo responsável viram uma causa só', () => {
    const r = causas.find((c) => c.chave === 'resp:antonio ribeiro');
    expect(r.titulo).toBe('Antônio Ribeiro: 3 etapas atrasadas');
    expect(r.sintomas).toHaveLength(3);
    expect(r.dias).toBe(40);
  });

  it('nenhuma pendência some nem conta duas vezes', () => {
    const noGrupo = causas.reduce((s, c) => s + (c.chave.startsWith('resp:') ? c.sintomas.length : 1 + c.sintomas.length), 0);
    expect(noGrupo).toBe(pendenciasObra(o).total);
  });

  it('caixa negativo vira sintoma da parcela parada, e não soma no valor em risco', () => {
    const o2 = casa14();
    o2.fin.saldoInicial = -100000;
    const fin = causasRaizObra(o2).find((c) => c.chave === 'financiamento');
    expect(fin.sintomas.some((s) => /Caixa da obra negativo/.test(s.titulo))).toBe(true);
    expect(fin.valor).toBe(37500);
  });

  it('ordem: mais grave, depois mais dinheiro', () => {
    for (let i = 1; i < causas.length; i++) {
      const a = causas[i - 1], b = causas[i];
      expect(a.sev > b.sev || (a.sev === b.sev && a.valor >= b.valor)).toBe(true);
    }
    expect(causas[0].chave).toBe('financiamento');
  });
});

describe('frase-âncora', () => {
  it('situação com nível, três causas e o valor travado nelas', () => {
    const hs = historiaObra(casa14());
    expect(hs.nivel).toBe('critico');
    expect(hs.situacao[0].nivel).toBe('critico');
    expect(hs.causas).toHaveLength(3);
    expect(hs.valorTravado).toBe(hs.causas.reduce((s, c) => s + c.valor, 0));
  });
});

describe('diário', () => {
  const d = diarioIndicadores(casa14());

  it('cobertura = dias úteis com registro / dias úteis desde o início', () => {
    expect(d.diasUteis).toBe(173); /* 241 dias corridos, seg–sex */
    expect(d.registros).toBe(6);
    /* registro de sábado ou domingo não conta como dia útil coberto */
    const uteis = casa14().diario.filter((r) => ![0, 6].includes(new Date(r.data + 'T12:00:00Z').getUTCDay())).length;
    expect(uteis).toBeLessThan(6);
    perto(d.cobertura, uteis / 173, 0.0001);
  });

  it('dias impraticáveis: chuva forte, impraticável ou efetivo zero com obra parada', () => {
    expect(d.diasImpraticaveis).toBe(2);
    expect(diaImpraticavel({ clima: 'Bom', efetivo: 0, atividades: 'Obra parada por falta de material' })).toBe(true);
    expect(diaImpraticavel({ clima: 'Chuva fraca', efetivo: 5, atividades: 'Reboco' })).toBe(false);
  });

  it('sem registro há N dias conta a partir do último', () => {
    expect(d.semRegistroHa).toBe(2);
  });
});
