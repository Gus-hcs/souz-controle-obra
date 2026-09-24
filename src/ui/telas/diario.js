/**
 * telas/diario.js — Diário de obra, na linguagem nova.
 *
 * Os cartões (data, clima, atividades, fotos) já eram bons — só a casca
 * (hero/kpi/chip) era antiga. Nada muda na regra: o diário continua sendo
 * texto livre por dia, sem cálculo de domínio.
 */
import {
  competencia,
  diasEntre,
  esc,
  fmtCompetencia,
  fmtData,
  fmtDataCurta,
  fmtNum,
  hojeISO,
  isISO,
  norm,
  num,
} from '../../nucleo/base.js';
import { ACOES } from '../acoes.js';
import { App, botao } from '../shell.js';
import { VIEWS } from '../telas-obra.js';
import {
  acoesRegistro,
  barraFiltros,
  botaoNovo,
  buscaToolbar,
  seletor,
  vazioTela,
} from './componentes.js';

function kpisDiario(todos, semRegistro, ultimo, totFotos, chuvosos, comOcorrencia) {
  const noMes = todos.filter((d) => competencia(d.data) === competencia(hojeISO())).length;
  const item = (chave, rotulo, valor, contexto, tom = '', filtravel = false) => {
    const ativo = filtravel && App.filtros.kpiDiario === chave;
    return `<div class="kpi-item${ativo ? ' ativo' : ''}"${filtravel ? ` data-acao="diario-kpi" data-kpi="${chave}" role="button" tabindex="0" aria-pressed="${ativo}" title="Filtrar a lista"` : ''}>
      <span class="kpi-rot">${esc(rotulo)}</span>
      <span class="kpi-val${tom ? ' ' + tom : ''}">${valor}</span>
      <span class="kpi-ctx">${contexto}</span>
    </div>`;
  };

  return `<div class="kpis" role="group" aria-label="Indicadores do diário">
    ${item('total', 'Registros', todos.length, `${noMes} neste mês`)}
    ${item(
      'inativo',
      'Sem registro há',
      semRegistro === null ? '—' : `${semRegistro} dia${semRegistro === 1 ? '' : 's'}`,
      semRegistro === null ? 'nenhuma visita registrada' : `último em ${fmtDataCurta(ultimo.data)}`,
      semRegistro !== null && semRegistro > 7 ? 'tom-alerta' : '',
    )}
    ${item('foto', 'Com foto', totFotos, chuvosos.length ? `${chuvosos.length} dia${chuvosos.length === 1 ? '' : 's'} de chuva` : 'nenhum dia de chuva', '', true)}
    ${item(
      'ocorrencia',
      'Com ocorrência',
      comOcorrencia.length,
      comOcorrencia.length ? 'confira antes de fechar a semana' : 'nada registrado',
      comOcorrencia.length ? 'atraso' : '',
      true,
    )}
  </div>`;
}

ACOES['diario-kpi'] = (el, d) => {
  App.filtros.kpiDiario = App.filtros.kpiDiario === d.kpi ? '' : d.kpi;
  App.renderConteudo();
};

/* --------------------------------------------------------------- cartão */
function cartaoRegistro(d) {
  const meta = [d.clima, d.etapa || null, num(d.efetivo) ? `${fmtNum(d.efetivo, 0)} na obra` : null]
    .filter(Boolean)
    .join(' · ');
  const fotos =
    d.fotos && d.fotos.length
      ? `<div class="fotos-diario">${d.fotos
          .map(
            (foto, i) =>
              `<img src="${foto.dados}" alt="${esc(foto.nome || 'Foto da obra')}" loading="lazy" data-acao="ver-foto" data-id="${esc(d.id)}" data-idx="${i}">`,
          )
          .join('')}</div>`
      : '';
  return `<article class="registro-diario">
    <header>
      <div class="cel-obra"><b>${esc(fmtData(d.data))}</b><span>${esc(meta || 'sem detalhes de clima/efetivo')}</span></div>
      <span class="acoes-diario">${acoesRegistro('diario', d.id, 'registro de ' + fmtData(d.data))}</span>
    </header>
    <div class="corpo-diario">
      ${d.atividades ? `<p style="margin:0"><b>Atividades</b> — ${esc(d.atividades)}</p>` : ''}
      ${d.ocorrencias ? `<p class="tom-alerta" style="margin:0"><b>Ocorrências</b> — ${esc(d.ocorrencias)}</p>` : ''}
      ${fotos}
      ${d.autor ? `<span class="tinta3" style="font-size:var(--t-peq)">registrado por ${esc(d.autor)}</span>` : ''}
    </div>
  </article>`;
}

/* ---------------------------------------------------------------- tela */
VIEWS.diario = () => {
  const o = App.obra();

  if (!o.diario.length) {
    return vazioTela({
      titulo: 'Sem registros',
      texto:
        'Documente cada visita: clima, efetivo, o que foi executado, ocorrências e fotos. Serve como prova documental e memória da obra.',
      acao: botao('Novo registro', 'novo-diario', {}, 'btn primario', 'mais'),
    });
  }

  const f = App.filtros;
  const todos = o.diario;
  const ordenados = todos.slice().sort((a, b) => String(b.data).localeCompare(String(a.data)));
  const ultimo = ordenados[0];
  const semRegistro = ultimo && isISO(ultimo.data) ? diasEntre(ultimo.data, hojeISO()) : null;
  const totFotos = todos.reduce((s, d) => s + (d.fotos ? d.fotos.length : 0), 0);
  const chuvosos = todos.filter((d) => d.clima && d.clima.includes('Chuva'));
  const comOcorrencia = todos.filter((d) => d.ocorrencias && d.ocorrencias.trim());
  const etapasUsadas = [...new Set(todos.map((d) => d.etapa).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'pt'),
  );
  const meses = [...new Set(todos.map((d) => competencia(d.data)).filter(Boolean))]
    .sort()
    .reverse();

  const busca = norm(f.busca || '');
  let itens = ordenados;
  if (f.etapa) itens = itens.filter((d) => d.etapa === f.etapa);
  if (f.mes) itens = itens.filter((d) => competencia(d.data) === f.mes);
  if (f.situacao === 'chuva') itens = itens.filter((d) => d.clima && d.clima.includes('Chuva'));
  if (f.kpiDiario === 'foto') itens = itens.filter((d) => d.fotos && d.fotos.length);
  if (f.kpiDiario === 'ocorrencia')
    itens = itens.filter((d) => d.ocorrencias && d.ocorrencias.trim());
  if (busca)
    itens = itens.filter((d) =>
      norm(`${d.atividades} ${d.ocorrencias} ${d.autor} ${d.etapa}`).includes(busca),
    );

  const barra = barraFiltros({
    mostrar: todos.length > 1,
    controles: [
      etapasUsadas.length > 1 ? seletor('etapa', etapasUsadas, 'Todas as etapas') : '',
      meses.length > 1
        ? seletor(
            'mes',
            meses.map((ym) => [ym, fmtCompetencia(ym)]),
            'Todos os meses',
          )
        : '',
      seletor('situacao', [['chuva', 'Dia de chuva']], 'Todos os registros'),
    ],
    filtrados: itens.length,
    total: todos.length,
  });

  return `<div class="tela-lista">
    ${kpisDiario(todos, semRegistro, ultimo, totFotos, chuvosos, comOcorrencia)}
    ${barra}
    ${
      itens.length
        ? `<div class="feed-diario">${itens.map(cartaoRegistro).join('')}</div>`
        : `<p class="tinta2" style="text-align:center;padding:var(--e10) 0">Nada com esse filtro.</p>`
    }
  </div>`;
};

VIEWS.diario.toolbar = () => {
  const o = App.obra();
  if (!o || !o.diario.length) return '';
  return `${buscaToolbar('Buscar atividade, ocorrência, autor…', 'busca-diario')}
    ${botaoNovo('Novo registro', 'novo-diario')}`;
};
