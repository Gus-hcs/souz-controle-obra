/**
 * Conferência do fluxo de caixa consolidado da carteira.
 *
 * fluxoCarteira() é a única regra de negócio nova da tela de carteira: ela soma,
 * mês a mês, o fluxo de todas as obras. Aqui se prova que o consolidado é
 * exatamente a soma dos fluxos individuais.
 */
import { describe, it, expect } from 'vitest';
import {
  estadoInicial, novaObra, novoRecebimento, novaMedicao, novoLancamento,
} from '../src/nucleo/base.js';
import { fluxoCaixa, fluxoCarteira } from '../src/dominio/calculos.js';

function estadoDuasObras() {
  const e = estadoInicial();

  const a = Object.assign(novaObra(), {
    nome: 'Obra A', dataInicio: '2026-01-05', previsaoConclusao: '2026-06-30', status: 'Em andamento',
  });
  a.fin.saldoInicial = 10000;
  a.recebimentos.push(Object.assign(novoRecebimento(), {
    dataPrevista: '2026-02-10', dataRecebimento: '2026-02-12', valorRecebido: 40000, status: 'Recebido',
  }));
  a.medicoes.push(Object.assign(novaMedicao(), {
    contratoBase: 'CT-1', data: '2026-02-01', dataPagamento: '2026-02-20',
    valorMedido: 15000, valorPago: 15000, status: 'Aprovada',
  }));
  a.lancamentos.push(Object.assign(novoLancamento(), {
    descricao: 'Material', data: '2026-03-05', quantidade: 1, precoUnitario: 8000,
  }));

  const b = Object.assign(novaObra(), {
    nome: 'Obra B', dataInicio: '2026-03-01', previsaoConclusao: '2026-08-31', status: 'Em andamento',
  });
  b.fin.saldoInicial = 5000;
  b.recebimentos.push(Object.assign(novoRecebimento(), {
    dataPrevista: '2026-03-15', dataRecebimento: '2026-03-18', valorRecebido: 25000, status: 'Recebido',
  }));
  b.medicoes.push(Object.assign(novaMedicao(), {
    contratoBase: 'CT-9', data: '2026-04-01', dataPagamento: '2026-04-10',
    valorMedido: 9000, valorPago: 9000, status: 'Aprovada',
  }));

  e.obras.push(a, b);
  return e;
}

describe('fluxoCarteira(): soma dos fluxos de todas as obras', () => {
  const e = estadoDuasObras();
  const cart = fluxoCarteira(e);
  const porObra = e.obras.map((o) => fluxoCaixa(o));

  it('cobre todos os meses que aparecem em qualquer obra', () => {
    const mesesObra = [...new Set(porObra.flatMap((f) => f.map((m) => m.ym)))].sort();
    const mesesCart = [...cart.map((m) => m.ym)].sort();
    expect(mesesCart).toEqual(mesesObra);
  });

  it('meses saem em ordem cronológica', () => {
    const ordenado = [...cart].sort((x, y) => (x.ym < y.ym ? -1 : 1));
    expect(cart.map((m) => m.ym)).toEqual(ordenado.map((m) => m.ym));
  });

  it('entradas e saídas de cada mês são a soma das obras', () => {
    cart.forEach((m) => {
      const soma = (campo) => porObra.reduce((s, f) => {
        const linha = f.find((x) => x.ym === m.ym);
        return s + (linha ? linha[campo] : 0);
      }, 0);
      expect(m.entradas).toBeCloseTo(soma('entradas'), 6);
      expect(m.saidas).toBeCloseTo(soma('saidas'), 6);
      expect(m.saldoMes).toBeCloseTo(m.entradas - m.saidas, 6);
    });
  });

  it('registra as entradas e saídas lançadas', () => {
    const totalEntradas = cart.reduce((s, m) => s + m.entradas, 0);
    const totalSaidas = cart.reduce((s, m) => s + m.saidas, 0);
    expect(totalEntradas).toBeCloseTo(65000, 6);
    expect(totalSaidas).toBeCloseTo(32000, 6);
  });

  it('acumulado final = saldos iniciais + todas as entradas - todas as saídas', () => {
    const saldoInicial = e.obras.reduce((s, o) => s + Number(o.fin.saldoInicial), 0);
    const entradas = cart.reduce((s, m) => s + m.entradas, 0);
    const saidas = cart.reduce((s, m) => s + m.saidas, 0);
    expect(cart[cart.length - 1].acumulado).toBeCloseTo(saldoInicial + entradas - saidas, 6);
  });

  it('acumulado é o saldo do mês somado de forma corrida', () => {
    let acc = e.obras.reduce((s, o) => s + Number(o.fin.saldoInicial), 0);
    cart.forEach((m) => {
      acc += m.saldoMes;
      expect(m.acumulado).toBeCloseTo(acc, 6);
    });
  });
});
