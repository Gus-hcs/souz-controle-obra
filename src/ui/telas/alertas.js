/**
 * telas/alertas.js — Alertas da obra, na linguagem nova.
 *
 * O cartão de cada alerta (alertaHTML, telas-obra.js) continua igual — é
 * compartilhado com o Painel e as cores (crítico/atenção/ok) já são as do
 * sistema novo, só com nome antigo. O que muda aqui é a casca: KPIs
 * clicáveis no lugar do hero, e o filtro de severidade some porque os
 * KPIs já fazem esse corte.
 */
import { esc, norm } from '../../nucleo/base.js';
import { alertasObra } from '../../dominio/calculos.js';
import { ACOES } from '../acoes.js';
import { App } from '../shell.js';
import { VIEWS, alertaHTML } from '../telas-obra.js';
import { barraFiltros, buscaToolbar, seletor } from './componentes.js';

function kpisAlertas(nCrit, nAten, nInfo) {
  const item = (chave, rotulo, valor, contexto, tom = '') => {
    const ativo = App.filtros.kpiAlerta === chave;
    return `<div class="kpi-item${ativo ? ' ativo' : ''}" data-acao="alerta-kpi" data-kpi="${chave}"
        role="button" tabindex="0" aria-pressed="${ativo}" title="Filtrar a lista">
      <span class="kpi-rot">${esc(rotulo)}</span>
      <span class="kpi-val${tom ? ' ' + tom : ''}">${valor}</span>
      <span class="kpi-ctx">${contexto}</span>
    </div>`;
  };

  return `<div class="kpis" role="group" aria-label="Indicadores de alertas">
    ${item('3', 'Críticos', nCrit, nCrit ? 'exigem ação imediata' : 'nada crítico', nCrit ? 'atraso' : '')}
    ${item('2', 'Atenção', nAten, nAten ? 'resolver nos próximos dias' : 'nada pendente', nAten ? 'tom-alerta' : '')}
    ${item('1', 'Informativos', nInfo, 'acompanhar')}
  </div>`;
}

ACOES['alerta-kpi'] = (el, d) => {
  App.filtros.kpiAlerta = App.filtros.kpiAlerta === d.kpi ? '' : d.kpi;
  App.renderConteudo();
};

/* ---------------------------------------------------------------- tela */
VIEWS.alertas = () => {
  const o = App.obra();
  const f = App.filtros;
  const todos = alertasObra(o);

  if (!todos.length) {
    return `<div class="tela-lista">
      <p class="tinta2" style="text-align:center;padding:var(--e10) 0">
        Tudo em ordem — nenhum alerta para esta obra agora. Os alertas são recalculados a cada mudança nos dados.
      </p>
    </div>`;
  }

  const nCrit = todos.filter((a) => a.sev === 3).length;
  const nAten = todos.filter((a) => a.sev === 2).length;
  const nInfo = todos.filter((a) => a.sev === 1).length;
  const modulos = [...new Set(todos.map((a) => a.modulo).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'pt'),
  );

  const busca = norm(f.busca || '');
  let itens = todos.slice().sort((a, b) => b.sev - a.sev);
  if (f.kpiAlerta) itens = itens.filter((a) => String(a.sev) === f.kpiAlerta);
  if (f.modulo) itens = itens.filter((a) => a.modulo === f.modulo);
  if (busca)
    itens = itens.filter((a) => norm(`${a.titulo} ${a.detalhe} ${a.acao}`).includes(busca));

  const barra = barraFiltros({
    mostrar: todos.length > 1,
    controles: [modulos.length > 1 ? seletor('modulo', modulos, 'Todos os módulos') : ''],
    filtrados: itens.length,
    total: todos.length,
  });

  return `<div class="tela-lista">
    ${kpisAlertas(nCrit, nAten, nInfo)}
    ${barra}
    ${
      itens.length
        ? itens.map((a) => alertaHTML(a)).join('')
        : `<p class="tinta2" style="text-align:center;padding:var(--e10) 0">Nada pendente com esse filtro.</p>`
    }
  </div>`;
};

VIEWS.alertas.toolbar = () => {
  const o = App.obra();
  if (!o || !alertasObra(o).length) return '';
  return buscaToolbar('Buscar alerta…', 'busca-alertas');
};
