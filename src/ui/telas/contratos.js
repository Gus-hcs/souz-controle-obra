/**
 * telas/contratos.js — Contratos e aditivos: clareza para quem não é engenheiro.
 *
 * Fases 2 e 3 do redesenho (ver briefing): a situação nunca mais é digitada —
 * sai de dominio/calculos.js (contratoSituacao) e nunca contradiz as datas.
 * Medido e pago deixam de ser o mesmo número: indicadoresContrato devolve os
 * dois separados, mais retido, a_pagar_agora e a_medir — a mesma função que
 * o Painel e Prestadores vão usar.
 *
 * Uma linha por código-base (sem linhas filhas): o aditivo compõe o
 * autorizado, não aparece mais como registro solto na tabela. A composição
 * ("43.750 + 1 aditivo") fica no hover.
 */
import {
  esc,
  fmtDataCurta,
  fmtMoney,
  fmtPct,
  hojeISO,
  isISO,
  nomeExibicao,
} from '../../nucleo/base.js';
import {
  basesContratuais,
  contratoFimVigente,
  contratoSituacao,
  contratoValor,
  indicadoresContrato,
  medicaoLiquido,
} from '../../dominio/calculos.js';
import { Store, mutar } from '../../dados/store.js';
import { ACOES } from '../acoes.js';
import {
  App,
  ICO,
  abrirForm,
  botao,
  confirmar,
  fecharModal,
  opcoesLista,
  svg,
  toast,
} from '../shell.js';
import { VIEWS } from '../telas-obra.js';
import {
  barraFiltros,
  botaoNovo,
  buscaToolbar,
  dinheiro,
  lista,
  seletor,
  vazioTela,
} from './componentes.js';

/* Cores por situação — os mesmos tons já usados no resto do sistema, nenhum
   novo: atraso (vermelho), tom-alerta (âmbar), feito/tinta3 (cinza, "concluído
   é cinza de propósito"). Em andamento fica sem cor — é o estado esperado. */
const TOM_SITUACAO = {
  atrasado: 'atraso',
  'nao-iniciado-atrasado': 'atraso',
  'a-pagar': 'tom-alerta',
  'nao-iniciado': 'tinta3',
  encerrado: 'feito',
  paralisado: 'tom-alerta',
  rescindido: 'atraso',
};
const PROBLEMA_PRAZO = new Set(['atrasado', 'nao-iniciado-atrasado']);

function nomePrestadorRegistro(c) {
  if (c && c.prestadorId) {
    const p = Store.estado.prestadores.find((x) => x.id === c.prestadorId);
    if (p) return nomeExibicao(p.nome);
  }
  return c && c.prestador ? nomeExibicao(c.prestador) : '';
}

/* Modelo de uma linha da tabela — um código-base inteiro, contrato +
   aditivos, com os números que vêm de dominio/calculos.js. */
function linhaDados(o, b) {
  const registros = b.registros;
  const principal = b.principal || registros[0] || {};
  const ind = indicadoresContrato(o, b.base);
  const sit = contratoSituacao(o, b.base);
  const fim = contratoFimVigente(registros);
  const aditivosAprovados = registros.filter(
    (c) =>
      c.registro === 'Aditivo' &&
      c.status !== 'Cancelado' &&
      (c.statusAditivo || 'aprovado') === 'aprovado',
  );
  const valorPrincipal = contratoValor(principal);
  const composicao = [
    `${principal.escopo || principal.codigo || 'contrato'}: ${fmtMoney(valorPrincipal, { dec: 0 })}`,
    ...aditivosAprovados.map(
      (a) => `${a.escopo || a.codigo}: ${fmtMoney(contratoValor(a), { dec: 0 })}`,
    ),
  ].join(' · ');
  return {
    base: b.base,
    registros,
    principal,
    ind,
    sit,
    fim,
    prestador: nomePrestadorRegistro(principal),
    aditivosAprovados,
    valorPrincipal,
    composicao,
  };
}

/* ------------------------------------------------------------- filtros */
function filtrar(linhas) {
  const f = App.filtros;
  const busca = App.filtros.busca ? App.filtros.busca.trim().toLowerCase() : '';
  return linhas.filter((l) => {
    if (f.prestador && l.prestador !== f.prestador) return false;
    if (f.status && !l.registros.some((c) => c.status === f.status)) return false;
    if (f.regime && !l.registros.some((c) => c.regime === f.regime)) return false;
    if (f.kpiCt === 'medido' && !(l.ind.medido > 0.005)) return false;
    if (f.kpiCt === 'apagar' && !(l.ind.aPagarAgora > 0.005)) return false;
    if (f.kpiCt === 'amedir' && !(l.ind.aMedir > 0.005)) return false;
    if (busca) {
      const alvo =
        `${l.base} ${l.prestador} ${l.registros.map((c) => c.codigo + ' ' + c.escopo).join(' ')}`.toLowerCase();
      if (!alvo.includes(busca)) return false;
    }
    return true;
  });
}

/* --------------------------------------------------------------- KPIs
   Fase 2: quatro indicadores, cada um clicável como filtro — o mesmo
   padrão de telas/carteira.js. "Autorizado" não filtra nada (é o total),
   clicar nele só limpa o filtro por KPI. */
function kpisContratos(todas) {
  const autorizado = todas.reduce((s, l) => s + l.ind.autorizado, 0);
  const medido = todas.reduce((s, l) => s + l.ind.medido, 0);
  const aPagarAgora = todas.reduce((s, l) => s + l.ind.aPagarAgora, 0);
  const aMedir = todas.reduce((s, l) => s + l.ind.aMedir, 0);

  let aditivosAprovadosValor = 0,
    aditivosPendentesValor = 0;
  todas.forEach((l) => {
    l.registros.forEach((c) => {
      if (c.registro !== 'Aditivo' || c.status === 'Cancelado') return;
      const st = c.statusAditivo || 'aprovado';
      if (st === 'aprovado') aditivosAprovadosValor += contratoValor(c);
      else if (st === 'proposto') aditivosPendentesValor += contratoValor(c);
    });
  });

  const item = (chave, rotulo, valor, contexto, tom = '') => {
    const ativo = App.filtros.kpiCt === chave;
    return `<button class="kpi-item${ativo ? ' ativo' : ''}" data-acao="ct-kpi" data-kpi="${chave}"
        aria-pressed="${ativo}" title="Filtrar a lista">
      <span class="kpi-rot">${esc(rotulo)}</span>
      <span class="kpi-val${tom ? ' ' + tom : ''}">${valor}</span>
      <span class="kpi-ctx">${contexto}</span>
    </button>`;
  };

  return `<div class="kpis" role="group" aria-label="Indicadores de contratos">
    ${item(
      'autorizado',
      'Autorizado',
      fmtMoney(autorizado, { dec: 0 }),
      `${todas.length} contrato${todas.length === 1 ? '' : 's'}` +
        (aditivosAprovadosValor > 0.005
          ? ` · ${fmtMoney(aditivosAprovadosValor, { dec: 0 })} em aditivos`
          : '') +
        (aditivosPendentesValor > 0.005
          ? ` · ${fmtMoney(aditivosPendentesValor, { dec: 0 })} em aditivos pendentes`
          : ''),
    )}
    ${item('medido', 'Medido', fmtMoney(medido, { dec: 0 }), `${fmtPct(autorizado > 0 ? medido / autorizado : 0, 0)} do autorizado`)}
    ${item(
      'apagar',
      'A pagar agora',
      fmtMoney(aPagarAgora, { dec: 0 }),
      'já medido e não pago',
      aPagarAgora > 0.005 ? 'tom-alerta' : '',
    )}
    ${item('amedir', 'A medir', fmtMoney(aMedir, { dec: 0 }), 'ainda vai virar conta')}
  </div>`;
}

ACOES['ct-kpi'] = (el, d) => {
  App.filtros.kpiCt = d.kpi === 'autorizado' || App.filtros.kpiCt === d.kpi ? '' : d.kpi;
  App.renderConteudo();
};

/* -------------------------------------------------------------- tabela */
function celulaContrato(l, leitura) {
  const sub = [l.principal.escopo, l.base].filter(Boolean).join(' · ') || l.base;
  return `<div class="cel-prest">
    <div class="cel-obra"><b>${esc(l.prestador || 'prestador não informado')}</b><span>${esc(sub)}</span></div>
    ${
      leitura
        ? ''
        : `<button class="btn sutil icone pequeno acao-hover" data-acao="ct-menu" data-base="${esc(l.base)}"
      title="Mais ações" aria-label="Mais ações para ${esc(l.base)}" aria-haspopup="menu">${svg(ICO.maisH, 15)}</button>`
    }
  </div>`;
}

function celulaPrazo(l) {
  const ini = isISO(l.principal.inicioPrevisto) ? fmtDataCurta(l.principal.inicioPrevisto) : '?';
  const fim = isISO(l.fim) ? fmtDataCurta(l.fim) : '?';
  const temData = isISO(l.principal.inicioPrevisto) || isISO(l.fim);
  const problema = PROBLEMA_PRAZO.has(l.sit.chave);
  return `<div style="display:flex;flex-direction:column;line-height:1.3;gap:2px">
    <span class="tinta2">${temData ? esc(`${ini} → ${fim}`) : '<span class="tinta3">—</span>'}</span>
    ${problema ? `<span class="${TOM_SITUACAO[l.sit.chave]}" style="font-size:var(--t-peq)">${esc(l.sit.texto)}</span>` : ''}
  </div>`;
}

function celulaAutorizado(l) {
  const n = l.aditivosAprovados.length;
  return `<div class="cel-num-nota" title="${esc(l.composicao)}">
    <b>${dinheiro(l.ind.autorizado, { dec: 0 })}</b>
    ${n ? `<span>${fmtMoney(l.valorPrincipal, { dec: 0, semSimbolo: true })} + ${n} aditivo${n > 1 ? 's' : ''}</span>` : ''}
  </div>`;
}

function celulaProgresso(l) {
  const base = l.ind.autorizado > 0 ? l.ind.autorizado : 0;
  const pctMedido = base > 0 ? Math.min(1, l.ind.medido / base) : 0;
  const pctPago = base > 0 ? Math.min(1, l.ind.pago / base) : 0;
  return `<div class="barra-dupla">
    <span class="trilha">
      <i class="medido" style="width:${(pctMedido * 100).toFixed(1)}%"></i>
      <i class="pago" style="width:${(pctPago * 100).toFixed(1)}%"></i>
    </span>
    <span class="txt">Medido ${fmtPct(pctMedido, 0)} · Pago ${fmtPct(pctPago, 0)}</span>
  </div>`;
}

function celulaSituacao(l) {
  const tom = TOM_SITUACAO[l.sit.chave] || '';
  return `<span class="situacao-ct ${tom}" title="${esc(l.sit.motivo || '')}"><span class="pt"></span>${esc(l.sit.texto)}</span>`;
}

/* Ordem padrão: atrasados primeiro, depois por fim de prazo — a mesma
   coluna Situação é a chave de ordenação (clicar noutra coluna reordena). */
function chaveOrdemPadrao(l) {
  const atrasado = PROBLEMA_PRAZO.has(l.sit.chave) ? 0 : 1;
  return `${atrasado}_${l.fim || '9999-99-99'}`;
}

function colunasContratos(leitura) {
  return [
    {
      k: 'contrato',
      rotulo: 'Contrato',
      largura: '21%',
      celular: 'principal',
      valor: (l) => (l.prestador || '').toLowerCase(),
      celula: (l) => celulaContrato(l, leitura),
    },
    {
      k: 'prazo',
      rotulo: 'Prazo',
      largura: '11%',
      celular: 'some',
      valor: (l) => l.fim || '',
      celula: celulaPrazo,
    },
    {
      k: 'autorizado',
      rotulo: 'Autorizado',
      largura: '11%',
      num: true,
      celular: 'some',
      valor: (l) => l.ind.autorizado,
      celula: celulaAutorizado,
      total: (ls) =>
        dinheiro(
          ls.reduce((s, l) => s + l.ind.autorizado, 0),
          { dec: 0 },
        ),
    },
    {
      k: 'progresso',
      rotulo: 'Progresso',
      largura: '19%',
      valor: (l) => (l.ind.autorizado > 0 ? l.ind.medido / l.ind.autorizado : 0),
      celula: celulaProgresso,
    },
    {
      k: 'apagar',
      rotulo: 'A pagar agora',
      largura: '10%',
      num: true,
      valor: (l) => l.ind.aPagarAgora,
      celula: (l) => dinheiro(l.ind.aPagarAgora, { dec: 0, cinzaNoZero: true }),
      total: (ls) =>
        dinheiro(
          ls.reduce((s, l) => s + l.ind.aPagarAgora, 0),
          { dec: 0 },
        ),
    },
    {
      k: 'amedir',
      rotulo: 'A medir',
      largura: '8%',
      num: true,
      celular: 'some',
      valor: (l) => l.ind.aMedir,
      celula: (l) => dinheiro(l.ind.aMedir, { dec: 0, cinzaNoZero: true }),
      total: (ls) =>
        dinheiro(
          ls.reduce((s, l) => s + l.ind.aMedir, 0),
          { dec: 0 },
        ),
    },
    {
      k: 'situacao',
      rotulo: 'Situação',
      largura: '20%',
      valor: chaveOrdemPadrao,
      celula: celulaSituacao,
    },
  ];
}

/* ---------------------------------------------------------------- tela */

VIEWS.contratos = () => {
  const o = App.obra();

  if (!o.contratos.length) {
    return vazioTela({
      titulo: 'Nenhum contrato nesta obra',
      texto:
        'Comece pela empreitada principal — normalmente R$/m² sobre a área construída. Depois vêm os aditivos de muro, calçada e fossa, sempre com o mesmo código-base.',
      acao: botao('Cadastrar contrato principal', 'novo-contrato', {}, 'btn primario', 'mais'),
    });
  }

  const leitura = Store.somenteLeitura();
  const todas = basesContratuais(o).map((b) => linhaDados(o, b));
  const linhas = filtrar(todas);

  const atrasados = todas.filter((l) => PROBLEMA_PRAZO.has(l.sit.chave)).length;
  const aviso =
    atrasados > 0
      ? `<p class="aviso-discreto atraso">${atrasados} contrato${atrasados > 1 ? 's' : ''} atrasado${atrasados > 1 ? 's' : ''}</p>`
      : '';

  const prestadores = [...new Set(todas.map((l) => l.prestador).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'pt'),
  );

  const barra = barraFiltros({
    mostrar: todas.length > 1,
    controles: [
      seletor('prestador', prestadores, 'Todos os prestadores'),
      seletor('status', opcoesLista('statusContrato'), 'Todos os status'),
      seletor('regime', opcoesLista('regimes'), 'Todas as formas de preço'),
    ],
    filtrados: linhas.length,
    total: todas.length,
  });

  return `<div class="tela-lista">
    ${kpisContratos(todas)}
    ${aviso}
    ${barra}
    ${lista({
      id: 'contratos',
      colunas: colunasContratos(leitura),
      itens: linhas,
      ordemPadrao: { col: 'situacao', dir: 1 },
      testid: 'lista-contratos',
      rodapeRotulo: (n) => `${n} contratos`,
    })}
  </div>`;
};

/* --------------------------------------------------------- toolbar */
VIEWS.contratos.toolbar = () => {
  const o = App.obra();
  if (!o || !o.contratos.length) return '';
  return `${buscaToolbar('Buscar contrato', 'busca-contratos')}
    ${botaoNovo('Novo contrato', 'novo-contrato')}`;
};

/* ---------------------------------------------------- menu "⋯" da linha
   Mesmo padrão de telas/prestadores.js: um menu flutuante por clique no
   botão ou por clique direito na linha. */
function fecharMenuCt() {
  const m = document.querySelector('.menu-ct');
  if (m) m.remove();
}

function abrirMenuEm(el, html) {
  fecharMenuCt();
  const menu = document.createElement('div');
  menu.className = 'menu-ctx menu-ct';
  menu.setAttribute('role', 'menu');
  menu.innerHTML = html;
  document.body.appendChild(menu);
  const r = el.getBoundingClientRect();
  const m = menu.getBoundingClientRect();
  menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - m.width - 8)) + 'px';
  const abaixo = r.bottom + 4;
  menu.style.top =
    (abaixo + m.height > window.innerHeight - 8 ? r.top - m.height - 4 : abaixo) + 'px';
  const primeiro = menu.querySelector('a, button');
  if (primeiro) primeiro.focus();
}

function menuLinha(base) {
  if (Store.somenteLeitura()) return '';
  const b = esc(base);
  return [
    `<button role="menuitem" data-acao="nova-medicao" data-base="${b}">${svg(ICO.medicao, 13)}Registrar medição</button>`,
    `<button role="menuitem" data-acao="novo-aditivo" data-base="${b}">${svg(ICO.mais, 13)}Novo aditivo</button>`,
    `<button role="menuitem" data-acao="ct-registrar-pagamento" data-base="${b}">${svg(ICO.receb, 13)}Registrar pagamento</button>`,
    `<button role="menuitem" data-acao="ct-anexar" data-base="${b}">${svg(ICO.baixar, 13)}Anexar contrato</button>`,
    '<hr>',
    `<button role="menuitem" data-acao="ct-encerrar" data-base="${b}">${svg(ICO.x, 13)}Encerrar</button>`,
  ].join('');
}

ACOES['ct-menu'] = (el, d) => abrirMenuEm(el, menuLinha(d.base));

document.addEventListener('contextmenu', (ev) => {
  if (App.rota.view !== 'contratos') return;
  const tr = ev.target.closest('table[data-testid="lista-contratos"] tbody tr');
  if (!tr || Store.somenteLeitura()) return;
  const base = tr.querySelector('[data-acao="ct-menu"]');
  if (!base) return;
  ev.preventDefault();
  fecharMenuCt();
  const menu = document.createElement('div');
  menu.className = 'menu-ctx menu-ct';
  menu.setAttribute('role', 'menu');
  menu.innerHTML = menuLinha(base.dataset.base);
  document.body.appendChild(menu);
  const m = menu.getBoundingClientRect();
  menu.style.left = Math.min(ev.clientX, window.innerWidth - m.width - 8) + 'px';
  menu.style.top = Math.min(ev.clientY, window.innerHeight - m.height - 8) + 'px';
});
document.addEventListener('mousedown', (ev) => {
  if (!ev.target.closest('.menu-ct, [data-acao="ct-menu"]')) fecharMenuCt();
});
document.addEventListener(
  'click',
  (ev) => {
    if (ev.target.closest('.menu-ct a, .menu-ct button')) setTimeout(fecharMenuCt);
  },
  true,
);
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && document.querySelector('.menu-ct')) {
    ev.stopPropagation();
    fecharMenuCt();
  }
});

/* ------------------------------------------------------- ações da linha */

/* Acha o registro "Contrato" do código-base — ou, na falta, o primeiro
   registro (dado antigo sem o principal separado). */
function contratoPrincipal(o, base) {
  return (
    o.contratos.find((c) => c.codigoBase === base && c.registro === 'Contrato') ||
    o.contratos.find((c) => c.codigoBase === base)
  );
}

ACOES['ct-registrar-pagamento'] = (el, d) => {
  const o = App.obra();
  const doBase = o.medicoes.filter((m) => m.contratoBase === d.base && m.status !== 'Cancelado');
  if (!doBase.length) return ACOES['nova-medicao'](el, d);
  const pendente = doBase
    .filter((m) => medicaoLiquido(m) - m.valorPago > 0.005)
    .sort((a, b) => String(a.data || '').localeCompare(String(b.data || '')));
  if (!pendente.length)
    return toast('Nenhuma medição em aberto para pagar neste contrato.', 'aviso');
  ACOES['editar-medicao'](el, { id: pendente[0].id });
};

ACOES['ct-anexar'] = (el, d) => {
  const o = App.obra();
  const c = contratoPrincipal(o, d.base);
  if (!c) return;
  abrirForm({
    titulo: `Anexar contrato — ${d.base}`,
    campos: [
      {
        k: 'documentoUrl',
        label: 'Link do documento',
        tipo: 'texto',
        col: 12,
        placeholder: 'https://…',
        dica: 'Cole o link do arquivo (Storage, Drive, etc.) — o sistema ainda não faz o upload direto.',
      },
    ],
    valores: c,
    aoSalvar: (dados) => {
      mutar(() => {
        c.documentoUrl = String(dados.documentoUrl || '').trim();
      });
      fecharModal();
      toast('Documento anexado.', 'ok');
    },
  });
};

ACOES['ct-encerrar'] = (el, d) => {
  const o = App.obra();
  const c = contratoPrincipal(o, d.base);
  if (!c) return;
  const ind = indicadoresContrato(o, d.base);
  const aviso =
    ind.aPagarAgora > 0.005
      ? ` Ainda há ${fmtMoney(ind.aPagarAgora, { dec: 0 })} a pagar — o contrato fica marcado como encerrado mesmo assim.`
      : '';
  confirmar(
    'Encerrar contrato',
    `Marcar ${d.base} como encerrado hoje?${aviso}`,
    () => {
      mutar(() => {
        c.dataEncerramento = hojeISO();
      });
      toast('Contrato encerrado.', 'ok');
    },
    'Encerrar',
  );
};
