/**
 * calculos.js — Regras de negócio: todo cálculo do sistema vive aqui, sem tocar em DOM.
 */
import { addMeses, competencia, diasEntre, fimDoMes, fmtData, fmtMoney, fmtNum, fmtPct, hojeISO, inicioDoMes, isISO, norm, num, round2 } from '../nucleo/base.js';

/* ------------------------------------------------------ CONTRATOS  */
/* Planilha: K = SE(valor informado > 0; valor informado; qtd × preço) */
function contratoValor(c) {
  const vi = num(c.valorInformado);
  return vi > 0 ? vi : num(c.quantidade) * num(c.precoUnitario);
}

/* Planilha: P = SOMASES(K; código-base; base; status; "<>Cancelado") */
function contratoTotalAutorizado(obra, codigoBase) {
  if (!codigoBase) return 0;
  return obra.contratos
    .filter((c) => c.codigoBase === codigoBase && c.status !== 'Cancelado')
    .reduce((s, c) => s + contratoValor(c), 0);
}

/* Planilha: Q = SOMASES(MEDIÇÕES!K; base; status "<>Cancelado") */
function contratoTotalPago(obra, codigoBase) {
  if (!codigoBase) return 0;
  return obra.medicoes
    .filter((m) => m.contratoBase === codigoBase && m.status !== 'Cancelado')
    .reduce((s, m) => s + num(m.valorPago), 0);
}

function contratoSaldo(obra, codigoBase) {
  return contratoTotalAutorizado(obra, codigoBase) - contratoTotalPago(obra, codigoBase);
}

/* Agrupamento por código-base — a unidade real de controle contratual */
function basesContratuais(obra) {
  const mapa = new Map();
  obra.contratos.forEach((c) => {
    const base = c.codigoBase || c.codigo || '(sem código)';
    if (!mapa.has(base)) {
      mapa.set(base, { base, principal: null, aditivos: [], registros: [] });
    }
    const g = mapa.get(base);
    g.registros.push(c);
    if (c.registro === 'Contrato' && !g.principal) g.principal = c;
    else if (c.registro !== 'Contrato') g.aditivos.push(c);
  });
  return [...mapa.values()].map((g) => {
    const autorizado = contratoTotalAutorizado(obra, g.base);
    const pago = contratoTotalPago(obra, g.base);
    const medido = obra.medicoes
      .filter((m) => m.contratoBase === g.base && m.status !== 'Cancelado')
      .reduce((s, m) => s + medicaoLiquido(m), 0);
    return {
      ...g,
      prestador: (g.principal || g.registros[0] || {}).prestador || '',
      escopo: (g.principal || g.registros[0] || {}).escopo || '',
      status: (g.principal || g.registros[0] || {}).status || '',
      valorPrincipal: g.principal ? contratoValor(g.principal) : 0,
      valorAditivos: g.aditivos.filter((a) => a.status !== 'Cancelado').reduce((s, a) => s + contratoValor(a), 0),
      autorizado, pago, medido,
      saldo: autorizado - pago,
      execFinanceira: autorizado > 0 ? pago / autorizado : 0
    };
  }).sort((a, b) => a.base.localeCompare(b.base));
}

/* ------------------------------------------------------- MEDIÇÕES  */
/* Planilha: I = MÁXIMO(0; medido − desconto) */
function medicaoLiquido(m) {
  return Math.max(0, num(m.valorMedido) - num(m.desconto));
}

/* Planilha: N = total autorizado do contrato − total pago em medições */
function medicaoSaldoContratual(obra, m) {
  return contratoSaldo(obra, m.contratoBase);
}

/* Planilha: O = cadeia de alertas */
function medicaoAlerta(obra, m) {
  if (!m.contratoBase) return '';
  const liq = medicaoLiquido(m);
  const pago = num(m.valorPago);
  if (pago > liq) return 'PAGO ACIMA DA MEDIÇÃO';
  if (medicaoSaldoContratual(obra, m) < 0) return 'CONTRATO ULTRAPASSADO';
  if (pago < liq && m.status === 'Pago') return 'PAGAMENTO INCOMPLETO';
  return 'OK';
}

/* --------------------------------------------------- RECEBIMENTOS  */
/* Planilha: K = MÁXIMO(0; aprovado − descontos);  O = recebido − previsto */
function recebimentoLiquido(r) {
  return Math.max(0, num(r.valorAprovado) - num(r.descontos));
}
function recebimentoDiferenca(r) {
  return num(r.valorRecebido) - num(r.valorPrevisto);
}

/* ---------------------------------------------------- LANÇAMENTOS  */
/* Planilha: O = MÁXIMO(0; qtd × preço − desconto + frete) */
function lancamentoTotal(l) {
  return Math.max(0, num(l.quantidade) * num(l.precoUnitario) - num(l.desconto) + num(l.frete));
}

/* ------------------------------------------------------ MATERIAIS  */
/* Vincula compras ao item planejado: por materialId (preferencial) ou,
   como na planilha, por etapa + descrição idêntica em lançamentos "Material". */
function lancamentosDoMaterial(obra, mat) {
  return obra.lancamentos.filter((l) => {
    if (l.materialId) return l.materialId === mat.id;
    return l.tipo === 'Material' &&
      norm(l.etapa) === norm(mat.etapa) &&
      norm(l.descricao) === norm(mat.material) &&
      norm(mat.material) !== '';
  });
}

function materialCalc(obra, mat) {
  const ls = lancamentosDoMaterial(obra, mat);
  const comprada = ls.reduce((s, l) => s + num(l.quantidade), 0);
  const valorComprado = ls.reduce((s, l) => s + lancamentoTotal(l), 0);
  const necessaria = num(mat.quantidadeNecessaria);
  const saldo = Math.max(0, necessaria - comprada);
  const orcamento = necessaria * num(mat.precoPrevisto);
  const vencido = isISO(mat.dataNecessaria) && mat.dataNecessaria < hojeISO() && saldo > 0 && mat.status !== 'Cancelado';
  return {
    comprada, valorComprado, saldo, orcamento, vencido,
    saldoValor: saldo * num(mat.precoPrevisto),
    desvio: valorComprado - (comprada * num(mat.precoPrevisto)),
    compras: ls.length
  };
}

/* ----------------------------------------------------- CRONOGRAMA  */
function etapaCalc(e, hoje = hojeISO()) {
  const diasPrevistos = (isISO(e.inicioPrevisto) && isISO(e.fimPrevisto))
    ? diasEntre(e.inicioPrevisto, e.fimPrevisto) + 1 : 0;
  let diasRealizados = 0;
  if (isISO(e.inicioReal)) {
    diasRealizados = isISO(e.fimReal)
      ? diasEntre(e.inicioReal, e.fimReal) + 1
      : diasEntre(e.inicioReal, hoje) + 1;
  }
  const progresso = Math.min(1, Math.max(0, num(e.progresso)));
  const atraso = (isISO(e.fimPrevisto) && progresso < 1)
    ? Math.max(0, diasEntre(e.fimPrevisto, hoje)) : 0;
  let situacao;
  if (!isISO(e.fimPrevisto)) situacao = 'NÃO PLANEJADO';
  else if (progresso >= 1) situacao = 'CONCLUÍDO';
  else if (e.fimPrevisto < hoje) situacao = 'ATRASADO';
  else if (progresso > 0) situacao = 'EM ANDAMENTO';
  else situacao = 'NÃO INICIADO';
  return {
    diasPrevistos, diasRealizados, atraso, progresso, situacao,
    produtividade: diasRealizados > 0 ? num(e.quantidadeExecutada) / diasRealizados : 0,
    desvioPrazo: diasPrevistos > 0 ? diasRealizados - diasPrevistos : 0
  };
}

/* Peso de cada etapa na curva física: manual → duração prevista → igual */
function pesosCronograma(obra) {
  const et = obra.cronograma;
  if (!et.length) return new Map();
  const manuais = et.reduce((s, e) => s + num(e.peso), 0);
  const mapa = new Map();
  if (manuais > 0) {
    et.forEach((e) => mapa.set(e.id, num(e.peso) / manuais));
    return mapa;
  }
  const duracoes = et.map((e) => etapaCalc(e).diasPrevistos);
  const total = duracoes.reduce((a, b) => a + b, 0);
  et.forEach((e, i) => mapa.set(e.id, total > 0 ? duracoes[i] / total : 1 / et.length));
  return mapa;
}

/* ------------------------------------------------- FLUXO DE CAIXA  */
function competenciasObra(obra, minimo = 12) {
  const datas = [];
  const push = (d) => { if (isISO(d)) datas.push(d); };
  push(obra.dataInicio);
  push(obra.previsaoConclusao);
  obra.recebimentos.forEach((r) => { push(r.dataRecebimento); push(r.dataPrevista); });
  obra.medicoes.forEach((m) => { push(m.dataPagamento); push(m.data); });
  obra.lancamentos.forEach((l) => push(l.data));
  obra.cronograma.forEach((e) => { push(e.inicioPrevisto); push(e.fimPrevisto); push(e.inicioReal); push(e.fimReal); });
  if (!datas.length) return [];
  datas.sort();
  const ini = competencia(datas[0]);
  let fim = competencia(datas[datas.length - 1]);
  const hoje = competencia(hojeISO());
  if (fim < hoje) fim = hoje;
  const out = [];
  let c = ini;
  let guard = 0;
  while (c <= fim && guard++ < 240) { out.push(c); c = addMeses(c, 1); }
  while (out.length < minimo && guard++ < 240) { out.push(addMeses(out[out.length - 1], 1)); }
  return out;
}

function fluxoCaixa(obra) {
  const meses = competenciasObra(obra);
  let acumulado = num(obra.fin.saldoInicial);
  return meses.map((ym) => {
    const entradas = obra.recebimentos
      .filter((r) => r.status !== 'Cancelado' && competencia(r.dataRecebimento) === ym)
      .reduce((s, r) => s + num(r.valorRecebido), 0);
    const medicoes = obra.medicoes
      .filter((m) => m.status !== 'Cancelado' && competencia(m.dataPagamento) === ym)
      .reduce((s, m) => s + num(m.valorPago), 0);
    const outras = obra.lancamentos
      .filter((l) => competencia(l.data) === ym)
      .reduce((s, l) => s + lancamentoTotal(l), 0);
    const saidas = medicoes + outras;
    const saldoMes = entradas - saidas;
    acumulado += saldoMes;
    const previstasNaoRecebidas = obra.recebimentos
      .filter((r) => competencia(r.dataPrevista) === ym && r.status !== 'Recebido' && r.status !== 'Cancelado')
      .reduce((s, r) => s + (recebimentoLiquido(r) || num(r.valorPrevisto)), 0);
    const medicoesNaoPagas = obra.medicoes
      .filter((m) => competencia(m.data) === ym && m.status !== 'Cancelado')
      .reduce((s, m) => s + Math.max(0, medicaoLiquido(m) - num(m.valorPago)), 0);
    return {
      ym, entradas, medicoes, outras, saidas, saldoMes,
      acumulado, previstasNaoRecebidas, medicoesNaoPagas
    };
  });
}

/* ------------------------------------------------ INDICADORES OBRA */
function kpisObra(obra) {
  const recebido = obra.recebimentos
    .filter((r) => r.status !== 'Cancelado')
    .reduce((s, r) => s + num(r.valorRecebido), 0);
  const pagoMedicoes = obra.medicoes
    .filter((m) => m.status !== 'Cancelado')
    .reduce((s, m) => s + num(m.valorPago), 0);
  const pagoLancamentos = obra.lancamentos.reduce((s, l) => s + lancamentoTotal(l), 0);
  const totalPago = pagoMedicoes + pagoLancamentos;
  const saldoInicial = num(obra.fin.saldoInicial);
  const saldoCaixa = saldoInicial + recebido - totalPago;

  const contratado = obra.contratos
    .filter((c) => c.status !== 'Cancelado')
    .reduce((s, c) => s + contratoValor(c), 0);
  const saldoContratual = contratado - pagoMedicoes;

  const area = num(obra.areaConstruida);
  const custoM2 = area > 0 ? totalPago / area : 0;

  /* Materiais ainda não comprados (valor previsto) */
  const materiaisSaldo = obra.materiais
    .filter((m) => m.status !== 'Cancelado')
    .reduce((s, m) => s + materialCalc(obra, m).saldoValor, 0);

  /* Custo previsto = já pago + saldo contratual + materiais a comprar */
  const custoPrevisto = totalPago + Math.max(0, saldoContratual) + materiaisSaldo;
  const custoPrevistoM2 = area > 0 ? custoPrevisto / area : 0;

  const terrenoLancado = obra.lancamentos
    .filter((l) => l.tipo === 'Terreno')
    .reduce((s, l) => s + lancamentoTotal(l), 0);
  const terreno = Math.max(num(obra.fin.valorTerreno), terrenoLancado);
  const custoComTerreno = custoPrevisto + (terreno - terrenoLancado);

  const venda = num(obra.fin.valorVenda);
  const margem = venda > 0 ? (venda - custoComTerreno) / venda : null;
  const resultado = venda > 0 ? venda - custoComTerreno : null;

  /* Avanço físico ponderado */
  const pesos = pesosCronograma(obra);
  const progressoFisico = obra.cronograma.length
    ? obra.cronograma.reduce((s, e) => s + (pesos.get(e.id) || 0) * Math.min(1, Math.max(0, num(e.progresso))), 0)
    : 0;
  const progressoFinanceiro = custoPrevisto > 0 ? totalPago / custoPrevisto : 0;

  const previstoNaoRecebido = obra.recebimentos
    .filter((r) => r.status !== 'Recebido' && r.status !== 'Cancelado')
    .reduce((s, r) => s + (recebimentoLiquido(r) || num(r.valorPrevisto)), 0);
  const medicoesNaoPagas = obra.medicoes
    .filter((m) => m.status !== 'Cancelado')
    .reduce((s, m) => s + Math.max(0, medicaoLiquido(m) - num(m.valorPago)), 0);

  const etapas = obra.cronograma.map((e) => etapaCalc(e));
  const diasObra = isISO(obra.dataInicio) ? diasEntre(obra.dataInicio, hojeISO()) : 0;
  const diasParaFim = isISO(obra.previsaoConclusao) ? diasEntre(hojeISO(), obra.previsaoConclusao) : null;

  return {
    recebido, pagoMedicoes, pagoLancamentos, totalPago, saldoInicial, saldoCaixa,
    contratado, saldoContratual, area, custoM2, custoPrevisto, custoPrevistoM2,
    materiaisSaldo, terreno, custoComTerreno, venda, margem, resultado,
    progressoFisico, progressoFinanceiro, previstoNaoRecebido, medicoesNaoPagas,
    financiado: num(obra.fin.valorFinanciado),
    recursosProprios: num(obra.fin.recursosProprios),
    aReceber: Math.max(0, num(obra.fin.valorFinanciado) - recebido),
    etapasAtrasadas: etapas.filter((e) => e.situacao === 'ATRASADO').length,
    etapasConcluidas: etapas.filter((e) => e.situacao === 'CONCLUÍDO').length,
    etapasTotal: etapas.length,
    diasObra, diasParaFim,
    desvioFisicoFinanceiro: progressoFisico - progressoFinanceiro
  };
}

/* ------------------------------------------------------- CURVA S  */
/* Todas as séries em % acumulado (mesmo eixo 0–100%). */
function fracaoPrevista(e, dataRef) {
  if (!isISO(e.inicioPrevisto) || !isISO(e.fimPrevisto)) return 0;
  if (dataRef < e.inicioPrevisto) return 0;
  if (dataRef >= e.fimPrevisto) return 1;
  const total = diasEntre(e.inicioPrevisto, e.fimPrevisto) || 1;
  return Math.min(1, Math.max(0, diasEntre(e.inicioPrevisto, dataRef) / total));
}

function fracaoRealizada(e, dataRef, hoje) {
  const prog = Math.min(1, Math.max(0, num(e.progresso)));
  if (prog <= 0 || !isISO(e.inicioReal)) return 0;
  if (dataRef < e.inicioReal) return 0;
  const fim = isISO(e.fimReal) ? e.fimReal : hoje;
  if (dataRef >= fim) return prog;
  const total = diasEntre(e.inicioReal, fim) || 1;
  return prog * Math.min(1, Math.max(0, diasEntre(e.inicioReal, dataRef) / total));
}

function curvaS(obra) {
  const meses = competenciasObra(obra);
  if (!meses.length) return [];
  const hoje = hojeISO();
  const pesos = pesosCronograma(obra);
  const k = kpisObra(obra);
  const fluxo = fluxoCaixa(obra);
  const custoTotal = k.custoPrevisto || 1;
  let acumDesembolso = 0;
  return meses.map((ym, i) => {
    const ref = fimDoMes(ym);
    /* O mês corrente é medido até hoje — assim o último ponto realizado
       coincide com o avanço atual da obra. */
    const futuro = inicioDoMes(ym) > hoje;
    const refReal = ref > hoje ? hoje : ref;
    const fisicoPrev = obra.cronograma.reduce(
      (s, e) => s + (pesos.get(e.id) || 0) * fracaoPrevista(e, ref), 0);
    const fisicoReal = futuro ? null : obra.cronograma.reduce(
      (s, e) => s + (pesos.get(e.id) || 0) * fracaoRealizada(e, refReal, hoje), 0);
    acumDesembolso += fluxo[i] ? fluxo[i].saidas : 0;
    return {
      ym,
      futuro,
      fisicoPrevisto: fisicoPrev,
      fisicoRealizado: fisicoReal,
      financeiroPrevisto: fisicoPrev,
      financeiroRealizado: futuro ? null : acumDesembolso / custoTotal,
      desembolsoAcumulado: acumDesembolso,
      desvio: fisicoReal === null ? null : fisicoReal - fisicoPrev
    };
  });
}

/* -------------------------------------------------------- ALERTAS  */
/* severidade: 3 crítico · 2 atenção · 1 informativo */
function alertasObra(obra) {
  const out = [];
  const hoje = hojeISO();
  const add = (sev, modulo, titulo, detalhe, acao, ref) =>
    out.push({ sev, modulo, titulo, detalhe, acao, ref, obraId: obra.id, obraNome: obra.nome });

  /* Contratos */
  basesContratuais(obra).forEach((b) => {
    if (b.saldo < -0.005) {
      add(3, 'Contratos', `Contrato ${b.base} ultrapassado`,
        `Pago ${fmtMoney(b.pago)} contra ${fmtMoney(b.autorizado)} autorizados.`,
        'Emitir aditivo ou revisar medições.', { view: 'contratos', id: b.base });
    }
    if (b.medido - b.autorizado > 0.005) {
      add(2, 'Contratos', `Medições acima do contrato ${b.base}`,
        `Medido ${fmtMoney(b.medido)} para um autorizado de ${fmtMoney(b.autorizado)}.`,
        'Conferir escopo medido ou formalizar aditivo.', { view: 'contratos', id: b.base });
    }
  });

  /* Medições */
  obra.medicoes.forEach((m) => {
    const alerta = medicaoAlerta(obra, m);
    if (alerta === 'PAGO ACIMA DA MEDIÇÃO') {
      add(3, 'Medições', `Pagamento acima da medição ${m.numero || ''}`.trim(),
        `Pago ${fmtMoney(m.valorPago)} para um líquido medido de ${fmtMoney(medicaoLiquido(m))}.`,
        'Corrigir o valor pago ou a medição.', { view: 'medicoes', id: m.id });
    } else if (alerta === 'PAGAMENTO INCOMPLETO') {
      add(2, 'Medições', `Medição ${m.numero || ''} marcada como paga sem quitação`.trim(),
        `Falta ${fmtMoney(medicaoLiquido(m) - num(m.valorPago))}.`,
        'Ajustar status para Parcial ou completar o pagamento.', { view: 'medicoes', id: m.id });
    }
    const pendente = medicaoLiquido(m) - num(m.valorPago);
    if (m.status !== 'Cancelado' && pendente > 0.005 && isISO(m.data) && diasEntre(m.data, hoje) > 15) {
      add(2, 'Medições', `Medição ${m.numero || ''} em aberto há ${diasEntre(m.data, hoje)} dias`.trim(),
        `Saldo a pagar de ${fmtMoney(pendente)} para ${m.contratoBase || 'contrato não informado'}.`,
        'Programar o pagamento do prestador.', { view: 'medicoes', id: m.id });
    }
  });

  /* Recebimentos */
  obra.recebimentos.forEach((r) => {
    if (r.status === 'Cancelado' || r.status === 'Recebido') return;
    if (isISO(r.dataPrevista) && r.dataPrevista < hoje) {
      add(2, 'Recebimentos', `Parcela ${r.numeroMedicao || r.etapaPci || ''} atrasada`.trim(),
        `Previsto ${fmtMoney(r.valorPrevisto)} para ${fmtData(r.dataPrevista)} — ${diasEntre(r.dataPrevista, hoje)} dias sem crédito.`,
        'Cobrar a CAIXA ou revisar a data prevista.', { view: 'recebimentos', id: r.id });
    }
    if (r.status === 'Solicitado' && isISO(r.dataSolicitacao) && diasEntre(r.dataSolicitacao, hoje) > 20) {
      add(1, 'Recebimentos', 'Solicitação sem retorno',
        `Solicitado em ${fmtData(r.dataSolicitacao)} (${diasEntre(r.dataSolicitacao, hoje)} dias).`,
        'Acionar o engenheiro da CAIXA.', { view: 'recebimentos', id: r.id });
    }
  });

  /* Materiais */
  obra.materiais.forEach((m) => {
    const c = materialCalc(obra, m);
    if (c.vencido) {
      add(2, 'Materiais', `${m.material || 'Material'} vencido sem compra`,
        `Faltam ${fmtNum(c.saldo, 2)} ${m.unidade} desde ${fmtData(m.dataNecessaria)} (${fmtMoney(c.saldoValor)}).`,
        'Comprar ou reprogramar a data.', { view: 'materiais', id: m.id });
    } else if (c.saldo > 0 && isISO(m.dataNecessaria) && diasEntre(hoje, m.dataNecessaria) <= 7 && m.status !== 'Cancelado') {
      add(1, 'Materiais', `${m.material || 'Material'} necessário em ${diasEntre(hoje, m.dataNecessaria)} dia(s)`,
        `Saldo de ${fmtNum(c.saldo, 2)} ${m.unidade} para ${m.etapa || 'etapa não informada'}.`,
        'Programar a compra.', { view: 'materiais', id: m.id });
    }
  });

  /* Cronograma */
  obra.cronograma.forEach((e) => {
    const c = etapaCalc(e);
    if (c.situacao === 'ATRASADO') {
      add(2, 'Cronograma', `${e.etapa} atrasada em ${c.atraso} dia(s)`,
        `Progresso de ${fmtPct(c.progresso, 0)} — fim previsto era ${fmtData(e.fimPrevisto)}.`,
        'Atualizar progresso ou replanejar a etapa.', { view: 'cronograma', id: e.id });
    }
  });

  /* Financeiro */
  const k = kpisObra(obra);
  if (k.saldoCaixa < 0) {
    add(3, 'Financeiro', 'Caixa da obra negativo',
      `Saldo de ${fmtMoney(k.saldoCaixa)} considerando entradas e saídas lançadas.`,
      'Antecipar recebimento ou aportar recursos.', { view: 'fluxo' });
  }
  if (num(obra.fin.custoFisicoMaxM2) > 0 && k.custoPrevistoM2 > num(obra.fin.custoFisicoMaxM2)) {
    add(3, 'Financeiro', 'Custo por m² acima do limite',
      `Previsto ${fmtMoney(k.custoPrevistoM2)}/m² contra o teto de ${fmtMoney(obra.fin.custoFisicoMaxM2)}/m².`,
      'Revisar escopo, aditivos e compras.', { view: 'painel' });
  }
  if (k.margem !== null && k.margem < num(obra.fin.margemDesejada)) {
    add(2, 'Financeiro', 'Margem abaixo da desejada',
      `Projetada ${fmtPct(k.margem)} contra ${fmtPct(obra.fin.margemDesejada)} desejados.`,
      'Rever custos previstos ou o valor de venda.', { view: 'painel' });
  }
  if (k.etapasTotal > 0 && k.desvioFisicoFinanceiro < -0.1) {
    add(2, 'Produção', 'Desembolso à frente do avanço físico',
      `Físico ${fmtPct(k.progressoFisico, 0)} contra ${fmtPct(k.progressoFinanceiro, 0)} financeiro.`,
      'Conferir adiantamentos e compras antecipadas.', { view: 'curva' });
  }

  /* Duplicidade suspeita */
  const chave = new Map();
  obra.lancamentos.forEach((l) => {
    const k2 = [l.data, norm(l.fornecedor), round2(lancamentoTotal(l))].join('|');
    if (!chave.has(k2)) chave.set(k2, []);
    chave.get(k2).push(l);
  });
  chave.forEach((ls) => {
    if (ls.length > 1 && lancamentoTotal(ls[0]) > 0) {
      add(1, 'Lançamentos', 'Possível lançamento duplicado',
        `${ls.length} lançamentos iguais de ${fmtMoney(lancamentoTotal(ls[0]))} em ${fmtData(ls[0].data)} (${ls[0].fornecedor || 'sem fornecedor'}).`,
        'Conferir e excluir o repetido.', { view: 'lancamentos', id: ls[0].id });
    }
  });

  /* Cadastro incompleto */
  if (!obra.cronograma.length) {
    add(1, 'Cronograma', 'Obra sem cronograma',
      'Sem etapas cadastradas não há curva S nem controle de prazo.',
      'Gerar o cronograma padrão.', { view: 'cronograma' });
  }
  if (!obra.contratos.length) {
    add(1, 'Contratos', 'Obra sem contrato cadastrado',
      'O controle de saldo contratual depende do contrato principal.',
      'Cadastrar a empreitada principal.', { view: 'contratos' });
  }

  return out.sort((a, b) => b.sev - a.sev || a.modulo.localeCompare(b.modulo));
}

/* ------------------------------------------------- CARTEIRA (todas) */
/* Fluxo de caixa consolidado da carteira: soma mês a mês de todas as obras. */
function fluxoCarteira(estado) {
  const porMes = new Map();
  estado.obras.forEach((o) => {
    fluxoCaixa(o).forEach((m) => {
      const a = porMes.get(m.ym) || { ym: m.ym, entradas: 0, medicoes: 0, outras: 0, saidas: 0 };
      a.entradas += m.entradas;
      a.medicoes += m.medicoes;
      a.outras += m.outras;
      a.saidas += m.saidas;
      porMes.set(m.ym, a);
    });
  });
  const meses = [...porMes.values()].sort((a, b) => (a.ym < b.ym ? -1 : 1));
  let acumulado = estado.obras.reduce((s, o) => s + num(o.fin.saldoInicial), 0);
  return meses.map((m) => {
    m.saldoMes = m.entradas - m.saidas;
    acumulado += m.saldoMes;
    m.acumulado = acumulado;
    return m;
  });
}

function kpisCarteira(estado) {
  const obras = estado.obras;
  const ativas = obras.filter((o) => o.status !== 'Concluída');
  let recebido = 0, pago = 0, contratado = 0, previsto = 0, area = 0, venda = 0, custoComTerreno = 0;
  let progressoSoma = 0, comCronograma = 0;
  obras.forEach((o) => {
    const k = kpisObra(o);
    recebido += k.recebido; pago += k.totalPago; contratado += k.contratado;
    previsto += k.custoPrevisto; area += k.area; venda += k.venda;
    custoComTerreno += k.custoComTerreno;
    if (k.etapasTotal) { progressoSoma += k.progressoFisico; comCronograma++; }
  });
  const alertas = obras.flatMap((o) => alertasObra(o));
  return {
    obras: obras.length,
    ativas: ativas.length,
    concluidas: obras.filter((o) => o.status === 'Concluída').length,
    recebido, pago, contratado, previsto, area, venda,
    saldoCaixa: obras.reduce((s, o) => s + kpisObra(o).saldoCaixa, 0),
    custoMedioM2: area > 0 ? pago / area : 0,
    custoPrevistoM2: area > 0 ? previsto / area : 0,
    margem: venda > 0 ? (venda - custoComTerreno) / venda : null,
    resultado: venda > 0 ? venda - custoComTerreno : null,
    progressoMedio: comCronograma ? progressoSoma / comCronograma : 0,
    alertas,
    criticos: alertas.filter((a) => a.sev === 3).length,
    atencao: alertas.filter((a) => a.sev === 2).length
  };
}

export {
  contratoValor,
  contratoTotalAutorizado,
  contratoTotalPago,
  contratoSaldo,
  basesContratuais,
  medicaoLiquido,
  medicaoSaldoContratual,
  medicaoAlerta,
  recebimentoLiquido,
  recebimentoDiferenca,
  lancamentoTotal,
  lancamentosDoMaterial,
  materialCalc,
  etapaCalc,
  pesosCronograma,
  competenciasObra,
  fluxoCaixa,
  kpisObra,
  fracaoPrevista,
  fracaoRealizada,
  curvaS,
  alertasObra,
  fluxoCarteira,
  kpisCarteira
};
