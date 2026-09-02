/**
 * telas-obra.js — Telas da obra: painel, contratos, medições, recebimentos, materiais, cronograma.
 */
import { competencia, diasEntre, esc, fmtCompetencia, fmtData, fmtDataCurta, fmtMoney, fmtMoneyCurto, fmtNum, fmtPct, hojeISO, isISO, norm, num, round2 } from '../nucleo/base.js';
import { alertasObra, basesContratuais, contratoValor, curvaS, etapaCalc, fluxoCaixa, fluxoCarteira, kpisCarteira, kpisObra, lancamentoTotal, materialCalc, medicaoAlerta, medicaoLiquido, pesosCronograma, recebimentoDiferenca } from '../dominio/calculos.js';
import { Store } from '../dados/store.js';
import { SUPA } from '../dados/supabase.js';
import { anel, App, acoesLinha, barra, botao, campoBusca, campoHTML, cartao, chip, filtraTexto, ICO, kpi, nomeCliente, opcoesEtapas, opcoesLista, selectFiltro, sparkline, svg, tomSituacao, tomStatus, vazio } from './shell.js';
import { graficoBarras, graficoCurvaS, graficoFluxo, graficoFluxoCarteira, graficoGantt } from '../graficos/index.js';

const VIEWS = {};

/* contratos-base expandidos na tela de contratos (persiste entre re-renders).
   As ações ct-toggle / ct-todos ficam em acoes.js. */
const contratosAbertos = new Set();

/* prazo previsto de um registro de contrato, com aviso de atraso */
function prazoRegistro(c) {
  if (!c || (!isISO(c.inicioPrevisto) && !isISO(c.fimPrevisto))) return { texto: '', atrasado: false };
  const ini = isISO(c.inicioPrevisto) ? fmtDataCurta(c.inicioPrevisto) : '?';
  const fim = isISO(c.fimPrevisto) ? fmtDataCurta(c.fimPrevisto) : '?';
  const atrasado = isISO(c.fimPrevisto) && c.fimPrevisto < hojeISO() && c.status !== 'Concluído' && c.status !== 'Cancelado';
  return { texto: `${ini} → ${fim}`, atrasado };
}

/* ==================================================== CARTEIRA (todas) */
VIEWS.carteira = () => {
  const e = Store.estado;
  if (!e.obras.length) {
    return `<div class="cartao"><div class="corpo">${vazio(
      'Nenhuma obra cadastrada',
      'Cadastre a primeira obra para começar a controlar contratos, medições, recebimentos e materiais. Se já usa uma planilha de acompanhamento (inclusive do modelo MCMV), pode importar.',
      `${botao('Nova obra', 'nova-obra', {}, 'btn primario', 'mais')}
       ${botao('Importar planilha', 'importar-xlsx', {}, 'btn', 'baixar')}
       ${botao('Carregar dados de exemplo', 'exemplo', {}, 'btn sutil')}`
    )}</div></div>`;
  }

  const k = kpisCarteira(e);
  const criticos = k.alertas.filter((a) => a.sev === 3).slice(0, 6);

  const cartoesObra = e.obras.map((o) => {
    const ko = kpisObra(o);
    const al = alertasObra(o);
    const crit = al.filter((a) => a.sev === 3).length;
    return `<button class="obra-cartao" data-acao="ir" data-view="painel" data-obra="${o.id}">
      <div class="topo">
        <div class="anel-obra">${anel(ko.progressoFisico, crit ? 'critico' : ko.etapasAtrasadas ? 'aviso' : 'marca')}</div>
        <div style="min-width:0;flex:1">
          <h4>${esc(o.nome)}</h4>
          <div class="meta">${esc([nomeCliente(o.clienteId), o.cidade].filter(Boolean).join(' · ') || 'sem cliente vinculado')}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end">
          ${chip(o.status, tomStatus(o.status))}
          ${crit ? `<span class="chip critico"><span class="pt"></span>${crit} crítico${crit > 1 ? 's' : ''}</span>`
            : al.length ? `<span class="chip aviso"><span class="pt"></span>${al.length} pendência${al.length > 1 ? 's' : ''}</span>` : ''}
        </div>
      </div>
      <div class="linhas">
        <div><span>Saldo em caixa</span><br><b class="${ko.saldoCaixa < 0 ? 'neg' : ''}">${fmtMoneyCurto(ko.saldoCaixa)}</b></div>
        <div><span>Resultado projet.</span><br><b class="${ko.resultado !== null && ko.resultado < 0 ? 'neg' : ''}">${ko.resultado === null ? '—' : fmtMoneyCurto(ko.resultado)}</b></div>
        <div><span>Custo prev./m²</span><br><b>${ko.area ? fmtMoney(ko.custoPrevistoM2, { dec: 0 }) : '—'}</b></div>
        <div><span>Saldo contratual</span><br><b class="${ko.saldoContratual < 0 ? 'neg' : ''}">${fmtMoneyCurto(ko.saldoContratual)}</b></div>
      </div>
    </button>`;
  }).join('');

  const dObra = e.obras.map((o) => ({ o, ko: kpisObra(o) }));
  const temFluxo = fluxoCarteira(e).some((m) => m.entradas || m.saidas);

  const graf = (titulo, itens, opcoes, minimo = 1) =>
    itens.length >= minimo ? cartao(titulo, graficoBarras(itens, opcoes)) : '';

  const cartoesGraf = [
    graf('Resultado projetado por obra',
      dObra.filter((d) => d.ko.resultado !== null).map((d) => ({
        rotulo: d.o.nome, valor: round2(d.ko.resultado),
        cor: d.ko.resultado < 0 ? 'var(--critico)' : 'var(--ok)'
      })), { formata: (v) => fmtMoneyCurto(v) }),
    graf('Avanço físico por obra',
      dObra.map((d) => ({
        rotulo: d.o.nome, valor: d.ko.progressoFisico,
        cor: d.ko.etapasAtrasadas ? 'var(--aviso)' : 'var(--marca)'
      })), { formata: (v) => fmtPct(v, 0), max: 1, manterZeros: true }, 2),
    graf('Saldo em caixa por obra',
      dObra.map((d) => ({
        rotulo: d.o.nome, valor: round2(d.ko.saldoCaixa),
        cor: d.ko.saldoCaixa < 0 ? 'var(--critico)' : 'var(--s1)'
      })), { formata: (v) => fmtMoneyCurto(v), manterZeros: true }, 2),
    e.obras.length > 1
      ? graf('Custo previsto por m²',
        dObra.filter((d) => d.ko.area > 0).map((d) => ({ rotulo: d.o.nome, valor: round2(d.ko.custoPrevistoM2) })),
        { formata: (v) => fmtMoney(v, { dec: 0 }) + '/m²' })
      : '',
    graf('A receber por obra',
      dObra.filter((d) => d.ko.previstoNaoRecebido > 0).map((d) => ({
        rotulo: d.o.nome, valor: round2(d.ko.previstoNaoRecebido), cor: 'var(--s3)'
      })), { formata: (v) => fmtMoneyCurto(v) })
  ].join('');

  const tomResultado = k.resultado === null ? '' : k.resultado < 0 ? 'critico' : 'ok';
  return `
  <div class="grade" style="gap:16px">
    <div class="hero">
      ${kpi('Resultado projetado', k.resultado === null ? '—' : fmtMoney(k.resultado, { dec: 0 }),
        k.margem === null ? 'informe o valor de venda das obras' : `margem média ${fmtPct(k.margem)} na carteira`,
        { tom: tomResultado, destaque: true })}
      ${kpi('Saldo em caixa', fmtMoney(k.saldoCaixa, { dec: 0 }),
        `recebido ${fmtMoneyCurto(k.recebido)} · pago ${fmtMoneyCurto(k.pago)}`,
        { tom: k.saldoCaixa < 0 ? 'critico' : 'ok', destaque: true })}
      ${kpi('Avanço físico médio', fmtPct(k.progressoMedio, 0),
        `${k.ativas} obra${k.ativas === 1 ? '' : 's'} em andamento`,
        { destaque: true, visual: anel(k.progressoMedio, 'marca', ' ') })}
    </div>
    <div class="grade g-kpi">
      ${kpi('Obras ativas', k.ativas, `${e.obras.length} no total · ${k.concluidas} concluída${k.concluidas === 1 ? '' : 's'}`)}
      ${kpi('Recebido', fmtMoney(k.recebido, { dec: 0 }), 'financiamento, cliente e recursos próprios')}
      ${kpi('Custo previsto/m²', k.area ? fmtMoney(k.custoPrevistoM2, { dec: 0 }) : '—', 'contratos + materiais a comprar')}
      ${kpi('Alertas críticos', k.criticos, `${k.atencao} em atenção`, k.criticos ? 'critico' : 'ok')}
    </div>

    ${criticos.length ? cartao('Ação necessária hoje',
      criticos.map((a) => alertaHTML(a, true)).join(''),
      { semPadding: true, acoes: botao('Ver todos os alertas', 'ir-alertas-carteira', {}, 'btn pequeno') }) : ''}

    ${cartao(`Obras (${e.obras.length})`, `<div class="grade g-cartoes">${cartoesObra}</div>`, {
      acoes: `${botao('Importar planilha', 'importar-xlsx', {}, 'btn pequeno', 'baixar')} ${botao('Nova obra', 'nova-obra', {}, 'btn primario pequeno', 'mais')}`
    })}

    ${temFluxo || cartoesGraf ? `<div class="grade g-graf">
      ${temFluxo ? `<div class="largo">${cartao('Fluxo de caixa consolidado', graficoFluxoCarteira(e, 240))}</div>` : ''}
      ${cartoesGraf}
    </div>` : ''}
  </div>`;
};

function alertaHTML(a, mostrarObra = false) {
  return `<div class="alerta s${a.sev}">
    <span class="sev"></span>
    <div class="txt">
      <b>${esc(a.titulo)}</b>
      ${mostrarObra ? `<span class="chip" style="margin-left:6px">${esc(a.obraNome)}</span>` : ''}
      <p>${esc(a.detalhe)}</p>
      <span class="acao">→ ${esc(a.acao)}</span>
    </div>
    ${a.ref && a.ref.view ? `<button class="btn sutil pequeno" data-acao="ir" data-view="${a.ref.view}" data-obra="${a.obraId}">abrir</button>` : ''}
  </div>`;
}

/* ============================================================= PAINEL */
VIEWS.painel = () => {
  const o = App.obra();
  const k = kpisObra(o);
  const al = alertasObra(o);
  const matSaldo = o.materiais.filter((m) => m.status !== 'Cancelado').map((m) => materialCalc(o, m));
  const vencidos = matSaldo.filter((c) => c.vencido);
  const medPend = o.medicoes.filter((m) => m.status !== 'Cancelado' && medicaoLiquido(m) - num(m.valorPago) > 0.005);
  const recPend = o.recebimentos.filter((r) => r.status !== 'Recebido' && r.status !== 'Cancelado');
  const basesNeg = basesContratuais(o).filter((b) => b.saldo < -0.005);
  const criticos = al.filter((a) => a.sev === 3);
  const atencao = al.filter((a) => a.sev === 2);

  const custoPorEtapa = {};
  o.lancamentos.forEach((l) => {
    const et = l.etapa || 'Não classificado';
    custoPorEtapa[et] = (custoPorEtapa[et] || 0) + lancamentoTotal(l);
  });
  o.medicoes.filter((m) => m.status !== 'Cancelado').forEach((m) => {
    const ct = o.contratos.find((c) => c.codigoBase === m.contratoBase);
    const et = (ct && ct.escopo) || 'Empreitada';
    custoPorEtapa[et] = (custoPorEtapa[et] || 0) + num(m.valorPago);
  });

  /* indicadores primordiais: caixa, resultado e avanço */
  const prazoTxt = k.diasParaFim === null ? 'sem previsão'
    : k.diasParaFim < 0 ? `${-k.diasParaFim} dias em atraso` : `${k.diasParaFim} dias restantes`;
  const acumFluxo = fluxoCaixa(o).map((m) => m.acumulado);
  const tomCaixa = k.saldoCaixa < 0 ? 'critico' : 'ok';
  const tomMargem = k.margem === null ? '' : k.margem < num(o.fin.margemDesejada) ? 'aviso' : 'ok';
  const tomFisico = k.desvioFisicoFinanceiro < -0.1 ? 'aviso' : 'marca';

  const contexto = `<div class="contexto-obra">
    ${chip(o.status || 'Planejada', tomStatus(o.status))}
    ${chip(prazoTxt, k.diasParaFim !== null && k.diasParaFim < 0 ? 'critico' : '')}
    ${criticos.length ? chip(`${criticos.length} alerta${criticos.length > 1 ? 's' : ''} crítico${criticos.length > 1 ? 's' : ''}`, 'critico')
      : atencao.length ? chip(`${atencao.length} em atenção`, 'aviso') : chip('sem pendências', 'ok')}
  </div>`;

  const hero = `<div class="hero">
    ${kpi('Saldo em caixa', fmtMoney(k.saldoCaixa, { dec: 0 }),
      `recebido ${fmtMoneyCurto(k.recebido)} · pago ${fmtMoneyCurto(k.totalPago)}`,
      { tom: tomCaixa, destaque: true, visual: sparkline(acumFluxo, tomCaixa === 'critico' ? 'critico' : 'marca') })}
    ${kpi('Resultado projetado', k.resultado === null ? '—' : fmtMoney(k.resultado, { dec: 0 }),
      k.margem === null ? 'informe o valor de venda' : `margem ${fmtPct(k.margem)} · alvo ${fmtPct(o.fin.margemDesejada)}`,
      { tom: tomMargem, destaque: true })}
    ${kpi('Avanço físico', fmtPct(k.progressoFisico, 0),
      `financeiro ${fmtPct(k.progressoFinanceiro, 0)}${k.desvioFisicoFinanceiro < -0.1 ? ' — desembolso à frente' : ''}`,
      { tom: tomFisico === 'aviso' ? 'aviso' : '', destaque: true,
        visual: anel(k.progressoFisico, tomFisico === 'aviso' ? 'aviso' : 'marca', ' ') })}
  </div>`;

  /* resumo antes do detalhe: o que exige ação primeiro */
  const linhasAcao = [
    ['Materiais vencidos sem compra', vencidos.length, vencidos.reduce((s, c) => s + c.saldoValor, 0), 'materiais', vencidos.length > 0],
    ['Contratos com saldo negativo', basesNeg.length, basesNeg.reduce((s, b) => s + b.saldo, 0), 'contratos', basesNeg.length > 0],
    ['Medições ainda não pagas', medPend.length, k.medicoesNaoPagas, 'medicoes', false],
    ['Recebimentos previstos pendentes', recPend.length, k.previstoNaoRecebido, 'recebimentos', false],
    ['Materiais com saldo a comprar', matSaldo.filter((c) => c.saldo > 0).length,
      matSaldo.reduce((s, c) => s + c.saldoValor, 0), 'materiais', false],
  ];
  const acaoTabela = `<table class="tab">
    <thead><tr><th>Indicador</th><th class="num">Qtde</th><th class="num">Valor</th><th></th></tr></thead>
    <tbody>${linhasAcao.map(([rot, qt, val, view, alerta]) => `<tr>
      <td>${rot}</td>
      <td class="num ${alerta ? 'neg' : ''}">${qt}</td>
      <td class="num">${fmtMoney(val, { dec: 0 })}</td>
      <td class="acoes" style="opacity:1">${botao('abrir', 'ir', { view }, 'btn sutil pequeno')}</td>
    </tr>`).join('')}</tbody>
  </table>`;

  const blocoAcao = (criticos.length || atencao.length)
    ? cartao(`Precisa de atenção`, `
        ${(criticos.length ? criticos : atencao).slice(0, 4).map((a) => alertaHTML(a)).join('')}
        ${acaoTabela}`, {
      semPadding: true,
      acoes: botao(`Ver ${al.length} alertas`, 'ir', { view: 'alertas' }, 'btn pequeno'),
    })
    : cartao('Situação', `<div class="corpo" style="padding:16px"><p style="margin:0;color:var(--ok)">
        ✓ Sem pendências. A obra está em dia com o que foi lançado.</p></div>${acaoTabela}`, { semPadding: true });

  return `
  <div class="grade" style="gap:16px">
    ${contexto}
    ${hero}
    ${blocoAcao}

    <div class="grade g4">
      ${kpi('Recebido', fmtMoney(k.recebido, { dec: 0 }), `a receber: ${fmtMoneyCurto(k.previstoNaoRecebido)}`)}
      ${kpi('Total pago', fmtMoney(k.totalPago, { dec: 0 }), `${fmtMoneyCurto(k.pagoMedicoes)} medições · ${fmtMoneyCurto(k.pagoLancamentos)} compras`)}
      ${kpi('Saldo contratual', fmtMoney(k.saldoContratual, { dec: 0 }), `de ${fmtMoneyCurto(k.contratado)} contratados`, k.saldoContratual < 0 ? 'critico' : '')}
      ${kpi('Custo previsto/m²', k.area ? fmtMoney(k.custoPrevistoM2, { dec: 0 }) : '—',
        num(o.fin.custoFisicoMaxM2) > 0 ? `teto ${fmtMoney(o.fin.custoFisicoMaxM2, { dec: 0 })}/m²` : 'defina o teto na configuração',
        num(o.fin.custoFisicoMaxM2) > 0 && k.custoPrevistoM2 > num(o.fin.custoFisicoMaxM2) ? 'critico' : '')}
    </div>

    <div class="grade g-2-1" style="align-items:start">
      ${cartao('Curva S — avanço físico x financeiro', graficoCurvaS(o, 280),
        { acoes: botao('Ver detalhes', 'ir', { view: 'curva' }, 'btn pequeno') })}
      ${cartao('Andamento da obra', `
        <div style="display:flex;flex-direction:column;gap:12px">
          <div>
            <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
              <span class="rotulo" style="font-size:10.5px">Etapas concluídas</span>
              <b class="mono">${k.etapasConcluidas}/${k.etapasTotal}</b>
            </div>
            ${barra(k.etapasTotal ? k.etapasConcluidas / k.etapasTotal : 0, 'ok')}
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:13px">
            <div><span class="rotulo" style="font-size:10.5px">Etapas atrasadas</span><br>
              <b style="font-size:19px" class="${k.etapasAtrasadas ? 'neg' : ''}">${k.etapasAtrasadas}</b></div>
            <div><span class="rotulo" style="font-size:10.5px">Dias de obra</span><br>
              <b style="font-size:19px">${k.diasObra || '—'}</b></div>
            <div><span class="rotulo" style="font-size:10.5px">Previsão de entrega</span><br>
              <b>${fmtData(o.previsaoConclusao)}</b></div>
            <div><span class="rotulo" style="font-size:10.5px">Prazo restante</span><br>
              <b class="${k.diasParaFim !== null && k.diasParaFim < 0 ? 'neg' : ''}">${k.diasParaFim === null ? '—' : k.diasParaFim + ' dias'}</b></div>
          </div>
          <div style="border-top:1px solid var(--linha);padding-top:10px">
            <span class="rotulo" style="font-size:10.5px">Financiamento da obra</span>
            <div style="display:flex;justify-content:space-between;font-size:12.5px;margin:4px 0">
              <span>${fmtMoney(k.recebido, { dec: 0 })} de ${fmtMoney(k.financiado, { dec: 0 })}</span>
              <b class="mono">${k.financiado ? fmtPct(k.recebido / k.financiado, 0) : '—'}</b>
            </div>
            ${barra(k.financiado ? k.recebido / k.financiado : 0)}
          </div>
        </div>`)}
    </div>

    <div class="grade g-2-1">
      ${cartao('Fluxo de caixa mensal', graficoFluxo(o, 260),
        { acoes: botao('Ver tabela completa', 'ir', { view: 'fluxo' }, 'btn pequeno') })}
      ${cartao('Onde o dinheiro foi', graficoBarras(
        Object.entries(custoPorEtapa).map(([rotulo, valor]) => ({ rotulo, valor })),
        { limite: 8 }))}
    </div>
  </div>`;
};

/* ========================================================== CONTRATOS */
VIEWS.contratos = () => {
  const o = App.obra();

  if (!o.contratos.length) {
    return cartao('Contratos e aditivos', vazio(
      'Nenhum contrato cadastrado',
      'Cadastre a empreitada principal (normalmente R$/m² sobre a área construída) e depois os aditivos de muro, calçada e fossa, sempre com o mesmo código-base.',
      botao('Cadastrar contrato principal', 'novo-contrato', {}, 'btn primario', 'mais')));
  }

  const todas = basesContratuais(o);
  const totalAut = todas.reduce((s, b) => s + b.autorizado, 0);
  const totalPago = todas.reduce((s, b) => s + b.pago, 0);
  const totalAdit = todas.reduce((s, b) => s + b.valorAditivos, 0);
  const saldoGeral = totalAut - totalPago;

  /* ---------------------------------------------------------- filtros */
  const f = App.filtros;
  const busca = norm(f.busca || '');
  const prestadores = [...new Set(o.contratos.map((c) => c.prestador).filter(Boolean))].sort();
  const bases = todas.filter((b) => {
    if (f.prestador && b.prestador !== f.prestador) return false;
    if (f.status && !b.registros.some((c) => c.status === f.status)) return false;
    if (f.regime && !b.registros.some((c) => c.regime === f.regime)) return false;
    if (f.situacao === 'saldo-baixo' && !(b.saldo < 0 || b.execFinanceira > 0.9)) return false;
    if (f.situacao === 'ultrapassado' && b.saldo >= 0) return false;
    if (busca) {
      const alvo = norm(`${b.base} ${b.prestador} ${b.registros.map((c) => c.codigo + ' ' + c.escopo).join(' ')}`);
      if (!alvo.includes(busca)) return false;
    }
    return true;
  });
  const filtrando = bases.length !== todas.length;
  const soUm = bases.length === 1;

  const blocos = bases.map((b) => {
    const aberto = soUm || contratosAbertos.has(b.base);
    const tom = b.saldo < 0 ? 'critico' : b.execFinanceira > 0.9 ? 'aviso' : '';
    const prazo = prazoRegistro(b.principal);

    const registros = b.registros.map((c) => {
      const det = [
        esc(c.regime),
        num(c.quantidade) ? `${fmtNum(c.quantidade, 2)} ${esc(c.unidade)} × ${fmtMoney(c.precoUnitario)}` : null
      ].filter(Boolean).join(' · ');
      const pr = prazoRegistro(c);
      return `<tr>
        <td class="mono">${esc(c.codigo)}</td>
        <td>${chip(c.registro, c.registro === 'Contrato' ? 'marca' : '')}</td>
        <td><div class="ct-escopo-w"><span class="ct-escopo">${esc(c.escopo || '—')}</span>${det ? `<span class="ct-detalhe">${det}</span>` : ''}</div></td>
        <td class="mono ${pr.atrasado ? 'neg' : ''}" style="white-space:nowrap">${pr.texto || '—'}</td>
        <td class="num mono"><b>${fmtMoney(contratoValor(c))}</b></td>
        <td>${chip(c.status, tomStatus(c.status))}</td>
        <td class="acoes">${acoesLinha('contrato', c.id)}</td>
      </tr>`;
    }).join('');

    const stats = [
      `Autorizado <b>${fmtMoney(b.autorizado, { dec: 0 })}</b>`,
      `Pago <b>${fmtMoney(b.pago, { dec: 0 })}</b>`,
      `Saldo <b class="${b.saldo < 0 ? 'neg' : ''}">${fmtMoney(b.saldo, { dec: 0 })}</b>`,
      b.valorAditivos ? `Aditivos <b>${fmtMoney(b.valorAditivos, { dec: 0 })}</b>` : null,
    ].filter(Boolean).map((s) => `<span>${s}</span>`).join('');

    return `<section class="cartao ct-bloco ${aberto ? 'aberto' : ''}">
      <div class="ct-cab" ${soUm ? '' : `data-acao="ct-toggle" data-base="${esc(b.base)}" role="button" tabindex="0" aria-expanded="${aberto}"`}>
        <span class="ct-chev" aria-hidden="true">${soUm ? '' : svg(ICO.seta, 13)}</span>
        <h3>${esc(b.base)} · ${esc(b.prestador || 'prestador não informado')}</h3>
        ${chip(b.status, tomStatus(b.status))}
        ${b.saldo < 0 ? chip('saldo negativo', 'critico') : ''}
        ${prazo.texto ? `<span class="ct-cab-prazo ${prazo.atrasado ? 'atrasado' : ''}">${prazo.texto}</span>` : ''}
        <span class="ct-cab-num">${fmtPct(b.execFinanceira, 0)} · saldo <b class="${b.saldo < 0 ? 'neg' : ''}">${fmtMoneyCurto(b.saldo)}</b></span>
        <span class="ct-cab-acoes">
          ${botao('Aditivo', 'novo-aditivo', { base: b.base }, 'btn pequeno', 'mais')}
          ${botao('Medição', 'nova-medicao', { base: b.base }, 'btn pequeno')}
        </span>
      </div>
      ${aberto ? `<div class="corpo" style="display:flex;flex-direction:column;gap:10px">
        <div class="ct-stats">${stats}<span class="ct-exec">${fmtPct(b.execFinanceira, 0)} executado</span></div>
        ${barra(b.execFinanceira, tom)}
        <div class="tab-rolagem"><table class="tab ct-tab">
          <thead><tr><th>Código</th><th>Registro</th><th>Escopo</th><th>Prazo</th><th class="num">Valor</th><th>Status</th><th></th></tr></thead>
          <tbody>${registros}</tbody>
        </table></div>
      </div>` : ''}
    </section>`;
  }).join('');

  return `<div class="grade" style="gap:16px">
    <div class="hero">
      ${kpi('Total autorizado', fmtMoney(totalAut, { dec: 0 }),
        `${todas.length} contrato${todas.length === 1 ? '' : 's'}${totalAdit ? ` · ${fmtMoneyCurto(totalAdit)} em aditivos` : ''}`,
        { destaque: true })}
      ${kpi('Pago em medições', fmtMoney(totalPago, { dec: 0 }),
        `${fmtPct(totalAut ? totalPago / totalAut : 0, 0)} do autorizado`, { destaque: true })}
      ${kpi('Saldo a pagar', fmtMoney(saldoGeral, { dec: 0 }),
        saldoGeral < 0 ? 'pagamento acima do contratado' : 'a medir e pagar',
        { destaque: true, tom: saldoGeral < 0 ? 'critico' : '' })}
    </div>

    <div class="filtros nao-imprime">
      ${campoBusca('busca', 'Buscar código, escopo, prestador…')}
      ${selectFiltro('prestador', prestadores, 'Todos os prestadores')}
      ${selectFiltro('status', opcoesLista('statusContrato'), 'Todos os status')}
      ${selectFiltro('regime', opcoesLista('regimes'), 'Todos os regimes')}
      <select data-filtro="situacao" aria-label="Situação">
        <option value="">Situação: todas</option>
        <option value="saldo-baixo" ${f.situacao === 'saldo-baixo' ? 'selected' : ''}>Saldo baixo</option>
        <option value="ultrapassado" ${f.situacao === 'ultrapassado' ? 'selected' : ''}>Ultrapassado</option>
      </select>
      ${bases.length > 1 ? botao(
        bases.every((b) => contratosAbertos.has(b.base)) ? 'Recolher todos' : 'Expandir todos',
        'ct-todos',
        { abrir: bases.every((b) => contratosAbertos.has(b.base)) ? '0' : '1' },
        'btn sutil pequeno') : ''}
      <span style="margin-left:auto;display:flex;gap:8px">
        ${botao('Novo aditivo', 'novo-aditivo', {}, 'btn pequeno', 'mais')}
        ${botao('Novo contrato', 'novo-contrato', {}, 'btn primario pequeno', 'mais')}
      </span>
    </div>

    ${filtrando ? `<p class="ct-contagem nao-imprime">${bases.length} de ${todas.length} contratos</p>` : ''}
    ${blocos || vazio('Nada com esse filtro', 'Ajuste a busca ou os filtros acima.')}
  </div>`;
};

/* =========================================================== MEDIÇÕES */
VIEWS.medicoes = () => {
  const o = App.obra();
  const f = App.filtros;

  const prestadorDe = (base) => {
    const c = o.contratos.find((x) => x.codigoBase === base && x.registro === 'Contrato')
      || o.contratos.find((x) => x.codigoBase === base);
    return (c && c.prestador) || '';
  };
  const bases = [...new Set(o.contratos.map((c) => c.codigoBase).filter(Boolean))];
  const prestadores = [...new Set(o.contratos.map((c) => c.prestador).filter(Boolean))].sort();
  const meses = [...new Set(o.medicoes.map((m) => competencia(m.data)).filter(Boolean))].sort().reverse();

  const ativas = o.medicoes.filter((m) => m.status !== 'Cancelado');
  const totMed = ativas.reduce((s, m) => s + medicaoLiquido(m), 0);
  const totPago = ativas.reduce((s, m) => s + num(m.valorPago), 0);
  const emAberto = ativas.filter((m) => medicaoLiquido(m) - num(m.valorPago) > 0.005);

  /* ---------------------------------------------------------- filtros */
  const busca = norm(f.busca || '');
  let lista = o.medicoes.slice().sort((a, b) => String(b.data).localeCompare(String(a.data)));
  if (f.base) lista = lista.filter((m) => m.contratoBase === f.base);
  if (f.prestador) lista = lista.filter((m) => prestadorDe(m.contratoBase) === f.prestador);
  if (f.status) lista = lista.filter((m) => m.status === f.status);
  if (f.mes) lista = lista.filter((m) => competencia(m.data) === f.mes);
  if (f.situacao === 'aberto') lista = lista.filter((m) => m.status !== 'Cancelado' && medicaoLiquido(m) - num(m.valorPago) > 0.005);
  if (f.situacao === 'pagas') lista = lista.filter((m) => m.status !== 'Cancelado' && medicaoLiquido(m) - num(m.valorPago) <= 0.005);
  if (f.situacao === 'alerta') lista = lista.filter((m) => { const a = medicaoAlerta(o, m); return a && a !== 'OK'; });
  if (busca) lista = lista.filter((m) => norm(`${m.contratoBase} ${m.descricao} ${m.documento} ${m.numero} ${prestadorDe(m.contratoBase)}`).includes(busca));

  const filtrando = lista.length !== o.medicoes.length;
  const tLiquido = lista.reduce((s, m) => s + medicaoLiquido(m), 0);
  const tPago = lista.reduce((s, m) => s + num(m.valorPago), 0);

  const linhas = lista.map((m) => {
    const liq = medicaoLiquido(m);
    const pago = num(m.valorPago);
    const falta = liq - pago;
    const alerta = medicaoAlerta(o, m);
    const tomA = (alerta === 'PAGO ACIMA DA MEDIÇÃO' || alerta === 'CONTRATO ULTRAPASSADO') ? 'critico' : 'aviso';
    const pr = prestadorDe(m.contratoBase);
    const sub = [
      m.numero ? `nº ${esc(m.numero)}` : null,
      num(m.progresso) ? fmtPct(m.progresso, 0) : null,
      m.documento ? esc(m.documento) : null,
    ].filter(Boolean).join(' · ');
    const pgSub = falta > 0.005 ? 'em aberto' : (isISO(m.dataPagamento) ? `pago ${fmtDataCurta(m.dataPagamento)}` : 'quitada');
    return `<tr>
      <td><div class="ct-escopo-w"><span class="mono">${esc(m.contratoBase || '—')}</span>${pr ? `<span class="ct-detalhe">${esc(pr)}</span>` : ''}</div></td>
      <td><div class="ct-escopo-w"><span>${esc(m.descricao || '—')}</span>${sub ? `<span class="ct-detalhe">${sub}</span>` : ''}</div></td>
      <td class="mono" style="white-space:nowrap">${fmtDataCurta(m.data)}</td>
      <td class="num mono"><b>${fmtMoney(liq)}</b></td>
      <td class="num mono"><div class="ct-escopo-w"><span>${fmtMoney(pago)}</span><span class="ct-detalhe">${pgSub}</span></div></td>
      <td class="num mono ${falta > 0.005 ? 'neg' : ''}">${Math.abs(falta) < 0.005 ? '—' : fmtMoney(falta)}</td>
      <td>${chip(m.status, tomStatus(m.status))}${alerta && alerta !== 'OK' ? ' ' + chip(alerta, tomA) : ''}</td>
      <td class="acoes">${acoesLinha('medicao', m.id)}</td>
    </tr>`;
  }).join('');

  const porContrato = bases.map((base) => {
    const ms = ativas.filter((m) => m.contratoBase === base);
    return {
      rotulo: `${base} · ${prestadorDe(base) || '—'}`,
      valor: round2(ms.reduce((s, m) => s + medicaoLiquido(m) - num(m.valorPago), 0)),
    };
  }).filter((x) => x.valor > 0.005);

  return `<div class="grade" style="gap:16px">
    <div class="hero">
      ${kpi('Medido (líquido)', fmtMoney(totMed, { dec: 0 }),
        `${ativas.length} mediç${ativas.length === 1 ? 'ão' : 'ões'}`, { destaque: true })}
      ${kpi('Pago aos prestadores', fmtMoney(totPago, { dec: 0 }),
        `${fmtPct(totMed ? totPago / totMed : 0, 0)} do medido`, { destaque: true })}
      ${kpi('A pagar', fmtMoney(totMed - totPago, { dec: 0 }),
        `${emAberto.length} em aberto`, { destaque: true, tom: emAberto.length ? 'aviso' : 'ok' })}
    </div>

    ${cartao('Medições de prestadores', `
      <div class="tab-rolagem"><table class="tab">
        <thead><tr><th>Contrato</th><th>Descrição</th><th>Medida em</th>
          <th class="num">Líquido</th><th class="num">Pago</th><th class="num">A pagar</th><th>Status</th><th></th></tr></thead>
        <tbody>${linhas || `<tr><td colspan="8">${vazio(
          filtrando ? 'Nada com esse filtro' : 'Nenhuma medição',
          filtrando ? 'Ajuste a busca ou os filtros acima.' : 'Registre a medição do prestador aqui — nunca em Lançamentos, para não duplicar o pagamento.',
          filtrando ? '' : botao('Nova medição', 'nova-medicao', {}, 'btn primario', 'mais'))}</td></tr>`}</tbody>
        ${lista.length ? `<tfoot><tr><td colspan="3">${lista.length} medição(ões)${filtrando ? ` de ${o.medicoes.length}` : ''}</td>
          <td class="num mono">${fmtMoney(tLiquido)}</td>
          <td class="num mono">${fmtMoney(tPago)}</td>
          <td class="num mono ${tLiquido - tPago > 0.005 ? 'neg' : ''}">${fmtMoney(tLiquido - tPago)}</td><td colspan="2"></td></tr></tfoot>` : ''}
      </table></div>`, {
      semPadding: true,
      acoes: `<div class="filtros">
        ${campoBusca('busca', 'Buscar descrição, contrato, nº…')}
        ${selectFiltro('base', bases, 'Todos os contratos')}
        ${prestadores.length > 1 ? selectFiltro('prestador', prestadores, 'Todos os prestadores') : ''}
        ${selectFiltro('status', opcoesLista('statusPagamento'), 'Todos os status')}
        <select data-filtro="situacao" aria-label="Situação">
          <option value="">Situação: todas</option>
          <option value="aberto" ${f.situacao === 'aberto' ? 'selected' : ''}>Em aberto</option>
          <option value="pagas" ${f.situacao === 'pagas' ? 'selected' : ''}>Quitadas</option>
          <option value="alerta" ${f.situacao === 'alerta' ? 'selected' : ''}>Com alerta</option>
        </select>
        ${meses.length > 1 ? `<select data-filtro="mes" aria-label="Mês da medição">
          <option value="">Todos os meses</option>
          ${meses.map((ym) => `<option value="${ym}" ${f.mes === ym ? 'selected' : ''}>${fmtCompetencia(ym)}</option>`).join('')}
        </select>` : ''}
        <span style="margin-left:auto">${botao('Nova medição', 'nova-medicao', {}, 'btn primario pequeno', 'mais')}</span>
      </div>`
    })}

    ${porContrato.length > 1
      ? cartao('A pagar por contrato', graficoBarras(porContrato, { formata: (v) => fmtMoneyCurto(v), cor: 'var(--aviso)' }))
      : ''}

    <div class="cartao"><div class="corpo" style="font-size:12.5px;color:var(--tinta2)">
      <b>Regra anti-duplicidade:</b> pagamento por medição entra somente nesta tela.
      Compras, taxas e serviços sem medição entram em Lançamentos. Entradas de financiamento ou do cliente, em Recebimentos.
    </div></div>
  </div>`;
};

/* ======================================================= RECEBIMENTOS */
VIEWS.recebimentos = () => {
  const o = App.obra();
  const f = App.filtros;
  const k = kpisObra(o);
  const hoje = hojeISO();

  const naoRecebido = (r) => r.status !== 'Recebido' && r.status !== 'Cancelado';
  const atrasada = (r) => naoRecebido(r) && isISO(r.dataPrevista) && r.dataPrevista < hoje;

  const meses = [...new Set(o.recebimentos.map((r) => competencia(r.dataPrevista)).filter(Boolean))].sort();
  const tDescontos = o.recebimentos.reduce((s, r) => s + num(r.descontos), 0);
  const difGeral = o.recebimentos.reduce((s, r) => s + recebimentoDiferenca(r), 0);
  const atrasadas = o.recebimentos.filter(atrasada);
  const totAtrasado = atrasadas.reduce((s, r) => s + num(r.valorPrevisto), 0);
  const pendentes = o.recebimentos.filter(naoRecebido);

  /* ---------------------------------------------------------- filtros */
  const busca = norm(f.busca || '');
  let lista = o.recebimentos.slice().sort((a, b) =>
    String(a.dataPrevista || a.dataRecebimento).localeCompare(String(b.dataPrevista || b.dataRecebimento)));
  if (f.origem) lista = lista.filter((r) => r.origem === f.origem);
  if (f.status) lista = lista.filter((r) => r.status === f.status);
  if (f.mes) lista = lista.filter((r) => competencia(r.dataPrevista) === f.mes);
  if (f.situacao === 'receber') lista = lista.filter(naoRecebido);
  if (f.situacao === 'recebidas') lista = lista.filter((r) => r.status === 'Recebido' || r.status === 'Recebido parcial');
  if (f.situacao === 'atrasadas') lista = lista.filter(atrasada);
  if (busca) lista = lista.filter((r) => norm(`${r.origem} ${r.etapaPci} ${r.numeroMedicao} ${r.observacoes}`).includes(busca));

  const filtrando = lista.length !== o.recebimentos.length;
  const tPrev = lista.reduce((s, r) => s + num(r.valorPrevisto), 0);
  const tRec = lista.reduce((s, r) => s + num(r.valorRecebido), 0);

  const linhas = lista.map((r) => {
    const dif = recebimentoDiferenca(r);
    const atr = atrasada(r);
    const dias = atr ? diasEntre(r.dataPrevista, hoje) : 0;
    const sub1 = [
      r.numeroMedicao ? `nº ${esc(r.numeroMedicao)}` : null,
      isISO(r.dataSolicitacao) ? `solic. ${fmtDataCurta(r.dataSolicitacao)}` : null,
    ].filter(Boolean).join(' · ');
    const dataSub = r.status === 'Recebido' && isISO(r.dataRecebimento) ? `recebido ${fmtDataCurta(r.dataRecebimento)}`
      : atr ? `${dias} dia${dias === 1 ? '' : 's'} de atraso` : 'aguardando';
    return `<tr>
      <td>${chip(r.origem, r.origem === 'CAIXA' ? 'marca' : '')}</td>
      <td><div class="ct-escopo-w"><span>${esc(r.etapaPci || '—')}</span>${sub1 ? `<span class="ct-detalhe">${sub1}</span>` : ''}</div></td>
      <td class="mono" style="white-space:nowrap"><div class="ct-escopo-w"><span class="${atr ? 'neg' : ''}">${fmtDataCurta(r.dataPrevista)}</span><span class="ct-detalhe ${atr ? 'neg' : ''}">${dataSub}</span></div></td>
      <td class="num mono">${fmtMoney(r.valorPrevisto)}</td>
      <td class="num mono"><b>${fmtMoney(r.valorRecebido)}</b></td>
      <td class="num mono ${dif < -0.005 ? 'neg' : dif > 0.005 ? 'pos' : ''}">${Math.abs(dif) < 0.005 ? '—' : fmtMoney(dif)}</td>
      <td>${chip(r.status, tomStatus(r.status))}</td>
      <td class="acoes">${acoesLinha('recebimento', r.id)}</td>
    </tr>`;
  }).join('');

  const porMes = meses.map((ym) => ({
    rotulo: fmtCompetencia(ym),
    valor: round2(o.recebimentos
      .filter((r) => naoRecebido(r) && competencia(r.dataPrevista) === ym)
      .reduce((s, r) => s + num(r.valorPrevisto), 0)),
  })).filter((x) => x.valor > 0.005);

  const contexto = [
    tDescontos > 0.005 ? `descontos e tarifas retidos <b>${fmtMoney(tDescontos, { dec: 0 })}</b>` : null,
    Math.abs(difGeral) > 0.005 ? `diferença acumulada previsto × recebido <b>${fmtMoney(difGeral, { dec: 0 })}</b>` : null,
  ].filter(Boolean).join(' · ');

  return `<div class="grade" style="gap:16px">
    <div class="hero">
      ${kpi('Recebido', fmtMoney(k.recebido, { dec: 0 }),
        k.financiado ? `${fmtPct(k.recebido / k.financiado, 0)} de ${fmtMoney(k.financiado, { dec: 0 })} financiados` : 'financiamento, cliente e próprios',
        { destaque: true })}
      ${kpi('A receber', fmtMoney(k.previstoNaoRecebido, { dec: 0 }),
        `${pendentes.length} parcela${pendentes.length === 1 ? '' : 's'} pendente${pendentes.length === 1 ? '' : 's'}`,
        { destaque: true, tom: atrasadas.length ? 'aviso' : '' })}
      ${kpi('Atrasadas', atrasadas.length,
        atrasadas.length ? `${fmtMoney(totAtrasado, { dec: 0 })} previstos sem crédito` : 'nenhuma parcela vencida',
        { destaque: true, tom: atrasadas.length ? 'critico' : 'ok' })}
    </div>
    ${contexto ? `<p class="ct-contagem">${contexto}</p>` : ''}

    ${cartao('Cronograma de recebimentos', `
      <div class="tab-rolagem"><table class="tab">
        <thead><tr><th>Origem</th><th>Etapa / medição</th><th>Previsto p/</th>
          <th class="num">Previsto</th><th class="num">Recebido</th><th class="num">Diferença</th><th>Status</th><th></th></tr></thead>
        <tbody>${linhas || `<tr><td colspan="8">${vazio(
          filtrando ? 'Nada com esse filtro' : 'Nenhum recebimento',
          filtrando ? 'Ajuste a busca ou os filtros acima.' : 'Cadastre as parcelas previstas de financiamento ou do cliente e atualize o que foi efetivamente creditado.',
          filtrando ? '' : botao('Nova parcela', 'novo-recebimento', {}, 'btn primario', 'mais'))}</td></tr>`}</tbody>
        ${lista.length ? `<tfoot><tr><td colspan="3">${lista.length} parcela(s)${filtrando ? ` de ${o.recebimentos.length}` : ''}</td>
          <td class="num mono">${fmtMoney(tPrev)}</td>
          <td class="num mono">${fmtMoney(tRec)}</td>
          <td class="num mono ${tRec - tPrev < 0 ? 'neg' : ''}">${fmtMoney(tRec - tPrev)}</td><td colspan="2"></td></tr></tfoot>` : ''}
      </table></div>`, {
      semPadding: true,
      acoes: `<div class="filtros">
        ${campoBusca('busca', 'Buscar etapa, nº, observação…')}
        ${selectFiltro('origem', opcoesLista('origensRecebimento'), 'Todas as origens')}
        ${selectFiltro('status', opcoesLista('statusRecebimento'), 'Todos os status')}
        <select data-filtro="situacao" aria-label="Situação">
          <option value="">Situação: todas</option>
          <option value="receber" ${f.situacao === 'receber' ? 'selected' : ''}>A receber</option>
          <option value="recebidas" ${f.situacao === 'recebidas' ? 'selected' : ''}>Recebidas</option>
          <option value="atrasadas" ${f.situacao === 'atrasadas' ? 'selected' : ''}>Atrasadas</option>
        </select>
        ${meses.length > 1 ? `<select data-filtro="mes" aria-label="Mês previsto">
          <option value="">Todos os meses</option>
          ${meses.map((ym) => `<option value="${ym}" ${f.mes === ym ? 'selected' : ''}>${fmtCompetencia(ym)}</option>`).join('')}
        </select>` : ''}
        <span style="margin-left:auto">${botao('Nova parcela', 'novo-recebimento', {}, 'btn primario pequeno', 'mais')}</span>
      </div>`
    })}

    ${porMes.length > 1
      ? cartao('A receber por mês previsto', graficoBarras(porMes, { formata: (v) => fmtMoneyCurto(v), cor: 'var(--s1)' }))
      : ''}
  </div>`;
};

/* ======================================================== LANÇAMENTOS */
VIEWS.lancamentos = () => {
  const o = App.obra();
  const f = App.filtros;

  const todos = o.lancamentos;
  const totGeral = todos.reduce((s, l) => s + lancamentoTotal(l), 0);
  const totMat = todos.filter((l) => l.tipo === 'Material').reduce((s, l) => s + lancamentoTotal(l), 0);
  const semEtapa = todos.filter((l) => !l.etapa);
  const fornecedores = [...new Set(todos.map((l) => l.fornecedor).filter(Boolean))].sort();
  const meses = [...new Set(todos.map((l) => competencia(l.data)).filter(Boolean))].sort().reverse();

  /* ---------------------------------------------------------- filtros */
  const busca = norm(f.busca || '');
  let lista = todos.slice().sort((a, b) => String(b.data).localeCompare(String(a.data)));
  if (f.tipo) lista = lista.filter((l) => l.tipo === f.tipo);
  if (f.etapa) lista = lista.filter((l) => l.etapa === f.etapa);
  if (f.fornecedor) lista = lista.filter((l) => l.fornecedor === f.fornecedor);
  if (f.mes) lista = lista.filter((l) => competencia(l.data) === f.mes);
  if (f.situacao === 'plano') lista = lista.filter((l) => l.materialId);
  if (f.situacao === 'avulso') lista = lista.filter((l) => !l.materialId);
  if (f.situacao === 'sem-etapa') lista = lista.filter((l) => !l.etapa);
  if (busca) lista = filtraTexto(lista, f.busca, ['descricao', 'fornecedor', 'documento', 'categoria']);

  const filtrando = lista.length !== todos.length;
  const total = lista.reduce((s, l) => s + lancamentoTotal(l), 0);

  const porTipo = {};
  lista.forEach((l) => { porTipo[l.tipo || '—'] = (porTipo[l.tipo || '—'] || 0) + lancamentoTotal(l); });

  const linhas = lista.map((l) => {
    const sub = [
      l.fornecedor ? esc(l.fornecedor) : null,
      l.etapa ? esc(l.etapa) : null,
      num(l.quantidade) && num(l.quantidade) !== 1 ? `${fmtNum(l.quantidade, 2)} ${esc(l.unidade)} × ${fmtMoney(l.precoUnitario)}` : null,
      l.documento ? esc(l.documento) : null,
    ].filter(Boolean).join(' · ');
    return `<tr>
      <td class="mono" style="white-space:nowrap">${fmtDataCurta(l.data)}</td>
      <td>${chip(l.tipo, l.tipo === 'Material' ? 'marca' : '')}</td>
      <td><div class="ct-escopo-w"><span>${esc(l.descricao || '—')}${l.materialId ? ' <span class="chip" style="font-size:10px">plano</span>' : ''}</span>${sub ? `<span class="ct-detalhe">${sub}</span>` : ''}</div></td>
      <td class="num mono"><b>${fmtMoney(lancamentoTotal(l))}</b></td>
      <td class="acoes">${acoesLinha('lancamento', l.id)}</td>
    </tr>`;
  }).join('');

  return `<div class="grade" style="gap:16px">
    <div class="hero">
      ${kpi('Total lançado', fmtMoney(totGeral, { dec: 0 }),
        `${todos.length} lançamento${todos.length === 1 ? '' : 's'}`, { destaque: true })}
      ${kpi('Compras de material', fmtMoney(totMat, { dec: 0 }),
        totGeral ? `${fmtPct(totMat / totGeral, 0)} do total` : 'taxas, honorários e serviços à parte', { destaque: true })}
      ${kpi('Sem etapa classificada', semEtapa.length,
        semEtapa.length ? `${fmtMoney(semEtapa.reduce((s, l) => s + lancamentoTotal(l), 0), { dec: 0 })} sem rateio` : 'tudo classificado',
        { destaque: true, tom: semEtapa.length ? 'aviso' : 'ok' })}
    </div>

    ${cartao('Saídas lançadas', `
      <div class="tab-rolagem"><table class="tab">
        <thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th class="num">Total</th><th></th></tr></thead>
        <tbody>${linhas || `<tr><td colspan="5">${vazio(
          filtrando ? 'Nada com esse filtro' : 'Nenhum lançamento',
          filtrando ? 'Ajuste a busca ou os filtros acima.' : 'Registre aqui compras de material, taxas, honorários e serviços sem medição.',
          filtrando ? '' : botao('Novo lançamento', 'novo-lancamento', {}, 'btn primario', 'mais'))}</td></tr>`}</tbody>
        ${lista.length ? `<tfoot><tr><td colspan="3">${lista.length} lançamento(s)${filtrando ? ` de ${todos.length}` : ''}</td>
          <td class="num mono">${fmtMoney(total)}</td><td></td></tr></tfoot>` : ''}
      </table></div>`, {
      semPadding: true,
      acoes: `<div class="filtros">
        ${campoBusca('busca', 'Buscar descrição, fornecedor, doc…')}
        ${selectFiltro('tipo', opcoesLista('tiposSaida'), 'Todos os tipos')}
        ${selectFiltro('etapa', opcoesEtapas(), 'Todas as etapas')}
        ${fornecedores.length > 1 ? selectFiltro('fornecedor', fornecedores, 'Todos os fornecedores') : ''}
        <select data-filtro="situacao" aria-label="Situação">
          <option value="">Situação: todas</option>
          <option value="plano" ${f.situacao === 'plano' ? 'selected' : ''}>Do plano de materiais</option>
          <option value="avulso" ${f.situacao === 'avulso' ? 'selected' : ''}>Avulsos</option>
          <option value="sem-etapa" ${f.situacao === 'sem-etapa' ? 'selected' : ''}>Sem etapa</option>
        </select>
        ${meses.length > 1 ? `<select data-filtro="mes" aria-label="Mês">
          <option value="">Todos os meses</option>
          ${meses.map((ym) => `<option value="${ym}" ${f.mes === ym ? 'selected' : ''}>${fmtCompetencia(ym)}</option>`).join('')}
        </select>` : ''}
        <span style="margin-left:auto">${botao('Novo lançamento', 'novo-lancamento', {}, 'btn primario pequeno', 'mais')}</span>
      </div>`
    })}

    ${lista.length ? `<div class="grade g2">
      ${cartao('Por tipo de saída', graficoBarras(
        Object.entries(porTipo).map(([rotulo, valor]) => ({ rotulo, valor })), { formata: (v) => fmtMoneyCurto(v) }))}
      ${cartao('Por etapa', graficoBarras(
        Object.entries(lista.reduce((a, l) => {
          const e = l.etapa || 'Sem etapa';
          a[e] = (a[e] || 0) + lancamentoTotal(l); return a;
        }, {})).map(([rotulo, valor]) => ({ rotulo, valor })), { limite: 10, formata: (v) => fmtMoneyCurto(v) }))}
    </div>` : ''}
  </div>`;
};

/* ========================================================== MATERIAIS */
VIEWS.materiais = () => {
  const o = App.obra();
  const f = App.filtros;
  const hoje = hojeISO();

  const todos = o.materiais.map((m) => ({ m, c: materialCalc(o, m) }));
  const orcTotal = todos.reduce((s, x) => s + x.c.orcamento, 0);
  const compradoTotal = todos.reduce((s, x) => s + x.c.valorComprado, 0);
  const saldoTotal = todos.reduce((s, x) => s + x.c.saldoValor, 0);
  const comSaldo = todos.filter((x) => x.c.saldo > 0);
  const vencidos = todos.filter((x) => x.c.vencido);

  /* ---------------------------------------------------------- filtros */
  const busca = norm(f.busca || '');
  let lista = o.materiais.slice();
  if (f.etapa) lista = lista.filter((m) => m.etapa === f.etapa);
  if (f.prioridade) lista = lista.filter((m) => m.prioridade === f.prioridade);
  if (f.status) lista = lista.filter((m) => m.status === f.status);
  if (f.situacao === 'comprar') lista = lista.filter((m) => materialCalc(o, m).saldo > 0 && m.status !== 'Cancelado');
  if (f.situacao === 'vencidos') lista = lista.filter((m) => materialCalc(o, m).vencido);
  if (f.situacao === 'comprados') lista = lista.filter((m) => materialCalc(o, m).saldo <= 0 && m.status !== 'Cancelado');
  if (busca) lista = filtraTexto(lista, f.busca, ['material', 'etapa', 'observacoes']);
  lista.sort((a, b) => {
    const ca = materialCalc(o, a), cb = materialCalc(o, b);
    if (ca.vencido !== cb.vencido) return ca.vencido ? -1 : 1;
    return String(a.dataNecessaria || '9999').localeCompare(String(b.dataNecessaria || '9999'));
  });
  const filtrando = lista.length !== o.materiais.length;

  const linhas = lista.map((m) => {
    const c = materialCalc(o, m);
    const tom = c.vencido ? 'critico' : c.saldo > 0 ? 'aviso' : 'ok';
    const sub = [esc(m.etapa || 'sem etapa'), m.prioridade && m.prioridade !== 'Média' ? esc(m.prioridade) : null]
      .filter(Boolean).join(' · ');
    const prazo = !isISO(m.dataNecessaria) ? { t: 'sem data', neg: false }
      : c.vencido ? { t: `vencido há ${diasEntre(m.dataNecessaria, hoje)}d`, neg: true }
        : (() => { const d = diasEntre(hoje, m.dataNecessaria); return { t: d <= 0 ? 'hoje' : `em ${d}d`, neg: d <= 3 }; })();
    return `<tr>
      <td><div class="ct-escopo-w"><span><b>${esc(m.material || '—')}</b></span>${sub ? `<span class="ct-detalhe">${sub}</span>` : ''}</div></td>
      <td class="num mono"><div class="ct-escopo-w"><span>${fmtNum(m.quantidadeNecessaria, 2)} ${esc(m.unidade)}</span><span class="ct-detalhe">comprado ${fmtNum(c.comprada, 2)}</span></div></td>
      <td class="num mono ${c.saldo > 0 ? 'neg' : ''}"><b>${fmtNum(c.saldo, 2)}</b></td>
      <td class="num mono">${c.saldoValor > 0.005 ? fmtMoney(c.saldoValor) : '—'}</td>
      <td class="mono" style="white-space:nowrap"><div class="ct-escopo-w"><span class="${prazo.neg ? 'neg' : ''}">${fmtDataCurta(m.dataNecessaria)}</span><span class="ct-detalhe ${prazo.neg ? 'neg' : ''}">${prazo.t}</span></div></td>
      <td>${chip(c.vencido ? 'Vencido' : m.status, tom)}</td>
      <td class="acoes">
        ${!Store.somenteLeitura() && c.saldo > 0 ? `<button class="btn pequeno" data-acao="comprar-material" data-id="${m.id}">comprar</button>` : ''}
        ${acoesLinha('material', m.id)}
      </td>
    </tr>`;
  }).join('');

  const faltaPorEtapa = Object.entries(comSaldo.reduce((a, x) => {
    const e = x.m.etapa || 'Sem etapa';
    a[e] = (a[e] || 0) + x.c.saldoValor; return a;
  }, {})).map(([rotulo, valor]) => ({ rotulo, valor: round2(valor) }));

  return `<div class="grade" style="gap:16px">
    <div class="hero">
      ${kpi('Falta comprar', fmtMoney(saldoTotal, { dec: 0 }),
        `${comSaldo.length} item${comSaldo.length === 1 ? '' : 's'} com saldo`,
        { destaque: true, tom: saldoTotal > 0.005 ? 'aviso' : 'ok' })}
      ${kpi('Vencidos sem compra', vencidos.length,
        vencidos.length ? `${fmtMoney(vencidos.reduce((s, x) => s + x.c.saldoValor, 0), { dec: 0 })} — comprar já` : 'nada em atraso',
        { destaque: true, tom: vencidos.length ? 'critico' : 'ok' })}
      ${kpi('Já comprado', fmtMoney(compradoTotal, { dec: 0 }),
        orcTotal ? `${fmtPct(compradoTotal / orcTotal, 0)} de ${fmtMoney(orcTotal, { dec: 0 })} orçados` : `${o.materiais.length} item(ns) no plano`,
        { destaque: true })}
    </div>

    ${cartao('Plano de materiais', `
      <div class="tab-rolagem"><table class="tab">
        <thead><tr><th>Material</th><th class="num">Necessário</th><th class="num">Falta</th>
          <th class="num">Falta (R$)</th><th>Comprar até</th><th>Status</th><th></th></tr></thead>
        <tbody>${linhas || `<tr><td colspan="7">${vazio(
          filtrando ? 'Nada com esse filtro' : 'Plano vazio',
          filtrando ? 'Ajuste a busca ou os filtros acima.' : 'Liste o que será necessário por etapa. Ao lançar a compra, o saldo é atualizado sozinho.',
          filtrando ? '' : botao('Novo material', 'novo-material', {}, 'btn primario', 'mais'))}</td></tr>`}</tbody>
        ${lista.length ? `<tfoot><tr><td colspan="3">${lista.length} item(ns)${filtrando ? ` de ${o.materiais.length}` : ''}</td>
          <td class="num mono">${fmtMoney(lista.reduce((s, m) => s + materialCalc(o, m).saldoValor, 0))}</td><td colspan="3"></td></tr></tfoot>` : ''}
      </table></div>`, {
      semPadding: true,
      acoes: `<div class="filtros">
        ${campoBusca('busca', 'Buscar material, etapa…')}
        ${selectFiltro('etapa', opcoesEtapas(), 'Todas as etapas')}
        ${selectFiltro('prioridade', opcoesLista('prioridades'), 'Toda prioridade')}
        ${selectFiltro('status', opcoesLista('statusMaterial'), 'Todos os status')}
        <select data-filtro="situacao" aria-label="Situação">
          <option value="">Situação: todas</option>
          <option value="comprar" ${f.situacao === 'comprar' ? 'selected' : ''}>A comprar</option>
          <option value="vencidos" ${f.situacao === 'vencidos' ? 'selected' : ''}>Vencidos</option>
          <option value="comprados" ${f.situacao === 'comprados' ? 'selected' : ''}>Comprados</option>
        </select>
        <span style="margin-left:auto">${botao('Novo material', 'novo-material', {}, 'btn primario pequeno', 'mais')}</span>
      </div>`
    })}

    ${faltaPorEtapa.length > 1
      ? cartao('Falta comprar por etapa', graficoBarras(faltaPorEtapa, { formata: (v) => fmtMoneyCurto(v), cor: 'var(--aviso)' }))
      : ''}
  </div>`;
};

/* ========================================================= CRONOGRAMA */
VIEWS.cronograma = () => {
  const o = App.obra();
  if (!o.cronograma.length) {
    return cartao('Cronograma da obra', vazio(
      'Cronograma não montado',
      'Gere as etapas padrão de uma casa e depois ajuste datas, responsáveis e progresso a cada visita.',
      `${botao('Gerar etapas padrão', 'gerar-cronograma', {}, 'btn primario')} ${botao('Adicionar etapa', 'nova-etapa', {}, 'btn')}`));
  }
  const f = App.filtros;
  const k = kpisObra(o);
  const pesos = pesosCronograma(o);
  const responsaveis = [...new Set(o.cronograma.map((e) => e.responsavel).filter(Boolean))].sort();

  /* ---------------------------------------------------------- filtros */
  const busca = norm(f.busca || '');
  let etapas = o.cronograma.slice();
  if (f.responsavel) etapas = etapas.filter((e) => e.responsavel === f.responsavel);
  if (f.situacao) {
    etapas = etapas.filter((e) => {
      const s = etapaCalc(e).situacao;
      if (f.situacao === 'atrasadas') return s === 'ATRASADO';
      if (f.situacao === 'andamento') return s === 'EM ANDAMENTO';
      if (f.situacao === 'nao-iniciadas') return s === 'NÃO INICIADO' || s === 'NÃO PLANEJADO';
      if (f.situacao === 'concluidas') return s === 'CONCLUÍDO';
      return true;
    });
  }
  if (busca) etapas = filtraTexto(etapas, f.busca, ['etapa', 'responsavel']);
  const filtrando = etapas.length !== o.cronograma.length;

  const linhas = etapas.map((e) => {
    const c = etapaCalc(e);
    const etSub = [e.responsavel ? esc(e.responsavel) : null, `peso ${fmtPct(pesos.get(e.id) || 0, 1)}`].filter(Boolean).join(' · ');
    const prevTxt = (isISO(e.inicioPrevisto) && isISO(e.fimPrevisto))
      ? `${fmtDataCurta(e.inicioPrevisto)} → ${fmtDataCurta(e.fimPrevisto)}` : 'sem datas';
    const realTxt = isISO(e.inicioReal)
      ? `${fmtDataCurta(e.inicioReal)} → ${isISO(e.fimReal) ? fmtDataCurta(e.fimReal) : 'em curso'}` : '—';
    const realSub = c.atraso > 0 ? `${c.atraso} dia${c.atraso === 1 ? '' : 's'} de atraso`
      : num(e.quantidadeExecutada) ? `${fmtNum(e.quantidadeExecutada, 1)} ${esc(e.unidadeProducao)}${c.produtividade ? ` · ${fmtNum(c.produtividade, 1)}/dia` : ''}`
        : '';
    return `<tr>
      <td><div class="ct-escopo-w"><span><b>${esc(e.etapa || '—')}</b></span>${etSub ? `<span class="ct-detalhe">${etSub}</span>` : ''}</div></td>
      <td class="mono" style="white-space:nowrap"><div class="ct-escopo-w"><span>${prevTxt}</span>${c.diasPrevistos ? `<span class="ct-detalhe">${c.diasPrevistos} dias</span>` : ''}</div></td>
      <td class="mono" style="white-space:nowrap"><div class="ct-escopo-w"><span class="${c.atraso > 0 ? 'neg' : ''}">${realTxt}</span>${realSub ? `<span class="ct-detalhe ${c.atraso > 0 ? 'neg' : ''}">${realSub}</span>` : ''}</div></td>
      <td style="min-width:130px">${barra(c.progresso, tomSituacao(c.situacao))}
        <span class="mono" style="font-size:11px">${fmtPct(c.progresso, 0)}</span></td>
      <td>${chip(c.situacao, tomSituacao(c.situacao))}</td>
      <td class="acoes">${acoesLinha('etapa', e.id)}</td>
    </tr>`;
  }).join('');

  return `<div class="grade" style="gap:16px">
    <div class="hero">
      ${kpi('Avanço físico', fmtPct(k.progressoFisico, 0),
        `${k.etapasConcluidas} de ${k.etapasTotal} etapas concluídas`, { destaque: true })}
      ${kpi('Etapas atrasadas', k.etapasAtrasadas,
        k.etapasAtrasadas ? 'fim previsto já passou' : 'tudo no prazo',
        { destaque: true, tom: k.etapasAtrasadas ? 'critico' : 'ok' })}
      ${kpi('Previsão de entrega', fmtData(o.previsaoConclusao),
        k.diasParaFim === null ? 'sem data definida'
          : (k.diasParaFim < 0 ? `${-k.diasParaFim} dias em atraso` : `${k.diasParaFim} dias restantes`),
        { destaque: true, tom: k.diasParaFim !== null && k.diasParaFim < 0 ? 'critico' : '' })}
    </div>

    ${cartao('Linha do tempo', graficoGantt(o))}

    ${cartao('Etapas', `<div class="tab-rolagem"><table class="tab">
      <thead><tr><th>Etapa</th><th>Previsto</th><th>Real</th><th>Progresso</th><th>Situação</th><th></th></tr></thead>
      <tbody>${linhas || `<tr><td colspan="6">${vazio(
        filtrando ? 'Nada com esse filtro' : 'Sem etapas',
        filtrando ? 'Ajuste a busca ou os filtros acima.' : 'Adicione as etapas da obra.',
        filtrando ? '' : botao('Adicionar etapa', 'nova-etapa', {}, 'btn primario', 'mais'))}</td></tr>`}</tbody>
      ${etapas.length && filtrando ? `<tfoot><tr><td colspan="6">${etapas.length} de ${o.cronograma.length} etapas</td></tr></tfoot>` : ''}
    </table></div>`, {
      semPadding: true,
      acoes: `<div class="filtros">
        ${campoBusca('busca', 'Buscar etapa, responsável…')}
        ${responsaveis.length > 1 ? selectFiltro('responsavel', responsaveis, 'Todos os responsáveis') : ''}
        <select data-filtro="situacao" aria-label="Situação">
          <option value="">Situação: todas</option>
          <option value="atrasadas" ${f.situacao === 'atrasadas' ? 'selected' : ''}>Atrasadas</option>
          <option value="andamento" ${f.situacao === 'andamento' ? 'selected' : ''}>Em andamento</option>
          <option value="nao-iniciadas" ${f.situacao === 'nao-iniciadas' ? 'selected' : ''}>Não iniciadas</option>
          <option value="concluidas" ${f.situacao === 'concluidas' ? 'selected' : ''}>Concluídas</option>
        </select>
        <span style="margin-left:auto">${botao('Adicionar etapa', 'nova-etapa', {}, 'btn primario pequeno', 'mais')}</span>
      </div>`
    })}
  </div>`;
};

/* ============================================================ CURVA S */
VIEWS.curva = () => {
  const o = App.obra();
  const f = App.filtros;
  const dados = curvaS(o);
  const k = kpisObra(o);
  const atual = dados.filter((d) => d.fisicoRealizado !== null).pop();
  const previstoHoje = atual ? atual.fisicoPrevisto : 0;
  const desvio = atual ? atual.fisicoRealizado - atual.fisicoPrevisto : 0;
  const desvioFinFis = k.progressoFinanceiro - k.progressoFisico;

  if (!dados.length) {
    return cartao('Curva S', vazio('Sem curva S ainda',
      'Cadastre o cronograma com datas previstas para gerar a curva.',
      botao('Ir para o cronograma', 'ir', { view: 'cronograma' }, 'btn primario')));
  }

  /* leitura rápida — interpreta o gráfico numa frase */
  const fraseFisica = Math.abs(desvio) < 0.01 ? 'A obra está <b>no ritmo do cronograma</b>.'
    : desvio < 0 ? `A obra está <b>${fmtPct(-desvio, 1)} atrás</b> do cronograma físico.`
      : `A obra está <b>${fmtPct(desvio, 1)} à frente</b> do cronograma físico.`;
  const fraseFin = Math.abs(desvioFinFis) < 0.04 ? 'O desembolso acompanha o avanço.'
    : desvioFinFis > 0 ? `O desembolso está <b>${fmtPct(desvioFinFis, 1)} à frente</b> do avanço físico — atenção ao caixa.`
      : `O desembolso está <b>${fmtPct(-desvioFinFis, 1)} atrás</b> do avanço físico.`;

  let linhasD = dados.slice();
  if (f.situacao === 'realizado') linhasD = linhasD.filter((d) => !d.futuro);
  if (f.situacao === 'projecao') linhasD = linhasD.filter((d) => d.futuro);

  const linhas = linhasD.map((d) => `<tr>
    <td class="mono">${fmtCompetencia(d.ym)}${d.futuro ? ' <span class="chip" style="font-size:10px">projeção</span>' : ''}</td>
    <td class="num mono">${fmtPct(d.fisicoPrevisto, 1)}</td>
    <td class="num mono">${d.fisicoRealizado === null ? '—' : fmtPct(d.fisicoRealizado, 1)}</td>
    <td class="num mono ${d.desvio !== null && d.desvio < -0.03 ? 'neg' : d.desvio !== null && d.desvio > 0.03 ? 'pos' : ''}">${d.desvio === null ? '—' : fmtPct(d.desvio, 1)}</td>
    <td class="num mono">${d.financeiroRealizado === null ? '—' : fmtPct(d.financeiroRealizado, 1)}</td>
    <td class="num mono">${d.financeiroRealizado === null ? '—' : fmtMoney(d.desembolsoAcumulado, { dec: 0 })}</td>
  </tr>`).join('');

  const tomDesvio = desvio < -0.05 ? 'critico' : desvio < -0.01 ? 'aviso' : 'ok';
  return `<div class="grade" style="gap:16px">
    <div class="hero">
      ${kpi('Avanço físico', fmtPct(k.progressoFisico, 1),
        `previsto ${fmtPct(previstoHoje, 1)} para hoje`, { destaque: true })}
      ${kpi('Desvio de prazo', (desvio >= 0 ? '+' : '') + fmtPct(desvio, 1),
        desvio < -0.01 ? 'obra atrás do planejado' : desvio > 0.01 ? 'obra adiantada' : 'no cronograma',
        { destaque: true, tom: tomDesvio })}
      ${kpi('Avanço financeiro', fmtPct(k.progressoFinanceiro, 1),
        `${fmtMoney(k.totalPago, { dec: 0 })} de ${fmtMoney(k.custoPrevisto, { dec: 0 })} previstos`,
        { destaque: true, tom: desvioFinFis > 0.1 ? 'aviso' : '' })}
    </div>

    ${cartao('Curva S', `
      <p class="curva-leitura">${fraseFisica} ${fraseFin}</p>
      ${graficoCurvaS(o, 320)}`)}

    ${cartao('Mês a mês', `<div class="tab-rolagem"><table class="tab">
      <thead><tr><th>Mês</th><th class="num">Físico previsto</th><th class="num">Físico realizado</th>
        <th class="num">Desvio</th><th class="num">Financeiro realizado</th><th class="num">Desembolso acumulado</th></tr></thead>
      <tbody>${linhas}</tbody></table></div>`, {
      semPadding: true,
      acoes: `<select data-filtro="situacao" aria-label="Recorte">
        <option value="">Tudo</option>
        <option value="realizado" ${f.situacao === 'realizado' ? 'selected' : ''}>Só realizado</option>
        <option value="projecao" ${f.situacao === 'projecao' ? 'selected' : ''}>Só projeção</option>
      </select>`
    })}

    <div class="cartao"><div class="corpo" style="font-size:12.5px;color:var(--tinta2)">
      A curva física prevista distribui o peso de cada etapa ao longo das datas planejadas.
      O peso vem do campo <b>Peso</b> da etapa; se estiver zerado, é proporcional à duração prevista.
      A curva financeira acumula o desembolso real (medições pagas + lançamentos) sobre o custo total previsto.
    </div></div>
  </div>`;
};

/* ==================================================== FLUXO DE CAIXA */
VIEWS.fluxo = () => {
  const o = App.obra();
  const f = App.filtros;
  const dados = fluxoCaixa(o);
  const k = kpisObra(o);
  const hojeM = competencia(hojeISO());

  const tot = dados.reduce((a, d) => ({
    e: a.e + d.entradas, m: a.m + d.medicoes, ou: a.ou + d.outras, s: a.s + d.saidas
  }), { e: 0, m: 0, ou: 0, s: 0 });

  let linhasD = dados.slice();
  if (f.situacao === 'movimento') linhasD = linhasD.filter((d) => d.entradas || d.saidas);
  if (f.situacao === 'futuros') linhasD = linhasD.filter((d) => d.ym > hojeM);

  const linhas = linhasD.map((d) => {
    const saidaSub = [
      d.medicoes ? `medições ${fmtMoneyCurto(d.medicoes)}` : null,
      d.outras ? `outras ${fmtMoneyCurto(d.outras)}` : null,
    ].filter(Boolean).join(' · ');
    const aLiquidar = (d.previstasNaoRecebidas || d.medicoesNaoPagas)
      ? `<div class="ct-escopo-w">${d.previstasNaoRecebidas ? `<span class="pos">+${fmtMoneyCurto(d.previstasNaoRecebidas)}</span>` : ''}${d.medicoesNaoPagas ? `<span class="neg">−${fmtMoneyCurto(d.medicoesNaoPagas)}</span>` : ''}</div>`
      : '—';
    return `<tr>
      <td class="mono">${fmtCompetencia(d.ym)}${d.ym > hojeM ? ' <span class="chip" style="font-size:10px">futuro</span>' : ''}</td>
      <td class="num mono">${d.entradas ? fmtMoney(d.entradas) : '—'}</td>
      <td class="num mono"><div class="ct-escopo-w"><span>${d.saidas ? fmtMoney(d.saidas) : '—'}</span>${saidaSub ? `<span class="ct-detalhe">${saidaSub}</span>` : ''}</div></td>
      <td class="num mono ${d.saldoMes < 0 ? 'neg' : d.saldoMes > 0 ? 'pos' : ''}">${d.saldoMes ? fmtMoney(d.saldoMes) : '—'}</td>
      <td class="num mono ${d.acumulado < 0 ? 'neg' : ''}"><b>${fmtMoney(d.acumulado)}</b></td>
      <td class="num mono">${aLiquidar}</td>
    </tr>`;
  }).join('');

  const posicao = k.saldoCaixa + k.previstoNaoRecebido - k.medicoesNaoPagas;

  return `<div class="grade" style="gap:16px">
    <div class="hero">
      ${kpi('Saldo em caixa', fmtMoney(k.saldoCaixa, { dec: 0 }),
        `inicial ${fmtMoneyCurto(k.saldoInicial)} + ${fmtMoneyCurto(tot.e)} − ${fmtMoneyCurto(tot.s)}`,
        { destaque: true, tom: k.saldoCaixa < 0 ? 'critico' : 'ok' })}
      ${kpi('A receber', fmtMoney(k.previstoNaoRecebido, { dec: 0 }),
        'parcelas previstas não creditadas', { destaque: true })}
      ${kpi('A pagar', fmtMoney(k.medicoesNaoPagas, { dec: 0 }),
        'medições em aberto', { destaque: true, tom: k.medicoesNaoPagas > 0.005 ? 'aviso' : 'ok' })}
    </div>
    <p class="ct-contagem">Posição projetada (saldo + a receber − a pagar):
      <b class="${posicao < 0 ? 'neg' : ''}">${fmtMoney(posicao, { dec: 0 })}</b></p>

    ${cartao('Movimento mensal', graficoFluxo(o, 280))}

    ${cartao('Tabela mensal', `<div class="tab-rolagem"><table class="tab">
      <thead><tr><th>Mês</th><th class="num">Entradas</th><th class="num">Saídas</th>
        <th class="num">Saldo do mês</th><th class="num">Saldo acumulado</th><th class="num">A liquidar</th></tr></thead>
      <tbody>${linhas}</tbody>
      <tfoot><tr><td>Total</td><td class="num mono">${fmtMoney(tot.e)}</td><td class="num mono">${fmtMoney(tot.s)}</td>
        <td class="num mono ${tot.e - tot.s < 0 ? 'neg' : ''}">${fmtMoney(tot.e - tot.s)}</td><td colspan="2"></td></tr></tfoot>
    </table></div>`, {
      semPadding: true,
      acoes: `<select data-filtro="situacao" aria-label="Recorte">
        <option value="">Todos os meses</option>
        <option value="movimento" ${f.situacao === 'movimento' ? 'selected' : ''}>Só com movimento</option>
        <option value="futuros" ${f.situacao === 'futuros' ? 'selected' : ''}>Só meses futuros</option>
      </select>`
    })}
  </div>`;
};

/* =========================================================== ALERTAS */
VIEWS.alertas = () => {
  const o = App.obra();
  let al = alertasObra(o);
  if (App.filtros.sev) al = al.filter((a) => String(a.sev) === App.filtros.sev);
  if (App.filtros.modulo) al = al.filter((a) => a.modulo === App.filtros.modulo);
  const modulos = [...new Set(alertasObra(o).map((a) => a.modulo))];
  const todos = alertasObra(o);

  return `<div class="grade" style="gap:16px">
    <div class="grade g3">
      ${kpi('Críticos', todos.filter((a) => a.sev === 3).length, 'exigem ação imediata', todos.some((a) => a.sev === 3) ? 'critico' : 'ok')}
      ${kpi('Atenção', todos.filter((a) => a.sev === 2).length, 'resolver nos próximos dias', 'aviso')}
      ${kpi('Informativos', todos.filter((a) => a.sev === 1).length, 'acompanhar')}
    </div>
    ${cartao('Pendências', al.length ? al.map((a) => alertaHTML(a)).join('')
      : `<div class="corpo"><p style="margin:0;color:var(--ok)">Nada pendente com esse filtro.</p></div>`, {
      semPadding: true,
      acoes: `<div class="filtros">
        <select data-filtro="sev">
          <option value="">Todas as severidades</option>
          <option value="3" ${App.filtros.sev === '3' ? 'selected' : ''}>Críticos</option>
          <option value="2" ${App.filtros.sev === '2' ? 'selected' : ''}>Atenção</option>
          <option value="1" ${App.filtros.sev === '1' ? 'selected' : ''}>Informativos</option>
        </select>
        ${selectFiltro('modulo', modulos, 'Todos os módulos')}
      </div>`
    })}
  </div>`;
};

/* ==================================================== DIÁRIO DE OBRA */
VIEWS.diario = () => {
  const o = App.obra();
  const f = App.filtros;
  const todos = o.diario;
  const ordenados = todos.slice().sort((a, b) => String(b.data).localeCompare(String(a.data)));
  const ultimo = ordenados[0];
  const semRegistro = ultimo && isISO(ultimo.data) ? diasEntre(ultimo.data, hojeISO()) : null;
  const totFotos = todos.reduce((s, d) => s + (d.fotos ? d.fotos.length : 0), 0);
  const chuvosos = todos.filter((d) => d.clima && d.clima.includes('Chuva'));
  const noMes = todos.filter((d) => competencia(d.data) === competencia(hojeISO())).length;
  const etapasUsadas = [...new Set(todos.map((d) => d.etapa).filter(Boolean))].sort();
  const meses = [...new Set(todos.map((d) => competencia(d.data)).filter(Boolean))].sort().reverse();

  /* ---------------------------------------------------------- filtros */
  const busca = norm(f.busca || '');
  let lista = ordenados;
  if (f.etapa) lista = lista.filter((d) => d.etapa === f.etapa);
  if (f.mes) lista = lista.filter((d) => competencia(d.data) === f.mes);
  if (f.situacao === 'ocorrencia') lista = lista.filter((d) => d.ocorrencias && d.ocorrencias.trim());
  if (f.situacao === 'foto') lista = lista.filter((d) => d.fotos && d.fotos.length);
  if (f.situacao === 'chuva') lista = lista.filter((d) => d.clima && d.clima.includes('Chuva'));
  if (busca) lista = filtraTexto(lista, f.busca, ['atividades', 'ocorrencias', 'autor', 'etapa']);
  const filtrando = lista.length !== todos.length;

  const registros = lista.map((d) => `
    <article class="cartao diario-item" style="box-shadow:none">
      <header>
        <h3>${fmtData(d.data)}</h3>
        ${chip(d.clima, d.clima && d.clima.includes('Chuva') ? 'aviso' : '')}
        ${d.etapa ? chip(d.etapa, 'marca') : ''}
        ${num(d.efetivo) ? chip(fmtNum(d.efetivo, 0) + ' na obra') : ''}
        ${d.ocorrencias && d.ocorrencias.trim() ? chip('ocorrência', 'critico') : ''}
        <div class="dir">${acoesLinha('diario', d.id)}</div>
      </header>
      <div class="corpo" style="display:flex;flex-direction:column;gap:10px">
        ${d.atividades ? `<div><span class="rotulo">Atividades</span><p style="margin:2px 0 0">${esc(d.atividades)}</p></div>` : ''}
        ${d.ocorrencias ? `<div><span class="rotulo">Ocorrências</span><p style="margin:2px 0 0;color:var(--aviso)">${esc(d.ocorrencias)}</p></div>` : ''}
        ${d.fotos && d.fotos.length ? `<div class="fotos">${d.fotos.map((foto, i) =>
          `<figure><img src="${foto.dados}" alt="${esc(foto.nome || 'Foto da obra')}" loading="lazy" data-acao="ver-foto" data-id="${d.id}" data-idx="${i}"></figure>`).join('')}</div>` : ''}
        ${d.autor ? `<span style="font-size:11.5px;color:var(--mudo)">registrado por ${esc(d.autor)}</span>` : ''}
      </div>
    </article>`).join('');

  const filtros = `<div class="filtros">
    ${campoBusca('busca', 'Buscar atividade, ocorrência, autor…')}
    ${etapasUsadas.length > 1 ? selectFiltro('etapa', etapasUsadas, 'Todas as etapas') : ''}
    <select data-filtro="situacao" aria-label="Recorte">
      <option value="">Todos os registros</option>
      <option value="ocorrencia" ${f.situacao === 'ocorrencia' ? 'selected' : ''}>Com ocorrência</option>
      <option value="foto" ${f.situacao === 'foto' ? 'selected' : ''}>Com foto</option>
      <option value="chuva" ${f.situacao === 'chuva' ? 'selected' : ''}>Dia de chuva</option>
    </select>
    ${meses.length > 1 ? `<select data-filtro="mes" aria-label="Mês">
      <option value="">Todos os meses</option>
      ${meses.map((ym) => `<option value="${ym}" ${f.mes === ym ? 'selected' : ''}>${fmtCompetencia(ym)}</option>`).join('')}
    </select>` : ''}
    ${filtrando ? `<span class="ct-contagem" style="margin:0">${lista.length} de ${todos.length}</span>` : ''}
    <span style="margin-left:auto">${botao('Novo registro', 'novo-diario', {}, 'btn primario pequeno', 'mais')}</span>
  </div>`;

  return `<div class="grade" style="gap:16px">
    <div class="hero">
      ${kpi('Registros', todos.length, `${noMes} neste mês`, { destaque: true })}
      ${kpi('Sem registro há', semRegistro === null ? '—' : `${semRegistro} dia${semRegistro === 1 ? '' : 's'}`,
        semRegistro === null ? 'nenhuma visita registrada' : `último em ${fmtDataCurta(ultimo.data)}`,
        { destaque: true, tom: semRegistro !== null && semRegistro > 7 ? 'aviso' : 'ok' })}
      ${kpi('Fotos no diário', totFotos,
        chuvosos.length ? `${chuvosos.length} dia${chuvosos.length === 1 ? '' : 's'} de chuva registrado${chuvosos.length === 1 ? '' : 's'}` : 'nenhum dia de chuva',
        { destaque: true })}
    </div>

    ${cartao('Diário de obra', lista.length
      ? `<div class="grade" style="gap:12px">${registros}</div>`
      : vazio(
        filtrando ? 'Nada com esse filtro' : 'Sem registros',
        filtrando ? 'Ajuste a busca ou os filtros acima.' : 'Documente cada visita: clima, efetivo, o que foi executado, ocorrências e fotos. Serve como prova documental e memória da obra.',
        filtrando ? '' : botao('Novo registro', 'novo-diario', {}, 'btn primario', 'mais')), {
      acoes: todos.length ? filtros : botao('Novo registro', 'novo-diario', {}, 'btn primario pequeno', 'mais')
    })}
  </div>`;
};

/* ==================================================== TRILHA DE AUDITORIA */
/* Somente leitura. Não entra no ciclo do Store: a trilha vive no banco e só o
   gatilho a escreve. Por isso tem carga própria, guardada aqui. */
const Auditoria = { chave: '', linhas: null, erro: '', carregando: false };

function carregarAuditoria(chave, forcar = false) {
  if (Auditoria.carregando) return;
  if (!forcar && Auditoria.chave === chave && (Auditoria.linhas || Auditoria.erro)) return;
  Auditoria.chave = chave;
  Auditoria.linhas = null;
  Auditoria.erro = '';
  Auditoria.carregando = true;
  SUPA.lerAuditoria(chave)
    .then((linhas) => { Auditoria.linhas = linhas; })
    .catch((e) => { Auditoria.erro = String((e && e.message) || e); })
    .finally(() => {
      Auditoria.carregando = false;
      const o = App.obra();
      if (App.rota.view === 'auditoria' && o && o.id === chave) App.renderConteudo();
    });
}

const AUD_TABELAS = {
  contratos: 'Contrato', medicoes: 'Medição', recebimentos: 'Recebimento', lancamentos: 'Lançamento',
};
const AUD_CAMPOS = {
  quantidade: ['Quantidade', 'numero'],
  preco_unitario: ['Preço unitário', 'dinheiro'],
  valor_informado: ['Valor fechado', 'dinheiro'],
  valor_medido: ['Valor medido', 'dinheiro'],
  desconto: ['Desconto', 'dinheiro'],
  valor_pago: ['Valor pago', 'dinheiro'],
  valor_previsto: ['Valor previsto', 'dinheiro'],
  valor_aprovado: ['Valor aprovado', 'dinheiro'],
  descontos: ['Descontos', 'dinheiro'],
  valor_recebido: ['Valor recebido', 'dinheiro'],
  frete: ['Frete', 'dinheiro'],
};

const audValor = (v, tipo) => {
  if (v === null || v === undefined || v === '') return '—';
  return tipo === 'dinheiro' ? fmtMoney(num(v)) : fmtNum(num(v), 2);
};

function audQuem(usuarioId) {
  if (SUPA.usuario && usuarioId === SUPA.usuario.id) {
    return esc((SUPA.usuario.email || 'você').split('@')[0]);
  }
  return usuarioId ? 'outro usuário' : 'sistema';
}

function audRegistro(o, tabela, id) {
  const item = (o[tabela] || []).find((x) => x.id === id);
  if (!item) return `${AUD_TABELAS[tabela] || tabela} (excluído)`;
  if (tabela === 'contratos') return `Contrato ${esc(item.codigo || item.codigoBase || '')}`.trim();
  if (tabela === 'medicoes') return `Medição ${esc(item.numero || '')}${item.contratoBase ? ' · ' + esc(item.contratoBase) : ''}`.trim();
  if (tabela === 'recebimentos') return `Recebimento ${esc(item.numeroMedicao || item.etapaPci || '')}`.trim();
  if (tabela === 'lancamentos') return esc(item.descricao || 'Lançamento');
  return AUD_TABELAS[tabela] || tabela;
}

function audDataHora(iso) {
  try {
    return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  } catch (e) { return esc(String(iso || '')); }
}

VIEWS.auditoria = () => {
  const o = App.obra();
  if (!o) return vazio('Selecione uma obra', 'A trilha de auditoria é registrada por obra.');

  if (Store.backend !== 'supabase') {
    return cartao('Trilha de auditoria', vazio(
      'Disponível com login',
      'A trilha registra quem alterou cada valor financeiro — contrato, medição, recebimento e lançamento — e quando. Ela vive no banco de dados e aparece quando você acessa o sistema com a sua conta.'));
  }

  carregarAuditoria(o.id);

  if (Auditoria.carregando && !Auditoria.linhas) {
    return cartao('Trilha de auditoria', vazio('Carregando…', 'Buscando o histórico de alterações desta obra.'));
  }

  if (Auditoria.erro) {
    const faltaTabela = /relation .*auditoria.* does not exist|Could not find the table|schema cache/i.test(Auditoria.erro);
    return cartao('Trilha de auditoria', `
      ${vazio(faltaTabela ? 'Trilha ainda não instalada' : 'Não foi possível carregar',
        faltaTabela
          ? 'Aplique a migração db/migracoes/0003_auditoria.sql no SQL Editor do Supabase e recarregue.'
          : Auditoria.erro)}
      <div style="text-align:center;margin-top:8px">${botao('Tentar de novo', 'recarregar-auditoria', {}, 'btn')}</div>`);
  }

  const linhas = Auditoria.linhas || [];
  if (!linhas.length) {
    return cartao('Trilha de auditoria', vazio(
      'Nenhuma alteração ainda',
      'Assim que um valor financeiro for criado ou alterado, o registro aparece aqui: quem mudou, de quanto para quanto e quando.'), {
      acoes: botao('Atualizar', 'recarregar-auditoria', {}, 'btn sutil pequeno'),
    });
  }

  const campos = new Set(linhas.map((l) => l.campo));
  const desde = linhas[linhas.length - 1];
  const resumo = `<div class="grade g3">
    ${kpi('Alterações registradas', linhas.length, linhas.length >= 500 ? 'mostrando as 500 mais recentes' : 'nesta obra')}
    ${kpi('Campos afetados', campos.size, [...campos].map((c) => (AUD_CAMPOS[c] || [c])[0]).join(', '))}
    ${kpi('Desde', desde ? audDataHora(desde.criado_em) : '—', 'primeiro registro guardado')}
  </div>`;

  const corpo = linhas.map((l) => {
    const [rotulo, tipo] = AUD_CAMPOS[l.campo] || [l.campo, 'numero'];
    const op = l.operacao === 'INSERT'
      ? chip('criado', 'ok')
      : l.operacao === 'DELETE' ? chip('excluído', 'aviso') : chip('alterado', 'marca');
    const antes = audValor(l.valor_antes, tipo);
    const depois = audValor(l.valor_depois, tipo);
    const transicao = l.operacao === 'INSERT'
      ? `<b>${depois}</b>`
      : l.operacao === 'DELETE'
        ? `<span style="color:var(--mudo)">${antes}</span>`
        : `<span style="color:var(--mudo)">${antes}</span> &rarr; <b>${depois}</b>`;
    return `<tr>
      <td style="white-space:nowrap;color:var(--mudo)">${audDataHora(l.criado_em)}</td>
      <td>${audQuem(l.usuario_id)}</td>
      <td>${audRegistro(o, l.tabela, l.registro_id)}</td>
      <td>${op} ${esc(rotulo)}</td>
      <td style="text-align:right;font-variant-numeric:tabular-nums">${transicao}</td>
    </tr>`;
  }).join('');

  return `<div class="grade" style="gap:16px">
    ${resumo}
    ${cartao('Alterações de valor financeiro', `
      <table class="tab">
        <thead><tr>
          <th>Quando</th><th>Quem</th><th>Registro</th><th>Alteração</th>
          <th style="text-align:right">Antes &rarr; depois</th>
        </tr></thead>
        <tbody>${corpo}</tbody>
      </table>`, {
      semPadding: true,
      acoes: botao('Atualizar', 'recarregar-auditoria', {}, 'btn sutil pequeno'),
    })}
  </div>`;
};

/* ================================================== CONFIGURAÇÃO OBRA */
VIEWS['obra-config'] = () => {
  const o = App.obra();
  const clientes = Store.estado.clientes.map((c) => ({ v: c.id, t: c.nome }));
  const campos = [
    { secao: 'Identificação' },
    { k: 'nome', label: 'Nome da obra', tipo: 'texto', col: 6, obrigatorio: true },
    { k: 'clienteId', label: 'Cliente', tipo: 'select', opcoes: clientes, col: 3, placeholder: 'sem cliente' },
    { k: 'status', label: 'Situação', tipo: 'select', opcoes: opcoesLista('statusObra'), col: 3, vazio: false },
    { k: 'cidade', label: 'Cidade/UF', tipo: 'texto', col: 4 },
    { k: 'endereco', label: 'Endereço', tipo: 'texto', col: 8 },
    { k: 'areaConstruida', label: 'Área construída (m²)', tipo: 'numero', col: 3 },
    { k: 'areaMuro', label: 'Área de muro (m²)', tipo: 'numero', col: 3 },
    { k: 'sistema', label: 'Sistema construtivo', tipo: 'texto', col: 3 },
    { k: 'padrao', label: 'Padrão de acabamento', tipo: 'texto', col: 3 },
    { k: 'dataInicio', label: 'Data de início', tipo: 'data', col: 3 },
    { k: 'previsaoConclusao', label: 'Previsão de conclusão', tipo: 'data', col: 3 },
    { k: 'responsavel', label: 'Responsável técnico', tipo: 'texto', col: 6 },
    { secao: 'Financeiro e contrato' },
    { k: 'fin.saldoInicial', label: 'Saldo inicial da obra', tipo: 'dinheiro', col: 3 },
    { k: 'fin.valorTerreno', label: 'Valor do terreno', tipo: 'dinheiro', col: 3 },
    { k: 'fin.valorFinanciado', label: 'Financiado para obra', tipo: 'dinheiro', col: 3 },
    { k: 'fin.recursosProprios', label: 'Recursos próprios previstos', tipo: 'dinheiro', col: 3 },
    { k: 'fin.precoEmpreitadaM2', label: 'Preço empreitada/m²', tipo: 'dinheiro', col: 3 },
    { k: 'fin.custoFisicoMaxM2', label: 'Custo físico máximo/m²', tipo: 'dinheiro', col: 3, dica: 'gera alerta se ultrapassar' },
    { k: 'fin.valorVenda', label: 'Valor de venda/contrato', tipo: 'dinheiro', col: 3 },
    { k: 'fin.margemDesejada', label: 'Margem desejada (%)', tipo: 'pct', col: 3 },
    { k: 'fin.contratoCaixa', label: 'Nº do contrato de financiamento', tipo: 'texto', col: 4 },
    { k: 'fin.dataAssinatura', label: 'Data da assinatura', tipo: 'data', col: 4 },
    { k: 'observacoes', label: 'Observações', tipo: 'area', col: 12 }
  ];
  const valores = {};
  campos.forEach((c) => {
    if (!c.k) return;
    valores[c.k] = c.k.startsWith('fin.') ? o.fin[c.k.slice(4)] : o[c.k];
  });
  const html = campos.map((c) => c.secao
    ? `<div class="secao-form"><span class="rotulo">${esc(c.secao)}</span></div>`
    : campoHTML(c, valores)).join('');

  const k = kpisObra(o);
  return `<div class="grade" style="gap:16px">
    ${cartao('Dados da obra', `<form class="form-grade" data-form="1" onsubmit="return false">${html}</form>`, {
      acoes: `${botao('Salvar alterações', 'salvar-obra-config', {}, 'btn primario')}`
    })}
    ${cartao('Contrato calculado', `
      <div class="grade g3">
        ${kpi('Empreitada principal', fmtMoney(num(o.areaConstruida) * num(o.fin.precoEmpreitadaM2), { dec: 0 }),
          `${fmtNum(o.areaConstruida, 2)} m² × ${fmtMoney(o.fin.precoEmpreitadaM2, { dec: 0 })}/m²`)}
        ${kpi('Custo previsto total', fmtMoney(k.custoPrevisto, { dec: 0 }), 'contratos + materiais + saídas')}
        ${kpi('Resultado projetado', k.resultado === null ? '—' : fmtMoney(k.resultado, { dec: 0 }),
          k.margem === null ? 'informe o valor de venda' : `margem de ${fmtPct(k.margem)}`,
          k.margem !== null && k.margem < num(o.fin.margemDesejada) ? 'aviso' : 'ok')}
      </div>`)}
    ${/MCMV/i.test(o.padrao || '') || o.fin.contratoCaixa || num(o.fin.valorFinanciado) > 0 ? cartao('Escopo típico da empreitada financiada (MCMV)', `
      <table class="tab">
        <tbody>
          <tr><td style="width:190px"><b>Incluído</b></td><td>Parte cinza, hidráulica e sanitário sem fossa, eletrodutos e caixas, assentamento de piso e revestimento</td></tr>
          <tr><td><b>Separado</b></td><td>Pintura, elétrica final, gesso/forro e demais prestadores específicos</td></tr>
          <tr><td><b>Aditivos comuns</b></td><td>Fossa, calçada e muro</td></tr>
          <tr><td><b>Fornecimento + instalação</b></td><td>Calhas, rufos, mármores e portas quando o preço já inclui material e instalação</td></tr>
          <tr><td><b>Regra</b></td><td>Medições nunca devem ultrapassar contrato + aditivos aprovados</td></tr>
        </tbody>
      </table>`, { semPadding: true }) : ''}
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      ${botao('Duplicar esta obra', 'duplicar-obra', {}, 'btn')}
      ${botao('Excluir obra', 'excluir-obra', {}, 'btn perigo', 'lixo')}
    </div>
  </div>`;
};

export {
  VIEWS,
  alertaHTML,
  carregarAuditoria,
  contratosAbertos
};
