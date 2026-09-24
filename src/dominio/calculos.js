/**
 * calculos.js — Regras de negócio: todo cálculo do sistema vive aqui, sem tocar em DOM.
 */
import { addMeses, capitalizarNome, competencia, diasEntre, fimDoMes, fmtData, fmtMoney, fmtNum, fmtPct, hojeISO, inicioDoMes, isISO, norm, num, round2, SITUACOES_MANUAIS_CONTRATO } from '../nucleo/base.js';

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

/* ============================================================
   SITUAÇÃO CALCULADA e INDICADORES por código-base — tela nova de
   Contratos e aditivos. Antes a situação era um campo digitado (podia
   contradizer as datas) e "pago" e "executado" mostravam quase o mesmo
   número. Aqui os dois saem separados e a situação nunca é escrita à mão,
   a não ser Paralisado/Rescindido (com motivo).
   ============================================================ */
const EPS_CONTRATO = 0.01;

/* Fim de prazo vigente: o previsto do contrato principal, estendido pelo
   aditivo de prazo APROVADO mais distante (novoPrazoAditivo). Proposto ou
   recusado não muda o prazo — só o aprovado vale. */
function contratoFimVigente(registros) {
  const principal = registros.find((c) => c.registro === 'Contrato') || registros[0] || {};
  let fim = isISO(principal.fimPrevisto) ? principal.fimPrevisto : '';
  registros.forEach((a) => {
    if (a.registro !== 'Aditivo' || a.status === 'Cancelado') return;
    if (a.tipoAditivo === 'prazo' && (a.statusAditivo || 'aprovado') === 'aprovado' && isISO(a.novoPrazoAditivo)) {
      if (!fim || a.novoPrazoAditivo > fim) fim = a.novoPrazoAditivo;
    }
  });
  return fim;
}

/* Indicadores de um código-base: autorizado, medido, pago, retido,
   a_pagar_agora e a_medir — uma função só, usada aqui, no Painel e em
   Prestadores.
   autorizado difere de contratoTotalAutorizado (que soma tudo não
   cancelado — a conta antiga, conferida contra a planilha original em
   tests/planilha.test.js): aqui só entra aditivo com statusAditivo
   'aprovado' (o padrão, para não mudar o histórico) e supressão SUBTRAI. */
function indicadoresContrato(obra, codigoBase) {
  const registros = obra.contratos.filter((c) => (c.codigoBase || c.codigo) === codigoBase);
  const principal = registros.find((c) => c.registro === 'Contrato') || registros[0] || {};
  let autorizado = 0;
  registros.forEach((c) => {
    if (c.status === 'Cancelado') return;
    if (c.registro !== 'Aditivo') { autorizado += contratoValor(c); return; }
    if ((c.statusAditivo || 'aprovado') !== 'aprovado') return;
    /* aditivo de prazo muda o fim, não o valor */
    if (c.tipoAditivo === 'prazo') return;
    autorizado += c.tipoAditivo === 'supressao' ? -contratoValor(c) : contratoValor(c);
  });
  const medicoesBase = obra.medicoes.filter((m) => m.contratoBase === codigoBase && m.status !== 'Cancelado');
  const medido = medicoesBase.reduce((s, m) => s + medicaoLiquido(m), 0);
  const pago = medicoesBase.reduce((s, m) => s + num(m.valorPago), 0);
  const retido = round2(medido * Math.min(1, Math.max(0, num(principal.retencaoPct))));
  return {
    codigoBase,
    autorizado: round2(autorizado),
    medido: round2(medido),
    pago: round2(pago),
    retido,
    aPagarAgora: Math.max(0, round2(medido - retido - pago)),
    aMedir: Math.max(0, round2(autorizado - medido))
  };
}

/* Composição do autorizado de um código-base: o contrato e o efeito de
   cada aditivo, com sinal. Acréscimo aprovado soma, supressão aprovada
   subtrai, aditivo de prazo não mexe no valor (só no fim). Proposto ainda
   não conta: fica em `pendentes`, com o efeito que teria se aprovado.
   principal + totalAcrescimos − totalSupressoes = indicadoresContrato().autorizado */
function composicaoContrato(obra, codigoBase) {
  const registros = obra.contratos.filter((c) => (c.codigoBase || c.codigo) === codigoBase);
  const principal = registros.find((c) => c.registro === 'Contrato') || registros[0] || {};
  const efeito = (a) => {
    if (a.tipoAditivo === 'prazo') return 0;
    return a.tipoAditivo === 'supressao' ? -contratoValor(a) : contratoValor(a);
  };
  const out = {
    principal: principal.status === 'Cancelado' ? 0 : contratoValor(principal),
    acrescimos: [], supressoes: [], prazos: [], pendentes: [],
    totalAcrescimos: 0, totalSupressoes: 0, pendentesValor: 0
  };
  registros.forEach((a) => {
    if (a.registro !== 'Aditivo' || a.status === 'Cancelado') return;
    const st = a.statusAditivo || 'aprovado';
    const item = { registro: a, valor: efeito(a) };
    if (st === 'proposto') { out.pendentes.push(item); out.pendentesValor += item.valor; return; }
    if (st !== 'aprovado') return;
    if (a.tipoAditivo === 'prazo') out.prazos.push(item);
    else if (a.tipoAditivo === 'supressao') { out.supressoes.push(item); out.totalSupressoes -= item.valor; }
    else { out.acrescimos.push(item); out.totalAcrescimos += item.valor; }
  });
  out.totalAcrescimos = round2(out.totalAcrescimos);
  out.totalSupressoes = round2(out.totalSupressoes);
  out.pendentesValor = round2(out.pendentesValor);
  return out;
}

/* Situação do contrato — sempre calculada. Ordem de decisão:
     1. override manual (Paralisado / Rescindido), com motivo;
     2. tudo medido: paga (Encerrado) ou falta pagar (Medido 100% · a pagar);
     3. ainda não chegou o início (Não iniciado);
     4. já chegou o início e nada foi medido (Não iniciado · atrasado);
     5. passou do fim vigente sem medir tudo (Atrasado N dias);
     6. caso contrário, Em andamento. */
function contratoSituacao(obra, codigoBase, hoje = hojeISO()) {
  const registros = obra.contratos.filter((c) => (c.codigoBase || c.codigo) === codigoBase);
  const principal = registros.find((c) => c.registro === 'Contrato') || registros[0] || {};

  if (SITUACOES_MANUAIS_CONTRATO.includes(principal.situacaoManual)) {
    return {
      texto: principal.situacaoManual,
      chave: principal.situacaoManual === 'Paralisado' ? 'paralisado' : 'rescindido',
      atrasoDias: 0,
      motivo: principal.motivoSituacaoManual || ''
    };
  }

  const ind = indicadoresContrato(obra, codigoBase);
  const inicio = principal.inicioPrevisto;
  const fim = contratoFimVigente(registros);
  const completo = ind.autorizado > EPS_CONTRATO && ind.medido >= ind.autorizado - EPS_CONTRATO;

  if (completo) {
    if (ind.pago >= ind.medido - ind.retido - EPS_CONTRATO) {
      return { texto: 'Encerrado', chave: 'encerrado', atrasoDias: 0, motivo: '' };
    }
    return { texto: 'Medido 100% · a pagar', chave: 'a-pagar', atrasoDias: 0, motivo: '' };
  }
  if (isISO(inicio) && hoje < inicio) {
    return { texto: 'Não iniciado', chave: 'nao-iniciado', atrasoDias: 0, motivo: '' };
  }
  if (isISO(inicio) && hoje >= inicio && ind.medido <= EPS_CONTRATO) {
    return { texto: 'Não iniciado · atrasado', chave: 'nao-iniciado-atrasado', atrasoDias: 0, motivo: '' };
  }
  if (isISO(fim) && hoje > fim) {
    const dias = diasEntre(fim, hoje);
    return { texto: `Atrasado ${dias} dias`, chave: 'atrasado', atrasoDias: dias, motivo: '' };
  }
  return { texto: 'Em andamento', chave: 'em-andamento', atrasoDias: 0, motivo: '' };
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
  /* a retenção não é falta de pagamento: fica presa até a entrega */
  if (medicaoAPagar(obra, m) > 0.005 && m.status === 'Pago') return 'PAGAMENTO INCOMPLETO';
  return 'OK';
}

/* Retenção do contrato (migração 0013): fração de cada medição que fica
   presa até a entrega. Vem do contrato principal do código-base. */
function retencaoDoContrato(obra, codigoBase) {
  const registros = obra.contratos.filter((c) => (c.codigoBase || c.codigo) === codigoBase);
  const principal = registros.find((c) => c.registro === 'Contrato') || registros[0];
  return principal ? Math.min(1, Math.max(0, num(principal.retencaoPct))) : 0;
}

function medicaoRetencao(obra, m) {
  return round2(medicaoLiquido(m) * retencaoDoContrato(obra, m.contratoBase));
}

/* O que ainda falta pagar de uma medição: líquido − retenção − pago.
   Toda tela, alerta e soma de "a pagar" de medição sai daqui. */
function medicaoAPagar(obra, m) {
  if (m.status === 'Cancelado') return 0;
  return Math.max(0, round2(medicaoLiquido(m) - medicaoRetencao(obra, m) - num(m.valorPago)));
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
      .reduce((s, m) => s + medicaoAPagar(obra, m), 0);
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
    .reduce((s, m) => s + medicaoAPagar(obra, m), 0);

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
        `Falta ${fmtMoney(medicaoAPagar(obra, m))}.`,
        'Ajustar status para Parcial ou completar o pagamento.', { view: 'medicoes', id: m.id });
    }
    const pendente = medicaoAPagar(obra, m);
    if (pendente > 0.005 && isISO(m.data) && diasEntre(m.data, hoje) > 15) {
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

/* Onde a obra está na implantação: cada passo tem dado ou não.
   Alimenta a bolinha da rail e o cartão "Implantação da obra" no Painel.
   A ordem é a história do sistema: planejar → executar → acompanhar. */
function implantacaoObra(obra) {
  const o = obra || {};
  const fin = o.fin || {};
  /* preço de empreitada nasce com um padrão; área, financiado e venda nascem
     zerados — então são o sinal real de "a configuração foi preenchida". */
  const temConfig =
    num(o.areaConstruida) > 0 || num(fin.valorFinanciado) > 0 || num(fin.valorVenda) > 0;
  const passos = [
    {
      v: 'obra-config', fase: 'planejar', rotulo: 'Configurar a obra',
      dica: 'Área, preço de empreitada por m², financiamento e margem alvo.',
      feito: temConfig,
    },
    {
      v: 'contratos', fase: 'planejar', rotulo: 'Cadastrar o contrato principal',
      dica: 'A empreitada e os subcontratos, com aditivos.',
      feito: (o.contratos || []).length > 0,
    },
    {
      v: 'cronograma', fase: 'planejar', rotulo: 'Montar o cronograma',
      dica: 'Etapas com peso e prazo — é o que mede o avanço físico.',
      feito: (o.cronograma || []).length > 0,
    },
    {
      v: 'materiais', fase: 'planejar', rotulo: 'Planejar os materiais',
      dica: 'O que comprar por etapa e quando. Opcional em obra pequena.',
      feito: (o.materiais || []).length > 0, opcional: true,
    },
    {
      v: 'medicoes', fase: 'executar', rotulo: 'Lançar a primeira medição',
      dica: 'Medir e pagar o prestador conforme o contrato.',
      feito: (o.medicoes || []).length > 0,
    },
    {
      v: 'recebimentos', fase: 'executar', rotulo: 'Registrar um recebimento',
      dica: 'Parcela da CAIXA, do cliente ou de recursos próprios.',
      feito: (o.recebimentos || []).length > 0,
    },
    {
      v: 'lancamentos', fase: 'executar', rotulo: 'Lançar uma compra',
      dica: 'Material, taxa, honorário — tudo que sai sem medição.',
      feito: (o.lancamentos || []).length > 0,
    },
    {
      v: 'diario', fase: 'executar', rotulo: 'Abrir o diário de obra',
      dica: 'Visita, clima, efetivo e fotos do andamento.',
      feito: (o.diario || []).length > 0, opcional: true,
    },
  ];
  const obrig = passos.filter((p) => !p.opcional);
  const feitosObrig = obrig.filter((p) => p.feito).length;
  const feitos = passos.filter((p) => p.feito).length;
  const montada = passos
    .filter((p) => p.fase === 'planejar' && !p.opcional)
    .every((p) => p.feito);
  return {
    passos,
    feitos,
    total: passos.length,
    feitosObrig,
    totalObrig: obrig.length,
    pct: obrig.length ? feitosObrig / obrig.length : 1,
    montada,
    completa: feitos === passos.length,
  };
}

function kpisCarteira(estado) {
  /* Delega a cada função de indicador: a carteira não tem conta própria.
     Assim o KPI, a linha de total e qualquer outra tela veem o mesmo número. */
  const obras = estado.obras;
  let contratado = 0, previsto = 0, area = 0;
  obras.forEach((o) => {
    const k = kpisObra(o);
    contratado += k.contratado;
    previsto += k.custoPrevisto;
    area += k.area;
  });
  const caixa = caixaCarteira(obras);
  const res = resultadoCarteira(obras);
  const pend = pendenciasCarteira(obras);
  const avanco = avancoCarteira(obras);
  return {
    obras: obras.length,
    ativas: obras.filter((o) => o.status !== 'Concluída').length,
    concluidas: obras.filter((o) => o.status === 'Concluída').length,
    recebido: caixa.recebido,
    pago: caixa.pago,
    saldoInicial: caixa.saldoInicial,
    saldoCaixa: caixa.saldo,
    contratado, previsto, area,
    venda: res.venda,
    custoMedioM2: area > 0 ? caixa.pago / area : 0,
    custoPrevistoM2: area > 0 ? previsto / area : 0,
    margem: res.margem,
    resultado: res.resultado,
    progressoMedio: avanco.realizado,
    alertas: obras.flatMap((o) => alertasObra(o)),
    criticos: pend.criticas,
    atencao: pend.atencao,
    pendencias: pend.total
  };
}

/* =====================================================================
   INDICADORES DA CARTEIRA — uma função por indicador.

   Regra: um número que aparece em mais de um lugar sai de UMA função daqui,
   e toda tela a consome. Todas recebem uma lista de obras — a carteira
   inteira ou só as visíveis num filtro — para que o total de uma tabela
   filtrada use exatamente a mesma conta do KPI.
   ===================================================================== */

/* Resultado projetado: SÓ obras com valor de venda informado.
   Obra sem valor de venda não é prejuízo, é cadastro incompleto: somar o
   custo dela sem nenhuma receita do outro lado inventa um prejuízo que não
   existe. Ela sai da conta e é contada à parte (obrasSemVenda). */
function resultadoCarteira(obras) {
  let venda = 0, custo = 0, comVenda = 0;
  obras.forEach((o) => {
    const k = kpisObra(o);
    if (k.venda > 0) {
      venda += k.venda;
      custo += k.custoComTerreno;
      comVenda++;
    }
  });
  return {
    resultado: comVenda ? venda - custo : null,
    margem: venda > 0 ? (venda - custo) / venda : null,
    venda, custo,
    obrasComVenda: comVenda,
    obrasSemVenda: obras.length - comVenda
  };
}

/* Tipo de cada pendência, pelo módulo que a gerou. É o agrupamento do
   painel "Precisa de ação" e o detalhamento do KPI. */
const TIPO_PENDENCIA = {
  Contratos: 'contrato', 'Medições': 'contrato',
  Cronograma: 'prazo',
  Materiais: 'material',
  Recebimentos: 'financeiro', Financeiro: 'financeiro', 'Produção': 'financeiro', 'Lançamentos': 'financeiro'
};

/* Pendência = alerta que pede ação: severidade 2 (atenção) ou 3 (crítico).
   Severidade 1 é aviso ("material necessário em 5 dias"): é informação,
   não entra na contagem. Antes a tela mostrava 10, 17 e 12 para a mesma
   carteira porque cada lugar contava um recorte diferente. */
function pendenciasObra(obra) {
  const todos = alertasObra(obra);
  const itens = todos
    .filter((a) => a.sev >= 2)
    .map((a) => ({ ...a, tipo: TIPO_PENDENCIA[a.modulo] || 'financeiro' }))
    .sort((a, b) => b.sev - a.sev);
  const porTipo = { contrato: 0, prazo: 0, material: 0, financeiro: 0 };
  const porView = {};
  itens.forEach((a) => {
    porTipo[a.tipo]++;
    const v = a.ref && a.ref.view;
    if (v) porView[v] = (porView[v] || 0) + 1;
  });
  return {
    total: itens.length,
    criticas: itens.filter((a) => a.sev === 3).length,
    atencao: itens.filter((a) => a.sev === 2).length,
    avisos: todos.length - itens.length,
    porTipo, porView, itens
  };
}

function pendenciasCarteira(obras) {
  const porObra = obras.map((o) => pendenciasObra(o));
  const porTipo = { contrato: 0, prazo: 0, material: 0, financeiro: 0 };
  const porView = {};
  porObra.forEach((p) => {
    Object.keys(porTipo).forEach((t) => { porTipo[t] += p.porTipo[t]; });
    Object.entries(p.porView).forEach(([v, n]) => { porView[v] = (porView[v] || 0) + n; });
  });
  const soma = (c) => porObra.reduce((s, p) => s + p[c], 0);
  return {
    total: soma('total'), criticas: soma('criticas'), atencao: soma('atencao'), avisos: soma('avisos'),
    porTipo, porView,
    itens: porObra.flatMap((p) => p.itens).sort((a, b) => b.sev - a.sev)
  };
}

/* Caixa: saldo inicial + recebido − pago, com as três parcelas expostas
   (a legenda antiga mostrava só recebido e pago, e a conta não fechava).
   Projeção: saldo + o que entra − o que sai até `dias` à frente.
   - entra: parcelas não recebidas com data prevista até o limite
     (as atrasadas também: continuam a receber);
   - sai: medições em aberto (já devidas) + materiais a comprar com data
     necessária até o limite. */
function caixaCarteira(obras, hoje = hojeISO(), dias = 30) {
  const limite = addDiasISO(hoje, dias);
  let saldoInicial = 0, recebido = 0, pago = 0, aReceber = 0, aPagar = 0;
  obras.forEach((o) => {
    const k = kpisObra(o);
    saldoInicial += k.saldoInicial;
    recebido += k.recebido;
    pago += k.totalPago;
    o.recebimentos.forEach((r) => {
      if (r.status === 'Recebido' || r.status === 'Cancelado') return;
      if (isISO(r.dataPrevista) && r.dataPrevista <= limite) {
        aReceber += recebimentoLiquido(r) || num(r.valorPrevisto);
      }
    });
    aPagar += k.medicoesNaoPagas;
    o.materiais.forEach((m) => {
      if (m.status === 'Cancelado' || !isISO(m.dataNecessaria) || m.dataNecessaria > limite) return;
      aPagar += materialCalc(o, m).saldoValor;
    });
  });
  const saldo = saldoInicial + recebido - pago;
  return { saldoInicial, recebido, pago, saldo, aReceber, aPagar, projecao: saldo + aReceber - aPagar, dias };
}

/* Avanço físico previsto de uma obra numa data, pelo cronograma — a mesma
   conta da curva S (fracaoPrevista, ponderada pelo peso de cada etapa). */
function avancoPrevistoObra(obra, data = hojeISO()) {
  if (!obra.cronograma.length) return 0;
  const pesos = pesosCronograma(obra);
  return obra.cronograma.reduce((s, e) => s + (pesos.get(e.id) || 0) * fracaoPrevista(e, data), 0);
}

/* Avanço da carteira: média PONDERADA pelo custo previsto de cada obra.
   Uma obra de R$ 300 mil a 80% pesa mais que uma de R$ 20 mil a 0% — a
   média simples tratava as duas igual. Obra sem cronograma ou sem custo
   previsto não tem avanço mensurável: fica fora e é contada em `fora`. */
function avancoCarteira(obras, hoje = hojeISO()) {
  let peso = 0, real = 0, prev = 0, dentro = 0;
  obras.forEach((o) => {
    const k = kpisObra(o);
    if (!o.cronograma.length || !(k.custoPrevisto > 0)) return;
    peso += k.custoPrevisto;
    real += k.custoPrevisto * k.progressoFisico;
    prev += k.custoPrevisto * avancoPrevistoObra(o, hoje);
    dentro++;
  });
  const realizado = peso > 0 ? real / peso : 0;
  const previsto = peso > 0 ? prev / peso : 0;
  return { realizado, previsto, desvio: realizado - previsto, obras: dentro, fora: obras.length - dentro };
}

/* Prazo: fim planejado da obra e quantos dias ela está atrasada.
   O atraso é o da etapa não concluída mais atrasada — é o mínimo que a
   obra vai atrasar, já que ela só termina quando essa etapa terminar. */
function prazoObra(obra, hoje = hojeISO()) {
  const fins = obra.cronograma.map((e) => e.fimPrevisto).filter(isISO).sort();
  const fimPrevisto = isISO(obra.previsaoConclusao) ? obra.previsaoConclusao : (fins[fins.length - 1] || '');
  const atraso = obra.cronograma.reduce((mx, e) => Math.max(mx, etapaCalc(e, hoje).atraso), 0);
  return { fimPrevisto, desvioDias: atraso };
}

/* Estouro de custo pelos contratos: quanto se MEDIU acima do autorizado,
   em % do autorizado. "Ultrapassado" é mais grave: já se PAGOU acima. */
function estouroContratos(obra) {
  let autorizado = 0, acima = 0, ultrapassado = false;
  basesContratuais(obra).forEach((b) => {
    if (!(b.autorizado > 0)) return;
    autorizado += b.autorizado;
    acima += Math.max(0, b.medido - b.autorizado);
    if (b.pago - b.autorizado > 0.005) ultrapassado = true;
  });
  return { estouro: autorizado > 0 ? acima / autorizado : 0, ultrapassado };
}

/* Saúde da obra: um nível e um texto curto que diz POR QUÊ.
   Níveis, do pior para o melhor: critico, atencao, incompleta, ok.
   - prazo: atraso ≥ 30 dias é crítico; qualquer atraso é atenção;
   - custo: pago acima do contrato ou caixa negativo é crítico; medido
     acima do contrato é atenção ("Custo +8%");
   - sem cronograma ou sem custo previsto: "Configuração incompleta" —
     a menos que já haja um risco, que aparece primeiro. */
const ORDEM_SAUDE = { critico: 0, atencao: 1, incompleta: 2, ok: 3 };

function saudeObra(obra, hoje = hojeISO()) {
  const k = kpisObra(obra);
  const faltando = [];
  if (!obra.cronograma.length) faltando.push('cronograma');
  if (!(k.custoPrevisto > 0)) faltando.push('orçamento');

  const motivos = [];
  const p = prazoObra(obra, hoje);
  if (p.desvioDias > 0) {
    motivos.push({ tipo: 'prazo', nivel: p.desvioDias >= 30 ? 'critico' : 'atencao', texto: `Atrasada ${p.desvioDias}d` });
  }
  const c = estouroContratos(obra);
  if (c.ultrapassado || c.estouro > 0.0005) {
    const pct = Math.max(1, Math.round(c.estouro * 100));
    motivos.push({ tipo: 'custo', nivel: c.ultrapassado ? 'critico' : 'atencao', texto: `Custo +${pct}%` });
  }
  if (k.saldoCaixa < -0.005) motivos.push({ tipo: 'custo', nivel: 'critico', texto: 'Caixa negativo' });

  if (!motivos.length) {
    if (faltando.length) return { nivel: 'incompleta', ordem: ORDEM_SAUDE.incompleta, texto: 'Configuração incompleta', motivos, faltando, prazo: p };
    return { nivel: 'ok', ordem: ORDEM_SAUDE.ok, texto: obra.status === 'Concluída' ? 'Concluída' : 'No prazo', motivos, faltando, prazo: p };
  }
  motivos.sort((a, b) => ORDEM_SAUDE[a.nivel] - ORDEM_SAUDE[b.nivel] || (a.tipo === 'prazo' ? -1 : 1));
  const nivel = motivos[0].nivel;
  const texto = motivos[0].texto + (motivos.length > 1 ? ` · +${motivos.length - 1}` : '');
  return { nivel, ordem: ORDEM_SAUDE[nivel], texto, motivos, faltando, prazo: p };
}

/* Custo: realizado (pago) sobre o orçado (custo previsto) — a coluna Custo
   da carteira e a linha de total saem daqui. */
function custoCarteira(obras) {
  let realizado = 0, orcado = 0;
  obras.forEach((o) => {
    const k = kpisObra(o);
    realizado += k.totalPago;
    orcado += k.custoPrevisto;
  });
  return { realizado, orcado, consumido: orcado > 0 ? realizado / orcado : null };
}

/* Obras em risco: nível crítico ou atenção, separando o motivo. */
function riscoCarteira(obras, hoje = hojeISO()) {
  const s = obras.map((o) => saudeObra(o, hoje));
  const risco = s.filter((x) => x.nivel === 'critico' || x.nivel === 'atencao');
  return {
    total: risco.length,
    de: obras.length,
    prazo: risco.filter((x) => x.motivos.some((m) => m.tipo === 'prazo')).length,
    custo: risco.filter((x) => x.motivos.some((m) => m.tipo === 'custo')).length,
    incompletas: s.filter((x) => x.faltando.length).length
  };
}

/* Próximos N dias: o que vence ou acontece, em ordem de data. */
function agendaCarteira(obras, hoje = hojeISO(), dias = 14) {
  const limite = addDiasISO(hoje, dias);
  const dentro = (d) => isISO(d) && d >= hoje && d <= limite;
  const out = [];
  obras.forEach((o) => {
    const base = { obraId: o.id, obraNome: o.nome };
    o.recebimentos.forEach((r) => {
      if (r.status === 'Recebido' || r.status === 'Cancelado' || !dentro(r.dataPrevista)) return;
      out.push({ ...base, data: r.dataPrevista, tipo: 'recebimento', titulo: r.etapaPci || `Parcela ${r.numeroMedicao || ''}`.trim(), valor: num(r.valorPrevisto), view: 'recebimentos' });
    });
    o.materiais.forEach((m) => {
      if (m.status === 'Cancelado' || !dentro(m.dataNecessaria)) return;
      const c = materialCalc(o, m);
      if (!(c.saldo > 0)) return;
      out.push({ ...base, data: m.dataNecessaria, tipo: 'material', titulo: `Comprar ${m.material || 'material'}`, valor: c.saldoValor, view: 'materiais' });
    });
    o.cronograma.forEach((e) => {
      if (num(e.progresso) >= 1 || !dentro(e.fimPrevisto)) return;
      out.push({ ...base, data: e.fimPrevisto, tipo: 'etapa', titulo: `Entrega: ${e.etapa || 'etapa'}`, valor: null, view: 'cronograma' });
    });
    o.contratos.forEach((c) => {
      if (c.status === 'Concluído' || c.status === 'Cancelado' || !dentro(c.fimPrevisto)) return;
      out.push({ ...base, data: c.fimPrevisto, tipo: 'contrato', titulo: `Fim do contrato ${c.codigo || ''}`.trim(), valor: null, view: 'contratos' });
    });
  });
  return out.sort((a, b) => a.data.localeCompare(b.data) || a.obraNome.localeCompare(b.obraNome));
}

/* Curva S da carteira: média das curvas das obras, ponderada pelo custo
   previsto (o mesmo peso do avanço da carteira). Antes do início de uma
   obra ela conta como 0; depois do último mês dela, mantém o último valor. */
function curvaSCarteira(obras) {
  const hoje = hojeISO();
  const series = [];
  obras.forEach((o) => {
    const k = kpisObra(o);
    if (!o.cronograma.length || !(k.custoPrevisto > 0)) return;
    const c = curvaS(o);
    if (c.length) series.push({ peso: k.custoPrevisto, c });
  });
  if (!series.length) return [];
  const meses = [...new Set(series.flatMap((s) => s.c.map((p) => p.ym)))].sort();
  const pesoTotal = series.reduce((s, x) => s + x.peso, 0);
  const valorEm = (c, ym, campo) => {
    if (ym < c[0].ym) return 0;
    let ultimo = 0;
    for (const p of c) {
      if (p.ym > ym) break;
      if (p[campo] !== null && p[campo] !== undefined) ultimo = p[campo];
    }
    return ultimo;
  };
  const mesHoje = competencia(hoje);
  return meses.map((ym) => {
    const futuro = ym > mesHoje;
    const media = (campo) => series.reduce((s, x) => s + x.peso * valorEm(x.c, ym, campo), 0) / pesoTotal;
    const fisicoPrevisto = media('fisicoPrevisto');
    const fisicoRealizado = futuro ? null : media('fisicoRealizado');
    return {
      ym, futuro,
      fisicoPrevisto,
      fisicoRealizado,
      financeiroPrevisto: fisicoPrevisto,
      financeiroRealizado: futuro ? null : media('financeiroRealizado'),
      desvio: fisicoRealizado === null ? null : fisicoRealizado - fisicoPrevisto
    };
  });
}

/* =====================================================================
   PRESTADORES — vínculo, números calculados e normalização do cadastro.
   ===================================================================== */

/* Vínculo de um contrato ou lançamento com um prestador.
   Pelo id quando ele existe (prestadorId, migração 0011). Registro antigo,
   sem id, cai no nome digitado — como a tela fazia —, mas só se o id
   estiver vazio: registro já ligado a OUTRO prestador nunca casa pelo nome. */
function ligadoAoPrestador(p, prestadorId, nomeTexto) {
  if (prestadorId) return prestadorId === p.id;
  const t = norm(nomeTexto);
  if (!t) return false;
  return t === norm(p.nome) || (!!p.apelido && t === norm(p.apelido));
}

/* Contratado, pago, a pagar e obras de um prestador — sempre calculados,
   nunca digitados.
   - contratado: contratos ligados a ele (fora os cancelados). Um aditivo
     sem prestador próprio herda o do seu código-base.
   - pago: medições pagas desses contratos + lançamentos ligados a ele
     (diária, serviço avulso pago direto). Antes a tela ignorava os
     lançamentos, e quem recebia por diária aparecia com R$ 0.
   - contratado, aPagarAgora e aMedir: a soma de indicadoresContrato dos
     contratos dele — a MESMA conta da tela de Contratos. aPagarAgora é o
     já medido e não pago (menos a retenção); aMedir, o que ainda vai virar
     conta. O que foi pago por lançamento não abate contrato: não passou
     por medição. */
function resumoPrestador(estado, p) {
  let contratado = 0, pagoMedicoes = 0, pagoLancamentos = 0, aPagarAgora = 0, aMedir = 0;
  let qtdContratos = 0, qtdMedicoesPagas = 0, qtdLancamentos = 0;
  const obras = [];
  const pagamentos = [];
  estado.obras.forEach((o) => {
    const proprios = o.contratos.filter((c) => ligadoAoPrestador(p, c.prestadorId, c.prestador));
    const bases = new Set(proprios.map((c) => c.codigoBase || c.codigo).filter(Boolean));
    const doPrestador = o.contratos.filter((c) =>
      proprios.includes(c) || (!c.prestadorId && !String(c.prestador || '').trim() && bases.has(c.codigoBase || c.codigo)));
    const inds = [...bases].map((b) => indicadoresContrato(o, b));
    const ctObra = inds.reduce((s, i) => s + i.autorizado, 0);
    const apObra = inds.reduce((s, i) => s + i.aPagarAgora, 0);
    const amObra = inds.reduce((s, i) => s + i.aMedir, 0);

    let pmObra = 0;
    o.medicoes.forEach((m) => {
      if (!bases.has(m.contratoBase) || m.status === 'Cancelado') return;
      const pg = num(m.valorPago);
      pmObra += pg;
      if (pg > 0) {
        qtdMedicoesPagas++;
        pagamentos.push({ data: m.dataPagamento || m.data, valor: pg, origem: 'medicao', etapa: '',
          descricao: `Medição ${m.numero || ''} ${m.descricao || ''}`.replace(/\s+/g, ' ').trim(), obraId: o.id, obraNome: o.nome });
      }
    });

    const lancs = o.lancamentos.filter((l) => ligadoAoPrestador(p, l.prestadorId, l.fornecedor));
    let plObra = 0;
    lancs.forEach((l) => {
      const v = lancamentoTotal(l);
      plObra += v;
      qtdLancamentos++;
      pagamentos.push({ data: l.data, valor: v, origem: 'lancamento', etapa: l.etapa || '',
        descricao: l.descricao || l.tipo || 'Lançamento', obraId: o.id, obraNome: o.nome });
    });
    qtdContratos += doPrestador.filter((c) => c.status !== 'Cancelado').length;

    if (doPrestador.length || lancs.length) {
      obras.push({ obraId: o.id, obraNome: o.nome, contratado: ctObra, pago: pmObra + plObra,
        aPagarAgora: apObra, aMedir: amObra });
      contratado += ctObra;
      pagoMedicoes += pmObra;
      pagoLancamentos += plObra;
      aPagarAgora += apObra;
      aMedir += amObra;
    }
  });
  pagamentos.sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')));
  return {
    contratado, pago: pagoMedicoes + pagoLancamentos, pagoMedicoes, pagoLancamentos,
    aPagarAgora: round2(aPagarAgora), aMedir: round2(aMedir), obras, pagamentos,
    qtdContratos, qtdMedicoesPagas, qtdLancamentos,
    /* Sem contrato, "Contratado R$ 0" e "A pagar agora R$ 0" seriam falsos: não
       é que não haja nada a pagar, é que não há contrato para comparar. */
    temContrato: qtdContratos > 0,
    /* com qualquer vínculo, só pode ser arquivado — nunca apagado */
    temVinculo: obras.length > 0
  };
}

/* Totais de uma lista de prestadores — o rodapé da tela sai daqui.
   comContrato: quantos têm contrato. Se nenhum tem, o rodapé mostra "Sem
   contrato" em vez de um R$ 0 que parece dado. */
function totaisPrestadores(estado, prestadores) {
  return prestadores.reduce((t, p) => {
    const r = resumoPrestador(estado, p);
    t.contratado += r.contratado;
    t.pago += r.pago;
    t.aPagarAgora += r.aPagarAgora;
    t.aMedir += r.aMedir;
    if (r.temContrato) t.comContrato++;
    return t;
  }, { contratado: 0, pago: 0, aPagarAgora: 0, aMedir: 0, comContrato: 0 });
}

/* Prestadores ativos que receberam sem ter contrato ligado — pagos só por
   lançamento. É o aviso "N prestadores com pagamentos sem contrato". */
function prestadoresPagosSemContrato(estado) {
  return estado.prestadores
    .filter((p) => !p.arquivado)
    .map((p) => ({ p, r: resumoPrestador(estado, p) }))
    .filter(({ r }) => r.pago > 0.005 && !r.temContrato)
    .map(({ p, r }) => ({ id: p.id, nome: p.nome, pago: r.pago }));
}

/* Prévia do vínculo prestador×contrato/lançamento pelo nome digitado — Fase 1
   da tela nova de Contratos: liga o texto livre (contratos.prestador,
   lancamentos.fornecedor) ao cadastro antes de a seleção virar obrigatória.
   Só relata; NUNCA aplica — quem grava o prestadorId é a tela, depois de o
   usuário conferir "casou" / "ambíguo" / "sugerir criar". */
function previaVinculoPrestadores(estado) {
  const prestadores = estado.prestadores || [];
  const candidatos = (texto) => {
    const t = norm(texto);
    if (!t) return [];
    return prestadores.filter((p) => norm(p.nome) === t || (p.apelido && norm(p.apelido) === t));
  };

  const casaram = [], ambiguos = [], semCadastro = [];
  const registrar = (obra, tipo, item, texto) => {
    const cands = candidatos(texto);
    const base = {
      obraId: obra.id, obraNome: obra.nome, tipo, id: item.id,
      referencia: tipo === 'contrato' ? (item.codigo || item.escopo || '') : (item.descricao || ''),
      textoDigitado: texto
    };
    if (cands.length === 1) casaram.push({ ...base, prestadorId: cands[0].id, prestadorNome: cands[0].nome });
    else if (cands.length > 1) ambiguos.push({ ...base, candidatos: cands.map((c) => ({ id: c.id, nome: c.nome })) });
    else semCadastro.push(base);
  };

  (estado.obras || []).forEach((obra) => {
    (obra.contratos || []).forEach((c) => {
      if (c.prestadorId || !String(c.prestador || '').trim()) return;
      registrar(obra, 'contrato', c, c.prestador);
    });
    (obra.lancamentos || []).forEach((l) => {
      if (l.prestadorId || !String(l.fornecedor || '').trim()) return;
      registrar(obra, 'lancamento', l, l.fornecedor);
    });
  });

  return { casaram, ambiguos, semCadastro, total: casaram.length + ambiguos.length + semCadastro.length };
}

/* Avaliação do prestador: notas dadas ao concluir cada contrato dele.
   Nota do contrato = média dos critérios preenchidos (0 = não avaliado).
   Média do prestador = média das notas dos contratos avaliados. Sem
   nenhuma avaliação, a média é null — a tela deixa a célula vazia. */
const CRITERIOS_AVAL = [['avalPrazo', 'Prazo'], ['avalQualidade', 'Qualidade'], ['avalOrganizacao', 'Organização']];

function avaliacaoPrestador(estado, p) {
  const notas = [];
  const porCriterio = { avalPrazo: [], avalQualidade: [], avalOrganizacao: [] };
  estado.obras.forEach((o) => {
    o.contratos.forEach((c) => {
      if (!ligadoAoPrestador(p, c.prestadorId, c.prestador)) return;
      const dadas = CRITERIOS_AVAL.map(([k]) => num(c[k])).filter((v) => v >= 1 && v <= 5);
      if (!dadas.length) return;
      CRITERIOS_AVAL.forEach(([k]) => { const v = num(c[k]); if (v >= 1 && v <= 5) porCriterio[k].push(v); });
      notas.push({ contratoId: c.id, obraNome: o.nome, codigo: c.codigo, nota: dadas.reduce((s, v) => s + v, 0) / dadas.length });
    });
  });
  const media = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
  return {
    media: media(notas.map((n) => n.nota)),
    avaliacoes: notas.length,
    criterios: CRITERIOS_AVAL.map(([k, rotulo]) => ({ chave: k, rotulo, media: media(porCriterio[k]) })),
    notas
  };
}

/* Duplicidade no cadastro: mesmo WhatsApp (ou telefone) ou mesmo CPF/CNPJ
   de outro prestador. É aviso — dois irmãos podem dividir um celular. */
function duplicadosPrestador(estado, p) {
  const dig = (v) => String(v || '').replace(/\D/g, '');
  const tels = [dig(p.whatsapp), dig(p.telefone)].filter((t) => t.length >= 10);
  const doc = dig(p.documento);
  return estado.prestadores
    .filter((x) => x.id !== p.id)
    .map((x) => {
      const motivos = [];
      const deles = [dig(x.whatsapp), dig(x.telefone)].filter((t) => t.length >= 10);
      if (tels.some((t) => deles.includes(t))) motivos.push('mesmo telefone');
      if (doc && doc === dig(x.documento)) motivos.push('mesmo CPF/CNPJ');
      return motivos.length ? { id: x.id, nome: x.nome, arquivado: !!x.arquivado, motivos } : null;
    })
    .filter(Boolean);
}

/* Nomes em caixa alta e apelido misturado no nome ("WESLEY PINTOR").
   Sugere: nome com capitalização de gente ("Wesley"), o nome completo como
   apelido ("Wesley Pintor") e a especialidade reconhecida ("Pintor").
   Devolve null quando não há nada a sugerir. NUNCA aplica: quem aplica é a
   tela, depois de a pessoa conferir a prévia. */
/* capitalizarNome vem de nucleo/base.js — uma regra só para cadastro e exibição. */

function sugestaoNomePrestador(p, especialidades = []) {
  const nome = String(p.nome || '').trim().replace(/\s+/g, ' ');
  if (!nome) return null;
  const letras = nome.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, '');
  const caixaAlta = letras.length > 1 && letras === letras.toUpperCase() && letras !== letras.toLowerCase();

  /* especialidade no começo ou no fim do nome: "WESLEY PINTOR", "PEDREIRO JOÃO" */
  const palavras = nome.split(' ');
  let esp = '';
  let resto = palavras;
  const lista = especialidades.filter((e) => e && e !== 'Outro').sort((a, b) => b.split(' ').length - a.split(' ').length);
  for (const e of lista) {
    const pe = norm(e).split(' ');
    const n = pe.length;
    if (palavras.length <= n) continue;
    if (norm(palavras.slice(-n).join(' ')) === pe.join(' ')) { esp = e; resto = palavras.slice(0, -n); break; }
    if (norm(palavras.slice(0, n).join(' ')) === pe.join(' ')) { esp = e; resto = palavras.slice(n); break; }
  }
  if (!caixaAlta && !esp) return null;

  const depois = {
    nome: caixaAlta ? capitalizarNome(resto.join(' ')) : resto.join(' '),
    apelido: p.apelido || (esp ? (caixaAlta ? capitalizarNome(nome) : nome) : ''),
    especialidade: p.especialidade || esp
  };
  const antes = { nome: p.nome || '', apelido: p.apelido || '', especialidade: p.especialidade || '' };
  if (depois.nome === antes.nome && depois.apelido === antes.apelido && depois.especialidade === antes.especialidade) return null;
  return { id: p.id, antes, depois };
}

/* Soma de dias numa data AAAA-MM-DD, sem fuso: meio-dia UTC não vira dia. */
function addDiasISO(iso, n) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export {
  contratoValor,
  contratoTotalAutorizado,
  contratoTotalPago,
  contratoSaldo,
  basesContratuais,
  contratoFimVigente,
  indicadoresContrato,
  composicaoContrato,
  contratoSituacao,
  medicaoLiquido,
  medicaoSaldoContratual,
  medicaoAlerta,
  retencaoDoContrato,
  medicaoRetencao,
  medicaoAPagar,
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
  implantacaoObra,
  fluxoCarteira,
  kpisCarteira,
  resultadoCarteira,
  custoCarteira,
  pendenciasObra,
  pendenciasCarteira,
  caixaCarteira,
  avancoPrevistoObra,
  avancoCarteira,
  prazoObra,
  estouroContratos,
  saudeObra,
  riscoCarteira,
  agendaCarteira,
  curvaSCarteira,
  ORDEM_SAUDE,
  ligadoAoPrestador,
  resumoPrestador,
  totaisPrestadores,
  prestadoresPagosSemContrato,
  previaVinculoPrestadores,
  avaliacaoPrestador,
  duplicadosPrestador,
  CRITERIOS_AVAL,
  capitalizarNome,
  sugestaoNomePrestador
};
