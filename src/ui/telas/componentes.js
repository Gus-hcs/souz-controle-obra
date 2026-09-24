/**
 * telas/componentes.js — Peças que as telas de lista compartilham.
 *
 * Toda tela de registro (medições, lançamentos, recebimentos…) tem a mesma
 * anatomia: faixa de resumo, filtros que só aparecem quando há o que
 * filtrar, e uma lista ordenável com total no rodapé. Isto é essa anatomia
 * uma vez só, para que a quinta tela não seja a quinta variação dela.
 *
 * Nada aqui calcula regra de negócio: recebe os números prontos.
 */
import { esc, fmtMoney } from '../../nucleo/base.js';
import { Store } from '../../dados/store.js';
import { ACOES } from '../acoes.js';
import { App, ICO, botao, svg } from '../shell.js';

/* Vermelho só no negativo: é o único caso em que a cor diz algo que o
   próprio número não diz de imediato. */
function dinheiro(v, { cinzaNoZero = false } = {}) {
  const t = fmtMoney(v, { dec: 2 });
  if (v < -0.005) return `<span class="atraso">${t}</span>`;
  if (cinzaNoZero && Math.abs(v) < 0.005) return '<span class="tinta3">—</span>';
  return t;
}

/* --------------------------------------------------------------- resumo
   itens: [{ rotulo, valor, nota, tom: ''|'atraso'|'alerta' }]
   O primeiro é o principal: é o número que a pessoa veio ver. */
function resumo(itens) {
  return `<div class="resumo">${itens
    .filter(Boolean)
    .map(
      (it, i) => `<div class="resumo-item${i === 0 ? ' principal' : ''}">
        <span class="resumo-rot">${esc(it.rotulo)}</span>
        <span class="resumo-val${it.tom ? ' ' + it.tom : ''}">${it.valor}</span>
        ${it.nota ? `<span class="resumo-nota">${esc(it.nota)}</span>` : ''}
      </div>`,
    )
    .join('')}</div>`;
}

/* ------------------------------------------------------------- filtros */

/* Select de filtro compacto: largura pelo conteúdo, não 100%.
   opcoes: ['a', 'b'] ou [['valor', 'Texto'], …] */
function seletor(chave, opcoes, rotuloTodos) {
  const v = App.filtros[chave] || '';
  return `<select data-filtro="${chave}" aria-label="${esc(rotuloTodos)}">
    <option value="">${esc(rotuloTodos)}</option>
    ${opcoes
      .map((o) => {
        const [val, txt] = Array.isArray(o) ? o : [o, o];
        return `<option value="${esc(val)}" ${String(val) === v ? 'selected' : ''}>${esc(txt)}</option>`;
      })
      .join('')}
  </select>`;
}

/* A barra só existe quando há o que filtrar: com um registro, quatro
   selects de filtro são moldura. `conta` aparece quando algo está filtrado. */
function barraFiltros({ mostrar, controles, filtrados, total }) {
  if (!mostrar) return '';
  const filtrando = filtrados !== total;
  return `<div class="filtro-barra nao-imprime">
    ${controles.filter(Boolean).join('')}
    ${filtrando ? `<span class="tinta2 filtro-conta">${filtrados} de ${total}</span>` : ''}
    ${filtrando ? `<button class="btn sutil pequeno" data-acao="lista-limpar-filtros">Limpar filtros</button>` : ''}
  </div>`;
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
    <button class="btn sutil icone pequeno" data-acao="excluir-${tipo}" data-id="${esc(id)}"
      title="Excluir" aria-label="Excluir ${n}">${svg(ICO.lixo, 13)}</button>`;
}

/* --------------------------------------------------------------- lista
   Lista ordenável. A ordem é por DADO, não por texto de célula: cada coluna
   declara como se ordena (`valor`) e como se desenha (`celula`).

   colunas: [{ k, rotulo, largura, num, valor(item), celula(item),
               celular: 'principal'|'some', classe, total(itens) }]
*/
const ordens = new Map(); // id da lista -> { col, dir }

function lista({ id, colunas, itens, ordemPadrao, testid, rodapeRotulo, linhaClasse }) {
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

  const corpo = ordenados.length
    ? ordenados
        .map(
          (it) =>
            `<tr${linhaClasse ? ` class="${linhaClasse(it) || ''}"` : ''}>${colunas
              .map(
                (c) =>
                  `<td class="${classeTd(c)}"${c.num && c.celular !== 'some' ? ` data-rotulo="${esc(c.rotulo)}"` : ''}>${c.celula(it)}</td>`,
              )
              .join('')}</tr>`,
        )
        .join('')
    : `<tr><td colspan="${colunas.length}" class="tinta2" style="text-align:center;height:56px">
         Nada com esse filtro.</td></tr>`;

  const temTotal = colunas.some((c) => c.total);
  const rodape =
    ordenados.length > 1 && temTotal
      ? `<tfoot><tr>${colunas
          .map((c, i) => {
            if (i === 0)
              return `<td>${esc(rodapeRotulo ? rodapeRotulo(ordenados.length) : `${ordenados.length}`)}</td>`;
            if (!c.total)
              return `<td class="${c.celular === 'some' ? 'some-no-celular' : ''}"></td>`;
            return `<td class="num">${c.total(ordenados)}</td>`;
          })
          .join('')}</tr></tfoot>`
      : '';

  return `<div class="lista-cx">
    <div class="lista-rolagem">
      <table class="lista" data-testid="${esc(testid || id)}">
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

export {
  dinheiro,
  resumo,
  seletor,
  barraFiltros,
  filtrando,
  buscaToolbar,
  botaoNovo,
  acoesRegistro,
  lista,
  secao,
  vazioTela,
};
