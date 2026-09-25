/**
 * telas/carteira.js — Carteira de obras.
 *
 * Pergunta que a tela responde em 5 segundos: qual obra está pior, por quê,
 * e qual a primeira ação. Por isso:
 *
 * - a lista abre ordenada por SAÚDE, a pior primeiro, e a coluna Saúde diz
 *   o motivo em palavras ("Atrasada 20d", "Custo +8%");
 * - o painel à direita agrupa o que precisa de ação e cada item tem o botão
 *   que leva à tela onde se resolve;
 * - os cinco KPIs têm o mesmo peso, e clicar em um filtra a lista pelas
 *   obras que compõem aquele número.
 *
 * Nenhuma conta aqui. Todo número sai de uma função de dominio/calculos.js,
 * e o KPI e a linha de total chamam a MESMA função — só muda a lista de
 * obras que recebem. É o que garante que o mesmo número não apareça com
 * dois valores na tela.
 */
import {
  esc,
  fmtData,
  fmtDataCurta,
  fmtDataCurtaAno,
  fmtMoney,
  fmtMoneyCurto,
  fmtNum,
  fmtPct,
} from '../../nucleo/base.js';
import {
  agendaCarteira,
  avancoCarteira,
  caixaCarteira,
  custoCarteira,
  historiaCarteira,
  nivelIndice,
  kpisObra,
  pendenciasCarteira,
  pendenciasObra,
  resultadoCarteira,
  riscoCarteira,
  saudeObra,
  valorAgregadoObra,
} from '../../dominio/calculos.js';
import { graficoCurvaS } from '../../graficos/index.js';
import { fmtIndice, tomNivel } from './componentes.js';
import { Store } from '../../dados/store.js';
import { App, ICO, botao, nomeCliente, svg } from '../shell.js';
import { VIEWS, fraseAncoraHTML, rotuloAcao } from '../telas-obra.js';

/* Estado só de tela — não é dado, não vai para o Store. */
const tela = {
  selecao: '',
  ordem: { col: 'saude', dir: 1 },
  filtro: 'todas', // segmentado da toolbar
  kpi: '', // KPI clicado: filtra a lista
  gruposFechados: new Set(),
};

/* ------------------------------------------------------------ dados */

function dadosObra(o) {
  const ko = kpisObra(o);
  const va = valorAgregadoObra(o);
  return {
    o,
    ko,
    saude: saudeObra(o),
    pend: pendenciasObra(o),
    va,
    previsto: va.previsto,
    cliente: nomeCliente(o.clienteId),
    semMovimento: !ko.saldoInicial && !ko.recebido && !ko.totalPago,
  };
}

/* Base: o que a toolbar (segmentado + busca) deixa ver. Os KPIs são
   calculados sobre a base — clicar num KPI filtra a lista, não o KPI. */
function base() {
  const busca = (App.filtros.carteiraBusca || '').trim().toLowerCase();
  return Store.estado.obras.filter((o) => {
    if (tela.filtro === 'andamento' && o.status === 'Concluída') return false;
    if (tela.filtro === 'concluidas' && o.status !== 'Concluída') return false;
    if (!busca) return true;
    return [o.nome, o.cidade, nomeCliente(o.clienteId)]
      .filter(Boolean)
      .some((t) => t.toLowerCase().includes(busca));
  });
}

/* O que cada KPI filtra: as obras que compõem aquele número. */
const FILTROS_KPI = {
  caixa: { rotulo: 'obras com caixa negativo', teste: (d) => d.ko.saldoCaixa < -0.005 },
  resultado: { rotulo: 'obras que entram no resultado', teste: (d) => d.ko.venda > 0 },
  avanco: { rotulo: 'obras atrasadas', teste: (d) => d.saude.prazo.atrasoDias > 0 },
  risco: {
    rotulo: 'obras em risco',
    teste: (d) => d.saude.nivel === 'critico' || d.saude.nivel === 'atencao',
  },
  pendencias: { rotulo: 'obras com pendência', teste: (d) => d.pend.total > 0 },
};

/* ---------------------------------------------------------- colunas
   Cada coluna declara como se ordena. Desempate: saúde, depois nome. */
const COLUNAS = [
  { k: 'obra', rotulo: 'Obra', largura: '19%', valor: (d) => d.o.nome },
  {
    k: 'saude',
    rotulo: 'Saúde',
    largura: '17%',
    valor: (d) => d.saude.ordem * 1000 - d.pend.total,
  },
  {
    k: 'avanco',
    rotulo: 'Avanço',
    largura: '11%',
    num: true,
    valor: (d) => (d.saude.faltando.length ? -1 : d.ko.progressoFisico),
  },
  {
    k: 'fim',
    rotulo: 'Término proj.',
    largura: '10%',
    valor: (d) => d.saude.prazo.termino || d.saude.prazo.fimPrevisto || '9999',
  },
  {
    k: 'custo',
    rotulo: 'Custo',
    largura: '13%',
    num: true,
    valor: (d) => (d.ko.custoPrevisto > 0 ? d.ko.totalPago / d.ko.custoPrevisto : -1),
  },
  { k: 'saldo', rotulo: 'Saldo', largura: '10%', num: true, valor: (d) => d.ko.saldoCaixa },
  {
    k: 'resultado',
    rotulo: 'Resultado',
    largura: '11%',
    num: true,
    valor: (d) => (d.ko.resultado === null ? -Infinity : d.ko.resultado),
  },
  {
    k: 'pendencias',
    rotulo: 'Pendências',
    largura: '9%',
    num: true,
    valor: (d) => d.pend.criticas * 1000 + d.pend.total,
  },
];

function ordenar(ds) {
  const col = COLUNAS.find((c) => c.k === tela.ordem.col) || COLUNAS[1];
  return ds.slice().sort((a, b) => {
    const [va, vb] = [col.valor(a), col.valor(b)];
    const cmp =
      typeof va === 'number' && typeof vb === 'number'
        ? va - vb
        : String(va).localeCompare(String(vb), 'pt');
    if (cmp) return cmp * tela.ordem.dir;
    return (
      a.saude.ordem - b.saude.ordem ||
      b.pend.total - a.pend.total ||
      a.o.nome.localeCompare(b.o.nome, 'pt')
    );
  });
}

/** Linhas visíveis, já ordenadas. Usado também pelo teclado. */
function linhas() {
  let ds = base().map(dadosObra);
  const f = FILTROS_KPI[tela.kpi];
  if (f) ds = ds.filter(f.teste);
  return ordenar(ds);
}

/* ------------------------------------------------------ formatação */

const dinheiro = (v) => {
  const t = fmtMoney(v, { dec: 0 });
  return v < -0.005 ? `<span class="atraso">${t}</span>` : t;
};
const pp = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(Math.round(v * 100))} p.p.`;
const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const diaSemana = (iso) => SEMANA[new Date(iso + 'T12:00:00Z').getUTCDay()];

/* ------------------------------------------------------------- KPIs */

function kpis(obras) {
  const caixa = caixaCarteira(obras);
  const res = resultadoCarteira(obras);
  const av = avancoCarteira(obras);
  const risco = riscoCarteira(obras);
  const pend = pendenciasCarteira(obras);

  const tomDesvio = av.desvio <= -0.1 ? 'atraso' : av.desvio < -0.005 ? 'tom-alerta' : '';
  const porTipo = [
    ['prazo', 'prazo'],
    ['material', 'material'],
    ['contrato', 'contrato'],
    ['financeiro', 'financeiro'],
  ]
    .filter(([k]) => pend.porTipo[k])
    .map(([k, r]) => `${r} ${pend.porTipo[k]}`)
    .join(' · ');

  const item = (chave, rotulo, valor, comparacao, contexto, tom = '', tomComp = '') => {
    const ativo = tela.kpi === chave;
    return `<button class="kpi-item${ativo ? ' ativo' : ''}" data-acao="carteira-kpi" data-kpi="${chave}"
        aria-pressed="${ativo}" title="Filtrar a lista: ${esc(FILTROS_KPI[chave].rotulo)}">
      <span class="kpi-rot">${esc(rotulo)}</span>
      <span class="kpi-val${tom ? ' ' + tom : ''}">${valor}</span>
      <span class="kpi-comp${tomComp ? ' ' + tomComp : ''}">${comparacao}</span>
      <span class="kpi-ctx">${contexto}</span>
    </button>`;
  };

  return `<div class="kpis" role="group" aria-label="Indicadores da carteira">
    ${item(
      'caixa',
      'Caixa hoje',
      fmtMoney(caixa.saldo, { dec: 0 }),
      `em 30 dias ${fmtMoney(caixa.projecao, { dec: 0 })}`,
      caixa.saldoInicial
        ? `inclui ${fmtMoneyCurto(caixa.saldoInicial)} de saldo inicial`
        : 'recebido menos pago',
      caixa.saldo < -0.005 ? 'atraso' : '',
      caixa.projecao < -0.005 ? 'atraso' : '',
    )}
    ${item(
      'resultado',
      'Resultado projetado',
      res.resultado === null ? 'sem dados' : fmtMoney(res.resultado, { dec: 0 }),
      res.margem === null ? 'informe o valor de venda' : `margem ${fmtPct(res.margem)}`,
      res.obrasSemVenda
        ? `${res.obrasSemVenda} sem valor de venda, fora da conta`
        : 'todas as obras na conta',
      res.resultado !== null && res.resultado < -0.005 ? 'atraso' : '',
      res.margem !== null && res.margem < 0 ? 'atraso' : '',
    )}
    ${item(
      'avanco',
      'Avanço físico',
      av.obras ? fmtPct(av.realizado, 0) : 'sem dados',
      av.obras
        ? `previsto ${fmtPct(av.previsto, 0)} · ${pp(av.desvio)}`
        : 'nenhuma obra com cronograma',
      `ponderado pelo custo${av.fora ? ` · ${av.fora} fora da conta` : ''}`,
      '',
      tomDesvio,
    )}
    ${item(
      'risco',
      'Obras em risco',
      `${risco.total} de ${risco.de}`,
      risco.total ? `prazo ${risco.prazo} · custo ${risco.custo}` : 'nenhuma em risco',
      risco.incompletas ? `${risco.incompletas} com cadastro incompleto` : 'todas configuradas',
      risco.total ? 'tom-alerta' : '',
    )}
    ${item(
      'pendencias',
      'Pendências',
      `${pend.total}`,
      pend.criticas ? `${pend.criticas} crítica${pend.criticas > 1 ? 's' : ''}` : 'nenhuma crítica',
      porTipo || 'nada pedindo ação',
      '',
      pend.criticas ? 'atraso' : '',
    )}
  </div>`;
}

/* ------------------------------------------------------------ lista */

function celulaSaude(d) {
  const s = d.saude;
  const todos = s.motivos.map((m) => m.texto).join(' · ');
  return `<span class="saude s-${s.nivel}" title="${esc(todos || s.texto)}"><i aria-hidden="true"></i>${esc(s.texto)}</span>`;
}

function celulaAvanco(d) {
  const real = Math.max(0, Math.min(1, d.ko.progressoFisico));
  const prev = Math.max(0, Math.min(1, d.previsto));
  const atrasado = real + 0.005 < prev;
  return `<span class="avanco" title="realizado ${fmtPct(real, 0)} · previsto para hoje ${fmtPct(prev, 0)}">
    <span class="avanco-barra${atrasado ? ' atrasado' : ''}"><i style="width:${(real * 100).toFixed(1)}%"></i><b style="left:${(prev * 100).toFixed(1)}%"></b></span>${fmtPct(real, 0)}
  </span>`;
}

/* Término projetado no ritmo de hoje (valorAgregadoObra) e o atraso da
   OBRA contra a data do contrato — o mesmo número da coluna Saúde. */
function celulaFim(d) {
  const p = d.saude.prazo;
  const data = p.termino || p.fimPrevisto;
  if (!data) return '<span class="tinta3">sem data</span>';
  /* Data em cima, desvio embaixo: lado a lado não cabe na coluna. */
  const desvio = p.atrasoDias
    ? `<span class="${p.atrasoDias >= 30 ? 'atraso' : 'cel-aviso-alerta'}">+${p.atrasoDias}d</span>`
    : '<span></span>';
  return `<div class="cel-dois" title="projetado ${esc(fmtData(data))} · contrato ${esc(fmtData(p.fimPrevisto))}">
    <span>${fmtDataCurtaAno(data)}</span>${desvio}
  </div>`;
}

/* Valor curto sem o "R$": na segunda linha da célula, o símbolo já está
   na primeira e só rouba espaço. */
const semSimbolo = (v) =>
  fmtMoneyCurto(v).replace(/^-?R\$\s?/, (m) => (m.startsWith('-') ? '-' : ''));

function celulaCusto(d) {
  const pct = d.ko.custoPrevisto > 0 ? d.ko.totalPago / d.ko.custoPrevisto : null;
  return `<div class="cel-dois" title="realizado ${esc(fmtMoney(d.ko.totalPago, { dec: 0 }))} de ${esc(fmtMoney(d.ko.custoPrevisto, { dec: 0 }))} orçados">
    <span>${fmtMoneyCurto(d.ko.totalPago)}</span>
    <span>${pct === null ? '' : `${fmtPct(pct, 0)} de ${semSimbolo(d.ko.custoPrevisto)}`}</span>
  </div>`;
}

function linhaObra(d) {
  const sub = [d.cliente, d.o.cidade].filter(Boolean).join(' · ') || 'sem cliente vinculado';
  const incompleta = d.saude.faltando.length > 0;
  /* Obra sem cronograma ou orçamento: no lugar de zeros e traços, uma frase
     que diz o que falta e o link para completar. */
  const meio = incompleta
    ? `<td colspan="3" class="cel-completar">
        <span class="tinta2">Falta ${esc(d.saude.faltando.join(' e '))}</span>
        <button class="btn-link" data-acao="ir" data-view="obra-config" data-obra="${esc(d.o.id)}">Completar</button>
      </td>`
    : `<td class="num" data-rotulo="Avanço">${celulaAvanco(d)}</td>
       <td class="some-no-celular">${celulaFim(d)}</td>
       <td class="num some-no-celular">${celulaCusto(d)}</td>`;

  return `<tr class="clicavel" data-obra="${esc(d.o.id)}" data-acao="carteira-selecionar"
      ${d.o.id === tela.selecao ? 'aria-selected="true"' : ''} tabindex="-1">
    <td class="principal-celular"><div class="cel-obra"><b>${esc(d.o.nome)}</b><span>${esc(sub)}</span></div></td>
    <td class="cel-saude">${celulaSaude(d)}</td>
    ${meio}
    <td class="num" data-rotulo="Saldo">${d.semMovimento ? '<span class="rotulo-cinza">sem movimento</span>' : dinheiro(d.ko.saldoCaixa)}</td>
    <td class="num some-no-celular">${d.ko.venda > 0 ? dinheiro(d.ko.resultado) : '<span class="rotulo-cinza">sem valor de venda</span>'}</td>
    <td class="num"${d.pend.total ? ' data-rotulo="Pendências"' : ''}>${
      d.pend.total ? `<span class="${d.pend.criticas ? 'atraso' : ''}">${d.pend.total}</span>` : ''
    }</td>
  </tr>`;
}

/* Linha de total: as MESMAS funções dos KPIs, sobre as obras visíveis. */
function rodape(ds, totalBase) {
  const obras = ds.map((d) => d.o);
  const caixa = caixaCarteira(obras);
  const res = resultadoCarteira(obras);
  const av = avancoCarteira(obras);
  const custo = custoCarteira(obras);
  const risco = riscoCarteira(obras);
  const pend = pendenciasCarteira(obras);
  return `<tfoot><tr>
    <td>${ds.length === totalBase ? `${ds.length} obra${ds.length > 1 ? 's' : ''}` : `${ds.length} de ${totalBase} obras`}</td>
    <td class="tinta2">${risco.total ? `${risco.total} em risco` : 'nenhuma em risco'}</td>
    <td class="num">${av.obras ? fmtPct(av.realizado, 0) : ''}</td>
    <td class="some-no-celular"></td>
    <td class="num some-no-celular"><div class="cel-dois"><span>${fmtMoneyCurto(custo.realizado)}</span><span>${
      custo.consumido === null ? '' : `${fmtPct(custo.consumido, 0)} de ${semSimbolo(custo.orcado)}`
    }</span></div></td>
    <td class="num">${dinheiro(caixa.saldo)}</td>
    <td class="num some-no-celular">${res.resultado === null ? '' : dinheiro(res.resultado)}</td>
    <td class="num">${pend.total || ''}</td>
  </tr></tfoot>`;
}

function tabela(ds, totalBase) {
  const cab = COLUNAS.map((c) => {
    const ativa = tela.ordem.col === c.k;
    return `<th scope="col" class="ord${c.num ? ' num' : ''}${['fim', 'custo', 'resultado'].includes(c.k) ? ' some-no-celular' : ''}"
      data-acao="carteira-ordenar" data-col="${c.k}"
      ${ativa ? `data-ord="${tela.ordem.dir === 1 ? 'asc' : 'desc'}"` : ''}
      aria-sort="${ativa ? (tela.ordem.dir === 1 ? 'ascending' : 'descending') : 'none'}">${esc(c.rotulo)}</th>`;
  }).join('');

  const corpo = ds.length
    ? ds.map(linhaObra).join('')
    : `<tr><td colspan="${COLUNAS.length}" class="tinta2" style="text-align:center;height:56px">
         Nenhuma obra ${tela.kpi ? `entre as ${esc(FILTROS_KPI[tela.kpi].rotulo)}` : 'com esse filtro'}.</td></tr>`;

  return `<div class="lista-cx">
    <div class="lista-rolagem">
      <table class="lista lista-carteira" data-testid="lista-obras">
        <colgroup>${COLUNAS.map((c) => `<col style="width:${c.largura}">`).join('')}</colgroup>
        <thead><tr>${cab}</tr></thead>
        <tbody>${corpo}</tbody>
        ${ds.length > 1 ? rodape(ds, totalBase) : ''}
      </table>
    </div>
  </div>`;
}

/* ------------------------------------------------ precisa de ação */

const GRUPOS = [
  ['contrato', 'Contrato'],
  ['prazo', 'Prazo'],
  ['material', 'Material'],
  ['financeiro', 'Financeiro'],
];

/* O verbo do botão diz o que se vai fazer lá. */
function listaAcoes(itens, mostrarObra) {
  if (!itens.length) {
    return '<p class="tinta2 inspetor-vazio">Nada pedindo ação. Selecione uma obra para ver os detalhes.</p>';
  }
  return GRUPOS.map(([tipo, rotulo]) => {
    const doGrupo = itens.filter((a) => a.tipo === tipo);
    if (!doGrupo.length) return '';
    const fechado = tela.gruposFechados.has(tipo);
    const criticas = doGrupo.filter((a) => a.sev === 3).length;
    return `<section class="acao-grupo${fechado ? ' fechado' : ''}">
      <button class="acao-grupo-cab" data-acao="carteira-grupo" data-grupo="${tipo}" aria-expanded="${!fechado}">
        <span class="disclosure" aria-hidden="true">${svg(ICO.seta, 11)}</span>
        <span>${rotulo}</span>
        <span class="acao-grupo-n${criticas ? ' atraso' : ''}">${doGrupo.length}</span>
      </button>
      ${
        fechado
          ? ''
          : `<div class="acao-itens">${doGrupo
              .map(
                (a) => `<div class="acao-item s${a.sev}">
            <span class="acao-sev" aria-hidden="true"></span>
            <div class="acao-txt">
              <b>${esc(a.titulo)}</b>
              <span title="${esc(a.detalhe)}">${mostrarObra ? `${esc(a.obraNome)} · ` : ''}${esc(a.detalhe)}</span>
            </div>
            <button class="btn pequeno acao-btn" data-acao="ir" data-view="${esc((a.ref && a.ref.view) || 'alertas')}"
              data-obra="${esc(a.obraId)}">${rotuloAcao(a)}</button>
          </div>`,
              )
              .join('')}</div>`
      }
    </section>`;
  }).join('');
}

function inspetor(ds, obrasBase) {
  const d =
    ds.find((x) => x.o.id === tela.selecao) || (tela.selecao ? dadosObraPorId(tela.selecao) : null);

  if (!d) {
    const pend = pendenciasCarteira(obrasBase);
    return `<aside class="inspetor" data-testid="inspetor" aria-label="Precisa de ação">
      <div class="inspetor-cab"><h2>Precisa de ação<span class="sub">${
        pend.total ? `${pend.total} pendência${pend.total > 1 ? 's' : ''}` : 'nada pendente'
      }${pend.avisos ? ` · ${pend.avisos} aviso${pend.avisos > 1 ? 's' : ''} fora da conta` : ''}</span></h2></div>
      <div class="inspetor-corpo">${listaAcoes(pend.itens, true)}</div>
    </aside>`;
  }

  const k = d.ko;
  const par = (rot, val, tom = '') =>
    `<div class="par"><dt>${esc(rot)}</dt><dd${tom ? ` class="${tom}"` : ''}>${val}</dd></div>`;
  const incompleta = d.saude.faltando.length > 0;
  const p = d.saude.prazo;

  return `<aside class="inspetor" data-testid="inspetor" aria-label="${esc(d.o.nome)}">
    <div class="inspetor-cab">
      <h2>${esc(d.o.nome)}<span class="sub">${esc([d.cliente, d.o.cidade].filter(Boolean).join(' · ') || 'sem cliente vinculado')}</span></h2>
      <button class="btn sutil icone" data-acao="carteira-limpar" title="Fechar" aria-label="Fechar o inspetor">${svg(ICO.x, 13)}</button>
    </div>
    <div class="inspetor-corpo">
      <div class="inspetor-secao">
        ${celulaSaude(d)}
        ${d.saude.motivos.length > 1 ? `<p class="inspetor-motivos tinta2">${d.saude.motivos.map((m) => esc(m.texto)).join(' · ')}</p>` : ''}
        ${
          incompleta
            ? `<p class="inspetor-motivos tinta2">Falta ${esc(d.saude.faltando.join(' e '))}.
                 <button class="btn-link" data-acao="ir" data-view="obra-config" data-obra="${esc(d.o.id)}">Completar</button></p>`
            : ''
        }
      </div>
      <div class="inspetor-secao">
        <dl class="pares">
          ${incompleta ? '' : par('Avanço físico', `${fmtPct(k.progressoFisico, 0)} <span class="tinta3">de ${fmtPct(d.previsto, 0)} previsto</span>`)}
          ${p.termino ? par('Término projetado', `${fmtDataCurtaAno(p.termino)}${p.atrasoDias ? ` <span class="${p.atrasoDias >= 30 ? 'atraso' : 'cel-aviso-alerta'}">+${p.atrasoDias}d</span>` : ''} <span class="tinta3">contrato ${fmtDataCurtaAno(p.fimPrevisto)}</span>`) : ''}
          ${d.va.idp !== null ? par('IDP · IDC', `${fmtNum(d.va.idp, 2)} · ${d.va.idc === null ? '—' : fmtNum(d.va.idc, 2)} <span class="tinta3">prazo · custo</span>`, d.va.idp < 0.85 ? 'atraso' : '') : ''}
          ${k.custoPrevisto > 0 ? par('Custo', `${fmtMoneyCurto(k.totalPago)} <span class="tinta3">de ${fmtMoneyCurto(k.custoPrevisto)}</span>`) : ''}
          ${par('Caixa', dinheiro(k.saldoCaixa))}
          ${par('Resultado', k.venda > 0 ? `${dinheiro(k.resultado)} <span class="tinta3">${fmtPct(k.margem)}</span>` : '<span class="tinta3">sem valor de venda</span>')}
        </dl>
      </div>
      ${
        incompleta
          ? ''
          : `<div class="inspetor-secao inspetor-curva"><h3>Curva S</h3>${graficoCurvaS(d.o, 150)}</div>`
      }
      <div class="inspetor-secao">
        <h3>Precisa de ação${d.pend.total ? ` (${d.pend.total})` : ''}</h3>
        ${listaAcoes(d.pend.itens, false)}
      </div>
      <div class="inspetor-secao">${botao('Abrir a obra', 'ir', { view: 'painel', obra: d.o.id }, 'btn primario larga')}</div>
    </div>
  </aside>`;
}

function dadosObraPorId(id) {
  const o = Store.estado.obras.find((x) => x.id === id);
  return o ? dadosObra(o) : null;
}

/* ------------------------------------------- curva S e próximos 14 dias */

/* Agenda enxuta: só dinheiro (parcela, compra) e entrega de etapa, no
   máximo 7 linhas — 26 itens empurravam para baixo o que importa. */
const AGENDA_MAX = 7;
const AGENDA_TIPOS = new Set(['recebimento', 'material', 'etapa']);

/* Ranking por IDP no lugar da curva S da carteira: a curva ponderada pelo
   custo deixava a casa doente sumir atrás do sobrado. Pior ritmo primeiro. */
function rankingIdp(obras) {
  const linhas = obras
    .map((o) => ({ o, va: valorAgregadoObra(o) }))
    .filter((x) => x.va.idp !== null)
    .sort((a, b) => a.va.idp - b.va.idp);
  if (!linhas.length) return '<p class="tinta2 inspetor-vazio">Nenhuma obra com cronograma em andamento.</p>';
  return `<ol class="ranking-idp">${linhas
    .map(({ o, va }) => {
      const tom = tomNivel(nivelIndice(va.idp, 'idp'));
      return `<li><button class="ranking-item" data-acao="ir" data-view="curva" data-obra="${esc(o.id)}">
        <span class="ranking-nome">${esc(o.nome)}</span>
        <span class="ranking-barra"><i class="${tom}" style="width:${Math.min(100, va.idp * 100).toFixed(1)}%"></i></span>
        <span class="ranking-num ${tom}">IDP ${fmtIndice(va.idp)}</span>
        <span class="ranking-num tinta2">IDC ${fmtIndice(va.idc)}</span>
      </button></li>`;
    })
    .join('')}</ol>`;
}

function baixo(obras) {
  const todos = agendaCarteira(obras).filter((x) => AGENDA_TIPOS.has(x.tipo));
  const agenda = todos.slice(0, AGENDA_MAX);
  const ROTULO = {
    recebimento: 'Parcela',
    material: 'Compra',
    etapa: 'Etapa',
  };
  const lista = agenda.length
    ? `<ol class="agenda">${agenda
        .map(
          (
            x,
          ) => `<li><button class="agenda-item" data-acao="ir" data-view="${esc(x.view)}" data-obra="${esc(x.obraId)}">
            <span class="agenda-data"><b>${fmtDataCurta(x.data)}</b><span>${diaSemana(x.data)}</span></span>
            <span class="agenda-txt"><b>${esc(x.titulo)}</b><span>${esc(x.obraNome)}${
              x.valor ? ` · ${fmtMoney(x.valor, { dec: 0 })}` : ''
            } · ${ROTULO[x.tipo]}</span></span>
          </button></li>`,
        )
        .join('')}</ol>${
        todos.length > agenda.length
          ? `<p class="tinta3" style="margin:var(--e2) 0 0;font-size:var(--t-peq)">+ ${todos.length - agenda.length} depois destes</p>`
          : ''
      }`
    : '<p class="tinta2 inspetor-vazio">Nada vence nos próximos 14 dias.</p>';

  return `<div class="carteira-baixo">
    <section class="secao">
      <div class="secao-cab"><h2>Obras por ritmo</h2><span class="contagem">IDP: realizado ÷ previsto hoje · pior primeiro</span></div>
      ${rankingIdp(obras)}
    </section>
    <section class="secao">
      <div class="secao-cab"><h2>Próximos 14 dias</h2><span class="contagem">dinheiro e entregas</span></div>
      ${lista}
    </section>
  </div>`;
}

/* ------------------------------------------------------------- tela */

VIEWS.carteira = () => {
  if (!Store.estado.obras.length) {
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

  const obrasBase = base();
  const ds = linhas();
  const f = FILTROS_KPI[tela.kpi];

  return `<div class="tela-carteira">
    <div class="tela-principal">
      ${fraseAncoraHTML(historiaCarteira(obrasBase), { mostrarObra: true })}
      ${kpis(obrasBase)}
      ${
        f
          ? `<div class="filtro-ativo">Mostrando <b>${esc(f.rotulo)}</b>
               <button class="btn-link" data-acao="carteira-kpi" data-kpi="${tela.kpi}">Mostrar todas</button></div>`
          : ''
      }
      ${tabela(ds, obrasBase.length)}
      ${baixo(obrasBase)}
    </div>
    ${inspetor(ds, obrasBase)}
  </div>`;
};

/* Lista à esquerda, inspetor à direita, cada painel com a própria rolagem. */
VIEWS.carteira.paineis = true;

/* --------------------------------------------------------- toolbar */
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

export { COLUNAS, linhas, tela };
