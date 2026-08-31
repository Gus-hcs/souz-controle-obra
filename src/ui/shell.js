/**
 * shell.js — Casca da interface: navegação, componentes reutilizáveis e formulários.
 */
import { esc, fmtNum, norm, num } from '../nucleo/base.js';
import { alertasObra } from '../dominio/calculos.js';
import { Store } from '../dados/store.js';
import { SUPA } from '../dados/supabase.js';
import { VIEWS } from './telas-obra.js';
import { desenharGraficosPendentes } from '../graficos/index.js';
import marcaUrl from '../marca.png';

const ICO = {
  carteira: '<path d="M2 3h5v5H2zM9 3h5v5H9zM2 10h5v3H2zM9 10h5v3H9z"/>',
  painel: '<path d="M2 13V7l6-4.5L14 7v6a1 1 0 0 1-1 1h-3V9.5H6V14H3a1 1 0 0 1-1-1z"/>',
  contrato: '<path d="M3.5 1.5h6L13 5v9.5H3.5zM9 1.8V5h3.2"/><path d="M5.5 8h5M5.5 10.5h5"/>',
  medicao: '<path d="M1.5 6.5h13v4h-13z"/><path d="M4 6.5v2M6.5 6.5v3M9 6.5v2M11.5 6.5v3"/>',
  receb: '<path d="M1.5 4h13v8h-13z"/><circle cx="8" cy="8" r="2"/>',
  lanc: '<path d="M2.5 4.5h11l-1 8h-9zM5.5 4.5a2.5 2.5 0 0 1 5 0"/>',
  material: '<path d="M8 1.8 14 5v6l-6 3.2L2 11V5z"/><path d="M2 5l6 3 6-3M8 8v6.2"/>',
  crono: '<path d="M2 3.5h12v11H2z"/><path d="M2 6.5h12M5.5 1.8v3M10.5 1.8v3"/>',
  curva: '<path d="M2 13.5V2.5M2 13.5h12"/><path d="M3 12c2.5 0 3-7 5.5-7S12 3.5 13.5 3.5"/>',
  diario: '<path d="M3 2h9.5v12H3z"/><path d="M5.5 5h5M5.5 7.5h5M5.5 10h3"/>',
  fluxo: '<path d="M2 12.5h12M4 12.5V8M7 12.5V4.5M10 12.5V9.5M13 12.5V6"/>',
  alerta: '<path d="M8 2 15 13.5H1z"/><path d="M8 6.5v3.2M8 11.4v.1"/>',
  relatorio: '<path d="M3.5 1.5h6L13 5v9.5H3.5z"/><path d="M6 8.5h4M6 11h4"/>',
  auditoria: '<path d="M2.5 3h8M2.5 6h8M2.5 9h4"/><circle cx="10.5" cy="10.5" r="3"/><path d="M12.7 12.7 14.5 14.5"/>',
  admin: '<path d="M8 1.7 13.5 4v4c0 3.4-2.3 5.6-5.5 6.6C4.8 13.6 2.5 11.4 2.5 8V4z"/><path d="M5.7 8 7.4 9.7 10.4 6.4"/>',
  config: '<circle cx="8" cy="8" r="2.2"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4"/>',
  cadastro: '<circle cx="8" cy="5.5" r="2.5"/><path d="M2.5 14c0-3 2.5-4.5 5.5-4.5S13.5 11 13.5 14"/>',
  mais: '<path d="M8 3v10M3 8h10"/>',
  busca: '<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5 14 14"/>',
  menu: '<path d="M2 4h12M2 8h12M2 12h12"/>',
  x: '<path d="M4 4l8 8M12 4l-8 8"/>',
  baixar: '<path d="M8 2v8M4.5 7 8 10.5 11.5 7M2.5 13.5h11"/>',
  lapis: '<path d="M11 2.5 13.5 5 5.5 13H3v-2.5z"/>',
  lixo: '<path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 10h6.6L12 4"/>',
  seta: '<path d="M6 3l5 5-5 5"/>',
  empresa: '<path d="M2.5 14V4l5.5-2.5V14M8 14V6.5l5.5 2V14"/><path d="M1 14h14"/>'
};

const svg = (d, tam = 16) =>
  `<svg class="ic" width="${tam}" height="${tam}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

/* Marca do sistema — dois cubos isométricos (Logo.jpeg, fundo recortado).
   Usada no rail e na tela de acesso. */
const LOGO = `<img class="marca-img" src="${marcaUrl}" alt="SouZ" draggable="false">`;

const MENU = [
  { grupo: 'Carteira', itens: [
    { v: 'carteira', t: 'Visão geral', i: 'carteira' },
    { v: 'clientes', t: 'Clientes', i: 'cadastro' },
    { v: 'prestadores', t: 'Prestadores', i: 'empresa' }
  ] },
  { grupo: 'Obra', itens: [
    { v: 'painel', t: 'Painel', i: 'painel' },
    { v: 'contratos', t: 'Contratos e aditivos', i: 'contrato' },
    { v: 'medicoes', t: 'Medições', i: 'medicao' },
    { v: 'recebimentos', t: 'Recebimentos', i: 'receb' },
    { v: 'lancamentos', t: 'Lançamentos', i: 'lanc' },
    { v: 'materiais', t: 'Plano de materiais', i: 'material' },
    { v: 'cronograma', t: 'Cronograma', i: 'crono' },
    { v: 'curva', t: 'Curva S', i: 'curva' },
    { v: 'diario', t: 'Diário de obra', i: 'diario' },
    { v: 'fluxo', t: 'Fluxo de caixa', i: 'fluxo' },
    { v: 'alertas', t: 'Alertas', i: 'alerta' },
    { v: 'relatorio', t: 'Relatórios', i: 'relatorio' },
    { v: 'auditoria', t: 'Trilha de auditoria', i: 'auditoria' },
    { v: 'obra-config', t: 'Configuração', i: 'config' }
  ] },
  { grupo: 'Sistema', itens: [
    { v: 'ajustes', t: 'Ajustes e dados', i: 'config' }
  ] },
  { grupo: 'Administração', soAdmin: true, itens: [
    { v: 'admin', t: 'Clientes e acessos', i: 'admin' }
  ] }
];

const TITULOS = {
  carteira: ['Carteira de obras', 'Visão consolidada de todas as obras'],
  clientes: ['Clientes', 'Cadastro e obras vinculadas'],
  prestadores: ['Prestadores', 'Empreiteiros e fornecedores de serviço'],
  painel: ['Painel da obra', 'Indicadores financeiros e de produção'],
  contratos: ['Contratos e aditivos', 'Empreitada principal, prestadores e aditivos'],
  medicoes: ['Medições', 'Medições de prestadores e pagamentos'],
  recebimentos: ['Recebimentos', 'Entradas por medição, cliente e financiamento'],
  lancamentos: ['Lançamentos', 'Compras, taxas e demais saídas'],
  materiais: ['Plano de materiais', 'O que comprar, quando e quanto falta'],
  cronograma: ['Cronograma da obra', 'Etapas, prazos e progresso real'],
  curva: ['Curva S', 'Avanço físico x financeiro'],
  diario: ['Diário de obra', 'Registro de visitas, ocorrências e fotos'],
  fluxo: ['Fluxo de caixa', 'Entradas e saídas mês a mês'],
  alertas: ['Alertas', 'Pendências que exigem ação'],
  relatorio: ['Relatórios', 'Documentos para cliente, financiador e arquivo'],
  auditoria: ['Trilha de auditoria', 'Quem alterou cada valor financeiro e quando'],
  'obra-config': ['Configuração da obra', 'Identificação, financiamento e contrato'],
  ajustes: ['Ajustes e dados', 'Empresa, listas, backup e importação'],
  admin: ['Administração', 'Consumo por cliente e liberação de acesso por aba']
};

const VIEWS_OBRA = new Set(MENU[1].itens.map((i) => i.v));

/* ========================================================== App shell */
const App = {
  rota: { view: 'carteira', obraId: '' },
  filtros: {},
  foco: null,

  obra() {
    return Store.estado.obras.find((o) => o.id === this.rota.obraId) || null;
  },

  ir(view, obraId) {
    if (obraId !== undefined) this.rota.obraId = obraId;
    if (view === 'admin' && !SUPA.ehAdmin) { toast('Acesso restrito.', 'aviso'); view = 'carteira'; }
    if (!SUPA.abaLiberada(view)) { toast('Este acesso não está liberado para a sua conta.', 'aviso'); view = 'carteira'; }
    if (VIEWS_OBRA.has(view) && !this.obra()) {
      const primeira = Store.estado.obras[0];
      if (!primeira) { toast('Cadastre uma obra primeiro.', 'aviso'); view = 'carteira'; }
      else this.rota.obraId = primeira.id;
    }
    this.rota.view = view;
    this.filtros = {};
    document.body.classList.remove('menu-aberto');
    try { sessionStorage.setItem('souz_rota', JSON.stringify(this.rota)); } catch (e) {}
    window.scrollTo(0, 0);
    this.render();
  },

  render() {
    this.renderRail();
    this.renderTopo();
    this.renderConteudo();
  },

  renderRail() {
    const obras = Store.estado.obras;
    const obra = this.obra();
    const alertas = obra ? alertasObra(obra) : [];
    const criticos = alertas.filter((a) => a.sev === 3).length;

    const opcoes = obras.length
      ? obras.map((o) => `<option value="${o.id}" ${o.id === this.rota.obraId ? 'selected' : ''}>${esc(o.nome)}</option>`).join('')
      : '<option value="">Nenhuma obra cadastrada</option>';

    const nav = MENU.map((g) => {
      if (g.grupo === 'Obra' && !obras.length) return '';
      if (g.soAdmin && !SUPA.ehAdmin) return '';
      const itens = g.itens.filter((it) => SUPA.abaLiberada(it.v)).map((it) => {
        const ativo = this.rota.view === it.v ? ' aria-current="page"' : '';
        let cont = '';
        if (it.v === 'alertas' && alertas.length) {
          cont = `<span class="cont ${criticos ? 'crit' : ''}">${alertas.length}</span>`;
        }
        if (it.v === 'carteira' && obras.length) cont = `<span class="cont">${obras.length}</span>`;
        return `<button data-acao="ir" data-view="${it.v}"${ativo}>${svg(ICO[it.i])}<span>${it.t}</span>${cont}</button>`;
      }).join('');
      if (!itens) return '';
      return `<div class="grupo">${g.grupo}</div>${itens}`;
    }).join('');

    document.getElementById('rail').innerHTML = `
      <div class="rail-marca">
        <span class="marca-mark">${LOGO}</span>
        <div><b>SouZ</b><span>Controle de obra</span></div>
      </div>
      <div class="rail-obra">
        <span class="rotulo">Obra ativa</span>
        <select data-acao="trocar-obra" aria-label="Selecionar obra">${opcoes}</select>
      </div>
      <nav class="rail-nav">${nav}</nav>`;
  },

  renderTopo() {
    const [t, sub] = TITULOS[this.rota.view] || ['', ''];
    const obra = this.obra();
    const st = Store.descricaoStatus();
    const legenda = VIEWS_OBRA.has(this.rota.view) && obra
      ? `${esc(obra.nome)}${obra.cidade ? ' · ' + esc(obra.cidade) : ''}`
      : sub;
    document.getElementById('topo').innerHTML = `
      <button class="btn sutil menu-mob" data-acao="menu" aria-label="Abrir menu">${svg(ICO.menu)}</button>
      <div class="titulo"><b>${t}</b><span>${legenda}</span></div>
      <div class="dir">
        <span class="status-salvo ${st.tom}" title="${esc(Store.ultimoErro || '')}"><span class="pt"></span>${st.texto}</span>
        ${Store.backend === 'supabase' && SUPA.usuario ? `
          <span class="usuario" title="${esc(SUPA.usuario.email || '')}">${esc((SUPA.usuario.email || '').split('@')[0])}</span>
          <button class="btn sutil" data-acao="auth-sair" title="Sair do sistema" aria-label="Sair">Sair</button>` : ''}
        <button class="btn sutil" data-acao="tema" aria-label="Alternar tema claro/escuro" title="Alternar tema">◐</button>
      </div>`;
  },

  renderConteudo() {
    const alvo = document.getElementById('conteudo');
    document.body.dataset.view = this.rota.view;
    const fn = VIEWS[this.rota.view];
    try {
      alvo.innerHTML = fn ? fn() : '<div class="vazio">Tela não encontrada.</div>';
    } catch (e) {
      console.error(e);
      alvo.innerHTML = `<div class="cartao"><div class="corpo"><h3>Erro ao montar a tela</h3>
        <p class="mono" style="color:var(--critico)">${esc(e.message)}</p></div></div>`;
    }
    if (this.foco) {
      const el = document.getElementById(this.foco.id);
      if (el) {
        el.focus();
        if (el.setSelectionRange && this.foco.pos != null) {
          try { el.setSelectionRange(this.foco.pos, this.foco.pos); } catch (e) {}
        }
      }
      this.foco = null;
    }
    prepararTabelas(alvo);
    desenharGraficosPendentes();
  }
};

/* Pós-processa as tabelas depois de cada render:
   - carimba cada <td> com o rótulo da coluna (usado no layout de celular,
     em que a linha vira cartão);
   - torna o cabeçalho clicável para ordenar, mantendo a escolha entre renders. */
const ordenacao = new Map();   // assinatura da tabela -> { col, dir }

function prepararTabelas(raiz) {
  raiz.querySelectorAll('table.tab').forEach((tab) => {
    const ths = [...tab.querySelectorAll('thead th')];
    if (!ths.length) return;
    const rotulos = ths.map((th) => th.textContent.trim());
    const numerica = ths.map((th) => th.classList.contains('num'));

    tab.querySelectorAll('tbody tr').forEach((tr) => {
      [...tr.children].forEach((td, i) => {
        if (rotulos[i] && !td.classList.contains('acoes')) td.setAttribute('data-rotulo', rotulos[i]);
        if (numerica[i]) td.classList.add('num');
      });
    });

    const corpo = tab.querySelector('tbody');
    if (!corpo || corpo.children.length < 2) return;
    const assinatura = rotulos.join('|');

    ths.forEach((th, i) => {
      if (!rotulos[i] || th.classList.contains('acoes')) return;
      th.classList.add('ord');
      th.addEventListener('click', () => {
        const atual = ordenacao.get(assinatura);
        const dir = atual && atual.col === i ? -atual.dir : 1;
        ordenacao.set(assinatura, { col: i, dir });
        aplicarOrdenacao(tab, i, dir, numerica[i]);
      });
    });

    const guardada = ordenacao.get(assinatura);
    if (guardada) aplicarOrdenacao(tab, guardada.col, guardada.dir, numerica[guardada.col]);
  });
}

function valorCelula(td, numerico) {
  const t = (td.textContent || '').replace(/−/g, '-').trim();
  if (numerico || /^-?[R$\s]*[\d.,]+\s*%?$/.test(t)) {
    const n = num(t);
    return { n: isNaN(n) ? 0 : n, t: '' };
  }
  return { n: null, t: t.toLowerCase() };
}

function aplicarOrdenacao(tab, col, dir, numerico) {
  const corpo = tab.querySelector('tbody');
  const linhas = [...corpo.querySelectorAll('tr')].filter((tr) => tr.children.length > col);
  linhas.sort((a, b) => {
    const va = valorCelula(a.children[col], numerico);
    const vb = valorCelula(b.children[col], numerico);
    if (va.n !== null && vb.n !== null) return (va.n - vb.n) * dir;
    return va.t.localeCompare(vb.t, 'pt') * dir;
  });
  linhas.forEach((tr) => corpo.appendChild(tr));
  tab.querySelectorAll('thead th').forEach((th, i) => {
    th.dataset.ord = i === col ? (dir === 1 ? 'asc' : 'desc') : '';
  });
}

/* ======================================================== componentes */

function toast(msg, tom = 'ok', ms = 3600) {
  const cx = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = 'toast ' + tom;
  el.textContent = msg;
  cx.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

/* kpi(rotulo, valor, sub, opts)
   opts: string de tom ('ok'|'aviso'|'critico') OU
         { tom, visual (svg de sparkline/anel), destaque (true = card grande) } */
function kpi(rotulo, valor, sub, opts = '') {
  const o = typeof opts === 'string' ? { tom: opts } : (opts || {});
  return `<div class="kpi ${o.tom || ''}${o.visual ? ' com-visual' : ''}${o.destaque ? ' destaque' : ''}">
    <span class="faixa"></span>
    <div class="kpi-txt">
      <span class="rotulo">${rotulo}</span>
      <span class="valor">${valor}</span>
      ${sub ? `<span class="sub">${sub}</span>` : ''}
    </div>
    ${o.visual ? `<div class="kpi-vis">${o.visual}</div>` : ''}
  </div>`;
}

/* mini-gráfico de linha (tendência). tom: 'marca'|'ok'|'aviso'|'critico' */
function sparkline(valores, tom = 'marca') {
  const v = (valores || []).map((x) => (isFinite(+x) ? +x : 0));
  if (v.length < 2) return '';
  const min = Math.min(...v), max = Math.max(...v), rng = (max - min) || 1;
  const W = 104, H = 36;
  const pts = v.map((y, i) => [(i / (v.length - 1)) * W, H - 3 - ((y - min) / rng) * (H - 6)]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const cor = `var(--${tom})`;
  const [ex, ey] = pts[pts.length - 1];
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
    <path d="${d} L ${W} ${H} L 0 ${H} Z" fill="${cor}" opacity=".09"/>
    <path d="${d}" fill="none" stroke="${cor}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="2.4" fill="${cor}" vector-effect="non-scaling-stroke"/>
  </svg>`;
}

/* anel de progresso com rótulo central */
function anel(frac, tom = 'marca', centro = '') {
  const f = Math.max(0, Math.min(1, isFinite(+frac) ? +frac : 0));
  const r = 15.5, c = 2 * Math.PI * r;
  return `<svg class="anel" viewBox="0 0 40 40" aria-hidden="true">
    <circle cx="20" cy="20" r="${r}" fill="none" stroke="var(--sup3)" stroke-width="4"/>
    <circle cx="20" cy="20" r="${r}" fill="none" stroke="var(--${tom})" stroke-width="4" stroke-linecap="round"
      stroke-dasharray="${(f * c).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 20 20)"/>
    <text x="20" y="23.5" text-anchor="middle" class="anel-t">${esc(centro || Math.round(f * 100) + '%')}</text>
  </svg>`;
}

function chip(texto, tom = '') {
  return `<span class="chip ${tom}"><span class="pt"></span>${esc(texto)}</span>`;
}

function barra(v, tom = '') {
  const p = Math.max(0, Math.min(1, num(v))) * 100;
  return `<div class="barra ${tom}"><i style="width:${p.toFixed(1)}%"></i></div>`;
}

function vazio(titulo, texto, botao) {
  return `<div class="vazio"><h4>${esc(titulo)}</h4><p>${esc(texto)}</p>${botao || ''}</div>`;
}

function cartao(titulo, corpo, opcoes = {}) {
  const { acoes = '', semPadding = false, sub = '' } = opcoes;
  return `<section class="cartao">
    ${titulo ? `<header><h3>${titulo}</h3>${sub ? `<span class="sub" style="font-size:12px;color:var(--mudo)">${sub}</span>` : ''}<div class="dir">${acoes}</div></header>` : ''}
    <div class="${semPadding ? '' : 'corpo'}">${corpo}</div>
  </section>`;
}

function botao(texto, acao, dados = {}, classe = 'btn', icone = '') {
  const attrs = Object.entries(dados).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ');
  return `<button class="${classe}" data-acao="${acao}" ${attrs}>${icone ? svg(ICO[icone], 14) : ''}${texto}</button>`;
}

function acoesLinha(tipo, id) {
  if (Store.somenteLeitura()) return '';
  return `<button class="btn sutil pequeno" data-acao="editar-${tipo}" data-id="${id}" title="Editar" aria-label="Editar">${svg(ICO.lapis, 13)}</button>
          <button class="btn sutil pequeno" data-acao="excluir-${tipo}" data-id="${id}" title="Excluir" aria-label="Excluir">${svg(ICO.lixo, 13)}</button>`;
}

/* ------------------------------------------------------------- modal */
let modalAoSalvar = null;
let modalValidar = null;

function fecharModal() {
  document.getElementById('modal-camada').classList.remove('aberto');
  document.getElementById('modal-camada').innerHTML = '';
  modalAoSalvar = null;
  modalValidar = null;
}

/* Mostra os problemas de validação no topo do formulário e marca os campos.
   Devolve a quantidade de problemas que bloqueiam a gravação ('erro'). */
function mostrarAvisosForm(problemas) {
  const form = document.querySelector('#modal-camada [data-form]');
  if (!form) return 0;
  form.querySelectorAll('.campo.invalido').forEach((c) => c.classList.remove('invalido'));
  const cx = form.parentElement;
  let caixa = cx.querySelector('.form-avisos');
  if (caixa) caixa.remove();
  if (!problemas || !problemas.length) return 0;

  caixa = document.createElement('div');
  caixa.className = 'form-avisos';
  caixa.innerHTML = problemas
    .map((p) => `<div class="linha ${p.sev === 'alerta' ? 'alerta' : 'erro'}">${esc(p.mensagem)}</div>`)
    .join('');
  cx.insertBefore(caixa, form);

  problemas.forEach((p) => {
    const el = form.querySelector(`[data-campo="${p.campo}"]`);
    if (el && el.closest('.campo')) el.closest('.campo').classList.add('invalido');
  });
  return problemas.filter((p) => p.sev !== 'alerta').length;
}

function abrirModal({ titulo, corpo, rodape, largura = '' }) {
  const camada = document.getElementById('modal-camada');
  camada.innerHTML = `<div class="modal ${largura}" role="dialog" aria-modal="true" aria-label="${esc(titulo)}">
    <header><h3>${esc(titulo)}</h3>
      <button class="btn sutil fechar" data-acao="fechar-modal" aria-label="Fechar">${svg(ICO.x, 14)}</button>
    </header>
    <div class="corpo">${corpo}</div>
    ${rodape ? `<footer>${rodape}</footer>` : ''}
  </div>`;
  camada.classList.add('aberto');
  const primeiro = camada.querySelector('input, select, textarea');
  if (primeiro) setTimeout(() => primeiro.focus(), 30);
}

function confirmar(titulo, texto, aoConfirmar, rotulo = 'Excluir') {
  abrirModal({
    titulo, largura: 'estreito',
    corpo: `<p style="margin:0">${esc(texto)}</p>`,
    rodape: `<button class="btn" data-acao="fechar-modal">Cancelar</button>
             <button class="btn perigo" data-acao="confirmar-ok">${esc(rotulo)}</button>`
  });
  modalAoSalvar = aoConfirmar;
}

/* --------------------------------------------------- formulário genérico
   campos: { k, label, tipo, col, opcoes, dica, secao, ro, placeholder }
   tipos: texto | numero | dinheiro | pct | data | select | area | check | lista
*/
function campoHTML(c, valores) {
  const v = valores[c.k];
  const id = 'f_' + c.k;
  const col = 'c' + (c.col || 6);
  let campo = '';
  const req = c.obrigatorio ? 'required' : '';
  switch (c.tipo) {
    case 'numero':
      campo = `<input type="text" inputmode="decimal" id="${id}" data-campo="${c.k}" data-tipo="numero" value="${v || v === 0 ? esc(fmtNum(v, c.dec ?? 2)) : ''}" ${req}>`;
      break;
    case 'dinheiro':
      campo = `<input type="text" inputmode="decimal" id="${id}" data-campo="${c.k}" data-tipo="dinheiro" value="${v || v === 0 ? esc(fmtNum(v, 2)) : ''}" ${req}>`;
      break;
    case 'pct':
      campo = `<input type="text" inputmode="decimal" id="${id}" data-campo="${c.k}" data-tipo="pct" value="${v || v === 0 ? esc(fmtNum(num(v) * 100, c.dec ?? 0)) : ''}" ${req}>`;
      break;
    case 'data':
      campo = `<input type="date" id="${id}" data-campo="${c.k}" data-tipo="data" value="${esc(v || '')}" ${req}>`;
      break;
    case 'select':
      campo = `<select id="${id}" data-campo="${c.k}" data-tipo="texto" ${req}>
        ${(c.vazio !== false) ? `<option value="">${esc(c.placeholder || '—')}</option>` : ''}
        ${(c.opcoes || []).map((o) => {
          const val = typeof o === 'object' ? o.v : o;
          const txt = typeof o === 'object' ? o.t : o;
          return `<option value="${esc(val)}" ${String(val) === String(v ?? '') ? 'selected' : ''}>${esc(txt)}</option>`;
        }).join('')}</select>`;
      break;
    case 'area':
      campo = `<textarea id="${id}" data-campo="${c.k}" data-tipo="texto" rows="${c.linhas || 3}">${esc(v || '')}</textarea>`;
      break;
    case 'check':
      campo = `<select id="${id}" data-campo="${c.k}" data-tipo="texto">
        <option value="Não" ${v === 'Não' ? 'selected' : ''}>Não</option>
        <option value="Sim" ${v === 'Sim' ? 'selected' : ''}>Sim</option></select>`;
      break;
    case 'lista':
      campo = `<input type="text" id="${id}" data-campo="${c.k}" data-tipo="texto" list="dl_${c.k}" value="${esc(v || '')}" ${req}>
        <datalist id="dl_${c.k}">${(c.opcoes || []).map((o) => `<option value="${esc(o)}"></option>`).join('')}</datalist>`;
      break;
    case 'calc':
      campo = `<div class="calc" data-calc="${c.k}">—</div>`;
      break;
    default:
      campo = `<input type="text" id="${id}" data-campo="${c.k}" data-tipo="texto" value="${esc(v ?? '')}" placeholder="${esc(c.placeholder || '')}" ${req}>`;
  }
  return `<div class="campo ${col}">
    <label for="${id}">${esc(c.label)}</label>
    ${campo}
    ${c.dica ? `<span class="dica">${esc(c.dica)}</span>` : ''}
  </div>`;
}

function abrirForm({ titulo, campos, valores = {}, aoSalvar, largura = '', calcular, validar, rodapeExtra = '' }) {
  const grupos = [];
  campos.forEach((c) => {
    if (c.secao) { grupos.push(`<div class="secao-form"><span class="rotulo">${esc(c.secao)}</span></div>`); }
    grupos.push(campoHTML(c, valores));
  });
  abrirModal({
    titulo, largura,
    corpo: `<form class="form-grade" data-form="1" onsubmit="return false">${grupos.join('')}</form>`,
    rodape: `<span class="esq">${rodapeExtra}</span>
             <button class="btn" data-acao="fechar-modal">Cancelar</button>
             <button class="btn primario" data-acao="salvar-form">Salvar</button>`
  });
  modalAoSalvar = (dados) => aoSalvar(dados);
  modalValidar = validar || null;
  window.__calcForm = calcular || null;
  if (calcular) rodarCalcForm();
}

function lerForm() {
  const f = document.querySelector('#modal-camada [data-form]') || document.querySelector('[data-form]');
  const out = {};
  if (!f) return out;
  f.querySelectorAll('[data-campo]').forEach((el) => {
    const k = el.dataset.campo;
    const t = el.dataset.tipo;
    if (t === 'numero' || t === 'dinheiro') out[k] = num(el.value);
    else if (t === 'pct') out[k] = num(el.value) / 100;
    else out[k] = el.value.trim ? el.value.trim() : el.value;
  });
  return out;
}

function rodarCalcForm() {
  if (!window.__calcForm) return;
  const dados = lerForm();
  const res = window.__calcForm(dados) || {};
  Object.entries(res).forEach(([k, v]) => {
    const el = document.querySelector(`[data-calc="${k}"]`);
    if (el) el.innerHTML = v;
  });
}

/* -------------------------------------------------------- utilitários */
const opcoesEtapas = () => Store.estado.listas.etapas;
const opcoesLista = (k) => Store.estado.listas[k] || [];

function nomeCliente(id) {
  const c = Store.estado.clientes.find((x) => x.id === id);
  return c ? c.nome : '';
}

function tomStatus(status) {
  const s = norm(status);
  if (['pago', 'recebido', 'concluído', 'concluida', 'concluído', 'comprado', 'aprovado'].includes(s)) return 'ok';
  if (['cancelado', 'suspenso'].includes(s)) return '';
  if (['em aberto', 'previsto', 'planejar', 'planejado', 'solicitado'].includes(s)) return 'aviso';
  if (['parcial', 'comprado parcial', 'recebido parcial', 'em andamento', 'comprar'].includes(s)) return 'marca';
  return '';
}

function tomSituacao(sit) {
  if (sit === 'ATRASADO') return 'critico';
  if (sit === 'CONCLUÍDO') return 'ok';
  if (sit === 'EM ANDAMENTO') return 'marca';
  return '';
}

/* filtro textual genérico */
function filtraTexto(itens, termo, campos) {
  const t = norm(termo);
  if (!t) return itens;
  return itens.filter((i) => campos.some((c) => norm(i[c]).includes(t)));
}

function campoBusca(id, placeholder) {
  const v = App.filtros[id] || '';
  return `<span class="campo-busca">${svg(ICO.busca, 14)}
    <input type="text" id="flt_${id}" data-filtro="${id}" value="${esc(v)}" placeholder="${esc(placeholder)}">
  </span>`;
}

function selectFiltro(id, opcoes, rotulo) {
  const v = App.filtros[id] || '';
  return `<select data-filtro="${id}" aria-label="${esc(rotulo)}">
    <option value="">${esc(rotulo)}</option>
    ${opcoes.map((o) => `<option value="${esc(o)}" ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}
  </select>`;
}

export {
  ICO,
  svg,
  LOGO,
  MENU,
  TITULOS,
  VIEWS_OBRA,
  App,
  toast,
  kpi,
  sparkline,
  anel,
  chip,
  barra,
  vazio,
  cartao,
  botao,
  acoesLinha,
  modalAoSalvar,
  modalValidar,
  mostrarAvisosForm,
  fecharModal,
  abrirModal,
  confirmar,
  campoHTML,
  abrirForm,
  lerForm,
  rodarCalcForm,
  opcoesEtapas,
  opcoesLista,
  nomeCliente,
  tomStatus,
  tomSituacao,
  filtraTexto,
  campoBusca,
  selectFiltro
};
