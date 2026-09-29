// @vitest-environment jsdom
/**
 * Importação da planilha MCMV de ponta a ponta no motor: a obra da planilha
 * de referência, escrita de volta no layout do modelo (mcmv.grades.js),
 * entra por planilhaParaObra e sai com os MESMOS números do esperado.json —
 * contratos, medições, recebimentos, lançamentos, materiais, cronograma,
 * fluxo e painel. Vale para célula sem formato (ISO, número cru) e para
 * célula formatada em português (dd/mm/aaaa, 1.234,56, 20%).
 *
 * O SheetJS vem do CDN no navegador; aqui, sheet_to_json devolve a grade
 * como texto, que é o que ele entrega com raw: false. O percurso com o
 * SheetJS de verdade e um .xlsx de verdade está na bancada do navegador.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import esperado from './esperado.json';
import { obraDaPlanilha } from './planilha.fixture.js';
import { gradesMCMV } from './mcmv.grades.js';
import { planilhaParaObra } from '../src/io/index.js';
import { Store } from '../src/dados/store.js';
import { competencia } from '../src/nucleo/base.js';
import {
  contratoTotalAutorizado,
  contratoTotalPago,
  contratoSaldo,
  contratoValor,
  etapaCalc,
  fluxoCaixa,
  kpisObra,
  lancamentoTotal,
  materialCalc,
  medicaoAlerta,
  medicaoLiquido,
  medicaoSaldoContratual,
  recebimentoDiferenca,
  recebimentoLiquido,
} from '../src/dominio/calculos.js';
import { apenasErros, validarObraCompleta } from '../src/dominio/validacao.js';

const perto = (a, b, tol = 0.02) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);

let estadoAntes;
beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-28T12:00:00Z'));
  globalThis.XLSX = {
    utils: {
      sheet_to_json: (grade) => grade.map((l) => l.map((c) => (c == null ? '' : String(c)))),
    },
  };
  estadoAntes = Store.estado;
  Store.estado = { obras: [], clientes: [] };
});
afterAll(() => {
  vi.useRealTimers();
  delete globalThis.XLSX;
  Store.estado = estadoAntes;
});

const importar = (formato) => {
  const grades = gradesMCMV(obraDaPlanilha(), { cliente: 'Maria Aparecida', formato });
  return planilhaParaObra({ SheetNames: Object.keys(grades), Sheets: grades }, 'arquivo');
};

describe.each(['iso', 'br'])('planilha MCMV importada (células %s)', (formato) => {
  it('dados da obra, financiamento e cliente', () => {
    const o = importar(formato);
    const ref = obraDaPlanilha();
    expect(o).toMatchObject({
      nome: ref.nome,
      cidade: ref.cidade,
      areaConstruida: ref.areaConstruida,
      areaMuro: ref.areaMuro,
      dataInicio: ref.dataInicio,
      previsaoConclusao: ref.previsaoConclusao,
    });
    expect(o.fin).toMatchObject({
      saldoInicial: 5000,
      valorTerreno: 45000,
      valorFinanciado: 180000,
      recursosProprios: 20000,
      precoEmpreitadaM2: 700,
      custoFisicoMaxM2: 1200,
      valorVenda: 260000,
      margemDesejada: 0.15,
    });
    const cli = Store.estado.clientes.find((c) => c.id === o.clienteId);
    expect(cli && cli.nome).toBe('Maria Aparecida');
    expect(
      [o.contratos, o.medicoes, o.recebimentos, o.lancamentos, o.materiais, o.cronograma].map(
        (l) => l.length,
      ),
    ).toEqual([4, 5, 4, 6, 3, 7]);
  });

  it('contratos, medições e recebimentos com os números da planilha', () => {
    const o = importar(formato);
    o.contratos.forEach((c, i) => {
      const e = esperado.contratos[i];
      perto(contratoValor(c), e.K);
      perto(contratoTotalAutorizado(o, c.codigoBase), e.P);
      perto(contratoTotalPago(o, c.codigoBase), e.Q);
      perto(contratoSaldo(o, c.codigoBase), e.R);
    });
    o.medicoes.forEach((m, i) => {
      const e = esperado.medicoes[i];
      perto(medicaoLiquido(m), e.I);
      perto(medicaoSaldoContratual(o, m), e.N);
      expect(String(medicaoAlerta(o, m))).toBe(e.O);
    });
    o.recebimentos.forEach((r, i) => {
      const e = esperado.recebimentos[i];
      perto(recebimentoLiquido(r), e.K);
      perto(recebimentoDiferenca(r), e.O);
    });
  });

  it('lançamentos, materiais e cronograma com os números da planilha', () => {
    const o = importar(formato);
    o.lancamentos.forEach((l, i) => {
      expect(competencia(l.data)).toBe(esperado.lancamentos[i].C);
      perto(lancamentoTotal(l), esperado.lancamentos[i].O);
    });
    o.materiais.forEach((m, i) => {
      const e = esperado.materiais[i];
      const c = materialCalc(o, m);
      perto(c.comprada, e.H);
      perto(c.saldo, e.I);
      perto(c.orcamento, e.K);
      perto(c.valorComprado, e.L);
    });
    o.cronograma.forEach((et, i) => {
      const e = esperado.cronograma[i];
      const c = etapaCalc(et);
      perto(c.diasPrevistos, e.G);
      perto(c.diasRealizados, e.H);
      perto(c.atraso, e.I);
      perto(c.produtividade, e.L, 0.001);
      expect(String(c.situacao)).toBe(e.N);
    });
  });

  it('fluxo de caixa e painel iguais aos da obra de referência', () => {
    const o = importar(formato);
    const fluxo = fluxoCaixa(o);
    esperado.fluxo.forEach((e) => {
      const f = fluxo.find((x) => x.ym === e.mes);
      expect(f, `mês ${e.mes}`).toBeTruthy();
      perto(f.saldoMes, e.F);
      perto(f.acumulado, e.G);
    });
    const k = kpisObra(o);
    const ref = kpisObra(obraDaPlanilha());
    for (const campo of [
      'recebido',
      'contratado',
      'totalPago',
      'saldoCaixa',
      'saldoContratual',
      'progressoFisico',
      'materiaisSaldo',
    ]) {
      perto(k[campo], ref[campo]);
    }
  });

  it('a obra importada passa na validação de integridade', () => {
    expect(apenasErros(validarObraCompleta(importar(formato)))).toEqual([]);
  });
});

describe('planilha que não é do modelo', () => {
  it('recusa com a mensagem do modelo MCMV', () => {
    expect(() =>
      planilhaParaObra({ SheetNames: ['Plan1'], Sheets: { Plan1: [['a', 'b']] } }, 'x'),
    ).toThrow(/modelo MCMV/);
  });
});

describe('número de medição e de parcela', () => {
  it('célula numérica formatada ("2,00", "3.00") vira inteiro; texto fica', () => {
    const grades = gradesMCMV(obraDaPlanilha(), { formato: 'iso' });
    const med = grades['MEDIÇÕES'];
    med[4][2] = '1,00';
    med[5][2] = '2.00';
    med[6][2] = '2A';
    grades['RECEBIMENTOS CAIXA'][6][2] = '3,00';
    const o = planilhaParaObra({ SheetNames: Object.keys(grades), Sheets: grades }, 'x');
    expect(o.medicoes.map((m) => m.numero)).toEqual(['1', '2', '2A', '1', '4']);
    expect(o.recebimentos.map((r) => r.numeroMedicao)).toEqual(['1', '2', '3', '']);
  });
});
