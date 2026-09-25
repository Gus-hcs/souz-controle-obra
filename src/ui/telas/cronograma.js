/**
 * telas/cronograma.js — Cronograma da obra, na linguagem nova.
 *
 * Fase 1 do redesenho (ver briefing): KPIs clicáveis, tabela em lista() e o
 * Gantt corrige o bug de opacidade (progresso ficava invisível — a trilha e
 * o preenchimento eram a mesma cor sólida, ver graficos/index.js). Fases 2 a
 * 4 (Gantt interativo, fotos do diário, progresso rápido, mobile) vêm depois.
 *
 * Nada aqui calcula: etapaCalc, valorAgregadoObra e prazoObra vêm de
 * dominio/calculos.js.
 */
import {
  esc,
  fmtData,
  fmtDataCurta,
  fmtNum,
  fmtPct,
  hojeISO,
  isISO,
  norm,
} from '../../nucleo/base.js';
import {
  agendaCronograma,
  etapaCalc,
  kpisObra,
  nivelIndice,
  prazoObra,
  temDependencias,
  valorAgregadoObra,
} from '../../dominio/calculos.js';
import { graficoGantt } from '../../graficos/index.js';
import { ACOES } from '../acoes.js';
import { App, botao } from '../shell.js';
import { VIEWS } from '../telas-obra.js';
import {
  acoesRegistro,
  barraFiltros,
  botaoNovo,
  buscaToolbar,
  fmtIndice,
  faixaKpis,
  lista,
  secao,
  tomNivel,
  vazioTela,
} from './componentes.js';

const TOM_SITUACAO_ETAPA = {
  ATRASADO: 'atraso',
  CONCLUÍDO: 'feito',
  'NÃO INICIADO': 'tinta3',
  'NÃO PLANEJADO': 'tinta3',
};

/* --------------------------------------------------------------- KPIs
   Primeiro a resposta: quando a obra acaba no ritmo de hoje (término
   projetado, valorAgregadoObra) contra a data do contrato. Depois o que
   está travado — fim vencido E início vencido. "Próxima entrega" é a
   próxima etapa com fim no futuro; as vencidas já estão no KPI 2. */
const atrasadaOuTravada = (c) => c.situacao === 'ATRASADO' || c.atrasoInicio > 0;

function kpisCronograma(o) {
  const k = kpisObra(o);
  const va = valorAgregadoObra(o);
  const prazo = prazoObra(o);
  const hoje = hojeISO();
  const abertas = o.cronograma
    .filter((e) => etapaCalc(e).progresso < 1 && isISO(e.fimPrevisto) && e.fimPrevisto >= hoje)
    .sort((a, b) => a.fimPrevisto.localeCompare(b.fimPrevisto));
  const proxima = abertas[0];
  const nTravadas = k.etapasAtrasadas + k.etapasInicioAtrasado;

  const atraso = va.atrasoProjetado;

  return faixaKpis(
    [
      {
        chave: 'entrega',
        rotulo: 'Término projetado',
        valor: va.termino ? fmtData(va.termino) : '—',
        contexto: `${prazo.fimPrevisto ? `contrato ${fmtDataCurta(prazo.fimPrevisto)}` : 'sem data contratual'}${
          atraso > 0 ? ` · +${atraso} d` : ''
        }`,
        tom: atraso > 0 ? (atraso >= 30 ? 'atraso' : 'tom-alerta') : '',
        filtra: false,
      },
      {
        chave: 'fisico',
        rotulo: 'Avanço físico',
        valor: fmtPct(k.progressoFisico, 0),
        contexto: `previsto ${fmtPct(va.previsto, 0)} · IDP ${fmtIndice(va.idp)}`,
        tom: tomNivel(nivelIndice(va.idp, 'idp')),
        filtra: false,
      },
      {
        chave: 'atrasadas',
        rotulo: 'Etapas atrasadas',
        valor: nTravadas,
        contexto: nTravadas
          ? [
              k.etapasAtrasadas ? `${k.etapasAtrasadas} com fim vencido` : '',
              k.etapasInicioAtrasado ? `${k.etapasInicioAtrasado} sem começar` : '',
            ]
              .filter(Boolean)
              .join(' · ')
          : 'tudo no prazo',
        tom: nTravadas ? 'atraso' : '',
      },
      {
        chave: 'proxima',
        rotulo: 'Próxima entrega',
        valor: proxima ? esc(proxima.etapa || '—') : '—',
        contexto: proxima ? fmtDataCurta(proxima.fimPrevisto) : 'nada com fim à frente',
        filtra: false,
      },
    ],
    { rotulo: 'Indicadores do cronograma', acao: 'crono-kpi', ativo: App.filtros.kpiCrono },
  );
}

ACOES['crono-kpi'] = (el, d) => {
  App.filtros.kpiCrono = App.filtros.kpiCrono === d.kpi ? '' : d.kpi;
  App.renderConteudo();
};

/* Selo de fotos na linha do Gantt (Fase 3, graficos/index.js) — leva ao
   Diário já filtrado pela etapa clicada. */
ACOES['ir-diario-etapa'] = (el, d) => {
  App.ir('diario', d.obra);
  App.filtros = { etapa: d.etapa };
  App.renderConteudo();
};

/* -------------------------------------------------------------- tabela */
function celulaEtapa(e, nomes) {
  /* "depois de Alvenaria" (0017): a dependência à vista na linha */
  const depois = (e.predecessoras || []).map((id) => nomes.get(id)).filter(Boolean);
  const sub = [e.responsavel || '', depois.length ? `depois de ${depois.join(', ')}` : ''].filter(Boolean).join(' · ');
  return `<div class="cel-obra"><b>${esc(e.etapa || '—')}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</div>`;
}

function celulaPrevisto(e, c) {
  const temData = isISO(e.inicioPrevisto) || isISO(e.fimPrevisto);
  const txt = temData
    ? `${isISO(e.inicioPrevisto) ? fmtDataCurta(e.inicioPrevisto) : '?'} → ${isISO(e.fimPrevisto) ? fmtDataCurta(e.fimPrevisto) : '?'}`
    : '';
  return `<div style="display:flex;flex-direction:column;line-height:1.3;gap:2px">
    <span class="tinta2">${temData ? esc(txt) : '<span class="tinta3">—</span>'}</span>
    ${c.diasPrevistos ? `<span class="tinta3" style="font-size:var(--t-peq)">${c.diasPrevistos} dias</span>` : ''}
  </div>`;
}

function celulaReal(e, c) {
  const txt = isISO(e.inicioReal)
    ? `${fmtDataCurta(e.inicioReal)} → ${isISO(e.fimReal) ? fmtDataCurta(e.fimReal) : 'em curso'}`
    : '';
  const sub =
    c.atraso > 0
      ? `${c.atraso} dia${c.atraso === 1 ? '' : 's'} de atraso`
      : e.quantidadeExecutada
        ? `${fmtNum(e.quantidadeExecutada, 1)} ${e.unidadeProducao || ''}${c.produtividade ? ` · ${fmtNum(c.produtividade, 1)} ${e.unidadeProducao ? e.unidadeProducao + '/' : 'por '}dia` : ''}`
        : '';
  return `<div style="display:flex;flex-direction:column;line-height:1.3;gap:2px">
    <span class="${c.atraso > 0 ? 'atraso' : 'tinta2'}">${txt ? esc(txt) : '<span class="tinta3">—</span>'}</span>
    ${sub ? `<span class="${c.atraso > 0 ? 'atraso' : 'tinta3'}" style="font-size:var(--t-peq)">${esc(sub)}</span>` : ''}
  </div>`;
}

function celulaProgresso(c) {
  return `<div class="barra-dupla">
    <span class="trilha"><i class="medido" style="width:${(c.progresso * 100).toFixed(1)}%"></i></span>
    <span class="txt">${fmtPct(c.progresso, 0)}</span>
  </div>`;
}

function celulaSituacaoEtapa(c, ag) {
  /* com dependências, embaixo: crítica (folga zero) ou quanto pode escorregar */
  const folga = !ag || ag.concluida
    ? ''
    : ag.critica
      ? '<span class="atraso">caminho crítico</span>'
      : `<span class="tinta3">folga ${ag.folga} d</span>`;
  const empilhar = (html) => (folga ? `<div class="cel-empilhada">${html}${folga}</div>` : html);
  if (c.atrasoInicio > 0) {
    return empilhar(`<span class="situacao-ct atraso"><span class="pt"></span>Início atrasado ${c.atrasoInicio}d</span>`);
  }
  const tom = TOM_SITUACAO_ETAPA[c.situacao] || '';
  const texto = c.situacao.charAt(0) + c.situacao.slice(1).toLowerCase();
  return empilhar(`<span class="situacao-ct ${tom}"><span class="pt"></span>${esc(texto)}</span>`);
}

const colunasCronograma = [
  {
    k: 'etapa',
    rotulo: 'Etapa',
    largura: '25%',
    celular: 'principal',
    valor: (d) => (d.e.etapa || '').toLowerCase(),
    celula: (d) => celulaEtapa(d.e, d.nomes),
  },
  {
    k: 'previsto',
    rotulo: 'Previsto',
    largura: '17%',
    celular: 'some',
    valor: (d) => d.e.fimPrevisto || '',
    celula: (d) => celulaPrevisto(d.e, d.c),
  },
  {
    k: 'real',
    rotulo: 'Real',
    largura: '19%',
    celular: 'some',
    valor: (d) => d.e.inicioReal || '',
    celula: (d) => celulaReal(d.e, d.c),
  },
  {
    k: 'progresso',
    rotulo: 'Progresso',
    largura: '18%',
    valor: (d) => d.c.progresso,
    celula: (d) => celulaProgresso(d.c),
  },
  {
    k: 'situacao',
    rotulo: 'Situação',
    largura: '15%',
    valor: (d) => (atrasadaOuTravada(d.c) ? '0' : '1') + d.e.fimPrevisto,
    celula: (d) => celulaSituacaoEtapa(d.c, d.ag),
  },
  {
    k: 'acoes',
    rotulo: '',
    largura: '6%',
    celula: (d) => acoesRegistro('etapa', d.e.id, d.e.etapa),
  },
];

/* ---------------------------------------------------------------- tela */
VIEWS.cronograma = () => {
  const o = App.obra();

  if (!o.cronograma.length) {
    return vazioTela({
      titulo: 'Cronograma não montado',
      texto:
        'Gere as etapas padrão de uma casa e depois ajuste datas, responsáveis e progresso a cada visita.',
      acao: `${botao('Gerar etapas padrão', 'gerar-cronograma', {}, 'btn primario', 'mais')} ${botao('Adicionar etapa', 'nova-etapa', {}, 'btn')}`,
    });
  }

  const f = App.filtros;
  const responsaveis = [...new Set(o.cronograma.map((e) => e.responsavel).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b, 'pt'),
  );

  const busca = norm(f.busca || '');
  /* agenda com dependências (0017): folga e caminho crítico por etapa */
  const agenda = temDependencias(o) ? agendaCronograma(o, hojeISO(), valorAgregadoObra(o).idp) : null;
  const porId = new Map(agenda ? agenda.etapas.map((a) => [a.id, a]) : []);
  const nomes = new Map(o.cronograma.map((e) => [e.id, e.etapa]));
  let itens = o.cronograma.map((e) => ({ e, c: etapaCalc(e), ag: porId.get(e.id) || null, nomes }));
  if (f.responsavel) itens = itens.filter((d) => d.e.responsavel === f.responsavel);
  if (f.situacao === 'atrasadas') itens = itens.filter((d) => atrasadaOuTravada(d.c));
  if (f.situacao === 'andamento') itens = itens.filter((d) => d.c.situacao === 'EM ANDAMENTO');
  if (f.situacao === 'nao-iniciadas')
    itens = itens.filter(
      (d) => d.c.situacao === 'NÃO INICIADO' || d.c.situacao === 'NÃO PLANEJADO',
    );
  if (f.situacao === 'concluidas') itens = itens.filter((d) => d.c.situacao === 'CONCLUÍDO');
  if (f.situacao === 'criticas') itens = itens.filter((d) => d.ag && d.ag.critica);
  if (f.kpiCrono === 'atrasadas') itens = itens.filter((d) => atrasadaOuTravada(d.c));
  if (busca) itens = itens.filter((d) => norm(`${d.e.etapa} ${d.e.responsavel}`).includes(busca));

  /* situação em pílula, com a contagem; responsável no "Mais filtros" */
  const todasEtapas = o.cronograma.map((e) => ({ e, c: etapaCalc(e), ag: porId.get(e.id) || null }));
  const conta = (fn) => todasEtapas.filter(fn).length;
  const barra = barraFiltros({
    pilulas: {
      chave: 'situacao',
      todos: 'Todas',
      total: o.cronograma.length,
      opcoes: [
        { valor: 'atrasadas', rotulo: 'Atrasadas', n: conta((d) => atrasadaOuTravada(d.c)) },
        { valor: 'andamento', rotulo: 'Em andamento', n: conta((d) => d.c.situacao === 'EM ANDAMENTO') },
        {
          valor: 'nao-iniciadas',
          rotulo: 'Não iniciadas',
          n: conta((d) => d.c.situacao === 'NÃO INICIADO' || d.c.situacao === 'NÃO PLANEJADO'),
        },
        { valor: 'concluidas', rotulo: 'Concluídas', n: conta((d) => d.c.situacao === 'CONCLUÍDO') },
        ...(agenda
          ? [{ valor: 'criticas', rotulo: 'Caminho crítico', n: conta((d) => d.ag && d.ag.critica) }]
          : []),
      ],
    },
    mais: [
      {
        chave: 'responsavel',
        rotulo: 'Responsável',
        todos: 'Todos os responsáveis',
        opcoes: responsaveis.map((r) => [r, r, conta((d) => d.e.responsavel === r)]),
      },
    ],
    filtrados: itens.length,
    total: o.cronograma.length,
  });

  return `<div class="tela-lista">
    ${kpisCronograma(o)}
    ${secao('Linha do tempo', graficoGantt(o))}
    ${barra}
    ${lista({
      id: 'cronograma',
      testid: 'lista-cronograma',
      colunas: colunasCronograma,
      itens,
      ordemPadrao: { col: 'situacao', dir: 1 },
      rodapeRotulo: (n) => `${n} etapas`,
    })}
  </div>`;
};

VIEWS.cronograma.toolbar = () => {
  const o = App.obra();
  if (!o || !o.cronograma.length) return '';
  return `${buscaToolbar('Buscar etapa, responsável…', 'busca-cronograma')}
    ${botaoNovo('Adicionar etapa', 'nova-etapa')}`;
};
