/**
 * Contas que as telas faziam por conta própria (auditoria M-06, regra 1 do
 * CLAUDE.md) e agora saem do domínio: a conferência do formulário de
 * medição, os totais de Contratos, e a linha do cliente em Clientes.
 */
import { describe, expect, it } from 'vitest';
import {
  contratoTotalAutorizado,
  pendenciasDasObrasDoCliente,
  saldoContratoAposMedicao,
  totaisContratos,
  valorVendaObras,
} from '../src/dominio/calculos.js';

const obra = () => ({
  contratos: [
    {
      id: 'c1',
      codigo: 'CT-1',
      codigoBase: 'CT-1',
      registro: 'Contrato',
      quantidade: 1,
      precoUnitario: 10000,
      valorInformado: 10000,
    },
  ],
  medicoes: [
    { id: 'm1', contratoBase: 'CT-1', valorMedido: 3000, valorPago: 3000, status: 'Pago' },
    { id: 'm2', contratoBase: 'CT-1', valorMedido: 2000, valorPago: 1500, status: 'Parcial' },
    { id: 'm3', contratoBase: 'CT-1', valorMedido: 9000, valorPago: 9000, status: 'Cancelado' },
    { id: 'm4', contratoBase: 'CT-2', valorMedido: 500, valorPago: 500, status: 'Pago' },
  ],
  lancamentos: [],
  recebimentos: [],
});

describe('conferência do formulário de medição', () => {
  it('autorizado, já pago nas outras (sem as canceladas) e saldo depois desta', () => {
    const o = obra();
    const autorizado = contratoTotalAutorizado(o, 'CT-1');
    const r = saldoContratoAposMedicao(o, 'CT-1', 'm2', 1500);
    expect(r.autorizado).toBe(autorizado);
    expect(r.pagoOutras).toBe(3000);
    expect(r.saldo).toBeCloseTo(autorizado - 3000 - 1500, 2);
  });
  it('medição nova (sem id): conta todas as outras', () => {
    const o = obra();
    expect(saldoContratoAposMedicao(o, 'CT-1', 'nova', 0).pagoOutras).toBe(4500);
  });
  it('sem contrato escolhido: tudo zero', () => {
    expect(saldoContratoAposMedicao(obra(), '', 'm1', 100)).toEqual({
      autorizado: 0,
      pagoOutras: 0,
      saldo: 0,
    });
  });
});

describe('totais de Contratos', () => {
  it('soma os indicadores e a composição das linhas', () => {
    const linhas = [
      {
        ind: { autorizado: 1000.1, medido: 500, aPagarAgora: 100, aMedir: 500.1 },
        comp: { totalAcrescimos: 300, totalSupressoes: 50, pendentesValor: 20 },
      },
      {
        ind: { autorizado: 2000.2, medido: 0, aPagarAgora: 0, aMedir: 2000.2 },
        comp: { totalAcrescimos: 0, totalSupressoes: 0, pendentesValor: 0 },
      },
    ];
    expect(totaisContratos(linhas)).toEqual({
      autorizado: 3000.3,
      medido: 500,
      aPagarAgora: 100,
      aMedir: 2500.3,
      aditivosAprovados: 250,
      aditivosPendentes: 20,
    });
  });
  it('linha sem composição (subtotal de grupo) não quebra', () => {
    expect(
      totaisContratos([{ ind: { autorizado: 10, medido: 0, aPagarAgora: 0, aMedir: 10 } }])
        .aditivosAprovados,
    ).toBe(0);
    expect(totaisContratos([]).autorizado).toBe(0);
  });
});

describe('linha do cliente', () => {
  const hoje = '2026-09-27';
  const obras = [
    {
      fin: { valorVenda: 250000 },
      pendenciasCliente: [
        { status: 'aberta', prazo: '2026-09-01' },
        { status: 'aberta', prazo: '2026-12-01' },
        { status: 'resolvida' },
      ],
    },
    { fin: { valorVenda: '180.000,50' }, pendenciasCliente: [{ status: 'aberta', prazo: '' }] },
    { fin: {} },
  ];
  it('pendências abertas e vencidas somadas nas obras do cliente', () => {
    expect(pendenciasDasObrasDoCliente(obras, hoje)).toEqual({ abertas: 3, vencidas: 1 });
    expect(pendenciasDasObrasDoCliente([], hoje)).toEqual({ abertas: 0, vencidas: 0 });
  });
  it('valor de venda somado (aceita o número em formato brasileiro)', () => {
    expect(valorVendaObras(obras)).toBe(430000.5);
    expect(valorVendaObras(undefined)).toBe(0);
  });
});
