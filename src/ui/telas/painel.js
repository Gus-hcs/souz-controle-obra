/**
 * telas/painel.js — Painel da obra, na linguagem nova.
 *
 * Nada calcula aqui: kpisObra, historiaObra, causasRaizObra, fluxoCaixa,
 * implantacaoObra e os demais vêm prontos de dominio/calculos.js. A tela
 * conta a história da obra na ordem da auditoria: situação → causa → ação
 * na frase do topo, os números principais depois, as causas com o dinheiro
 * em jogo, os gráficos de apoio por último.
 */
import { esc, fmtData, fmtMoney, fmtMoneyCurto, fmtPct, num } from '../../nucleo/base.js';
import {
  historiaObra,
  implantacaoObra,
  kpisObra,
  lancamentoTotal,
  nivelIndice,
  pendenciasObra,
  valorAgregadoObra,
} from '../../dominio/calculos.js';
import { graficoBarras, graficoCurvaS, graficoFluxo } from '../../graficos/index.js';
import { App, botao } from '../shell.js';
import { causaHTML, fraseAncoraHTML, implExpandida, VIEWS } from '../telas-obra.js';
import { fmtIndice, tomNivel } from './componentes.js';

/* -------------------------------------------------------------- kpis */
function kpisPainel(o, k, va) {
  const item = (rotulo, valor, contexto, tom = '') => `<div class="kpi-item">
    <span class="kpi-rot">${esc(rotulo)}</span>
    <span class="kpi-val${tom ? ' ' + tom : ''}">${valor}</span>
    <span class="kpi-ctx">${contexto}</span>
  </div>`;

  const tomMargem =
    k.margem === null ? '' : k.margem < num(o.fin.margemDesejada) ? 'tom-alerta' : '';

  return `<div class="kpis" role="group" aria-label="Indicadores principais da obra">
    ${item(
      'Caixa hoje',
      fmtMoney(k.saldoCaixa, { dec: 0 }),
      `recebido ${fmtMoneyCurto(k.recebido)} · pago ${fmtMoneyCurto(k.totalPago)}`,
      k.saldoCaixa < 0 ? 'atraso' : '',
    )}
    ${item(
      'Resultado projetado',
      k.resultado === null ? '—' : fmtMoney(k.resultado, { dec: 0 }),
      k.margem === null
        ? 'informe o valor de venda'
        : `margem ${fmtPct(k.margem)} · alvo ${fmtPct(o.fin.margemDesejada)}`,
      tomMargem,
    )}
    ${item(
      'Avanço físico',
      fmtPct(k.progressoFisico, 0),
      va.idp === null
        ? `orçamento consumido ${fmtPct(k.progressoFinanceiro, 0)}`
        : `previsto ${fmtPct(va.previsto, 0)} · IDP ${fmtIndice(va.idp)} · IDC ${fmtIndice(va.idc)}`,
      tomNivel(nivelIndice(va.idp, 'idp')),
    )}
    ${item(
      'Saldo contratual',
      fmtMoney(k.saldoContratual, { dec: 0 }),
      `de ${fmtMoneyCurto(k.contratado)} contratados${k.aditivosPendentes ? ` · ${fmtMoneyCurto(k.aditivosPendentes)} em aditivo pendente` : ''}`,
      k.saldoContratual < 0 ? 'atraso' : '',
    )}
    ${item(
      'Custo físico/m²',
      o.areaConstruida ? fmtMoney(k.custoFisicoPrevistoM2, { dec: 0 }) : '—',
      num(o.fin.custoFisicoMaxM2) > 0
        ? `previsto · teto ${fmtMoney(o.fin.custoFisicoMaxM2, { dec: 0 })}/m²`
        : 'previsto, sem terreno, taxas e comissão',
      num(o.fin.custoFisicoMaxM2) > 0 && k.custoFisicoPrevistoM2 > num(o.fin.custoFisicoMaxM2)
        ? 'tom-alerta'
        : '',
    )}
  </div>`;
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

/* -------------------------------------------------------- o que fazer
   Causas-raiz com o dinheiro em jogo e a ação — num bloco só. A antiga
   tabela "Indicador / Qtde / Valor" repetia o que os alertas já diziam. */
function caixaAcao(pend, historia) {
  const causas = historia.causasTodas;
  if (!causas.length) {
    return `<div class="caixa">
      <div class="caixa-cab"><h3>Situação</h3></div>
      <p class="feito" style="margin:0">✓ Sem pendências. A obra está em dia com o que foi lançado.</p>
    </div>`;
  }
  const valor = causas.reduce((s, c) => s + c.valor, 0);
  return `<div class="caixa">
    <div class="caixa-cab">
      <h3>Pendências<span class="tinta2" style="font-weight:400"> · ${causas.length} problema${causas.length > 1 ? 's' : ''}-raiz${valor > 0.5 ? ` · ${fmtMoney(valor, { dec: 0 })} em jogo` : ''}</span></h3>
      <div class="dir">${botao(`Ver ${pend.total === 1 ? 'a pendência' : `as ${pend.total} pendências`}`, 'ir', { view: 'alertas' }, 'btn sutil pequeno')}</div>
    </div>
    ${causas
      .slice(0, 4)
      .map((c) => causaHTML(c))
      .join('')}
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
VIEWS.painel = () => {
  const o = App.obra();
  const k = kpisObra(o);
  /* a mesma contagem do menu, da carteira e da tela de Alertas */
  const pend = pendenciasObra(o);
  const va = valorAgregadoObra(o);
  const historia = historiaObra(o);

  const custoPorEtapa = {};
  o.lancamentos.forEach((l) => {
    const et = l.etapa || 'Não classificado';
    custoPorEtapa[et] = (custoPorEtapa[et] || 0) + lancamentoTotal(l);
  });
  o.medicoes
    .filter((m) => m.status !== 'Cancelado')
    .forEach((m) => {
      const ct = o.contratos.find((c) => c.codigoBase === m.contratoBase);
      const et = (ct && ct.escopo) || 'Empreitada';
      custoPorEtapa[et] = (custoPorEtapa[et] || 0) + num(m.valorPago);
    });

  return `<div class="tela-lista">
    ${fraseAncoraHTML(historia, { status: o.status })}
    ${kpisPainel(o, k, va)}
    ${cartaoImplantacao(o)}
    ${caixaAcao(pend, historia)}

    <div class="grade g-2-1" style="align-items:start">
      <div class="caixa">
        <div class="caixa-cab">
          <h3>Curva S — avanço físico x financeiro</h3>
          <div class="dir">${botao('Ver detalhes', 'ir', { view: 'curva' }, 'btn sutil pequeno')}</div>
        </div>
        <div class="nao-celular">${graficoCurvaS(o, 280)}</div>
        <p class="so-celular numeros-celular">Físico <b>${fmtPct(k.progressoFisico, 0)}</b> (previsto ${fmtPct(va.previsto, 0)}) · IDP <b>${fmtIndice(va.idp)}</b> · IDC <b>${fmtIndice(va.idc)}</b></p>
      </div>
      ${caixaAndamento(o, k, va)}
    </div>

    <div class="grade g-2-1">
      <div class="caixa">
        <div class="caixa-cab">
          <h3>Fluxo de caixa mensal</h3>
          <div class="dir">${botao('Ver tabela completa', 'ir', { view: 'fluxo' }, 'btn sutil pequeno')}</div>
        </div>
        <div class="nao-celular">${graficoFluxo(o, 260)}</div>
        <p class="so-celular numeros-celular">Caixa hoje <b class="${k.saldoCaixa < 0 ? 'atraso' : ''}">${fmtMoney(k.saldoCaixa, { dec: 0 })}</b> · no fim da obra <b class="${k.posicaoProjetada < 0 ? 'atraso' : ''}">${fmtMoney(k.posicaoProjetada, { dec: 0 })}</b></p>
      </div>
      <div class="caixa">
        <div class="caixa-cab"><h3>Onde o dinheiro foi</h3></div>
        ${graficoBarras(
          Object.entries(custoPorEtapa).map(([rotulo, valor]) => ({ rotulo, valor })),
          { limite: 8 },
        )}
      </div>
    </div>
  </div>`;
};
