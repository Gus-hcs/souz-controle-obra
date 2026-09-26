/**
 * app.js — Ponto de entrada: delegação de eventos, rotas e inicialização.
 */
/* Ordem importa: estilo.css é o legado, tokens/interface são a linguagem
   nova, legado.css religa os nomes antigos aos tokens e padrao.css é o
   padrão de tela (KPIs, contêiner, filtros), que vale sobre todos. Quem
   vem depois vence na cascata. */
import './estilo.css';
import './ui/tokens.css';
import './ui/interface.css';
import './ui/legado.css';
import './ui/padrao.css';
import { Store, erroDeRede } from './dados/store.js';
import {
  EXIGE_BANCO,
  SUPA,
  ehArtefato,
  entrarNoSistema,
  telaConfigBanco,
  telaLogin,
} from './dados/supabase.js';
import { App, VIEWS_OBRA, fecharModal, modalAoSalvar, rodarCalcForm, toast } from './ui/shell.js';
import { ACOES } from './ui/acoes.js';
import './ui/telas-obra.js';
import './ui/telas-cadastros.js';
/* Telas já convertidas para a linguagem nova — entram depois, porque
   sobrescrevem a versão antiga registrada em VIEWS. */
import './ui/telas/carteira.js';
import './ui/telas/carteira-acoes.js';
import './ui/telas/contratos.js';
import './ui/telas/medicoes.js';
import './ui/telas/recebimentos.js';
import './ui/telas/lancamentos.js';
import './ui/telas/prestadores.js';
import './ui/telas/vinculo.js';
import './ui/telas/cronograma.js';
import './ui/telas/materiais.js';
import './ui/telas/diario.js';
import './ui/telas/alertas.js';
import './ui/telas/fluxo.js';
import './ui/telas/curva.js';
import './ui/telas/obra-config.js';
import './ui/telas/auditoria.js';
import './ui/telas/clientes.js';
import './ui/telas/painel.js';
import './ui/telas/ajustes.js';
import './ui/telas/relatorios.js';

/* ---------------------------------------------------------- eventos */
document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-acao]');
  if (!el || el.tagName === 'SELECT') return;
  const acao = el.dataset.acao;
  const fn = ACOES[acao];
  if (!fn) return;
  ev.preventDefault();
  try {
    fn(el, { ...el.dataset });
  } catch (e) {
    console.error(e);
    toast('Erro: ' + e.message, 'critico');
  }
});

document.addEventListener('change', (ev) => {
  const el = ev.target;
  if (
    el.tagName === 'INPUT' &&
    el.type === 'file' &&
    el.dataset.logo &&
    ACOES['logo-selecionada']
  ) {
    ACOES['logo-selecionada'](el, { ...el.dataset });
    return;
  }
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
  if (
    ev.key === 'Enter' &&
    ev.target.dataset &&
    ev.target.dataset.campo &&
    ev.target.tagName === 'INPUT' &&
    modalAoSalvar
  ) {
    ev.preventDefault();
    ACOES['salvar-form']();
  }
  /* elementos com role="button" respondem a Enter/Espaço como um botão */
  if (
    (ev.key === 'Enter' || ev.key === ' ') &&
    ev.target.getAttribute &&
    ev.target.getAttribute('role') === 'button' &&
    ev.target.dataset.acao
  ) {
    ev.preventDefault();
    ev.target.click();
  }
});

/* Barra de rolagem só enquanto se rola, como no macOS: o elemento que
   rola ganha .rolando e perde 900ms depois do último movimento. */
const rolagens = new Map();
document.addEventListener(
  'scroll',
  (ev) => {
    const el = ev.target === document ? document.documentElement : ev.target;
    if (!el || !el.classList) return;
    el.classList.add('rolando');
    clearTimeout(rolagens.get(el));
    rolagens.set(
      el,
      setTimeout(() => {
        el.classList.remove('rolando');
        rolagens.delete(el);
      }, 900),
    );
  },
  true,
);

/* Atalhos globais. ⌘ no Mac, Ctrl no resto — a tecla certa para cada casa. */
document.addEventListener('keydown', (ev) => {
  if (!(ev.metaKey || ev.ctrlKey) || ev.altKey) return;
  const tecla = ev.key.toLowerCase();

  if (tecla === 'k') {
    const busca = document.querySelector('#topo input[type=search]');
    if (!busca) return;
    ev.preventDefault();
    busca.focus();
    busca.select();
    return;
  }

  if (tecla === 'n') {
    /* Cria o que faz sentido na tela em que se está. */
    const novo = {
      carteira: 'nova-obra',
      medicoes: 'nova-medicao',
      recebimentos: 'novo-recebimento',
      lancamentos: 'novo-lancamento',
      materiais: 'novo-material',
      contratos: 'novo-contrato',
      cronograma: 'nova-etapa',
      diario: 'novo-diario',
      clientes: 'novo-cliente',
      prestadores: 'novo-prestador',
    }[App.rota.view];
    if (!novo || !ACOES[novo]) return;
    if (document.getElementById('modal-camada').classList.contains('aberto')) return;
    ev.preventDefault();
    ACOES[novo](document.body, {});
  }
});

document.getElementById('modal-camada').addEventListener('mousedown', (ev) => {
  if (ev.target.id === 'modal-camada') fecharModal();
});

window.addEventListener('beforeunload', (ev) => {
  if (Store.pendente) {
    ev.preventDefault();
    ev.returnValue = '';
  }
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
      return telaConfigBanco(
        'Não consegui carregar a biblioteca do Supabase. Verifique a conexão com a internet.',
      );
    }
    if (r.estado === 'erro') {
      /* sessão guardada mas sem rede para renovar: segue para a entrada,
         que abre com o que está no aparelho */
      if (erroDeRede(r.mensagem) && SUPA.usuarioGuardado()) return entrarNoSistema();
      return telaConfigBanco('Erro ao conectar: ' + (r.mensagem || ''));
    }
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
    toast(
      'Gravação na nuvem indisponível neste acesso: os dados ficam neste navegador. Baixe um backup em Ajustes.',
      'aviso',
      8000,
    );
  }
  if (Store.modo === 'leitura') {
    toast('Acesso somente leitura: você pode consultar, mas não alterar.', 'aviso', 6000);
  }
}

iniciar();

/* Service worker (public/sw.js): o sistema abre sem rede no canteiro.
   Só em HTTPS publicado — em dev e dentro de artefato, não. */
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && location.protocol === 'https:' && !ehArtefato()) {
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('service worker não registrado', e));
}

export { tFiltro, restaurarRota, iniciar };
