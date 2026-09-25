/**
 * telas/painel.js — Painel da obra, na linguagem nova.
 *
 * Nada calcula aqui: kpisObra, alertasObra, fluxoCaixa, implantacaoObra e os
 * demais vêm prontos de dominio/calculos.js. A tela só organiza o que já foi
 * calculado — o que precisa de atenção primeiro, os números principais
 * depois, os gráficos de apoio por último.
 */
import { esc, fmtData, fmtMoney, fmtMoneyCurto, fmtPct, num } from '../../nucleo/base.js';
import {
  basesContratuais,
  implantacaoObra,
  kpisObra,
  lancamentoTotal,
  materialCalc,
  medicaoAPagar,
  pendenciasObra,
} from '../../dominio/calculos.js';
import { graficoBarras, graficoCurvaS, graficoFluxo } from '../../graficos/index.js';
import { App, botao } from '../shell.js';
import { alertaHTML, implExpandida, VIEWS } from '../telas-obra.js';

/* -------------------------------------------------------------- kpis */
function kpisPainel(o, k) {
  const item = (rotulo, valor, contexto, tom = '') => `<div class="kpi-item">
    <span class="kpi-rot">${esc(rotulo)}</span>
    <span class="kpi-val${tom ? ' ' + tom : ''}">${valor}</span>
    <span class="kpi-ctx">${contexto}</span>
  </div>`;

  const tomMargem =
    k.margem === null ? '' : k.margem < num(o.fin.margemDesejada) ? 'tom-alerta' : '';

  return `<div class="kpis" role="group" aria-label="Indicadores principais da obra">
    ${item(
      'Saldo em caixa',
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
      `orçamento consumido ${fmtPct(k.progressoFinanceiro, 0)}${k.desvioFisicoFinanceiro < -0.1 ? ' — desembolso à frente' : ''}`,
      k.desvioFisicoFinanceiro < -0.1 ? 'tom-alerta' : '',
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

/* ------------------------------------------------------------ contexto */
function situacaoObra(texto, tom = '') {
  return `<span class="situacao-ct ${tom}"><span class="pt"></span>${esc(texto)}</span>`;
}

function faixaContexto(o, k, criticos, atencao) {
  /* A base do número vai escrita: é a data CONTRATUAL. A etapa mais
     atrasada (Cronograma, Carteira) é outra conta e tem outro rótulo. */
  const prazoTxt =
    k.diasParaFim === null
      ? 'sem data contratual'
      : k.diasParaFim < 0
        ? `data contratual vencida há ${-k.diasParaFim} dias`
        : `${k.diasParaFim} dias até a data contratual`;

  const pendencias = criticos.length
    ? situacaoObra(
        `${criticos.length} alerta${criticos.length > 1 ? 's' : ''} crítico${criticos.length > 1 ? 's' : ''}`,
        'atraso',
      )
    : atencao.length
      ? situacaoObra(`${atencao.length} em atenção`, 'tom-alerta')
      : situacaoObra('sem pendências', 'feito');

  return `<div class="faixa-contexto">
    ${situacaoObra(o.status || 'Planejada', o.status === 'Concluída' ? 'feito' : '')}
    ${situacaoObra(prazoTxt, k.diasParaFim !== null && k.diasParaFim < 0 ? 'atraso' : 'tinta3')}
    ${pendencias}
  </div>`;
}

/* ------------------------------------------------------ implantação */
function cartaoImplantacao(o) {
  const impl = implantacaoObra(o);
  const total = impl.passos.length;
  const aberto = !impl.montada || implExpandida.has(o.id);

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

/* -------------------------------------------------------- o que fazer */
function caixaAcao(o, k, criticos, atencao, pend) {
  const matSaldo = o.materiais
    .filter((m) => m.status !== 'Cancelado')
    .map((m) => materialCalc(o, m));
  const vencidos = matSaldo.filter((c) => c.vencido);
  /* mesma regra do valor ao lado (k.medicoesNaoPagas): já desconta a retenção */
  const medPend = o.medicoes.filter((m) => medicaoAPagar(o, m) > 0.005);
  const recPend = o.recebimentos.filter((r) => r.status !== 'Recebido' && r.status !== 'Cancelado');
  const basesNeg = basesContratuais(o).filter((b) => b.saldo < -0.005);

  const linhas = [
    [
      'Materiais vencidos sem compra',
      vencidos.length,
      vencidos.reduce((s, c) => s + c.saldoValor, 0),
      'materiais',
      vencidos.length > 0,
    ],
    [
      'Contratos com saldo negativo',
      basesNeg.length,
      basesNeg.reduce((s, b) => s + b.saldo, 0),
      'contratos',
      basesNeg.length > 0,
    ],
    ['Medições ainda não pagas', medPend.length, k.medicoesNaoPagas, 'medicoes', false],
    [
      'Recebimentos previstos pendentes',
      recPend.length,
      k.previstoNaoRecebido,
      'recebimentos',
      false,
    ],
    [
      'Materiais com saldo a comprar',
      matSaldo.filter((c) => c.saldo > 0).length,
      matSaldo.reduce((s, c) => (c.saldo > 0 ? s + c.saldoValor : s), 0),
      'materiais',
      false,
    ],
  ];

  const tabela = `<table class="tab sem-fixo">
    <thead><tr><th>Indicador</th><th class="num">Qtde</th><th class="num">Valor</th><th></th></tr></thead>
    <tbody>${linhas
      .map(
        ([rot, qt, val, view, alerta]) => `<tr>
      <td>${esc(rot)}</td>
      <td class="num ${alerta ? 'atraso' : ''}">${qt}</td>
      <td class="num">${fmtMoney(val, { dec: 0 })}</td>
      <td class="acoes-linha">${botao('abrir', 'ir', { view }, 'btn sutil pequeno')}</td>
    </tr>`,
      )
      .join('')}</tbody>
  </table>`;

  if (criticos.length || atencao.length) {
    return `<div class="caixa">
      <div class="caixa-cab">
        <h3>Precisa de atenção</h3>
        <div class="dir">${botao(`Ver ${pend.total} alerta${pend.total === 1 ? '' : 's'}`, 'ir', { view: 'alertas' }, 'btn sutil pequeno')}</div>
      </div>
      ${(criticos.length ? criticos : atencao)
        .slice(0, 4)
        .map((a) => alertaHTML(a))
        .join('')}
      ${tabela}
    </div>`;
  }
  return `<div class="caixa">
    <div class="caixa-cab"><h3>Situação</h3></div>
    <p class="feito" style="margin:0 0 var(--e3)">✓ Sem pendências. A obra está em dia com o que foi lançado.</p>
    ${tabela}
  </div>`;
}

/* ---------------------------------------------------------- andamento */
function caixaAndamento(o, k) {
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
        <div><span class="tinta2" style="font-size:var(--t-peq)">Dias de obra</span><br>
          <b style="font-size:19px">${k.diasObra || '—'}</b></div>
        <div><span class="tinta2" style="font-size:var(--t-peq)">Data contratual</span><br>
          <b>${fmtData(o.previsaoConclusao)}</b></div>
        <div><span class="tinta2" style="font-size:var(--t-peq)">Até a data contratual</span><br>
          <b class="${k.diasParaFim !== null && k.diasParaFim < 0 ? 'atraso' : ''}">${k.diasParaFim === null ? '—' : k.diasParaFim < 0 ? `vencida há ${-k.diasParaFim} dias` : k.diasParaFim + ' dias'}</b></div>
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
  const criticos = pend.itens.filter((a) => a.sev === 3);
  const atencao = pend.itens.filter((a) => a.sev === 2);

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
    ${faixaContexto(o, k, criticos, atencao)}
    ${kpisPainel(o, k)}
    ${cartaoImplantacao(o)}
    ${caixaAcao(o, k, criticos, atencao, pend)}

    <div class="grade g-2-1" style="align-items:start">
      <div class="caixa">
        <div class="caixa-cab">
          <h3>Curva S — avanço físico x financeiro</h3>
          <div class="dir">${botao('Ver detalhes', 'ir', { view: 'curva' }, 'btn sutil pequeno')}</div>
        </div>
        ${graficoCurvaS(o, 280)}
      </div>
      ${caixaAndamento(o, k)}
    </div>

    <div class="grade g-2-1">
      <div class="caixa">
        <div class="caixa-cab">
          <h3>Fluxo de caixa mensal</h3>
          <div class="dir">${botao('Ver tabela completa', 'ir', { view: 'fluxo' }, 'btn sutil pequeno')}</div>
        </div>
        ${graficoFluxo(o, 260)}
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
