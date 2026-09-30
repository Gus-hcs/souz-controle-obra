// @vitest-environment jsdom
/**
 * Leitura da obra (pedido de quem usa: "confuso para selecionar as obras e
 * ler as informações das obras"): o resumo no topo do Painel sai do
 * domínio, e o seletor de obra mostra situação e avanço, abre as recentes
 * primeiro e busca por nome, cliente ou cidade.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resumoObra } from '../src/dominio/calculos.js';
import { Store } from '../src/dados/store.js';
import { App } from '../src/ui/shell.js';
import { ACOES } from '../src/ui/acoes.js';
import { estadoDemo } from './fixture.js';

const HOJE = '2026-09-27';

describe('resumoObra', () => {
  it('prazo, avanço contra o previsto, caixa, próxima parcela e pendências', () => {
    const o = estadoDemo().obras[0];
    const r = resumoObra(o, HOJE);
    expect(r.fisico).toBeGreaterThanOrEqual(0);
    expect(r.fisicoPrevisto).toBeGreaterThanOrEqual(r.fisico - 1);
    expect(typeof r.caixaHoje).toBe('number');
    expect(r.pendencias.total).toBeGreaterThanOrEqual(r.pendencias.criticas);
    expect(['critico', 'atencao', 'ok']).toContain(r.nivel);
  });
  it('próxima parcela: a primeira não recebida, pela data prevista; vencida marcada', () => {
    const o = estadoDemo().obras[0];
    o.recebimentos = [
      { id: 'r1', status: 'Recebido', dataPrevista: '2026-01-10', valorPrevisto: 1000 },
      { id: 'r2', status: 'Previsto', dataPrevista: '2026-12-01', valorPrevisto: 3000 },
      { id: 'r3', status: 'Previsto', dataPrevista: '2026-09-01', valorPrevisto: 2000 },
      { id: 'r4', status: 'Cancelado', dataPrevista: '2026-08-01', valorPrevisto: 9000 },
    ];
    const p = resumoObra(o, HOJE).proximaParcela;
    expect(p).toMatchObject({ valor: 2000, data: '2026-09-01', vencida: true });
  });
  it('obra sem parcela a receber: próxima parcela vazia', () => {
    const o = estadoDemo().obras[0];
    o.recebimentos = [];
    expect(resumoObra(o, HOJE).proximaParcela).toBeNull();
  });
});

describe('seletor de obra', () => {
  let original;
  beforeEach(() => {
    original = { estado: Store.estado, rota: { ...App.rota } };
    document.body.innerHTML =
      '<button data-acao="obra-menu"></button><div id="modal-camada"></div><div id="toasts"></div>';
    const e = estadoDemo();
    const base = e.obras[0];
    [
      'Casa 07 — Jardim Aurora',
      'Casa 14 — Vila Nova',
      'Sobrado — Alto da Glória',
      'Casa 22 — Parque das Flores',
      'Loja 2 — Setor Bueno',
    ].forEach((nome, i) => {
      const o = JSON.parse(JSON.stringify(base));
      o.id = 'x' + i;
      o.nome = nome;
      o.cidade = i === 4 ? 'Anápolis' : 'Cascavel';
      e.obras.push(o);
    });
    Store.estado = e;
    App.rota.view = 'carteira';
    localStorage.clear();
  });
  afterEach(() => {
    document.querySelectorAll('.menu-obra').forEach((m) => m.remove());
    Store.estado = original.estado;
    Object.assign(App.rota, original.rota);
    localStorage.clear();
  });
  const abrir = () => {
    ACOES['obra-menu'](document.querySelector('[data-acao="obra-menu"]'));
    return document.querySelector('.menu-obra');
  };
  const nomes = (menu) =>
    [...menu.querySelectorAll('[data-busca]:not([hidden]) b')].map((b) => b.textContent);

  it('cada obra mostra a situação e o % feito', () => {
    const menu = abrir();
    const linha = menu.querySelector('[data-busca] .item-duplo span').textContent;
    expect(linha).toMatch(/% feito/);
  });
  it('com mais de 5 obras há busca, por nome e por cidade', () => {
    const menu = abrir();
    const busca = menu.querySelector('.menu-obra-busca');
    expect(busca).not.toBeNull();
    busca.value = 'vila nova';
    busca.dispatchEvent(new Event('input'));
    expect(nomes(menu)).toEqual(['Casa 14']);
    busca.value = 'anapolis';
    busca.dispatchEvent(new Event('input'));
    expect(nomes(menu)).toEqual(['Loja 2']);
  });
  it('as obras abertas por último vêm primeiro', () => {
    localStorage.setItem('souz_obras_recentes', JSON.stringify(['x4', 'x1']));
    const menu = abrir();
    expect(nomes(menu).slice(0, 2)).toEqual(['Loja 2', 'Casa 14']);
  });
});
