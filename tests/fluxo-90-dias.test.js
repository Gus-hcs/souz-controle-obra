/**
 * A receber × a pagar nos próximos 90 dias (receberPagarProximos), o bloco
 * novo do Fluxo de caixa: os mesmos eventos da projeção, somados por
 * quinzena, respeitando o filtro da tela.
 */
import { describe, expect, it } from 'vitest';
import { casa14, HOJE, h } from './casa14.fixture.js';
import { novaObra, round2 } from '../src/nucleo/base.js';
import { analiseFluxo, eventosProjetados, receberPagarProximos } from '../src/dominio/calculos.js';

const soma = (xs, f) => round2(xs.reduce((t, x) => t + f(x), 0));

describe('receberPagarProximos', () => {
  it('seis quinzenas a partir de hoje, sem buraco nem sobreposição', () => {
    const r = receberPagarProximos(casa14(), '', HOJE);
    expect(r.periodos).toHaveLength(6);
    expect(r.periodos[0].inicio).toBe(HOJE);
    expect(r.periodos[0].fim).toBe(h(14));
    expect(r.periodos[1].inicio).toBe(h(15));
    expect(r.periodos[5].fim).toBe(h(89));
  });

  it('soma os eventos projetados da janela, cada um no seu período', () => {
    const o = casa14();
    const r = receberPagarProximos(o, '', HOJE);
    const janela = eventosProjetados(o, HOJE).filter((e) => e.data >= HOJE && e.data < h(90));
    expect(r.totais.receber).toBeCloseTo(
      soma(
        janela.filter((e) => e.valor > 0),
        (e) => e.valor,
      ),
      2,
    );
    expect(r.totais.pagar).toBeCloseTo(
      soma(
        janela.filter((e) => e.valor < 0),
        (e) => -e.valor,
      ),
      2,
    );
    expect(r.totais.saldo).toBeCloseTo(r.totais.receber - r.totais.pagar, 2);
    r.periodos.forEach((p) => expect(p.saldo).toBeCloseTo(p.receber - p.pagar, 2));
    /* a medição a pagar cai hoje: entra na primeira quinzena */
    expect(r.periodos[0].pagar).toBeGreaterThan(0);
  });

  it('com a janela cobrindo tudo, bate com a projeção de analiseFluxo', () => {
    const o = casa14();
    const tudo = receberPagarProximos(o, 'futuros', HOJE, 3650, 3650);
    const an = analiseFluxo(o, 'futuros', HOJE);
    expect(tudo.totais.receber).toBeCloseTo(
      soma(an.meses, (m) => m.entradas),
      2,
    );
    expect(tudo.totais.pagar).toBeCloseTo(
      soma(an.meses, (m) => m.saidas),
      2,
    );
  });

  it('parcela vencida entra reprogramada, como na projeção', () => {
    const o = casa14();
    const vencida = o.recebimentos.find((x) => x.status !== 'Recebido' && x.status !== 'Cancelado');
    vencida.dataPrevista = h(-40);
    const r = receberPagarProximos(o, '', HOJE);
    const reprogramadas = eventosProjetados(o, HOJE).filter((e) => e.tipo === 'entrada-vencida');
    expect(reprogramadas.length).toBeGreaterThan(0);
    const alvo = r.periodos.find(
      (p) => p.inicio <= reprogramadas[0].data && reprogramadas[0].data <= p.fim,
    );
    expect(alvo.receber).toBeGreaterThan(0);
  });

  it('filtro "movimento" tira os períodos vazios; "futuros" deixa o mês corrente de fora', () => {
    const o = casa14();
    const mov = receberPagarProximos(o, 'movimento', HOJE);
    expect(mov.periodos.every((p) => p.receber > 0 || p.pagar > 0)).toBe(true);
    const fut = receberPagarProximos(o, 'futuros', HOJE);
    expect(fut.periodos.every((p) => p.fim.slice(0, 7) > HOJE.slice(0, 7))).toBe(true);
    /* nada do mês corrente entra no total */
    const doMes = eventosProjetados(o, HOJE).filter((e) => e.data.slice(0, 7) === HOJE.slice(0, 7));
    const semMes =
      receberPagarProximos(o, '', HOJE).totais.pagar -
      soma(
        doMes.filter((e) => e.valor < 0 && e.data < h(90)),
        (e) => -e.valor,
      );
    expect(fut.totais.pagar).toBeCloseTo(semMes, 2);
  });

  it('obra sem nada planejado: períodos zerados, totais zero', () => {
    const r = receberPagarProximos(novaObra('Vazia'), '', HOJE);
    expect(r.periodos).toHaveLength(6);
    expect(r.totais).toEqual({ receber: 0, pagar: 0, saldo: 0 });
    expect(receberPagarProximos(novaObra('Vazia'), 'movimento', HOJE).periodos).toEqual([]);
  });
});
