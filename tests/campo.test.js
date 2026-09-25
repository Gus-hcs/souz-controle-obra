/**
 * Onda 4 — campo de verdade: fluxo de caixa projetado com o vale de
 * caixa, e pontualidade calculada do prestador. Casa 14 como referência
 * (HOJE = 2026-09-25).
 */
import { describe, expect, it } from 'vitest';
import {
  consolidarFluxo,
  custoPorEtapa,
  eventosProjetados,
  fluxoProjetado,
  fluxoProjetadoCarteira,
  kpisObra,
  pontualidadePrestador,
} from '../src/dominio/calculos.js';
import { HOJE, casa14, h } from './casa14.fixture.js';

describe('fluxo projetado — do caixa de hoje para a frente', () => {
  it('parte do caixa de hoje e termina no saldo depois de todos os eventos', () => {
    const o = casa14();
    const f = fluxoProjetado(o, HOJE);
    expect(f.saldoHoje).toBeCloseTo(kpisObra(o).saldoCaixa, 2);
    const soma = f.eventos.reduce((s, e) => s + e.valor, 0);
    expect(f.saldoFinal).toBeCloseTo(f.saldoHoje + soma, 2);
  });

  it('medições já feitas e não pagas saem hoje', () => {
    const ev = eventosProjetados(casa14(), HOJE).filter((e) => e.tipo === 'medicao');
    expect(ev.every((e) => e.data === HOJE)).toBe(true);
    expect(ev.reduce((s, e) => s + e.valor, 0)).toBeCloseTo(-7000, 2);
  });

  it('parcela vencida entra reprogramada para daqui a 15 dias', () => {
    const ev = eventosProjetados(casa14(), HOJE).filter((e) => e.tipo === 'entrada-vencida');
    expect(ev).toHaveLength(1);
    expect(ev[0].data).toBe(h(15));
    expect(ev[0].valor).toBe(37500);
  });

  it('o saldo a medir dos contratos sai distribuído, não de uma vez', () => {
    const ev = eventosProjetados(casa14(), HOJE).filter((e) => e.tipo === 'contrato');
    expect(ev.length).toBeGreaterThan(2);
    expect(ev.every((e) => e.data >= HOJE)).toBe(true);
  });

  it('Casa 14: vale de R$ 11.162,50 em 09/10, antes de a parcela vencida entrar', () => {
    const f = fluxoProjetado(casa14(), HOJE);
    expect(f.vale).toEqual({ data: '2026-10-09', saldo: 11162.5 });
    expect(f.valeJanela.data).toBe('2026-10-09');
  });

  it('o vale é o menor ponto; sem eventos, é o caixa de hoje', () => {
    const f = consolidarFluxo(100, [], HOJE);
    expect(f.vale).toEqual({ data: HOJE, saldo: 100 });
    const g = consolidarFluxo(100, [
      { data: h(1), valor: -150 },
      { data: h(5), valor: 200 },
    ], HOJE);
    expect(g.vale).toEqual({ data: h(1), saldo: -50 });
    expect(g.eventos.map((e) => e.saldoApos)).toEqual([-50, 150]);
  });

  it('a janela de 30 dias ignora o que vem depois', () => {
    const g = consolidarFluxo(100, [{ data: h(60), valor: -500 }], HOJE, 30);
    expect(g.valeJanela.saldo).toBe(100);
    expect(g.vale.saldo).toBe(-400);
  });

  it('a carteira é um caixa só: soma os saldos e junta os eventos', () => {
    const a = casa14();
    const b = casa14();
    const f = fluxoProjetadoCarteira([a, b], HOJE);
    expect(f.saldoHoje).toBeCloseTo(2 * kpisObra(a).saldoCaixa, 2);
    expect(f.eventos).toHaveLength(2 * eventosProjetados(a, HOJE).length);
  });

  it('onde o dinheiro foi: lançamentos por etapa e medições pagas pelo escopo', () => {
    const o = casa14();
    const total = custoPorEtapa(o).reduce((s, x) => s + x.valor, 0);
    expect(total).toBeCloseTo(kpisObra(o).totalPago, 2);
  });
});

describe('pontualidade calculada do prestador', () => {
  const quem = (nome) => ({ id: 'p1', nome, apelido: '' });

  it('Casa 14: Antônio Ribeiro — nenhuma das 9 entregas no prazo, 19 dias de atraso médio', () => {
    const pt = pontualidadePrestador({ obras: [casa14()] }, quem('Antônio Ribeiro'), HOJE);
    expect(pt.entregas).toBe(9);
    expect(pt.pontualidade).toBe(0);
    expect(pt.diasMedios).toBe(19);
    expect(pt.atrasadasAgora).toBe(4);
    expect(pt.obrasSimultaneas).toBe(1);
  });

  it('entrega no prazo conta; etapa aberta ainda no prazo não conta', () => {
    const o = casa14();
    o.cronograma = [
      { id: 'a', etapa: 'A', responsavel: 'Zé', fimPrevisto: h(-10), fimReal: h(-12), progresso: 1, inicioReal: h(-20) },
      { id: 'b', etapa: 'B', responsavel: 'Zé', fimPrevisto: h(10), progresso: 0.5, inicioReal: h(-5) },
    ];
    const pt = pontualidadePrestador({ obras: [o] }, quem('Zé'), HOJE);
    expect(pt.entregas).toBe(1);
    expect(pt.pontualidade).toBe(1);
    expect(pt.obrasSimultaneas).toBe(1);
  });

  it('sem etapas dele na obra, usa os contratos', () => {
    const o = casa14();
    const ct = o.contratos.find((c) => c.codigoBase === 'CT-001' && c.registro === 'Contrato');
    ct.prestador = 'Construtora X';
    const pt = pontualidadePrestador({ obras: [o] }, quem('Construtora X'), HOJE);
    expect(pt.entregas).toBe(1);
    expect(pt.atrasadasAgora).toBe(1);
    expect(pt.diasMedios).toBe(30);
  });

  it('quem nunca teve prazo não tem pontualidade', () => {
    expect(pontualidadePrestador({ obras: [casa14()] }, quem('Ninguém'), HOJE).pontualidade).toBeNull();
  });
});
