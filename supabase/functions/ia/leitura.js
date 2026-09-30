// =====================================================================
//  ia/leitura.js — o núcleo da função `ia`, sem Deno e sem rede: quem
//  chama (index.ts) injeta o banco, o Storage e o cliente da Anthropic.
//  É por isso que o vitest testa este arquivo inteiro com a API simulada
//  (tests/ia-funcao.test.js).
//
//  Tarefa 'nota': a foto ou o PDF da nota fiscal, já no Storage, vira a
//  leitura estruturada (ESQUEMA_NOTA). A leitura NÃO grava nada: o app
//  mostra a conferência e a pessoa cria os lançamentos.
//
//  validarLeituraNota é a mesma regra de src/dominio/validacao.js — a
//  função é publicada sozinha (pasta supabase/functions/ia), então a regra
//  vem copiada; tests/ia-leitura-nota.test.js confere que as duas dizem o
//  mesmo para os mesmos casos.
// =====================================================================

/* modelo por tarefa: ler nota é imagem com letra miúda (Sonnet 5); a
   avaliação em tests/ia compara com o Haiku 4.5 antes de trocar */
export const MODELOS = { nota: 'claude-sonnet-5' };
export const ESFORCO = { nota: 'low' };

/* US$ por milhão de tokens (tabela oficial, 30/09/2026) */
export const PRECOS = {
  'claude-sonnet-5': { entrada: 2, saida: 10 },
  'claude-sonnet-5-5': { entrada: 2, saida: 10 },
  'claude-haiku-4-5': { entrada: 1, saida: 5 },
};

export const LIMITES = {
  itens: 60,
  descricao: 200,
  fornecedor: 120,
  numero: 20,
  texto: 80,
  unidade: 20,
  motivo: 200,
  valor: 100000000,
  arquivoBytes: 10 * 1024 * 1024,
  contextoItens: 150,
};
export const TIPOS_DOCUMENTO = ['nfe', 'nfce', 'nfse', 'cupom', 'recibo', 'outro'];
export const CAMPOS_INCERTOS = [
  'fornecedor',
  'cnpj',
  'numero',
  'dataEmissao',
  'totalNota',
  'desconto',
  'frete',
  'formaPagamento',
  'itens',
];

const nulo = (t) => ({ anyOf: [t, { type: 'null' }] });
const TEXTO = { type: 'string' };
const NUMERO = { type: 'number' };

/* Saída estruturada (output_config.format): a resposta vem neste
   formato ou não vem. Nenhum campo para dado de pessoa física. */
export const ESQUEMA_NOTA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    legivel: { type: 'boolean' },
    motivo: nulo(TEXTO),
    tipoDocumento: { type: 'string', enum: TIPOS_DOCUMENTO },
    fornecedor: nulo(TEXTO),
    cnpj: nulo(TEXTO),
    numero: nulo(TEXTO),
    dataEmissao: nulo(TEXTO),
    totalNota: nulo(NUMERO),
    desconto: nulo(NUMERO),
    frete: nulo(NUMERO),
    formaPagamento: nulo(TEXTO),
    itens: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          descricao: TEXTO,
          quantidade: nulo(NUMERO),
          unidade: nulo(TEXTO),
          valorUnitario: nulo(NUMERO),
          valorTotal: nulo(NUMERO),
          servico: { type: 'boolean' },
          valorServico: nulo(NUMERO),
          categoria: nulo(TEXTO),
          etapa: nulo(TEXTO),
          materialId: nulo(TEXTO),
        },
        required: [
          'descricao',
          'quantidade',
          'unidade',
          'valorUnitario',
          'valorTotal',
          'servico',
          'valorServico',
          'categoria',
          'etapa',
          'materialId',
        ],
      },
    },
    incertos: { type: 'array', items: { type: 'string', enum: CAMPOS_INCERTOS } },
  },
  required: [
    'legivel',
    'motivo',
    'tipoDocumento',
    'fornecedor',
    'cnpj',
    'numero',
    'dataEmissao',
    'totalNota',
    'desconto',
    'frete',
    'formaPagamento',
    'itens',
    'incertos',
  ],
};

export const INSTRUCOES_NOTA = `Você lê documentos de compra de uma obra no Brasil — NF-e (DANFE), NFC-e (cupom), NFS-e e recibos — e devolve os dados no formato pedido.

Regras:
- Copie só o que está escrito no documento. Não invente nem complete: o que não aparece ou não dá para ler fica null.
- Valores em reais como número: 1.234,56 vira 1234.56. Datas em AAAA-MM-DD (a data de emissão).
- fornecedor e cnpj são do EMITENTE (quem vendeu). CNPJ só com os 14 dígitos. Nunca devolva nome, CPF, endereço ou telefone do destinatário, em nenhum campo.
- itens: cada linha de produto ou serviço, na ordem do documento. valorTotal é o total da linha. servico = true quando a linha é serviço (mão de obra, instalação, montagem). Se a linha junta fornecimento e instalação e o documento separa o valor da instalação, informe esse valor em valorServico; senão, valorServico = null.
- desconto e frete são os totais da nota, não por item. totalNota é o valor total da nota.
- categoria: uma ou duas palavras do tipo de material ou serviço (Cimento, Aço, Bloco, Tinta, Elétrica, Hidráulica, Areia, Madeira, Instalação).
- etapa e materialId: escolha SOMENTE entre as opções da obra listadas na mensagem. Se nenhuma servir, null. Nunca crie uma opção nova.
- formaPagamento: como está no documento (PIX, dinheiro, cartão, boleto), ou null.
- legivel = false quando a imagem não é um documento de compra ou não dá para ler os itens; diga o motivo em uma frase. Com legivel = false, itens pode vir vazio.
- incertos: os campos que você leu mas pode ter lido errado (borrado, cortado, dobrado, manuscrito). Use "itens" se algum item está duvidoso.`;

/* ---------------------------------------------------------- validação */
/* Mesma regra de validarLeituraNota em src/dominio/validacao.js. */
export function validarLeituraNota(l) {
  const L = LIMITES;
  const out = [];
  const problema = (campo, mensagem) => out.push({ campo, mensagem });
  if (!l || typeof l !== 'object' || Array.isArray(l)) {
    problema('leitura', 'A leitura da nota veio num formato inválido.');
    return out;
  }
  if (typeof l.legivel !== 'boolean')
    problema('legivel', 'A leitura não disse se a nota é legível.');
  const texto = (v, campo, max) => {
    if (v == null) return;
    if (typeof v !== 'string' || v.length > max)
      problema(campo, `${campo}: texto de até ${max} caracteres.`);
  };
  const valor = (v, campo, positivo = false) => {
    if (v == null) return;
    if (
      typeof v !== 'number' ||
      !Number.isFinite(v) ||
      v < 0 ||
      v > L.valor ||
      (positivo && v === 0)
    ) {
      problema(campo, `${campo}: valor fora do possível.`);
    }
  };
  texto(l.motivo, 'motivo', L.motivo);
  if (!TIPOS_DOCUMENTO.includes(l.tipoDocumento))
    problema('tipoDocumento', 'Tipo de documento desconhecido.');
  texto(l.fornecedor, 'fornecedor', L.fornecedor);
  if (l.cnpj != null && !/^\d{14}$/.test(String(l.cnpj)))
    problema('cnpj', 'O CNPJ lido precisa ter 14 dígitos.');
  texto(l.numero, 'numero', L.numero);
  if (l.dataEmissao != null && !dataIsoValida(l.dataEmissao)) {
    problema('dataEmissao', 'A data da nota precisa ser AAAA-MM-DD.');
  }
  valor(l.totalNota, 'totalNota');
  valor(l.desconto, 'desconto');
  valor(l.frete, 'frete');
  texto(l.formaPagamento, 'formaPagamento', L.texto);
  if (!Array.isArray(l.incertos) || l.incertos.some((c) => !CAMPOS_INCERTOS.includes(c))) {
    problema('incertos', 'Lista de campos incertos inválida.');
  }
  if (!Array.isArray(l.itens) || l.itens.length > L.itens) {
    problema('itens', `A nota precisa de uma lista de até ${L.itens} itens.`);
    return out;
  }
  if (l.legivel === true && !l.itens.length) problema('itens', 'Nota legível sem nenhum item.');
  l.itens.forEach((it, i) => {
    const c = `itens[${i}]`;
    if (!it || typeof it !== 'object') return problema(c, 'Item inválido.');
    if (
      typeof it.descricao !== 'string' ||
      !it.descricao.trim() ||
      it.descricao.length > L.descricao
    ) {
      problema(`${c}.descricao`, `Item ${i + 1}: descrição de 1 a ${L.descricao} caracteres.`);
    }
    valor(it.quantidade, `${c}.quantidade`, true);
    valor(it.valorUnitario, `${c}.valorUnitario`);
    valor(it.valorTotal, `${c}.valorTotal`);
    valor(it.valorServico, `${c}.valorServico`);
    texto(it.unidade, `${c}.unidade`, L.unidade);
    texto(it.categoria, `${c}.categoria`, L.texto);
    texto(it.etapa, `${c}.etapa`, L.texto);
    texto(it.materialId, `${c}.materialId`, L.texto);
    if (typeof it.servico !== 'boolean')
      problema(`${c}.servico`, `Item ${i + 1}: diga se é serviço.`);
    if (it.valorTotal == null && (it.quantidade == null || it.valorUnitario == null)) {
      problema(`${c}.valorTotal`, `Item ${i + 1}: sem valor.`);
    }
  });
  return out;
}

function dataIsoValida(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T12:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/* ------------------------------------------------------------ entrada */
const REF_NOTA = /^storage:([A-Za-z0-9_-]+)\/lancamentos\/[A-Za-z0-9._-]+$/;

/* O pedido do app: { tarefa, obraId, arquivo, contexto }. Devolve o pedido
   limpo ou { erro }. O contexto (nomes das etapas, itens do plano, formas
   de pagamento) só serve de opção para a IA; o app confere de novo. */
export function lerPedido(corpo) {
  if (!corpo || typeof corpo !== 'object') return { erro: 'Pedido vazio.' };
  if (corpo.tarefa !== 'nota') return { erro: 'Tarefa desconhecida.' };
  const obraId = String(corpo.obraId || '');
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(obraId)) return { erro: 'Obra inválida.' };
  const arquivo = String(corpo.arquivo || '');
  const m = REF_NOTA.exec(arquivo);
  if (!m || m[1] !== obraId || arquivo.length > 300) {
    return { erro: 'A nota precisa estar anexada no armazenamento desta obra.' };
  }
  const c = corpo.contexto && typeof corpo.contexto === 'object' ? corpo.contexto : {};
  const lista = (v, max) =>
    (Array.isArray(v) ? v : [])
      .map((x) =>
        String(x == null ? '' : x)
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, max),
      )
      .filter(Boolean)
      .slice(0, LIMITES.contextoItens);
  const materiais = (Array.isArray(c.materiais) ? c.materiais : [])
    .filter((x) => x && /^[A-Za-z0-9_-]{1,60}$/.test(String(x.id || '')))
    .map((x) => ({
      id: String(x.id),
      nome: String(x.nome || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80),
    }))
    .filter((x) => x.nome)
    .slice(0, LIMITES.contextoItens);
  return {
    tarefa: 'nota',
    obraId,
    arquivo,
    caminho: arquivo.slice('storage:'.length),
    contexto: {
      etapas: lista(c.etapas, 80),
      materiais,
      formasPagamento: lista(c.formasPagamento, 40),
    },
  };
}

export function tipoDoArquivo(bytes, caminho = '') {
  const b = bytes || new Uint8Array();
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'application/pdf';
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return /\.pdf$/i.test(caminho) ? 'application/pdf' : '';
}

function paraBase64(bytes) {
  let s = '';
  const passo = 0x8000;
  for (let i = 0; i < bytes.length; i += passo) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + passo));
  }
  return btoa(s);
}

/* ------------------------------------------------------------ pedido */
export function montarPedidoNota(bytes, tipo, contexto, modelo = MODELOS.nota) {
  const dados = paraBase64(bytes);
  const anexo =
    tipo === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: tipo, data: dados } }
      : { type: 'image', source: { type: 'base64', media_type: tipo, data: dados } };
  const opcoes = [
    `Etapas da obra: ${contexto.etapas.length ? contexto.etapas.join(' | ') : '(nenhuma cadastrada)'}`,
    `Itens do plano de materiais (materialId: nome): ${
      contexto.materiais.length
        ? contexto.materiais.map((m) => `${m.id}: ${m.nome}`).join(' | ')
        : '(nenhum)'
    }`,
    contexto.formasPagamento.length
      ? `Formas de pagamento usadas: ${contexto.formasPagamento.join(' | ')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
  return {
    model: modelo,
    max_tokens: 8000,
    system: [{ type: 'text', text: INSTRUCOES_NOTA, cache_control: { type: 'ephemeral' } }],
    output_config: {
      effort: ESFORCO.nota,
      format: { type: 'json_schema', schema: ESQUEMA_NOTA },
    },
    messages: [
      {
        role: 'user',
        content: [anexo, { type: 'text', text: `Leia este documento.\n\n${opcoes}` }],
      },
    ],
  };
}

export function custoUsd(modelo, usage = {}) {
  const p = PRECOS[modelo] || PRECOS['claude-sonnet-5'];
  const entrada =
    (usage.input_tokens || 0) +
    (usage.cache_creation_input_tokens || 0) * 1.25 +
    (usage.cache_read_input_tokens || 0) * 0.1;
  return (
    Math.round(((entrada * p.entrada + (usage.output_tokens || 0) * p.saida) / 1e6) * 1e6) / 1e6
  );
}

/* CNPJ com pontuação ou dígito a mais vira só dígitos; se não fecha 14,
   fica null e entra nos incertos (a pessoa digita). */
export function normalizarLeitura(l) {
  const out = {
    ...l,
    itens: Array.isArray(l.itens) ? l.itens : [],
    incertos: Array.isArray(l.incertos) ? [...l.incertos] : [],
  };
  if (out.cnpj != null) {
    const d = String(out.cnpj).replace(/\D/g, '');
    if (d.length === 14) out.cnpj = d;
    else {
      out.cnpj = null;
      if (!out.incertos.includes('cnpj')) out.incertos.push('cnpj');
    }
  }
  if (out.dataEmissao != null && !dataIsoValida(out.dataEmissao)) {
    out.dataEmissao = null;
    if (!out.incertos.includes('dataEmissao')) out.incertos.push('dataEmissao');
  }
  return out;
}

/* ------------------------------------------------------------ fluxo */
/* Erro com status HTTP e mensagem para a pessoa (nada interno). */
export class ErroIa extends Error {
  constructor(status, mensagem, interno = '') {
    super(mensagem);
    this.status = status;
    this.interno = interno || mensagem;
  }
}

const MENSAGENS_RESERVA = [
  [/ia: desligada/, 403, 'A leitura por IA não está ligada para esta conta. Fale com o gestor.'],
  [/ia: prazo encerrado/, 403, 'O período de teste da IA terminou. Fale com o gestor.'],
  [
    /ia: cota esgotada/,
    429,
    'As leituras de nota deste mês acabaram. Lance à mão ou fale com o gestor.',
  ],
  [/ia: limite por hora/, 429, 'Muitas leituras em pouco tempo. Espere alguns minutos.'],
  [/ia: sem acesso|ia: obra sem titular/, 403, 'Você não tem acesso de escrita a esta obra.'],
];

export function erroDaReserva(mensagem) {
  const m = String(mensagem || '');
  const achado = MENSAGENS_RESERVA.find(([re]) => re.test(m));
  return achado
    ? new ErroIa(achado[1], achado[2], m)
    : new ErroIa(500, 'Não foi possível reservar a leitura agora.', m);
}

/* O fluxo inteiro, com as dependências injetadas:
     reservar(obraId, tarefa) → id (ou lança com a mensagem do banco)
     baixar(caminho) → Uint8Array (com o token de quem pediu: a RLS do
                       Storage decide se a pessoa lê a nota)
     anthropic.messages.create(pedido) → resposta da API
     concluir(id, status, modelo, entrada, saida, custo, ms, erro)
     agora() → ms
   Devolve { id, leitura, uso } ou lança ErroIa. Falha depois da reserva
   conclui como 'erro' (não conta na cota). */
export async function processarNota(corpo, dep) {
  const p = lerPedido(corpo);
  if (p.erro) throw new ErroIa(400, p.erro);
  let id;
  try {
    id = await dep.reservar(p.obraId, 'nota');
  } catch (e) {
    throw erroDaReserva(e && e.message);
  }
  const inicio = dep.agora();
  const modelo = MODELOS.nota;
  let usage = {};
  const falhar = async (erro) => {
    await dep.concluir(
      id,
      'erro',
      modelo,
      usage.input_tokens || 0,
      usage.output_tokens || 0,
      custoUsd(modelo, usage),
      dep.agora() - inicio,
      erro.interno.slice(0, 300),
    );
    return erro;
  };
  try {
    let bytes;
    try {
      bytes = await dep.baixar(p.caminho);
    } catch (e) {
      throw new ErroIa(404, 'Não foi possível abrir a nota anexada.', `baixar: ${e && e.message}`);
    }
    if (!bytes || !bytes.length) throw new ErroIa(404, 'A nota anexada está vazia.');
    if (bytes.length > LIMITES.arquivoBytes) throw new ErroIa(413, 'A nota passa de 10 MB.');
    const tipo = tipoDoArquivo(bytes, p.caminho);
    if (!tipo) throw new ErroIa(415, 'A nota precisa ser foto (JPG, PNG, WebP) ou PDF.');

    let resposta;
    try {
      resposta = await dep.anthropic.messages.create(
        montarPedidoNota(bytes, tipo, p.contexto, modelo),
      );
    } catch (e) {
      throw new ErroIa(
        502,
        'A leitura por IA não respondeu. Tente de novo em instantes.',
        `api: ${(e && e.status) || ''} ${(e && e.name) || ''}`,
      );
    }
    usage = resposta.usage || {};
    if (resposta.stop_reason === 'refusal') {
      throw new ErroIa(422, 'A IA não leu este documento. Lance à mão.', 'refusal');
    }
    if (resposta.stop_reason === 'max_tokens') {
      throw new ErroIa(
        422,
        'A nota tem itens demais para ler de uma vez. Lance à mão.',
        'max_tokens',
      );
    }
    const bloco = (resposta.content || []).find((b) => b.type === 'text');
    let leitura;
    try {
      leitura = normalizarLeitura(JSON.parse(bloco ? bloco.text : ''));
    } catch (e) {
      throw new ErroIa(422, 'A leitura veio incompleta. Tente de novo.', 'json');
    }
    const problemas = validarLeituraNota(leitura);
    if (problemas.length) {
      throw new ErroIa(
        422,
        'A leitura veio fora do formato. Tente de novo.',
        `esquema: ${problemas.map((x) => x.campo).join(',')}`,
      );
    }
    const ms = dep.agora() - inicio;
    const custo = custoUsd(modelo, usage);
    await dep.concluir(
      id,
      'ok',
      modelo,
      usage.input_tokens || 0,
      usage.output_tokens || 0,
      custo,
      ms,
      null,
    );
    return { id, leitura, uso: { modelo, ms, custoUsd: custo } };
  } catch (e) {
    const erro =
      e instanceof ErroIa ? e : new ErroIa(500, 'Erro na leitura da nota.', String(e && e.message));
    throw await falhar(erro);
  }
}
