/**
 * telas/painel.js — Painel da obra, na linguagem nova.
 *
 * Nada calcula aqui: kpisObra, historiaObra, pendenciasObra, fluxoCaixa,
 * implantacaoObra e os demais vêm prontos de dominio/calculos.js. Como na
 * Visão geral: à esquerda os números (KPIs) e logo abaixo os gráficos; à
 * direita, no inspetor "Pendências", o que pede atenção — a tendência, as
 * pendências por grupo com o botão de cada uma, o financiamento e o que
 * se espera do cliente.
 */
import {
  esc,
  fmtData,
  fmtDataCurta,
  fmtMoney,
  fmtMoneyCurto,
  fmtPct,
  hojeISO,
  novaPendenciaCliente,
  num,
  STATUS_PENDENCIA_CLIENTE,
} from '../../nucleo/base.js';
import { apenasErros, validarPendenciaCliente } from '../../dominio/validacao.js';
import { Store, mutar } from '../../dados/store.js';
import { SUPA } from '../../dados/supabase.js';
import { ACOES } from '../acoes.js';
import {
  historiaObra,
  implantacaoObra,
  kpisObra,
  custoPorEtapa,
  fluxoProjetado,
  liberadoExecutado,
  pendenciasDoCliente,
  proximaParcelaFinanciador,
  nivelIndice,
  pendenciasObra,
  resumoObra,
  valorAgregadoObra,
} from '../../dominio/calculos.js';
import { graficoAuto, graficoBarras, graficoCurvaS } from '../../graficos/index.js';
import { App, abrirForm, botao, confirmar, fecharModal, toast } from '../shell.js';
import { implExpandida, situacaoAncoraHTML, VIEWS } from '../telas-obra.js';
import { listaAcoes } from './carteira.js';
import { faixaKpis, fmtIndice, tomNivel } from './componentes.js';

/* -------------------------------------------------------------- kpis */
/* Resumo da obra (topo do Painel): o nome e como ela está em uma linha,
   com o vocabulário de sempre — Caixa hoje, Pendências. No celular é a
   primeira coisa da tela; a contagem de pendências, numa linha própria
   (alvo de toque inteiro), leva à tela delas. */
function resumoObraHTML(o) {
  const r = resumoObra(o);
  const partes = [];
  if (r.atrasoDias > 0) {
    partes.push(
      `<span class="${r.atrasoDias >= 30 ? 'atraso' : 'tom-alerta'}">Atrasada ${r.atrasoDias} dias</span>`,
    );
  } else if (r.termino) {
    partes.push(`<span class="feito">No prazo</span>`);
  }
  partes.push(
    `<span>${fmtPct(r.fisico, 0)} feito${r.fisicoPrevisto > 0 ? ` <span class="tinta3">(previsto ${fmtPct(r.fisicoPrevisto, 0)})</span>` : ''}</span>`,
  );
  partes.push(
    `<span class="${r.caixaHoje < -0.005 ? 'atraso' : ''}">Caixa hoje ${fmtMoney(r.caixaHoje, { dec: 0 })}</span>`,
  );
  if (r.proximaParcela) {
    const pp = r.proximaParcela;
    partes.push(
      `<span class="${pp.vencida ? 'atraso' : ''}">Próxima parcela ${fmtMoney(pp.valor, { dec: 0 })}${pp.data ? ` ${pp.vencida ? 'venceu' : 'em'} ${fmtDataCurta(pp.data)}` : ''}</span>`,
    );
  }
  const pend = r.pendencias.total
    ? `<button class="btn-link resumo-obra-pend ${r.pendencias.criticas ? 'atraso' : 'tom-alerta'}" data-acao="ir" data-view="alertas" data-obra="${esc(o.id)}">${r.pendencias.total} pendência${r.pendencias.total > 1 ? 's' : ''}${r.pendencias.criticas ? ` (${r.pendencias.criticas} crítica${r.pendencias.criticas > 1 ? 's' : ''})` : ''}</button>`
    : '<span class="resumo-obra-pend feito">Sem pendências</span>';
  return `<section class="resumo-obra n-${r.nivel}" aria-label="Resumo da obra">
    <h2 class="resumo-obra-nome">${esc(o.nome)}${r.status ? ` <span class="tinta3">· ${esc(r.status)}</span>` : ''}</h2>
    <p class="resumo-obra-linha">${partes.join('<span class="tinta3"> · </span>')}</p>
    ${pend}
  </section>`;
}

function kpisPainel(o, k, va) {
  const tomMargem =
    k.margem === null ? '' : k.margem < num(o.fin.margemDesejada) ? 'tom-alerta' : '';

  return faixaKpis(
    [
      {
        rotulo: 'Caixa hoje',
        valor: fmtMoney(k.saldoCaixa, { dec: 0 }),
        contexto: `recebido ${fmtMoneyCurto(k.recebido)} · pago ${fmtMoneyCurto(k.totalPago)}`,
        tom: k.saldoCaixa < 0 ? 'atraso' : '',
      },
      {
        rotulo: 'Resultado projetado',
        valor: k.resultado === null ? '—' : fmtMoney(k.resultado, { dec: 0 }),
        contexto:
          k.margem === null
            ? 'informe o valor de venda'
            : `margem ${fmtPct(k.margem)} · alvo ${fmtPct(o.fin.margemDesejada)}`,
        tom: tomMargem,
      },
      {
        rotulo: 'Avanço físico',
        valor: fmtPct(k.progressoFisico, 0),
        contexto:
          va.idp === null
            ? `orçamento consumido ${fmtPct(k.progressoFinanceiro, 0)}`
            : `previsto ${fmtPct(va.previsto, 0)} · IDP ${fmtIndice(va.idp)} · IDC ${fmtIndice(va.idc)}`,
        tom: tomNivel(nivelIndice(va.idp, 'idp')),
      },
      {
        rotulo: 'Saldo contratual',
        valor: fmtMoney(k.saldoContratual, { dec: 0 }),
        contexto: `de ${fmtMoneyCurto(k.contratado)} contratados${k.aditivosPendentes ? ` · ${fmtMoneyCurto(k.aditivosPendentes)} em aditivo pendente` : ''}`,
        tom: k.saldoContratual < 0 ? 'atraso' : '',
      },
      {
        rotulo: 'Custo físico/m²',
        valor: o.areaConstruida ? fmtMoney(k.custoFisicoPrevistoM2, { dec: 0 }) : '—',
        contexto:
          num(o.fin.custoFisicoMaxM2) > 0
            ? `previsto · teto ${fmtMoney(o.fin.custoFisicoMaxM2, { dec: 0 })}/m²`
            : 'previsto, sem terreno, taxas e comissão',
        tom:
          num(o.fin.custoFisicoMaxM2) > 0 && k.custoFisicoPrevistoM2 > num(o.fin.custoFisicoMaxM2)
            ? 'tom-alerta'
            : '',
      },
    ],
    { rotulo: 'Indicadores principais da obra' },
  );
}

/* ------------------------------------------------------ implantação */
function cartaoImplantacao(o) {
  const impl = implantacaoObra(o);
  const total = impl.passos.length;
  const aberto = !impl.montada || implExpandida.has(o.id);
  /* obra com os 8 passos feitos não precisa mais da faixa: some sozinha */
  if (impl.completa && !implExpandida.has(o.id)) return '';

  if (!aberto) {
    return `<div class="implantacao montada" data-acao="impl-toggle" data-obra="${o.id}" role="button" tabindex="0">
      <span class="impl-check feito">✓</span>
      <b>Obra implantada</b>
      <span class="impl-mini">${impl.feitos} de ${total} passos</span>
      <span class="impl-abrir">ver a sequência</span>
    </div>`;
  }

  const fase = (nome, rot) => {
    const ps = impl.passos.filter((p) => p.fase === nome);
    return `<div class="impl-fase"><span class="impl-fase-t">${rot}</span>
      ${ps
        .map(
          (
            p,
          ) => `<button class="impl-passo${p.feito ? ' feito' : ''}" data-acao="ir" data-view="${p.v}">
        <span class="impl-check${p.feito ? ' feito' : ''}">${p.feito ? '✓' : ''}</span>
        <span class="impl-passo-txt"><b>${esc(p.rotulo)}</b><span>${esc(p.dica)}${p.opcional ? ' · opcional' : ''}</span></span>
      </button>`,
        )
        .join('')}
    </div>`;
  };

  const acao = impl.montada
    ? botao('Recolher', 'impl-toggle', { obra: o.id }, 'btn sutil pequeno')
    : '';

  return `<div class="caixa cartao-implantacao">
    <div class="caixa-cab">
      <h3>Implantação da obra</h3>
      <div class="dir">${acao}</div>
    </div>
    <div class="impl-topo">
      <div class="impl-prog">
        <span class="trilha"><i class="medido" style="width:${(impl.pct * 100).toFixed(1)}%"></i></span>
        <span class="impl-prog-n mono">${impl.feitosObrig}/${impl.totalObrig} essenciais${impl.feitos > impl.feitosObrig ? ` · +${impl.feitos - impl.feitosObrig}` : ''}</span>
      </div>
      <p class="impl-lead">${
        impl.montada
          ? 'O básico está montado. Agora é tocar a obra — medições, recebimentos e compras.'
          : 'Preencha nesta ordem. Cada passo abre a tela certa.'
      }</p>
    </div>
    ${fase('planejar', '1 · Planejar')}
    ${fase('executar', '2 · Executar')}
  </div>`;
}

/* ---------------------------------------------------------- andamento */
function caixaAndamento(o, k, va) {
  return `<div class="caixa">
    <div class="caixa-cab"><h3>Andamento da obra</h3></div>
    <div style="display:flex;flex-direction:column;gap:12px">
      <div>
        <div style="display:flex;justify-content:space-between;font-size:var(--t-peq);margin-bottom:4px">
          <span class="tinta2">Etapas concluídas</span>
          <b class="mono">${k.etapasConcluidas}/${k.etapasTotal}</b>
        </div>
        <span class="trilha" style="display:block;flex:none;width:100%"><i class="medido" style="width:${(k.etapasTotal ? (k.etapasConcluidas / k.etapasTotal) * 100 : 0).toFixed(1)}%"></i></span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:var(--t-corpo)">
        <div><span class="tinta2" style="font-size:var(--t-peq)">Etapas atrasadas</span><br>
          <b style="font-size:19px" class="${k.etapasAtrasadas ? 'atraso' : ''}">${k.etapasAtrasadas}</b></div>
        <div><span class="tinta2" style="font-size:var(--t-peq)">Início atrasado</span><br>
          <b style="font-size:19px" class="${k.etapasInicioAtrasado ? 'atraso' : ''}">${k.etapasInicioAtrasado}</b></div>
        <div><span class="tinta2" style="font-size:var(--t-peq)">Término projetado</span><br>
          <b class="${va.atrasoProjetado > 0 ? 'atraso' : ''}">${va.termino ? fmtData(va.termino) : '—'}</b></div>
        <div><span class="tinta2" style="font-size:var(--t-peq)">Data contratual</span><br>
          <b>${fmtData(o.previsaoConclusao)}</b>${va.atrasoProjetado > 0 ? ` <span class="atraso" style="font-size:var(--t-peq)">+${va.atrasoProjetado} d</span>` : ''}</div>
      </div>
      <div style="border-top:var(--fio) solid var(--separador);padding-top:10px">
        <span class="tinta2" style="font-size:var(--t-peq)">Liberado pelo financiamento</span>
        <div style="display:flex;justify-content:space-between;font-size:var(--t-peq);margin:4px 0">
          <span>${fmtMoney(k.recebidoFinanciamento, { dec: 0 })} de ${fmtMoney(k.financiado, { dec: 0 })}</span>
          <b class="mono">${k.liberadoFinanciamento === null ? '—' : fmtPct(k.liberadoFinanciamento, 1)}</b>
        </div>
        <span class="trilha" style="display:block;flex:none;width:100%"><i class="medido" style="width:${(Math.min(1, k.liberadoFinanciamento || 0) * 100).toFixed(1)}%"></i></span>
        ${k.recebidoProprio > 0.005 ? `<span class="tinta3" style="font-size:var(--t-peq)">+ ${fmtMoney(k.recebidoProprio, { dec: 0 })} de recursos próprios do cliente</span>` : ''}
      </div>
    </div>
  </div>`;
}

/* ---------------------------------------------------------------- tela */
/* Card do financiador (0016) — qualquer um: CAIXA, outro banco, o
   cliente pagando por marco. A decisão que ele habilita: pedir a
   vistoria agora ou concluir o serviço antes. Números de
   proximaParcelaFinanciador e liberadoExecutado. */
const PASSO_TEXTO = { solicitada: 'solicitada', vistoriada: 'vistoriada', aprovada: 'aprovada, aguardando crédito' };

function secaoFinanciador(o) {
  const p = proximaParcelaFinanciador(o);
  const le = liberadoExecutado(o);
  if (!p && !le) return '';
  const quem = (p && p.financiador) || (le && le.financiador) || 'financiador';

  let decisao = '';
  let parcela = '';
  if (p) {
    const numero = p.r.numeroMedicao ? `Parcela ${esc(p.r.numeroMedicao)}` : 'Próxima parcela';
    const quando = p.r.dataPrevista
      ? `${p.vencida ? '<span class="atraso">' : ''}prevista para ${esc(fmtDataCurta(p.r.dataPrevista))}${p.vencida ? ' — vencida</span>' : ''}`
      : 'sem data prevista';
    parcela = `<p class="linha-fin"><b>${numero}</b> · ${fmtMoney(p.valor, { dec: 0 })} · ${quando}</p>`;
    if (p.exigido > 0) {
      const pct = (v) => Math.min(100, Math.max(0, v * 100)).toFixed(1);
      parcela += `<div class="barra-exigido" role="img" aria-label="Físico ${fmtPct(p.fisico, 0)} contra ${fmtPct(p.exigido, 0)} exigidos">
          <span class="trilha"><i style="width:${pct(p.fisico)}%"></i><b class="marca-exigido" style="left:${pct(p.exigido)}%"></b></span>
          <span class="tinta2">físico ${fmtPct(p.fisico, 0)}${p.porPlanilha ? ' pela planilha do financiador' : ''} · exigido ${fmtPct(p.exigido, 0)}</span>
        </div>`;
    }
    if (p.decisao === 'aguardar') {
      decisao = `<p class="decisao-fin tom-alerta">Parcela ${esc(PASSO_TEXTO[p.etapa] || p.etapa)}${
        p.diasSolicitada !== null ? ` há ${p.diasSolicitada} dia${p.diasSolicitada === 1 ? '' : 's'}` : ''
      }. <b>Cobrar ${quem === 'financiador' ? 'o financiador' : esc(quem)}.</b></p>`;
    } else if (p.decisao === 'pedir') {
      decisao = `<p class="decisao-fin feito"><b>Pedir a vistoria agora:</b> o físico já passou do exigido.</p>`;
    } else if (p.decisao === 'concluir') {
      const lista = p.etapas.map((e) => `${esc(e.etapa)} (${fmtPct(e.progresso, 0)})`).join(', ');
      decisao = `<p class="decisao-fin"><b>Concluir antes de pedir:</b> faltam ${fmtPct(p.falta, 1)} de obra${lista ? ` — ${lista}` : ''}.</p>`;
    } else {
      decisao = `<p class="decisao-fin tinta2">Cadastre o % de obra que ${esc(quem)} exige nesta parcela para saber quando pedir a vistoria.</p>`;
    }
  }

  const banca = le
    ? `<p class="linha-fin tinta2">Liberado <b>${fmtPct(le.liberado, 1)}</b> · executado <b>${fmtPct(le.executado, 1)}</b>${
        le.bancando > 0.5
          ? ` — <span class="tom-alerta">a construtora está bancando ${fmtMoney(le.bancando, { dec: 0 })}</span>`
          : le.adiantado > 0.5 ? ` — ${fmtMoney(le.adiantado, { dec: 0 })} liberados à frente da obra` : ''
      }</p>`
    : '';

  return `<section class="inspetor-secao caixa-financiador">
    <div class="inspetor-secao-cab">
      <h3>Financiamento${quem !== 'financiador' ? ` · ${esc(quem)}` : ''}</h3>
      ${botao('Ver parcelas', 'ir', { view: 'recebimentos' }, 'btn sutil pequeno')}
    </div>
    ${parcela}
    ${decisao}
    ${banca}
  </section>`;
}

/* Caixa no Painel: só o vale (o gráfico mês a mês mora na tela de Fluxo).
   O número que importa é o menor saldo que vem por aí, e quando. */
function caixaVale(k, proj) {
  const v = proj.vale;
  const tom = v.saldo < 0 ? 'atraso' : v.saldo < k.saldoCaixa * 0.5 ? 'tom-alerta' : '';
  const proximos = proj.eventos.filter((e) => e.data <= v.data).slice(-3);
  return `<div class="caixa caixa-vale">
    <div class="caixa-cab">
      <h3>Caixa projetado</h3>
      <div class="dir">${botao('Ver fluxo', 'ir', { view: 'fluxo' }, 'btn sutil pequeno')}</div>
    </div>
    <dl class="pares">
      <div class="par"><dt>Caixa hoje</dt><dd class="${k.saldoCaixa < 0 ? 'atraso' : ''}">${fmtMoney(k.saldoCaixa, { dec: 0 })}</dd></div>
      <div class="par"><dt>Vale de caixa</dt><dd class="${tom}"><b>${fmtMoney(v.saldo, { dec: 0 })}</b> ${v.data <= hojeISO() ? 'hoje' : `em ${esc(fmtDataCurta(v.data))}`}</dd></div>
      <div class="par"><dt>No fim da obra</dt><dd class="${k.posicaoProjetada < 0 ? 'atraso' : ''}">${fmtMoney(k.posicaoProjetada, { dec: 0 })}</dd></div>
    </dl>
    ${proximos.length ? `<p class="tinta2 vale-proximos">Até o vale: ${proximos.map((e) => `${esc(e.descricao)} ${e.valor > 0 ? '+' : '−'}${esc(fmtMoneyCurto(Math.abs(e.valor)))}`).join(' · ')}</p>` : ''}
  </div>`;
}

/* Aguardando o cliente (0018): o que ele deve à obra — aprovação,
   escolha, documento. Vencida vira pendência da obra (alertasObra). */
const pcliDisponivel = () => Store.backend !== 'supabase' || SUPA.tabelaDisponivel('pendencias_cliente');

function secaoCliente(o) {
  if (!pcliDisponivel()) return '';
  const pc = pendenciasDoCliente(o);
  if (!o.clienteId && !pc.abertas.length) return '';
  const hoje = hojeISO();
  const podeEditar = !Store.somenteLeitura();
  const linhas = pc.abertas.map((p) => {
    const vencida = p.prazo && p.prazo < hoje;
    return `<li class="${vencida ? 'atraso' : ''}">
      <span><b>${esc(p.descricao)}</b>${p.prazo ? ` · até ${esc(fmtDataCurta(p.prazo))}${vencida ? ' — vencida' : ''}` : ''}</span>
      ${podeEditar ? `<span class="acoes-pcli">${botao('Resolvida', 'resolver-pcli', { id: p.id }, 'btn sutil pequeno')}
        ${botao('Editar', 'editar-pcli', { id: p.id }, 'btn sutil pequeno')}</span>` : ''}
    </li>`;
  }).join('');
  return `<section class="inspetor-secao caixa-cliente">
    <div class="inspetor-secao-cab">
      <h3>Aguardando o cliente${pc.abertas.length ? ` · ${pc.abertas.length}` : ''}</h3>
      ${podeEditar ? botao('Registrar', 'nova-pcli', {}, 'btn sutil pequeno', 'mais') : ''}
    </div>
    ${linhas ? `<ul class="lista-pcli">${linhas}</ul>` : '<p class="linha-cinza">Nada pendente do lado do cliente. Registre aqui aprovações, escolhas e documentos que ele precisa entregar.</p>'}
  </section>`;
}

function formPcli(p, nova) {
  abrirForm({
    titulo: nova ? 'O cliente precisa…' : 'Editar pendência do cliente',
    campos: [
      { k: 'descricao', label: 'O quê', tipo: 'texto', col: 12, obrigatorio: true, placeholder: 'escolher o revestimento da cozinha' },
      { k: 'prazo', label: 'Até quando', tipo: 'data', col: 6 },
      { k: 'status', label: 'Situação', tipo: 'select', opcoes: STATUS_PENDENCIA_CLIENTE, vazio: false, col: 6 },
    ],
    valores: p,
    validar: (d) => validarPendenciaCliente({ ...p, ...d, resolvidaEm: d.status === 'resolvida' ? p.resolvidaEm || hojeISO() : '' }),
    aoSalvar: (d) => {
      const o = App.obra();
      const novo = { ...p, ...d, resolvidaEm: d.status === 'resolvida' ? p.resolvidaEm || hojeISO() : '' };
      if (apenasErros(validarPendenciaCliente(novo)).length) return;
      mutar(() => {
        if (nova) o.pendenciasCliente.push(novo);
        else Object.assign(p, novo);
      });
      fecharModal();
      toast(nova ? 'Pendência do cliente registrada.' : 'Pendência atualizada.', 'ok');
    },
  });
  /* excluir fica dentro do formulário de edição, como nas outras telas */
  const esq = !nova && !Store.somenteLeitura() && document.querySelector('#modal-camada footer .esq');
  if (esq) esq.innerHTML = `<button class="btn perigo" data-acao="excluir-pcli" data-id="${esc(p.id)}">Excluir</button>`;
}

ACOES['excluir-pcli'] = (el, d) => {
  const o = App.obra();
  const p = (o.pendenciasCliente || []).find((x) => x.id === d.id);
  if (!p) return;
  confirmar('Excluir pendência', `Excluir "${p.descricao}"?`, () => {
    mutar(() => { o.pendenciasCliente = o.pendenciasCliente.filter((x) => x.id !== p.id); });
    toast('Pendência excluída.', 'aviso');
  });
};

ACOES['nova-pcli'] = () => formPcli(novaPendenciaCliente(), true);
ACOES['editar-pcli'] = (el, d) => {
  const p = (App.obra().pendenciasCliente || []).find((x) => x.id === d.id);
  if (p) formPcli(p, false);
};
ACOES['resolver-pcli'] = (el, d) => {
  const p = (App.obra().pendenciasCliente || []).find((x) => x.id === d.id);
  if (!p) return;
  mutar(() => { p.status = 'resolvida'; p.resolvidaEm = hojeISO(); });
  toast('Pendência do cliente resolvida.', 'ok');
};

/* Inspetor "Pendências" à direita — o mesmo da Visão geral, para esta
   obra: a tendência (a linha de situação da frase-âncora), as pendências
   por grupo com o botão de cada uma, o financiamento e o cliente. */
function inspetorPainel(o, historia, pend) {
  const emJogo = historia.causasTodas.reduce((s, c) => s + c.valor, 0);
  const sub = `${pend.total ? `${pend.total} pendência${pend.total > 1 ? 's' : ''}` : 'nada pendente'}${
    emJogo > 0.5 ? ` · ${fmtMoney(emJogo, { dec: 0 })} em jogo` : ''
  }`;
  return `<aside class="inspetor inspetor-painel" data-testid="inspetor-painel" aria-label="Pendências da obra">
    <div class="inspetor-cab">
      <h2>Pendências<span class="sub">${sub}</span></h2>
      ${pend.total ? botao('Ver todas', 'ir', { view: 'alertas' }, 'btn sutil pequeno') : ''}
    </div>
    <div class="inspetor-corpo">
      <section class="inspetor-secao painel-tendencia n-${esc(historia.nivel)}">
        <h3>Tendência</h3>
        <p>${situacaoAncoraHTML(historia, o.status)}</p>
      </section>
      <section class="inspetor-secao painel-pendencias">
        ${listaAcoes(pend.itens, false, 'Sem pendências. A obra está em dia com o que foi lançado.')}
      </section>
      ${secaoFinanciador(o)}
      ${secaoCliente(o)}
    </div>
  </aside>`;
}

VIEWS.painel = () => {
  const o = App.obra();
  const k = kpisObra(o);
  /* a mesma contagem do menu, da carteira e da tela de Alertas */
  const pend = pendenciasObra(o);
  const va = valorAgregadoObra(o);
  const historia = historiaObra(o);

  const proj = fluxoProjetado(o);

  return `<div class="tela-painel-obra">
    <div class="tela-principal">
      <div class="tela-lista tela-painel">
        ${resumoObraHTML(o)}
        ${kpisPainel(o, k, va)}
        ${cartaoImplantacao(o)}

        <!-- Curva S à esquerda; à direita, Andamento e Caixa projetado
             empilhados, dividindo a altura: as duas colunas terminam juntas
             e o gráfico ocupa a altura que a coluna da direita pede. -->
        <div class="painel-linha">
          <div class="caixa caixa-curva">
            <div class="caixa-cab">
              <h3>Curva S — avanço físico x financeiro</h3>
              <div class="dir">${botao('Ver detalhes', 'ir', { view: 'curva' }, 'btn sutil pequeno')}</div>
            </div>
            <div class="nao-celular painel-curva">${graficoAuto((w, h) => graficoCurvaS(o, h || 280, w), 920, 280)}</div>
            <p class="so-celular numeros-celular">Físico <b>${fmtPct(k.progressoFisico, 0)}</b> (previsto ${fmtPct(va.previsto, 0)}) · IDP <b>${fmtIndice(va.idp)}</b> · IDC <b>${fmtIndice(va.idc)}</b></p>
          </div>
          <div class="painel-lado">
            ${caixaAndamento(o, k, va)}
            ${caixaVale(k, proj)}
          </div>
        </div>

        <div class="caixa">
          <div class="caixa-cab"><h3>Onde o dinheiro foi</h3></div>
          ${graficoBarras(custoPorEtapa(o), { limite: 8, colunas: 2 })}
        </div>
      </div>
    </div>
    ${inspetorPainel(o, historia, pend)}
  </div>`;
};

/* Números à esquerda, pendências à direita, cada painel com a própria
   rolagem — como a Visão geral. */
VIEWS.painel.paineis = true;
