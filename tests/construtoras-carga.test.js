// @vitest-environment jsdom
/**
 * Construtoras (0021) no app: a carga pela construtora (dados da empresa,
 * listas, plano, limite, bloqueio), o papel nas obras da construtora e a
 * gravação dos dados da empresa na construtora — e o banco sem a 0021,
 * que segue pelo perfil como antes.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SUPA } from '../src/dados/supabase.js';

const PERFIL = {
  id: 'u1',
  empresa_nome: 'Nome antigo do perfil',
  cnpj: '',
  logo: '',
  listas: { etapas: ['Do perfil'] },
  admin: false,
  plano: 'ativo',
  bloqueado: false,
  abas: {},
  limite_obras: 99,
};

const SONHO = {
  id: 'emp-1',
  nome: 'Construtora Sonho Real',
  cnpj: '11.222.333/0001-81',
  logo: '',
  responsavel: 'Eng. Carla',
  crea_cau: 'GO-123',
  telefone: '62 3333-4444',
  email: 'contato@sonho.com',
  listas: { etapas: ['Fundação', 'Estrutura'] },
  plano: 'ativo',
  limite_usuarios: 5,
  limite_obras: 10,
  bloqueada: false,
  papel: 'engenheiro',
  usuarios: 3,
  obras: 2,
};

/* Banco falso: tabelas vazias, o perfil acima, minha_construtora() com a
   construtora dada (ou erro de função inexistente) e as gravações anotadas. */
function banco({ construtora = null, sem0021 = false, perfil = PERFIL } = {}) {
  const gravado = [];
  return {
    gravado,
    rpc: async (fn) => {
      if (fn !== 'minha_construtora') return { data: null, error: null };
      if (sem0021) {
        return {
          data: null,
          error: { message: 'Could not find the function public.minha_construtora' },
        };
      }
      return { data: construtora ? [construtora] : [], error: null };
    },
    from(nome) {
      const vazio = { data: [], error: null };
      return {
        select: () => ({
          limit: async () => vazio,
          eq: () =>
            Object.assign(Promise.resolve(vazio), {
              maybeSingle: async () => ({ data: nome === 'perfis' ? perfil : null, error: null }),
            }),
        }),
        update: (linha) => ({
          eq: async (col, val) => {
            gravado.push({ tabela: nome, linha, col, val });
            return { error: null };
          },
        }),
      };
    },
  };
}

let original;
beforeEach(() => {
  original = { sb: SUPA.sb, usuario: SUPA.usuario };
  SUPA.usuario = { id: 'u1', email: 'eng@sonho.com' };
});
afterEach(() => {
  SUPA.sb = original.sb;
  SUPA.usuario = original.usuario;
  SUPA.construtora = null;
  SUPA.construtorasNoBanco = false;
  SUPA.bloqueado = false;
  SUPA.motivoBloqueio = '';
  SUPA.papeis = {};
});

describe('carga pela construtora', () => {
  it('dados da empresa, listas, plano e limite de obras vêm da construtora', async () => {
    SUPA.sb = banco({ construtora: SONHO });
    const e = await SUPA.carregar();
    expect(SUPA.construtorasNoBanco).toBe(true);
    expect(SUPA.construtora).toMatchObject({
      id: 'emp-1',
      papel: 'engenheiro',
      limiteUsuarios: 5,
      usuarios: 3,
      obras: 2,
    });
    expect(e.empresa).toMatchObject({
      nome: 'Construtora Sonho Real',
      cnpj: '11.222.333/0001-81',
      creaCau: 'GO-123',
    });
    expect(e.listas.etapas).toEqual(['Fundação', 'Estrutura']);
    expect(SUPA.limiteObras).toBe(10);
    expect(SUPA.bloqueado).toBe(false);
  });

  it('construtora bloqueada bloqueia a entrada, com o motivo', async () => {
    SUPA.sb = banco({ construtora: { ...SONHO, bloqueada: true } });
    await SUPA.carregar();
    expect(SUPA.bloqueado).toBe(true);
    expect(SUPA.motivoBloqueio).toBe('construtora');
  });

  it('banco sem a 0021: tudo pelo perfil, como antes', async () => {
    SUPA.sb = banco({ sem0021: true });
    const e = await SUPA.carregar();
    expect(SUPA.construtorasNoBanco).toBe(false);
    expect(SUPA.construtora).toBe(null);
    expect(e.empresa.nome).toBe('Nome antigo do perfil');
    expect(SUPA.limiteObras).toBe(99);
  });

  it('cliente final (sem construtora de equipe): segue pelo perfil', async () => {
    SUPA.sb = banco({ construtora: null });
    const e = await SUPA.carregar();
    expect(SUPA.construtorasNoBanco).toBe(true);
    expect(SUPA.construtora).toBe(null);
    expect(e.empresa.nome).toBe('Nome antigo do perfil');
  });
});

describe('papel na obra', () => {
  it('convite vale primeiro; sem convite, o papel na construtora', () => {
    SUPA.papeis = { 'obra-convite': 'cliente' };
    SUPA.construtora = { ...SONHO, papel: 'engenheiro' };
    expect(SUPA.papelNaObra('obra-convite')).toBe('cliente');
    expect(SUPA.papelNaObra('obra-da-construtora')).toBe('engenheiro');
    SUPA.construtora = { ...SONHO, papel: 'gestor' };
    expect(SUPA.papelNaObra('obra-da-construtora')).toBe('dono');
    SUPA.construtora = null;
    expect(SUPA.papelNaObra('qualquer')).toBe('dono');
  });
});

describe('gravação dos dados da empresa', () => {
  it('com construtora, grava em empresas — não no perfil', async () => {
    const db = banco({ construtora: SONHO });
    SUPA.sb = db;
    const antes = await SUPA.carregar();
    const depois = JSON.parse(JSON.stringify(antes));
    depois.empresa.telefone = '62 99999-0000';
    depois.listas.etapas = ['Fundação', 'Estrutura', 'Cobertura'];
    await SUPA.sincronizar(antes, depois);
    const g = db.gravado.filter((x) => x.tabela === 'empresas' || x.tabela === 'perfis');
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ tabela: 'empresas', col: 'id', val: 'emp-1' });
    expect(g[0].linha).toMatchObject({ nome: 'Construtora Sonho Real', telefone: '62 99999-0000' });
    expect(g[0].linha.listas.etapas).toContain('Cobertura');
  });

  it('sem construtora, grava no perfil (com logo e CNPJ)', async () => {
    const db = banco({ sem0021: true });
    SUPA.sb = db;
    const antes = await SUPA.carregar();
    const depois = JSON.parse(JSON.stringify(antes));
    depois.empresa.cnpj = '11.222.333/0001-81';
    await SUPA.sincronizar(antes, depois);
    const g = db.gravado.filter((x) => x.tabela === 'empresas' || x.tabela === 'perfis');
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ tabela: 'perfis', val: 'u1' });
    expect(g[0].linha.cnpj).toBe('11.222.333/0001-81');
  });
});
