/**
 * app.js — Ponto de entrada: delegação de eventos, rotas e inicialização.
 */
import './estilo.css';
import { Store } from './dados/store.js';
import { EXIGE_BANCO, SUPA, ehArtefato, entrarNoSistema, telaConfigBanco, telaLogin } from './dados/supabase.js';
import { App, VIEWS_OBRA, fecharModal, modalAoSalvar, rodarCalcForm, toast } from './ui/shell.js';
import { ACOES } from './ui/acoes.js';
import './ui/telas-obra.js';
import './ui/telas-cadastros.js';

/* ---------------------------------------------------------- eventos */
document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-acao]');
  if (!el || el.tagName === 'SELECT') return;
  const acao = el.dataset.acao;
  const fn = ACOES[acao];
  if (!fn) return;
  ev.preventDefault();
  try { fn(el, { ...el.dataset }); } catch (e) {
    console.error(e);
    toast('Erro: ' + e.message, 'critico');
  }
});

document.addEventListener('change', (ev) => {
  const el = ev.target;
  if (el.tagName === 'SELECT' && el.dataset.acao && ACOES[el.dataset.acao]) {
    ACOES[el.dataset.acao](el, { ...el.dataset });
    return;
  }
  if (el.dataset.filtro) {
    App.filtros[el.dataset.filtro] = el.value;
    App.renderConteudo();
  }
});

let tFiltro = null;
document.addEventListener('input', (ev) => {
  const el = ev.target;
  if (el.dataset.filtro && el.tagName === 'INPUT') {
    App.filtros[el.dataset.filtro] = el.value;
    App.foco = { id: el.id, pos: el.selectionStart };
    clearTimeout(tFiltro);
    tFiltro = setTimeout(() => App.renderConteudo(), 180);
    return;
  }
  if (el.dataset.campo) rodarCalcForm();
});

document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && document.getElementById('modal-camada').classList.contains('aberto')) {
    fecharModal();
  }
  if (ev.key === 'Enter' && ev.target.dataset && ev.target.dataset.campo &&
      ev.target.tagName === 'INPUT' && modalAoSalvar) {
    ev.preventDefault();
    ACOES['salvar-form']();
  }
});

document.getElementById('modal-camada').addEventListener('mousedown', (ev) => {
  if (ev.target.id === 'modal-camada') fecharModal();
});

window.addEventListener('beforeunload', (ev) => {
  if (Store.pendente) { ev.preventDefault(); ev.returnValue = ''; }
});

function restaurarRota() {
  try {
    const r = JSON.parse(sessionStorage.getItem('souz_rota') || 'null');
    if (r && r.view) App.rota = r;
  } catch (e) {}
}

/* ------------------------------------------------------- inicialização */
(function tema() {
  try {
    const t = localStorage.getItem('souz_tema');
    if (t) document.documentElement.setAttribute('data-theme', t);
    if (localStorage.getItem('souz_rail') === '1') document.body.classList.add('rail-recolhido');
  } catch (e) {}
})();

async function iniciar() {
  document.getElementById('conteudo').innerHTML =
    `<div class="vazio"><h4>Carregando o sistema…</h4><p>Buscando os dados da obra.</p></div>`;

  /* ---------- versão hospedada: banco de dados online ---------- */
  if (!ehArtefato() && (SUPA.configurado() || EXIGE_BANCO)) {
    restaurarRota();
    if (!SUPA.configurado()) return telaConfigBanco();
    const r = await SUPA.iniciar();
    if (r.estado === 'sem-biblioteca') {
      return telaConfigBanco('Não consegui carregar a biblioteca do Supabase. Verifique a conexão com a internet.');
    }
    if (r.estado === 'erro') return telaConfigBanco('Erro ao conectar: ' + (r.mensagem || ''));
    Store.aoMudar(() => App.renderTopo());
    if (r.estado === 'autenticado') return entrarNoSistema();
    return telaLogin('entrar');
  }

  /* ---------- versão artefato / arquivo local ---------- */
  App.render();
  await Store.iniciar();

  restaurarRota();
  if (VIEWS_OBRA.has(App.rota.view) && !Store.estado.obras.some((o) => o.id === App.rota.obraId)) {
    App.rota = { view: 'carteira', obraId: '' };
  }
  if (!App.rota.obraId && Store.estado.obras.length) App.rota.obraId = Store.estado.obras[0].id;

  Store.aoMudar(() => App.renderTopo());
  App.render();

  if (Store.modo === 'local') {
    toast('Gravação na nuvem indisponível neste acesso: os dados ficam neste navegador. Baixe um backup em Ajustes.', 'aviso', 8000);
  }
  if (Store.modo === 'leitura') {
    toast('Acesso somente leitura: você pode consultar, mas não alterar.', 'aviso', 6000);
  }
}

iniciar();

export {
  tFiltro,
  restaurarRota,
  iniciar
};
