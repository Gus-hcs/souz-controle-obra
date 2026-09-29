// @vitest-environment jsdom
/**
 * Ajustes rápidos das melhorias: o progresso do contrato sai do domínio
 * (regra 1) e, na Carteira, cada botão "Fazer" diz de qual obra é.
 */
import { describe, expect, it } from 'vitest';
import { progressoContrato } from '../src/dominio/calculos.js';
import { fraseAncoraHTML } from '../src/ui/telas-obra.js';

describe('progresso do contrato', () => {
  it('medido e pago como fração do autorizado, com teto de 100% na barra', () => {
    expect(progressoContrato({ autorizado: 1000, medido: 250, pago: 100 })).toEqual({
      medido: 0.25,
      pago: 0.1,
      razaoMedido: 0.25,
    });
    const acima = progressoContrato({ autorizado: 1000, medido: 1200, pago: 1100 });
    expect(acima.medido).toBe(1);
    expect(acima.pago).toBe(1);
    expect(acima.razaoMedido).toBe(1.2);
  });
  it('sem autorizado: tudo zero (sem divisão por zero)', () => {
    expect(progressoContrato({ autorizado: 0, medido: 500, pago: 500 })).toEqual({
      medido: 0,
      pago: 0,
      razaoMedido: 0,
    });
    expect(progressoContrato(undefined).medido).toBe(0);
  });
});

describe('frase-âncora da Carteira', () => {
  const historia = {
    nivel: 'critico',
    situacao: [{ texto: '7 de 7 obras em risco', nivel: 'critico' }],
    causas: ['Casa 42 — Residencial Aurora', 'Casa 07 — Jardim Aurora'].map((obraNome, i) => ({
      titulo: 'Parcela sem crédito',
      acao: 'Cobrar o cliente ou combinar nova data.',
      obraId: 'o' + i,
      obraNome,
      ref: { view: 'recebimentos' },
    })),
  };
  it('na Carteira, cada botão leva o nome curto da obra', () => {
    const div = document.createElement('div');
    div.innerHTML = fraseAncoraHTML(historia, { mostrarObra: true });
    const botoes = [...div.querySelectorAll('.ancora-acoes button')].map((b) => b.textContent);
    expect(botoes).toEqual([
      'Cobrar o cliente ou combinar nova data · Casa 42',
      'Cobrar o cliente ou combinar nova data · Casa 07',
    ]);
  });
  it('no Painel (uma obra só), o botão fica como era', () => {
    const div = document.createElement('div');
    div.innerHTML = fraseAncoraHTML(historia);
    expect(div.querySelector('.ancora-acoes button').textContent).toBe(
      'Cobrar o cliente ou combinar nova data',
    );
  });
});
