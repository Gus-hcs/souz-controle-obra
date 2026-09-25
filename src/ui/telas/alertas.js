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
 *
 * Tratamento (migração 0015): "Tratar" grava status, responsável, "adiar
 * até" e nota. Adiado no prazo ou resolvido sai da contagem e vai para
 * "Tratados"; volta sozinho se piorar ou se o adiamento vencer
 * (situacaoTratamento, dominio/calculos.js).
 */
import { fmtMoney, hojeISO, norm, STATUS_TRATAMENTO } from '../../nucleo/base.js';
import {
  alertasObra,
  causasRaizObra,
  pendenciasObra,
  tratamentoDoAlerta,
} from '../../dominio/calculos.js';
import { apenasErros, validarTratamento } from '../../dominio/validacao.js';
import { Store, mutar } from '../../dados/store.js';
import { ACOES } from '../acoes.js';
import { App, abrirForm, fecharModal, toast } from '../shell.js';
import { VIEWS, alertaHTML, causaHTML } from '../telas-obra.js';
import { barraFiltros, buscaToolbar, faixaKpis } from './componentes.js';

function kpisAlertas(nCausas, valor, nCrit, nAten, nInfo) {
  return faixaKpis(
    [
      {
        chave: 'causas',
        rotulo: 'Problemas-raiz',
        valor: nCausas,
        contexto:
          valor > 0.5
            ? `${fmtMoney(valor, { dec: 0 })} em jogo`
            : nCausas
              ? 'sem valor em risco'
              : 'nada pendente',
        tom: nCausas ? 'atraso' : '',
        filtra: false,
      },
      {
        chave: '3',
        rotulo: 'Críticos',
        valor: nCrit,
        contexto: nCrit ? 'bloqueiam caixa ou entrega' : 'nada crítico',
        tom: nCrit ? 'atraso' : '',
      },
      {
        chave: '2',
        rotulo: 'Atenção',
        valor: nAten,
        contexto: nAten ? 'resolver nos próximos dias' : 'nada pendente',
        tom: nAten ? 'tom-alerta' : '',
      },
      {
        chave: '1',
        rotulo: 'Informativos',
        valor: nInfo,
        contexto: nInfo ? 'fora da contagem de pendências' : 'nenhum',
      },
    ],
    { rotulo: 'Indicadores de pendências', acao: 'alerta-kpi', ativo: App.filtros.kpiAlerta },
  );
}

ACOES['alerta-kpi'] = (el, d) => {
  App.filtros.kpiAlerta = App.filtros.kpiAlerta === d.kpi ? '' : d.kpi;
  App.renderConteudo();
};

/* ------------------------------------------------------ tratamento */
const obraDe = (id) => Store.estado.obras.find((o) => o.id === id) || App.obra();

/* Tratar um alerta — ou uma causa-raiz inteira: a decisão vale para a
   causa e para todos os sintomas dela (data-chaves = "k1|k2|…"). */
ACOES['tratar-alerta'] = (el, d) => {
  const o = obraDe(d.obra);
  const chaves = String(d.chaves || '').split('|').filter(Boolean);
  const alvos = alertasObra(o).filter((a) => chaves.includes(a.chave));
  if (!alvos.length) return;
  const atual = alvos.map((a) => a.tratamento).find(Boolean);
  abrirForm({
    titulo: alvos.length > 1 ? `Tratar: ${alvos[0].titulo} (+${alvos.length - 1})` : `Tratar: ${alvos[0].titulo}`,
    campos: [
      { k: 'status', label: 'Situação', tipo: 'select', opcoes: STATUS_TRATAMENTO, vazio: false, col: 4 },
      { k: 'responsavel', label: 'Responsável', tipo: 'texto', col: 4 },
      { k: 'adiarAte', label: 'Adiar até', tipo: 'data', col: 4, dica: 'só para "Adiado"' },
      { k: 'nota', label: 'Nota', tipo: 'area', col: 12, linhas: 2 },
    ],
    valores: atual
      ? { status: atual.status, responsavel: atual.responsavel, adiarAte: atual.adiarAte, nota: atual.nota }
      : { status: 'em_tratamento' },
    validar: (dados) => validarTratamento({ ...tratamentoDoAlerta(o, alvos[0], dados), ...(dados.status === 'adiado' ? {} : { adiarAte: '' }) }),
    aoSalvar: (dados) => {
      const campos = { ...dados, adiarAte: dados.status === 'adiado' ? dados.adiarAte : '' };
      const novos = alvos.map((a) => tratamentoDoAlerta(o, a, campos, hojeISO()));
      if (novos.some((t) => apenasErros(validarTratamento(t)).length)) return;
      mutar(() => {
        const ids = new Set(novos.map((t) => t.id));
        o.tratamentos = [...o.tratamentos.filter((t) => !ids.has(t.id)), ...novos];
      });
      fecharModal();
      toast(dados.status === 'em_tratamento' ? 'Alerta em tratamento.' : 'Alerta fora da contagem até piorar.', 'ok');
    },
  });
};

/* Reabrir: apaga o tratamento — o alerta volta a contar como novo. */
ACOES['reabrir-alerta'] = (el, d) => {
  const o = obraDe(d.obra);
  const chaves = new Set(String(d.chaves || '').split('|').filter(Boolean));
  mutar(() => {
    o.tratamentos = o.tratamentos.filter((t) => !chaves.has(t.chave));
  });
  toast('Alerta reaberto.', 'ok');
};

/* ---------------------------------------------------------------- tela */
VIEWS.alertas = () => {
  const o = App.obra();
  const f = App.filtros;
  const todos = alertasObra(o);

  if (!todos.length) {
    return `<div class="tela-lista">
      <p class="tinta2" style="text-align:center;padding:var(--e10) 0">
        Tudo em ordem — nenhuma pendência nesta obra agora. As pendências são recalculadas a cada mudança nos dados.
      </p>
    </div>`;
  }

  const pend = pendenciasObra(o);
  const causas = causasRaizObra(o);
  const informativos = todos.filter((a) => a.sev === 1 && !a.silenciado);
  const tratados = todos.filter((a) => a.silenciado);
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
      }
      ${
        tratados.length
          ? `<details class="tratados"><summary class="tinta2">Tratados · fora da contagem (${tratados.length})</summary>
             ${tratados.map((a) => alertaHTML(a)).join('')}</details>`
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

  /* módulo em pílula, com a contagem */
  const barra =
    todos.length > 1 && modulos.length > 1
      ? barraFiltros({
          pilulas: {
            chave: 'modulo',
            todos: 'Todos os módulos',
            total: todos.length,
            opcoes: modulos.map((m) => ({
              valor: m,
              rotulo: m,
              n: todos.filter((a) => a.modulo === m).length,
            })),
          },
          filtrados,
          total: filtrando ? todos.length : pend.total,
        })
      : '';

  return `<div class="tela-lista">
    ${kpisAlertas(causas.length, valor, pend.criticas, pend.atencao, pend.avisos)}
    ${barra}
    ${corpo}
  </div>`;
};

VIEWS.alertas.toolbar = () => {
  const o = App.obra();
  if (!o || !alertasObra(o).length) return '';
  return buscaToolbar('Buscar pendência…', 'busca-alertas');
};
