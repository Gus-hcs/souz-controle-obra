/**
 * telas/carteira-acoes.js — O que responde a clique, tecla e clique direito
 * na carteira. Separado da montagem do HTML de propósito: em carteira.js não
 * existe nenhum addEventListener, e aqui não existe nenhuma tag.
 */
import { esc } from '../../nucleo/base.js';
import { Store } from '../../dados/store.js';
import { ACOES } from '../acoes.js';
import { App, ICO, svg } from '../shell.js';
import { COLUNAS, linhas, tela } from './carteira.js';

const naCarteira = () => App.rota.view === 'carteira';

/* Redesenha só o conteúdo — a seleção é estado de tela, não de rota. */
function repintar() {
  App.renderConteudo();
}

/* ------------------------------------------------------------- seleção */

ACOES['carteira-selecionar'] = (el, d) => {
  tela.selecao = tela.selecao === d.obra ? '' : d.obra;
  repintar();
};

ACOES['carteira-limpar'] = () => {
  tela.selecao = '';
  repintar();
};

ACOES['carteira-abrir'] = (el, d) => {
  App.ir('painel', d.obra || tela.selecao);
};

/* -------------------------------------------------------------- ordem
   Clicar de novo na mesma coluna inverte. Texto começa A→Z; número
   começa do maior, que é o que se quer ver primeiro numa obra. */
ACOES['carteira-ordenar'] = (el, d) => {
  const col = COLUNAS.find((c) => c.k === d.col);
  if (!col) return;
  if (tela.ordem.col === d.col) tela.ordem.dir = -tela.ordem.dir;
  else tela.ordem = { col: d.col, dir: col.num ? -1 : 1 };
  repintar();
};

ACOES['carteira-filtro'] = (el, d) => {
  tela.filtro = d.filtro;
  tela.selecao = '';
  /* O segmentado vive na toolbar, então a toolbar também precisa repintar.
     Só aqui: enquanto se digita na busca, repintar a toolbar tiraria o
     cursor do campo. */
  App.renderTopo();
  repintar();
};

/* ------------------------------------------------------ menu de contexto */

function fecharMenu() {
  const m = document.querySelector('.menu-ctx');
  if (m) m.remove();
}

function abrirMenu(x, y, obraId) {
  fecharMenu();
  const obra = Store.estado.obras.find((o) => o.id === obraId);
  if (!obra) return;

  const item = (rotulo, acao, view, icone) =>
    `<button data-acao="${acao}" data-view="${view || ''}" data-obra="${esc(obraId)}">${
      icone ? svg(ICO[icone], 13) : '<span style="width:13px"></span>'
    }${rotulo}</button>`;

  const menu = document.createElement('div');
  menu.className = 'menu-ctx';
  menu.setAttribute('role', 'menu');
  menu.innerHTML = [
    item('Abrir a obra', 'ir', 'painel', 'painel'),
    '<hr>',
    item('Medições', 'ir', 'medicoes', 'medicao'),
    item('Recebimentos', 'ir', 'recebimentos', 'receb'),
    item('Diário de obra', 'ir', 'diario', 'diario'),
    item('Cronograma', 'ir', 'cronograma', 'crono'),
    '<hr>',
    item('Alertas da obra', 'ir', 'alertas', 'alerta'),
    item('Configuração da obra', 'ir', 'obra-config', 'config'),
  ].join('');

  document.body.appendChild(menu);
  /* Ancorar no cursor, mas sem sair da janela. */
  const r = menu.getBoundingClientRect();
  menu.style.left = Math.min(x, window.innerWidth - r.width - 8) + 'px';
  menu.style.top = Math.min(y, window.innerHeight - r.height - 8) + 'px';
}

document.addEventListener('contextmenu', (ev) => {
  if (!naCarteira()) return;
  const tr = ev.target.closest('tr[data-obra]');
  if (!tr) return;
  ev.preventDefault();
  tela.selecao = tr.dataset.obra;
  repintar();
  abrirMenu(ev.clientX, ev.clientY, tr.dataset.obra);
});

document.addEventListener('mousedown', (ev) => {
  if (!ev.target.closest('.menu-ctx')) fecharMenu();
});
document.addEventListener('scroll', fecharMenu, true);

/* ------------------------------------------------------------- teclado
   Setas andam na lista, Enter abre, Esc solta a seleção. Só quando o foco
   não está num campo: digitar "a" na busca não pode mover a seleção. */
document.addEventListener('keydown', (ev) => {
  if (!naCarteira()) return;

  if (ev.key === 'Escape') {
    if (document.querySelector('.menu-ctx')) return fecharMenu();
    if (tela.selecao) {
      tela.selecao = '';
      repintar();
    }
    return;
  }

  const digitando = /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName);
  if (digitando || ev.metaKey || ev.ctrlKey || ev.altKey) return;
  if (document.getElementById('modal-camada').classList.contains('aberto')) return;

  const ds = linhas();
  if (!ds.length) return;
  const i = ds.findIndex((d) => d.o.id === tela.selecao);

  if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
    ev.preventDefault();
    const passo = ev.key === 'ArrowDown' ? 1 : -1;
    const proximo =
      i < 0 ? (passo === 1 ? 0 : ds.length - 1) : Math.min(ds.length - 1, Math.max(0, i + passo));
    tela.selecao = ds[proximo].o.id;
    repintar();
    const tr = document.querySelector(`tr[data-obra="${CSS.escape(tela.selecao)}"]`);
    if (tr) tr.scrollIntoView({ block: 'nearest' });
    return;
  }

  if (ev.key === 'Enter' && tela.selecao) {
    ev.preventDefault();
    App.ir('painel', tela.selecao);
  }
});

/* Duplo clique abre, como no Finder. */
document.addEventListener('dblclick', (ev) => {
  if (!naCarteira()) return;
  const tr = ev.target.closest('tr[data-obra]');
  if (tr) App.ir('painel', tr.dataset.obra);
});

export { fecharMenu };
