/**
 * Conferência de implantacaoObra() — a sequência de preenchimento que a rail
 * e o cartão do Painel usam para guiar o cliente.
 */
import { describe, it, expect } from 'vitest';
import {
  novaObra, novoContrato, novaEtapaCronograma, novoMaterial, novaMedicao,
  novoRecebimento, novoLancamento, novoDiario,
} from '../src/nucleo/base.js';
import { implantacaoObra } from '../src/dominio/calculos.js';

describe('implantacaoObra()', () => {
  it('obra recém-criada: nada feito, não montada', () => {
    const r = implantacaoObra(novaObra('Casa 1'));
    expect(r.feitos).toBe(0);
    expect(r.montada).toBe(false);
    expect(r.pct).toBe(0);
    expect(r.passos.map((p) => p.v)).toEqual([
      'obra-config', 'contratos', 'cronograma', 'materiais',
      'medicoes', 'recebimentos', 'lancamentos', 'diario',
    ]);
  });

  it('config conta quando área, financiado ou venda foram preenchidos', () => {
    const o = novaObra('Casa 2');
    // preço de empreitada nasce com padrão — não conta sozinho
    expect(implantacaoObra(o).passos[0].feito).toBe(false);
    o.areaConstruida = 60;
    expect(implantacaoObra(o).passos[0].feito).toBe(true);
  });

  it('montada = config + contrato + cronograma (materiais é opcional)', () => {
    const o = novaObra('Casa 3');
    o.areaConstruida = 60;
    o.fin.valorFinanciado = 200000;
    o.contratos.push(novoContrato());
    o.cronograma.push(novaEtapaCronograma());
    const r = implantacaoObra(o);
    expect(r.montada).toBe(true);
    expect(r.completa).toBe(false); // ainda falta a fase de executar
  });

  it('conta os passos opcionais no total mas não nos essenciais', () => {
    const o = novaObra('Casa 4');
    o.materiais.push(novoMaterial());
    o.diario.push(novoDiario());
    const r = implantacaoObra(o);
    expect(r.feitos).toBe(2);
    expect(r.feitosObrig).toBe(0);
    expect(r.totalObrig).toBe(6);
  });

  it('tudo preenchido: completa', () => {
    const o = novaObra('Casa 5');
    o.areaConstruida = 60;
    o.fin.valorVenda = 320000;
    o.contratos.push(novoContrato());
    o.cronograma.push(novaEtapaCronograma());
    o.materiais.push(novoMaterial());
    o.medicoes.push(novaMedicao());
    o.recebimentos.push(novoRecebimento());
    o.lancamentos.push(novoLancamento());
    o.diario.push(novoDiario());
    const r = implantacaoObra(o);
    expect(r.montada).toBe(true);
    expect(r.completa).toBe(true);
    expect(r.pct).toBe(1);
  });
});
