/**
 * telas/carteira.js — Carteira de obras (primeira tela na linguagem nova).
 *
 * Três decisões que valem para as telas seguintes:
 *
 * 1. A obra é registro de LISTA, não cartão. Colunas ordenáveis, linha de
 *    28px, total no rodapé — como uma janela do Finder ou uma tabela do
 *    Numbers. Cabem 25 obras em 1440×900 sem rolar.
 * 2. Selecionar abre o INSPETOR à direita, não um modal. Ver não interrompe;
 *    só editar interrompe. Sem seleção, o inspetor mostra o que exige ação.
 * 3. A ordenação acontece sobre os DADOS, não sobre o DOM. A tabela antiga
 *    reordenava <tr> lendo texto de célula de volta para número; aqui a
 *    coluna declara como se ordena e o valor nunca passa por string.
 *
 * Nada aqui calcula: tudo vem de dominio/calculos.js.
 */
import { esc, fmtMoney, fmtMoneyCurto, fmtPct } from '../../nucleo/base.js';
import { alertasObra, kpisCarteira, kpisObra } from '../../dominio/calculos.js';
import { Store } from '../../dados/store.js';
import { App, ICO, botao, nomeCliente, svg } from '../shell.js';
import { VIEWS } from '../telas-obra.js';

/* Estado só de tela — não é dado, não vai para o Store. */
const tela = {
  selecao: '',
  ordem: { col: 'nome', dir: 1 },
  filtro: 'todas',
};

/* ------------------------------------------------------------ colunas
   Cada coluna sabe: como se chama, como se ordena e como se desenha.
   `num: true` alinha à direita e ordena por número. */
const COLUNAS = [
  {
    k: 'nome',
    rotulo: 'Obra',
    largura: '28%',
    celular: 'principal',
    valor: (d) => d.o.nome,
    celula: (d) =>
      `<div class="cel-dupla"><b>${esc(d.o.nome)}</b>${
        d.o.cidade ? `<span>${esc(d.o.cidade)}</span>` : ''
      }</div>`,
  },
  {
    k: 'cliente',
    rotulo: 'Cliente',
    largura: '13%',
    celular: 'some',
    valor: (d) => nomeCliente(d.o.clienteId),
    celula: (d) => {
      const n = nomeCliente(d.o.clienteId);
      return n ? esc(n) : '<span class="tinta3">—</span>';
    },
  },
  {
    k: 'status',
    rotulo: 'Situação',
    largura: '13%',
    celular: 'some',
    valor: (d) => d.o.status,
    /* Texto cinza sempre, nunca etiqueta colorida. O atraso já aparece em
       dois lugares — a barra de avanço e a coluna Pendências. Pintar a
       situação de vermelho também seria a terceira vez que a mesma coisa
       é dita, e aí o vermelho para de significar alguma coisa. */
    celula: (d) => `<span class="tinta2">${esc(d.o.status)}</span>`,
  },
  {
    k: 'avanco',
    rotulo: 'Avanço',
    largura: '12%',
    num: true,
    valor: (d) => d.ko.progressoFisico,
    celula: (d) =>
      `<span class="barra-fina${d.ko.etapasAtrasadas ? ' atrasada' : ''}"><i style="width:${(
        Math.max(0, Math.min(1, d.ko.progressoFisico)) * 100
      ).toFixed(1)}%"></i></span>${fmtPct(d.ko.progressoFisico, 0)}`,
  },
  {
    k: 'saldoCaixa',
    rotulo: 'Saldo em caixa',
    largura: '13%',
    num: true,
    valor: (d) => d.ko.saldoCaixa,
    celula: (d) => marcaNegativo(d.ko.saldoCaixa, fmtMoney(d.ko.saldoCaixa, { dec: 0 })),
    total: (ds) => ds.reduce((s, d) => s + d.ko.saldoCaixa, 0),
  },
  {
    k: 'resultado',
    rotulo: 'Resultado projetado',
    largura: '13%',
    num: true,
    celular: 'some',
    valor: (d) => (d.ko.resultado === null ? -Infinity : d.ko.resultado),
    celula: (d) =>
      d.ko.resultado === null
        ? '<span class="tinta3">—</span>'
        : marcaNegativo(d.ko.resultado, fmtMoney(d.ko.resultado, { dec: 0 })),
    total: (ds) => ds.reduce((s, d) => s + (d.ko.resultado || 0), 0),
  },
  {
    k: 'pendencias',
    rotulo: 'Pendências',
    largura: '8%',
    num: true,
    valor: (d) => d.criticos * 1000 + d.alertas.length,
    /* Só o número: o cabeçalho já diz o que ele é, e "1 vencida" não cabe
       na coluna sem virar reticências. Vermelho quando alguma venceu; o
       detalhe vai no title e, por extenso, no inspetor. */
    celula: (d) => {
      if (!d.alertas.length) return '<span class="tinta3">—</span>';
      const t = d.criticos
        ? `${d.criticos} vencida${d.criticos > 1 ? 's' : ''} de ${d.alertas.length}`
        : `${d.alertas.length} em atenção`;
      return `<span class="${d.criticos ? 'atraso' : 'tinta2'}" title="${esc(t)}">${d.alertas.length}</span>`;
    },
  },
];

/* Vermelho só quando o número é negativo — é o único caso em que a cor
   informa alguma coisa que o próprio número já não diz de imediato. */
function marcaNegativo(v, texto) {
  return v < 0 ? `<span class="atraso">${texto}</span>` : texto;
}

/* --------------------------------------------------------------- dados */

function linhas() {
  const busca = (App.filtros.carteiraBusca || '').trim().toLowerCase();
  let ds = Store.estado.obras.map((o) => {
    const alertas = alertasObra(o);
    return { o, ko: kpisObra(o), alertas, criticos: alertas.filter((a) => a.sev === 3).length };
  });

  if (tela.filtro === 'andamento') ds = ds.filter((d) => d.o.status !== 'Concluída');
  else if (tela.filtro === 'concluidas') ds = ds.filter((d) => d.o.status === 'Concluída');

  if (busca) {
    ds = ds.filter((d) =>
      [d.o.nome, d.o.cidade, nomeCliente(d.o.clienteId)]
        .filter(Boolean)
        .some((t) => t.toLowerCase().includes(busca)),
    );
  }

  const col = COLUNAS.find((c) => c.k === tela.ordem.col) || COLUNAS[0];
  return ds.sort((a, b) => {
    const [va, vb] = [col.valor(a), col.valor(b)];
    const cmp =
      typeof va === 'number' && typeof vb === 'number'
        ? va - vb
        : String(va).localeCompare(String(vb), 'pt');
    return cmp * tela.ordem.dir;
  });
}

/* -------------------------------------------------------------- resumo
   Quatro números, não sete, e com hierarquia: o primeiro é o que a
   pessoa veio ver; os outros explicam de onde ele veio. */
function resumo(k) {
  const item = (rot, val, nota, classe = '') =>
    `<div class="resumo-item ${classe}">
      <span class="resumo-rot">${esc(rot)}</span>
      <span class="resumo-val${val.tom ? ' ' + val.tom : ''}">${val.texto}</span>
      ${nota ? `<span class="resumo-nota">${esc(nota)}</span>` : ''}
    </div>`;

  const pendencias = k.criticos
    ? { texto: `${k.criticos} vencida${k.criticos > 1 ? 's' : ''}`, tom: 'atraso' }
    : k.atencao
      ? { texto: `${k.atencao} em atenção`, tom: 'alerta' }
      : { texto: 'nenhuma', tom: '' };

  return `<div class="resumo">
    ${item(
      'Saldo em caixa',
      { texto: fmtMoney(k.saldoCaixa, { dec: 0 }), tom: k.saldoCaixa < 0 ? 'atraso' : '' },
      `recebido ${fmtMoneyCurto(k.recebido)} · pago ${fmtMoneyCurto(k.pago)}`,
      'principal',
    )}
    ${item(
      'Resultado projetado',
      {
        texto: k.resultado === null ? '—' : fmtMoney(k.resultado, { dec: 0 }),
        tom: k.resultado !== null && k.resultado < 0 ? 'atraso' : '',
      },
      k.margem === null ? 'falta o valor de venda' : `margem média ${fmtPct(k.margem)}`,
    )}
    ${item(
      'Avanço físico médio',
      { texto: fmtPct(k.progressoMedio, 0), tom: '' },
      `${k.ativas} obra${k.ativas === 1 ? '' : 's'} em andamento`,
    )}
    ${item('Pendências', pendencias, 'em toda a carteira', 'resumo-espaco')}
  </div>`;
}

/* ------------------------------------------------------------ inspetor */

function inspetor(ds, k) {
  const d = ds.find((x) => x.o.id === tela.selecao);
  if (!d) return inspetorCarteira(k);

  const par = (rot, val, tom = '') =>
    `<div class="par"><dt>${esc(rot)}</dt><dd${tom ? ` class="${tom}"` : ''}>${val}</dd></div>`;
  const neg = (v) => (v < 0 ? 'atraso' : '');

  const pend = d.alertas
    .slice()
    .sort((a, b) => b.sev - a.sev)
    .slice(0, 5)
    .map(
      (
        a,
      ) => `<button class="pend" data-acao="ir" data-view="${esc(a.ref && a.ref.view ? a.ref.view : 'alertas')}" data-obra="${esc(d.o.id)}">
        <span class="pend-sev s${a.sev}"></span>
        <span class="pend-txt"><b>${esc(a.titulo)}</b><span>${esc(a.detalhe)}</span></span>
      </button>`,
    )
    .join('');

  return `<aside class="inspetor" data-testid="inspetor">
    <div class="inspetor-cab">
      <h2>${esc(d.o.nome)}<span class="sub">${esc(
        [nomeCliente(d.o.clienteId), d.o.cidade].filter(Boolean).join(' · ') ||
          'sem cliente vinculado',
      )}</span></h2>
      <button class="btn sutil icone" data-acao="carteira-limpar" title="Fechar" aria-label="Fechar o inspetor">${svg(ICO.x, 13)}</button>
    </div>
    <div class="inspetor-corpo">
      <div class="inspetor-secao">
        <h3>Execução</h3>
        <dl class="pares">
          ${par('Avanço físico', fmtPct(d.ko.progressoFisico, 0))}
          ${par('Avanço financeiro', fmtPct(d.ko.progressoFinanceiro, 0))}
          ${par('Etapas concluídas', `${d.ko.etapasConcluidas} de ${d.ko.etapasTotal}`)}
          ${par('Etapas atrasadas', d.ko.etapasAtrasadas || '—', d.ko.etapasAtrasadas ? 'atraso' : '')}
        </dl>
      </div>
      <div class="inspetor-secao">
        <h3>Dinheiro</h3>
        <dl class="pares">
          ${par('Recebido', fmtMoney(d.ko.recebido, { dec: 0 }))}
          ${par('Pago', fmtMoney(d.ko.totalPago, { dec: 0 }))}
          ${par('Saldo em caixa', fmtMoney(d.ko.saldoCaixa, { dec: 0 }), neg(d.ko.saldoCaixa))}
          ${par('A receber', fmtMoney(d.ko.aReceber, { dec: 0 }))}
          ${par('Saldo contratual', fmtMoney(d.ko.saldoContratual, { dec: 0 }), neg(d.ko.saldoContratual))}
          ${par('Custo previsto/m²', d.ko.area ? fmtMoney(d.ko.custoPrevistoM2, { dec: 0 }) : '—')}
        </dl>
      </div>
      ${
        pend
          ? `<div class="inspetor-secao">
            <h3>Precisa de ação${d.alertas.length > 5 ? ` (${d.alertas.length})` : ''}</h3>
            <div class="pend-lista">${pend}</div>
          </div>`
          : ''
      }
      <div class="inspetor-secao">
        ${botao('Abrir a obra', 'ir', { view: 'painel', obra: d.o.id }, 'btn primario larga')}
      </div>
    </div>
  </aside>`;
}

/* Sem seleção o inspetor não fica vazio: mostra o que exige ação hoje. */
function inspetorCarteira(k) {
  const criticos = k.alertas
    .slice()
    .sort((a, b) => b.sev - a.sev)
    .slice(0, 8);

  const corpo = criticos.length
    ? `<div class="pend-lista">${criticos
        .map(
          (
            a,
          ) => `<button class="pend" data-acao="ir" data-view="${esc(a.ref && a.ref.view ? a.ref.view : 'alertas')}" data-obra="${esc(a.obraId)}">
            <span class="pend-sev s${a.sev}"></span>
            <span class="pend-txt"><b>${esc(a.titulo)}</b><span>${esc(a.obraNome)} · ${esc(a.detalhe)}</span></span>
          </button>`,
        )
        .join('')}</div>`
    : `<p class="tinta2" style="font-size:var(--t-peq);margin:0">Nada vencido nem a vencer. Selecione uma obra para ver os detalhes.</p>`;

  return `<aside class="inspetor" data-testid="inspetor">
    <div class="inspetor-cab"><h2>Precisa de ação<span class="sub">${
      k.alertas.length ? `${k.alertas.length} em toda a carteira` : 'carteira em dia'
    }</span></h2></div>
    <div class="inspetor-corpo">${corpo}</div>
  </aside>`;
}

/* --------------------------------------------------------------- tela */

VIEWS.carteira = () => {
  const e = Store.estado;

  if (!e.obras.length) {
    return `<div class="vazio" data-testid="carteira-vazia">
      <h4>Nenhuma obra cadastrada</h4>
      <p>Cadastre a primeira obra para controlar contratos, medições, recebimentos e materiais.
         Se você já acompanha em planilha — inclusive no modelo MCMV — dá para importar.</p>
      <div class="acoes">
        ${botao('Nova obra', 'nova-obra', {}, 'btn primario', 'mais')}
        ${botao('Importar planilha', 'importar-xlsx', {}, 'btn', 'baixar')}
        ${botao('Carregar dados de exemplo', 'exemplo', {}, 'btn sutil')}
      </div>
    </div>`;
  }

  const k = kpisCarteira(e);
  const ds = linhas();

  const cabecalho = COLUNAS.map((c) => {
    const ativa = tela.ordem.col === c.k;
    return `<th class="ord${c.num ? ' num' : ''}" style="width:${c.largura}"
      data-acao="carteira-ordenar" data-col="${c.k}"
      ${ativa ? `data-ord="${tela.ordem.dir === 1 ? 'asc' : 'desc'}"` : ''}
      aria-sort="${ativa ? (tela.ordem.dir === 1 ? 'ascending' : 'descending') : 'none'}"
      scope="col">${esc(c.rotulo)}</th>`;
  }).join('');

  const corpo = ds.length
    ? ds
        .map(
          (d) => `<tr class="clicavel" data-obra="${esc(d.o.id)}" data-acao="carteira-selecionar"
            ${d.o.id === tela.selecao ? 'aria-selected="true"' : ''} tabindex="-1">
            ${COLUNAS.map(
              (c) =>
                `<td class="${c.num ? 'num' : ''}${c.celular === 'principal' ? ' principal-celular' : ''}${
                  c.celular === 'some' ? ' some-no-celular' : ''
                }" ${c.num ? `data-rotulo="${esc(c.rotulo)}"` : ''}>${c.celula(d)}</td>`,
            ).join('')}
          </tr>`,
        )
        .join('')
    : `<tr><td colspan="${COLUNAS.length}" class="tinta2" style="text-align:center">
        Nenhuma obra corresponde ao filtro.</td></tr>`;

  const rodape = ds.length
    ? `<tfoot><tr>
        ${COLUNAS.map((c, i) => {
          if (i === 0) return `<td>${ds.length} obra${ds.length > 1 ? 's' : ''}</td>`;
          if (!c.total) return '<td></td>';
          const t = c.total(ds);
          return `<td class="num">${marcaNegativo(t, fmtMoney(t, { dec: 0 }))}</td>`;
        }).join('')}
      </tr></tfoot>`
    : '';

  return `<div class="tela-carteira">
    <div class="tela-principal">
      ${resumo(k)}
      <div class="lista-cx">
        <div class="lista-rolagem">
          <table class="lista" data-testid="lista-obras">
            <thead><tr>${cabecalho}</tr></thead>
            <tbody>${corpo}</tbody>
            ${rodape}
          </table>
        </div>
      </div>
    </div>
    ${inspetor(ds, k)}
  </div>`;
};

/* Ações e atalhos da tela ficam em acoes-carteira.js, para manter a
   montagem do HTML separada do que responde a clique e tecla. */
export { COLUNAS, linhas, tela };

/* Lista à esquerda, inspetor à direita, cada painel com a própria rolagem. */
VIEWS.carteira.paineis = true;

/* --------------------------------------------------------- toolbar
   Cada tela contribui com as próprias ações na toolbar unificada, do
   lado direito, antes dos controles globais. `App.renderTopo` procura
   por esta propriedade. */
VIEWS.carteira.toolbar = () => {
  if (!Store.estado.obras.length) return '';
  const seg = (v, rot) =>
    `<button data-acao="carteira-filtro" data-filtro="${v}" aria-pressed="${tela.filtro === v}">${rot}</button>`;
  return `<div class="segmentado" role="group" aria-label="Filtrar obras">
      ${seg('todas', 'Todas')}${seg('andamento', 'Em andamento')}${seg('concluidas', 'Concluídas')}
    </div>
    <span class="busca">${svg(ICO.busca, 13)}
      <input type="search" id="flt_carteiraBusca" data-filtro="carteiraBusca" data-testid="busca-carteira"
        value="${esc(App.filtros.carteiraBusca || '')}" placeholder="Buscar obra" aria-label="Buscar obra">
      <kbd>⌘K</kbd>
    </span>
    ${botao('<span class="rotulo-btn">Nova obra</span>', 'nova-obra', {}, 'btn primario', 'mais')}`;
};
