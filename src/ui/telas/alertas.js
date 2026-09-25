/**
 * telas/alertas.js — Alertas da obra, agrupados por causa-raiz.
 *
 * Catorze alertas soltos parecem catorze problemas; quase sempre são três.
 * causasRaizObra (dominio/calculos.js) agrupa os sintomas sob a causa —
 * parcela parada → caixa negativo; rejunte que falta → piso atrasado;
 * empreiteiro com equipe reduzida → três etapas atrasadas — e a tela mostra
 * a causa, o dinheiro em jogo, a ação e os sintomas recolhidos.
 *
 * Os KPIs Críticos + Atenção são o mesmo número do menu, da carteira e do
 * Painel (pendenciasObra). Informativo aparece à parte e não soma.
 */
import { esc, fmtMoney, norm } from '../../nucleo/base.js';
import { alertasObra, causasRaizObra, pendenciasObra } from '../../dominio/calculos.js';
import { ACOES } from '../acoes.js';
import { App } from '../shell.js';
import { VIEWS, alertaHTML, causaHTML } from '../telas-obra.js';
import { barraFiltros, buscaToolbar, seletor } from './componentes.js';

function kpisAlertas(nCausas, valor, nCrit, nAten, nInfo) {
  const item = (chave, rotulo, valorTxt, contexto, tom = '', filtravel = true) => {
    const ativo = filtravel && App.filtros.kpiAlerta === chave;
    return `<div class="kpi-item${ativo ? ' ativo' : ''}"${
      filtravel
        ? ` data-acao="alerta-kpi" data-kpi="${chave}" role="button" tabindex="0" aria-pressed="${ativo}" title="Filtrar a lista"`
        : ''
    }>
      <span class="kpi-rot">${esc(rotulo)}</span>
      <span class="kpi-val${tom ? ' ' + tom : ''}">${valorTxt}</span>
      <span class="kpi-ctx">${contexto}</span>
    </div>`;
  };

  return `<div class="kpis" role="group" aria-label="Indicadores de alertas">
    ${item(
      'causas',
      'Problemas-raiz',
      nCausas,
      valor > 0.5 ? `${fmtMoney(valor, { dec: 0 })} em jogo` : nCausas ? 'sem valor em risco' : 'nada pendente',
      nCausas ? 'atraso' : '',
      false,
    )}
    ${item('3', 'Críticos', nCrit, nCrit ? 'bloqueiam caixa ou entrega' : 'nada crítico', nCrit ? 'atraso' : '')}
    ${item('2', 'Atenção', nAten, nAten ? 'resolver nos próximos dias' : 'nada pendente', nAten ? 'tom-alerta' : '')}
    ${item('1', 'Informativos', nInfo, nInfo ? 'fora da contagem de alertas' : 'nenhum')}
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

  const pend = pendenciasObra(o);
  const causas = causasRaizObra(o);
  const informativos = todos.filter((a) => a.sev === 1);
  const valor = causas.reduce((s, c) => s + c.valor, 0);
  const modulos = [...new Set(todos.map((a) => a.modulo).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'pt'),
  );

  const busca = norm(f.busca || '');
  const bate = (a) => norm(`${a.titulo} ${a.detalhe} ${a.acao}`).includes(busca);
  const filtrando = !!(f.kpiAlerta || f.modulo || busca);

  /* Sem filtro: por causa-raiz. Com filtro (severidade, módulo, busca):
     a lista plana dos alertas que batem — filtrar uma causa pelo módulo de
     um sintoma confundiria mais do que ajudaria. */
  let corpo;
  let filtrados;
  if (!filtrando) {
    filtrados = pend.total;
    corpo = `${causas.map((c) => causaHTML(c)).join('')}
      ${
        informativos.length
          ? `<h3 class="tinta2" style="margin:var(--e6) 0 var(--e2);font-size:var(--t-corpo)">Informativos · fora da contagem</h3>
             ${informativos.map((a) => alertaHTML(a)).join('')}`
          : ''
      }`;
  } else {
    let itens = todos.slice().sort((a, b) => b.sev - a.sev || b.valor - a.valor);
    if (f.kpiAlerta) itens = itens.filter((a) => String(a.sev) === f.kpiAlerta);
    if (f.modulo) itens = itens.filter((a) => a.modulo === f.modulo);
    if (busca) itens = itens.filter(bate);
    filtrados = itens.length;
    corpo = itens.length
      ? itens.map((a) => alertaHTML(a)).join('')
      : `<p class="tinta2" style="text-align:center;padding:var(--e10) 0">Nada pendente com esse filtro.</p>`;
  }

  const barra = barraFiltros({
    mostrar: todos.length > 1,
    controles: [modulos.length > 1 ? seletor('modulo', modulos, 'Todos os módulos') : ''],
    filtrados,
    total: filtrando ? todos.length : pend.total,
  });

  return `<div class="tela-lista">
    ${kpisAlertas(causas.length, valor, pend.criticas, pend.atencao, pend.avisos)}
    ${barra}
    ${corpo}
  </div>`;
};

VIEWS.alertas.toolbar = () => {
  const o = App.obra();
  if (!o || !alertasObra(o).length) return '';
  return buscaToolbar('Buscar alerta…', 'busca-alertas');
};
