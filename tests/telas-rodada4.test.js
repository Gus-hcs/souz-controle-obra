// @vitest-environment jsdom
/**
 * Padrão de tela, rodada 4: a tela vazia no meio da área (vazioTela +
 * #conteudo.so-vazio), o Painel com as pendências no inspetor à direita e
 * os gráficos logo abaixo dos KPIs, Lançamentos com os gráficos antes da
 * lista, e a construtora no botão da conta.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { novaObra } from '../src/nucleo/base.js';
import { Store } from '../src/dados/store.js';
import { SUPA } from '../src/dados/supabase.js';
import { App, identidadeConta } from '../src/ui/shell.js';
import { VIEWS } from '../src/ui/telas-obra.js';
import '../src/ui/telas/carteira.js';
import '../src/ui/telas/painel.js';
import '../src/ui/telas/lancamentos.js';
import '../src/ui/telas/contratos.js';
import '../src/ui/telas/cronograma.js';
import '../src/ui/telas/materiais.js';
import '../src/ui/telas/medicoes.js';
import '../src/ui/telas/recebimentos.js';
import '../src/ui/telas/diario.js';
import '../src/ui/telas/curva.js';
import { casa14 } from './casa14.fixture.js';

function abrir(o, view) {
  Store.estado.obras = [o];
  App.rota.obraId = o.id;
  App.rota.view = view;
  App.filtros = {};
}

afterEach(() => {
  Store.backend = 'local';
  SUPA.usuario = null;
  SUPA.construtora = null;
  SUPA.nomeConstrutora = '';
  SUPA.construtorasNoBanco = false;
});

describe('tela vazia', () => {
  it('a tela sem nada é só o .vazio-tela, e o conteúdo vira so-vazio', () => {
    abrir(novaObra('Vazia'), 'lancamentos');
    document.body.innerHTML = '<main id="conteudo"></main>';
    App.renderConteudo();
    const c = document.getElementById('conteudo');
    expect(c.children).toHaveLength(1);
    expect(c.firstElementChild.classList.contains('vazio-tela')).toBe(true);
    expect(c.classList.contains('so-vazio')).toBe(true);
  });

  it('com dados, o conteúdo sai do modo vazio', () => {
    abrir(casa14(), 'lancamentos');
    document.body.innerHTML = '<main id="conteudo" class="so-vazio"></main>';
    App.renderConteudo();
    expect(document.getElementById('conteudo').classList.contains('so-vazio')).toBe(false);
  });

  it('todas as telas de lista de uma obra nova usam o mesmo vazio', () => {
    const o = novaObra('Vazia');
    for (const v of [
      'contratos',
      'cronograma',
      'materiais',
      'medicoes',
      'recebimentos',
      'lancamentos',
      'diario',
      'curva',
    ]) {
      abrir(o, v);
      expect(VIEWS[v]().trim(), v).toMatch(/^<div class="vazio vazio-tela"/);
    }
  });
});

describe('Painel da obra', () => {
  it('pendências, tendência, financiamento e cliente no inspetor à direita', () => {
    const o = casa14();
    abrir(o, 'painel');
    expect(VIEWS.painel.paineis).toBe(true);
    const cx = document.createElement('div');
    cx.innerHTML = VIEWS.painel();
    const principal = cx.querySelector('.tela-principal');
    const insp = cx.querySelector('[data-testid="inspetor-painel"]');
    expect(insp).toBeTruthy();
    expect(insp.textContent).toContain('Tendência');
    expect(insp.querySelector('.acao-grupo')).toBeTruthy();
    /* nada disso fica mais no meio da tela, entre os KPIs e os gráficos */
    expect(principal.querySelector('.frase-ancora, .caixa-financiador, .caixa-cliente')).toBe(
      null,
    );
  });

  it('os gráficos vêm logo abaixo dos KPIs', () => {
    abrir(casa14(), 'painel');
    const cx = document.createElement('div');
    cx.innerHTML = VIEWS.painel();
    const pilha = [...cx.querySelector('.tela-painel').children].map((e) =>
      e.classList.contains('kpis-cx') ? 'kpis' : e.classList.contains('painel-linha') ? 'curva' : 'x',
    );
    const i = pilha.indexOf('kpis');
    expect(i).toBe(0);
    /* entre os KPIs e a Curva S, só a implantação (quando a obra não está montada) */
    expect(pilha.indexOf('curva')).toBeLessThanOrEqual(2);
  });
});

describe('Lançamentos', () => {
  it('gráficos logo abaixo dos KPIs, antes dos filtros e da lista, com o gasto por mês', () => {
    abrir(casa14(), 'lancamentos');
    const html = VIEWS.lancamentos();
    const kpis = html.indexOf('kpis-cx');
    const graficos = html.indexOf('lanc-graficos');
    const filtros = html.indexOf('filtro-barra');
    expect(kpis).toBeGreaterThan(-1);
    expect(graficos).toBeGreaterThan(kpis);
    expect(filtros).toBeGreaterThan(graficos);
    expect(html).toContain('Gasto por etapa');
    expect(html).toContain('Composição por tipo');
    expect(html).toContain('Gasto por mês');
    expect(html).not.toContain('painel-analise');
  });
});

describe('construtora no botão da conta', () => {
  it('sem login: a empresa do navegador', () => {
    Store.estado.empresa.nome = 'Construtora Local';
    expect(identidadeConta()).toEqual({
      empresa: 'Construtora Local',
      pessoa: 'Este navegador',
      papel: '',
    });
  });

  it('equipe: a construtora e o papel', () => {
    Store.backend = 'supabase';
    SUPA.usuario = { id: 'u', email: 'eng@sonho.com' };
    SUPA.construtorasNoBanco = true;
    SUPA.construtora = { id: 'e', nome: 'Construtora Sonho Real', papel: 'engenheiro' };
    SUPA.nomeConstrutora = 'Construtora Sonho Real';
    expect(identidadeConta()).toEqual({
      empresa: 'Construtora Sonho Real',
      pessoa: 'eng',
      papel: 'Engenheiro',
    });
  });

  it('cliente final: a construtora da obra que acompanha', () => {
    Store.backend = 'supabase';
    SUPA.usuario = { id: 'u', email: 'dono.casa@x.com' };
    SUPA.construtorasNoBanco = true;
    SUPA.nomeConstrutora = 'Construtora Sonho Real';
    expect(identidadeConta()).toEqual({
      empresa: 'Construtora Sonho Real',
      pessoa: 'dono.casa',
      papel: 'Cliente',
    });
  });

  it('conta sem construtora não inventa um nome', () => {
    Store.backend = 'supabase';
    SUPA.usuario = { id: 'u', email: 'avulso@x.com' };
    SUPA.construtorasNoBanco = true;
    Store.estado.empresa.nome = 'Souz Engenharia';
    expect(identidadeConta()).toEqual({ empresa: '', pessoa: 'avulso', papel: '' });
  });
});
