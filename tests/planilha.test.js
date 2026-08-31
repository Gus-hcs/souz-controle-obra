/**
 * Conferência do motor de cálculo contra a planilha MCMV de origem.
 *
 * Cada número que o sistema calcula é comparado com o valor que a planilha
 * produz para a mesma obra (recalculada pelo LibreOffice). É este arquivo que
 * garante que uma mudança no código não altere silenciosamente um resultado
 * financeiro.
 */
import { describe, it, expect, vi, afterAll } from 'vitest';
import esperado from './esperado.json';
import { obraDaPlanilha } from './planilha.fixture.js';
import { competencia } from '../src/nucleo/base.js';
import {
  contratoValor, contratoTotalAutorizado, contratoTotalPago, contratoSaldo,
  medicaoLiquido, medicaoSaldoContratual, medicaoAlerta,
  recebimentoLiquido, recebimentoDiferenca, lancamentoTotal,
  materialCalc, etapaCalc, fluxoCaixa, kpisObra, curvaS, alertasObra,
} from '../src/dominio/calculos.js';

/* A planilha foi recalculada em 28/08/2026. Vários números dependem de "hoje"
   (dias de obra, atraso, produtividade), então o relógio fica congelado nessa
   data — assim o teste vale igual hoje e daqui a um ano. */
const DATA_DA_PLANILHA = new Date('2026-08-28T12:00:00Z');
vi.useFakeTimers();
vi.setSystemTime(DATA_DA_PLANILHA);
afterAll(() => vi.useRealTimers());

const obra = obraDaPlanilha();
const perto = (a, b, tol = 0.02) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);

describe('contratos e aditivos', () => {
  obra.contratos.forEach((c, i) => {
    const e = esperado.contratos[i];
    it(`${e.cod}: valor, autorizado, pago e saldo`, () => {
      perto(contratoValor(c), e.K);
      perto(contratoTotalAutorizado(obra, c.codigoBase), e.P);
      perto(contratoTotalPago(obra, c.codigoBase), e.Q);
      perto(contratoSaldo(obra, c.codigoBase), e.R);
    });
  });
});

describe('medições', () => {
  obra.medicoes.forEach((m, i) => {
    const e = esperado.medicoes[i];
    it(`medição ${i + 1}: líquido, saldo contratual e alerta`, () => {
      perto(medicaoLiquido(m), e.I);
      perto(medicaoSaldoContratual(obra, m), e.N);
      expect(String(medicaoAlerta(obra, m))).toBe(e.O);
    });
  });
});

describe('recebimentos', () => {
  obra.recebimentos.forEach((r, i) => {
    const e = esperado.recebimentos[i];
    it(`recebimento ${i + 1}: líquido e diferença`, () => {
      perto(recebimentoLiquido(r), e.K);
      perto(recebimentoDiferenca(r), e.O);
    });
  });
});

describe('lançamentos', () => {
  obra.lancamentos.forEach((l, i) => {
    const e = esperado.lancamentos[i];
    it(`lançamento ${i + 1}: competência e total`, () => {
      expect(competencia(l.data)).toBe(e.C);
      perto(lancamentoTotal(l), e.O);
    });
  });
});

describe('plano de materiais', () => {
  obra.materiais.forEach((m, i) => {
    const e = esperado.materiais[i];
    it(`${e.mat}: comprada, saldo, orçamento e valor comprado`, () => {
      const c = materialCalc(obra, m);
      perto(c.comprada, e.H);
      perto(c.saldo, e.I);
      perto(c.orcamento, e.K);
      perto(c.valorComprado, e.L);
    });
  });
});

describe('cronograma', () => {
  obra.cronograma.forEach((et, i) => {
    const e = esperado.cronograma[i];
    it(`${e.etapa}: dias, atraso, produtividade e situação`, () => {
      const c = etapaCalc(et);
      perto(c.diasPrevistos, e.G);
      perto(c.diasRealizados, e.H);
      perto(c.atraso, e.I);
      perto(c.produtividade, e.L, 0.001);
      expect(String(c.situacao)).toBe(e.N);
    });
  });
});

describe('fluxo de caixa mês a mês', () => {
  const fluxo = fluxoCaixa(obra);
  esperado.fluxo.forEach((e) => {
    it(`${e.mes}: entradas, saídas, saldo e acumulado`, () => {
      const f = fluxo.find((x) => x.ym === e.mes);
      expect(f, `mês ${e.mes} ausente no fluxo`).toBeTruthy();
      perto(f.entradas, e.B);
      perto(f.medicoes, e.C);
      perto(f.outras, e.D);
      perto(f.saidas, e.E);
      perto(f.saldoMes, e.F);
      perto(f.acumulado, e.G);
    });
  });
});

describe('painel da obra', () => {
  const k = kpisObra(obra);
  const d = esperado.dashboard;

  it('recebido, contratado e prazos batem com a planilha', () => {
    perto(k.recebido, d.recebido);
    perto(k.contratado, d.contratos);
    perto(k.etapasAtrasadas, d.etapasAtraso);
    perto(k.etapasConcluidas, d.etapasConcl);
    perto(k.diasObra, d.diasInicio);
    perto(k.materiaisSaldo, d.matSaldoVlr);
  });

  /* A planilha contradiz a si mesma nestes pontos: a aba DASHBOARD soma as
     medições canceladas (SOMA sem filtro), enquanto as demais abas filtram
     "<>Cancelado". O sistema adota o critério correto — excluir canceladas —
     então a diferença aqui é exatamente o valor da medição cancelada. */
  it('diverge da planilha apenas pelo valor da medição cancelada', () => {
    const canceladas = obra.medicoes
      .filter((m) => m.status === 'Cancelado')
      .reduce((s, m) => s + Number(m.valorPago || 0), 0);
    expect(canceladas, 'a planilha precisa ter ao menos uma medição cancelada')
      .toBeGreaterThan(0);
    perto(k.totalPago, d.totalPago - canceladas);
    perto(k.saldoCaixa, d.saldoCaixa + canceladas);
    perto(k.saldoContratual, d.saldoContratual + canceladas);
  });

  /* A planilha compensa pagamento a maior contra o que ainda falta pagar.
     O sistema soma apenas saldos positivos e sinaliza o excesso como alerta. */
  it('não compensa pagamento a maior contra medições a pagar', () => {
    expect(k.medicoesNaoPagas).toBeGreaterThanOrEqual(d.medNaoPagasVlr);
    const criticos = alertasObra(obra).filter((a) => a.sev === 3);
    expect(criticos.length, 'o pagamento a maior tem que virar alerta crítico')
      .toBeGreaterThan(0);
    expect(criticos.some((a) => /Pagamento acima/i.test(a.titulo))).toBe(true);
  });
});

describe('curva S', () => {
  const cs = curvaS(obra);
  const k = kpisObra(obra);

  it('termina no mesmo progresso físico do painel', () => {
    const ultimo = cs.filter((p) => p.fisicoRealizado !== null).pop();
    expect(ultimo).toBeTruthy();
    perto(ultimo.fisicoRealizado, k.progressoFisico);
  });

  it('mantém o previsto entre 0% e 100%', () => {
    cs.forEach((p) => {
      expect(p.fisicoPrevisto).toBeGreaterThanOrEqual(-0.001);
      expect(p.fisicoPrevisto).toBeLessThanOrEqual(1.001);
    });
  });
});
