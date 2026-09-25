/**
 * Onda 1 da auditoria tela a tela (25/09/2026) — "confiança nos números".
 *
 * A obra daqui é a Casa 14 da demonstração (db/demo/02_casa14_vila_nova.sql),
 * a que a auditoria usou como referência. Cada teste prova um número que a
 * auditoria achou errado ou divergente entre telas:
 *   1. valor contratado: supressão subtrai, aditivo proposto fica fora;
 *   2. % do financiamento: dinheiro do cliente não é liberação da CAIXA;
 *   3. contagem de alertas: a mesma em menu, painel, alertas e medições;
 *   6. posição projetada: desconta o que ainda falta gastar;
 *   8. custo por m²: só custo físico, e o alerta é informativo.
 */
import { describe, it, expect, vi, afterAll } from 'vitest';
import {
  alertasObra,
  basesContratuais,
  contratoTotalAutorizado,
  kpisObra,
  lancamentoCustoFisico,
  medicoesComPendencia,
  pendenciasObra,
  recebimentoDoFinanciamento,
} from '../src/dominio/calculos.js';

import { HOJE, casa14 } from './casa14.fixture.js';

vi.useFakeTimers();
vi.setSystemTime(new Date(`${HOJE}T12:00:00Z`));
afterAll(() => vi.useRealTimers());

const perto = (a, b, tol = 0.01) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);

describe('1. valor contratado — uma fonte só', () => {
  const o = casa14();

  it('CT-001: supressão subtrai e o aditivo proposto fica fora (35.940, não 42.140)', () => {
    expect(contratoTotalAutorizado(o, 'CT-001')).toBe(35940);
    const b = basesContratuais(o).find((x) => x.base === 'CT-001');
    expect(b.autorizado).toBe(35940);
    expect(b.valorAditivos).toBe(-1500);
    expect(b.pendente).toBe(3200);
  });

  it('contratado da obra é 46.080 — o mesmo número da tela de Contratos', () => {
    const k = kpisObra(o);
    expect(k.contratado).toBe(46080);
    expect(k.aditivosPendentes).toBe(3200);
    expect(k.contratado).toBe(basesContratuais(o).reduce((s, b) => s + b.autorizado, 0));
  });
});

describe('2. % do financiamento — só o dinheiro do financiador', () => {
  const o = casa14();
  const k = kpisObra(o);

  it('entrada do cliente fica fora do liberado (44,7%, não 57%)', () => {
    perto(k.recebido, 85027.5);
    perto(k.recebidoFinanciamento, 67027.5);
    perto(k.recebidoProprio, 18000);
    perto(k.liberadoFinanciamento, 0.44685, 0.0001);
  });

  it('a receber do financiamento desconta só o que o financiador liberou', () => {
    perto(k.aReceber, 150000 - 67027.5);
  });

  it('origem: Cliente e Recursos próprios são próprios; CAIXA, Outro e vazio, financiamento', () => {
    expect(recebimentoDoFinanciamento({ origem: 'CAIXA' })).toBe(true);
    expect(recebimentoDoFinanciamento({ origem: 'Outro' })).toBe(true);
    expect(recebimentoDoFinanciamento({ origem: '' })).toBe(true);
    expect(recebimentoDoFinanciamento({ origem: 'Cliente' })).toBe(false);
    expect(recebimentoDoFinanciamento({ origem: 'Recursos próprios' })).toBe(false);
  });

  it('sem valor financiado, o % não existe (null), não é 0%', () => {
    const s = casa14();
    s.fin.valorFinanciado = 0;
    expect(kpisObra(s).liberadoFinanciamento).toBeNull();
  });
});

describe('3. contagem de alertas — a mesma em toda tela', () => {
  const o = casa14();
  const pend = pendenciasObra(o);

  it('pendência = crítico + atenção; informativo aparece mas não soma', () => {
    const todos = alertasObra(o);
    expect(pend.total).toBe(todos.filter((a) => a.sev >= 2).length);
    expect(pend.total + pend.avisos).toBe(todos.length);
    expect(pend.criticas + pend.atencao).toBe(pend.total);
  });

  it('medições: conta a medição em aberto há 45 dias e a parcial há 108 (antes dizia 0)', () => {
    const ids = medicoesComPendencia(o);
    const abertas = o.medicoes.filter((m) => m.numero === '4' || (m.contratoBase === 'CT-002' && m.numero === '2'));
    expect(ids.size).toBe(2);
    abertas.forEach((m) => expect(ids.has(m.id)).toBe(true));
    expect(ids.size).toBe(pend.porView.medicoes);
  });
});

describe('6. posição no fim da obra — desconta o que falta gastar', () => {
  const o = casa14();
  const k = kpisObra(o);

  it('custo a incorrer = saldo dos contratos + materiais a comprar', () => {
    perto(k.custoAIncorrer, Math.max(0, k.saldoContratual) + k.materiaisSaldo);
    perto(k.custoAIncorrer, k.custoPrevisto - k.totalPago);
  });

  it('posição = saldo + a receber − custo a incorrer (nunca só − medições a pagar)', () => {
    perto(k.posicaoProjetada, k.saldoCaixa + k.previstoNaoRecebido - k.custoAIncorrer);
    expect(k.posicaoProjetada).toBeLessThan(k.saldoCaixa + k.previstoNaoRecebido - k.medicoesNaoPagas);
  });
});

describe('8. custo por m² — só obra física', () => {
  const o = casa14();
  const k = kpisObra(o);

  it('taxa, honorário, comissão e terreno não são custo físico', () => {
    ['Taxa/imposto', 'Honorário técnico/gestão', 'Comissão imobiliária', 'Terreno'].forEach((tipo) =>
      expect(lancamentoCustoFisico({ tipo })).toBe(false),
    );
    ['Material', 'Serviço avulso', 'Fornecimento + instalação', 'Outra saída'].forEach((tipo) =>
      expect(lancamentoCustoFisico({ tipo })).toBe(true),
    );
  });

  it('custo físico previsto = previsto − (262 + 650 + 1.200 + 6.150)', () => {
    perto(k.custoNaoFisico, 8262);
    perto(k.custoFisicoPrevisto, k.custoPrevisto - 8262);
    perto(k.custoFisicoPrevistoM2, k.custoFisicoPrevisto / 52);
  });

  it('teto estourado vira informativo, não crítico, e compara o custo físico', () => {
    const a = alertasObra(o).find((x) => /Custo físico por m²/.test(x.titulo));
    expect(a).toBeTruthy();
    expect(a.sev).toBe(1);
    expect(a.detalhe).toContain('/m² de obra física');
  });

  it('sem estouro físico, nenhum alerta — mesmo com comissão alta no total', () => {
    const s = casa14();
    s.fin.custoFisicoMaxM2 = Math.ceil(kpisObra(s).custoFisicoPrevistoM2) + 1;
    expect(kpisObra(s).custoPrevistoM2).toBeGreaterThan(s.fin.custoFisicoMaxM2);
    expect(alertasObra(s).some((x) => /Custo físico por m²/.test(x.titulo))).toBe(false);
  });
});
