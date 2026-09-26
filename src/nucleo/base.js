/**
 * base.js — Base: utilitários, formatação, esquema de dados e migração de estado.
 */
const APP = {
  nome: 'Souz Controle de Obra',
  versao: '1.0.0',
  schema: 1
};

/* ---------------------------------------------------------------- utils */

const uid = (p = 'id') =>
  p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/* Aceita número, texto pt-BR ("1.234,56") e texto en-US ("1,234.56"):
   havendo os dois separadores, o último é o decimal. */
const num = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  if (v instanceof Date) return 0;
  let s = String(v).trim().replace(/[^\d,.-]/g, '');
  if (!s || s === '-') return 0;
  const virgula = s.lastIndexOf(','), ponto = s.lastIndexOf('.');
  if (virgula > -1 && ponto > -1) {
    s = virgula > ponto ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (virgula > -1) {
    s = s.split(',').length > 2 ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (ponto > -1) {
    const partes = s.split('.');
    if (partes.length > 2) s = s.replace(/\./g, '');
    else if (partes[1].length === 3 && /^-?\d+$/.test(partes[0]) && partes[0] !== '0' && partes[0] !== '-0') {
      s = s.replace('.', '');            /* separador de milhar: 1.500 -> 1500 */
    }
  }
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
};

const round2 = (n) => Math.round((num(n) + Number.EPSILON) * 100) / 100;

const fmtMoney = (v, opts = {}) => {
  const n = num(v);
  const s = n.toLocaleString('pt-BR', {
    minimumFractionDigits: opts.dec ?? 2,
    maximumFractionDigits: opts.dec ?? 2
  });
  return opts.semSimbolo ? s : 'R$ ' + s;
};

const fmtMoneyCurto = (v) => {
  const n = num(v);
  const a = Math.abs(n);
  const sig = n < 0 ? '-' : '';
  if (a >= 1e6) return sig + 'R$ ' + (a / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' mi';
  if (a >= 1e3) return sig + 'R$ ' + (a / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil';
  return fmtMoney(n, { dec: 0 });
};

const fmtNum = (v, dec = 2) =>
  num(v).toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });

const fmtPct = (v, dec = 1) => {
  if (v === null || v === undefined || v === '') return '—';
  return (num(v) * 100).toLocaleString('pt-BR', {
    minimumFractionDigits: dec, maximumFractionDigits: dec
  }) + '%';
};

/* ------------------------------------------------------------ datas ISO */
/* Todas as datas são strings 'YYYY-MM-DD'. Comparações e aritmética usam
   UTC para não sofrer com fuso horário. */

const hojeISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const isISO = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

const dt = (iso) => {
  if (!isISO(iso)) return null;
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

const diasEntre = (a, b) => {
  const da = dt(a), db = dt(b);
  if (da === null || db === null) return null;
  return Math.round((db - da) / 86400000);
};

const addDias = (iso, n) => {
  const d = dt(iso);
  if (d === null) return '';
  return new Date(d + n * 86400000).toISOString().slice(0, 10);
};

const fmtData = (iso) => (isISO(iso) ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '—');
const fmtDataCurta = (iso) => (isISO(iso) ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '—');
/* dd/mm/aa — para coluna estreita onde a obra pode acabar em outro ano
   ("20/08" sozinho não diz se é deste ano ou do próximo). */
const fmtDataCurtaAno = (iso) => (isISO(iso) ? fmtDataCurta(iso) + '/' + iso.slice(2, 4) : '—');

/* Efetivo por função (diário de campo, 0017) digitado como texto, uma
   função por linha — é o jeito rápido no celular: "Pedreiro 3",
   "3 serventes", "Eletricista: 1". Linha sem número conta 1. */
function lerEfetivoFuncoes(texto) {
  return String(texto || '')
    .split(/\n|;/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = l.match(/^(\d+)\s*[x×-]?\s*(.+)$/i) || l.match(/^(.+?)\s*[:=x×-]?\s*(\d+)$/i);
      if (!m) return { funcao: l.slice(0, 60), qtd: 1 };
      const [a, b] = /^\d+$/.test(m[1]) ? [m[2], m[1]] : [m[1], m[2]];
      return { funcao: a.trim().slice(0, 60), qtd: parseInt(b, 10) };
    });
}
const textoEfetivoFuncoes = (lista) =>
  (Array.isArray(lista) ? lista : []).map((f) => `${f.funcao} ${num(f.qtd)}`).join('\n');

/* Instante (timestamp do banco) em linguagem de gente, no fuso do
   navegador: "hoje, 17:49", "ontem, 09:12", "22/09, 14:03" no mesmo ano,
   "22/09/25, 14:03" em outro. "há 0d" não diz nada a ninguém. */
function fmtQuando(instante, agora = new Date()) {
  const d = new Date(instante);
  if (!instante || Number.isNaN(d.getTime())) return '—';
  const p2 = (n) => String(n).padStart(2, '0');
  const hora = `${p2(d.getHours())}:${p2(d.getMinutes())}`;
  const dia = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dif = Math.round((dia(agora) - dia(d)) / 86400000);
  if (dif === 0) return `hoje, ${hora}`;
  if (dif === 1) return `ontem, ${hora}`;
  const dm = `${p2(d.getDate())}/${p2(d.getMonth() + 1)}`;
  return d.getFullYear() === agora.getFullYear()
    ? `${dm}, ${hora}`
    : `${dm}/${String(d.getFullYear()).slice(2)}, ${hora}`;
}

const competencia = (iso) => (isISO(iso) ? iso.slice(0, 7) : '');

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const fmtCompetencia = (ym) => {
  if (!ym || ym.length < 7) return '—';
  const [y, m] = ym.split('-').map(Number);
  return MESES[m - 1] + '/' + String(y).slice(2);
};

const addMeses = (ym, n) => {
  const [y, m] = ym.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
};

const fimDoMes = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m, 0));
  return d.toISOString().slice(0, 10);
};

const inicioDoMes = (ym) => ym + '-01';

/* ------------------------------------------------------------- strings */

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const norm = (s) => String(s ?? '').trim().toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const slug = (s) => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/* Capitalização de nome de gente: "MARIA DAS DORES" → "Maria das Dores".
   Partículas (de, da, do, das, dos, e) ficam minúsculas fora do começo. */
const PARTICULAS_NOME = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
const capitalizarNome = (texto) => String(texto ?? '')
  .toLowerCase()
  .split(/\s+/)
  .filter(Boolean)
  .map((w, i) => (i > 0 && PARTICULAS_NOME.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
  .join(' ');

/* Nome para EXIBIR. Só mexe no que está todo em caixa alta ("WESLEY
   PINTOR" → "Wesley Pintor"); nome já escrito à mão ("João da Silva",
   "MRV Engenharia") aparece como está. Não altera o dado salvo. */
const nomeExibicao = (nome) => {
  const t = String(nome ?? '').trim().replace(/\s+/g, ' ');
  const letras = t.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, '');
  const tudoMaiusculo = letras.length > 1 && letras === letras.toUpperCase() && letras !== letras.toLowerCase();
  return tudoMaiusculo ? capitalizarNome(t) : t;
};

/* Filtra o que vai para o atributo src de uma <img>. Só passa o que o próprio
   sistema gera: data URI de imagem rasterizada ou caminho relativo/HTTPS sem
   aspas. Barra 'javascript:', 'data:text/html', SVG com script e qualquer
   tentativa de quebrar o atributo. Use quando o valor puder ter vindo do banco
   — fotos do diário, logos sincronizadas. */
const fonteImagem = (v) => {
  const s = String(v ?? '').trim();
  if (/^data:image\/(png|jpe?g|webp|gif|avif);base64,[A-Za-z0-9+/=\s]+$/i.test(s)) return s;
  if (/^(https:\/\/|\.?\/)[^"'<>\s]+$/i.test(s)) return s;
  return '';
};

/* Converte uma data URI (foto do diário, guardada em base64) num File —
   para compartilhar por WhatsApp via Web Share API. null se não for uma
   data URI de imagem válida (mesmo filtro de fonteImagem). */
const dataUriParaArquivo = (dataUri, nome) => {
  const uri = fonteImagem(dataUri);
  if (!uri.startsWith('data:')) return null;
  const [meta, base64] = uri.split(',');
  const mime = (/^data:([^;]+)/.exec(meta) || [])[1] || 'image/jpeg';
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], nome || 'foto.jpg', { type: mime });
};

/* -------------------------------------------------------------- listas */

/* Sugestões dos campos de texto da Configuração: lista para escolher,
   sem proibir o que o usuário escrever. */
const SISTEMAS_CONSTRUTIVOS = [
  'Alvenaria convencional', 'Alvenaria estrutural', 'Parede de concreto', 'Steel frame',
  'Wood frame', 'Pré-moldado',
];
/* Padrão de acabamento é econômico, médio ou alto — MCMV é PROGRAMA de
   financiamento, não padrão. normalizarPadrao traduz o que vinha antes
   ('MCMV', 'popular', 'normal'…) e a planilha importada. */
const PADROES_ACABAMENTO = ['Econômico', 'Médio', 'Alto'];
function normalizarPadrao(v) {
  const t = String(v ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (!t) return '';
  if (/mcmv|popular|baix|econ|simples/.test(t)) return 'Econômico';
  if (/alto|lux/.test(t)) return 'Alto';
  if (/normal|medi|padrao/.test(t)) return 'Médio';
  return '';
}

const LISTAS_PADRAO = {
  etapas: [
    'Serviços preliminares', 'Fundação', 'Estrutura', 'Fechamento/alvenaria', 'Cobertura',
    'Reboco e requadros', 'Instalações hidrossanitárias', 'Eletrodutos e caixas',
    'Instalação elétrica final', 'Pisos e revestimentos', 'Esquadrias/janelas', 'Portas',
    'Forro/gesso', 'Pintura', 'Mármores e bancadas', 'Calhas e rufos', 'Louças e metais',
    'Fossa e sumidouro', 'Calçada', 'Muro', 'Extras', 'Outros/não classificados'
  ],
  tiposSaida: [
    'Material', 'Serviço avulso', 'Fornecimento + instalação', 'Taxa/imposto',
    'Honorário técnico/gestão', 'Comissão imobiliária', 'Terreno', 'Outra saída'
  ],
  unidades: ['un', 'm', 'm²', 'm³', 'kg', 't', 'saco', 'milheiro', 'palete', 'barra', 'caixa', 'lata', 'diária', 'mês', 'serviço', 'vb'],
  formasPagamento: ['PIX', 'Dinheiro', 'Cartão', 'Boleto', 'Transferência', 'Cheque', 'Financiamento', 'Outro'],
  statusPagamento: ['Pago', 'Em aberto', 'Parcial', 'Cancelado'],
  regimes: ['R$/m²', 'Preço fechado', 'Preço unitário', 'Diária', 'Fornecimento + instalação'],
  statusContrato: ['Planejado', 'Em andamento', 'Concluído', 'Suspenso', 'Cancelado'],
  statusMaterial: ['Planejar', 'Comprar', 'Comprado parcial', 'Comprado', 'Cancelado'],
  statusRecebimento: ['Previsto', 'Solicitado', 'Aprovado', 'Recebido parcial', 'Recebido', 'Cancelado'],
  /* quem paga por avanço de obra varia: CAIXA, outro banco, consórcio,
     o cliente. 'Cliente' e 'Recursos próprios' não são financiador. */
  origensRecebimento: ['CAIXA', 'Banco', 'Consórcio', 'Cliente', 'Recursos próprios', 'Outro'],
  prioridades: ['Alta', 'Média', 'Baixa'],
  statusObra: ['Planejada', 'Em andamento', 'Paralisada', 'Concluída'],
  climas: ['Bom', 'Nublado', 'Chuva fraca', 'Chuva forte', 'Impraticável'],
  /* Personalizável: o usuário acrescenta a dele. Por isso especialidade fora
     da lista é alerta, não erro, e não vira CHECK no banco. */
  especialidades: [
    'Pedreiro', 'Servente', 'Eletricista', 'Encanador', 'Pintor', 'Gesseiro',
    'Carpinteiro', 'Serralheiro', 'Azulejista', 'Empreiteiro geral', 'Outro'
  ],
  /* "Título | texto". Variáveis: {nome}, {obra}, {valor}, {data}. */
  mensagensWhatsapp: [
    'Chamar | Olá, {nome}! Tudo bem?',
    'Confirmar serviço amanhã | Olá, {nome}! Confirmando o serviço amanhã, {data}, na obra {obra}. Pode confirmar?',
    'Aviso de pagamento | Olá, {nome}! O pagamento de {valor} da obra {obra} foi feito. Obrigado!',
    'Pedir fotos do serviço | Olá, {nome}! Pode me mandar fotos do serviço na obra {obra}?'
  ]
};

/* Opções fixas do cadastro de prestador — batem com os CHECKs da migração 0011. */
const TIPOS_PIX = [
  { v: 'cpf_cnpj', t: 'CPF/CNPJ' },
  { v: 'telefone', t: 'Telefone' },
  { v: 'email', t: 'E-mail' },
  { v: 'aleatoria', t: 'Chave aleatória' }
];
const FORMAS_CONTRATACAO = [
  { v: 'empreitada', t: 'Empreitada' },
  { v: 'diaria', t: 'Diária' },
  { v: 'm2', t: 'Por m²' },
  { v: 'etapa', t: 'Por etapa' }
];

/* Opções fixas do contrato e do aditivo — batem com os CHECKs da migração 0013. */
const TIPOS_ADITIVO = [
  { v: 'acrescimo', t: 'Acréscimo' },
  { v: 'supressao', t: 'Supressão' },
  { v: 'prazo', t: 'Prazo' }
];
/* Tratamento de alerta (migração 0015). "Novo" é a ausência de tratamento;
   só estes três ficam gravados. Batem com o CHECK chk_trat_status. */
const STATUS_TRATAMENTO = [
  { v: 'em_tratamento', t: 'Em tratamento' },
  { v: 'adiado', t: 'Adiado' },
  { v: 'resolvido', t: 'Resolvido' }
];
/* Ocorrência do diário como pendência (0015). Vazio = só registro. */
const STATUS_OCORRENCIA = [
  { v: 'aberta', t: 'Aberta' },
  { v: 'resolvida', t: 'Resolvida' }
];
const STATUS_ADITIVO = [
  { v: 'proposto', t: 'Proposto' },
  { v: 'aprovado', t: 'Aprovado' },
  { v: 'recusado', t: 'Recusado' }
];
const CONDICOES_PAGAMENTO = [
  { v: 'por_medicao', t: 'Por medição' },
  { v: 'parcelas', t: 'Parcelas' },
  { v: 'sinal_mais_medicoes', t: 'Sinal + medições' }
];
const FORMAS_PRECO = [
  { v: 'preco_fechado', t: 'Preço fechado' },
  { v: 'por_m2', t: 'Por m²' },
  { v: 'preco_unitario', t: 'Preço unitário' },
  { v: 'diaria', t: 'Diária' }
];
const SITUACOES_MANUAIS_CONTRATO = ['Paralisado', 'Rescindido'];

/* -------------------------------------------------------------- schema */

const novaObra = (nome = 'Nova obra') => ({
  id: uid('obra'),
  nome,
  clienteId: '',
  cidade: '',
  endereco: '',
  areaConstruida: 0,
  areaMuro: 0,
  sistema: '',
  padrao: '',
  dataInicio: '',
  previsaoConclusao: '',
  responsavel: '',
  /* registro do responsável técnico DA OBRA (0020) — o relatório usa o
     RT da obra e só cai no da empresa quando a obra não tem */
  creaCau: '',
  status: 'Planejada',
  observacoes: '',
  cor: '',
  fin: {
    saldoInicial: 0,
    valorTerreno: 0,
    valorFinanciado: 0,
    recursosProprios: 0,
    precoEmpreitadaM2: 700,
    custoFisicoMaxM2: 0,
    valorVenda: 0,
    margemDesejada: 0.15,
    contratoCaixa: '',
    dataAssinatura: '',
    /* quem libera o dinheiro por avanço de obra: CAIXA, outro banco, o
       próprio cliente… (0016). Vazio = sem financiador. */
    financiador: ''
  },
  /* último relatório de status enviado ao cliente (0018) */
  statusEnviadoEm: '',
  contratos: [],
  medicoes: [],
  recebimentos: [],
  lancamentos: [],
  materiais: [],
  cronograma: [],
  diario: [],
  tratamentos: [],
  pendenciasCliente: [],
  /* histórico de relatórios gerados (0020) */
  relatoriosGerados: [],
  criadaEm: hojeISO()
});

const novoContrato = () => ({
  id: uid('ct'), codigo: '', codigoBase: '', registro: 'Contrato', prestadorId: '', prestador: '',
  escopo: '', regime: 'Preço fechado', quantidade: 0, unidade: 'vb', precoUnitario: 0,
  valorInformado: 0, incluiMaterial: 'Não', inicioPrevisto: '', fimPrevisto: '',
  status: 'Planejado', observacoes: '',
  /* etapas do cronograma que este contrato executa (0016): base do
     "medido × físico" do contrato. Vazio = compara com a obra toda. */
  etapas: [],
  /* nota do prestador ao concluir: 1–5; 0 = não avaliado */
  avalPrazo: 0, avalQualidade: 0, avalOrganizacao: 0,
  /* aditivo (só quando registro === 'Aditivo'): tipo, status e o que ele muda.
     statusAditivo nasce 'aprovado' para não alterar o autorizado do histórico —
     um aditivo já cadastrado antes desta versão sempre valeu. Só o formulário
     novo (Fase 6) vai nascer com 'proposto'. */
  tipoAditivo: '', statusAditivo: 'aprovado', motivoAditivo: '',
  dataAprovacaoAditivo: '', novoPrazoAditivo: '',
  /* condições do contrato principal */
  condicaoPagamento: 'por_medicao', retencaoPct: 0, formaPreco: '',
  dataEncerramento: '', documentoUrl: '',
  /* situação: calculada em dominio/calculos.js (contratoSituacao). Só estes
     dois estados podem ser marcados à mão, com motivo. */
  situacaoManual: '', motivoSituacaoManual: ''
});

const novaMedicao = () => ({
  id: uid('med'), contratoBase: '', numero: '', data: hojeISO(), descricao: '',
  progresso: 0, valorMedido: 0, desconto: 0, dataPagamento: '', valorPago: 0,
  status: 'Em aberto', documento: ''
});

const novoRecebimento = () => ({
  id: uid('rec'), origem: 'CAIXA', numeroMedicao: '', etapaPci: '', dataPrevista: '',
  valorPrevisto: 0, dataSolicitacao: '', percentObra: 0, valorAprovado: 0,
  descontos: 0, dataRecebimento: '', valorRecebido: 0, status: 'Previsto', observacoes: '',
  /* parcela por marco físico (0016): o % de obra que o financiador exige
     para liberar, e as datas do processo (solicitada → vistoriada →
     aprovada → creditada). */
  percentExigido: 0, dataVistoria: '', dataAprovacao: '',
  /* comprovante do crédito (0020): foto/PDF ou referência ao Storage */
  comprovante: ''
});

const novoLancamento = () => ({
  id: uid('lan'), data: hojeISO(), tipo: 'Material', etapa: '', categoria: '',
  descricao: '', fornecedor: '', prestadorId: '', documento: '', quantidade: 1, unidade: 'un',
  precoUnitario: 0, desconto: 0, frete: 0, formaPagamento: 'PIX',
  materialId: '', observacoes: '',
  /* foto da nota fiscal/recibo (0019), imagem reduzida em data URI */
  anexoNf: ''
});

const novoMaterial = () => ({
  id: uid('mat'), etapa: '', material: '', quantidadeNecessaria: 0, unidade: 'un',
  dataNecessaria: '', prioridade: 'Média', precoPrevisto: 0, status: 'Planejar',
  observacoes: ''
});

const novaEtapaCronograma = (etapa = '') => ({
  id: uid('cr'), etapa, inicioPrevisto: '', fimPrevisto: '', inicioReal: '', fimReal: '',
  progresso: 0, quantidadeExecutada: 0, unidadeProducao: '', responsavel: '', peso: 0,
  /* item e peso na planilha do financiador (0016) — PLS/PCI na CAIXA,
     cronograma físico-financeiro em outro banco */
  itemFinanciador: '', pesoFinanciador: 0,
  /* ids das etapas que precisam terminar antes desta começar (0017) */
  predecessoras: []
});

const novoDiario = () => ({
  id: uid('dia'), data: hojeISO(), clima: 'Bom', efetivo: 0, etapa: '',
  atividades: '', ocorrencias: '', autor: '', fotos: [],
  /* ocorrência como pendência (0015): vazio = só registro */
  ocorrenciaStatus: '', ocorrenciaResponsavel: '', ocorrenciaPrazo: '',
  ocorrenciaMaterialId: '', ocorrenciaResolvidaEm: '',
  /* diário de campo (0017): clima por turno, efetivo por função,
     equipamentos, o % da etapa ao fim do dia e se o dia afeta o prazo */
  climaManha: '', climaTarde: '', efetivoFuncoes: [], equipamentos: '',
  progressoEtapa: 0, impactaPrazo: false, diasImpacto: 0
});

/* Tratamento de um alerta (0015). O id é determinístico — uma obra tem no
   máximo um tratamento por alerta, e "reabrir e tratar de novo" antes da
   sincronização vira UPDATE da mesma linha, não DELETE + INSERT. */
const idTratamento = (obraId, chave) => `trat:${obraId}:${chave}`;
const novoTratamento = (obraId = '', chave = '') => ({
  id: idTratamento(obraId, chave), chave, status: 'em_tratamento', responsavel: '',
  adiarAte: '', nota: '', sevMarcada: 2, valorMarcado: 0, dataMarcacao: hojeISO()
});

const novoCliente = () => ({
  id: uid('cli'), nome: '', contato: '', telefone: '', email: '', documento: '',
  origem: '', situacao: 'Cliente', observacoes: '', logo: ''
});

/* whatsapp e telefone ficam só em dígitos, no formato 55DDDNNNNNNNNN
   (normalizarTelefoneBR, nucleo/contato.js). `documento` é o CPF/CNPJ.
   `arquivado` substitui a exclusão: quem tem pagamento vinculado não some. */
/* Quem vende material não é quem presta serviço (0018): o fornecedor
   entra nas listas de compra; o prestador, em contratos e medições. */
const TIPOS_PRESTADOR = [
  { v: 'servico', t: 'Prestador de serviço' },
  { v: 'fornecedor', t: 'Fornecedor' },
];

/* O que o cliente deve à obra (0018): aprovação, escolha de acabamento,
   documento. Com prazo — vencida, trava a obra e vira pendência. */
const STATUS_PENDENCIA_CLIENTE = [
  { v: 'aberta', t: 'Aguardando o cliente' },
  { v: 'resolvida', t: 'Resolvida' },
];
/* Relatório gerado (0020): tipo, as opções usadas, quem e quando, e o PDF
   no Storage quando deu para guardar ("baixar de novo"). */
const TIPOS_RELATORIO = ['status', 'interno', 'prestacao', 'medicao'];
const novoRelatorioGerado = () => ({
  id: uid('rel'), tipo: 'status', opcoes: {}, geradoPor: '', geradoEm: new Date().toISOString(), arquivo: ''
});

const novaPendenciaCliente = () => ({
  id: uid('pcli'), descricao: '', prazo: '', status: 'aberta', resolvidaEm: '', criadaEm: hojeISO()
});

const novoPrestador = () => ({
  id: uid('prest'), tipo: 'servico', nome: '', apelido: '', especialidade: '', cidade: '',
  whatsapp: '', temWhatsapp: true, telefone: '', documento: '',
  chavePix: '', tipoPix: '', formaContratacao: '', valorReferencia: 0,
  avaliacao: 0, observacoes: '', arquivado: false
});

const PAPEIS_OBRA = ['dono', 'engenheiro', 'cliente'];
const PLANOS = ['trial', 'ativo', 'suspenso', 'cancelado'];

const novoMembro = (papel = 'engenheiro') => ({
  id: uid('mbr'), obraId: '', usuarioId: '', papel, criadoEm: hojeISO()
});

const estadoInicial = () => ({
  meta: { schema: APP.schema, versao: APP.versao, savedAt: new Date().toISOString(), autor: '' },
  empresa: { nome: 'Souz Engenharia', cnpj: '', responsavel: '', creaCau: '', telefone: '', email: '', logo: '' },
  listas: JSON.parse(JSON.stringify(LISTAS_PADRAO)),
  clientes: [],
  prestadores: [],
  obras: []
});

/* Garante que estados antigos/parciais ganhem os campos novos. */
function migrar(s) {
  const base = estadoInicial();
  if (!s || typeof s !== 'object') return base;
  const out = Object.assign(base, s);
  out.meta = Object.assign(base.meta, s.meta || {});
  out.empresa = Object.assign(base.empresa, s.empresa || {});
  out.listas = Object.assign(base.listas, s.listas || {});
  for (const k of Object.keys(LISTAS_PADRAO)) {
    if (!Array.isArray(out.listas[k]) || !out.listas[k].length) {
      out.listas[k] = LISTAS_PADRAO[k].slice();
    }
  }
  /* itens arquivados de cada lista (0020): somem das escolhas, mas o
     registro antigo continua mostrando o valor dele */
  const arq = out.listas.arquivados;
  out.listas.arquivados = {};
  if (arq && typeof arq === 'object' && !Array.isArray(arq)) {
    Object.entries(arq).forEach(([k, v]) => {
      if (Array.isArray(v)) out.listas.arquivados[k] = v.filter((x) => x !== null && x !== undefined && x !== '').map(String);
    });
  }
  out.clientes = (Array.isArray(s.clientes) ? s.clientes : []).map((c) => Object.assign(novoCliente(), c));
  out.prestadores = (Array.isArray(s.prestadores) ? s.prestadores : []).map((p) => {
    const n = Object.assign(novoPrestador(), p);
    if (n.tipo !== 'fornecedor') n.tipo = 'servico';
    n.arquivado = n.arquivado === true;
    n.temWhatsapp = n.temWhatsapp !== false;
    return n;
  });
  out.obras = (Array.isArray(s.obras) ? s.obras : []).map((o) => {
    const nova = novaObra();
    const obra = Object.assign(nova, o);
    obra.fin = Object.assign(nova.fin, o.fin || {});
    for (const k of ['contratos', 'medicoes', 'recebimentos', 'lancamentos', 'materiais', 'cronograma', 'diario', 'tratamentos', 'pendenciasCliente', 'relatoriosGerados']) {
      obra[k] = Array.isArray(o[k]) ? o[k] : [];
    }
    obra.diario.forEach((d) => {
      if (!Array.isArray(d.fotos)) d.fotos = [];
      if (!Array.isArray(d.efetivoFuncoes)) d.efetivoFuncoes = [];
      for (const k of ['climaManha', 'climaTarde', 'equipamentos']) if (d[k] == null) d[k] = '';
      d.progressoEtapa = num(d.progressoEtapa);
      d.diasImpacto = num(d.diasImpacto);
      d.impactaPrazo = d.impactaPrazo === true;
      for (const k of ['ocorrenciaStatus', 'ocorrenciaResponsavel', 'ocorrenciaPrazo', 'ocorrenciaMaterialId', 'ocorrenciaResolvidaEm']) {
        if (d[k] == null) d[k] = '';
      }
    });
    obra.tratamentos = obra.tratamentos.map((t) => Object.assign(novoTratamento(obra.id, t.chave || ''), t));
    obra.pendenciasCliente = obra.pendenciasCliente.map((p) => Object.assign(novaPendenciaCliente(), p));
    if (obra.statusEnviadoEm == null) obra.statusEnviadoEm = '';
    obra.padrao = normalizarPadrao(obra.padrao);
    if (obra.creaCau == null) obra.creaCau = '';
    obra.relatoriosGerados = obra.relatoriosGerados.map((r) => {
      const n = Object.assign(novoRelatorioGerado(), r);
      if (!n.opcoes || typeof n.opcoes !== 'object' || Array.isArray(n.opcoes)) n.opcoes = {};
      return n;
    });
    /* vínculo com o cadastro de prestador — antes era só o nome digitado */
    obra.contratos.forEach((c) => {
      if (c.prestadorId == null) c.prestadorId = '';
      if (!Array.isArray(c.etapas)) c.etapas = [];
    });
    obra.cronograma.forEach((e) => {
      if (e.itemFinanciador == null) e.itemFinanciador = '';
      e.pesoFinanciador = num(e.pesoFinanciador);
      if (!Array.isArray(e.predecessoras)) e.predecessoras = [];
    });
    obra.lancamentos.forEach((l) => {
      if (l.prestadorId == null) l.prestadorId = '';
      if (l.anexoNf == null) l.anexoNf = '';
    });
    /* numeração sempre como texto: a planilha traz número, o banco guarda texto */
    obra.medicoes.forEach((m) => { m.numero = m.numero == null ? '' : String(m.numero); });
    obra.recebimentos.forEach((r) => {
      r.numeroMedicao = r.numeroMedicao == null ? '' : String(r.numeroMedicao);
      r.percentExigido = num(r.percentExigido);
      if (r.dataVistoria == null) r.dataVistoria = '';
      if (r.dataAprovacao == null) r.dataAprovacao = '';
      if (r.comprovante == null) r.comprovante = '';
    });
    return obra;
  });
  out.meta.schema = APP.schema;
  return out;
}

export {
  TIPOS_RELATORIO,
  novoRelatorioGerado,
  TIPOS_PRESTADOR,
  STATUS_PENDENCIA_CLIENTE,
  novaPendenciaCliente,
  lerEfetivoFuncoes,
  textoEfetivoFuncoes,
  SISTEMAS_CONSTRUTIVOS,
  PADROES_ACABAMENTO,
  normalizarPadrao,
  APP,
  uid,
  num,
  round2,
  fmtMoney,
  fmtMoneyCurto,
  fmtNum,
  fmtPct,
  hojeISO,
  isISO,
  dt,
  diasEntre,
  addDias,
  fmtData,
  fmtDataCurta,
  fmtDataCurtaAno,
  fmtQuando,
  competencia,
  MESES,
  fmtCompetencia,
  addMeses,
  fimDoMes,
  inicioDoMes,
  esc,
  norm,
  slug,
  fonteImagem,
  dataUriParaArquivo,
  capitalizarNome,
  nomeExibicao,
  LISTAS_PADRAO,
  TIPOS_PIX,
  FORMAS_CONTRATACAO,
  TIPOS_ADITIVO,
  STATUS_ADITIVO,
  STATUS_TRATAMENTO,
  STATUS_OCORRENCIA,
  novoTratamento,
  idTratamento,
  CONDICOES_PAGAMENTO,
  FORMAS_PRECO,
  SITUACOES_MANUAIS_CONTRATO,
  PAPEIS_OBRA,
  PLANOS,
  novoMembro,
  novaObra,
  novoContrato,
  novaMedicao,
  novoRecebimento,
  novoLancamento,
  novoMaterial,
  novaEtapaCronograma,
  novoDiario,
  novoCliente,
  novoPrestador,
  estadoInicial,
  migrar
};
