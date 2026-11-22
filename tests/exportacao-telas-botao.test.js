// @vitest-environment jsdom
/**
 * Botão "Exportar" do topo: aparece na aba preenchida, some na vazia e nas
 * abas sem relatório, e abre o menu com PDF, Excel e CSV.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Store } from '../src/dados/store.js';
import { App } from '../src/ui/shell.js';
import { ACOES } from '../src/ui/acoes.js';
import '../src/io/exportar-tela.js';
import { novaObra } from '../src/nucleo/base.js';
import { estadoDemo } from './fixture.js';

const salvo = {};
beforeAll(() => {
  salvo.estado = Store.estado;
  salvo.rota = App.rota;
  document.body.innerHTML = '<header id="topo"></header><div id="toasts"></div>';
  Store.estado = estadoDemo();
});
afterAll(() => {
  Store.estado = salvo.estado;
  App.rota = salvo.rota;
});

const botaoNo = (view, obraId) => {
  App.rota = { view, obraId };
  App.renderTopo();
  return document.querySelector('#topo [data-testid="exportar-tela"]');
};

describe('botão Exportar no topo', () => {
  it('aparece nas abas preenchidas', () => {
    const o = Store.estado.obras[0];
    ['lancamentos', 'medicoes', 'contratos', 'cronograma', 'obra-config', 'alertas'].forEach((v) =>
      expect(botaoNo(v, o.id), v).not.toBeNull(),
    );
    expect(botaoNo('clientes', '')).not.toBeNull();
  });

  it('some na aba vazia e onde não há relatório', () => {
    const vazia = novaObra('Vazia');
    Store.estado.obras.push(vazia);
    expect(botaoNo('lancamentos', vazia.id)).toBeNull();
    expect(botaoNo('painel', Store.estado.obras[0].id)).toBeNull();
    expect(botaoNo('carteira', '')).toBeNull();
  });

  it('abre o menu com PDF, Excel e CSV', () => {
    const btn = botaoNo('lancamentos', Store.estado.obras[0].id);
    ACOES['exportar-tela'](btn, {});
    const menu = document.querySelector('.menu-flutuante');
    expect(menu).not.toBeNull();
    const formatos = [...menu.querySelectorAll('[data-acao="exportar-tela-gerar"]')].map(
      (b) => b.dataset.formato,
    );
    expect(formatos).toEqual(['pdf', 'xlsx', 'csv']);
  });
});
