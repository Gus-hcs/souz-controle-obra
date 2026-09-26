/**
 * telas/componentes.js — Peças que as telas compartilham.
 *
 * Toda tela tem a mesma anatomia: faixa de KPIs (faixaKpis), filtros em
 * pílula que só aparecem quando há o que filtrar (barraFiltros), uma lista
 * ordenável com total no rodapé (lista) e, no fim, o painel de análise em
 * duas colunas (painelAnalise). Isto é essa anatomia uma vez só, para que
 * a quinta tela não seja a quinta variação dela.
 *
 * Nada aqui calcula regra de negócio: recebe os números prontos.
 */
import { esc, fmtMoney, fmtNum } from '../../nucleo/base.js';
import { Store } from '../../dados/store.js';
import { ACOES } from '../acoes.js';
import { App, ICO, botao, svg } from '../shell.js';

/* Vermelho só no negativo: é o único caso em que a cor diz algo que o
   próprio número não diz de imediato. */
function dinheiro(v, { cinzaNoZero = false, dec = 2 } = {}) {
  const t = fmtMoney(v, { dec });
  if (v < -0.005) return `<span class="atraso">${t}</span>`;
  if (cinzaNoZero && Math.abs(v) < 0.005) return '<span class="tinta3">—</span>';
  return t;
}

/* ---------------------------------------------------------- faixa de KPIs
   O KpiStrip: a mesma faixa em todas as telas. Cards de largura e altura
   iguais, na largura toda do conteúdo; rótulo → valor → contexto, e cor no
   valor só quando ela diz algo (atraso, alerta).

   itens: [{ chave, rotulo, valor, contexto, dica, tom, filtra }]
     valor e contexto são HTML (já escapado); o contexto corta em duas
     linhas e o texto inteiro vai para o tooltip (ou `dica`, se vier).
   opts: { rotulo (aria-label), acao (data-acao dos cards que filtram),
           ativo (chave do card ligado) }
   Um card só é botão quando filtra a tela: `acao` definida e `filtra`
   diferente de false. O resto é texto, sem hover. */
const semTags = (html) =>
  String(html ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

function faixaKpis(itens, { rotulo = 'Indicadores', acao = '', ativo = '' } = {}) {
  const lista = itens.filter(Boolean);
  const cards = lista
    .map((it) => {
      const clicavel = !!acao && it.filtra !== false;
      const ligado = clicavel && ativo && ativo === it.chave;
      const dica = it.dica ? esc(it.dica) : semTags(it.contexto);
      const miolo = `<span class="kpi-rot">${esc(it.rotulo)}</span>
        <span class="kpi-val${it.tom ? ' ' + it.tom : ''}">${it.valor}</span>
        <span class="kpi-ctx"${dica ? ` title="${dica}"` : ''}>${it.contexto ?? ''}</span>`;
      return clicavel
        ? `<button type="button" class="kpi-item clicavel${ligado ? ' ativo' : ''}" data-acao="${esc(acao)}"
            data-kpi="${esc(it.chave)}" aria-pressed="${ligado}">${miolo}</button>`
        : `<div class="kpi-item">${miolo}</div>`;
    })
    .join('');
  return `<div class="kpis-cx"><div class="kpis" role="group" aria-label="${esc(rotulo)}"
    data-n="${lista.length}" style="--n:${lista.length}">${cards}</div></div>`;
}

/* ------------------------------------------------------- painel de análise
   O fim das telas: blocos de análise em duas colunas (uma no celular e no
   tablet), cada um com título e a mesma altura do vizinho. Barra nunca
   estica na largura da tela inteira: vai até a borda do próprio bloco.
   blocos: [{ titulo, nota, conteudo }] — bloco sem conteúdo não entra. */
function painelAnalise(blocos, { titulo = '' } = {}) {
  const b = blocos.filter((x) => x && x.conteudo);
  if (!b.length) return '';
  return `<section class="painel-analise${b.length === 1 ? ' um' : ''}"${titulo ? ` aria-label="${esc(titulo)}"` : ''}>
    ${b
      .map(
        (x) => `<div class="analise-bloco">
          <div class="analise-cab"><h2>${esc(x.titulo)}</h2>${x.nota ? `<span class="tinta3">${esc(x.nota)}</span>` : ''}</div>
          <div class="analise-corpo">${x.conteudo}</div>
        </div>`,
      )
      .join('')}
  </section>`;
}

/* ------------------------------------------------------------- filtros
   Um padrão só em todas as telas de lista: pílulas rápidas, com a
   contagem, para o recorte que muda o que é urgente ver; e o menu "Mais
   filtros" para o resto (etapa, fornecedor, mês…). Nenhum <select> nativo.

   pilulas: { chave, todos: 'Todos', total, opcoes: [{ valor, rotulo, n }] }
     — `n` zero some, a não ser que a pílula esteja ligada;
   mais: [{ chave, rotulo, todos, opcoes: [['valor', 'Texto', n?] | 'valor'] }]
     — grupo com uma opção só não aparece (não há o que escolher);
   filtrados, total: para "3 de 12" e "Limpar filtros".
   Os valores vão para App.filtros[chave], como antes. */
const normOpcao = (o) => (Array.isArray(o) ? o : [o, o]);

function barraFiltros({ pilulas, mais = [], filtrados, total, extra = '' }) {
  const f = App.filtros;
  const grupos = mais.filter((g) => g && g.opcoes && (g.opcoes.length > 1 || f[g.chave]));
  const temPilulas = pilulas && pilulas.opcoes.some((p) => p.n > 0 || f[pilulas.chave] === p.valor);
  if (!temPilulas && !grupos.length && !extra) return '';

  const pil = (valor, rotulo, n) => {
    const ligada = (f[pilulas.chave] || '') === valor;
    return `<button type="button" class="pilula${ligada ? ' ativa' : ''}" data-acao="filtro-pilula"
      data-chave="${esc(pilulas.chave)}" data-valor="${esc(valor)}" aria-pressed="${ligada}">
      ${esc(rotulo)}${n === undefined ? '' : ` <span class="conta">${n}</span>`}</button>`;
  };
  const htmlPilulas = temPilulas
    ? pil('', pilulas.todos || 'Todos', pilulas.total) +
      pilulas.opcoes
        .filter((p) => p.n > 0 || f[pilulas.chave] === p.valor)
        .map((p) => pil(p.valor, p.rotulo, p.n))
        .join('')
    : '';

  /* os filtros do menu que estão ligados aparecem como etiqueta com ×:
     dá para ver e tirar sem abrir o menu de novo */
  const ligados = grupos.filter((g) => f[g.chave]);
  const etiquetas = ligados
    .map((g) => {
      const op = g.opcoes.map(normOpcao).find(([v]) => String(v) === String(f[g.chave]));
      const txt = op ? op[1] : f[g.chave];
      return `<button type="button" class="etiqueta-filtro" data-acao="filtro-tirar" data-chave="${esc(g.chave)}"
        aria-label="Tirar o filtro ${esc(g.rotulo)}: ${esc(txt)}" title="Tirar este filtro">
        <span class="tinta2">${esc(g.rotulo)}:</span> ${esc(txt)} <span aria-hidden="true">×</span></button>`;
    })
    .join('');

  if (grupos.length) filtrosMenu.set(App.rota.view, grupos);
  const botaoMais = grupos.length
    ? `<button type="button" class="pilula mais-filtros${ligados.length ? ' ativa' : ''}" data-acao="filtro-mais"
        aria-haspopup="menu">Mais filtros${ligados.length ? ` <span class="conta">${ligados.length}</span>` : ''} ${svg(ICO.seta, 10)}</button>`
    : '';

  const filtrando = filtrados !== total;
  return `<div class="filtro-barra nao-imprime">
    ${htmlPilulas}${botaoMais}${etiquetas}${extra}
    ${filtrando ? `<span class="tinta2 filtro-conta">${filtrados} de ${total}</span>` : ''}
    ${filtrando ? `<button type="button" class="btn sutil pequeno" data-acao="lista-limpar-filtros">Limpar filtros</button>` : ''}
  </div>`;
}

/* grupos do menu "Mais filtros" da tela aberta, guardados no desenho */
const filtrosMenu = new Map();

ACOES['filtro-pilula'] = (el, d) => {
  App.filtros[d.chave] = !d.valor || App.filtros[d.chave] === d.valor ? '' : d.valor;
  App.renderConteudo();
};
ACOES['filtro-tirar'] = (el, d) => {
  App.filtros[d.chave] = '';
  App.renderConteudo();
};
ACOES['filtro-mais'] = (el) => {
  /* clicar de novo no botão fecha o menu que ele abriu */
  if (document.querySelector('.menu-filtros')) return fecharMenu();
  const grupos = filtrosMenu.get(App.rota.view) || [];
  const f = App.filtros;
  const html = grupos
    .map((g, i) => {
      const itens = [['', g.todos || 'Todos'], ...g.opcoes.map(normOpcao)]
        .map(([v, t, n]) => {
          const marcado = String(f[g.chave] || '') === String(v);
          return `<button role="menuitemradio" aria-checked="${marcado}" data-acao="filtro-escolher"
            data-chave="${esc(g.chave)}" data-valor="${esc(v)}"><span>${esc(t)}</span>${
              n === undefined ? '' : `<span class="conta">${n}</span>`
            }</button>`;
        })
        .join('');
      return `${i ? '<hr>' : ''}<div class="menu-grupo" role="presentation">${esc(g.rotulo)}</div>${itens}`;
    })
    .join('');
  abrirMenu(el, html, 'menu-filtros');
};
ACOES['filtro-escolher'] = (el, d) => {
  App.filtros[d.chave] = d.valor || '';
  App.renderConteudo();
};

/* ------------------------------------------------------ menu flutuante
   Um menu por vez, preso ao botão que o abriu; fecha com clique fora,
   com Esc ou depois de escolher. */
function fecharMenu() {
  const m = document.querySelector('.menu-flutuante');
  if (m) m.remove();
}

function abrirMenu(el, html, classe = '') {
  fecharMenu();
  const menu = document.createElement('div');
  menu.className = `menu-ctx menu-flutuante${classe ? ' ' + classe : ''}`;
  menu.setAttribute('role', 'menu');
  menu.innerHTML = html;
  document.body.appendChild(menu);
  const r = el.getBoundingClientRect();
  const m = menu.getBoundingClientRect();
  menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - m.width - 8)) + 'px';
  const abaixo = r.bottom + 4;
  const cabeAbaixo = abaixo + m.height <= window.innerHeight - 8;
  menu.style.top = (cabeAbaixo ? abaixo : Math.max(8, r.top - m.height - 4)) + 'px';
  if (!cabeAbaixo && r.top - m.height - 4 < 8) {
    menu.style.maxHeight = window.innerHeight - 16 + 'px';
    menu.style.overflowY = 'auto';
  }
  const primeiro = menu.querySelector('[aria-checked="true"], a, button');
  if (primeiro) primeiro.focus();
}

if (typeof document !== 'undefined') {
  document.addEventListener('mousedown', (ev) => {
    if (!ev.target.closest('.menu-flutuante, [aria-haspopup="menu"]')) fecharMenu();
  });
  document.addEventListener(
    'click',
    (ev) => {
      if (ev.target.closest('.menu-flutuante a, .menu-flutuante button')) setTimeout(fecharMenu);
    },
    true,
  );
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && document.querySelector('.menu-flutuante')) {
      ev.stopPropagation();
      fecharMenu();
    }
  });
}

/** Algum filtro ativo? (a busca da toolbar conta) */
const filtrando = (chaves) => chaves.some((k) => App.filtros[k]);

/* ------------------------------------------------------------- toolbar */
function buscaToolbar(placeholder, testid) {
  return `<span class="busca">${svg(ICO.busca, 13)}
    <input type="search" id="flt_busca" data-filtro="busca" data-testid="${esc(testid)}"
      value="${esc(App.filtros.busca || '')}" placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}">
    <kbd>⌘K</kbd>
  </span>`;
}

function botaoNovo(rotulo, acao) {
  if (Store.somenteLeitura()) return '';
  return botao(`<span class="rotulo-btn">${esc(rotulo)}</span>`, acao, {}, 'btn primario', 'mais');
}

/* Editar e excluir, com rótulo que diz O QUÊ — "Editar" sozinho não serve
   para leitor de tela numa lista de 200 linhas iguais. */
function acoesRegistro(tipo, id, nome) {
  if (Store.somenteLeitura()) return '';
  const n = esc(nome || 'registro');
  return `<button class="btn sutil icone pequeno" data-acao="editar-${tipo}" data-id="${esc(id)}"
      title="Editar" aria-label="Editar ${n}">${svg(ICO.lapis, 13)}</button>
    <button class="btn sutil icone pequeno acao-excluir" data-acao="excluir-${tipo}" data-id="${esc(id)}"
      title="Excluir" aria-label="Excluir ${n}">${svg(ICO.lixo, 13)}</button>`;
}

/* --------------------------------------------------------------- lista
   Lista ordenável. A ordem é por DADO, não por texto de célula: cada coluna
   declara como se ordena (`valor`) e como se desenha (`celula`).

   colunas: [{ k, rotulo, largura, num, valor(item), celula(item),
               celular: 'principal'|'some', classe, total(itens) }]
*/
const ordens = new Map(); // id da lista -> { col, dir }

/* linhaAttrs(item): atributos extras da <tr> (ex.: data-acao para
   selecionar a linha e abrir o inspetor). tabelaClasse: classe a mais na
   <table>, para ajustes de uma tela só. */
/* grupos: { de(item) → chave, cabecalho(chave, itens) → html, ordem(a, b) }
   — agrupa as linhas (Lançamentos por mês): cada grupo com uma linha de
   cabeçalho recolhível; a ordem da coluna vale dentro do grupo. */
const recolhidos = new Set(); // `${lista}:${grupo}`

function lista({
  id,
  colunas,
  itens,
  ordemPadrao,
  testid,
  rodapeRotulo,
  linhaClasse,
  linhaAttrs,
  tabelaClasse,
  grupos,
}) {
  const ordem = ordens.get(id) || ordemPadrao || { col: colunas[0].k, dir: 1 };
  const col = colunas.find((c) => c.k === ordem.col && c.valor);
  const ordenados = col
    ? itens.slice().sort((a, b) => {
        const [va, vb] = [col.valor(a), col.valor(b)];
        const cmp =
          typeof va === 'number' && typeof vb === 'number'
            ? va - vb
            : String(va ?? '').localeCompare(String(vb ?? ''), 'pt');
        return cmp * ordem.dir;
      })
    : itens;

  const cab = colunas
    .map((c) => {
      if (!c.valor) {
        return `<th scope="col" class="${c.num ? 'num' : ''}">${c.rotulo ? esc(c.rotulo) : '<span class="sr">Ações</span>'}</th>`;
      }
      const ativa = ordem.col === c.k;
      return `<th scope="col" class="ord${c.num ? ' num' : ''}" data-acao="lista-ordenar"
        data-lista="${esc(id)}" data-col="${esc(c.k)}" data-num="${c.num ? 1 : 0}"
        ${ativa ? `data-ord="${ordem.dir === 1 ? 'asc' : 'desc'}"` : ''}
        aria-sort="${ativa ? (ordem.dir === 1 ? 'ascending' : 'descending') : 'none'}">${esc(c.rotulo)}</th>`;
    })
    .join('');

  const classeTd = (c) =>
    [
      c.num ? 'num' : '',
      c.celular === 'principal' ? 'principal-celular' : '',
      c.celular === 'some' ? 'some-no-celular' : '',
      c.k === 'acoes' ? 'acoes-linha' : '',
      c.classe || '',
    ]
      .filter(Boolean)
      .join(' ');

  /* Uma célula pode devolver { span, html, classe } para ocupar várias
     colunas — ex.: "Sem contrato" no lugar de Contratado e A pagar. As
     colunas cobertas pelo span não são desenhadas nessa linha. */
  const linha = (valores, td) => {
    let pular = 0;
    return colunas
      .map((c, i) => {
        if (pular > 0) {
          pular--;
          return '';
        }
        const v = valores(c, i);
        if (v && typeof v === 'object') {
          pular = Math.max(0, (v.span || 1) - 1);
          return `<td colspan="${v.span || 1}" class="${[td(c, i), v.classe].filter(Boolean).join(' ')}">${v.html}</td>`;
        }
        return `<td class="${td(c, i)}"${c.num && c.celular !== 'some' && v !== '' ? ` data-rotulo="${esc(c.rotulo)}"` : ''}>${v ?? ''}</td>`;
      })
      .join('');
  };

  const linhaHTML = (it) =>
    `<tr${linhaClasse ? ` class="${linhaClasse(it) || ''}"` : ''}${linhaAttrs ? ' ' + linhaAttrs(it) : ''}>${linha(
      (c) => c.celula(it),
      (c) => classeTd(c),
    )}</tr>`;
  let corpo;
  if (!ordenados.length) {
    corpo = `<tr><td colspan="${colunas.length}" class="tinta2" style="text-align:center;height:56px">
         Nada com esse filtro.</td></tr>`;
  } else if (grupos) {
    const mapa = new Map();
    ordenados.forEach((it) => {
      const k = grupos.de(it);
      if (!mapa.has(k)) mapa.set(k, []);
      mapa.get(k).push(it);
    });
    corpo = [...mapa.keys()]
      .sort(grupos.ordem || ((a, b) => String(b).localeCompare(String(a))))
      .map((k) => {
        const chave = `${id}:${k}`;
        const aberto = !recolhidos.has(chave);
        return `<tr class="grupo-linha"><td colspan="${colunas.length}">
            <button type="button" class="grupo-botao" data-acao="lista-grupo" data-chave="${esc(chave)}"
              aria-expanded="${aberto}">${grupos.cabecalho(k, mapa.get(k))}</button></td></tr>
          ${aberto ? mapa.get(k).map(linhaHTML).join('') : ''}`;
      })
      .join('');
  } else {
    corpo = ordenados.map(linhaHTML).join('');
  }

  const temTotal = colunas.some((c) => c.total);
  const rodape =
    ordenados.length > 1 && temTotal
      ? `<tfoot><tr>${linha(
          (c, i) => {
            if (i === 0)
              return esc(rodapeRotulo ? rodapeRotulo(ordenados.length) : `${ordenados.length}`);
            return c.total ? c.total(ordenados) : '';
          },
          (c, i) =>
            [i > 0 && c.total ? 'num' : '', c.celular === 'some' ? 'some-no-celular' : '']
              .filter(Boolean)
              .join(' '),
        )}</tr></tfoot>`
      : '';

  return `<div class="lista-cx">
    <div class="lista-rolagem">
      <table class="lista${tabelaClasse ? ' ' + tabelaClasse : ''}" data-testid="${esc(testid || id)}">
        <colgroup>${colunas.map((c) => `<col style="width:${c.largura}">`).join('')}</colgroup>
        <thead><tr>${cab}</tr></thead>
        <tbody>${corpo}</tbody>
        ${rodape}
      </table>
    </div>
  </div>`;
}

/* Clicar de novo na mesma coluna inverte. Texto começa A→Z; número começa
   do maior, que é o que se quer ver primeiro. */
ACOES['lista-ordenar'] = (el, d) => {
  const atual = ordens.get(d.lista);
  if (atual && atual.col === d.col) ordens.set(d.lista, { col: d.col, dir: -atual.dir });
  else ordens.set(d.lista, { col: d.col, dir: d.num === '1' ? -1 : 1 });
  App.renderConteudo();
};

ACOES['lista-grupo'] = (el, d) => {
  if (recolhidos.has(d.chave)) recolhidos.delete(d.chave);
  else recolhidos.add(d.chave);
  App.renderConteudo();
};

ACOES['lista-limpar-filtros'] = () => {
  App.filtros = {};
  App.render();
};

/* ------------------------------------------------------- seção e nota */

/* Gráfico de apoio abaixo da lista: com título de seção, sem cartão. */
function secao(titulo, conteudo) {
  return `<section class="secao">
    <div class="secao-cab"><h2>${esc(titulo)}</h2></div>
    ${conteudo}
  </section>`;
}

/* Estado vazio: uma frase útil e uma ação. */
function vazioTela({ titulo, texto, acao }) {
  return `<div class="vazio">
    <h4>${esc(titulo)}</h4>
    <p>${esc(texto)}</p>
    ${acao ? `<div class="acoes">${acao}</div>` : ''}
  </div>`;
}

/* Índice de valor agregado (IDP, IDC) com duas casas — "—" quando não há
   base para calcular (obra que ainda não deveria ter começado). */
const fmtIndice = (v) => (v === null || v === undefined ? '—' : fmtNum(v, 2));

/* Nível do semáforo (nivelIndice, dominio/calculos.js) na classe de cor. */
const TOM_NIVEL = { critico: 'atraso', atencao: 'tom-alerta', ok: 'feito' };
const tomNivel = (nivel) => TOM_NIVEL[nivel] || '';

export {
  fmtIndice,
  tomNivel,
  dinheiro,
  faixaKpis,
  painelAnalise,
  barraFiltros,
  abrirMenu,
  fecharMenu,
  filtrando,
  buscaToolbar,
  botaoNovo,
  acoesRegistro,
  lista,
  secao,
  vazioTela,
};
