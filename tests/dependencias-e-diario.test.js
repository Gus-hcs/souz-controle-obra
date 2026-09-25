/**
 * Onda 4 com a migração 0017: dependências fim→início, caminho crítico e
 * diário de campo (efetivo por função, % da etapa, impacto no prazo, o
 * diário alimentando o cronograma).
 */
import { describe, expect, it } from 'vitest';
import {
  agendaCronograma,
  diarioIndicadores,
  efeitoDiarioNaEtapa,
  efetivoDiario,
  valorAgregadoObra,
} from '../src/dominio/calculos.js';
import {
  apenasErros,
  validarDependencias,
  validarDiario,
} from '../src/dominio/validacao.js';
import { lerEfetivoFuncoes, migrar, novaEtapaCronograma, novaObra, textoEfetivoFuncoes } from '../src/nucleo/base.js';
import { HOJE, casa14, h } from './casa14.fixture.js';

const etapa = (id, nome, ini, fim, extra = {}) => ({
  ...novaEtapaCronograma(nome),
  id,
  inicioPrevisto: ini,
  fimPrevisto: fim,
  ...extra,
});

describe('agenda com dependências fim→início', () => {
  /* A (10 d) → B (10 d) → C (5 d); D (5 d) solta, em paralelo */
  const obra = () => {
    const o = novaObra('Teste');
    o.cronograma = [
      etapa('a', 'A', h(1), h(10)),
      etapa('b', 'B', h(1), h(10), { predecessoras: ['a'] }),
      etapa('c', 'C', h(1), h(5), { predecessoras: ['b'] }),
      etapa('d', 'D', h(1), h(5)),
    ];
    return o;
  };

  it('a sucessora só começa depois da predecessora terminar', () => {
    const ag = agendaCronograma(obra(), HOJE, 1);
    const por = Object.fromEntries(ag.etapas.map((a) => [a.id, a]));
    expect(por.b.inicio).toBe(h(11));
    expect(por.c.inicio > por.b.fim).toBe(true);
    expect(ag.termino).toBe(por.c.fim);
  });

  it('caminho crítico: A → B → C; a solta tem folga', () => {
    const ag = agendaCronograma(obra(), HOJE, 1);
    expect(ag.critico.sort()).toEqual(['a', 'b', 'c']);
    const d = ag.etapas.find((x) => x.id === 'd');
    expect(d.critica).toBe(false);
    expect(d.folga).toBeGreaterThan(0);
  });

  it('ritmo abaixo de 1 alonga o que falta; o piso é o do término projetado', () => {
    const lento = agendaCronograma(obra(), HOJE, 0.5);
    const normal = agendaCronograma(obra(), HOJE, 1);
    expect(lento.termino > normal.termino).toBe(true);
    const travado = agendaCronograma(obra(), HOJE, 0.01);
    expect(travado.ritmo).toBe(0.25);
  });

  it('ciclo não trava a agenda', () => {
    const o = obra();
    o.cronograma[0].predecessoras = ['c'];
    expect(() => agendaCronograma(o, HOJE, 1)).not.toThrow();
  });

  it('com dependências, o término projetado da obra sai da agenda', () => {
    const o = casa14();
    const semDep = valorAgregadoObra(o, HOJE).termino;
    const ult = o.cronograma[o.cronograma.length - 1];
    const naoIniciada = o.cronograma.find((e) => !e.inicioReal && e.id !== ult.id);
    ult.predecessoras = [naoIniciada.id];
    ult.inicioReal = '';
    ult.progresso = 0;
    const comDep = valorAgregadoObra(o, HOJE).termino;
    expect(comDep >= HOJE).toBe(true);
    expect(comDep).not.toBe('');
    expect(typeof semDep).toBe('string');
  });

  it('sem dependências, nada muda (Casa 14 continua em 04/12/2026)', () => {
    expect(valorAgregadoObra(casa14(), HOJE).termino).toBe('2026-12-04');
  });
});

describe('validação das dependências — alerta, não erro', () => {
  it('ciclo e predecessora inexistente viram alerta', () => {
    const cr = [
      { id: 'a', etapa: 'A', predecessoras: ['b'] },
      { id: 'b', etapa: 'B', predecessoras: ['a', 'x'] },
    ];
    const p = validarDependencias(cr);
    expect(p.length).toBe(2);
    expect(apenasErros(p)).toEqual([]);
  });
  it('não-lista é erro (CHECK chk_crono_predecessoras)', () => {
    expect(apenasErros(validarDependencias([{ id: 'a', etapa: 'A', predecessoras: 'b' }]))).toHaveLength(1);
  });
});

describe('diário de campo', () => {
  it('efetivo por função, digitado como no celular', () => {
    expect(lerEfetivoFuncoes('Pedreiro 3\n2 serventes\nEletricista: 1\nMestre')).toEqual([
      { funcao: 'Pedreiro', qtd: 3 },
      { funcao: 'serventes', qtd: 2 },
      { funcao: 'Eletricista', qtd: 1 },
      { funcao: 'Mestre', qtd: 1 },
    ]);
    expect(textoEfetivoFuncoes([{ funcao: 'Pedreiro', qtd: 3 }])).toBe('Pedreiro 3');
    expect(lerEfetivoFuncoes('')).toEqual([]);
  });

  it('o efetivo do dia é a soma por função, quando há', () => {
    expect(efetivoDiario({ efetivo: 9, efetivoFuncoes: [{ funcao: 'P', qtd: 3 }, { funcao: 'S', qtd: 2 }] })).toBe(5);
    expect(efetivoDiario({ efetivo: 4, efetivoFuncoes: [] })).toBe(4);
  });

  it('o primeiro registro na etapa vira o início real; o % vira o progresso', () => {
    const e = { etapa: 'Pintura', inicioReal: '', progresso: 0, fimReal: '' };
    expect(efeitoDiarioNaEtapa(e, { data: h(0), etapa: 'Pintura', atividades: 'lixamento', progressoEtapa: 0.2 }))
      .toEqual({ inicioReal: h(0), progresso: 0.2 });
    const feita = efeitoDiarioNaEtapa({ ...e, inicioReal: h(-5) }, { data: h(0), etapa: 'pintura', progressoEtapa: 1 });
    expect(feita).toEqual({ progresso: 1, fimReal: h(0) });
    expect(efeitoDiarioNaEtapa(e, { data: h(0), etapa: 'Outra', atividades: 'x' })).toEqual({});
  });

  it('dias de impacto no prazo entram nos indicadores', () => {
    const o = casa14();
    o.diario.push({ ...o.diario[0], id: 'imp', data: HOJE, impactaPrazo: true, diasImpacto: 2 });
    expect(diarioIndicadores(o, HOJE).diasImpactoPrazo).toBe(2);
  });

  const base = { data: HOJE, efetivo: 0 };
  const erros = (d) => apenasErros(validarDiario({ ...base, ...d })).map((x) => x.campo);

  it('CHECKs chk_diario_campo_*: % 0–1, dias 0–365 com impacto, lista de funções', () => {
    expect(erros({ progressoEtapa: 1.2 })).toContain('progressoEtapa');
    expect(erros({ diasImpacto: 3, impactaPrazo: false })).toContain('diasImpacto');
    expect(erros({ diasImpacto: 3, impactaPrazo: true })).toEqual([]);
    expect(erros({ diasImpacto: 400, impactaPrazo: true })).toContain('diasImpacto');
    expect(erros({ efetivoFuncoes: 'Pedreiro 3' })).toContain('efetivoFuncoes');
    expect(erros({ efetivoFuncoes: [{ funcao: '', qtd: 2 }] })).toContain('efetivoFuncoes');
    expect(erros({ equipamentos: 'x'.repeat(501) })).toContain('equipamentos');
  });

  it('efetivo digitado diferente da soma por função é alerta', () => {
    const p = validarDiario({ ...base, efetivo: 9, efetivoFuncoes: [{ funcao: 'P', qtd: 3 }] });
    expect(apenasErros(p)).toEqual([]);
    expect(p.map((x) => x.campo)).toContain('efetivo');
  });

  it('migrar completa os campos de campo em registro antigo', () => {
    const e = migrar({ obras: [{ nome: 'A', diario: [{ id: 'd1', data: HOJE }] }] });
    expect(e.obras[0].diario[0]).toMatchObject({
      climaManha: '', climaTarde: '', efetivoFuncoes: [], equipamentos: '',
      progressoEtapa: 0, impactaPrazo: false, diasImpacto: 0,
    });
  });
});
