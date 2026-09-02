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
import { isISO, num, PAPEIS_OBRA, PLANOS } from '../nucleo/base.js';

const REGISTROS_CONTRATO = ['Contrato', 'Aditivo'];

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
  ordemDatas(e, 'inicioPrevisto', 'fimPrevisto', 'Prazo previsto da etapa', out);
  ordemDatas(e, 'inicioReal', 'fimReal', 'Prazo real da etapa', out);
  return out;
}

/* ------------------------------------------------------- DIÁRIO */
function validarDiario(d) {
  const out = [];
  if (!isISO(d.data)) out.push(problema('data', 'O registro do diário precisa de uma data válida.'));
  if (num(d.efetivo) < 0) out.push(problema('efetivo', 'O efetivo não pode ser negativo.'));
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

function validarPrestador(p) {
  const out = [];
  if (!String(p.nome || '').trim()) out.push(problema('nome', 'O prestador precisa de um nome.'));
  const a = num(p.avaliacao);
  if (a < 0 || a > 5) out.push(problema('avaliacao', 'A avaliação vai de 0 a 5.'));
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
  (o.contratos || []).forEach((c) => juntar(validarContrato(c), `Contrato ${c.codigo || '?'}`));
  (o.medicoes || []).forEach((m, i) => juntar(validarMedicao(m), `Medição ${m.numero || i + 1}`));
  (o.recebimentos || []).forEach((r, i) =>
    juntar(validarRecebimento(r), `Recebimento ${r.numeroMedicao || r.etapaPci || i + 1}`));
  (o.lancamentos || []).forEach((l) => juntar(validarLancamento(l), `Lançamento "${l.descricao || '?'}"`));
  (o.materiais || []).forEach((m) => juntar(validarMaterial(m), `Material "${m.material || '?'}"`));
  (o.cronograma || []).forEach((e) => juntar(validarEtapa(e), `Etapa "${e.etapa || '?'}"`));
  (o.diario || []).forEach((d) => juntar(validarDiario(d), `Diário de ${d.data || '?'}`));
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
  validarCliente,
  validarPrestador,
  validarMembro,
  validarPerfilAdmin,
  validarUsuarioNovo,
  validarSenhaForte,
  validarLogo,
  validarObraCompleta,
  validarEstado,
  apenasErros,
  apenasAlertas,
};
