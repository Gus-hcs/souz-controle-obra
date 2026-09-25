/**
 * validacao.js — Regras de integridade: o que impede um registro de ser gravado.
 *
 * Cada função recebe um registro e devolve uma lista de problemas. Lista vazia
 * significa que pode gravar. Não lança exceção, não toca em DOM, não conhece
 * banco — igual a calculos.js.
 *
 * Dois níveis de gravidade:
 *
 *   'erro'   — dado impossível ou corrompido (valor negativo onde não cabe,
 *              fração fora de 0–100%, fim antes do início, campo obrigatório
 *              vazio). Bloqueia a gravação e tem CHECK equivalente em
 *              db/migracoes/0002_validacao.sql.
 *
 *   'alerta' — situação incomum mas legítima (pagamento adiantado, contrato no
 *              limite). Não bloqueia: a tela mostra e o usuário decide. Não vira
 *              CHECK, porque o banco não deve recusar um adiantamento real.
 *
 * A lista de status (Planejado, Em andamento…) é personalizável pelo usuário em
 * Ajustes, então status inválido também é 'alerta', nunca 'erro' — o banco não
 * conhece a lista de cada empresa.
 */
import {
  CONDICOES_PAGAMENTO,
  FORMAS_PRECO,
  isISO,
  num,
  PAPEIS_OBRA,
  PLANOS,
  SITUACOES_MANUAIS_CONTRATO,
  STATUS_ADITIVO,
  STATUS_OCORRENCIA,
  STATUS_TRATAMENTO,
  TIPOS_ADITIVO,
  hojeISO,
} from '../nucleo/base.js';
import { motivoTelefoneInvalido } from '../nucleo/contato.js';

const REGISTROS_CONTRATO = ['Contrato', 'Aditivo'];
const TIPOS_ADITIVO_VALIDOS = TIPOS_ADITIVO.map((x) => x.v);
const STATUS_ADITIVO_VALIDOS = STATUS_ADITIVO.map((x) => x.v);
const CONDICOES_PAGAMENTO_VALIDAS = CONDICOES_PAGAMENTO.map((x) => x.v);
const FORMAS_PRECO_VALIDAS = FORMAS_PRECO.map((x) => x.v);

/* monta um problema */
const problema = (campo, mensagem, sev = 'erro') => ({ campo, mensagem, sev });

/* lê um campo financeiro da obra aceitando as três formas em que ele aparece:
   aninhado (o.fin.x), acumulado do formulário da configuração (o['fin.x']) e
   plano do formulário de nova obra (o.x). */
const campoFin = (o, chave) => {
  if (o[`fin.${chave}`] !== undefined) return o[`fin.${chave}`];
  if (o.fin && o.fin[chave] !== undefined) return o.fin[chave];
  return o[chave];
};

/* acrescenta um 'erro' para cada campo numérico negativo */
function naoNegativo(pares, ler, saida) {
  pares.forEach(([campo, rotulo]) => {
    if (num(ler(campo)) < 0) saida.push(problema(campo, `${rotulo} não pode ser negativo.`));
  });
}

/* fim não pode ser anterior ao início, quando as duas datas existem */
function ordemDatas(reg, inicio, fim, rotulo, saida) {
  if (isISO(reg[inicio]) && isISO(reg[fim]) && reg[fim] < reg[inicio]) {
    saida.push(problema(fim, `${rotulo}: o fim (${reg[fim]}) é anterior ao início (${reg[inicio]}).`));
  }
}

/* fração acumulada precisa ficar entre 0 e 1 (0% e 100%) */
function fracao(reg, campo, rotulo, saida) {
  const v = num(reg[campo]);
  if (v < 0 || v > 1) {
    saida.push(problema(campo, `${rotulo} deve ficar entre 0% e 100% — valor lido: ${(v * 100).toFixed(1)}%.`));
  }
}

/* --------------------------------------------------------------- OBRA */
function validarObra(o) {
  const out = [];
  if (!String(o.nome || '').trim()) out.push(problema('nome', 'A obra precisa de um nome.'));

  naoNegativo([
    ['areaConstruida', 'Área construída'],
    ['areaMuro', 'Área de muro'],
  ], (c) => o[c], out);

  naoNegativo([
    ['valorTerreno', 'Valor do terreno'],
    ['valorFinanciado', 'Valor financiado'],
    ['recursosProprios', 'Recursos próprios'],
    ['precoEmpreitadaM2', 'Preço de empreitada por m²'],
    ['custoFisicoMaxM2', 'Custo físico máximo por m²'],
    ['valorVenda', 'Valor de venda'],
  ], (c) => campoFin(o, c), out);
  /* saldoInicial pode ser negativo — a obra pode começar no vermelho. */

  const margem = num(campoFin(o, 'margemDesejada'));
  if (margem < 0 || margem > 1) {
    out.push(problema('margemDesejada', 'A margem desejada deve ficar entre 0% e 100%.'));
  }

  ordemDatas(o, 'dataInicio', 'previsaoConclusao', 'Prazo da obra', out);

  /* financiador (0016): nome livre, curto — CHECK chk_obra_financiador */
  if (String(campoFin(o, 'financiador') || '').length > 80) {
    out.push(problema('financiador', 'O nome do financiador tem no máximo 80 caracteres.'));
  }
  return out;
}

/* ---------------------------------------------------------- CONTRATO */
function validarContrato(c) {
  const out = [];
  if (!String(c.codigo || '').trim()) out.push(problema('codigo', 'O contrato precisa de um código.'));

  if (c.registro && !REGISTROS_CONTRATO.includes(c.registro)) {
    out.push(problema('registro', `Tipo de registro inválido: "${c.registro}". Use Contrato ou Aditivo.`));
  }

  naoNegativo([
    ['quantidade', 'Quantidade'],
    ['precoUnitario', 'Preço unitário'],
    ['valorInformado', 'Valor fechado'],
  ], (k) => c[k], out);

  ordemDatas(c, 'inicioPrevisto', 'fimPrevisto', 'Prazo do contrato', out);

  /* Avaliação do prestador ao concluir: 1 a 5, ou 0 = não avaliado. */
  for (const [k, rot] of [['avalPrazo', 'prazo'], ['avalQualidade', 'qualidade'], ['avalOrganizacao', 'organização']]) {
    const v = num(c[k]);
    if (v !== 0 && !(Number.isInteger(v) && v >= 1 && v <= 5)) {
      out.push(problema(k, `A nota de ${rot} vai de 1 a 5.`));
    }
  }

  /* Aditivo: tipo, status e o novo prazo (só faz sentido com tipo "prazo"). */
  if (c.registro === 'Aditivo' && String(c.tipoAditivo || '').trim() && !TIPOS_ADITIVO_VALIDOS.includes(c.tipoAditivo)) {
    out.push(problema('tipoAditivo', `Tipo de aditivo inválido: "${c.tipoAditivo}".`));
  }
  if (String(c.statusAditivo || '').trim() && !STATUS_ADITIVO_VALIDOS.includes(c.statusAditivo)) {
    out.push(problema('statusAditivo', `Status de aditivo inválido: "${c.statusAditivo}".`));
  }
  if (c.registro === 'Aditivo' && c.tipoAditivo === 'prazo' && !isISO(c.novoPrazoAditivo)) {
    out.push(problema('novoPrazoAditivo', 'Aditivo de prazo precisa do novo prazo.'));
  }
  if (c.registro === 'Aditivo' && (c.statusAditivo === 'aprovado' || c.statusAditivo === 'recusado')
      && !String(c.motivoAditivo || '').trim()) {
    out.push(problema('motivoAditivo', 'Informe o motivo ao aprovar ou recusar o aditivo.', 'alerta'));
  }

  /* Condição de pagamento, retenção e forma de preço do contrato. */
  if (String(c.condicaoPagamento || '').trim() && !CONDICOES_PAGAMENTO_VALIDAS.includes(c.condicaoPagamento)) {
    out.push(problema('condicaoPagamento', `Condição de pagamento inválida: "${c.condicaoPagamento}".`));
  }
  if (String(c.formaPreco || '').trim() && !FORMAS_PRECO_VALIDAS.includes(c.formaPreco)) {
    out.push(problema('formaPreco', `Forma de preço inválida: "${c.formaPreco}".`));
  }
  fracao(c, 'retencaoPct', 'A retenção', out);

  /* Situação manual: só Paralisado ou Rescindido — o resto é calculado. */
  if (String(c.situacaoManual || '').trim() && !SITUACOES_MANUAIS_CONTRATO.includes(c.situacaoManual)) {
    out.push(problema('situacaoManual', `Situação manual inválida: "${c.situacaoManual}". Use Paralisado ou Rescindido.`));
  }
  if (c.situacaoManual && !String(c.motivoSituacaoManual || '').trim()) {
    out.push(problema('motivoSituacaoManual', `Informe o motivo de marcar o contrato como ${c.situacaoManual}.`, 'alerta'));
  }

  ordemDatas(c, 'fimPrevisto', 'dataEncerramento', 'Encerramento do contrato', out);
  return out;
}

/* ---------------------------------------------------------- MEDIÇÃO */
function validarMedicao(m) {
  const out = [];
  if (!String(m.contratoBase || '').trim()) {
    out.push(problema('contratoBase', 'Selecione o contrato da medição.'));
  }

  naoNegativo([
    ['valorMedido', 'Valor medido'],
    ['desconto', 'Desconto / retenção'],
    ['valorPago', 'Valor pago'],
  ], (k) => m[k], out);

  fracao(m, 'progresso', 'Progresso da medição', out);

  if (num(m.desconto) > num(m.valorMedido)) {
    out.push(problema('desconto', 'O desconto não pode ser maior que o valor medido.'));
  }

  const liquido = Math.max(0, num(m.valorMedido) - num(m.desconto));
  if (num(m.valorPago) > liquido + 0.005) {
    out.push(problema(
      'valorPago',
      `Valor pago acima do líquido medido (${liquido.toFixed(2)}). Confirme se é adiantamento.`,
      'alerta',
    ));
  }
  return out;
}

/* ------------------------------------------------------ RECEBIMENTO */
function validarRecebimento(r) {
  const out = [];
  naoNegativo([
    ['valorPrevisto', 'Valor previsto'],
    ['valorAprovado', 'Valor aprovado'],
    ['descontos', 'Descontos / tarifas'],
    ['valorRecebido', 'Valor recebido'],
  ], (k) => r[k], out);

  fracao(r, 'percentObra', 'Percentual de obra informado', out);
  /* parcela por marco físico (0016) — CHECKs chk_receb_exigido e
     chk_receb_processo */
  fracao(r, 'percentExigido', 'Percentual de obra exigido', out);
  if (isISO(r.dataVistoria) && isISO(r.dataSolicitacao) && r.dataVistoria < r.dataSolicitacao) {
    out.push(problema('dataVistoria', 'A vistoria não pode ser antes da solicitação.'));
  }
  if (isISO(r.dataAprovacao) && isISO(r.dataVistoria) && r.dataAprovacao < r.dataVistoria) {
    out.push(problema('dataAprovacao', 'A aprovação não pode ser antes da vistoria.'));
  }
  /* crédito antes da aprovação acontece (adiantamento): só alerta */
  if (isISO(r.dataRecebimento) && isISO(r.dataAprovacao) && r.dataRecebimento < r.dataAprovacao) {
    out.push(problema('dataRecebimento', 'O crédito ficou antes da aprovação — confira as datas.', 'alerta'));
  }

  if (num(r.valorAprovado) > 0 && num(r.descontos) > num(r.valorAprovado)) {
    out.push(problema('descontos', 'Os descontos passam do valor aprovado.', 'alerta'));
  }
  return out;
}

/* ------------------------------------------------------- LANÇAMENTO */
function validarLancamento(l) {
  const out = [];
  if (!String(l.descricao || '').trim()) {
    out.push(problema('descricao', 'O lançamento precisa de uma descrição.'));
  }
  naoNegativo([
    ['quantidade', 'Quantidade'],
    ['precoUnitario', 'Preço unitário'],
    ['desconto', 'Desconto'],
    ['frete', 'Frete / acréscimo'],
  ], (k) => l[k], out);
  return out;
}

/* -------------------------------------------------------- MATERIAL */
function validarMaterial(m) {
  const out = [];
  if (!String(m.material || '').trim()) out.push(problema('material', 'Informe o material.'));
  if (!String(m.etapa || '').trim()) out.push(problema('etapa', 'Informe a etapa do material.'));
  naoNegativo([
    ['quantidadeNecessaria', 'Quantidade necessária'],
    ['precoPrevisto', 'Preço previsto'],
  ], (k) => m[k], out);
  return out;
}

/* --------------------------------------------------- ETAPA (crono) */
function validarEtapa(e) {
  const out = [];
  if (!String(e.etapa || '').trim()) out.push(problema('etapa', 'A etapa precisa de um nome.'));
  fracao(e, 'progresso', 'Progresso da etapa', out);
  if (num(e.quantidadeExecutada) < 0) {
    out.push(problema('quantidadeExecutada', 'A quantidade executada não pode ser negativa.'));
  }
  if (num(e.peso) < 0) out.push(problema('peso', 'O peso na curva S não pode ser negativo.'));
  /* planilha do financiador (0016) — CHECKs chk_crono_peso_fin e chk_crono_item_fin */
  fracao(e, 'pesoFinanciador', 'Peso na planilha do financiador', out);
  if (String(e.itemFinanciador || '').length > 40) {
    out.push(problema('itemFinanciador', 'O item do financiador tem no máximo 40 caracteres.'));
  }
  ordemDatas(e, 'inicioPrevisto', 'fimPrevisto', 'Prazo previsto da etapa', out);
  ordemDatas(e, 'inicioReal', 'fimReal', 'Prazo real da etapa', out);
  return out;
}

/* A planilha do financiador como um todo: os pesos precisam somar 100%
   para o "% pelo financiador" fazer sentido. Depende do conjunto de
   etapas (não cabe num CHECK de linha): alerta. */
function validarPlanilhaFinanciador(cronograma) {
  const out = [];
  const soma = (cronograma || []).reduce((s, e) => s + num(e.pesoFinanciador), 0);
  if (soma > 0 && Math.abs(soma - 1) > 0.005) {
    out.push(problema('pesoFinanciador',
      `Os pesos da planilha do financiador somam ${(soma * 100).toFixed(1)}%, não 100%.`, 'alerta'));
  }
  return out;
}

/* Etapas do contrato (0016): nomes que não existem no cronograma não
   entram no físico do contrato. Lista personalizável: alerta. */
function validarEtapasContrato(c, cronograma) {
  const out = [];
  if (c.etapas != null && !Array.isArray(c.etapas)) {
    out.push(problema('etapas', 'As etapas do contrato devem ser uma lista.'));
    return out;
  }
  const nomes = new Set((cronograma || []).map((e) => String(e.etapa || '').trim()));
  const soltas = (c.etapas || []).filter((n) => !nomes.has(String(n).trim()));
  if (soltas.length) {
    out.push(problema('etapas', `Etapa fora do cronograma: ${soltas.join(', ')}.`, 'alerta'));
  }
  return out;
}

/* ------------------------------------------------------- DIÁRIO */
function validarDiario(d) {
  const out = [];
  if (!isISO(d.data)) out.push(problema('data', 'O registro do diário precisa de uma data válida.'));
  if (num(d.efetivo) < 0) out.push(problema('efetivo', 'O efetivo não pode ser negativo.'));
  out.push(...validarOcorrencia(d));
  out.push(...validarDiarioCampo(d));
  return out;
}

/* Diário de campo (0017) — espelha os CHECKs chk_diario_campo_*. */
function validarDiarioCampo(d) {
  const out = [];
  fracao(d, 'progressoEtapa', '% da etapa ao fim do dia', out);
  const dias = num(d.diasImpacto);
  if (dias < 0 || dias > 365 || !Number.isInteger(dias)) {
    out.push(problema('diasImpacto', 'Os dias de impacto no prazo vão de 0 a 365, inteiros.'));
  }
  if (dias > 0 && d.impactaPrazo !== true) {
    out.push(problema('diasImpacto', 'Marque "impacta o prazo" para informar dias de impacto.'));
  }
  if (String(d.equipamentos || '').length > 500) {
    out.push(problema('equipamentos', 'Equipamentos: no máximo 500 caracteres.'));
  }
  for (const k of ['climaManha', 'climaTarde']) {
    if (String(d[k] || '').length > 40) out.push(problema(k, 'Clima: no máximo 40 caracteres.'));
  }
  if (d.efetivoFuncoes != null && !Array.isArray(d.efetivoFuncoes)) {
    out.push(problema('efetivoFuncoes', 'O efetivo por função deve ser uma lista.'));
    return out;
  }
  const funcoes = d.efetivoFuncoes || [];
  if (funcoes.some((f) => !String((f && f.funcao) || '').trim() || !Number.isInteger(num(f.qtd)) || num(f.qtd) < 0)) {
    out.push(problema('efetivoFuncoes', 'Cada função precisa de nome e de uma quantidade inteira, zero ou mais.'));
  }
  /* efetivo digitado diferente da soma por função: alerta (vale a soma) */
  const soma = funcoes.reduce((s, f) => s + num(f && f.qtd), 0);
  if (funcoes.length && num(d.efetivo) > 0 && num(d.efetivo) !== soma) {
    out.push(problema('efetivo', `O efetivo (${num(d.efetivo)}) não bate com a soma por função (${soma}) — vale a soma.`, 'alerta'));
  }
  return out;
}

/* Dependências do cronograma (0017): predecessora que não existe ou
   ciclo (A espera B que espera A) — dependem do conjunto, não cabem num
   CHECK de linha: alerta. A agenda ignora o ciclo. */
function validarDependencias(cronograma) {
  const out = [];
  const lista = cronograma || [];
  const porId = new Map(lista.map((e) => [e.id, e]));
  lista.forEach((e) => {
    if (e.predecessoras != null && !Array.isArray(e.predecessoras)) {
      out.push(problema('predecessoras', `As predecessoras de "${e.etapa}" devem ser uma lista.`));
      return;
    }
    const soltas = (e.predecessoras || []).filter((id) => !porId.has(id));
    if (soltas.length) {
      out.push(problema('predecessoras', `"${e.etapa}" depende de etapa que não existe mais.`, 'alerta'));
    }
  });
  const estado = new Map();
  let ciclo = '';
  const visitar = (e) => {
    if (ciclo) return;
    estado.set(e.id, 1);
    (Array.isArray(e.predecessoras) ? e.predecessoras : []).forEach((id) => {
      const p = porId.get(id);
      if (!p || ciclo) return;
      if (estado.get(id) === 1) ciclo = `${p.etapa} ↔ ${e.etapa}`;
      else if (!estado.has(id)) visitar(p);
    });
    estado.set(e.id, 2);
  };
  lista.forEach((e) => { if (!estado.has(e.id)) visitar(e); });
  if (ciclo) out.push(problema('predecessoras', `Dependência em ciclo: ${ciclo}. A agenda ignora o ciclo.`, 'alerta'));
  return out;
}

/* Ocorrência como pendência (migração 0015) — espelha os CHECKs
   chk_diario_ocorr_*. Status vazio = só registro, nada a validar além. */
const STATUS_OCORRENCIA_VALIDOS = STATUS_OCORRENCIA.map((x) => x.v);
function validarOcorrencia(d) {
  const out = [];
  const st = d.ocorrenciaStatus || '';
  if (!st) return out;
  if (!STATUS_OCORRENCIA_VALIDOS.includes(st)) {
    out.push(problema('ocorrenciaStatus', `Situação da ocorrência inválida: "${st}".`));
  }
  if (!String(d.ocorrencias || '').trim()) {
    out.push(problema('ocorrencias', 'Descreva a ocorrência para ela virar pendência.'));
  }
  if (isISO(d.ocorrenciaPrazo) && isISO(d.data) && d.ocorrenciaPrazo < d.data) {
    out.push(problema('ocorrenciaPrazo', 'O prazo da ocorrência não pode ser antes do registro.'));
  }
  if (isISO(d.ocorrenciaResolvidaEm) && isISO(d.data) && d.ocorrenciaResolvidaEm < d.data) {
    out.push(problema('ocorrenciaResolvidaEm', 'A ocorrência não pode ser resolvida antes de registrada.'));
  }
  if (String(d.ocorrenciaResponsavel || '').length > 120) {
    out.push(problema('ocorrenciaResponsavel', 'O responsável tem mais de 120 caracteres.'));
  }
  /* legítimo, mas ninguém resolve pendência sem dono */
  if (st === 'aberta' && !String(d.ocorrenciaResponsavel || '').trim()) {
    out.push(problema('ocorrenciaResponsavel', 'Ocorrência aberta sem responsável: ninguém vai cobrar.', 'alerta'));
  }
  return out;
}

/* ------------------------------------------ TRATAMENTO DE ALERTA (0015)
   Espelha os CHECKs chk_trat_* de alertas_tratamento. */
const STATUS_TRATAMENTO_VALIDOS = STATUS_TRATAMENTO.map((x) => x.v);
function validarTratamento(t, hoje = hojeISO()) {
  const out = [];
  if (!String(t.chave || '').trim()) out.push(problema('chave', 'Tratamento sem alerta de referência.'));
  else if (String(t.chave).length > 200) out.push(problema('chave', 'Chave do alerta longa demais.'));
  if (!STATUS_TRATAMENTO_VALIDOS.includes(t.status)) {
    out.push(problema('status', `Situação inválida: "${t.status}".`));
  }
  if (t.status === 'adiado' && !isISO(t.adiarAte)) {
    out.push(problema('adiarAte', 'Para adiar, diga até quando.'));
  }
  if (String(t.responsavel || '').length > 120) out.push(problema('responsavel', 'O responsável tem mais de 120 caracteres.'));
  if (String(t.nota || '').length > 500) out.push(problema('nota', 'A nota tem mais de 500 caracteres.'));
  const sev = num(t.sevMarcada);
  if (!(sev >= 1 && sev <= 3)) out.push(problema('sevMarcada', 'Gravidade marcada fora de 1 a 3.'));
  if (num(t.valorMarcado) < 0) out.push(problema('valorMarcado', 'Valor marcado negativo.'));
  /* adiar para uma data que já passou não adia nada: o alerta volta na hora */
  if (t.status === 'adiado' && isISO(t.adiarAte) && t.adiarAte < hoje) {
    out.push(problema('adiarAte', 'Essa data já passou: o alerta volta imediatamente.', 'alerta'));
  }
  return out;
}

/* ------------------------------------------------------------- EMPRESA */
/* Responsável técnico e CREA/CAU: o relatório para cliente e financiador
   sai assinado por eles. Faltar é alerta, não erro — a conta nova ainda
   não tem, e não pode ser impedida de salvar o nome da empresa. */
function validarEmpresa(emp) {
  const out = [];
  const e = emp || {};
  if (!String(e.responsavel || '').trim())
    out.push(problema('responsavel', 'Sem responsável técnico: o relatório em PDF sai sem RT.', 'alerta'));
  if (!String(e.creaCau || '').trim())
    out.push(problema('creaCau', 'Sem CREA/CAU: o relatório em PDF sai sem o registro do RT.', 'alerta'));
  return out;
}

/* --------------------------------------------- CLIENTE / PRESTADOR */
/* Logo: data URI de imagem, opcional. Espelha o CHECK de 0008. */
function validarLogo(v, campo = 'logo') {
  const out = [];
  const s = String(v || '');
  if (s && !/^data:image\//.test(s)) out.push(problema(campo, 'A logo precisa ser um arquivo de imagem.'));
  else if (s.length > 500000) out.push(problema(campo, 'A logo está muito pesada — use uma imagem menor.'));
  return out;
}

function validarCliente(c) {
  const out = [];
  if (!String(c.nome || '').trim()) out.push(problema('nome', 'O cliente precisa de um nome.'));
  out.push(...validarLogo(c.logo, 'logo'));
  return out;
}

/* ------------------------------------------------------ CPF e CNPJ
   Dígitos verificadores pela regra da Receita. Devolve '' se válido, ou o
   motivo. Aceita com ou sem pontuação. */
function motivoCpfCnpjInvalido(doc) {
  const d = String(doc ?? '').replace(/\D/g, '');
  if (!d) return '';
  if (d.length !== 11 && d.length !== 14) return 'CPF tem 11 dígitos; CNPJ, 14.';
  if (/^(\d)\1+$/.test(d)) return 'Documento com todos os dígitos iguais não existe.';
  const dv = (base, pesos) => {
    const s = base.split('').reduce((acc, n, i) => acc + Number(n) * pesos[i], 0);
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  if (d.length === 11) {
    const p1 = [10, 9, 8, 7, 6, 5, 4, 3, 2];
    const p2 = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
    const ok = dv(d.slice(0, 9), p1) === Number(d[9]) && dv(d.slice(0, 10), p2) === Number(d[10]);
    return ok ? '' : 'CPF inválido: confira os dígitos.';
  }
  const p1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const p2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const ok = dv(d.slice(0, 12), p1) === Number(d[12]) && dv(d.slice(0, 13), p2) === Number(d[13]);
  return ok ? '' : 'CNPJ inválido: confira os dígitos.';
}

/* ------------------------------------------------------ chave PIX
   Cada tipo tem um formato. Telefone PIX é +55DDDNÚMERO (o banco aceita
   com ou sem o +); aleatória é UUID. Devolve '' se válida. */
function motivoChavePixInvalida(tipo, chave) {
  const c = String(chave ?? '').trim();
  if (!c) return '';
  if (!TIPOS_PIX_VALIDOS.includes(tipo)) return 'Escolha o tipo da chave PIX.';
  if (tipo === 'cpf_cnpj') return motivoCpfCnpjInvalido(c) || '';
  if (tipo === 'telefone') return motivoTelefoneInvalido(c) ? 'Telefone da chave PIX inválido.' : '';
  if (tipo === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c) ? '' : 'E-mail da chave PIX inválido.';
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c)
    ? ''
    : 'Chave aleatória tem o formato 8-4-4-4-12 (letras e números).';
}

const TIPOS_PIX_VALIDOS = ['cpf_cnpj', 'telefone', 'email', 'aleatoria'];
const FORMAS_VALIDAS = ['empreitada', 'diaria', 'm2', 'etapa'];
/* Espelha chk_prest_cidade (migração 0012). */
const CIDADE_MAX = 60;

function validarPrestador(p, listas = null) {
  const out = [];
  if (!String(p.nome || '').trim()) out.push(problema('nome', 'O prestador precisa de um nome.'));

  const a = num(p.avaliacao);
  if (a < 0 || a > 5) out.push(problema('avaliacao', 'A avaliação vai de 0 a 5.'));

  /* WhatsApp e telefone: quem digita no celular erra fácil; o motivo vai
     para a linha abaixo do campo. Guardados só em dígitos (55DDD…). */
  if (String(p.whatsapp || '').trim()) {
    const m = motivoTelefoneInvalido(p.whatsapp);
    if (m) out.push(problema('whatsapp', m));
  }
  if (String(p.telefone || '').trim()) {
    const m = motivoTelefoneInvalido(p.telefone);
    if (m) out.push(problema('telefone', m));
  }

  const doc = motivoCpfCnpjInvalido(p.documento);
  if (doc) out.push(problema('documento', doc));

  if (String(p.chavePix || '').trim()) {
    const m = motivoChavePixInvalida(p.tipoPix, p.chavePix);
    if (m) out.push(problema(p.tipoPix ? 'chavePix' : 'tipoPix', m));
  }

  if (p.formaContratacao && !FORMAS_VALIDAS.includes(p.formaContratacao)) {
    out.push(problema('formaContratacao', 'Forma de contratação desconhecida.'));
  }
  if (num(p.valorReferencia) < 0) {
    out.push(problema('valorReferencia', 'O valor de referência não pode ser negativo.'));
  }

  /* Cidade onde o prestador mora ou costuma atender. Texto livre. */
  if (String(p.cidade || '').trim().length > CIDADE_MAX) {
    out.push(problema('cidade', `A cidade tem no máximo ${CIDADE_MAX} caracteres.`));
  }

  /* Lista personalizável: especialidade nova é alerta, não erro. */
  const esp = String(p.especialidade || '').trim();
  if (esp && listas && Array.isArray(listas.especialidades) && !listas.especialidades.includes(esp)) {
    out.push(problema('especialidade', `"${esp}" não está na lista de especialidades — será acrescentada.`, 'alerta'));
  }
  return out;
}

/* -------------------------------------------- MEMBRO DA OBRA (equipe) */
/* Espelha o CHECK de obra_membros.papel na migração 0004. */
function validarMembro(m) {
  const out = [];
  if (!PAPEIS_OBRA.includes(m.papel)) {
    out.push(problema('papel', `Papel inválido: "${m.papel}". Use dono, engenheiro ou cliente.`));
  }
  if (!String(m.obraId || '').trim()) {
    out.push(problema('obraId', 'O membro precisa estar ligado a uma obra.'));
  }
  if (!String(m.usuarioId || '').trim()) {
    out.push(problema('usuarioId', 'O membro precisa estar ligado a um usuário.'));
  }
  return out;
}

/* ============================================ VALIDAÇÃO EM CONJUNTO */
/* Percorre uma obra inteira e devolve os problemas com o contexto de onde
   vieram. Útil na importação de planilha e numa futura tela de conferência. */
function validarObraCompleta(o) {
  const out = [];
  const juntar = (lista, contexto) => lista.forEach((x) => out.push({ ...x, contexto }));

  juntar(validarObra(o), `Obra "${o.nome || 'sem nome'}"`);
  (o.contratos || []).forEach((c) => juntar(
    [...validarContrato(c), ...validarEtapasContrato(c, o.cronograma)], `Contrato ${c.codigo || '?'}`));
  (o.medicoes || []).forEach((m, i) => juntar(validarMedicao(m), `Medição ${m.numero || i + 1}`));
  (o.recebimentos || []).forEach((r, i) =>
    juntar(validarRecebimento(r), `Recebimento ${r.numeroMedicao || r.etapaPci || i + 1}`));
  (o.lancamentos || []).forEach((l) => juntar(validarLancamento(l), `Lançamento "${l.descricao || '?'}"`));
  (o.materiais || []).forEach((m) => juntar(validarMaterial(m), `Material "${m.material || '?'}"`));
  (o.cronograma || []).forEach((e) => juntar(validarEtapa(e), `Etapa "${e.etapa || '?'}"`));
  juntar(validarPlanilhaFinanciador(o.cronograma), 'Planilha do financiador');
  juntar(validarDependencias(o.cronograma), 'Dependências do cronograma');
  (o.diario || []).forEach((d) => juntar(validarDiario(d), `Diário de ${d.data || '?'}`));
  (o.tratamentos || []).forEach((t) => juntar(validarTratamento(t), `Tratamento de alerta ${t.chave || '?'}`));
  return out;
}

function validarEstado(estado) {
  const out = [];
  const juntar = (lista, contexto) => lista.forEach((x) => out.push({ ...x, contexto }));
  (estado.clientes || []).forEach((c) => juntar(validarCliente(c), `Cliente "${c.nome || '?'}"`));
  (estado.prestadores || []).forEach((p) => juntar(validarPrestador(p), `Prestador "${p.nome || '?'}"`));
  (estado.obras || []).forEach((o) => out.push(...validarObraCompleta(o)));
  return out;
}

/* --------------------------------------------- PERFIL (administração) */
/* Espelha o CHECK de perfis.plano na migração 0005. */
function validarPerfilAdmin(p) {
  const out = [];
  if (p.plano !== undefined && !PLANOS.includes(p.plano)) {
    out.push(problema('plano', `Plano inválido: "${p.plano}".`));
  }
  if (p.abas !== undefined && (typeof p.abas !== 'object' || Array.isArray(p.abas) || p.abas === null)) {
    out.push(problema('abas', 'A configuração de abas precisa ser um objeto.'));
  }
  if (p.limiteObras !== undefined && p.limiteObras !== null && p.limiteObras !== -1) {
    const n = num(p.limiteObras);
    if (!Number.isInteger(n) || n < 0) {
      out.push(problema('limiteObras', 'O limite de obras deve ser um número inteiro de 0 ou mais.'));
    }
  }
  return out;
}

/* Conta nova criada pelo admin. auth.users é gerido pelo Supabase, então
   isto não vira CHECK — o próprio Supabase recusa e-mail inválido e senha
   curta. Aqui é só para não gastar uma chamada à toa. */
/* Espelha a política de senha do projeto no Supabase:
   mínimo 12 caracteres, com minúscula, maiúscula, número e símbolo.
   Devolve no máximo um problema por vez — a mensagem que falta corrigir. */
function validarSenhaForte(v, campo = 'senha') {
  const s = String(v || '');
  if (s.length < 12) return [problema(campo, 'A senha precisa de pelo menos 12 caracteres.')];
  if (!/[a-z]/.test(s)) return [problema(campo, 'Inclua uma letra minúscula na senha.')];
  if (!/[A-Z]/.test(s)) return [problema(campo, 'Inclua uma letra maiúscula na senha.')];
  if (!/[0-9]/.test(s)) return [problema(campo, 'Inclua um número na senha.')];
  if (!/[^A-Za-z0-9]/.test(s)) return [problema(campo, 'Inclua um símbolo na senha (! @ # - …).')];
  return [];
}

function validarUsuarioNovo(u) {
  const out = [];
  const email = String(u.email || '').trim();
  if (!email) out.push(problema('email', 'Informe o e-mail do cliente.'));
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) out.push(problema('email', 'E-mail inválido.'));
  out.push(...validarSenhaForte(u.senha, 'senha'));
  return out;
}

/* filtra só o que bloqueia gravação */
const apenasErros = (lista) => (lista || []).filter((x) => x.sev === 'erro');
const apenasAlertas = (lista) => (lista || []).filter((x) => x.sev === 'alerta');

export {
  validarObra,
  validarContrato,
  validarMedicao,
  validarRecebimento,
  validarLancamento,
  validarMaterial,
  validarEtapa,
  validarDiario,
  validarOcorrencia,
  validarTratamento,
  validarCliente,
  validarPrestador,
  motivoCpfCnpjInvalido,
  motivoChavePixInvalida,
  validarMembro,
  validarPerfilAdmin,
  validarUsuarioNovo,
  validarSenhaForte,
  validarLogo,
  validarEmpresa,
  validarPlanilhaFinanciador,
  validarDependencias,
  validarDiarioCampo,
  validarEtapasContrato,
  validarObraCompleta,
  validarEstado,
  apenasErros,
  apenasAlertas,
};
