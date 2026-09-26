/**
 * calculos.js — Regras de negócio: todo cálculo do sistema vive aqui, sem tocar em DOM.
 */
import { addDias, addMeses, capitalizarNome, competencia, diasEntre, fimDoMes, fmtData, fmtDataCurta, fmtMoney, fmtNum, fmtPct, hojeISO, inicioDoMes, isISO, norm, novoTratamento, num, round2, SITUACOES_MANUAIS_CONTRATO } from '../nucleo/base.js';

/* ------------------------------------------------------ CONTRATOS  */
/* Planilha: K = SE(valor informado > 0; valor informado; qtd × preço) */
function contratoValor(c) {
  const vi = num(c.valorInformado);
  return vi > 0 ? vi : num(c.quantidade) * num(c.precoUnitario);
}

/* Planilha: P = SOMASES(K; código-base; base; status; "<>Cancelado").
   A planilha não conhece supressão nem aditivo proposto; o sistema conhece,
   e o autorizado é UM número só em todas as telas: o de indicadoresContrato
   (supressão subtrai, proposto fica fora). Para a obra da planilha — só
   contratos e acréscimos aprovados — dá o mesmo valor. */
function contratoTotalAutorizado(obra, codigoBase) {
  if (!codigoBase) return 0;
  return indicadoresContrato(obra, codigoBase).autorizado;
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
    const comp = composicaoContrato(obra, g.base);
    return {
      ...g,
      prestador: (g.principal || g.registros[0] || {}).prestador || '',
      escopo: (g.principal || g.registros[0] || {}).escopo || '',
      status: (g.principal || g.registros[0] || {}).status || '',
      valorPrincipal: g.principal ? contratoValor(g.principal) : 0,
      /* efeito líquido dos aditivos aprovados: acréscimo − supressão */
      valorAditivos: round2(comp.totalAcrescimos - comp.totalSupressoes),
      /* aditivo proposto: aparece à parte, nunca no autorizado */
      pendente: comp.pendentesValor,
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
   autorizado: só entra aditivo com statusAditivo 'aprovado' (o padrão,
   para não mudar o histórico) e supressão SUBTRAI. É a fonte única do
   valor contratado — contratoTotalAutorizado, basesContratuais e
   kpisObra.contratado leem daqui. */
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
    /* referencia: contra o quê o atraso é medido — a tela escreve
       "vs. prazo do contrato", para não confundir com o do cronograma */
    return {
      texto: 'Não iniciado · atrasado',
      chave: 'nao-iniciado-atrasado',
      atrasoDias: 0,
      motivo: '',
      referencia: { tipo: 'inicio', data: inicio },
    };
  }
  if (isISO(fim) && hoje > fim) {
    const dias = diasEntre(fim, hoje);
    return {
      texto: `Atrasado ${dias} dias`,
      chave: 'atrasado',
      atrasoDias: dias,
      motivo: '',
      referencia: { tipo: 'fim', data: fim },
    };
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

/* Situação do pagamento de uma medição: 'cancelada', 'quitada',
   'parcial' (pagou parte, falta parte — o caso que some na lista) ou
   'aberta' (nada pago). */
function medicaoPagamento(obra, m) {
  if (m.status === 'Cancelado') return 'cancelada';
  const falta = medicaoAPagar(obra, m);
  if (falta <= 0.005) return 'quitada';
  return num(m.valorPago) > 0.005 ? 'parcial' : 'aberta';
}

/* Medições com algo a pagar: o total (a mesma soma da coluna A pagar,
   já sem a retenção) e a mais antiga, com a idade em dias — "R$ 8 mil
   a pagar" pesa diferente se a conta tem 3 ou 60 dias. */
function medicoesEmAberto(obra, hoje = hojeISO()) {
  const itens = obra.medicoes.filter((m) => medicaoAPagar(obra, m) > 0.005);
  const total = round2(itens.reduce((s, m) => s + medicaoAPagar(obra, m), 0));
  const datadas = itens.filter((m) => isISO(m.data)).sort((a, b) => (a.data < b.data ? -1 : 1));
  const antiga = datadas[0] || null;
  return {
    itens,
    total,
    maisAntiga: antiga ? { medicao: antiga, dias: Math.max(0, diasEntre(antiga.data, hoje)) } : null,
  };
}

/* Os totais da tela de Medições e os blocos do fim dela: medido líquido
   e pago (sem as canceladas), o a pagar por contrato e o medido × físico
   por contrato (medidoFisicoContrato), com quem está medido à frente. */
function resumoMedicoes(obra) {
  const ativas = obra.medicoes.filter((m) => m.status !== 'Cancelado');
  const bases = [...new Set(obra.contratos.map((c) => c.codigoBase).filter(Boolean))];
  const prestadorDe = (base) => {
    const c = obra.contratos.find((x) => x.codigoBase === base && x.registro === 'Contrato') ||
      obra.contratos.find((x) => x.codigoBase === base);
    return (c && c.prestador) || '';
  };
  return {
    n: ativas.length,
    medido: round2(ativas.reduce((s, m) => s + medicaoLiquido(m), 0)),
    pago: round2(ativas.reduce((s, m) => s + num(m.valorPago), 0)),
    aPagarPorContrato: bases
      .map((base) => ({
        base,
        prestador: prestadorDe(base),
        valor: round2(ativas.filter((m) => m.contratoBase === base).reduce((s, m) => s + medicaoAPagar(obra, m), 0)),
      }))
      .filter((x) => x.valor > 0.005)
      .sort((a, b) => b.valor - a.valor),
    medidoFisico: bases
      .map((base) => ({ base, prestador: prestadorDe(base), ...medidoFisicoContrato(obra, base) }))
      .filter((x) => x.medido !== undefined)
      .sort((a, b) => b.diferenca - a.diferenca),
  };
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
  /* Etapa do material já concluída no cronograma: a sobra do plano não
     trava mais obra nenhuma — o alerta se encerra sozinho. O saldo segue
     no custo previsto (é a conta da planilha); só deixa de ser "vencido". */
  const etapaConcluida = !!norm(mat.etapa) && (obra.cronograma || []).some(
    (e) => norm(e.etapa) === norm(mat.etapa) && num(e.progresso) >= 1);
  const vencido = isISO(mat.dataNecessaria) && mat.dataNecessaria < hojeISO() && saldo > 0 &&
    mat.status !== 'Cancelado' && !etapaConcluida;
  /* Etapa em andamento esperando material: esse é o que para a frente. */
  const travaFrente = vencido && (obra.cronograma || []).some(
    (e) => norm(e.etapa) === norm(mat.etapa) && num(e.progresso) > 0 && num(e.progresso) < 1);
  /* Ocorrências abertas no diário que apontam para este material
     ("Piso parou: falta rejunte") — o canteiro já disse que ele trava. */
  const ocorrencias = (obra.diario || []).filter(
    (d) => d.ocorrenciaStatus === 'aberta' && d.ocorrenciaMaterialId === mat.id);
  return {
    comprada, valorComprado, saldo, orcamento, vencido, etapaConcluida, travaFrente, ocorrencias,
    /* comprado acima do necessário (porcelanato 120 m² para 60 m²) */
    excesso: necessaria > 0 ? Math.max(0, comprada - necessaria) : 0,
    saldoValor: saldo * num(mat.precoPrevisto),
    desvio: valorComprado - (comprada * num(mat.precoPrevisto)),
    compras: ls.length
  };
}

/* A tela de Materiais inteira sai daqui: os quatro KPIs, o "falta
   comprar por etapa" e o "comprar nos próximos N dias" (com o que já
   venceu primeiro — é o que trava a obra agora). Cancelado fica fora. */
function resumoMateriais(obra, hoje = hojeISO(), dias = 14) {
  const todos = obra.materiais.map((m) => ({ m, c: materialCalc(obra, m) }));
  const ativos = todos.filter((x) => x.m.status !== 'Cancelado');
  const soma = (xs, f) => round2(xs.reduce((s, x) => s + f(x), 0));
  const comSaldo = ativos.filter((x) => x.c.saldo > 0.005);
  const vencidos = todos.filter((x) => x.c.vencido);
  const comCompra = todos.filter((x) => x.c.compras > 0);

  const porEtapa = new Map();
  comSaldo.forEach((x) => {
    const e = x.m.etapa || 'Sem etapa';
    porEtapa.set(e, (porEtapa.get(e) || 0) + x.c.saldoValor);
  });

  const limite = addDiasISO(hoje, dias);
  const comprar = comSaldo
    .filter((x) => isISO(x.m.dataNecessaria) && x.m.dataNecessaria <= limite && !x.c.etapaConcluida)
    .map((x) => ({
      id: x.m.id,
      material: x.m.material || 'Material',
      dataLimite: x.m.dataNecessaria,
      valor: round2(x.c.saldoValor),
      etapa: x.m.etapa || '',
      vencido: x.m.dataNecessaria < hoje,
      travaFrente: x.c.travaFrente,
    }))
    .sort((a, b) => a.dataLimite.localeCompare(b.dataLimite));

  return {
    orcamento: soma(todos, (x) => x.c.orcamento),
    comprado: soma(todos, (x) => x.c.valorComprado),
    faltaComprar: soma(comSaldo, (x) => x.c.saldoValor),
    itensComSaldo: comSaldo.length,
    vencidos: vencidos.length,
    vencidosValor: soma(vencidos, (x) => x.c.saldoValor),
    travando: vencidos.filter((x) => x.c.travaFrente).length,
    comCompra: comCompra.length,
    desvio: soma(comCompra, (x) => x.c.desvio),
    faltaPorEtapa: [...porEtapa.entries()]
      .map(([rotulo, valor]) => ({ rotulo, valor: round2(valor) }))
      .sort((a, b) => b.valor - a.valor),
    comprarProximos: comprar,
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
  /* Início atrasado: ainda em 0%, o início previsto já passou e o fim não
     (se o fim passou, já é ATRASADO). A situação da planilha continua
     "NÃO INICIADO"; este número é o que faltava para acender o alerta. */
  const atrasoInicio = (situacao === 'NÃO INICIADO' && isISO(e.inicioPrevisto) && !isISO(e.inicioReal) &&
    e.inicioPrevisto < hoje) ? diasEntre(e.inicioPrevisto, hoje) : 0;
  return {
    diasPrevistos, diasRealizados, atraso, atrasoInicio, progresso, situacao,
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

function fluxoCaixa(obra, hoje = hojeISO()) {
  const meses = competenciasObra(obra);
  let acumulado = num(obra.fin.saldoInicial);
  /* Parcela vencida (prevista antes de hoje, sem crédito) sai do mês
     original: aparece como "vencido" no mês corrente, onde ainda pode
     entrar — deixá-la em junho mentia sobre o caixa de junho. */
  const aReceber = (r) => r.status !== 'Recebido' && r.status !== 'Cancelado' && isISO(r.dataPrevista);
  const vencida = (r) => aReceber(r) && r.dataPrevista < hoje;
  const valorAReceber = (r) => recebimentoLiquido(r) || num(r.valorPrevisto);
  const ymHoje = competencia(hoje);
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
      .filter((r) => aReceber(r) && !vencida(r) && competencia(r.dataPrevista) === ym)
      .reduce((s, r) => s + valorAReceber(r), 0);
    const vencidasNaoRecebidas = ym !== ymHoje ? 0 : obra.recebimentos
      .filter(vencida)
      .reduce((s, r) => s + valorAReceber(r), 0);
    const medicoesNaoPagas = obra.medicoes
      .filter((m) => competencia(m.data) === ym && m.status !== 'Cancelado')
      .reduce((s, m) => s + medicaoAPagar(obra, m), 0);
    return {
      ym, entradas, medicoes, outras, saidas, saldoMes,
      acumulado, previstasNaoRecebidas, vencidasNaoRecebidas, medicoesNaoPagas
    };
  });
}

/* ------------------------------------------------ INDICADORES OBRA */
/* Dinheiro do próprio cliente não é liberação do financiamento: entra no
   caixa, mas não no "% liberado" do valor financiado. Origem vazia ou
   "Outro" conta como financiador (o padrão de recebimento é CAIXA). */
const ORIGENS_PROPRIAS = new Set(['Cliente', 'Recursos próprios']);
function recebimentoDoFinanciamento(r) {
  return !ORIGENS_PROPRIAS.has(r.origem);
}

/* Saída que não é obra física: entra no resultado, mas não no custo por m²
   — senão comissão de corretor e taxa de cartório viram "obra cara". */
const TIPOS_CUSTO_NAO_FISICO = new Set([
  'Terreno', 'Comissão imobiliária', 'Honorário técnico/gestão', 'Taxa/imposto'
]);
function lancamentoCustoFisico(l) {
  return !TIPOS_CUSTO_NAO_FISICO.has(l.tipo);
}

/* Natureza da saída, para ler o dinheiro pelo que ele é: comissão de
   corretor é custo de VENDA, honorário é ADMINISTRAÇÃO — nenhum dos dois
   é obra. Casa com TIPOS_CUSTO_NAO_FISICO: 'Obra' é exatamente o custo
   físico. */
const NATUREZA_POR_TIPO = {
  Terreno: 'Terreno',
  'Comissão imobiliária': 'Venda',
  'Honorário técnico/gestão': 'Administração',
  'Taxa/imposto': 'Taxas',
};
function lancamentoNatureza(l) {
  return NATUREZA_POR_TIPO[l.tipo] || 'Obra';
}

/* Grupos de lançamentos iguais (mesma data, fornecedor e total): a mesma
   regra do alerta "Possível lançamento duplicado" e da marca na lista. */
function lancamentosDuplicados(obra) {
  const chave = new Map();
  obra.lancamentos.forEach((l) => {
    const k = [l.data, norm(l.fornecedor), round2(lancamentoTotal(l))].join('|');
    if (!chave.has(k)) chave.set(k, []);
    chave.get(k).push(l);
  });
  return [...chave.values()].filter((ls) => ls.length > 1 && lancamentoTotal(ls[0]) > 0);
}

/* Cobertura do plano de materiais: quanto do material comprado estava no
   plano (ligado a um item, por id ou por etapa + descrição). Plano que
   cobre metade das compras não serve para prever custo. null sem compra. */
function coberturaPlanoMateriais(obra) {
  const compras = obra.lancamentos.filter((l) => l.tipo === 'Material');
  const total = round2(compras.reduce((s, l) => s + lancamentoTotal(l), 0));
  if (total <= 0.005) return { total: 0, noPlano: 0, fracao: null };
  const ids = new Set();
  obra.materiais.forEach((m) => lancamentosDoMaterial(obra, m).forEach((l) => ids.add(l.id)));
  const noPlano = round2(compras.filter((l) => ids.has(l.id)).reduce((s, l) => s + lancamentoTotal(l), 0));
  return { total, noPlano, fracao: noPlano / total };
}

/* Os números do topo de Lançamentos. */
function resumoLancamentos(obra) {
  const soma = (ls) => round2(ls.reduce((s, l) => s + lancamentoTotal(l), 0));
  const ls = obra.lancamentos;
  const semEtapa = ls.filter((l) => !l.etapa);
  const naoObra = ls.filter((l) => lancamentoNatureza(l) !== 'Obra');
  const cat = (c) => ls.filter((l) => categoriaLancamento(l) === c);
  return {
    total: soma(ls),
    n: ls.length,
    material: soma(ls.filter((l) => l.tipo === 'Material')),
    semEtapa: { n: semEtapa.length, valor: soma(semEtapa) },
    naoObra: { n: naoObra.length, valor: soma(naoObra) },
    /* as quatro categorias de saída (categoriaLancamento) — os KPIs */
    porCategoria: {
      material: soma(cat('material')),
      maoDeObra: soma(cat('maoDeObra')),
      taxas: soma(cat('taxas')),
      extras: soma(cat('extras')),
    },
  };
}

/* Categoria da saída, a mesma em Lançamentos e no Fluxo de caixa:
   material (inclui fornecimento + instalação), mão de obra e serviços
   (serviço avulso; no Fluxo, também as medições pagas), taxas e impostos,
   e extras (honorário, comissão, terreno, outras). Tipo criado pelo
   usuário e fora da lista cai em extras. */
const CATEGORIAS_SAIDA = [
  ['material', 'Material'],
  ['maoDeObra', 'Mão de obra e serviços'],
  ['taxas', 'Taxas e impostos'],
  ['extras', 'Extras'],
];
const CATEGORIA_POR_TIPO = {
  Material: 'material',
  'Fornecimento + instalação': 'material',
  'Serviço avulso': 'maoDeObra',
  'Taxa/imposto': 'taxas',
  'Honorário técnico/gestão': 'extras',
  'Comissão imobiliária': 'extras',
  Terreno: 'extras',
  'Outra saída': 'extras',
};
function categoriaLancamento(l) {
  return CATEGORIA_POR_TIPO[l.tipo] || 'extras';
}

/* Lançamentos agrupados por mês (o mais recente primeiro), com o
   subtotal de cada mês. Sem data vai para o fim, em "sem data". */
function lancamentosPorMes(lancamentos) {
  const grupos = new Map();
  lancamentos.forEach((l) => {
    const ym = isISO(l.data) ? competencia(l.data) : '';
    const g = grupos.get(ym) || { ym, lancamentos: [], total: 0 };
    g.lancamentos.push(l);
    g.total += lancamentoTotal(l);
    grupos.set(ym, g);
  });
  return [...grupos.values()]
    .map((g) => ({ ...g, total: round2(g.total) }))
    .sort((a, b) => (!a.ym ? 1 : !b.ym ? -1 : b.ym.localeCompare(a.ym)));
}

/* Composição por tipo e gasto por etapa (painel de Lançamentos), do
   maior para o menor. A rosca junta o que passar de cinco fatias em
   "Outros" (fatiasRosca, graficos). */
function composicaoPorTipo(lancamentos) {
  const m = new Map();
  lancamentos.forEach((l) => m.set(l.tipo || 'Sem tipo', (m.get(l.tipo || 'Sem tipo') || 0) + lancamentoTotal(l)));
  return [...m.entries()].map(([rotulo, valor]) => ({ rotulo, valor: round2(valor) }))
    .filter((x) => x.valor > 0.005).sort((a, b) => b.valor - a.valor);
}
function gastoPorEtapa(lancamentos) {
  const m = new Map();
  lancamentos.forEach((l) => m.set(l.etapa || 'Sem etapa', (m.get(l.etapa || 'Sem etapa') || 0) + lancamentoTotal(l)));
  return [...m.entries()].map(([rotulo, valor]) => ({ rotulo, valor: round2(valor) }))
    .filter((x) => x.valor > 0.005).sort((a, b) => b.valor - a.valor);
}

/* Duplicados ainda em aberto: os grupos de lancamentosDuplicados cujo
   alerta ("duplicado:<id do primeiro>") não foi marcado "não é duplicado"
   (tratamento resolvido, 0015). O "Não é duplicado" da lista grava esse
   tratamento; se o valor subir, o alerta volta (situacaoTratamento). */
function lancamentosDuplicadosAbertos(obra, hoje = hojeISO()) {
  const trat = new Map((obra.tratamentos || []).map((t) => [t.chave, t]));
  return lancamentosDuplicados(obra).filter((ls) => {
    const alerta = { sev: 2, valor: lancamentoTotal(ls[0]) * (ls.length - 1) };
    return !situacaoTratamento(trat.get(`duplicado:${ls[0].id}`), alerta, hoje).silenciado;
  });
}

function kpisObra(obra) {
  const recebido = obra.recebimentos
    .filter((r) => r.status !== 'Cancelado')
    .reduce((s, r) => s + num(r.valorRecebido), 0);
  const recebidoFinanciamento = obra.recebimentos
    .filter((r) => r.status !== 'Cancelado' && recebimentoDoFinanciamento(r))
    .reduce((s, r) => s + num(r.valorRecebido), 0);
  const pagoMedicoes = obra.medicoes
    .filter((m) => m.status !== 'Cancelado')
    .reduce((s, m) => s + num(m.valorPago), 0);
  const pagoLancamentos = obra.lancamentos.reduce((s, l) => s + lancamentoTotal(l), 0);
  const totalPago = pagoMedicoes + pagoLancamentos;
  const saldoInicial = num(obra.fin.saldoInicial);
  const saldoCaixa = saldoInicial + recebido - totalPago;

  /* Mesmo número da tela de Contratos: supressão subtrai, proposto fica fora. */
  const bases = [...new Set(obra.contratos.map((c) => c.codigoBase || c.codigo).filter(Boolean))];
  const contratado = bases.reduce((s, b) => s + indicadoresContrato(obra, b).autorizado, 0);
  const aditivosPendentes = bases.reduce((s, b) => s + composicaoContrato(obra, b).pendentesValor, 0);
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
  /* Custo físico: o previsto sem terreno, comissão, honorário e taxas. É o
     que se compara com o teto de custo por m² e com o CUB. */
  const custoNaoFisico = obra.lancamentos
    .filter((l) => !lancamentoCustoFisico(l))
    .reduce((s, l) => s + lancamentoTotal(l), 0);
  const custoFisicoPrevisto = custoPrevisto - custoNaoFisico;
  const custoFisicoPrevistoM2 = area > 0 ? custoFisicoPrevisto / area : 0;

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

  /* Posição no fim da obra: o caixa de hoje, mais o que ainda vai entrar,
     menos o que ainda vai sair (custo previsto − já pago = saldo dos
     contratos + materiais a comprar). A pagar das medições já está dentro
     do saldo dos contratos — não sai duas vezes. */
  const custoAIncorrer = Math.max(0, custoPrevisto - totalPago);
  const posicaoProjetada = saldoCaixa + previstoNaoRecebido - custoAIncorrer;

  const financiado = num(obra.fin.valorFinanciado);
  return {
    recebido, pagoMedicoes, pagoLancamentos, totalPago, saldoInicial, saldoCaixa,
    contratado, aditivosPendentes, saldoContratual, area, custoM2, custoPrevisto, custoPrevistoM2,
    custoNaoFisico, custoFisicoPrevisto, custoFisicoPrevistoM2,
    materiaisSaldo, terreno, custoComTerreno, venda, margem, resultado,
    progressoFisico, progressoFinanceiro, previstoNaoRecebido, medicoesNaoPagas,
    custoAIncorrer, posicaoProjetada,
    financiado,
    recursosProprios: num(obra.fin.recursosProprios),
    recebidoFinanciamento,
    recebidoProprio: recebido - recebidoFinanciamento,
    /* fração do financiamento já liberada — só dinheiro do financiador */
    liberadoFinanciamento: financiado > 0 ? recebidoFinanciamento / financiado : null,
    aReceber: Math.max(0, financiado - recebidoFinanciamento),
    etapasAtrasadas: etapas.filter((e) => e.situacao === 'ATRASADO').length,
    etapasInicioAtrasado: etapas.filter((e) => e.atrasoInicio > 0).length,
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
  /* liberado acumulado pelo financiador (0016): dinheiro dele que já
     entrou até o fim do mês, sobre o valor financiado */
  const financiado = num(obra.fin.valorFinanciado);
  const creditos = obra.recebimentos.filter((r) =>
    r.status !== 'Cancelado' && recebimentoDoFinanciamento(r) && isISO(r.dataRecebimento));
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
      liberadoFinanciador: futuro || !(financiado > 0) ? null
        : creditos.filter((r) => r.dataRecebimento <= refReal)
          .reduce((s, r) => s + num(r.valorRecebido), 0) / financiado,
      desvio: fisicoReal === null ? null : fisicoReal - fisicoPrev
    };
  });
}

/* ============================================ FINANCIADOR (0016)
   Qualquer construtora, qualquer financiador: CAIXA, outro banco,
   consórcio ou o próprio cliente pagando por marco. O dinheiro é
   liberado em parcelas, cada uma exigindo um % de obra executada,
   medido pela planilha do financiador (PLS/PCI na CAIXA; cronograma
   físico-financeiro nos outros). */

/* "CAIXA", "Banco do Brasil"… ou "financiador" quando não informado. */
function nomeFinanciador(obra) {
  return String((obra.fin && obra.fin.financiador) || '').trim() || 'financiador';
}

/* Físico pelo olhar do financiador: pelos pesos da planilha dele, se
   cadastrados; senão, o físico da obra (pesos do cronograma). */
function fisicoFinanciador(obra) {
  const soma = obra.cronograma.reduce((s, e) => s + num(e.pesoFinanciador), 0);
  if (soma <= 0) return { fisico: kpisObra(obra).progressoFisico, porPlanilha: false };
  const f = obra.cronograma.reduce(
    (s, e) => s + num(e.pesoFinanciador) * Math.min(1, Math.max(0, num(e.progresso))), 0) / soma;
  return { fisico: f, porPlanilha: true };
}

/* Onde a parcela está: prevista → solicitada → vistoriada → aprovada →
   creditada. Sai das datas (e do status, para dado antigo). */
const PROCESSO_PARCELA = ['prevista', 'solicitada', 'vistoriada', 'aprovada', 'creditada'];
function processoParcela(r) {
  if (r.status === 'Cancelado') return 'cancelada';
  if (num(r.valorRecebido) > 0.005 || r.status === 'Recebido') return 'creditada';
  if (isISO(r.dataAprovacao) || r.status === 'Aprovado') return 'aprovada';
  if (isISO(r.dataVistoria)) return 'vistoriada';
  if (isISO(r.dataSolicitacao) || r.status === 'Solicitado') return 'solicitada';
  return 'prevista';
}

/* As parcelas do financiador, em ordem, com o andamento de cada uma.
   Vencida: passou da data prevista e não foi creditada — sai do mês
   original e vai para "vencido" no Fluxo e em Recebimentos. */
function parcelasFinanciador(obra, hoje = hojeISO()) {
  return obra.recebimentos
    .filter((r) => r.status !== 'Cancelado' && recebimentoDoFinanciamento(r))
    .slice()
    .sort((a, b) => String(a.dataPrevista || '9999').localeCompare(String(b.dataPrevista || '9999')) ||
      String(a.numeroMedicao).localeCompare(String(b.numeroMedicao), 'pt', { numeric: true }))
    .map((r) => {
      const etapa = processoParcela(r);
      return {
        r,
        etapa,
        passo: PROCESSO_PARCELA.indexOf(etapa),
        exigido: num(r.percentExigido),
        valor: recebimentoLiquido(r) || num(r.valorPrevisto),
        vencida: etapa !== 'creditada' && isISO(r.dataPrevista) && r.dataPrevista < hoje,
        diasSolicitada: etapa !== 'creditada' && isISO(r.dataSolicitacao)
          ? Math.max(0, diasEntre(r.dataSolicitacao, hoje)) : null,
      };
    });
}

/* A próxima parcela e a decisão que ela pede:
   - 'aguardar': já pedida (solicitada/vistoriada/aprovada) — cobrar o
     financiador, há N dias;
   - 'pedir': o físico já passou do exigido — pedir a vistoria agora;
   - 'concluir': falta obra — e quais etapas, na ordem de término, fecham
     a diferença;
   - 'sem-meta': a parcela não tem % exigido cadastrado. */
function proximaParcelaFinanciador(obra, hoje = hojeISO()) {
  const pendentes = parcelasFinanciador(obra, hoje).filter((p) => p.etapa !== 'creditada');
  if (!pendentes.length) return null;
  const p = pendentes[0];
  const { fisico, porPlanilha } = fisicoFinanciador(obra);
  const falta = p.exigido > 0 ? Math.max(0, p.exigido - fisico) : null;
  let decisao;
  if (p.passo >= 1) decisao = 'aguardar';
  else if (p.exigido <= 0) decisao = 'sem-meta';
  else decisao = falta <= 0.0005 ? 'pedir' : 'concluir';

  /* etapas que fecham a diferença: incompletas, pela data de término */
  const etapas = [];
  if (decisao === 'concluir') {
    const pesos = pesosCronograma(obra);
    const somaFin = obra.cronograma.reduce((s, e) => s + num(e.pesoFinanciador), 0);
    const peso = (e) => (porPlanilha ? num(e.pesoFinanciador) / somaFin : pesos.get(e.id) || 0);
    let acum = 0;
    obra.cronograma
      .filter((e) => num(e.progresso) < 1 && peso(e) > 0)
      .sort((a, b) => String(a.fimPrevisto || '9999').localeCompare(String(b.fimPrevisto || '9999')))
      .forEach((e) => {
        if (acum >= falta - 1e-9) return;
        const contribui = peso(e) * (1 - Math.min(1, Math.max(0, num(e.progresso))));
        acum += contribui;
        etapas.push({ id: e.id, etapa: e.etapa, falta: contribui, progresso: num(e.progresso) });
      });
  }
  return { ...p, fisico, porPlanilha, falta, decisao, etapas, financiador: nomeFinanciador(obra) };
}

/* Memória de medição no layout da planilha do financiador: item, serviço,
   peso, executado e contribuição — pelos pesos do financiador quando
   cadastrados; senão, pelos do cronograma. "A solicitar" = físico ×
   financiado − já liberado pelo financiador (entrada do cliente não
   abate). */
function memoriaMedicao(obra) {
  const k = kpisObra(obra);
  const { fisico, porPlanilha } = fisicoFinanciador(obra);
  const pesos = pesosCronograma(obra);
  const somaFin = obra.cronograma.reduce((s, e) => s + num(e.pesoFinanciador), 0);
  const linhas = obra.cronograma
    .filter((e) => !porPlanilha || num(e.pesoFinanciador) > 0)
    .map((e) => {
      const peso = porPlanilha ? num(e.pesoFinanciador) / somaFin : pesos.get(e.id) || 0;
      const executado = Math.min(1, Math.max(0, num(e.progresso)));
      return { item: e.itemFinanciador || '', etapa: e.etapa, peso, executado, contribuicao: peso * executado,
        situacao: etapaCalc(e).situacao };
    })
    .sort((a, b) => (a.item && b.item ? a.item.localeCompare(b.item, 'pt', { numeric: true }) : 0));
  return {
    linhas,
    fisico,
    porPlanilha,
    financiador: nomeFinanciador(obra),
    financiado: k.financiado,
    liberado: k.recebidoFinanciamento,
    aSolicitar: Math.max(0, round2(fisico * k.financiado - k.recebidoFinanciamento)),
  };
}

/* Os números de Recebimentos. Parcela vencida (passou da data prevista
   sem crédito) sai do mês original e vai para o balde "vencido" — no
   mês dela já não vai entrar, e somar lá mentia sobre o caixa. */
function resumoRecebimentos(obra, hoje = hojeISO()) {
  const naoRecebido = (r) => r.status !== 'Recebido' && r.status !== 'Cancelado';
  const atrasada = (r) => naoRecebido(r) && isISO(r.dataPrevista) && r.dataPrevista < hoje;
  const atrasadas = obra.recebimentos.filter(atrasada);
  const pendentes = obra.recebimentos.filter(naoRecebido);
  const meses = new Map();
  let vencido = 0;
  pendentes.forEach((r) => {
    const v = num(r.valorPrevisto);
    if (atrasada(r)) vencido += v;
    else if (isISO(r.dataPrevista)) {
      const ym = competencia(r.dataPrevista);
      meses.set(ym, (meses.get(ym) || 0) + v);
    }
  });
  return {
    atrasadas,
    totAtrasado: round2(atrasadas.reduce((s, r) => s + num(r.valorPrevisto), 0)),
    pendentes,
    descontos: round2(obra.recebimentos.reduce((s, r) => s + num(r.descontos), 0)),
    vencido: round2(vencido),
    porMes: [...meses.entries()].sort().map(([ym, valor]) => ({ ym, valor: round2(valor) })),
  };
}

/* ------------------------------------------ Recebimentos (redesenho)
   Passos da parcela: do financiador (prevista → solicitada → em vistoria
   → aprovada → creditada) ou do cliente (prevista → cobrada → recebida).
   Na parcela do cliente, a data de cobrança é dataSolicitacao. */
const PASSOS_FINANCIAMENTO = ['Prevista', 'Solicitada', 'Em vistoria', 'Aprovada', 'Creditada'];
const PASSOS_CLIENTE = ['Prevista', 'Cobrada', 'Recebida'];

function andamentoParcela(r, hoje = hojeISO()) {
  const cliente = !recebimentoDoFinanciamento(r);
  const passos = cliente ? PASSOS_CLIENTE : PASSOS_FINANCIAMENTO;
  if (r.status === 'Cancelado') {
    return { tipo: cliente ? 'cliente' : 'financiamento', passos, passo: -1, final: false, cancelada: true,
      texto: 'Cancelada', data: '', vencida: false, diasAtraso: 0 };
  }
  let passo;
  let data;
  if (cliente) {
    if (num(r.valorRecebido) > 0.005 || r.status === 'Recebido') { passo = 2; data = r.dataRecebimento; }
    else if (isISO(r.dataSolicitacao)) { passo = 1; data = r.dataSolicitacao; }
    else { passo = 0; data = r.dataPrevista; }
  } else {
    passo = PROCESSO_PARCELA.indexOf(processoParcela(r));
    data = [r.dataPrevista, r.dataSolicitacao, r.dataVistoria, r.dataAprovacao, r.dataRecebimento][passo];
  }
  const final = passo === passos.length - 1;
  const vencida = !final && isISO(r.dataPrevista) && r.dataPrevista < hoje;
  const diasAtraso = vencida ? diasEntre(r.dataPrevista, hoje) : 0;
  const ha = isISO(data) ? Math.max(0, diasEntre(data, hoje)) : null;
  const dias = (n) => `${n} dia${n === 1 ? '' : 's'}`;
  let texto;
  if (final) texto = `${passos[passo]} ${isISO(data) ? `em ${fmtDataCurta(data)}` : ''}`.trim();
  else if (passo === 0) {
    texto = vencida ? `Vencida há ${dias(diasAtraso)}` : isISO(r.dataPrevista) ? `Prevista para ${fmtDataCurta(r.dataPrevista)}` : 'Prevista';
  } else texto = ha === null ? passos[passo] : ha === 0 ? `${passos[passo]} hoje` : `${passos[passo]} há ${dias(ha)}`;
  return { tipo: cliente ? 'cliente' : 'financiamento', passos, passo, final, cancelada: false, texto, data: data || '', vencida, diasAtraso };
}

/* A condição de liberação da parcela do financiador: a etapa ligada a ela
   (etapaPci com o nome de uma etapa do cronograma) a 100%, ou o % de obra
   exigido. null na parcela do cliente, na já creditada e na sem meta. */
function condicaoParcela(obra, r) {
  if (!recebimentoDoFinanciamento(r) || r.status === 'Cancelado') return null;
  if (num(r.valorRecebido) > 0.005 || r.status === 'Recebido') return null;
  const e = r.etapaPci ? obra.cronograma.find((x) => norm(x.etapa) === norm(r.etapaPci)) : null;
  if (e) {
    const p = Math.min(1, Math.max(0, num(e.progresso)));
    return { tipo: 'etapa', etapa: e.etapa, exigido: 1, atual: p, cumprida: p >= 1,
      texto: `exige ${e.etapa} 100% · hoje ${fmtPct(p, 0)}` };
  }
  const exigido = num(r.percentExigido);
  if (exigido > 0) {
    const { fisico } = fisicoFinanciador(obra);
    return { tipo: 'obra', etapa: '', exigido, atual: fisico, cumprida: fisico >= exigido - 0.0005,
      texto: `exige ${fmtPct(exigido, 0)} da obra · hoje ${fmtPct(fisico, 0)}` };
  }
  return null;
}

/* "Pode solicitar": a diferença entre executado e liberado convertida em
   valor, menos o que já foi pedido e ainda não caiu (parcela solicitada,
   em vistoria ou aprovada). É o que dá para pedir ao financiador hoje.
   null sem valor financiado. */
function podeSolicitar(obra, hoje = hojeISO()) {
  const le = liberadoExecutado(obra);
  if (!le) return null;
  const emAndamento = parcelasFinanciador(obra, hoje)
    .filter((p) => p.passo >= 1 && p.etapa !== 'creditada')
    .reduce((s, p) => s + p.valor, 0);
  const aberto = Math.max(0, (le.executado - le.liberado) * le.financiado);
  return {
    executado: le.executado,
    liberado: le.liberado,
    financiado: le.financiado,
    financiador: le.financiador,
    emAndamento: round2(emAndamento),
    valor: round2(Math.max(0, aberto - emAndamento)),
  };
}

/* A faixa de KPIs de Recebimentos: recebido (e quanto do previsto),
   a receber com a próxima parcela, o atrasado com a parcela mais antiga
   e o "pode solicitar". Tarifas e descontos vão no contexto do recebido. */
function indicadoresRecebimentos(obra, hoje = hojeISO()) {
  const k = kpisObra(obra);
  const rr = resumoRecebimentos(obra, hoje);
  const ativos = obra.recebimentos.filter((r) => r.status !== 'Cancelado');
  const previstoTotal = round2(ativos.reduce((s, r) => s + num(r.valorPrevisto), 0));
  const valorDe = (r) => recebimentoLiquido(r) || num(r.valorPrevisto);
  const futuras = rr.pendentes
    .filter((r) => isISO(r.dataPrevista) && r.dataPrevista >= hoje)
    .sort((a, b) => a.dataPrevista.localeCompare(b.dataPrevista));
  const atrasadas = rr.atrasadas.slice().sort((a, b) => a.dataPrevista.localeCompare(b.dataPrevista));
  const antiga = atrasadas[0];
  return {
    recebido: round2(k.recebido),
    previstoTotal,
    pctRecebido: previstoTotal > 0 ? k.recebido / previstoTotal : null,
    recebidoFinanciamento: round2(k.recebidoFinanciamento),
    recebidoProprio: round2(k.recebidoProprio),
    tarifas: rr.descontos,
    aReceber: round2(k.previstoNaoRecebido),
    proxima: futuras[0]
      ? { valor: round2(valorDe(futuras[0])), data: futuras[0].dataPrevista, numero: futuras[0].numeroMedicao, etapa: futuras[0].etapaPci }
      : null,
    atrasado: rr.totAtrasado,
    nAtrasadas: atrasadas.length,
    maisAntiga: antiga
      ? { numero: antiga.numeroMedicao, etapa: antiga.etapaPci, dias: diasEntre(antiga.dataPrevista, hoje) }
      : null,
    podeSolicitar: podeSolicitar(obra, hoje),
  };
}

/* Previsto × recebido acumulado, mês a mês: o previsto pela data
   prevista, o recebido pela data do crédito. Depois do mês de hoje o
   recebido é null (ainda não aconteceu). */
function curvaRecebimentos(obra, hoje = hojeISO()) {
  const ativos = obra.recebimentos.filter((r) => r.status !== 'Cancelado');
  const datas = [];
  ativos.forEach((r) => {
    if (isISO(r.dataPrevista)) datas.push(r.dataPrevista);
    if (isISO(r.dataRecebimento)) datas.push(r.dataRecebimento);
  });
  if (!datas.length) return [];
  datas.sort();
  const mesHoje = competencia(hoje);
  const ini = competencia(datas[0]);
  const fim = [competencia(datas[datas.length - 1]), mesHoje].sort()[1];
  const meses = [];
  for (let m = ini; m <= fim && meses.length < 120; m = addMeses(m, 1)) meses.push(m);
  let prev = 0;
  let rec = 0;
  return meses.map((ym) => {
    ativos.forEach((r) => {
      if (isISO(r.dataPrevista) && competencia(r.dataPrevista) === ym) prev += num(r.valorPrevisto);
      if (isISO(r.dataRecebimento) && competencia(r.dataRecebimento) === ym) rec += num(r.valorRecebido);
    });
    return { ym, previsto: round2(prev), recebido: ym > mesHoje ? null : round2(rec) };
  });
}

/* O histórico da parcela, passo a passo, para o inspetor: data de cada
   passo que aconteceu e o valor de cada momento. */
function historicoParcela(r) {
  const cliente = !recebimentoDoFinanciamento(r);
  const linhas = [
    { passo: 'Prevista', data: r.dataPrevista, valor: num(r.valorPrevisto) },
    { passo: cliente ? 'Cobrada' : 'Solicitada', data: r.dataSolicitacao, valor: null },
    cliente ? null : { passo: 'Vistoria', data: r.dataVistoria, valor: null },
    cliente ? null : { passo: 'Aprovada', data: r.dataAprovacao, valor: num(r.valorAprovado) || null },
    { passo: cliente ? 'Recebida' : 'Creditada', data: r.dataRecebimento, valor: num(r.valorRecebido) || null,
      descontos: num(r.descontos) || 0 },
  ];
  return linhas.filter((l) => l && (l.passo === 'Prevista' || isISO(l.data)));
}

/* Liberado × executado: quanto do financiamento já entrou contra quanto
   da obra já foi feito. Executado à frente = a construtora está bancando
   a diferença com caixa próprio. null sem valor financiado. */
function liberadoExecutado(obra) {
  const k = kpisObra(obra);
  if (!(k.financiado > 0)) return null;
  const { fisico } = fisicoFinanciador(obra);
  const liberado = k.liberadoFinanciamento || 0;
  const gap = (fisico - liberado) * k.financiado;
  return {
    liberado,
    executado: fisico,
    bancando: Math.max(0, round2(gap)),
    adiantado: Math.max(0, round2(-gap)),
    financiado: k.financiado,
    financiador: nomeFinanciador(obra),
  };
}

/* Medido × físico de um contrato. O físico é o das etapas ligadas a ele
   (contrato.etapas); sem etapas ligadas, só a empreitada global (≥ 50%
   do contratado da obra) compara com o físico da obra toda — subcontrato
   pequeno sem etapas não tem com o que comparar (null). */
function medidoFisicoContrato(obra, base) {
  const ind = indicadoresContrato(obra, base);
  if (!(ind.autorizado > 0.005)) return null;
  const registros = obra.contratos.filter((c) => (c.codigoBase || c.codigo) === base);
  const principal = registros.find((c) => c.registro === 'Contrato') || registros[0] || {};
  const nomes = new Set((principal.etapas || []).map((n) => norm(n)));
  const pesos = pesosCronograma(obra);
  const sel = obra.cronograma.filter((e) => nomes.has(norm(e.etapa)));
  let fisico;
  let pelaObra = false;
  if (sel.length) {
    const soma = sel.reduce((s, e) => s + (pesos.get(e.id) || 0), 0);
    fisico = soma > 0
      ? sel.reduce((s, e) => s + (pesos.get(e.id) || 0) * Math.min(1, Math.max(0, num(e.progresso))), 0) / soma
      : 0;
  } else {
    const contratado = kpisObra(obra).contratado;
    if (!(contratado > 0) || ind.autorizado / contratado < 0.5) return null;
    fisico = kpisObra(obra).progressoFisico;
    pelaObra = true;
  }
  const medido = ind.medido / ind.autorizado;
  const diferenca = medido - fisico;
  return {
    medido,
    fisico,
    pelaObra,
    diferenca,
    adiantado: Math.max(0, round2(diferenca * ind.autorizado)),
    /* medido mais de 5 p.p. à frente do físico: pagou serviço não feito */
    alerta: diferenca > 0.05,
  };
}

/* ================================ FLUXO PROJETADO E VALE DE CAIXA
   Do caixa de hoje para a frente, evento a evento:
   - entradas: parcelas não recebidas na data prevista; a vencida não tem
     data certa — entra reprogramada para daqui a 15 dias;
   - medições já feitas e não pagas: saem hoje;
   - saldo a medir dos contratos: distribuído por igual, semana a semana,
     do início (ou hoje) até o fim vigente — ou até o término projetado,
     se o prazo do contrato já passou;
   - material a comprar: na data de necessidade (vencido = hoje).
   O VALE é o menor saldo que o caixa vai atingir, e a data: é o número
   que diz se falta dinheiro antes de a próxima parcela entrar. */
const DIAS_REPROGRAMA_VENCIDA = 15;

function eventosProjetados(obra, hoje = hojeISO()) {
  const ev = [];
  const push = (data, valor, tipo, descricao) => {
    if (Math.abs(valor) > 0.005) ev.push({ data, valor: round2(valor), tipo, descricao, obraId: obra.id, obraNome: obra.nome });
  };

  obra.recebimentos.forEach((r) => {
    if (r.status === 'Recebido' || r.status === 'Cancelado') return;
    const v = Math.max(0, (recebimentoLiquido(r) || num(r.valorPrevisto)) - num(r.valorRecebido));
    const rotulo = `${r.origem || 'Parcela'}${r.numeroMedicao ? ` nº ${r.numeroMedicao}` : ''}`;
    if (isISO(r.dataPrevista) && r.dataPrevista >= hoje) push(r.dataPrevista, v, 'entrada', rotulo);
    else push(addDias(hoje, DIAS_REPROGRAMA_VENCIDA), v, 'entrada-vencida', `${rotulo} (vencida, reprogramada)`);
  });

  obra.medicoes.forEach((m) => {
    push(hoje, -medicaoAPagar(obra, m), 'medicao', `Medição ${m.numero || ''} ${m.contratoBase || ''}`.replace(/\s+/g, ' ').trim());
  });

  const termino = valorAgregadoObra(obra, hoje).termino;
  basesContratuais(obra).forEach((b) => {
    const ind = indicadoresContrato(obra, b.base);
    if (!(ind.aMedir > 0.005)) return;
    const registros = obra.contratos.filter((c) => (c.codigoBase || c.codigo) === b.base);
    const principal = registros.find((c) => c.registro === 'Contrato') || registros[0] || {};
    const ini = isISO(principal.inicioPrevisto) && principal.inicioPrevisto > hoje ? principal.inicioPrevisto : hoje;
    let fim = contratoFimVigente(registros);
    if (!isISO(fim) || fim <= ini) fim = isISO(termino) && termino > ini ? termino : addDias(ini, 30);
    const dias = Math.max(1, diasEntre(ini, fim));
    const semanas = Math.max(1, Math.ceil(dias / 7));
    for (let i = 1; i <= semanas; i++) {
      const data = i === semanas ? fim : addDias(ini, i * 7);
      push(data, -ind.aMedir / semanas, 'contrato', `A medir ${b.base}`);
    }
  });

  obra.materiais.forEach((m) => {
    if (m.status === 'Cancelado') return;
    const c = materialCalc(obra, m);
    if (c.etapaConcluida || !(c.saldoValor > 0.005)) return;
    const data = isISO(m.dataNecessaria) && m.dataNecessaria > hoje ? m.dataNecessaria : hoje;
    push(data, -c.saldoValor, 'material', m.material || 'Material');
  });

  return ev.sort((a, b) => a.data.localeCompare(b.data) || a.valor - b.valor);
}

/* Saldo dia a dia a partir do caixa de hoje; o vale geral e o vale dos
   próximos `janela` dias; e os meses para a tabela. */
function consolidarFluxo(saldoHoje, eventos, hoje = hojeISO(), janela = 30) {
  const porData = new Map();
  eventos.forEach((e) => porData.set(e.data, (porData.get(e.data) || 0) + e.valor));
  let saldo = saldoHoje;
  const pontos = [];
  if (!porData.has(hoje)) pontos.push({ data: hoje, saldo });
  [...porData.keys()].sort().forEach((d) => {
    saldo += porData.get(d);
    pontos.push({ data: d, saldo: round2(saldo) });
  });
  /* saldo depois de cada evento, na ordem — a lista da tela de Fluxo */
  let corrente = saldoHoje;
  const comSaldo = eventos.map((e) => {
    corrente += e.valor;
    return { ...e, saldoApos: round2(corrente) };
  });
  const menor = (ps) => ps.reduce((m, p) => (p.saldo < m.saldo ? p : m), ps[0]);
  const limite = addDias(hoje, janela);
  const meses = new Map();
  eventos.forEach((e) => {
    const ym = competencia(e.data);
    const m = meses.get(ym) || { ym, entradas: 0, saidas: 0 };
    if (e.valor > 0) m.entradas += e.valor;
    else m.saidas += -e.valor;
    meses.set(ym, m);
  });
  let acum = saldoHoje;
  const listaMeses = [...meses.values()].sort((a, b) => a.ym.localeCompare(b.ym)).map((m) => {
    acum += m.entradas - m.saidas;
    return { ...m, entradas: round2(m.entradas), saidas: round2(m.saidas), saldoFim: round2(acum) };
  });
  return {
    saldoHoje: round2(saldoHoje),
    eventos: comSaldo,
    pontos,
    vale: menor(pontos),
    valeJanela: menor(pontos.filter((p) => p.data <= limite)),
    janela,
    saldoFinal: round2(saldo),
    meses: listaMeses,
  };
}

/* O painel ao lado do Fluxo de caixa: saídas por categoria, entradas por
   origem e o saldo mês a mês — realizado até hoje e projetado depois
   (fluxoProjetado) — com o menor saldo previsto. `filtro` é o da tela:
   '' (todos os meses), 'movimento' (só meses com movimento) ou 'futuros'
   (só a projeção, a partir do mês que vem). */
function analiseFluxo(obra, filtro = '', hoje = hojeISO()) {
  const ymHoje = competencia(hoje);
  const real = fluxoCaixa(obra, hoje).filter((m) => m.ym <= ymHoje);
  const proj = fluxoProjetado(obra, hoje);
  const porMes = new Map();
  const mes = (ym) => {
    if (!porMes.has(ym)) porMes.set(ym, { ym, entradas: 0, saidas: 0, saldo: 0, projetado: ym > ymHoje });
    return porMes.get(ym);
  };
  real.forEach((m) => Object.assign(mes(m.ym), { entradas: m.entradas, saidas: m.saidas, saldo: m.acumulado }));
  proj.meses.forEach((m) => {
    const alvo = mes(m.ym);
    alvo.entradas += m.entradas;
    alvo.saidas += m.saidas;
    alvo.saldo = m.saldoFim;
  });
  let meses = [...porMes.values()].sort((a, b) => a.ym.localeCompare(b.ym))
    .map((m) => ({ ...m, entradas: round2(m.entradas), saidas: round2(m.saidas), saldo: round2(m.saldo) }));
  /* mês futuro sem evento herda o saldo do anterior (já está na lista só
     quando tem evento; o realizado mantém o acumulado) */
  if (filtro === 'futuros') meses = meses.filter((m) => m.ym > ymHoje);
  if (filtro === 'movimento') meses = meses.filter((m) => m.entradas > 0.005 || m.saidas > 0.005);
  const dentro = new Set(meses.map((m) => m.ym));

  /* saídas: realizado (medição paga = mão de obra; lançamento pela
     categoria) + projetado (medição e contrato a medir = mão de obra;
     material = material) */
  const saidas = { material: 0, maoDeObra: 0, taxas: 0, extras: 0 };
  const entradas = { financiamento: 0, cliente: 0, outras: 0 };
  const origem = (r) => (recebimentoDoFinanciamento(r) ? 'financiamento' : r.origem === 'Cliente' ? 'cliente' : 'outras');
  obra.medicoes.forEach((m) => {
    if (m.status === 'Cancelado' || !isISO(m.dataPagamento) || !dentro.has(competencia(m.dataPagamento))) return;
    saidas.maoDeObra += num(m.valorPago);
  });
  obra.lancamentos.forEach((l) => {
    if (!isISO(l.data) || !dentro.has(competencia(l.data)) || competencia(l.data) > ymHoje) return;
    saidas[categoriaLancamento(l)] += lancamentoTotal(l);
  });
  obra.recebimentos.forEach((r) => {
    if (r.status === 'Cancelado' || !isISO(r.dataRecebimento) || !dentro.has(competencia(r.dataRecebimento))) return;
    entradas[origem(r)] += num(r.valorRecebido);
  });
  proj.eventos.forEach((e) => {
    if (!dentro.has(competencia(e.data))) return;
    if (e.valor > 0) entradas[origem({ origem: e.origem || '' })] += e.valor; else if (e.tipo === 'material') saidas.material += -e.valor;
    else saidas.maoDeObra += -e.valor;
  });
  const rot = Object.fromEntries(CATEGORIAS_SAIDA);
  const menorNoPeriodo = meses.length
    ? proj.pontos.filter((p) => dentro.has(competencia(p.data)))
      .reduce((m, p) => (!m || p.saldo < m.saldo ? p : m), null)
    : null;
  return {
    meses,
    saidasPorCategoria: CATEGORIAS_SAIDA.map(([k]) => ({ chave: k, rotulo: rot[k], valor: round2(saidas[k]) })),
    entradasPorOrigem: [
      { chave: 'financiamento', rotulo: nomeFinanciador(obra) === 'financiador' ? 'Financiamento' : nomeFinanciador(obra), valor: round2(entradas.financiamento) },
      { chave: 'cliente', rotulo: 'Cliente', valor: round2(entradas.cliente) },
      { chave: 'outras', rotulo: 'Outras', valor: round2(entradas.outras) },
    ],
    /* o menor saldo previsto dentro do período (vale de caixa) */
    menor: menorNoPeriodo ? { saldo: round2(menorNoPeriodo.saldo), data: menorNoPeriodo.data } : null,
  };
}

function fluxoProjetado(obra, hoje = hojeISO(), janela = 30) {
  return consolidarFluxo(kpisObra(obra).saldoCaixa, eventosProjetados(obra, hoje), hoje, janela);
}

/* A carteira inteira como um caixa só (a construtora paga tudo da
   mesma conta): o vale de caixa da empresa nos próximos 30 dias. */
function fluxoProjetadoCarteira(obras, hoje = hojeISO(), janela = 30) {
  const saldo = obras.reduce((s, o) => s + kpisObra(o).saldoCaixa, 0);
  const eventos = obras.flatMap((o) => eventosProjetados(o, hoje))
    .sort((a, b) => a.data.localeCompare(b.data) || a.valor - b.valor);
  return consolidarFluxo(saldo, eventos, hoje, janela);
}

/* Orçado × realizado por etapa (Lançamentos).
   - orçado: o plano de materiais da etapa + o autorizado dos contratos
     que a executam (contrato.etapas, 0016), repartido pelas etapas dele
     na proporção do peso de cada uma no cronograma;
   - realizado: os lançamentos da etapa + o pago em medições desses
     contratos, repartido do mesmo jeito.
   Contrato sem etapas ligadas cai em "Contratos sem etapa"; lançamento
   sem etapa, em "Sem etapa" — à vista, para ser classificado. */
function orcadoRealizadoPorEtapa(obra) {
  const pesos = pesosCronograma(obra);
  const porNome = new Map(obra.cronograma.map((e) => [norm(e.etapa), e]));
  const linhas = new Map();
  const linha = (nome) => {
    const k = nome || 'Sem etapa';
    if (!linhas.has(k)) linhas.set(k, { etapa: k, orcado: 0, realizado: 0 });
    return linhas.get(k);
  };
  obra.materiais.forEach((m) => {
    if (m.status === 'Cancelado') return;
    linha(m.etapa).orcado += materialCalc(obra, m).orcamento;
  });
  obra.lancamentos.forEach((l) => { linha(l.etapa).realizado += lancamentoTotal(l); });

  const reparte = (etapas, valor, campo) => {
    const sel = (etapas || []).map((n) => porNome.get(norm(n))).filter(Boolean);
    if (!sel.length) { linha('Contratos sem etapa')[campo] += valor; return; }
    const soma = sel.reduce((s, e) => s + (pesos.get(e.id) || 0), 0);
    sel.forEach((e) => {
      const f = soma > 0 ? (pesos.get(e.id) || 0) / soma : 1 / sel.length;
      linha(e.etapa)[campo] += valor * f;
    });
  };
  basesContratuais(obra).forEach((b) => {
    const registros = obra.contratos.filter((c) => (c.codigoBase || c.codigo) === b.base);
    const principal = registros.find((c) => c.registro === 'Contrato') || registros[0] || {};
    const ind = indicadoresContrato(obra, b.base);
    reparte(principal.etapas, ind.autorizado, 'orcado');
    reparte(principal.etapas, ind.pago, 'realizado');
  });

  const ordem = new Map(obra.cronograma.map((e, i) => [e.etapa, i]));
  return [...linhas.values()]
    .map((l) => ({
      ...l,
      orcado: round2(l.orcado),
      realizado: round2(l.realizado),
      diferenca: round2(l.realizado - l.orcado),
      consumido: l.orcado > 0.005 ? l.realizado / l.orcado : null,
    }))
    .filter((l) => l.orcado > 0.005 || l.realizado > 0.005)
    .sort((a, b) => (ordem.has(a.etapa) ? ordem.get(a.etapa) : 999) - (ordem.has(b.etapa) ? ordem.get(b.etapa) : 999));
}

/* =========================================== CLIENTE (0018)
   O que o cliente deve à obra — aprovação, escolha, documento — e há
   quanto tempo ele não recebe notícia dela. */
function pendenciasDoCliente(obra, hoje = hojeISO()) {
  const abertas = (obra.pendenciasCliente || [])
    .filter((p) => p.status === 'aberta')
    .sort((a, b) => String(a.prazo || '9999').localeCompare(String(b.prazo || '9999')));
  const vencidas = abertas.filter((p) => isISO(p.prazo) && p.prazo < hoje);
  return { abertas, vencidas, resolvidas: (obra.pendenciasCliente || []).filter((p) => p.status === 'resolvida').length };
}

/* Dias desde o último status enviado ao cliente (desde o início da obra,
   se nunca foi enviado). null sem cliente ou obra fora de andamento. */
function diasSemStatusCliente(obra, hoje = hojeISO()) {
  if (!obra.clienteId || obra.status === 'Concluída' || obra.status === 'Planejada') return null;
  const desde = isISO(obra.statusEnviadoEm) ? obra.statusEnviadoEm : isISO(obra.dataInicio) ? obra.dataInicio : '';
  return desde ? Math.max(0, diasEntre(desde, hoje)) : null;
}

/* Último status enviado entre as obras de um cliente (tela Clientes). */
function ultimoStatusCliente(obras, hoje = hojeISO()) {
  const datas = obras.map((o) => o.statusEnviadoEm).filter(isISO).sort();
  const data = datas[datas.length - 1] || '';
  return { data, dias: data ? Math.max(0, diasEntre(data, hoje)) : null };
}

/* Onde o dinheiro foi, por etapa (Painel): lançamentos pela etapa deles,
   medições pagas pelo escopo do contrato. */
function custoPorEtapa(obra) {
  const mapa = {};
  obra.lancamentos.forEach((l) => {
    const et = l.etapa || 'Não classificado';
    mapa[et] = (mapa[et] || 0) + lancamentoTotal(l);
  });
  obra.medicoes
    .filter((m) => m.status !== 'Cancelado')
    .forEach((m) => {
      const ct = obra.contratos.find((c) => c.codigoBase === m.contratoBase);
      const et = (ct && ct.escopo) || 'Empreitada';
      mapa[et] = (mapa[et] || 0) + num(m.valorPago);
    });
  return Object.entries(mapa).map(([rotulo, valor]) => ({ rotulo, valor: round2(valor) }));
}

/* -------------------------------------------------------- ALERTAS  */
/* severidade: 3 crítico · 2 atenção · 1 informativo */
/* Cada alerta leva, além do texto:
   - valor: dinheiro em jogo (R$), quando há;
   - dias: há quanto tempo o problema existe / quanto atrasa;
   - raiz: chave para agrupar sintomas sob a causa (causasRaizObra);
   - principal: true quando o alerta É uma causa, não um sintoma dela.
   A severidade sobe com dinheiro e tempo: parcela parada > 15 dias,
   medição aberta > 60 dias e etapa > 30 dias atrasada são críticas. */
function alertasObra(obra) {
  const out = [];
  const hoje = hojeISO();
  /* tipo: nome estável do alerta (o título muda todo dia — "há 40 dias",
     "há 41 dias"); com o id do registro forma a chave do tratamento. */
  const add = (tipo, sev, modulo, titulo, detalhe, acao, ref, extra = {}) =>
    out.push({
      tipo, sev, modulo, titulo, detalhe, acao, ref, obraId: obra.id, obraNome: obra.nome,
      valor: 0, dias: 0, raiz: '', principal: false, ...extra
    });

  /* Contratos */
  basesContratuais(obra).forEach((b) => {
    /* medido mais de 5 p.p. à frente do físico (0016): pagou por serviço
       que ainda não está na obra */
    const mf = medidoFisicoContrato(obra, b.base);
    if (mf && mf.alerta) {
      add('medido-adiantado', 2, 'Contratos', `Contrato ${b.base} medido à frente do físico`,
        `Medido ${fmtPct(mf.medido, 0)} contra ${fmtPct(mf.fisico, 0)} de físico${mf.pelaObra ? ' da obra' : ' das etapas dele'} — ${fmtMoney(mf.adiantado)} adiantados.`,
        'Segurar a próxima medição até o físico alcançar.', { view: 'contratos', id: b.base },
        { valor: mf.adiantado });
    }
    if (b.saldo < -0.005) {
      add('contrato-ultrapassado', 3, 'Contratos', `Contrato ${b.base} ultrapassado`,
        `Pago ${fmtMoney(b.pago)} contra ${fmtMoney(b.autorizado)} autorizados.`,
        'Emitir aditivo ou revisar medições.', { view: 'contratos', id: b.base }, { valor: -b.saldo });
    }
    if (b.medido - b.autorizado > 0.005) {
      add('contrato-medido-acima', 2, 'Contratos', `Medições acima do contrato ${b.base}`,
        `Medido ${fmtMoney(b.medido)} para um autorizado de ${fmtMoney(b.autorizado)}.`,
        'Conferir escopo medido ou formalizar aditivo.', { view: 'contratos', id: b.base },
        { valor: b.medido - b.autorizado });
    }
  });

  /* Medições */
  obra.medicoes.forEach((m) => {
    const alerta = medicaoAlerta(obra, m);
    if (alerta === 'PAGO ACIMA DA MEDIÇÃO') {
      add('medicao-pago-acima', 3, 'Medições', `Pagamento acima da medição ${m.numero || ''}`.trim(),
        `Pago ${fmtMoney(m.valorPago)} para um líquido medido de ${fmtMoney(medicaoLiquido(m))}.`,
        'Corrigir o valor pago ou a medição.', { view: 'medicoes', id: m.id },
        { valor: num(m.valorPago) - medicaoLiquido(m) });
    } else if (alerta === 'PAGAMENTO INCOMPLETO') {
      add('medicao-incompleta', 2, 'Medições', `Medição ${m.numero || ''} marcada como paga sem quitação`.trim(),
        `Falta ${fmtMoney(medicaoAPagar(obra, m))}.`,
        'Ajustar status para Parcial ou completar o pagamento.', { view: 'medicoes', id: m.id },
        { valor: medicaoAPagar(obra, m) });
    }
    const pendente = medicaoAPagar(obra, m);
    if (pendente > 0.005 && isISO(m.data) && diasEntre(m.data, hoje) > 15) {
      const dias = diasEntre(m.data, hoje);
      add('medicao-aberta', dias > 60 ? 3 : 2, 'Medições', `Medição ${m.numero || ''}${m.contratoBase ? ` do ${m.contratoBase}` : ''} em aberto há ${dias} dias`.replace(/\s+/g, ' '),
        `Saldo a pagar de ${fmtMoney(pendente)} para ${m.contratoBase || 'contrato não informado'}.`,
        'Programar o pagamento do prestador.', { view: 'medicoes', id: m.id }, { valor: pendente, dias });
    }
  });

  /* Recebimentos — uma parcela, um alerta. "Atrasada" e "solicitada sem
     retorno" eram dois alertas soltos (um deles informativo) para o mesmo
     dinheiro parado; agora é um só, e passa a crítico com 15 dias. */
  obra.recebimentos.forEach((r) => {
    if (r.status === 'Cancelado' || r.status === 'Recebido') return;
    const solicitado = r.status === 'Solicitado' && isISO(r.dataSolicitacao);
    const diasSolic = solicitado ? diasEntre(r.dataSolicitacao, hoje) : 0;
    const valor = recebimentoLiquido(r) || num(r.valorPrevisto);
    /* dinheiro do cliente tem outra causa e outra ação que o do financiador:
       não se cobra laudo de vistoria de quem vai pagar a entrada */
    const financiador = recebimentoDoFinanciamento(r);
    const raiz = financiador ? 'financiamento' : 'cliente';
    if (isISO(r.dataPrevista) && r.dataPrevista < hoje) {
      const dias = diasEntre(r.dataPrevista, hoje);
      add('parcela-atrasada', dias > 15 ? 3 : 2, 'Recebimentos', `Parcela ${r.numeroMedicao || r.etapaPci || ''} sem crédito há ${dias} dias`.replace(/\s+/g, ' '),
        `Previsto ${fmtMoney(r.valorPrevisto)} para ${fmtData(r.dataPrevista)}${solicitado ? ` · solicitada em ${fmtData(r.dataSolicitacao)}, ${diasSolic} dias sem retorno` : ' · ainda não solicitada'}.`,
        !financiador
          ? 'Cobrar o cliente ou combinar nova data.'
          : solicitado
            ? 'Cobrar o laudo da vistoria — e conferir se o serviço da parcela está concluído.'
            : 'Solicitar a parcela ou revisar a data prevista.',
        { view: 'recebimentos', id: r.id }, { valor, dias, raiz, principal: true });
    } else if (solicitado && diasSolic > 20) {
      add('parcela-sem-retorno', 2, 'Recebimentos', `Parcela ${r.numeroMedicao || r.etapaPci || ''} solicitada sem retorno`.replace(/\s+/g, ' '),
        `Solicitada em ${fmtData(r.dataSolicitacao)} (${diasSolic} dias).`,
        'Acionar o engenheiro do financiador.', { view: 'recebimentos', id: r.id },
        { valor, dias: diasSolic, raiz, principal: true });
    }
  });

  /* Materiais */
  obra.materiais.forEach((m) => {
    const c = materialCalc(obra, m);
    if (c.vencido) {
      /* material que para uma etapa em andamento é crítico; o resto, atenção */
      add('material-vencido', c.travaFrente ? 3 : 2, 'Materiais',
        c.travaFrente ? `${m.material || 'Material'} travando ${m.etapa}` : `${m.material || 'Material'} vencido sem compra`,
        `Faltam ${fmtNum(c.saldo, 2)} ${m.unidade} desde ${fmtData(m.dataNecessaria)} (${fmtMoney(c.saldoValor)})${c.travaFrente ? ` — ${m.etapa} está em andamento` : ''}.`,
        c.travaFrente ? 'Comprar hoje: a frente de serviço depende dele.' : 'Comprar ou reprogramar a data.',
        { view: 'materiais', id: m.id },
        { valor: c.saldoValor, dias: diasEntre(m.dataNecessaria, hoje),
          raiz: c.travaFrente ? `etapa:${norm(m.etapa)}` : '', principal: c.travaFrente });
    } else if (c.saldo > 0 && !c.etapaConcluida && isISO(m.dataNecessaria) && m.dataNecessaria >= hoje &&
      diasEntre(hoje, m.dataNecessaria) <= 7 && m.status !== 'Cancelado') {
      add('material-proximo', 1, 'Materiais', `${m.material || 'Material'} necessário em ${diasEntre(hoje, m.dataNecessaria)} dia(s)`,
        `Saldo de ${fmtNum(c.saldo, 2)} ${m.unidade} para ${m.etapa || 'etapa não informada'}.`,
        'Programar a compra.', { view: 'materiais', id: m.id });
    }
  });

  /* Cronograma */
  obra.cronograma.forEach((e) => {
    const c = etapaCalc(e);
    /* etapa atrasada é sintoma: do material que falta (mesma etapa) ou do
       responsável que tem várias etapas atrasadas */
    const raizEtapa = { raiz: `etapa:${norm(e.etapa)}`, responsavel: e.responsavel || '' };
    if (c.situacao === 'ATRASADO') {
      add('etapa-atrasada', c.atraso > 30 ? 3 : 2, 'Cronograma', `${e.etapa} atrasada em ${c.atraso} dia(s)`,
        `Progresso de ${fmtPct(c.progresso, 0)} — fim previsto era ${fmtData(e.fimPrevisto)}.`,
        'Atualizar progresso ou replanejar a etapa.', { view: 'cronograma', id: e.id },
        { dias: c.atraso, ...raizEtapa });
    } else if (c.atrasoInicio > 0) {
      add('etapa-inicio-atrasado', 2, 'Cronograma', `${e.etapa} não começou — início previsto há ${c.atrasoInicio} dia(s)`,
        `Início previsto em ${fmtData(e.inicioPrevisto)}, ainda em 0%; fim previsto ${fmtData(e.fimPrevisto)}.`,
        `Cobrar o início${e.responsavel ? ` de ${e.responsavel}` : ''} ou replanejar a etapa.`, { view: 'cronograma', id: e.id },
        { dias: c.atrasoInicio, ...raizEtapa });
    }
  });

  /* Cliente (0018): decisão que o cliente deve e passou do prazo trava a
     obra — é causa própria ("decisão do cliente"), não sintoma. */
  pendenciasDoCliente(obra, hoje).vencidas.forEach((p) => {
    const dias = diasEntre(p.prazo, hoje);
    add('cliente-decisao', dias > 15 ? 3 : 2, 'Cliente',
      `Aguardando o cliente: ${String(p.descricao).length > 60 ? String(p.descricao).slice(0, 59) + '…' : p.descricao}`,
      `Prazo era ${fmtData(p.prazo)} — ${dias} dia(s) sem resposta.`,
      'Cobrar a decisão do cliente e registrar no Painel.', { view: 'painel', id: p.id },
      { dias, raiz: 'cliente-decisao', principal: true });
  });
  /* status para o cliente: informativo, não conta como pendência */
  const semStatus = diasSemStatusCliente(obra, hoje);
  if (semStatus !== null && semStatus > 14) {
    add('status-cliente', 1, 'Cliente', `Cliente sem notícia há ${semStatus} dias`,
      isISO(obra.statusEnviadoEm) ? `Último status enviado em ${fmtData(obra.statusEnviadoEm)}.` : 'Nenhum status enviado desde o início da obra.',
      'Enviar o relatório de status pelo WhatsApp (Relatórios).', { view: 'relatorio' }, { dias: semStatus });
  }

  /* Diário — ocorrência aberta é pendência com dono e prazo (0015). Ligada
     a material ou etapa, ela é causa: a etapa atrasada vira sintoma dela
     (ou do material que falta, se ele também estiver travando a frente). */
  const materialPorId = new Map(obra.materiais.map((m) => [m.id, m]));
  (obra.diario || []).forEach((d) => {
    if (d.ocorrenciaStatus !== 'aberta' || !String(d.ocorrencias || '').trim()) return;
    const dias = isISO(d.data) ? Math.max(0, diasEntre(d.data, hoje)) : 0;
    const prazo = d.ocorrenciaPrazo;
    const vencida = isISO(prazo) && prazo < hoje;
    const mat = d.ocorrenciaMaterialId ? materialPorId.get(d.ocorrenciaMaterialId) : null;
    const etapa = (mat && mat.etapa) || d.etapa || '';
    const resp = String(d.ocorrenciaResponsavel || '').trim();
    const texto = String(d.ocorrencias).trim().replace(/\s+/g, ' ');
    add('ocorrencia', vencida || dias > 7 ? 3 : 2, 'Diário',
      `Ocorrência aberta: ${texto.length > 70 ? texto.slice(0, 69) + '…' : texto}`,
      [
        `Registrada em ${fmtData(d.data)} (${dias} dia(s))`,
        etapa ? `etapa ${etapa}` : '',
        mat ? `material ${mat.material}` : '',
        resp ? `com ${resp}` : 'sem responsável',
        isISO(prazo) ? `prazo ${fmtData(prazo)}${vencida ? ' — vencido' : ''}` : '',
      ].filter(Boolean).join(' · ') + '.',
      mat
        ? `Comprar ${mat.material} e marcar a ocorrência como resolvida.`
        : `Resolver${resp ? ` com ${resp}` : ''} e marcar a ocorrência como resolvida no diário.`,
      { view: 'diario', id: d.id },
      { dias, raiz: etapa ? `etapa:${norm(etapa)}` : '', principal: !!etapa, responsavel: resp });
  });

  /* Financeiro */
  const k = kpisObra(obra);
  if (k.saldoCaixa < 0) {
    add('caixa-negativo', 3, 'Financeiro', 'Caixa da obra negativo',
      `Saldo de ${fmtMoney(k.saldoCaixa)} considerando entradas e saídas lançadas.`,
      'Antecipar recebimento ou aportar recursos.', { view: 'fluxo' },
      { valor: -k.saldoCaixa, raiz: 'financiamento' });
  }
  /* Informativo: o teto é referência de orçamento, não problema de hoje.
     Compara só custo físico — comissão, honorário, taxa e terreno ficam fora. */
  if (num(obra.fin.custoFisicoMaxM2) > 0 && k.custoFisicoPrevistoM2 > num(obra.fin.custoFisicoMaxM2)) {
    add('custo-m2', 1, 'Financeiro', 'Custo físico por m² acima do teto',
      `Previsto ${fmtMoney(k.custoFisicoPrevistoM2)}/m² de obra física contra o teto de ${fmtMoney(obra.fin.custoFisicoMaxM2)}/m².`,
      'Conferir o teto com o CUB da região e revisar escopo e compras.', { view: 'obra-config' });
  }
  if (k.margem !== null && k.margem < num(obra.fin.margemDesejada)) {
    add('margem', 2, 'Financeiro', 'Margem abaixo da desejada',
      `Projetada ${fmtPct(k.margem)} contra ${fmtPct(obra.fin.margemDesejada)} desejados.`,
      'Rever custos previstos ou o valor de venda.', { view: 'painel' },
      { valor: Math.max(0, (num(obra.fin.margemDesejada) - k.margem) * k.venda) });
  }
  if (k.etapasTotal > 0 && k.desvioFisicoFinanceiro < -0.1) {
    add('desembolso', 2, 'Produção', 'Financeiro realizado à frente do físico',
      `Físico ${fmtPct(k.progressoFisico, 0)} contra ${fmtPct(k.progressoFinanceiro, 0)} financeiro.`,
      'Conferir adiantamentos e compras antecipadas.', { view: 'curva' },
      { valor: (k.progressoFinanceiro - k.progressoFisico) * k.custoPrevisto });
  }

  /* Duplicidade suspeita */
  lancamentosDuplicados(obra).forEach((ls) => {
    /* pagar duas vezes é dinheiro saindo: atenção, não informativo */
    add('duplicado', 2, 'Lançamentos', 'Possível lançamento duplicado',
      `${ls.length} lançamentos iguais de ${fmtMoney(lancamentoTotal(ls[0]))} em ${fmtData(ls[0].data)} (${ls[0].fornecedor || 'sem fornecedor'}).`,
      'Conferir e excluir o repetido.', { view: 'lancamentos', id: ls[0].id },
      { valor: lancamentoTotal(ls[0]) * (ls.length - 1), ids: ls.map((l) => l.id) });
  });

  /* Cadastro incompleto */
  if (!obra.cronograma.length) {
    add('sem-cronograma', 1, 'Cronograma', 'Obra sem cronograma',
      'Sem etapas cadastradas não há curva S nem controle de prazo.',
      'Gerar o cronograma padrão.', { view: 'cronograma' });
  }
  if (!obra.contratos.length) {
    add('sem-contrato', 1, 'Contratos', 'Obra sem contrato cadastrado',
      'O controle de saldo contratual depende do contrato principal.',
      'Cadastrar a empreitada principal.', { view: 'contratos' });
  }

  /* Tratamento (0015): cada alerta ganha a chave, o tratamento gravado e
     se está silenciado (adiado no prazo, ou resolvido sem piorar). */
  const tratamentos = new Map((obra.tratamentos || []).map((t) => [t.chave, t]));
  out.forEach((a) => {
    a.chave = chaveAlerta(a);
    a.tratamento = tratamentos.get(a.chave) || null;
    const st = situacaoTratamento(a.tratamento, a, hoje);
    a.silenciado = st.silenciado;
    a.reaberto = st.reaberto;
  });

  return out.sort((a, b) => b.sev - a.sev || a.modulo.localeCompare(b.modulo));
}

/* Chave estável de um alerta: tipo + registro. Não usa o título, que muda
   com os dias. Alerta sem registro (caixa, margem) fica só com o tipo. */
function chaveAlerta(a) {
  return `${a.tipo}:${(a.ref && a.ref.id) || ''}`;
}

/* O que o tratamento gravado faz com o alerta de hoje:
   - piorou (gravidade subiu, ou valor subiu mais de 10%): reabre, qualquer
     que seja o status — quem marcou "resolvido" com R$ 1.000 em jogo não
     decidiu sobre R$ 5.000;
   - adiado: silencia até a data; depois reabre sozinho;
   - resolvido: silencia enquanto não piorar;
   - em tratamento: continua contando — só mostra quem está cuidando. */
function situacaoTratamento(t, a, hoje = hojeISO()) {
  if (!t) return { silenciado: false, reaberto: '' };
  if (a.sev > num(t.sevMarcada)) return { silenciado: false, reaberto: 'ficou mais grave desde a marcação' };
  if (num(a.valor) > num(t.valorMarcado) * 1.1 + 0.5) return { silenciado: false, reaberto: 'o valor em jogo subiu desde a marcação' };
  if (t.status === 'adiado') {
    return isISO(t.adiarAte) && t.adiarAte >= hoje
      ? { silenciado: true, reaberto: '' }
      : { silenciado: false, reaberto: 'o adiamento venceu' };
  }
  if (t.status === 'resolvido') return { silenciado: true, reaberto: '' };
  return { silenciado: false, reaberto: '' };
}

/* Tratamento novo (ou atualizado) para um alerta: grava a gravidade e o
   valor de agora, que são a régua do "piorou". */
function tratamentoDoAlerta(obra, a, campos = {}, hoje = hojeISO()) {
  const atual = (obra.tratamentos || []).find((t) => t.chave === a.chave);
  return {
    ...novoTratamento(obra.id, a.chave),
    ...(atual || {}),
    ...campos,
    chave: a.chave,
    sevMarcada: a.sev,
    valorMarcado: round2(Math.max(0, num(a.valor))),
    dataMarcacao: hoje
  };
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
      dica: 'Parcela do financiador, do cliente ou de recursos próprios.',
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
   painel "Pendências" e o detalhamento do KPI. */
const TIPO_PENDENCIA = {
  Contratos: 'contrato', 'Medições': 'contrato',
  Cronograma: 'prazo',
  Materiais: 'material',
  Recebimentos: 'financeiro', Financeiro: 'financeiro', 'Produção': 'financeiro', 'Lançamentos': 'financeiro',
  'Diário': 'prazo'
};

/* Pendência = alerta que pede ação: severidade 2 (atenção) ou 3 (crítico).
   Severidade 1 é aviso ("material necessário em 5 dias"): é informação,
   não entra na contagem. Antes a tela mostrava 10, 17 e 12 para a mesma
   carteira porque cada lugar contava um recorte diferente. */
function pendenciasObra(obra) {
  const todos = alertasObra(obra);
  /* adiado no prazo ou resolvido sem piorar não é pendência (0015) */
  const vivos = todos.filter((a) => !a.silenciado);
  const itens = vivos
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
    avisos: vivos.length - itens.length,
    tratados: todos.length - vivos.length,
    porTipo, porView, itens
  };
}

/* =====================================================================
   CAUSA-RAIZ — 14 alertas soltos parecem 14 problemas; quase sempre são 3.
   Agrupa as pendências (sev ≥ 2) assim:
   - alerta marcado "principal" é uma causa (parcela parada, material que
     trava etapa em andamento); os alertas com a mesma chave de raiz viram
     sintomas dela (caixa negativo sob a parcela; etapa atrasada sob o
     material que falta);
   - etapas atrasadas sem causa conhecida, com o MESMO responsável, viram
     uma causa só ("Antônio Ribeiro: 3 etapas atrasadas");
   - o resto fica sozinho.
   Valor em risco da causa = soma dos valores das causas do grupo (o
   sintoma não soma de novo: caixa negativo é consequência da parcela).
   A contagem do menu continua a de pendenciasObra — isto só organiza.
   ===================================================================== */
function causasRaizObra(obra) {
  const itens = alertasObra(obra).filter((a) => a.sev >= 2 && !a.silenciado);
  const comCausa = new Set(itens.filter((a) => a.principal && a.raiz).map((a) => a.raiz));
  const porResp = new Map();
  itens.forEach((a) => {
    if (a.modulo !== 'Cronograma' || !a.responsavel || comCausa.has(a.raiz)) return;
    const r = norm(a.responsavel);
    porResp.set(r, (porResp.get(r) || 0) + 1);
  });

  const grupos = new Map();
  const por = (chave, a) => {
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(a);
  };
  itens.forEach((a, i) => {
    if (a.raiz && comCausa.has(a.raiz)) return por(a.raiz, a);
    if (a.modulo === 'Cronograma' && a.responsavel && porResp.get(norm(a.responsavel)) >= 2) {
      return por(`resp:${norm(a.responsavel)}`, a);
    }
    return por(`solo:${i}`, a);
  });

  const ordem = (a, b) =>
    (b.principal ? 1 : 0) - (a.principal ? 1 : 0) || b.sev - a.sev || b.valor - a.valor || b.dias - a.dias;
  const causas = [...grupos.entries()].map(([chave, lista]) => {
    const alertas = lista.slice().sort(ordem);
    const principal = alertas[0];
    const causasDoGrupo = alertas.filter((a) => a.principal);
    const valor = round2((causasDoGrupo.length ? causasDoGrupo : alertas).reduce((s, a) => s + (a.valor || 0), 0));
    const base = {
      chave,
      sev: Math.max(...alertas.map((a) => a.sev)),
      valor,
      dias: Math.max(...alertas.map((a) => a.dias || 0)),
      titulo: principal.titulo,
      detalhe: principal.detalhe,
      acao: principal.acao,
      ref: principal.ref,
      modulo: principal.modulo,
      principal,
      sintomas: alertas.slice(1),
      obraId: obra.id,
      obraNome: obra.nome
    };
    if (chave.startsWith('resp:')) {
      const resp = principal.responsavel;
      base.titulo = `${resp}: ${alertas.length} etapas atrasadas`;
      base.detalhe = alertas.map((a) => a.titulo).join(' · ');
      base.acao = `Cobrar prazo e reforço de equipe de ${resp}.`;
      base.ref = { view: 'cronograma' };
      base.sintomas = alertas;
    } else if (chave === 'financiamento' && causasDoGrupo.length > 1) {
      base.titulo = `${causasDoGrupo.length} parcelas do financiamento sem crédito`;
    } else if (chave === 'cliente' && causasDoGrupo.length > 1) {
      base.titulo = `${causasDoGrupo.length} parcelas do cliente em atraso`;
    }
    return base;
  });
  return causas.sort((a, b) => b.sev - a.sev || b.valor - a.valor || b.dias - a.dias);
}

/* Frase-âncora do Painel e da Carteira: situação → causa → ação.
   Situação em no máximo três pedaços (prazo, caixa, margem); causas e ações
   são as três primeiras causas-raiz. Cada pedaço traz o nível para a cor. */
function historiaObra(obra, hoje = hojeISO()) {
  const k = kpisObra(obra);
  const p = prazoObra(obra, hoje);
  const situacao = [];
  if (p.atrasoDias > 0) {
    situacao.push({
      texto: `Atrasada ${p.atrasoDias} dias${p.termino ? ` (término projetado ${fmtData(p.termino)})` : ''}`,
      nivel: p.atrasoDias >= 30 ? 'critico' : 'atencao'
    });
  } else if (p.termino && obra.cronograma.length) {
    situacao.push({ texto: `No prazo — término projetado ${fmtData(p.termino)}`, nivel: 'ok' });
  }
  if (k.saldoCaixa < -0.005 || k.recebido > 0 || k.totalPago > 0) {
    situacao.push({ texto: `caixa ${fmtMoney(k.saldoCaixa, { dec: 0 })}`, nivel: k.saldoCaixa < -0.005 ? 'critico' : 'ok' });
  }
  if (k.margem !== null) {
    const alvo = num(obra.fin.margemDesejada);
    situacao.push({
      texto: `margem ${fmtPct(k.margem)}${alvo ? ` (alvo ${fmtPct(alvo)})` : ''}`,
      nivel: k.margem < alvo ? 'atencao' : 'ok'
    });
  }
  const todas = causasRaizObra(obra);
  const causas = todas.slice(0, 3);
  return {
    situacao,
    nivel: situacao.some((s) => s.nivel === 'critico') ? 'critico'
      : situacao.some((s) => s.nivel === 'atencao') || causas.length ? 'atencao' : 'ok',
    causas,
    causasTodas: todas,
    valorTravado: round2(causas.reduce((s, c) => s + c.valor, 0))
  };
}

/* Frase-âncora da carteira: quantas obras estão em risco e por quê, e as
   três piores causas entre todas as obras (mesma ordem de causasRaizObra). */
function historiaCarteira(obras, hoje = hojeISO()) {
  const saudes = obras.map((o) => ({ o, s: saudeObra(o, hoje), k: kpisObra(o) }));
  const risco = saudes.filter((x) => x.s.nivel === 'critico' || x.s.nivel === 'atencao');
  const caixaNeg = saudes.filter((x) => x.k.saldoCaixa < -0.005);
  const atrasadas = saudes.filter((x) => x.s.prazo.atrasoDias > 0);
  const situacao = [];
  if (!obras.length) return { situacao, nivel: 'ok', causas: [], valorTravado: 0 };
  situacao.push(risco.length
    ? { texto: `${risco.length} de ${obras.length} obra${obras.length > 1 ? 's' : ''} em risco`, nivel: risco.some((x) => x.s.nivel === 'critico') ? 'critico' : 'atencao' }
    : { texto: `${obras.length} obra${obras.length > 1 ? 's' : ''}, nenhuma em risco`, nivel: 'ok' });
  if (atrasadas.length) {
    situacao.push({ texto: `${atrasadas.length} atrasada${atrasadas.length > 1 ? 's' : ''}`, nivel: 'atencao' });
  }
  if (caixaNeg.length) {
    situacao.push({ texto: `${caixaNeg.length} com caixa negativo`, nivel: 'critico' });
  }
  const ordem = (a, b) => b.sev - a.sev || b.valor - a.valor || b.dias - a.dias;
  const causas = obras.flatMap((o) => causasRaizObra(o)).sort(ordem).slice(0, 3);
  return {
    situacao,
    nivel: situacao.some((s) => s.nivel === 'critico') ? 'critico'
      : situacao.some((s) => s.nivel === 'atencao') ? 'atencao' : 'ok',
    causas,
    valorTravado: round2(causas.reduce((s, c) => s + c.valor, 0))
  };
}

/* ------------------------------------------------------------ DIÁRIO
   Seis registros em 241 dias não é diário, é caderno. Cobertura = dias
   com registro / dias úteis (seg–sex) desde o início da obra até hoje.
   Dia impraticável = clima "Impraticável" ou "Chuva forte", ou efetivo zero
   com "parad" no texto — é o argumento concreto para aditivo de prazo. */
const CLIMAS_IMPRATICAVEIS = new Set(['Impraticável', 'Chuva forte']);

function diaImpraticavel(d) {
  if (CLIMAS_IMPRATICAVEIS.has(d.clima)) return true;
  return num(d.efetivo) === 0 && /parad/i.test(`${d.atividades || ''} ${d.ocorrencias || ''}`);
}

function diasUteisEntre(ini, fim) {
  if (!isISO(ini) || !isISO(fim) || fim < ini) return 0;
  let n = 0;
  let d = ini;
  let guard = 0;
  while (d <= fim && guard++ < 4000) {
    const dow = new Date(d + 'T12:00:00Z').getUTCDay();
    if (dow !== 0 && dow !== 6) n++;
    d = addDiasISO(d, 1);
  }
  return n;
}

/* Efetivo do dia: a soma por função, quando informada (0017); senão, o
   número digitado. */
function efetivoDiario(d) {
  const f = Array.isArray(d.efetivoFuncoes) ? d.efetivoFuncoes : [];
  return f.length ? f.reduce((s, x) => s + num(x && x.qtd), 0) : num(d.efetivo);
}

/* O diário alimenta o cronograma (0017): o primeiro registro numa etapa
   ainda sem início real vira o início real; o "% da etapa ao fim do dia"
   vira o progresso dela; 100% sem fim real fecha a etapa naquele dia.
   Devolve só o que muda — a tela aplica. */
function efeitoDiarioNaEtapa(etapa, d) {
  const mud = {};
  if (!etapa || !isISO(d.data) || norm(etapa.etapa) !== norm(d.etapa)) return mud;
  const trabalhou = String(d.atividades || '').trim() || num(d.progressoEtapa) > 0;
  if (trabalhou && (!isISO(etapa.inicioReal) || d.data < etapa.inicioReal)) mud.inicioReal = d.data;
  const p = num(d.progressoEtapa);
  if (p > 0 && Math.abs(p - num(etapa.progresso)) > 1e-9) mud.progresso = Math.min(1, p);
  if (p >= 1 && !isISO(etapa.fimReal)) mud.fimReal = d.data;
  return mud;
}

function diarioIndicadores(obra, hoje = hojeISO()) {
  const registros = (obra.diario || []).filter((d) => isISO(d.data) && d.data <= hoje);
  const datas = [...new Set(registros.map((d) => d.data))].sort();
  const inicio = isISO(obra.dataInicio) ? obra.dataInicio : datas[0] || '';
  const fim = obra.status === 'Concluída' && datas.length ? datas[datas.length - 1] : hoje;
  const uteis = diasUteisEntre(inicio, fim);
  const comRegistroUteis = datas.filter((d) => {
    const dow = new Date(d + 'T12:00:00Z').getUTCDay();
    return d >= inicio && dow !== 0 && dow !== 6;
  }).length;
  const impraticaveis = [...new Set(registros.filter(diaImpraticavel).map((d) => d.data))];
  const ultimo = datas[datas.length - 1] || '';
  return {
    registros: registros.length,
    diasComRegistro: datas.length,
    diasUteis: uteis,
    cobertura: uteis > 0 ? Math.min(1, comRegistroUteis / uteis) : null,
    diasImpraticaveis: impraticaveis.length,
    datasImpraticaveis: impraticaveis.sort(),
    comFoto: registros.filter((d) => d.fotos && d.fotos.length).length,
    ocorrenciasAbertas: registros.filter((d) => d.ocorrenciaStatus === 'aberta').length,
    ocorrenciasVencidas: registros.filter((d) => d.ocorrenciaStatus === 'aberta' &&
      isISO(d.ocorrenciaPrazo) && d.ocorrenciaPrazo < hoje).length,
    ocorrenciasResolvidas: registros.filter((d) => d.ocorrenciaStatus === 'resolvida').length,
    semRegistroHa: ultimo ? diasEntre(ultimo, hoje) : null,
    ultimo,
    /* 0017: dias que o canteiro disse que empurram o prazo */
    diasImpactoPrazo: registros.filter((d) => d.impactaPrazo === true).reduce((s, d) => s + num(d.diasImpacto), 0),
    efetivoMedio: registros.length ? registros.reduce((s, d) => s + efetivoDiario(d), 0) / registros.length : 0
  };
}

/* Medições que têm pendência: a mesma regra de pendenciasObra, não um
   recorte próprio. Antes a tela de Medições contava só o alerta estrutural
   (pago acima, contrato ultrapassado) e dizia "0" enquanto o menu e a tela
   de Alertas mostravam medições em aberto há 100 dias. */
function medicoesComPendencia(obra) {
  const ids = new Set();
  pendenciasObra(obra).itens.forEach((a) => {
    if (a.ref && a.ref.view === 'medicoes' && a.ref.id) ids.add(a.ref.id);
  });
  return ids;
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

/* =====================================================================
   VALOR AGREGADO — IDP, IDC, custo no término e término projetado.

   IDP = físico realizado / físico previsto hoje (abaixo de 1: atrasada).
   IDC = valor agregado / custo realizado, SÓ custo físico dos dois lados
         (comissão paga de uma vez distorceria). Abaixo de 1: gastando mais
         do que entregou. "A cada R$ 1 gasto, entregou R$ IDC."
   EAC = custo físico previsto / IDC + custo não físico.
   Término projetado = início + duração do cronograma / IDP — no ritmo de
   hoje, quando a obra acaba. Nunca antes de hoje se ainda falta obra.
   Atraso projetado = término projetado − data contratual. É o "atraso da
   obra": um número só, o mesmo na Carteira, no Painel e no Cronograma.
   ===================================================================== */
const IDP_MINIMO = 0.25; /* abaixo disso a projeção passaria de 4× o prazo: trava */

/* ================================ DEPENDÊNCIAS E CAMINHO CRÍTICO (0017)
   Fim→início: a etapa só começa depois que as predecessoras terminam.
   Passagem para a frente, no ritmo atual da obra (IDP, com o mesmo piso
   do término projetado):
   - concluída: termina no fim real (ou no previsto, sem real);
   - em andamento: termina em hoje + o que falta ÷ ritmo;
   - não começada: começa depois da última predecessora — e nunca antes
     de hoje nem do início previsto —, dura o previsto ÷ ritmo.
   Passagem para trás: a folga de cada etapa (quanto pode escorregar sem
   empurrar o fim da obra). Folga zero = caminho crítico.
   Dependência em ciclo é ignorada (validarDependencias avisa). */
function agendaCronograma(obra, hoje = hojeISO(), ritmoObra = null) {
  const ritmo = Math.min(1.5, Math.max(IDP_MINIMO, ritmoObra == null ? 1 : ritmoObra));
  const porId = new Map(obra.cronograma.map((e) => [e.id, e]));
  const preds = (e) => (Array.isArray(e.predecessoras) ? e.predecessoras : []).filter((id) => porId.has(id) && id !== e.id);
  const agenda = new Map();
  const visitando = new Set();

  const calcular = (e) => {
    if (agenda.has(e.id)) return agenda.get(e.id);
    if (visitando.has(e.id)) return null; /* ciclo */
    visitando.add(e.id);
    const c = etapaCalc(e, hoje);
    const dur = Math.max(1, c.diasPrevistos || 1);
    const prog = Math.min(1, Math.max(0, num(e.progresso)));
    let inicio;
    let fim;
    if (prog >= 1) {
      inicio = isISO(e.inicioReal) ? e.inicioReal : e.inicioPrevisto || hoje;
      fim = isISO(e.fimReal) ? e.fimReal : e.fimPrevisto || hoje;
    } else if (isISO(e.inicioReal)) {
      inicio = e.inicioReal;
      fim = addDias(hoje, Math.max(1, Math.round((dur * (1 - prog)) / ritmo)));
    } else {
      inicio = hoje;
      if (isISO(e.inicioPrevisto) && e.inicioPrevisto > inicio) inicio = e.inicioPrevisto;
      preds(e).forEach((id) => {
        const a = calcular(porId.get(id));
        if (a && addDias(a.fim, 1) > inicio) inicio = addDias(a.fim, 1);
      });
      fim = addDias(inicio, Math.max(1, Math.round(dur / ritmo)) - 1);
    }
    visitando.delete(e.id);
    const r = { id: e.id, etapa: e.etapa, inicio, fim, concluida: prog >= 1 };
    agenda.set(e.id, r);
    return r;
  };
  obra.cronograma.forEach((e) => calcular(e));

  const lista = [...agenda.values()];
  const termino = lista.reduce((m, a) => (a.fim > m ? a.fim : m), '');
  /* para trás: o fim mais tarde de cada etapa sem atrasar a obra */
  const sucessores = new Map(lista.map((a) => [a.id, []]));
  obra.cronograma.forEach((e) => preds(e).forEach((id) => sucessores.get(id) && sucessores.get(id).push(e.id)));
  const fimTarde = new Map();
  const tarde = (id, pilha = new Set()) => {
    if (fimTarde.has(id)) return fimTarde.get(id);
    if (pilha.has(id)) return termino;
    pilha.add(id);
    let lf = termino;
    sucessores.get(id).forEach((s) => {
      const as = agenda.get(s);
      const dur = diasEntre(as.inicio, as.fim);
      const ls = addDias(tarde(s, pilha), -dur);
      const limite = addDias(ls, -1);
      if (limite < lf) lf = limite;
    });
    pilha.delete(id);
    fimTarde.set(id, lf);
    return lf;
  };
  lista.forEach((a) => {
    a.folga = a.concluida ? null : Math.max(0, diasEntre(a.fim, tarde(a.id)));
    a.critica = !a.concluida && a.folga === 0;
  });
  return { etapas: lista, termino, critico: lista.filter((a) => a.critica).map((a) => a.id), ritmo };
}

const temDependencias = (obra) =>
  obra.cronograma.some((e) => Array.isArray(e.predecessoras) && e.predecessoras.length > 0);

function valorAgregadoObra(obra, hoje = hojeISO()) {
  const k = kpisObra(obra);
  const previsto = avancoPrevistoObra(obra, hoje);
  const real = k.progressoFisico;
  const idp = obra.cronograma.length && previsto > 0.005 ? real / previsto : null;

  const va = real * k.custoFisicoPrevisto;
  const cr = k.totalPago - k.custoNaoFisico;
  const idc = va > 0.005 && cr > 0.005 ? va / cr : null;
  const eac = idc ? k.custoFisicoPrevisto / idc + k.custoNaoFisico : k.custoPrevisto;

  const fins = obra.cronograma.map((e) => e.fimPrevisto).filter(isISO).sort();
  const inis = obra.cronograma.map((e) => e.inicioPrevisto).filter(isISO).sort();
  const fimPlano = fins[fins.length - 1] || (isISO(obra.previsaoConclusao) ? obra.previsaoConclusao : '');
  const inicio = isISO(obra.dataInicio) ? obra.dataInicio : inis[0] || '';
  const contratual = isISO(obra.previsaoConclusao) ? obra.previsaoConclusao : fimPlano;

  let termino = '';
  if (obra.cronograma.length && real >= 1 - 1e-9) {
    const reais = obra.cronograma.map((e) => e.fimReal).filter(isISO).sort();
    termino = reais[reais.length - 1] || hoje;
  } else if (idp === null) {
    termino = fimPlano;
  } else if (isISO(inicio) && isISO(fimPlano)) {
    const dur = Math.max(1, diasEntre(inicio, fimPlano));
    termino = addDiasISO(inicio, Math.round(dur / Math.max(idp, IDP_MINIMO)));
    if (termino < hoje) termino = hoje;
  }
  /* com dependências fim→início (0017), o término sai da agenda: a etapa
     que espera outra não pode acabar antes dela */
  if (termino && real < 1 - 1e-9 && temDependencias(obra)) {
    const ag = agendaCronograma(obra, hoje, idp);
    if (isISO(ag.termino)) termino = ag.termino < hoje ? hoje : ag.termino;
  }
  const atrasoProjetado = isISO(termino) && isISO(contratual) ? diasEntre(contratual, termino) : null;

  return {
    previsto, realizado: real, idp, idc,
    va, cr, eac, desvioCusto: eac - k.custoPrevisto,
    inicio, fimPlano, contratual, termino, atrasoProjetado,
    idpTravado: idp !== null && idp < IDP_MINIMO
  };
}

/* Semáforo dos índices (limiares da auditoria):
   IDP < 0,95 atenção, < 0,85 crítico · IDC < 0,97 atenção, < 0,92 crítico. */
function nivelIndice(valor, tipo) {
  if (valor === null || valor === undefined) return '';
  const [amb, verm] = tipo === 'idc' ? [0.97, 0.92] : [0.95, 0.85];
  return valor < verm ? 'critico' : valor < amb ? 'atencao' : 'ok';
}

/* Prazo: data contratual, término projetado e os dois atrasos, cada um com
   o seu nome — nunca mais um número sem rótulo.
   - desvioDias: a etapa não concluída mais atrasada ("atraso da etapa");
   - atrasoDias: o ATRASO DA OBRA = término projetado − data contratual,
     nunca menor que o da etapa mais atrasada (a obra não acaba antes dela). */
function prazoObra(obra, hoje = hojeISO()) {
  const va = valorAgregadoObra(obra, hoje);
  const fimPrevisto = va.contratual;
  const atraso = obra.cronograma.reduce((mx, e) => Math.max(mx, etapaCalc(e, hoje).atraso), 0);
  const atrasoObra = Math.max(atraso, va.atrasoProjetado === null ? 0 : va.atrasoProjetado);
  return {
    fimPrevisto,
    desvioDias: atraso,
    termino: va.termino,
    atrasoProjetado: va.atrasoProjetado,
    atrasoDias: atrasoObra,
    idp: va.idp
  };
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
  /* atraso da OBRA (término projetado × data contratual), não o da etapa */
  if (p.atrasoDias > 0) {
    motivos.push({ tipo: 'prazo', nivel: p.atrasoDias >= 30 ? 'critico' : 'atencao', texto: `Atrasada ${p.atrasoDias}d` });
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

/* Itens das listas editáveis (Ajustes) que algum registro usa, com a
   contagem: { etapas: Map('Pisos' → 12), unidades: Map('m²' → 30), … }.
   Tirar da lista um item em uso deixa o registro com um valor que o
   select não oferece — e a próxima edição o apaga sem ninguém ver. */
const CAMPOS_DE_LISTA = {
  etapas: [['cronograma', 'etapa'], ['lancamentos', 'etapa'], ['materiais', 'etapa'], ['diario', 'etapa']],
  tiposSaida: [['lancamentos', 'tipo']],
  unidades: [['contratos', 'unidade'], ['lancamentos', 'unidade'], ['materiais', 'unidade'], ['cronograma', 'unidadeProducao']],
  formasPagamento: [['lancamentos', 'formaPagamento']],
  regimes: [['contratos', 'regime']],
  origensRecebimento: [['recebimentos', 'origem']],
};

function usoItensLista(estado) {
  const uso = {};
  const conta = (lista, valor) => {
    const v = String(valor || '').trim();
    if (!v) return;
    uso[lista].set(v, (uso[lista].get(v) || 0) + 1);
  };
  Object.entries(CAMPOS_DE_LISTA).forEach(([lista, campos]) => {
    uso[lista] = new Map();
    (estado.obras || []).forEach((o) =>
      campos.forEach(([colecao, campo]) => (o[colecao] || []).forEach((r) => conta(lista, r[campo]))),
    );
  });
  uso.especialidades = new Map();
  (estado.prestadores || []).forEach((p) => conta('especialidades', p.especialidade));
  return uso;
}

/* Renomear um item de lista (Ajustes → Listas) leva o nome novo aos
   registros que usam o antigo — senão o lançamento de "Fundacao" fica
   órfão quando a lista passa a dizer "Fundação". Etapa renomeada também
   muda nas etapas ligadas aos contratos (0016) e na parcela que cita a
   etapa. Muda o estado recebido; devolve quantos registros mudaram. */
function renomearItemLista(estado, lista, de, para) {
  const antigo = String(de || '').trim();
  const novo = String(para || '').trim();
  if (!antigo || !novo || antigo === novo) return 0;
  const itens = (estado.listas && estado.listas[lista]) || [];
  const i = itens.indexOf(antigo);
  if (i < 0 || itens.includes(novo)) return 0;
  itens[i] = novo;
  const arq = estado.listas.arquivados && estado.listas.arquivados[lista];
  if (arq && arq.includes(antigo)) arq[arq.indexOf(antigo)] = novo;
  let n = 0;
  const trocar = (reg, campo) => {
    if (String(reg[campo] || '').trim() === antigo) { reg[campo] = novo; n++; }
  };
  (estado.obras || []).forEach((o) => {
    (CAMPOS_DE_LISTA[lista] || []).forEach(([colecao, campo]) => (o[colecao] || []).forEach((r) => trocar(r, campo)));
    if (lista === 'etapas') {
      o.contratos.forEach((c) => {
        if (Array.isArray(c.etapas) && c.etapas.includes(antigo)) { c.etapas = c.etapas.map((x) => (x === antigo ? novo : x)); n++; }
      });
      o.recebimentos.forEach((r) => trocar(r, 'etapaPci'));
    }
  });
  if (lista === 'especialidades') (estado.prestadores || []).forEach((p) => trocar(p, 'especialidade'));
  return n;
}

/* Nova versão de uma lista sem perder item em uso: devolve a lista
   pedida mais os itens em uso que ela tirava, e quais foram mantidos. */
function listaProtegida(uso, antes, depois) {
  const emUso = uso || new Map();
  const mantidos = (antes || []).filter((i) => !depois.includes(i) && emUso.get(i) > 0);
  return {
    lista: [...depois, ...mantidos],
    mantidos: mantidos.map((i) => ({ item: i, registros: emUso.get(i) })),
  };
}

/* Ativação de uma conta (tela Contas e acessos, admin_consumo): quantos
   dos passos que fazem o sistema valer a pena a conta já deu. Conta com
   obra e sem diário é conta que vai cancelar. */
const PASSOS_ATIVACAO = [
  ['obras', 'cadastrou obra'],
  ['contratos', 'lançou contrato'],
  ['medicoes', 'mediu'],
  ['lancamentos', 'lançou gasto'],
  ['diario', 'usa o diário'],
  ['fotos', 'tira foto'],
];

function ativacaoConta(linha) {
  const l = linha || {};
  const feitos = PASSOS_ATIVACAO.filter(([k]) => Number(l[k] || 0) > 0);
  const faltam = PASSOS_ATIVACAO.filter(([k]) => !(Number(l[k] || 0) > 0)).map(([, t]) => t);
  return { feitos: feitos.length, total: PASSOS_ATIVACAO.length, faltam };
}

/* Dias desde a última atividade; null se nunca houve. */
function diasSemAtividade(instante, agora = new Date()) {
  if (!instante) return null;
  const t = new Date(instante).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((agora.getTime() - t) / 86400000));
}

/* Alteração sensível na trilha de auditoria (migração 0003): mexe em
   dinheiro que já saiu ou entrou — valor pago, valor recebido, valor
   aprovado pela CAIXA — ou apaga um registro financeiro. É o filtro
   padrão da tela: o resto (preço de um lançamento em digitação) é ruído. */
const CAMPOS_SENSIVEIS = new Set(['valor_pago', 'valor_recebido', 'valor_aprovado']);

function alteracaoSensivel(linha) {
  if (!linha) return false;
  return linha.operacao === 'DELETE' || CAMPOS_SENSIVEIS.has(linha.campo);
}

/* Saúde dos dados (Ajustes): o que está desarrumado no cadastro, com a
   contagem e para onde ir consertar. Só aparece o que tem ocorrência.
   - nomes de prestadores a revisar (caixa alta, especialidade no nome);
   - lançamentos possivelmente duplicados (os ainda em aberto);
   - lançamentos sem etapa (ficam fora do custo por etapa);
   - contratos sem prestador do cadastro (o nome só digitado).
   `obraId` aponta a obra com mais ocorrências, para o link. */
function saudeDados(estado, hoje = hojeISO()) {
  const esp = (estado.listas && estado.listas.especialidades) || [];
  const obras = estado.obras || [];
  const porObra = (fn) => {
    let n = 0;
    let pior = null;
    obras.forEach((o) => {
      const k = fn(o);
      n += k;
      if (k && (!pior || k > pior.k)) pior = { id: o.id, k };
    });
    return { n, obraId: pior ? pior.id : '' };
  };
  const nomes = (estado.prestadores || []).filter((p) => !p.arquivado && sugestaoNomePrestador(p, esp)).length;
  const dup = porObra((o) => lancamentosDuplicadosAbertos(o, hoje).reduce((s, g) => s + g.length, 0));
  const semEtapa = porObra((o) => o.lancamentos.filter((l) => !l.etapa).length);
  const semPrest = porObra((o) =>
    o.contratos.filter((c) => c.registro !== 'Aditivo' && c.status !== 'Cancelado' && !c.prestadorId).length);
  return [
    { chave: 'nomes', titulo: 'Nomes de prestadores a revisar', detalhe: 'em caixa alta ou com a especialidade junto ao nome', n: nomes, view: 'prestadores', acao: 'prest-revisar-nomes' },
    { chave: 'duplicados', titulo: 'Lançamentos possivelmente duplicados', detalhe: 'mesmo valor, fornecedor e data', n: dup.n, view: 'lancamentos', obraId: dup.obraId, filtro: { situacao: 'duplicados' } },
    { chave: 'sem-etapa', titulo: 'Lançamentos sem etapa', detalhe: 'ficam fora do custo por etapa e da curva S', n: semEtapa.n, view: 'lancamentos', obraId: semEtapa.obraId, filtro: { situacao: 'sem-etapa' } },
    { chave: 'sem-prestador', titulo: 'Contratos sem prestador do cadastro', detalhe: 'o nome foi só digitado — a ficha do prestador não os vê', n: semPrest.n, view: 'contratos', obraId: semPrest.obraId, acao: 'vincular-prestadores' },
  ].filter((x) => x.n > 0);
}

/* Quem fez cada linha da trilha, para a coluna "Quem":
   - 'sistema': sem usuário (gatilho, rotina do banco);
   - 'importacao': inclusão numa rajada — a mesma pessoa criando 10 ou
     mais valores em 5 segundos é a planilha importada, não digitação;
   - 'usuario': o resto.
   O banco não marca a importação; a rajada é o rastro que ela deixa.
   Devolve Map(linha → origem). */
const RAJADA_MIN = 10;
const RAJADA_MS = 5000;
function origemAlteracoes(linhas) {
  const out = new Map();
  const grupos = new Map();
  linhas.forEach((l) => {
    if (!l.usuario_id) { out.set(l, 'sistema'); return; }
    out.set(l, 'usuario');
    if (l.operacao !== 'INSERT') return;
    const t = new Date(l.criado_em).getTime();
    if (!isFinite(t)) return;
    const k = `${l.usuario_id}|${Math.floor(t / RAJADA_MS)}`;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(l);
  });
  grupos.forEach((ls) => {
    if (ls.length >= RAJADA_MIN) ls.forEach((l) => out.set(l, 'importacao'));
  });
  return out;
}

/* ------------------------------------------------------ RELATÓRIOS
   Responsável técnico do relatório: o da OBRA (Configuração) e, só na
   falta, o da empresa (Ajustes). `falta` diz o que não existe em nenhum
   dos dois — é o único caso em que a tela avisa. */
function rtDoRelatorio(obra, empresa = {}) {
  const t = (v) => String(v || '').trim();
  const nome = t(obra.responsavel) || t(empresa.responsavel);
  const registro = t(obra.creaCau) || t(empresa.creaCau);
  return {
    nome,
    registro,
    origemNome: t(obra.responsavel) ? 'obra' : t(empresa.responsavel) ? 'empresa' : '',
    origemRegistro: t(obra.creaCau) ? 'obra' : t(empresa.creaCau) ? 'empresa' : '',
    falta: [!nome ? 'responsável técnico' : '', !registro ? 'CREA/CAU' : ''].filter(Boolean),
  };
}

/* Período do relatório: vazio = sem limite daquele lado. */
const noPeriodo = (data, de, ate) =>
  isISO(data) && (!isISO(de) || data >= de) && (!isISO(ate) || data <= ate);

/* Fotos do diário no período, da mais recente para a mais antiga. */
function fotosDoPeriodo(obra, de, ate, max = 12) {
  const out = [];
  (obra.diario || [])
    .filter((d) => noPeriodo(d.data, de, ate))
    .sort((a, b) => (a.data < b.data ? 1 : -1))
    .forEach((d) => {
      (d.fotos || []).forEach((f) => {
        const dados = typeof f === 'string' ? f : f && f.dados;
        if (/^data:image\/(png|jpe?g);base64,/i.test(String(dados || ''))) {
          out.push({ dados, data: d.data, etapa: d.etapa || '' });
        }
      });
    });
  return out.slice(0, max);
}

/* Prestação de contas num período: saldo anterior (saldo inicial + tudo
   o que entrou e saiu antes do início), as entradas, os pagamentos de
   medição e os lançamentos do período, e o saldo final. Sem período, é a
   obra inteira e fecha com o caixa de hoje (kpisObra). */
function prestacaoContas(obra, de = '', ate = '') {
  const antes = (d) => isISO(de) && isISO(d) && d < de;
  const entradasTodas = obra.recebimentos.filter((r) => r.status !== 'Cancelado' && num(r.valorRecebido) > 0);
  const medicoesTodas = obra.medicoes.filter((m) => m.status !== 'Cancelado' && num(m.valorPago) > 0);
  const soma = (xs, f) => round2(xs.reduce((s, x) => s + f(x), 0));
  const dataPag = (m) => m.dataPagamento || m.data;
  const saldoAnterior = round2(num(obra.fin.saldoInicial) +
    soma(entradasTodas.filter((r) => antes(r.dataRecebimento)), (r) => num(r.valorRecebido)) -
    soma(medicoesTodas.filter((m) => antes(dataPag(m))), (m) => num(m.valorPago)) -
    soma(obra.lancamentos.filter((l) => antes(l.data)), lancamentoTotal));
  const semLimite = !isISO(de) && !isISO(ate);
  const dentro = (d) => semLimite || noPeriodo(d, de, ate);
  const ordem = (f) => (a, b) => String(f(a) || '').localeCompare(String(f(b) || ''));
  const entradas = entradasTodas.filter((r) => dentro(r.dataRecebimento)).sort(ordem((r) => r.dataRecebimento));
  const medicoes = medicoesTodas.filter((m) => dentro(dataPag(m))).sort(ordem(dataPag));
  const lancamentos = obra.lancamentos.filter((l) => dentro(l.data)).sort(ordem((l) => l.data));
  const totEntradas = soma(entradas, (r) => num(r.valorRecebido));
  const totMedicoes = soma(medicoes, (m) => num(m.valorPago));
  const totLancamentos = soma(lancamentos, lancamentoTotal);
  return {
    saldoAnterior,
    entradas,
    medicoes,
    lancamentos,
    totEntradas,
    totMedicoes,
    totLancamentos,
    totSaidas: round2(totMedicoes + totLancamentos),
    saldoFinal: round2(saldoAnterior + totEntradas - totMedicoes - totLancamentos),
  };
}

/* Fotos da semana para o relatório do cliente: as do diário dos últimos
   7 dias (hoje incluído), mais recentes primeiro, só PNG/JPEG em base64
   (o que o gerador de PDF desenha). */
function fotosDaSemana(obra, hoje = hojeISO(), max = 6) {
  const desde = addDias(hoje, -6);
  const out = [];
  (obra.diario || [])
    .filter((d) => isISO(d.data) && d.data >= desde && d.data <= hoje)
    .sort((a, b) => (a.data < b.data ? 1 : -1))
    .forEach((d) => {
      (d.fotos || []).forEach((f) => {
        const dados = typeof f === 'string' ? f : f && f.dados;
        if (/^data:image\/(png|jpe?g);base64,/i.test(String(dados || ''))) {
          out.push({ dados, data: d.data, etapa: d.etapa || '' });
        }
      });
    });
  return out.slice(0, max);
}

/* Empreitada principal: área construída × preço da empreitada por m². */
function empreitadaPrincipal(obra) {
  return round2(num(obra.areaConstruida) * num(obra.fin.precoEmpreitadaM2));
}

/* Situação que os dados dizem: nada começou → Planejada; tudo a 100% →
   Concluída; o resto → Em andamento. "Paralisada" não se calcula — é a
   única que o usuário marca à mão. */
function situacaoObraCalculada(obra) {
  const k = kpisObra(obra);
  const comecou =
    k.progressoFisico > 0 ||
    obra.cronograma.some((e) => isISO(e.inicioReal)) ||
    obra.medicoes.some((m) => m.status !== 'Cancelado') ||
    obra.lancamentos.length > 0;
  if (!comecou) return 'Planejada';
  if (obra.cronograma.length && k.progressoFisico >= 1 - 1e-9) return 'Concluída';
  return 'Em andamento';
}

/* Incoerências da configuração, para o topo da tela: números que se
   contradizem e que nenhum formulário isolado pega. Todas são alerta —
   a obra pode estar certa e o dado, incompleto. */
function incoerenciasObra(obra) {
  const out = [];
  const k = kpisObra(obra);
  const teto = num(obra.fin.custoFisicoMaxM2);
  const empM2 = num(obra.fin.precoEmpreitadaM2);
  if (teto > 0 && empM2 > teto) {
    out.push({ campo: 'fin.custoFisicoMaxM2', texto: `O teto de custo físico (${fmtMoney(teto)}/m²) é menor que só a empreitada (${fmtMoney(empM2)}/m²).` });
  }
  const fins = obra.cronograma.map((e) => e.fimPrevisto).filter(isISO).sort();
  const fimPlano = fins[fins.length - 1];
  if (isISO(obra.previsaoConclusao) && fimPlano && fimPlano > obra.previsaoConclusao) {
    out.push({ campo: 'previsaoConclusao', texto: `A data contratual (${fmtData(obra.previsaoConclusao)}) é anterior ao fim do cronograma (${fmtData(fimPlano)}): o plano já entrega depois do prazo do contrato.` });
  }
  if (isISO(obra.dataInicio) && isISO(obra.previsaoConclusao) && obra.dataInicio > obra.previsaoConclusao) {
    out.push({ campo: 'dataInicio', texto: 'A data de início é depois da data contratual de entrega.' });
  }
  const fontes = num(obra.fin.saldoInicial) + num(obra.fin.valorFinanciado) + num(obra.fin.recursosProprios);
  if (fontes > 0 && k.custoPrevisto > fontes + 0.5) {
    out.push({ campo: 'fin.recursosProprios', texto: `Financiado + próprios + saldo inicial (${fmtMoney(fontes, { dec: 0 })}) não cobrem o custo previsto (${fmtMoney(k.custoPrevisto, { dec: 0 })}): faltam ${fmtMoney(k.custoPrevisto - fontes, { dec: 0 })}.` });
  }
  const calc = situacaoObraCalculada(obra);
  if (obra.status && obra.status !== 'Paralisada' && obra.status !== calc) {
    out.push({ campo: 'status', texto: `A situação marcada é "${obra.status}", mas os dados dizem "${calc}".` });
  }
  return out;
}

/* Unidade de produção que a etapa costuma ter: fundação e estrutura em
   m³, muro e calha em m, louça e esquadria em un; o resto (alvenaria,
   reboco, piso, pintura…) em m². É só sugestão — preenche a unidade
   vazia ao salvar a etapa; a escolhida pelo usuário prevalece. */
const UNIDADE_POR_ETAPA = [
  [/funda|estrutur|concret|laje|sapata|baldrame/, 'm³'],
  [/muro|calha|rufo|meio-fio|cerca/, 'm'],
  [/louc|metais|porta|esquadri|janela|fossa|sumidouro|bancada|marmore|instala|eletroduto/, 'un'],
];

function unidadeSugeridaEtapa(etapa) {
  const n = norm(etapa || '');
  if (!n) return '';
  const achou = UNIDADE_POR_ETAPA.find(([re]) => re.test(n));
  return achou ? achou[1] : 'm²';
}

/* Saúde do cliente: a da obra dele em pior estado. Cliente sem obra não
   tem saúde (null) — a tela mostra a situação do cadastro. */
function saudeCliente(obras, hoje = hojeISO()) {
  if (!obras || !obras.length) return null;
  return obras.map((o) => saudeObra(o, hoje)).sort((a, b) => a.ordem - b.ordem)[0];
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

/* Próximos N dias de UMA obra, para o painel do cronograma: etapas que
   começam ou terminam, material que precisa estar na obra e parcela do
   financiador (medição) esperada — em ordem de data. `quem` é o
   responsável (etapa) ou a origem (parcela). */
function agendaObra(obra, hoje = hojeISO(), dias = 14) {
  const limite = addDiasISO(hoje, dias);
  const dentro = (d) => isISO(d) && d >= hoje && d <= limite;
  const out = [];
  obra.cronograma.forEach((e) => {
    const nome = e.etapa || 'Etapa';
    if (num(e.progresso) >= 1) return;
    if (!isISO(e.inicioReal) && dentro(e.inicioPrevisto)) {
      out.push({ data: e.inicioPrevisto, tipo: 'etapa-inicio', texto: `${nome} começa`, quem: e.responsavel || '', view: 'cronograma' });
    }
    if (dentro(e.fimPrevisto)) {
      out.push({ data: e.fimPrevisto, tipo: 'etapa-fim', texto: `${nome} termina`, quem: e.responsavel || '', view: 'cronograma' });
    }
  });
  obra.materiais.forEach((m) => {
    if (m.status === 'Cancelado' || !dentro(m.dataNecessaria)) return;
    if (!(materialCalc(obra, m).saldo > 0)) return;
    out.push({ data: m.dataNecessaria, tipo: 'material', texto: `Entrega: ${m.material || 'material'}`, quem: m.etapa || '', view: 'materiais' });
  });
  obra.recebimentos.forEach((r) => {
    if (r.status === 'Recebido' || r.status === 'Cancelado' || !dentro(r.dataPrevista)) return;
    const n = r.numeroMedicao ? `Medição ${r.numeroMedicao}` : 'Parcela';
    out.push({ data: r.dataPrevista, tipo: 'medicao', texto: `${n} esperada${r.etapaPci ? ` · ${r.etapaPci}` : ''}`, quem: r.origem || '', view: 'recebimentos' });
  });
  const ordem = { 'etapa-inicio': 0, 'etapa-fim': 1, material: 2, medicao: 3 };
  return out.sort((a, b) => a.data.localeCompare(b.data) || ordem[a.tipo] - ordem[b.tipo]);
}

/* Etapas por responsável: quantas em andamento, quantas atrasadas (fim
   vencido ou início vencido) e o maior atraso — é com quem se liga
   primeiro. O prestador do cadastro vem junto, para o WhatsApp. */
function responsaveisCronograma(obra, prestadores = [], hoje = hojeISO()) {
  const grupos = new Map();
  obra.cronograma.forEach((e) => {
    const nome = String(e.responsavel || '').trim();
    if (!nome) return;
    const c = etapaCalc(e, hoje);
    if (c.situacao === 'CONCLUÍDO') return;
    const g = grupos.get(nome) || { nome, emAndamento: 0, atrasadas: 0, maiorAtraso: 0, etapas: [] };
    if (isISO(e.inicioReal)) g.emAndamento++;
    const atraso = Math.max(c.atraso, c.atrasoInicio);
    if (atraso > 0) g.atrasadas++;
    g.maiorAtraso = Math.max(g.maiorAtraso, atraso);
    g.etapas.push(e.etapa || '');
    grupos.set(nome, g);
  });
  return [...grupos.values()]
    .map((g) => ({ ...g, prestador: prestadores.find((p) => !p.arquivado && ligadoAoPrestador(p, '', g.nome)) || null }))
    .sort((a, b) => b.atrasadas - a.atrasadas || b.maiorAtraso - a.maiorAtraso || a.nome.localeCompare(b.nome, 'pt'));
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
  /* data da medição em aberto mais antiga: quem espera há mais tempo */
  let aPagarDesde = '';
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
      if (isISO(m.data) && medicaoAPagar(o, m) > 0.005 && (!aPagarDesde || m.data < aPagarDesde)) {
        aPagarDesde = m.data;
      }
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
    aPagarAgora: round2(aPagarAgora), aMedir: round2(aMedir), aPagarDesde, obras, pagamentos,
    qtdContratos, qtdMedicoesPagas, qtdLancamentos,
    /* Sem contrato, "Contratado R$ 0" e "A pagar agora R$ 0" seriam falsos: não
       é que não haja nada a pagar, é que não há contrato para comparar. */
    temContrato: qtdContratos > 0,
    /* com qualquer vínculo, só pode ser arquivado — nunca apagado */
    temVinculo: obras.length > 0
  };
}

/* Ordem padrão da lista de prestadores: quem tem conta a receber há mais
   tempo primeiro (aPagarDesde crescente); depois, pelo nome. */
function compararPrestadorAPagar(a, b) {
  const da = a.r.aPagarDesde, db = b.r.aPagarDesde;
  if (da && db && da !== db) return da < db ? -1 : 1;
  if (da && !db) return -1;
  if (!da && db) return 1;
  return String(a.p.nome || '').localeCompare(String(b.p.nome || ''), 'pt');
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

/* A faixa de KPIs de Prestadores: quantos estão ativos (serviço ×
   fornecedor), quanto já foi pago, quanto está a pagar agora — e há
   quanto tempo espera quem espera mais — e a pontualidade de todos
   juntos (entregas no prazo ÷ entregas com prazo). Arquivados ficam fora. */
function indicadoresPrestadores(estado, hoje = hojeISO()) {
  const ativos = estado.prestadores.filter((p) => !p.arquivado);
  const t = totaisPrestadores(estado, ativos);
  let comSaldo = 0, desde = '', entregas = 0, noPrazo = 0, atrasadasAgora = 0;
  ativos.forEach((p) => {
    const r = resumoPrestador(estado, p);
    if (r.aPagarAgora > 0.005) comSaldo++;
    if (r.aPagarDesde && (!desde || r.aPagarDesde < desde)) desde = r.aPagarDesde;
    const pt = pontualidadePrestador(estado, p, hoje);
    entregas += pt.entregas;
    noPrazo += pt.noPrazo;
    atrasadasAgora += pt.atrasadasAgora;
  });
  const fornecedores = ativos.filter((p) => p.tipo === 'fornecedor').length;
  return {
    ativos: ativos.length,
    fornecedores,
    servico: ativos.length - fornecedores,
    pago: round2(t.pago),
    aPagarAgora: round2(t.aPagarAgora),
    comSaldo,
    esperaMaisAntiga: desde ? Math.max(0, diasEntre(desde, hoje)) : null,
    entregas,
    noPrazo,
    pontualidade: entregas ? noPrazo / entregas : null,
    atrasadasAgora,
  };
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

/* Pontualidade calculada do prestador — no lugar das estrelas digitadas.
   Cada entrega com data prometida conta uma vez:
   - numa obra onde ele é responsável por etapas do cronograma, as etapas
     (fim previsto × fim real, ou hoje se ainda não acabou);
   - senão, os contratos dele (fim vigente × encerramento ou última
     medição, ou hoje se ainda não acabou).
   Entrega ainda aberta só conta se o prazo já passou (está atrasada).
   Obras simultâneas: obras com etapa começada e não concluída, ou
   contrato em andamento, hoje. */
function pontualidadePrestador(estado, p, hoje = hojeISO()) {
  const entregas = [];
  const ativas = new Set();
  estado.obras.forEach((o) => {
    const etapas = o.cronograma.filter((e) => ligadoAoPrestador(p, '', e.responsavel));
    if (etapas.length) {
      etapas.forEach((e) => {
        const feita = num(e.progresso) >= 1;
        if (isISO(e.inicioReal) && !feita) ativas.add(o.id);
        if (!isISO(e.fimPrevisto)) return;
        if (feita) {
          const fim = isISO(e.fimReal) ? e.fimReal : e.fimPrevisto;
          entregas.push({ obraId: o.id, item: e.etapa, atraso: Math.max(0, diasEntre(e.fimPrevisto, fim)), aberta: false });
        } else if (hoje > e.fimPrevisto) {
          entregas.push({ obraId: o.id, item: e.etapa, atraso: diasEntre(e.fimPrevisto, hoje), aberta: true });
        }
      });
      return;
    }
    const bases = new Set(o.contratos
      .filter((c) => c.status !== 'Cancelado' && ligadoAoPrestador(p, c.prestadorId, c.prestador))
      .map((c) => c.codigoBase || c.codigo).filter(Boolean));
    bases.forEach((base) => {
      const registros = o.contratos.filter((c) => (c.codigoBase || c.codigo) === base);
      const principal = registros.find((c) => c.registro === 'Contrato') || registros[0] || {};
      const fim = contratoFimVigente(registros);
      const sit = contratoSituacao(o, base, hoje);
      const concluido = sit.chave === 'encerrado' || sit.chave === 'a-pagar';
      if (!concluido && (sit.chave === 'em-andamento' || sit.chave === 'atrasado')) ativas.add(o.id);
      if (!isISO(fim)) return;
      if (concluido) {
        const datas = o.medicoes.filter((m) => m.contratoBase === base && isISO(m.data)).map((m) => m.data).sort();
        const entrega = isISO(principal.dataEncerramento) ? principal.dataEncerramento : datas[datas.length - 1] || fim;
        entregas.push({ obraId: o.id, item: base, atraso: Math.max(0, diasEntre(fim, entrega)), aberta: false });
      } else if (hoje > fim && sit.chave !== 'paralisado' && sit.chave !== 'rescindido') {
        entregas.push({ obraId: o.id, item: base, atraso: diasEntre(fim, hoje), aberta: true });
      }
    });
  });
  const atrasadas = entregas.filter((e) => e.atraso > 0);
  return {
    entregas: entregas.length,
    noPrazo: entregas.length - atrasadas.length,
    pontualidade: entregas.length ? (entregas.length - atrasadas.length) / entregas.length : null,
    diasMedios: atrasadas.length ? Math.round(atrasadas.reduce((s, e) => s + e.atraso, 0) / atrasadas.length) : 0,
    atrasadasAgora: entregas.filter((e) => e.aberta).length,
    obrasSimultaneas: ativas.size,
    detalhe: entregas,
  };
}

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
  renomearItemLista,
  saudeDados,
  origemAlteracoes,
  rtDoRelatorio,
  fotosDoPeriodo,
  prestacaoContas,
  CATEGORIAS_SAIDA,
  categoriaLancamento,
  lancamentosPorMes,
  composicaoPorTipo,
  gastoPorEtapa,
  lancamentosDuplicadosAbertos,
  analiseFluxo,
  PASSOS_FINANCIAMENTO,
  PASSOS_CLIENTE,
  andamentoParcela,
  condicaoParcela,
  podeSolicitar,
  indicadoresRecebimentos,
  curvaRecebimentos,
  historicoParcela,
  resumoMateriais,
  resumoMedicoes,
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
  medicoesComPendencia,
  chaveAlerta,
  situacaoTratamento,
  tratamentoDoAlerta,
  causasRaizObra,
  historiaObra,
  historiaCarteira,
  diarioIndicadores,
  diaImpraticavel,
  pendenciasCarteira,
  recebimentoDoFinanciamento,
  lancamentoCustoFisico,
  caixaCarteira,
  avancoPrevistoObra,
  avancoCarteira,
  prazoObra,
  valorAgregadoObra,
  nivelIndice,
  estouroContratos,
  saudeObra,
  saudeCliente,
  agendaCronograma,
  temDependencias,
  efetivoDiario,
  efeitoDiarioNaEtapa,
  nomeFinanciador,
  fisicoFinanciador,
  PROCESSO_PARCELA,
  processoParcela,
  parcelasFinanciador,
  proximaParcelaFinanciador,
  liberadoExecutado,
  resumoRecebimentos,
  eventosProjetados,
  consolidarFluxo,
  fluxoProjetado,
  fluxoProjetadoCarteira,
  custoPorEtapa,
  pendenciasDoCliente,
  diasSemStatusCliente,
  ultimoStatusCliente,
  orcadoRealizadoPorEtapa,
  memoriaMedicao,
  medidoFisicoContrato,
  empreitadaPrincipal,
  fotosDaSemana,
  situacaoObraCalculada,
  incoerenciasObra,
  lancamentoNatureza,
  lancamentosDuplicados,
  resumoLancamentos,
  coberturaPlanoMateriais,
  unidadeSugeridaEtapa,
  medicaoPagamento,
  medicoesEmAberto,
  alteracaoSensivel,
  usoItensLista,
  ativacaoConta,
  diasSemAtividade,
  listaProtegida,
  riscoCarteira,
  agendaCarteira,
  agendaObra,
  responsaveisCronograma,
  curvaSCarteira,
  ORDEM_SAUDE,
  ligadoAoPrestador,
  resumoPrestador,
  totaisPrestadores,
  indicadoresPrestadores,
  prestadoresPagosSemContrato,
  previaVinculoPrestadores,
  avaliacaoPrestador,
  duplicadosPrestador,
  pontualidadePrestador,
  compararPrestadorAPagar,
  CRITERIOS_AVAL,
  capitalizarNome,
  sugestaoNomePrestador
};
