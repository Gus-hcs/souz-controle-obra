// @vitest-environment jsdom
/**
 * Carga do login em páginas (auditoria A-05): a API corta cada resposta no
 * "Max rows" do projeto sem avisar. Com 2.500 lançamentos, a carga traz os
 * 2.500 — com o corte padrão (1.000) ou menor (400) — e página que falha no
 * meio derruba a carga inteira, em vez de deixar o estado pela metade.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SUPA } from '../src/dados/supabase.js';

const OBRA = { id: 'o1', nome: 'Obra 1', criado_em: '2026-01-01' };
const LANC = Array.from({ length: 2500 }, (_, i) => ({
  id: `l${String(i).padStart(5, '0')}`,
  obra_id: 'o1',
  descricao: `Lançamento ${i}`,
  criado_em: '2026-01-02',
}));

/* Banco falso: obras com 1 linha, lançamentos com 2.500, o resto vazio.
   maxRows é o corte do servidor; falhaNaPagina derruba a enésima página. */
function banco({ maxRows = 1000, falhaNaPagina = 0 } = {}) {
  const pedidos = [];
  let paginas = 0;
  return {
    pedidos,
    rpc: async () => ({ data: null, error: null }),
    from(nome) {
      const linhas = nome === 'obras' ? [OBRA] : nome === 'lancamentos' ? LANC : [];
      return {
        select: (_cols, opcoes) => ({
          order: () => ({
            range: async (ini, fim) => {
              pedidos.push({ nome, ini, fim, conta: !!(opcoes && opcoes.count) });
              if (nome === 'lancamentos' && ++paginas === falhaNaPagina) {
                return { data: null, error: { message: 'tempo esgotado' } };
              }
              const ate = Math.min(fim + 1, ini + maxRows);
              return {
                data: linhas.slice(ini, ate),
                error: null,
                count: opcoes && opcoes.count ? linhas.length : null,
              };
            },
          }),
          eq: () =>
            Object.assign(Promise.resolve({ data: [], error: null }), {
              maybeSingle: async () => ({ data: null, error: null }),
            }),
        }),
      };
    },
  };
}

describe('carga paginada', () => {
  let original;
  beforeEach(() => {
    original = { sb: SUPA.sb, usuario: SUPA.usuario };
    SUPA.usuario = { id: 'u1', email: 'u1@exemplo.com' };
  });
  afterEach(() => {
    SUPA.sb = original.sb;
    SUPA.usuario = original.usuario;
  });

  it('2.500 lançamentos com o corte padrão de 1.000: carrega todos, em 3 páginas', async () => {
    const b = banco();
    SUPA.sb = b;
    const estado = await SUPA.carregar();
    expect(estado.obras[0].lancamentos).toHaveLength(2500);
    const pedidos = b.pedidos.filter((p) => p.nome === 'lancamentos');
    expect(pedidos.map((p) => p.ini)).toEqual([0, 1000, 2000]);
    expect(pedidos[0].conta).toBe(true);
    expect(pedidos.slice(1).every((p) => !p.conta)).toBe(true);
  });

  it('servidor que corta em 400: continua até completar a contagem', async () => {
    const b = banco({ maxRows: 400 });
    SUPA.sb = b;
    const estado = await SUPA.carregar();
    expect(estado.obras[0].lancamentos).toHaveLength(2500);
    expect(new Set(estado.obras[0].lancamentos.map((l) => l.id)).size).toBe(2500);
  });

  it('página que falha no meio derruba a carga inteira', async () => {
    SUPA.sb = banco({ falhaNaPagina: 2 });
    await expect(SUPA.carregar()).rejects.toMatchObject({ message: 'tempo esgotado' });
  });

  it('página vazia antes de completar a contagem é erro, não estado pela metade', async () => {
    const b = banco();
    const from = b.from.bind(b);
    b.from = (nome) => {
      const t = from(nome);
      if (nome !== 'lancamentos') return t;
      return {
        select: (c, o) => ({
          order: () => ({
            range: async (ini, fim) => {
              const r = await t.select(c, o).order().range(ini, fim);
              return ini >= 1000 ? { data: [], error: null, count: r.count } : r;
            },
          }),
        }),
      };
    };
    SUPA.sb = b;
    await expect(SUPA.carregar()).rejects.toThrow(/Carga incompleta de lancamentos: 1000 de 2500/);
  });
});
