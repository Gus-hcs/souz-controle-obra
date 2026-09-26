// @vitest-environment jsdom
/**
 * Trilha de auditoria (B11): quem fez (importação, sistema, pessoa), o
 * "antes → depois" com os dois lados e a célula do registro.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { origemAlteracoes } from '../src/dominio/calculos.js';
import { novaObra, novoLancamento } from '../src/nucleo/base.js';
import { Store } from '../src/dados/store.js';
import { SUPA } from '../src/dados/supabase.js';
import { App } from '../src/ui/shell.js';
import { Auditoria, VIEWS } from '../src/ui/telas-obra.js';
import '../src/ui/telas/auditoria.js';

const linha = (x) => ({
  id: Math.random(),
  tabela: 'lancamentos',
  registro_id: 'l1',
  operacao: 'INSERT',
  campo: 'preco_unitario',
  valor_antes: null,
  valor_depois: '7900',
  usuario_id: 'u1',
  criado_em: '2026-09-20T10:00:00Z',
  ...x,
});

describe('origemAlteracoes', () => {
  it('10+ inclusões da mesma pessoa em 5 s = importação', () => {
    const rajada = Array.from({ length: 12 }, (_, i) =>
      linha({ criado_em: `2026-09-20T10:00:0${i % 4}Z` }),
    );
    const m = origemAlteracoes(rajada);
    expect([...m.values()].every((v) => v === 'importacao')).toBe(true);
  });
  it('poucas inclusões, alteração ou sem usuário não são importação', () => {
    const poucas = Array.from({ length: 3 }, () => linha({}));
    const alt = linha({ operacao: 'UPDATE' });
    const sis = linha({ usuario_id: null });
    const m = origemAlteracoes([...poucas, alt, sis]);
    expect(poucas.every((l) => m.get(l) === 'usuario')).toBe(true);
    expect(m.get(alt)).toBe('usuario');
    expect(m.get(sis)).toBe('sistema');
  });
});

describe('tela da trilha', () => {
  afterEach(() => {
    Store.backend = 'local';
    SUPA.usuario = null;
  });

  it('mostra Importação/Sistema em cinza e o antes → depois com os dois lados', () => {
    const o = novaObra('Casa');
    const l = Object.assign(novoLancamento(), { id: 'l1', descricao: 'Cimento' });
    o.lancamentos.push(l);
    Store.estado.obras = [o];
    App.rota.obraId = o.id;
    App.rota.view = 'auditoria';
    App.filtros = { escopo: 'todas' };
    Store.backend = 'supabase';
    SUPA.usuario = { id: 'u1', email: 'gustavo@souz.com' };
    Auditoria.chave = o.id;
    Auditoria.carregando = false;
    Auditoria.erro = '';
    Auditoria.linhas = [
      linha({
        operacao: 'UPDATE',
        valor_antes: '7900',
        valor_depois: '8100',
        criado_em: '2026-09-21T10:00:00Z',
      }),
      linha({ usuario_id: null, operacao: 'DELETE', valor_antes: '500', valor_depois: null }),
      ...Array.from({ length: 10 }, () => linha({ usuario_id: 'u2' })),
    ];
    const d = document.createElement('div');
    d.innerHTML = VIEWS.auditoria();
    const txt = d.textContent;
    expect(txt).toContain('Importação');
    expect(txt).toContain('Sistema');
    expect(txt).toContain('gustavo');
    expect(d.querySelector('s').textContent).toContain('7.900');
    expect(d.innerHTML).toMatch(/—<\/span> → <b>R\$/);
    expect(d.querySelector('.cel-registro .btn-link').textContent.trim()).toBe('Cimento');
  });
});
