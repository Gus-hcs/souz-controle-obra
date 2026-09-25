/**
 * telas/cronograma.js — Cronograma da obra, na linguagem nova.
 *
 * Fase 1 do redesenho (ver briefing): KPIs clicáveis, tabela em lista() e o
 * Gantt corrige o bug de opacidade (progresso ficava invisível — a trilha e
 * o preenchimento eram a mesma cor sólida, ver graficos/index.js). Fases 2 a
 * 4 (Gantt interativo, fotos do diário, progresso rápido, mobile) vêm depois.
 *
 * Nada aqui calcula: etapaCalc, avancoPrevistoObra e prazoObra vêm de
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
import { avancoPrevistoObra, etapaCalc, kpisObra, prazoObra } from '../../dominio/calculos.js';
import { graficoGantt } from '../../graficos/index.js';
import { ACOES } from '../acoes.js';
import { App, botao } from '../shell.js';
import { VIEWS } from '../telas-obra.js';
import {
  acoesRegistro,
  barraFiltros,
  botaoNovo,
  buscaToolbar,
  lista,
  secao,
  seletor,
  vazioTela,
} from './componentes.js';

const TOM_SITUACAO_ETAPA = {
  ATRASADO: 'atraso',
  CONCLUÍDO: 'feito',
  'NÃO INICIADO': 'tinta3',
  'NÃO PLANEJADO': 'tinta3',
};

/* --------------------------------------------------------------- KPIs
   Só "Etapas atrasadas" filtra a lista — os outros três são informativos
   (data de entrega, próxima etapa a vencer), como em telas/carteira.js. */
function kpisCronograma(o) {
  const k = kpisObra(o);
  const previstoHoje = avancoPrevistoObra(o);
  const prazo = prazoObra(o);
  const abertas = o.cronograma
    .filter((e) => etapaCalc(e).progresso < 1 && isISO(e.fimPrevisto))
    .sort((a, b) => a.fimPrevisto.localeCompare(b.fimPrevisto));
  const proxima = abertas[0];
  const proximaAtrasada = proxima && proxima.fimPrevisto < hojeISO();

  const item = (chave, rotulo, valor, contexto, tom = '', filtravel = false) => {
    const ativo = filtravel && App.filtros.kpiCrono === chave;
    return `<div class="kpi-item${ativo ? ' ativo' : ''}"${filtravel ? ` data-acao="crono-kpi" data-kpi="${chave}" role="button" tabindex="0" aria-pressed="${ativo}" title="Filtrar a lista"` : ''}>
      <span class="kpi-rot">${esc(rotulo)}</span>
      <span class="kpi-val${tom ? ' ' + tom : ''}">${valor}</span>
      <span class="kpi-ctx">${contexto}</span>
    </div>`;
  };

  return `<div class="kpis" role="group" aria-label="Indicadores do cronograma">
    ${item('fisico', 'Avanço físico', fmtPct(k.progressoFisico, 0), `previsto ${fmtPct(previstoHoje, 0)} para hoje`)}
    ${item(
      'atrasadas',
      'Etapas atrasadas',
      k.etapasAtrasadas,
      k.etapasAtrasadas ? 'fim previsto já passou' : 'tudo no prazo',
      k.etapasAtrasadas ? 'atraso' : '',
      true,
    )}
    ${item(
      'entrega',
      /* É a data do contrato, não uma projeção: a entrega projetada pelo
         ritmo da obra ainda não é calculada. O atraso ao lado é o da etapa
         mais atrasada — e diz isso. */
      'Data contratual',
      prazo.fimPrevisto ? fmtData(prazo.fimPrevisto) : '—',
      prazo.desvioDias > 0
        ? `etapa mais atrasada: ${prazo.desvioDias} dia${prazo.desvioDias > 1 ? 's' : ''}`
        : 'etapas no prazo',
      prazo.desvioDias > 0 ? 'atraso' : '',
    )}
    ${item(
      'proxima',
      'Próxima entrega',
      proxima ? esc(proxima.etapa || '—') : '—',
      proxima
        ? `${fmtDataCurta(proxima.fimPrevisto)}${proximaAtrasada ? ' · atrasada' : ''}`
        : 'nada pendente',
      proximaAtrasada ? 'atraso' : '',
    )}
  </div>`;
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
function celulaEtapa(e) {
  const sub = e.responsavel || '';
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
        ? `${fmtNum(e.quantidadeExecutada, 1)} ${e.unidadeProducao || ''}${c.produtividade ? ` · ${fmtNum(c.produtividade, 1)}/dia` : ''}`
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

function celulaSituacaoEtapa(c) {
  const tom = TOM_SITUACAO_ETAPA[c.situacao] || '';
  const texto = c.situacao.charAt(0) + c.situacao.slice(1).toLowerCase();
  return `<span class="situacao-ct ${tom}"><span class="pt"></span>${esc(texto)}</span>`;
}

const colunasCronograma = [
  {
    k: 'etapa',
    rotulo: 'Etapa',
    largura: '25%',
    celular: 'principal',
    valor: (d) => (d.e.etapa || '').toLowerCase(),
    celula: (d) => celulaEtapa(d.e),
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
    valor: (d) => (d.c.situacao === 'ATRASADO' ? '0' : '1') + d.e.fimPrevisto,
    celula: (d) => celulaSituacaoEtapa(d.c),
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
  let itens = o.cronograma.map((e) => ({ e, c: etapaCalc(e) }));
  if (f.responsavel) itens = itens.filter((d) => d.e.responsavel === f.responsavel);
  if (f.situacao === 'atrasadas') itens = itens.filter((d) => d.c.situacao === 'ATRASADO');
  if (f.situacao === 'andamento') itens = itens.filter((d) => d.c.situacao === 'EM ANDAMENTO');
  if (f.situacao === 'nao-iniciadas')
    itens = itens.filter(
      (d) => d.c.situacao === 'NÃO INICIADO' || d.c.situacao === 'NÃO PLANEJADO',
    );
  if (f.situacao === 'concluidas') itens = itens.filter((d) => d.c.situacao === 'CONCLUÍDO');
  if (f.kpiCrono === 'atrasadas') itens = itens.filter((d) => d.c.situacao === 'ATRASADO');
  if (busca) itens = itens.filter((d) => norm(`${d.e.etapa} ${d.e.responsavel}`).includes(busca));

  const barra = barraFiltros({
    mostrar: o.cronograma.length > 1,
    controles: [
      responsaveis.length > 1 ? seletor('responsavel', responsaveis, 'Todos os responsáveis') : '',
      seletor(
        'situacao',
        [
          ['atrasadas', 'Atrasadas'],
          ['andamento', 'Em andamento'],
          ['nao-iniciadas', 'Não iniciadas'],
          ['concluidas', 'Concluídas'],
        ],
        'Situação: todas',
      ),
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
