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

/* -------------------------------------------------------------- listas */

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
  origensRecebimento: ['CAIXA', 'Cliente', 'Recursos próprios', 'Outro'],
  prioridades: ['Alta', 'Média', 'Baixa'],
  statusObra: ['Planejada', 'Em andamento', 'Paralisada', 'Concluída'],
  climas: ['Bom', 'Nublado', 'Chuva fraca', 'Chuva forte', 'Impraticável']
};

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
  padrao: 'MCMV',
  dataInicio: '',
  previsaoConclusao: '',
  responsavel: '',
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
    dataAssinatura: ''
  },
  contratos: [],
  medicoes: [],
  recebimentos: [],
  lancamentos: [],
  materiais: [],
  cronograma: [],
  diario: [],
  criadaEm: hojeISO()
});

const novoContrato = () => ({
  id: uid('ct'), codigo: '', codigoBase: '', registro: 'Contrato', prestador: '',
  escopo: '', regime: 'Preço fechado', quantidade: 0, unidade: 'vb', precoUnitario: 0,
  valorInformado: 0, incluiMaterial: 'Não', inicioPrevisto: '', fimPrevisto: '',
  status: 'Planejado', observacoes: ''
});

const novaMedicao = () => ({
  id: uid('med'), contratoBase: '', numero: '', data: hojeISO(), descricao: '',
  progresso: 0, valorMedido: 0, desconto: 0, dataPagamento: '', valorPago: 0,
  status: 'Em aberto', documento: ''
});

const novoRecebimento = () => ({
  id: uid('rec'), origem: 'CAIXA', numeroMedicao: '', etapaPci: '', dataPrevista: '',
  valorPrevisto: 0, dataSolicitacao: '', percentObra: 0, valorAprovado: 0,
  descontos: 0, dataRecebimento: '', valorRecebido: 0, status: 'Previsto', observacoes: ''
});

const novoLancamento = () => ({
  id: uid('lan'), data: hojeISO(), tipo: 'Material', etapa: '', categoria: '',
  descricao: '', fornecedor: '', documento: '', quantidade: 1, unidade: 'un',
  precoUnitario: 0, desconto: 0, frete: 0, formaPagamento: 'PIX',
  materialId: '', observacoes: ''
});

const novoMaterial = () => ({
  id: uid('mat'), etapa: '', material: '', quantidadeNecessaria: 0, unidade: 'un',
  dataNecessaria: '', prioridade: 'Média', precoPrevisto: 0, status: 'Planejar',
  observacoes: ''
});

const novaEtapaCronograma = (etapa = '') => ({
  id: uid('cr'), etapa, inicioPrevisto: '', fimPrevisto: '', inicioReal: '', fimReal: '',
  progresso: 0, quantidadeExecutada: 0, unidadeProducao: '', responsavel: '', peso: 0
});

const novoDiario = () => ({
  id: uid('dia'), data: hojeISO(), clima: 'Bom', efetivo: 0, etapa: '',
  atividades: '', ocorrencias: '', autor: '', fotos: []
});

const novoCliente = () => ({
  id: uid('cli'), nome: '', contato: '', telefone: '', email: '', documento: '',
  origem: '', situacao: 'Cliente', observacoes: ''
});

const novoPrestador = () => ({
  id: uid('prest'), nome: '', especialidade: '', telefone: '', documento: '',
  avaliacao: 0, observacoes: ''
});

const PAPEIS_OBRA = ['dono', 'engenheiro', 'cliente'];

const novoMembro = (papel = 'engenheiro') => ({
  id: uid('mbr'), obraId: '', usuarioId: '', papel, criadoEm: hojeISO()
});

const estadoInicial = () => ({
  meta: { schema: APP.schema, versao: APP.versao, savedAt: new Date().toISOString(), autor: '' },
  empresa: { nome: 'Souz Engenharia', responsavel: '', creaCau: '', telefone: '', email: '' },
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
  out.clientes = Array.isArray(s.clientes) ? s.clientes : [];
  out.prestadores = Array.isArray(s.prestadores) ? s.prestadores : [];
  out.obras = (Array.isArray(s.obras) ? s.obras : []).map((o) => {
    const nova = novaObra();
    const obra = Object.assign(nova, o);
    obra.fin = Object.assign(nova.fin, o.fin || {});
    for (const k of ['contratos', 'medicoes', 'recebimentos', 'lancamentos', 'materiais', 'cronograma', 'diario']) {
      obra[k] = Array.isArray(o[k]) ? o[k] : [];
    }
    obra.diario.forEach((d) => { if (!Array.isArray(d.fotos)) d.fotos = []; });
    /* numeração sempre como texto: a planilha traz número, o banco guarda texto */
    obra.medicoes.forEach((m) => { m.numero = m.numero == null ? '' : String(m.numero); });
    obra.recebimentos.forEach((r) => { r.numeroMedicao = r.numeroMedicao == null ? '' : String(r.numeroMedicao); });
    return obra;
  });
  out.meta.schema = APP.schema;
  return out;
}

export {
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
  competencia,
  MESES,
  fmtCompetencia,
  addMeses,
  fimDoMes,
  inicioDoMes,
  esc,
  norm,
  slug,
  LISTAS_PADRAO,
  PAPEIS_OBRA,
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
