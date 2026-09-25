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
import { coberturaPlanoMateriais, materialCalc } from '../../dominio/calculos.js';
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
  faixaKpis,
  lista,
  painelAnalise,
  vazioTela,
} from './componentes.js';

/* --------------------------------------------------------------- KPIs */
function kpisMateriais(todos, cobertura) {
  const orcTotal = todos.reduce((s, x) => s + x.c.orcamento, 0);
  const compradoTotal = todos.reduce((s, x) => s + x.c.valorComprado, 0);
  const saldoTotal = todos.reduce((s, x) => s + x.c.saldoValor, 0);
  const comSaldo = todos.filter((x) => x.c.saldo > 0.005 && x.m.status !== 'Cancelado');
  const vencidos = todos.filter((x) => x.c.vencido);
  const travando = vencidos.filter((x) => x.c.travaFrente);
  const comCompra = todos.filter((x) => x.c.compras > 0);
  const desvioTotal = comCompra.reduce((s, x) => s + x.c.desvio, 0);

  return faixaKpis(
    [
      {
        chave: 'comprar',
        rotulo: 'Falta comprar',
        valor: fmtMoney(saldoTotal, { dec: 0 }),
        contexto: `${comSaldo.length} item${comSaldo.length === 1 ? '' : 's'} com saldo`,
        tom: saldoTotal > 0.005 ? 'tom-alerta' : '',
      },
      {
        chave: 'vencidos',
        rotulo: 'Vencidos sem compra',
        valor: vencidos.length,
        contexto: travando.length
          ? `${travando.length} travando etapa em andamento`
          : vencidos.length
            ? `${fmtMoney(
                vencidos.reduce((s, x) => s + x.c.saldoValor, 0),
                { dec: 0 },
              )} — comprar já`
            : 'nada em atraso',
        tom: vencidos.length ? 'atraso' : '',
      },
      {
        chave: 'comprados',
        rotulo: 'Já comprado',
        valor: fmtMoney(compradoTotal, { dec: 0 }),
        contexto: orcTotal
          ? `${fmtPct(compradoTotal / orcTotal, 0)} de ${fmtMoney(orcTotal, { dec: 0 })} orçados`
          : `${todos.length} item${todos.length === 1 ? '' : 's'} no plano`,
      },
      {
        chave: 'desvio',
        rotulo: 'Desvio de orçamento',
        valor: comCompra.length
          ? `${desvioTotal >= 0 ? '+' : '−'}${fmtMoney(Math.abs(desvioTotal), { dec: 0 })}`
          : '—',
        contexto:
          (!comCompra.length
            ? 'sem compras ainda'
            : desvioTotal > 0.5
              ? 'acima do previsto'
              : desvioTotal < -0.5
                ? 'abaixo do previsto'
                : 'dentro do previsto') +
          /* o desvio só mede o que está no plano: diz quanto isso é */
          (cobertura.fracao === null
            ? ''
            : ` · plano cobre ${fmtPct(cobertura.fracao, 0)} das compras`),
        tom: desvioTotal > 0.5 ? 'atraso' : '',
      },
    ],
    { rotulo: 'Indicadores do plano de materiais', acao: 'mat-kpi', ativo: App.filtros.kpiMat },
  );
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
  if (c.saldo <= 0 || m.status === 'Cancelado' || c.etapaConcluida) {
    /* Já comprado (ou cancelado): a data é histórico, não prazo. Antes caía
       em "hoje" laranja, que parecia alerta. */
    return `<span class="tinta3">${esc(fmtDataCurta(m.dataNecessaria))}</span>`;
  }
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
  /* o diário registrou que a falta dele parou o serviço */
  if (c.ocorrencias.length) return { texto: 'Parou a frente (diário)', tom: 'atraso', diario: c.ocorrencias[0] };
  if (c.travaFrente) return { texto: 'Travando a etapa', tom: 'atraso' };
  if (c.vencido) return { texto: 'Vencido', tom: 'atraso' };
  if (c.excesso > 0.005) return { texto: `Comprado +${fmtNum(c.excesso, 0)} ${m.unidade || ''}`.trim(), tom: 'tom-alerta' };
  if (c.saldo <= 0.005) return { texto: 'Comprado', tom: 'feito' };
  /* sobra do plano numa etapa que já acabou: não é pendência */
  if (c.etapaConcluida) return { texto: 'Etapa concluída', tom: 'tinta3' };
  return { texto: m.status || 'Planejar', tom: m.status === 'Comprado parcial' ? '' : 'tinta3' };
}

function celulaSituacao(m, c) {
  const s = situacaoMaterial(m, c);
  const txt = `<span class="situacao-ct ${s.tom}"><span class="pt"></span>${esc(s.texto)}</span>`;
  if (!s.diario) return txt;
  const texto = String(s.diario.ocorrencias || '').trim();
  return `<button class="btn-link" data-acao="ir" data-view="diario" title="${esc(texto || 'Ver no diário')}">${txt}</button>`;
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
    /* "Comprar" separado do lápis e da lixeira: no celular, o dedo que
       ia comprar não pode cair no excluir */
    celula: (d) =>
      `<span class="acoes-material">${
        !Store.somenteLeitura() && d.c.saldo > 0.005 && d.m.status !== 'Cancelado'
          ? `<button class="btn sutil pequeno" data-acao="comprar-material" data-id="${esc(d.m.id)}">Comprar</button>`
          : ''
      }<span class="acoes-registro">${acoesRegistro('material', d.m.id, d.m.material)}</span></span>`,
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

  /* status em pílula; etapa e prioridade no "Mais filtros" */
  const conta = (fn) => todos.filter(fn).length;
  const barra = barraFiltros({
    pilulas: {
      chave: 'status',
      todos: 'Todos',
      total: todos.length,
      opcoes: opcoesLista('statusMaterial').map((st) => ({
        valor: st,
        rotulo: st,
        n: conta((d) => d.m.status === st),
      })),
    },
    mais: [
      {
        chave: 'etapa',
        rotulo: 'Etapa',
        todos: 'Todas as etapas',
        opcoes: etapas.map((e) => [e, e, conta((d) => d.m.etapa === e)]),
      },
      {
        chave: 'prioridade',
        rotulo: 'Prioridade',
        todos: 'Toda prioridade',
        opcoes: opcoesLista('prioridades')
          .map((pr) => [pr, pr, conta((d) => d.m.prioridade === pr)])
          .filter((op) => op[2] > 0),
      },
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
    ${kpisMateriais(todos, coberturaPlanoMateriais(o))}
    ${barra}
    ${lista({
      id: 'materiais',
      testid: 'lista-materiais',
      colunas: colunasMateriais(hoje),
      itens,
      ordemPadrao: { col: 'prazo', dir: 1 },
      rodapeRotulo: (n) => `${n} itens`,
    })}
    ${painelAnalise([
      {
        titulo: 'Falta comprar por etapa',
        conteudo:
          faltaPorEtapa.length > 1
            ? graficoBarras(faltaPorEtapa, { formata: (v) => fmtMoneyCurto(v), cor: 'var(--serie2)' })
            : '',
      },
    ])}
  </div>`;
};

VIEWS.materiais.toolbar = () => {
  const o = App.obra();
  if (!o || !o.materiais.length) return '';
  return `${buscaToolbar('Buscar material, etapa…', 'busca-materiais')}
    ${botaoNovo('Novo material', 'novo-material')}`;
};
