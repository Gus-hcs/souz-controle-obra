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
  composicaoContrato,
  contratoFimVigente,
  contratoSituacao,
  contratoValor,
  indicadoresContrato,
  medicaoAPagar,
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

/* Estado só de tela: qual código-base está com o inspetor aberto. */
const tela = { selecao: '' };

/* Pílulas: só a situação calculada (contratoSituacao) e o a pagar agora
   (indicadoresContrato) — nunca o status digitado, que podia contradizer
   as datas. Paralisado e Rescindido só aparecem quando existem. */
const SIT_PILULAS = [
  { chave: 'atraso', rotulo: 'Atrasados', pertence: (l) => PROBLEMA_PRAZO.has(l.sit.chave) },
  { chave: 'apagar', rotulo: 'A pagar agora', pertence: (l) => l.ind.aPagarAgora > 0.005 },
  { chave: 'andamento', rotulo: 'Em andamento', pertence: (l) => l.sit.chave === 'em-andamento' },
  {
    chave: 'nao-iniciado',
    rotulo: 'Não iniciados',
    pertence: (l) => l.sit.chave === 'nao-iniciado',
  },
  { chave: 'encerrado', rotulo: 'Encerrados', pertence: (l) => l.sit.chave === 'encerrado' },
  {
    chave: 'paralisado',
    rotulo: 'Paralisados',
    pertence: (l) => l.sit.chave === 'paralisado',
    soSeHouver: true,
  },
  {
    chave: 'rescindido',
    rotulo: 'Rescindidos',
    pertence: (l) => l.sit.chave === 'rescindido',
    soSeHouver: true,
  },
];

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
  const comp = composicaoContrato(o, b.base);
  const nome = (a) => a.registro.escopo || a.registro.codigo;
  const sinal = (v) => `${v < 0 ? '−' : '+'} ${fmtMoney(Math.abs(v), { dec: 0 })}`;
  const prazoAte = (r) =>
    `prazo até ${isISO(r.novoPrazoAditivo) ? fmtDataCurta(r.novoPrazoAditivo) : '?'}`;
  /* hover: a composição inteira, com sinal, e os propostos à parte */
  const composicao = [
    `${principal.escopo || principal.codigo || 'Contrato'}: ${fmtMoney(comp.principal, { dec: 0 })}`,
    ...comp.acrescimos.map((a) => `${nome(a)}: ${sinal(a.valor)}`),
    ...comp.supressoes.map((a) => `${nome(a)}: ${sinal(a.valor)} (supressão)`),
    ...comp.prazos.map((a) => `${nome(a)}: ${prazoAte(a.registro)}`),
    ...comp.pendentes.map(
      (a) =>
        `${nome(a)}: ${a.registro.tipoAditivo === 'prazo' ? prazoAte(a.registro) : sinal(a.valor)} (proposto, ainda não conta)`,
    ),
  ].join('\n');
  return {
    base: b.base,
    registros,
    principal,
    ind,
    sit,
    fim,
    prestador: nomePrestadorRegistro(principal),
    comp,
    composicao,
  };
}

/* ------------------------------------------------------------- filtros */
function filtrar(linhas) {
  const f = App.filtros;
  const busca = App.filtros.busca ? App.filtros.busca.trim().toLowerCase() : '';
  return linhas.filter((l) => {
    if (f.prestador && l.prestador !== f.prestador) return false;
    if (f.regime && !l.registros.some((c) => c.regime === f.regime)) return false;
    if (f.kpiCt === 'medido' && !(l.ind.medido > 0.005)) return false;
    if (f.kpiCt === 'apagar' && !(l.ind.aPagarAgora > 0.005)) return false;
    if (f.kpiCt === 'amedir' && !(l.ind.aMedir > 0.005)) return false;
    if (f.situacaoCt) {
      const grupo = SIT_PILULAS.find((p) => p.chave === f.situacaoCt);
      if (grupo && !grupo.pertence(l)) return false;
    }
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

  const aditivosAprovadosValor = todas.reduce(
    (s, l) => s + l.comp.totalAcrescimos - l.comp.totalSupressoes,
    0,
  );
  const aditivosPendentesValor = todas.reduce((s, l) => s + l.comp.pendentesValor, 0);
  const temPendente = todas.some((l) => l.comp.pendentes.length);
  const comSinal = (v) => `${v < 0 ? '−' : ''}${fmtMoney(Math.abs(v), { dec: 0 })}`;

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
        (Math.abs(aditivosAprovadosValor) > 0.005
          ? ` · ${comSinal(aditivosAprovadosValor)} em aditivos`
          : '') +
        (temPendente ? ` · ${comSinal(aditivosPendentesValor)} em aditivos pendentes` : ''),
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

/* -------------------------------------------------------- pílulas (Fase 4)
   Situação (calculada, agrupada) e status (bruto, os valores que aparecem
   nos dados) — os dois filtros que mudam o que é urgente ver. Prestador e
   forma de preço são recorte, não urgência: continuam em <select>. */
function pilulasContratos(todas) {
  if (!todas.length) return '';
  const atual = App.filtros.situacaoCt || '';
  const pil = (chave, rotulo, n) => {
    const ativa = atual === chave;
    return `<button class="pilula${ativa ? ' ativa' : ''}" data-acao="ct-pilula-situacao"
        data-valor="${chave}" aria-pressed="${ativa}">
      ${esc(rotulo)} <span class="conta">${n}</span>
    </button>`;
  };
  const grupos = SIT_PILULAS.map((g) => ({ g, n: todas.filter(g.pertence).length }))
    .filter(({ g, n }) => !g.soSeHouver || n > 0)
    .map(({ g, n }) => pil(g.chave, g.rotulo, n))
    .join('');
  return `<div class="filtro-barra nao-imprime">${pil('', 'Todos', todas.length)}${grupos}</div>`;
}

ACOES['ct-pilula-situacao'] = (el, d) => {
  App.filtros.situacaoCt = !d.valor || App.filtros.situacaoCt === d.valor ? '' : d.valor;
  App.renderConteudo();
};

/* -------------------------------------------------------------- tabela
   A linha inteira é clicável (abre o inspetor, Fase 5) — sem botão "⋯" na
   célula: as ações da linha ficam no cabeçalho do inspetor. */
/* Prestador fora do cadastro (sem prestadorId): o nome digitado aparece
   marcado, com o atalho para vincular — senão a ficha dele fica "sem
   contrato" em Prestadores. */
function celulaContrato(l) {
  const sub = [l.principal.escopo, l.base].filter(Boolean).join(' · ') || l.base;
  const fora = !l.principal.prestadorId;
  return `<div class="cel-obra"><b>${esc(l.prestador || 'prestador não informado')}</b><span>${esc(sub)}</span>${
    fora
      ? `<span class="fora-cadastro">fora do cadastro ·
        <button class="btn-link" data-acao="vincular-prestadores" data-contrato="${esc(l.principal.id || '')}">Vincular prestador</button></span>`
      : ''
  }</div>`;
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

/* "37.440 + 1 aditivo − 1.500 (supressão)": o sinal de cada aditivo
   aprovado. Prazo e proposto não mudam o valor: ficam só no hover. */
function celulaAutorizado(l) {
  const c = l.comp;
  const n = c.acrescimos.length;
  const partes = [];
  if (n) partes.push(`+ ${n} aditivo${n > 1 ? 's' : ''}`);
  if (c.supressoes.length) {
    partes.push(`− ${fmtMoney(c.totalSupressoes, { dec: 0, semSimbolo: true })} (supressão)`);
  }
  const nota = partes.length
    ? `${fmtMoney(c.principal, { dec: 0, semSimbolo: true })} ${partes.join(' ')}`
    : '';
  return `<div class="cel-num-nota" title="${esc(l.composicao)}">
    <b>${dinheiro(l.ind.autorizado, { dec: 0 })}</b>
    ${nota ? `<span>${esc(nota)}</span>` : ''}
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

function colunasContratos() {
  return [
    {
      k: 'contrato',
      rotulo: 'Contrato',
      largura: '21%',
      celular: 'principal',
      valor: (l) => (l.prestador || '').toLowerCase(),
      celula: celulaContrato,
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

/* ------------------------------------------------------------- inspetor
   Substitui o menu "⋯": clicar na linha abre o detalhe completo — os
   números de indicadoresContrato, o prazo com o motivo do atraso, a
   composição (principal + aditivos) e as últimas medições ligadas ao
   código-base. As mesmas ações do menu antigo ficam no cabeçalho. */
const linhaNum = (rotulo, valor, tom = '') =>
  `<div class="par par-num"><dt>${esc(rotulo)}</dt><dd class="${tom}">${valor}</dd></div>`;

const ROTULO_TIPO_ADITIVO = { acrescimo: 'acréscimo', supressao: 'supressão', prazo: 'prazo' };

/* Valor de um registro na composição: supressão com sinal de menos,
   prazo mostra o novo fim (não mexe no valor). */
function valorDoRegistro(c) {
  if (c.registro === 'Aditivo' && c.tipoAditivo === 'prazo') {
    return isISO(c.novoPrazoAditivo)
      ? `<span class="tinta2">até ${esc(fmtDataCurta(c.novoPrazoAditivo))}</span>`
      : '<span class="tinta3">—</span>';
  }
  const v = fmtMoney(contratoValor(c), { dec: 0 });
  return c.registro === 'Aditivo' && c.tipoAditivo === 'supressao' ? `− ${v}` : v;
}

function inspetorContrato(o, l) {
  const ind = l.ind;
  const registros = l.registros
    .slice()
    .sort((a, b) => (a.registro === b.registro ? 0 : a.registro === 'Contrato' ? -1 : 1));

  const composicao = registros.length
    ? `<table class="mini-tab"><thead><tr><th>Registro</th><th class="num">Valor</th></tr></thead>
        <tbody>${registros
          .map(
            (c) => `<tr>
          <td><b class="mono">${esc(c.codigo)}</b><br><span class="tinta3">${esc(c.escopo || (c.registro === 'Aditivo' ? 'Aditivo' : 'Contrato'))}${
            c.registro === 'Aditivo'
              ? ` · ${esc(ROTULO_TIPO_ADITIVO[c.tipoAditivo] || 'acréscimo')} ${esc(c.statusAditivo || 'aprovado')}`
              : ''
          }</span></td>
          <td class="num">${valorDoRegistro(c)}</td>
        </tr>`,
          )
          .join('')}</tbody></table>`
    : '<p class="linha-cinza">Sem registros.</p>';

  const medicoes = o.medicoes
    .filter((m) => m.contratoBase === l.base && m.status !== 'Cancelado')
    .sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')));
  const medicoesHtml = medicoes.length
    ? `<table class="mini-tab"><thead><tr><th>Data</th><th class="num">Líquido</th><th class="num">Pago</th></tr></thead>
        <tbody>${medicoes
          .slice(0, 5)
          .map(
            (m) => `<tr>
          <td class="mono">${isISO(m.data) ? fmtDataCurta(m.data) : '—'}</td>
          <td class="num">${fmtMoney(medicaoLiquido(m), { dec: 0 })}</td>
          <td class="num">${dinheiro(m.valorPago, { dec: 0, cinzaNoZero: true })}</td>
        </tr>`,
          )
          .join('')}</tbody></table>
       ${medicoes.length > 5 ? `<button class="btn-link ver-todos" data-acao="ir" data-view="medicoes">Ver todas as medições</button>` : ''}`
    : '<p class="linha-cinza">Nenhuma medição registrada ainda.</p>';

  const temData = isISO(l.principal.inicioPrevisto) || isISO(l.fim);
  const prazoTxt = temData
    ? `${isISO(l.principal.inicioPrevisto) ? fmtDataCurta(l.principal.inicioPrevisto) : '?'} → ${isISO(l.fim) ? fmtDataCurta(l.fim) : '?'}`
    : 'sem datas';
  const tomSit = TOM_SITUACAO[l.sit.chave] || '';

  return `<aside class="inspetor" tabindex="-1" data-testid="inspetor-contrato" aria-label="${esc(l.base)}">
    <div class="inspetor-cab">
      <h2>${esc(l.prestador || 'prestador não informado')}<span class="sub">${esc([l.principal.escopo, l.base].filter(Boolean).join(' · ') || l.base)}</span></h2>
      ${
        Store.somenteLeitura()
          ? ''
          : `<button class="btn sutil icone" data-acao="ct-menu" data-base="${esc(l.base)}"
        title="Mais ações" aria-label="Mais ações para ${esc(l.base)}" aria-haspopup="menu">${svg(ICO.maisH, 15)}</button>`
      }
      <button class="btn sutil icone" data-acao="ct-fechar" title="Fechar" aria-label="Fechar">${svg(ICO.x, 13)}</button>
    </div>
    <div class="inspetor-corpo">
      <div class="inspetor-secao">
        <span class="situacao-ct ${tomSit}"><span class="pt"></span>${esc(l.sit.texto)}</span>
        ${l.sit.motivo ? `<p class="linha-cinza">${esc(l.sit.motivo)}</p>` : ''}
      </div>
      <div class="inspetor-secao"><h3>Números</h3><dl class="pares">
        ${linhaNum('Autorizado', fmtMoney(ind.autorizado, { dec: 0 }))}
        ${linhaNum('Medido', fmtMoney(ind.medido, { dec: 0 }))}
        ${linhaNum('Pago', fmtMoney(ind.pago, { dec: 0 }))}
        ${ind.retido > 0.005 ? linhaNum('Retido', fmtMoney(ind.retido, { dec: 0 })) : ''}
        ${linhaNum('A pagar agora', fmtMoney(ind.aPagarAgora, { dec: 0 }), ind.aPagarAgora > 0.005 ? 'tom-alerta' : '')}
        ${linhaNum('A medir', fmtMoney(ind.aMedir, { dec: 0 }))}
      </dl></div>
      <div class="inspetor-secao"><h3>Prazo</h3><p class="linha-cinza">${esc(prazoTxt)}</p></div>
      <div class="inspetor-secao"><h3>Composição</h3>${composicao}</div>
      <div class="inspetor-secao"><h3>Últimas medições</h3>${medicoesHtml}</div>
      ${
        l.principal.documentoUrl
          ? `<div class="inspetor-secao"><h3>Documento</h3>
        <a class="btn sutil" href="${esc(l.principal.documentoUrl)}" target="_blank" rel="noopener" data-acao="abrir-externo">${svg(ICO.baixar, 14)}Ver documento anexado</a>
      </div>`
          : ''
      }
    </div>
  </aside>`;
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

  const todas = basesContratuais(o).map((b) => linhaDados(o, b));
  const linhas = filtrar(todas);
  const sel = tela.selecao && todas.find((l) => l.base === tela.selecao);

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
      seletor('regime', opcoesLista('regimes'), 'Todas as formas de preço'),
    ],
    filtrados: linhas.length,
    total: todas.length,
  });

  return `<div class="tela-contratos">
    <div class="tela-principal">
      <div class="tela-lista">
        ${kpisContratos(todas)}
        ${aviso}
        ${pilulasContratos(todas)}
        ${barra}
        ${lista({
          id: 'contratos',
          colunas: colunasContratos(),
          itens: linhas,
          ordemPadrao: { col: 'situacao', dir: 1 },
          testid: 'lista-contratos',
          rodapeRotulo: (n) => `${n} contratos`,
          linhaAttrs: (l) =>
            `data-acao="ct-selecionar" data-base="${esc(l.base)}"${l.base === tela.selecao ? ' aria-selected="true"' : ''}`,
          linhaClasse: () => 'clicavel',
        })}
      </div>
    </div>
    ${sel ? inspetorContrato(o, sel) : ''}
  </div>`;
};
VIEWS.contratos.paineis = true;

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

/* -------------------------------------------------------- inspetor (Fase 5)
   Clicar na linha abre o painel lateral — o botão "⋯" some da tabela e
   vira o menu de ações do cabeçalho do inspetor. */
ACOES['ct-selecionar'] = (el, d) => {
  tela.selecao = tela.selecao === d.base ? '' : d.base;
  App.renderConteudo();
};
ACOES['ct-fechar'] = () => {
  tela.selecao = '';
  App.renderConteudo();
};

document.addEventListener('contextmenu', (ev) => {
  if (App.rota.view !== 'contratos') return;
  const tr = ev.target.closest('table[data-testid="lista-contratos"] tbody tr');
  if (!tr || !tr.dataset.base || Store.somenteLeitura()) return;
  ev.preventDefault();
  fecharMenuCt();
  const menu = document.createElement('div');
  menu.className = 'menu-ctx menu-ct';
  menu.setAttribute('role', 'menu');
  menu.innerHTML = menuLinha(tr.dataset.base);
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
    .filter((m) => medicaoAPagar(o, m) > 0.005)
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
