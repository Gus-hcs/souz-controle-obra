// @vitest-environment jsdom
/**
 * A tela concorda com o banco sobre o papel na obra (0004/0014): o
 * cliente vê cronograma, diário e relatório de status; caixa, custo,
 * margem e prestadores são da construtora e ficam fora da Carteira dele.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { Store } from '../src/dados/store.js';
import { SUPA } from '../src/dados/supabase.js';
import { novaObra } from '../src/nucleo/base.js';
import { obrasDaConstrutora, viewPermitida } from '../src/ui/shell.js';

describe('papel na obra', () => {
  afterEach(() => {
    Store.backend = 'local';
    SUPA.papeis = {};
  });

  it('sem banco (uso local) tudo é do dono', () => {
    Store.backend = 'local';
    expect(viewPermitida('fluxo', 'o1')).toBe(true);
  });

  it('cliente vê só cronograma, diário e relatório', () => {
    Store.backend = 'supabase';
    SUPA.papeis = { o1: 'cliente' };
    expect(viewPermitida('cronograma', 'o1')).toBe(true);
    expect(viewPermitida('diario', 'o1')).toBe(true);
    expect(viewPermitida('relatorio', 'o1')).toBe(true);
    for (const v of ['painel', 'fluxo', 'contratos', 'medicoes', 'lancamentos', 'curva', 'auditoria']) {
      expect(viewPermitida(v, 'o1')).toBe(false);
    }
  });

  it('engenheiro e dono veem tudo da obra', () => {
    Store.backend = 'supabase';
    SUPA.papeis = { o1: 'engenheiro', o2: 'dono' };
    expect(viewPermitida('fluxo', 'o1')).toBe(true);
    expect(viewPermitida('contratos', 'o2')).toBe(true);
  });

  it('obra em que a pessoa é cliente não entra nos números da carteira', () => {
    Store.backend = 'supabase';
    const a = novaObra('Minha');
    const b = novaObra('Do cliente');
    Store.estado.obras = [a, b];
    SUPA.papeis = { [a.id]: 'dono', [b.id]: 'cliente' };
    expect(obrasDaConstrutora().map((o) => o.nome)).toEqual(['Minha']);
  });
});
