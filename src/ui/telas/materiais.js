/**
 * telas/materiais.js — Plano de materiais, na linguagem nova.
 *
 * Melhorias sobre a tela antiga (cartao/kpi/chip):
 * - KPIs clicáveis (Falta comprar, Vencidos, Já comprado, Desvio de orçamento).
 * - "Desvio de orçamento" é novo na tela — materialCalc já calculava
 *   (valor comprado × preço previsto) mas nenhuma tela mostrava. Compra mais
 *   cara ou mais barata que o previsto agora aparece no KPI e no hover da
 *   coluna Necessário.
 * - Filtro "Situação" (a comprar/vencidos/comprados) duplicava os três
 *   primeiros KPIs — os KPIs fazem esse corte agora, e o filtro some.
 *
 * Nada aqui calcula: materialCalc (dominio/calculos.js) é a única fonte dos
 * números — comprada, saldo, orçamento, vencido e desvio.
 */
import {
  diasEntre,
  esc,
  fmtDataCurta,
  fmtMoney,
  fmtMoneyCurto,
  fmtNum,
  fmtPct,
  hojeISO,
  isISO,
  norm,
} from '../../nucleo/base.js';
import { materialCalc } from '../../dominio/calculos.js';
import { graficoBarras } from '../../graficos/index.js';
import { Store } from '../../dados/store.js';
import { ACOES } from '../acoes.js';
import { App, botao, opcoesLista } from '../shell.js';
import { VIEWS } from '../telas-obra.js';
import {
  acoesRegistro,
  barraFiltros,
  botaoNovo,
  buscaToolbar,
  dinheiro,
  lista,
  secao,
  seletor,
  vazioTela,
} from './componentes.js';

/* --------------------------------------------------------------- KPIs */
function kpisMateriais(todos) {
  const orcTotal = todos.reduce((s, x) => s + x.c.orcamento, 0);
  const compradoTotal = todos.reduce((s, x) => s + x.c.valorComprado, 0);
  const saldoTotal = todos.reduce((s, x) => s + x.c.saldoValor, 0);
  const comSaldo = todos.filter((x) => x.c.saldo > 0.005 && x.m.status !== 'Cancelado');
  const vencidos = todos.filter((x) => x.c.vencido);
  const comCompra = todos.filter((x) => x.c.compras > 0);
  const desvioTotal = comCompra.reduce((s, x) => s + x.c.desvio, 0);

  const item = (chave, rotulo, valor, contexto, tom = '') => {
    const ativo = App.filtros.kpiMat === chave;
    return `<div class="kpi-item${ativo ? ' ativo' : ''}" data-acao="mat-kpi" data-kpi="${chave}"
        role="button" tabindex="0" aria-pressed="${ativo}" title="Filtrar a lista">
      <span class="kpi-rot">${esc(rotulo)}</span>
      <span class="kpi-val${tom ? ' ' + tom : ''}">${valor}</span>
      <span class="kpi-ctx">${contexto}</span>
    </div>`;
  };

  return `<div class="kpis" role="group" aria-label="Indicadores do plano de materiais">
    ${item(
      'comprar',
      'Falta comprar',
      fmtMoney(saldoTotal, { dec: 0 }),
      `${comSaldo.length} item${comSaldo.length === 1 ? '' : 's'} com saldo`,
      saldoTotal > 0.005 ? 'tom-alerta' : '',
    )}
    ${item(
      'vencidos',
      'Vencidos sem compra',
      vencidos.length,
      vencidos.length
        ? `${fmtMoney(
            vencidos.reduce((s, x) => s + x.c.saldoValor, 0),
            { dec: 0 },
          )} — comprar já`
        : 'nada em atraso',
      vencidos.length ? 'atraso' : '',
    )}
    ${item(
      'comprados',
      'Já comprado',
      fmtMoney(compradoTotal, { dec: 0 }),
      orcTotal
        ? `${fmtPct(compradoTotal / orcTotal, 0)} de ${fmtMoney(orcTotal, { dec: 0 })} orçados`
        : `${todos.length} item${todos.length === 1 ? '' : 's'} no plano`,
    )}
    ${item(
      'desvio',
      'Desvio de orçamento',
      comCompra.length
        ? `${desvioTotal >= 0 ? '+' : '−'}${fmtMoney(Math.abs(desvioTotal), { dec: 0 })}`
        : '—',
      !comCompra.length
        ? 'sem compras ainda'
        : desvioTotal > 0.5
          ? 'acima do previsto'
          : desvioTotal < -0.5
            ? 'abaixo do previsto'
            : 'dentro do previsto',
      desvioTotal > 0.5 ? 'atraso' : '',
    )}
  </div>`;
}

ACOES['mat-kpi'] = (el, d) => {
  App.filtros.kpiMat = App.filtros.kpiMat === d.kpi ? '' : d.kpi;
  App.renderConteudo();
};

/* -------------------------------------------------------------- tabela */
function celulaMaterial(m) {
  const sub = [
    m.etapa || 'sem etapa',
    m.prioridade && m.prioridade !== 'Média' ? m.prioridade : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return `<div class="cel-obra"><b>${esc(m.material || '—')}</b><span>${esc(sub)}</span></div>`;
}

function celulaNecessario(m, c) {
  const temDesvio = c.compras > 0 && Math.abs(c.desvio) > 0.5;
  const desvioTxt = temDesvio
    ? c.desvio > 0
      ? `${fmtMoney(c.desvio, { dec: 0 })} acima do previsto`
      : `${fmtMoney(-c.desvio, { dec: 0 })} abaixo do previsto`
    : '';
  return `<div class="cel-num-nota"${desvioTxt ? ` title="${esc(desvioTxt)}"` : ''}>
    <b>${fmtNum(m.quantidadeNecessaria, 2)} ${esc(m.unidade || '')}</b>
    <span>comprado ${fmtNum(c.comprada, 2)}</span>
  </div>`;
}

function celulaPrazo(m, c, hoje) {
  if (!isISO(m.dataNecessaria)) {
    return '<span class="tinta3">—</span>';
  }
  let sub, cls;
  if (c.vencido) {
    const dias = diasEntre(m.dataNecessaria, hoje);
    sub = `vencido há ${dias} dia${dias === 1 ? '' : 's'}`;
    cls = 'atraso';
  } else {
    const d = diasEntre(hoje, m.dataNecessaria);
    sub = d <= 0 ? 'hoje' : `em ${d} dia${d === 1 ? '' : 's'}`;
    cls = d <= 3 ? 'tom-alerta' : '';
  }
  return `<div style="display:flex;flex-direction:column;line-height:1.3;gap:2px">
    <span class="${cls || 'tinta2'}">${esc(fmtDataCurta(m.dataNecessaria))}</span>
    <span class="${cls || 'tinta3'}" style="font-size:var(--t-peq)">${esc(sub)}</span>
  </div>`;
}

function situacaoMaterial(m, c) {
  if (m.status === 'Cancelado') return { texto: 'Cancelado', tom: 'tinta3' };
  if (c.vencido) return { texto: 'Vencido', tom: 'atraso' };
  if (c.saldo <= 0.005) return { texto: 'Comprado', tom: 'feito' };
  return { texto: m.status || 'Planejar', tom: m.status === 'Comprado parcial' ? '' : 'tinta3' };
}

function celulaSituacao(m, c) {
  const s = situacaoMaterial(m, c);
  return `<span class="situacao-ct ${s.tom}"><span class="pt"></span>${esc(s.texto)}</span>`;
}

const colunasMateriais = (hoje) => [
  {
    k: 'material',
    rotulo: 'Material',
    largura: '22%',
    celular: 'principal',
    valor: (d) => (d.m.material || '').toLowerCase(),
    celula: (d) => celulaMaterial(d.m),
  },
  {
    k: 'necessario',
    rotulo: 'Necessário',
    largura: '13%',
    num: true,
    celular: 'some',
    valor: (d) => d.m.quantidadeNecessaria,
    celula: (d) => celulaNecessario(d.m, d.c),
  },
  {
    k: 'falta',
    rotulo: 'Falta',
    largura: '9%',
    num: true,
    celular: 'some',
    valor: (d) => d.c.saldo,
    celula: (d) => `<b class="${d.c.vencido ? 'atraso' : ''}">${fmtNum(d.c.saldo, 2)}</b>`,
  },
  {
    k: 'faltaValor',
    rotulo: 'Falta (R$)',
    largura: '12%',
    num: true,
    valor: (d) => d.c.saldoValor,
    celula: (d) => dinheiro(d.c.saldoValor, { cinzaNoZero: true, dec: 0 }),
    total: (ds) =>
      dinheiro(
        ds.reduce((s, d) => s + d.c.saldoValor, 0),
        { dec: 0 },
      ),
  },
  {
    k: 'prazo',
    rotulo: 'Comprar até',
    largura: '15%',
    valor: (d) => (d.c.vencido ? '0' : '1') + (d.m.dataNecessaria || '9999-99-99'),
    celula: (d) => celulaPrazo(d.m, d.c, hoje),
  },
  {
    k: 'situacao',
    rotulo: 'Situação',
    largura: '14%',
    celular: 'some',
    valor: (d) => situacaoMaterial(d.m, d.c).texto,
    celula: (d) => celulaSituacao(d.m, d.c),
  },
  {
    k: 'acoes',
    rotulo: '',
    largura: '15%',
    celula: (d) =>
      `${
        !Store.somenteLeitura() && d.c.saldo > 0.005 && d.m.status !== 'Cancelado'
          ? `<button class="btn sutil pequeno" data-acao="comprar-material" data-id="${esc(d.m.id)}">Comprar</button>`
          : ''
      }${acoesRegistro('material', d.m.id, d.m.material)}`,
  },
];

/* ---------------------------------------------------------------- tela */
VIEWS.materiais = () => {
  const o = App.obra();

  if (!o.materiais.length) {
    return vazioTela({
      titulo: 'Plano vazio',
      texto:
        'Liste o que será necessário por etapa. Ao lançar a compra, o saldo é atualizado sozinho.',
      acao: botao('Novo material', 'novo-material', {}, 'btn primario', 'mais'),
    });
  }

  const f = App.filtros;
  const hoje = hojeISO();
  const todos = o.materiais.map((m) => ({ m, c: materialCalc(o, m) }));

  const etapas = [...new Set(o.materiais.map((m) => m.etapa).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'pt'),
  );
  const busca = norm(f.busca || '');

  let itens = todos;
  if (f.etapa) itens = itens.filter((d) => d.m.etapa === f.etapa);
  if (f.prioridade) itens = itens.filter((d) => d.m.prioridade === f.prioridade);
  if (f.status) itens = itens.filter((d) => d.m.status === f.status);
  if (f.kpiMat === 'comprar')
    itens = itens.filter((d) => d.c.saldo > 0.005 && d.m.status !== 'Cancelado');
  if (f.kpiMat === 'vencidos') itens = itens.filter((d) => d.c.vencido);
  if (f.kpiMat === 'comprados')
    itens = itens.filter((d) => d.c.saldo <= 0.005 && d.m.status !== 'Cancelado');
  if (f.kpiMat === 'desvio')
    itens = itens.filter((d) => d.c.compras > 0 && Math.abs(d.c.desvio) > 0.5);
  if (busca)
    itens = itens.filter((d) =>
      norm(`${d.m.material} ${d.m.etapa} ${d.m.observacoes}`).includes(busca),
    );

  const barra = barraFiltros({
    mostrar: o.materiais.length > 1,
    controles: [
      etapas.length > 1 ? seletor('etapa', etapas, 'Todas as etapas') : '',
      seletor('prioridade', opcoesLista('prioridades'), 'Toda prioridade'),
      seletor('status', opcoesLista('statusMaterial'), 'Todos os status'),
    ],
    filtrados: itens.length,
    total: o.materiais.length,
  });

  const comSaldo = todos.filter((x) => x.c.saldo > 0.005 && x.m.status !== 'Cancelado');
  const faltaPorEtapa = Object.entries(
    comSaldo.reduce((a, x) => {
      const e = x.m.etapa || 'Sem etapa';
      a[e] = (a[e] || 0) + x.c.saldoValor;
      return a;
    }, {}),
  ).map(([rotulo, valor]) => ({ rotulo, valor: Math.round(valor * 100) / 100 }));

  return `<div class="tela-lista">
    ${kpisMateriais(todos)}
    ${barra}
    ${lista({
      id: 'materiais',
      testid: 'lista-materiais',
      colunas: colunasMateriais(hoje),
      itens,
      ordemPadrao: { col: 'prazo', dir: 1 },
      rodapeRotulo: (n) => `${n} itens`,
    })}
    ${faltaPorEtapa.length > 1 ? secao('Falta comprar por etapa', graficoBarras(faltaPorEtapa, { formata: (v) => fmtMoneyCurto(v), cor: 'var(--alerta)' })) : ''}
  </div>`;
};

VIEWS.materiais.toolbar = () => {
  const o = App.obra();
  if (!o || !o.materiais.length) return '';
  return `${buscaToolbar('Buscar material, etapa…', 'busca-materiais')}
    ${botaoNovo('Novo material', 'novo-material')}`;
};
