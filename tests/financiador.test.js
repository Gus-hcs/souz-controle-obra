/**
 * Onda 3 — financiador genérico (migração 0016). Qualquer financiador:
 * CAIXA, outro banco ou o cliente pagando por marco. Casa 14 como
 * referência (HOJE = 2026-09-25).
 */
import { describe, expect, it } from 'vitest';
import {
  alertasObra,
  curvaS,
  fisicoFinanciador,
  fluxoCaixa,
  liberadoExecutado,
  medidoFisicoContrato,
  memoriaMedicao,
  nomeFinanciador,
  parcelasFinanciador,
  processoParcela,
  proximaParcelaFinanciador,
  resumoRecebimentos,
} from '../src/dominio/calculos.js';
import {
  apenasErros,
  validarEtapa,
  validarEtapasContrato,
  validarObra,
  validarPlanilhaFinanciador,
  validarRecebimento,
} from '../src/dominio/validacao.js';
import { migrar, novoRecebimento } from '../src/nucleo/base.js';
import { HOJE, casa14 } from './casa14.fixture.js';

const campos = (lista) => apenasErros(lista).map((x) => x.campo);

describe('financiador — nome e físico pela planilha dele', () => {
  it('sem nome cadastrado, as telas dizem "financiador"', () => {
    const o = casa14();
    expect(nomeFinanciador(o)).toBe('financiador');
    o.fin.financiador = 'Banco do Brasil';
    expect(nomeFinanciador(o)).toBe('Banco do Brasil');
  });

  it('sem pesos do financiador, vale o físico da obra', () => {
    const f = fisicoFinanciador(casa14());
    expect(f.porPlanilha).toBe(false);
    expect(f.fisico).toBeCloseTo(0.764, 3);
  });

  it('com pesos, o físico sai da planilha do financiador', () => {
    const o = casa14();
    o.cronograma.forEach((e) => {
      e.pesoFinanciador = 0;
    });
    const primeira = o.cronograma[0];
    const ultima = o.cronograma[o.cronograma.length - 1];
    primeira.pesoFinanciador = 0.5;
    primeira.progresso = 1;
    ultima.pesoFinanciador = 0.5;
    ultima.progresso = 0;
    const f = fisicoFinanciador(o);
    expect(f.porPlanilha).toBe(true);
    expect(f.fisico).toBeCloseTo(0.5, 6);
  });
});

describe('parcela — processo, vencida e decisão', () => {
  const base = { ...novoRecebimento(), status: 'Previsto' };

  it('o passo sai das datas', () => {
    expect(processoParcela(base)).toBe('prevista');
    expect(processoParcela({ ...base, dataSolicitacao: '2026-09-01' })).toBe('solicitada');
    expect(
      processoParcela({ ...base, dataSolicitacao: '2026-09-01', dataVistoria: '2026-09-05' }),
    ).toBe('vistoriada');
    expect(processoParcela({ ...base, dataAprovacao: '2026-09-10' })).toBe('aprovada');
    expect(processoParcela({ ...base, valorRecebido: 100 })).toBe('creditada');
    expect(processoParcela({ ...base, status: 'Cancelado' })).toBe('cancelada');
  });

  it('Casa 14: parcela 3 solicitada há 45 dias e vencida — cobrar o financiador', () => {
    const p = proximaParcelaFinanciador(casa14(), HOJE);
    expect(p.r.numeroMedicao).toBe('3');
    expect(p.vencida).toBe(true);
    expect(p.diasSolicitada).toBe(45);
    expect(p.decisao).toBe('aguardar');
  });

  const semPedido = (exigido) => {
    const o = casa14();
    const p3 = o.recebimentos.find((r) => r.numeroMedicao === '3');
    p3.dataSolicitacao = '';
    p3.status = 'Previsto';
    p3.percentExigido = exigido;
    return o;
  };

  it('físico passou do exigido: pedir a vistoria', () => {
    expect(proximaParcelaFinanciador(semPedido(0.7), HOJE).decisao).toBe('pedir');
  });

  it('falta obra: concluir, com as etapas que fecham a diferença', () => {
    const p = proximaParcelaFinanciador(semPedido(0.85), HOJE);
    expect(p.decisao).toBe('concluir');
    expect(p.falta).toBeCloseTo(0.85 - 0.7643, 3);
    const soma = p.etapas.reduce((s, e) => s + e.falta, 0);
    expect(soma).toBeGreaterThanOrEqual(p.falta - 1e-9);
  });

  it('sem % exigido: sem meta', () => {
    expect(proximaParcelaFinanciador(semPedido(0), HOJE).decisao).toBe('sem-meta');
  });

  it('parcela do cliente não é do financiador', () => {
    const ps = parcelasFinanciador(casa14(), HOJE);
    expect(ps.length).toBeGreaterThan(0);
    expect(ps.every((p) => p.r.origem !== 'Cliente')).toBe(true);
  });
});

describe('liberado × executado', () => {
  it('Casa 14: 44,7% liberado contra 76,4% executado — a construtora banca ~R$ 47,6 mil', () => {
    const le = liberadoExecutado(casa14());
    expect(le.liberado).toBeCloseTo(0.447, 3);
    expect(le.executado).toBeCloseTo(0.764, 3);
    expect(le.bancando).toBeCloseTo(47615.36, 0);
    expect(le.adiantado).toBe(0);
  });

  it('sem valor financiado não há comparação', () => {
    const o = casa14();
    o.fin.valorFinanciado = 0;
    expect(liberadoExecutado(o)).toBeNull();
  });

  it('a curva S ganha a linha do liberado acumulado', () => {
    const cs = curvaS(casa14());
    const ult = cs.filter((d) => d.liberadoFinanciador !== null).pop();
    expect(ult.liberadoFinanciador).toBeCloseTo(0.447, 3);
    expect(cs.filter((d) => d.futuro).every((d) => d.liberadoFinanciador === null)).toBe(true);
  });
});

describe('medido × físico por contrato', () => {
  it('Casa 14: CT-001 (empreitada global) 85% medido contra 76% da obra — alerta', () => {
    const mf = medidoFisicoContrato(casa14(), 'CT-001');
    expect(mf.pelaObra).toBe(true);
    expect(mf.medido).toBeCloseTo(0.85, 2);
    expect(mf.alerta).toBe(true);
    expect(mf.adiantado).toBeCloseTo(3081.57, 0);
    const a = alertasObra(casa14()).find((x) => x.tipo === 'medido-adiantado');
    expect(a.valor).toBeCloseTo(3081.57, 0);
  });

  it('subcontrato sem etapas ligadas não tem com o que comparar', () => {
    expect(medidoFisicoContrato(casa14(), 'CT-002')).toBeNull();
  });

  it('com etapas ligadas, compara com o físico delas', () => {
    const o = casa14();
    const ct = o.contratos.find((c) => c.codigoBase === 'CT-002' && c.registro === 'Contrato');
    ct.etapas = [o.cronograma[0].etapa];
    const mf = medidoFisicoContrato(o, 'CT-002');
    expect(mf.pelaObra).toBe(false);
    expect(mf.fisico).toBeCloseTo(1, 6);
    expect(mf.alerta).toBe(false);
  });
});

describe('parcela vencida sai do mês original', () => {
  it('Recebimentos: vai para o balde "vencido"', () => {
    const rr = resumoRecebimentos(casa14(), HOJE);
    expect(rr.vencido).toBe(37500);
    expect(rr.porMes.every((x) => x.ym >= '2026-09')).toBe(true);
  });

  it('Fluxo: aparece como vencido no mês corrente, não no mês previsto', () => {
    const f = fluxoCaixa(casa14(), HOJE);
    expect(f.find((x) => x.ym === '2026-09').vencidasNaoRecebidas).toBe(37500);
    expect(f.find((x) => x.ym === '2026-08').previstasNaoRecebidas).toBe(0);
  });
});

describe('memória de medição pelo financiador', () => {
  it('a solicitar = físico × financiado − liberado; pesos somam 100%', () => {
    const o = casa14();
    const mm = memoriaMedicao(o);
    const le = liberadoExecutado(o);
    expect(mm.aSolicitar).toBeCloseTo(le.executado * 150000 - le.liberado * 150000, 0);
    expect(mm.linhas.reduce((s, l) => s + l.peso, 0)).toBeCloseTo(1, 6);
  });

  it('com itens do financiador, ordena pelo item', () => {
    const o = casa14();
    const n = o.cronograma.length;
    o.cronograma.forEach((e, i) => {
      e.itemFinanciador = `${n - i}.1`;
      e.pesoFinanciador = 1 / n;
    });
    const mm = memoriaMedicao(o);
    expect(mm.porPlanilha).toBe(true);
    expect(mm.linhas[0].item).toBe('1.1');
  });
});

describe('validação da 0016 — erro vira CHECK, conjunto vira alerta', () => {
  const r = novoRecebimento();

  it('% exigido e ordem das datas do processo', () => {
    expect(campos(validarRecebimento({ ...r, percentExigido: 1.2 }))).toContain('percentExigido');
    expect(
      campos(validarRecebimento({ ...r, dataSolicitacao: '2026-09-10', dataVistoria: '2026-09-01' })),
    ).toContain('dataVistoria');
    expect(
      campos(validarRecebimento({ ...r, dataVistoria: '2026-09-10', dataAprovacao: '2026-09-01' })),
    ).toContain('dataAprovacao');
    const credito = validarRecebimento({ ...r, dataAprovacao: '2026-09-10', dataRecebimento: '2026-09-01' });
    expect(apenasErros(credito)).toEqual([]);
    expect(credito.map((x) => x.campo)).toContain('dataRecebimento');
  });

  it('peso e item do financiador na etapa', () => {
    expect(campos(validarEtapa({ etapa: 'X', pesoFinanciador: 1.5 }))).toContain('pesoFinanciador');
    expect(campos(validarEtapa({ etapa: 'X', itemFinanciador: 'x'.repeat(41) }))).toContain(
      'itemFinanciador',
    );
  });

  it('pesos somando diferente de 100% é alerta', () => {
    const p = validarPlanilhaFinanciador([{ pesoFinanciador: 0.4 }, { pesoFinanciador: 0.4 }]);
    expect(p).toHaveLength(1);
    expect(apenasErros(p)).toEqual([]);
    expect(validarPlanilhaFinanciador([{ pesoFinanciador: 0.5 }, { pesoFinanciador: 0.5 }])).toEqual([]);
  });

  it('etapa do contrato fora do cronograma é alerta; não-lista é erro', () => {
    const cr = [{ etapa: 'Fundação' }];
    expect(apenasErros(validarEtapasContrato({ etapas: ['Muro'] }, cr))).toEqual([]);
    expect(validarEtapasContrato({ etapas: ['Muro'] }, cr)).toHaveLength(1);
    expect(apenasErros(validarEtapasContrato({ etapas: 'Fundação' }, cr))).toHaveLength(1);
  });

  it('nome do financiador com mais de 80 caracteres', () => {
    expect(campos(validarObra({ nome: 'A', fin: { financiador: 'x'.repeat(81) } }))).toContain(
      'financiador',
    );
  });

  it('migrar completa os campos novos em estado antigo', () => {
    const e = migrar({
      obras: [
        { nome: 'Antiga', recebimentos: [{ id: 'r1' }], cronograma: [{ id: 'c1' }], contratos: [{ id: 'k1' }] },
      ],
    });
    const o = e.obras[0];
    expect(o.fin.financiador).toBe('');
    expect(o.recebimentos[0]).toMatchObject({ percentExigido: 0, dataVistoria: '', dataAprovacao: '' });
    expect(o.cronograma[0]).toMatchObject({ itemFinanciador: '', pesoFinanciador: 0, predecessoras: [] });
    expect(o.contratos[0].etapas).toEqual([]);
  });
});
