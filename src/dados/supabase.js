/**
 * supabase.js — Banco de dados: mapeamento das tabelas, sincronização e telas de acesso.
 */
import { CFG } from '../config.js';
import { esc, estadoInicial, isISO, migrar, novaEtapaCronograma, novaMedicao, novaObra, novoCliente, novoContrato, novoDiario, novoLancamento, novoMaterial, novoPrestador, novoRecebimento, num } from '../nucleo/base.js';
import { CHAVE_LOCAL, Store } from './store.js';
import { App, confirmar, LOGO } from '../ui/shell.js';
import { ACOES } from '../ui/acoes.js';
import { carregarScript } from '../io/index.js';

/* Preenchido na publicação. Também pode ser informado na tela de conexão. */
const SUPABASE_PADRAO = { url: CFG.url, anon: CFG.anon };

/* true na versão hospedada: sem banco configurado, pede a conexão. */
const EXIGE_BANCO = CFG.exigeBanco;

const CHAVE_CFG = 'souz_supabase_cfg';

/* olho aberto / riscado para revelar a senha na tela de acesso */
const OLHO = '<svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 10S4.5 4 10 4s8.5 6 8.5 6-3 6-8.5 6-8.5-6-8.5-6Z"/><circle cx="10" cy="10" r="2.5"/></svg>';
const OLHO_OFF = '<svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7.3 4.6A8.5 8.5 0 0 1 10 4c5.5 0 8.5 6 8.5 6a15 15 0 0 1-2.6 3.3M4.1 6.7A15 15 0 0 0 1.5 10S4.5 16 10 16a8.4 8.4 0 0 0 3.7-.8"/><path d="M8.2 8.2a2.5 2.5 0 0 0 3.5 3.5M2.5 2.5l15 15"/></svg>';

const ehArtefato = () => {
  try { return typeof claude !== 'undefined' && claude && typeof claude.use === 'function'; }
  catch (e) { return false; }
};

/* -------------------------------------------------- mapa de tabelas */
/* campo do sistema : coluna do banco | [coluna, tipo]
   tipos: texto (padrão) · num · data · ref (vazio vira nulo) · json      */
const TABELAS_DB = [
  {
    nome: 'clientes', raiz: 'clientes', novo: () => novoCliente(),
    campos: {
      nome: 'nome', contato: 'contato', telefone: 'telefone', email: 'email',
      documento: 'documento', origem: 'origem', situacao: 'situacao', observacoes: 'observacoes'
    }
  },
  {
    nome: 'prestadores', raiz: 'prestadores', novo: () => novoPrestador(),
    campos: {
      nome: 'nome', especialidade: 'especialidade', telefone: 'telefone',
      documento: 'documento', avaliacao: ['avaliacao', 'num'], observacoes: 'observacoes'
    }
  },
  {
    nome: 'obras', raiz: 'obras', novo: () => novaObra(),
    campos: {
      nome: 'nome', clienteId: ['cliente_id', 'ref'], cidade: 'cidade', endereco: 'endereco',
      areaConstruida: ['area_construida', 'num'], areaMuro: ['area_muro', 'num'],
      sistema: 'sistema', padrao: 'padrao',
      dataInicio: ['data_inicio', 'data'], previsaoConclusao: ['previsao_conclusao', 'data'],
      responsavel: 'responsavel', status: 'status', observacoes: 'observacoes',
      'fin.saldoInicial': ['saldo_inicial', 'num'], 'fin.valorTerreno': ['valor_terreno', 'num'],
      'fin.valorFinanciado': ['valor_financiado', 'num'], 'fin.recursosProprios': ['recursos_proprios', 'num'],
      'fin.precoEmpreitadaM2': ['preco_empreitada_m2', 'num'], 'fin.custoFisicoMaxM2': ['custo_fisico_max_m2', 'num'],
      'fin.valorVenda': ['valor_venda', 'num'], 'fin.margemDesejada': ['margem_desejada', 'num'],
      'fin.contratoCaixa': 'contrato_caixa', 'fin.dataAssinatura': ['data_assinatura', 'data']
    }
  },
  {
    nome: 'contratos', colecao: 'contratos', ordenado: true, novo: () => novoContrato(),
    campos: {
      codigo: 'codigo', codigoBase: 'codigo_base', registro: 'registro', prestador: 'prestador',
      escopo: 'escopo', regime: 'regime', quantidade: ['quantidade', 'num'], unidade: 'unidade',
      precoUnitario: ['preco_unitario', 'num'], valorInformado: ['valor_informado', 'num'],
      incluiMaterial: 'inclui_material', inicioPrevisto: ['inicio_previsto', 'data'],
      fimPrevisto: ['fim_previsto', 'data'], status: 'status', observacoes: 'observacoes'
    }
  },
  {
    nome: 'medicoes', colecao: 'medicoes', ordenado: true, novo: () => novaMedicao(),
    campos: {
      contratoBase: 'contrato_base', numero: 'numero', data: ['data', 'data'], descricao: 'descricao',
      progresso: ['progresso', 'num'], valorMedido: ['valor_medido', 'num'], desconto: ['desconto', 'num'],
      dataPagamento: ['data_pagamento', 'data'], valorPago: ['valor_pago', 'num'],
      status: 'status', documento: 'documento'
    }
  },
  {
    nome: 'recebimentos', colecao: 'recebimentos', ordenado: true, novo: () => novoRecebimento(),
    campos: {
      origem: 'origem', numeroMedicao: 'numero_medicao', etapaPci: 'etapa_pci',
      dataPrevista: ['data_prevista', 'data'], valorPrevisto: ['valor_previsto', 'num'],
      dataSolicitacao: ['data_solicitacao', 'data'], percentObra: ['percent_obra', 'num'],
      valorAprovado: ['valor_aprovado', 'num'], descontos: ['descontos', 'num'],
      dataRecebimento: ['data_recebimento', 'data'], valorRecebido: ['valor_recebido', 'num'],
      status: 'status', observacoes: 'observacoes'
    }
  },
  {
    nome: 'materiais', colecao: 'materiais', ordenado: true, novo: () => novoMaterial(),
    campos: {
      etapa: 'etapa', material: 'material', quantidadeNecessaria: ['quantidade_necessaria', 'num'],
      unidade: 'unidade', dataNecessaria: ['data_necessaria', 'data'], prioridade: 'prioridade',
      precoPrevisto: ['preco_previsto', 'num'], status: 'status', observacoes: 'observacoes'
    }
  },
  {
    nome: 'lancamentos', colecao: 'lancamentos', ordenado: true, novo: () => novoLancamento(),
    campos: {
      materialId: ['material_id', 'ref'], data: ['data', 'data'], tipo: 'tipo', etapa: 'etapa',
      categoria: 'categoria', descricao: 'descricao', fornecedor: 'fornecedor', documento: 'documento',
      quantidade: ['quantidade', 'num'], unidade: 'unidade', precoUnitario: ['preco_unitario', 'num'],
      desconto: ['desconto', 'num'], frete: ['frete', 'num'], formaPagamento: 'forma_pagamento',
      observacoes: 'observacoes'
    }
  },
  {
    nome: 'cronograma', colecao: 'cronograma', ordenado: true, novo: () => novaEtapaCronograma(),
    campos: {
      etapa: 'etapa', inicioPrevisto: ['inicio_previsto', 'data'], fimPrevisto: ['fim_previsto', 'data'],
      inicioReal: ['inicio_real', 'data'], fimReal: ['fim_real', 'data'], progresso: ['progresso', 'num'],
      quantidadeExecutada: ['quantidade_executada', 'num'], unidadeProducao: 'unidade_producao',
      responsavel: 'responsavel', peso: ['peso', 'num']
    }
  },
  {
    nome: 'diario', colecao: 'diario', ordenado: true, novo: () => novoDiario(),
    campos: {
      data: ['data', 'data'], clima: 'clima', efetivo: ['efetivo', 'num'], etapa: 'etapa',
      atividades: 'atividades', ocorrencias: 'ocorrencias', autor: 'autor', fotos: ['fotos', 'json']
    }
  }
];

const pegar = (obj, caminho) =>
  caminho.split('.').reduce((o, k) => (o === null || o === undefined ? undefined : o[k]), obj);
const definir = (obj, caminho, valor) => {
  const partes = caminho.split('.');
  let alvo = obj;
  for (let i = 0; i < partes.length - 1; i++) {
    if (!alvo[partes[i]] || typeof alvo[partes[i]] !== 'object') alvo[partes[i]] = {};
    alvo = alvo[partes[i]];
  }
  alvo[partes[partes.length - 1]] = valor;
};

function paraLinha(item, tab) {
  const linha = { id: item.id };
  Object.entries(tab.campos).forEach(([caminho, def]) => {
    const coluna = Array.isArray(def) ? def[0] : def;
    const tipo = Array.isArray(def) ? def[1] : 'texto';
    const v = pegar(item, caminho);
    if (tipo === 'num') linha[coluna] = num(v);
    else if (tipo === 'data') linha[coluna] = isISO(v) ? v : null;
    else if (tipo === 'ref') linha[coluna] = v ? String(v) : null;
    else if (tipo === 'json') linha[coluna] = v || [];
    else linha[coluna] = v === undefined || v === '' ? null : String(v);
  });
  /* Autoria da linha: preserva quem criou; item novo fica com o usuário atual.
     O acesso não depende mais disto — quem controla é a tabela de membros —,
     mas a coluna deixa de nascer errada quando um engenheiro grava numa obra
     de outro dono. */
  if (item.usuarioId) linha.usuario_id = item.usuarioId;
  else if (SUPA.usuario) linha.usuario_id = SUPA.usuario.id;
  return linha;
}

/* o banco pode devolver texto 'AAAA-MM-DD' ou objeto de data */
function paraDataISO(v) {
  if (!v) return '';
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return '';
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  }
  const s = String(v).trim();
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
}

function paraApp(linha, tab) {
  const item = tab.novo();
  item.id = linha.id;
  Object.entries(tab.campos).forEach(([caminho, def]) => {
    const coluna = Array.isArray(def) ? def[0] : def;
    const tipo = Array.isArray(def) ? def[1] : 'texto';
    const v = linha[coluna];
    if (tipo === 'num') definir(item, caminho, num(v));
    else if (tipo === 'data') definir(item, caminho, paraDataISO(v));
    else if (tipo === 'json') definir(item, caminho, Array.isArray(v) ? v : []);
    else definir(item, caminho, v === null || v === undefined ? '' : String(v));
  });
  if (linha.usuario_id) item.usuarioId = linha.usuario_id;
  return item;
}

/* todas as linhas de uma tabela a partir do estado, indexadas por id */
function linhasDoEstado(estado, tab) {
  const mapa = new Map();
  if (tab.raiz) {
    (estado[tab.raiz] || []).forEach((item) => mapa.set(item.id, paraLinha(item, tab)));
  } else {
    (estado.obras || []).forEach((o) => {
      (o[tab.colecao] || []).forEach((item, i) => {
        const linha = paraLinha(item, tab);
        linha.obra_id = o.id;
        if (tab.ordenado) linha.ordem = i;
        mapa.set(item.id, linha);
      });
    });
  }
  return mapa;
}

/* ==================================================== cliente Supabase */
const SUPA = {
  sb: null,
  usuario: null,
  cfg: { url: '', anon: '' },
  pronto: false,
  papeis: {},        // obraId -> 'dono' | 'engenheiro' | 'cliente' (carregado no login)
  ehAdmin: false,    // pode abrir o painel de administração
  plano: 'ativo',
  bloqueado: false,
  abas: {},          // { "<aba>": false } = abas bloqueadas para este usuário
  limiteObras: null, // null = sem limite; número = teto de obras da conta

  lerConfig() {
    let cfg = { ...SUPABASE_PADRAO };
    try {
      const salvo = JSON.parse(localStorage.getItem(CHAVE_CFG) || 'null');
      if (salvo && salvo.url && salvo.anon) cfg = salvo;
    } catch (e) {}
    this.cfg = cfg;
    return cfg;
  },

  configurado() {
    const c = this.lerConfig();
    return !!(c.url && c.anon);
  },

  gravarConfig(url, anon) {
    this.cfg = { url: url.trim().replace(/\/+$/, ''), anon: anon.trim() };
    try { localStorage.setItem(CHAVE_CFG, JSON.stringify(this.cfg)); } catch (e) {}
  },

  async carregarBiblioteca() {
    if (window.supabase && window.supabase.createClient) return true;
    return carregarScript([
      'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js',
      'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
      'https://cdnjs.cloudflare.com/ajax/libs/supabase-js/2.39.7/supabase.min.js'
    ], () => !!(window.supabase && window.supabase.createClient));
  },

  async iniciar() {
    if (!this.configurado()) return { estado: 'sem-config' };
    const ok = await this.carregarBiblioteca();
    if (!ok) return { estado: 'sem-biblioteca' };
    try {
      this.sb = window.supabase.createClient(this.cfg.url, this.cfg.anon, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          /* PKCE: o token não trafega no fragmento da URL — fica fora do
             histórico do navegador e do cabeçalho Referer. */
          flowType: 'pkce'
        }
      });
    } catch (e) {
      return { estado: 'erro', mensagem: e.message };
    }
    const { data, error } = await this.sb.auth.getSession();
    if (error) return { estado: 'erro', mensagem: error.message };
    this.usuario = data && data.session ? data.session.user : null;
    this.pronto = true;
    return { estado: this.usuario ? 'autenticado' : 'anonimo' };
  },

  async entrar(email, senha) {
    const { data, error } = await this.sb.auth.signInWithPassword({ email, password: senha });
    if (error) throw error;
    this.usuario = data.user;
    return data.user;
  },

  async cadastrar(email, senha) {
    const { data, error } = await this.sb.auth.signUp({ email, password: senha });
    if (error) throw error;
    this.usuario = data.user;
    return data;
  },

  async recuperar(email) {
    /* Volta para a URL limpa da aplicação — sem query nem hash que carreguem
       token ou rota. Precisa estar em Redirect URLs do projeto, sem curinga. */
    const destino = location.origin + location.pathname;
    const { error } = await this.sb.auth.resetPasswordForEmail(email, { redirectTo: destino });
    if (error) throw error;
  },

  async sair() {
    try { await this.sb.auth.signOut(); } catch (e) {}
    this.usuario = null;
    try { localStorage.removeItem(CHAVE_LOCAL); } catch (e) {}
    location.reload();
  },

  /* ---------------------------------------------------------- equipe */
  /* Papel do usuário atual em cada obra. Carregado uma vez no login; a
     tela usa para decidir o que mostrar. A autorização real vive no banco. */
  async carregarPapeis() {
    this.papeis = {};
    if (!this.sb || !this.usuario) return this.papeis;
    try {
      const { data, error } = await this.sb
        .from('obra_membros')
        .select('obra_id, papel')
        .eq('usuario_id', this.usuario.id);
      if (error) throw error;
      (data || []).forEach((m) => { this.papeis[m.obra_id] = m.papel; });
    } catch (e) {
      /* tabela ainda não criada (migração 0004 pendente): trata como dono de tudo */
    }
    return this.papeis;
  },

  /* 'dono' quando a tabela de membros ainda não existe — preserva o
     comportamento de antes da migração 0004. */
  papelNaObra(obraId) {
    return this.papeis[obraId] || 'dono';
  },

  podeEditarObra(obraId) {
    const p = this.papelNaObra(obraId);
    return p === 'dono' || p === 'engenheiro';
  },

  /* ------------------------------------------------------ administração */
  /* Uma aba está liberada a menos que o admin a tenha bloqueado.
     carteira, painel e ajustes são sempre acessíveis. */
  abaLiberada(v) {
    if (['carteira', 'painel', 'ajustes', 'admin'].includes(v)) return true;
    return this.abas[v] !== false;
  },

  /* Consumo de todos os clientes (só responde para admin). */
  async lerConsumo() {
    if (!this.sb) return [];
    const { data, error } = await this.sb.rpc('admin_consumo');
    if (error) throw error;
    return data || [];
  },

  /* Admin altera plano / bloqueio / abas / limite de obras de um cliente.
     Caminho ideal: RPC admin_definir_perfil (migrações 0006/0007). Enquanto
     essas migrações não estão aplicadas, cai para gravação direta.
     limiteObras: número >= 0 define o teto · -1 remove · ausente não mexe. */
  async adminSalvarPerfil(usuarioId, campos) {
    const semFn = (e) => e && /Could not find the function|schema cache|does not exist/i.test(e.message || '');
    const base = {
      p_id: usuarioId,
      p_plano: campos.plano ?? null,
      p_bloqueado: campos.bloqueado ?? null,
      p_abas: campos.abas ?? null,
    };

    let { error } = await this.sb.rpc('admin_definir_perfil', { ...base, p_limite_obras: campos.limiteObras ?? null });
    if (semFn(error)) ({ error } = await this.sb.rpc('admin_definir_perfil', base));

    if (semFn(error)) {
      /* 0006 ainda não aplicada — grava direto (a política ainda é for all). */
      const linha = {};
      if (campos.plano != null) linha.plano = campos.plano;
      if (campos.bloqueado != null) linha.bloqueado = campos.bloqueado;
      if (campos.abas != null) linha.abas = campos.abas;
      if (Object.keys(linha).length) {
        ({ error } = await this.sb.from('perfis').update(linha).eq('id', usuarioId));
      } else {
        error = null;
      }
      if (!error && campos.limiteObras != null) {
        throw new Error('O limite de obras precisa das migrações 0006 e 0007 aplicadas no Supabase.');
      }
    }

    if (error) throw error;
  },

  /* ---------------------------------------- criar e editar cliente (admin) */
  /* Cria a conta pela Edge Function admin-criar-usuario: a service_role fica no
     servidor, a sessão do admin não é trocada e não depende do cadastro público
     estar aberto. A conta nasce com o e-mail confirmado. Devolve
     { id, precisaConfirmar }. */
  async adminCriarUsuario(email, senha, empresa) {
    if (!this.sb) throw new Error('Sistema sem conexão com o banco.');
    const { data, error } = await this.sb.functions.invoke('admin-criar-usuario', {
      body: { email: String(email).trim(), senha, empresa: empresa || '' }
    });
    if (error) {
      let msg = error.message || 'Não foi possível criar a conta.';
      try {
        const corpo = await error.context.json();
        if (corpo && corpo.erro) msg = corpo.erro;
      } catch (e) {
        if (/not found|Failed to (send|fetch)/i.test(msg)) {
          msg = 'A função admin-criar-usuario ainda não foi publicada (supabase functions deploy).';
        }
      }
      throw new Error(msg);
    }
    if (data && data.erro) throw new Error(data.erro);
    return { id: data && data.id, precisaConfirmar: !!(data && data.precisaConfirmar) };
  },

  /* Perfil completo de um cliente. Só admin lê todos (política de 0005). */
  async adminLerPerfil(usuarioId) {
    const { data, error } = await this.sb.from('perfis').select('*').eq('id', usuarioId).single();
    if (error) throw error;
    return data;
  },

  /* Admin edita os dados cadastrais de um cliente. As colunas são as mesmas
     que o próprio cliente edita (grant de 0006); a política perfil_admin_alterar
     deixa o admin mexer na linha de qualquer conta. */
  async adminEditarInfo(usuarioId, campos) {
    const linha = {};
    ['empresa_nome', 'responsavel', 'crea_cau', 'telefone', 'email'].forEach((k) => {
      if (campos[k] !== undefined) linha[k] = campos[k];
    });
    if (!Object.keys(linha).length) return;
    const { error } = await this.sb.from('perfis').update(linha).eq('id', usuarioId);
    if (error) throw error;
  },

  /* Quantas obras a conta ainda pode criar (null = sem limite). */
  obrasRestantes(qtdAtual) {
    if (this.limiteObras == null) return null;
    return Math.max(0, this.limiteObras - qtdAtual);
  },

  /* Lista de membros de uma obra, para uma futura tela de equipe. */
  async lerMembros(obraId) {
    if (!this.sb || !obraId) return [];
    const { data, error } = await this.sb
      .from('obra_membros')
      .select('*')
      .eq('obra_id', obraId)
      .order('criado_em', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  /* --------------------------------------------------------- auditoria */
  /* Leitor dedicado: a trilha é só leitura e não entra no ciclo do Store
     (ele sincroniza por diferença, e a auditoria nunca é escrita pela tela). */
  async lerAuditoria(obraId, limite = 500) {
    if (!this.sb || !obraId) return [];
    const { data, error } = await this.sb
      .from('auditoria')
      .select('*')
      .eq('obra_id', obraId)
      .order('criado_em', { ascending: false })
      .limit(limite);
    if (error) throw error;
    return data || [];
  },

  /* ------------------------------------------------------------ carga */
  async carregar() {
    const dados = {};
    for (const tab of TABELAS_DB) {
      const { data, error } = await this.sb.from(tab.nome).select('*').limit(10000);
      if (error) throw error;
      dados[tab.nome] = data || [];
    }
    const estado = estadoInicial();
    const tab = (n) => TABELAS_DB.find((t) => t.nome === n);

    estado.clientes = dados.clientes.map((r) => paraApp(r, tab('clientes')));
    estado.prestadores = dados.prestadores.map((r) => paraApp(r, tab('prestadores')));
    estado.obras = dados.obras
      .sort((a, b) => String(a.criado_em).localeCompare(String(b.criado_em)))
      .map((r) => {
        const o = paraApp(r, tab('obras'));
        TABELAS_DB.filter((t) => t.colecao).forEach((t) => {
          const filhos = dados[t.nome].filter((x) => x.obra_id === o.id)
            .sort((a, b) => (a.ordem || 0) - (b.ordem || 0) ||
                            String(a.criado_em).localeCompare(String(b.criado_em)));
          o[t.colecao] = filhos.map((x) => paraApp(x, t));
        });
        return o;
      });

    /* perfil da empresa e listas personalizadas */
    const { data: perfil } = await this.sb.from('perfis').select('*')
      .eq('id', this.usuario.id).maybeSingle();
    if (perfil) {
      estado.empresa = {
        nome: perfil.empresa_nome || 'Souz Engenharia',
        responsavel: perfil.responsavel || '',
        creaCau: perfil.crea_cau || '',
        telefone: perfil.telefone || '',
        email: perfil.email || (this.usuario && this.usuario.email) || ''
      };
      if (perfil.listas && Object.keys(perfil.listas).length) {
        estado.listas = Object.assign(estado.listas, perfil.listas);
      }
      this.ehAdmin = !!perfil.admin;
      this.plano = perfil.plano || 'ativo';
      this.bloqueado = !!perfil.bloqueado;
      this.abas = perfil.abas && typeof perfil.abas === 'object' ? perfil.abas : {};
      this.limiteObras = perfil.limite_obras == null ? null : Number(perfil.limite_obras);
    } else {
      estado.empresa.email = (this.usuario && this.usuario.email) || '';
    }

    await this.carregarPapeis();

    estado.meta.savedAt = new Date().toISOString();
    return estado;
  },

  /* ------------------------------------------------------- gravação */
  async sincronizar(anterior, atual) {
    const mapasA = new Map(), mapasB = new Map();
    TABELAS_DB.forEach((t) => {
      mapasA.set(t.nome, linhasDoEstado(anterior, t));
      mapasB.set(t.nome, linhasDoEstado(atual, t));
    });

    let enviadas = 0, removidas = 0;

    /* inserções e alterações, respeitando as dependências */
    for (const t of TABELAS_DB) {
      const antes = mapasA.get(t.nome), agora = mapasB.get(t.nome);
      const alteradas = [];
      agora.forEach((linha, id) => {
        const anteriorLinha = antes.get(id);
        if (!anteriorLinha || JSON.stringify(anteriorLinha) !== JSON.stringify(linha)) alteradas.push(linha);
      });
      for (let i = 0; i < alteradas.length; i += 400) {
        const lote = alteradas.slice(i, i + 400);
        const { error } = await this.sb.from(t.nome).upsert(lote, { onConflict: 'id' });
        if (error) throw new Error(`${t.nome}: ${error.message}`);
        enviadas += lote.length;
      }
    }

    /* exclusões na ordem inversa (filhos antes dos pais) */
    for (const t of [...TABELAS_DB].reverse()) {
      const antes = mapasA.get(t.nome), agora = mapasB.get(t.nome);
      const ids = [...antes.keys()].filter((id) => !agora.has(id));
      for (let i = 0; i < ids.length; i += 400) {
        const lote = ids.slice(i, i + 400);
        const { error } = await this.sb.from(t.nome).delete().in('id', lote);
        if (error) throw new Error(`${t.nome}: ${error.message}`);
        removidas += lote.length;
      }
    }

    /* perfil */
    const perfilAtual = JSON.stringify([atual.empresa, atual.listas]);
    const perfilAntes = JSON.stringify([anterior.empresa, anterior.listas]);
    if (perfilAtual !== perfilAntes) {
      /* UPDATE, nunca upsert: a linha do perfil já existe (gatilho criar_perfil
         no cadastro) e a API não tem mais INSERT em perfis (migração 0009). */
      const { error } = await this.sb.from('perfis').update({
        empresa_nome: atual.empresa.nome || null,
        responsavel: atual.empresa.responsavel || null,
        crea_cau: atual.empresa.creaCau || null,
        telefone: atual.empresa.telefone || null,
        email: atual.empresa.email || this.usuario.email || null,
        listas: atual.listas
      }).eq('id', this.usuario.id);
      if (error) throw new Error('perfis: ' + error.message);
    }
    return { enviadas, removidas };
  }
};

/* ===================================================== telas de acesso */
function telaAcesso(conteudo) {
  let cx = document.getElementById('acesso');
  if (!cx) {
    cx = document.createElement('div');
    cx.id = 'acesso';
    document.body.appendChild(cx);
  }
  cx.innerHTML = `<div class="acesso-painel">
    <div class="acesso-marca">
      <span class="marca-mark">${LOGO}</span>
      <div><b>SouZ</b><span>Controle de obra</span></div>
    </div>
    ${conteudo}
  </div>`;
  cx.style.display = 'flex';
}

function fecharAcesso() {
  const cx = document.getElementById('acesso');
  if (cx) cx.style.display = 'none';
}

function telaLogin(modo = 'entrar', aviso = '') {
  const titulos = {
    entrar: ['Entrar no sistema', 'Use o e-mail e a senha da sua conta.'],
    criar: ['Criar conta', 'Você receberá um e-mail de confirmação, se exigido pelo projeto.'],
    recuperar: ['Recuperar senha', 'Enviaremos um link de redefinição para o seu e-mail.']
  };
  const [t, sub] = titulos[modo];
  telaAcesso(`
    <h2>${t}</h2>
    <p class="acesso-sub">${sub}</p>
    ${aviso ? `<div class="acesso-aviso">${esc(aviso)}</div>` : ''}
    <form class="acesso-form" data-form-acesso="1" onsubmit="return false">
      <div class="campo">
        <label for="ac_email">E-mail</label>
        <input type="email" id="ac_email" autocomplete="username" placeholder="voce@empresa.com.br">
      </div>
      ${modo !== 'recuperar' ? `<div class="campo">
        <label for="ac_senha">Senha</label>
        <div class="campo-olho">
          <input type="password" id="ac_senha" autocomplete="${modo === 'criar' ? 'new-password' : 'current-password'}" placeholder="mínimo de 6 caracteres">
          <button type="button" class="olho" data-acao="auth-ver-senha" aria-label="Mostrar senha" aria-pressed="false">${OLHO}</button>
        </div>
      </div>` : ''}
      <button class="btn primario" style="justify-content:center" data-acao="${
        modo === 'entrar' ? 'auth-entrar' : modo === 'criar' ? 'auth-cadastrar' : 'auth-recuperar'}">
        ${modo === 'entrar' ? 'Entrar' : modo === 'criar' ? 'Criar conta' : 'Enviar link'}
      </button>
    </form>
    <div class="acesso-links">
      ${modo === 'entrar'
        ? '<button class="btn sutil pequeno" data-acao="auth-tela" data-modo="recuperar">Esqueci a senha</button>'
        : '<button class="btn sutil pequeno" data-acao="auth-tela" data-modo="entrar">Voltar ao login</button>'}
    </div>`);
}

function telaConfigBanco(aviso = '') {
  const c = SUPA.lerConfig();
  telaAcesso(`
    <h2>Conectar ao banco de dados</h2>
    <p class="acesso-sub">Informe os dados do seu projeto Supabase. Você encontra em
      <b>Project Settings → API</b>. A chave <b>anon public</b> é feita para ficar no navegador —
      quem protege os dados é a política de segurança por usuário do banco.</p>
    ${aviso ? `<div class="acesso-aviso">${esc(aviso)}</div>` : ''}
    <form class="acesso-form" data-form-acesso="1" onsubmit="return false">
      <div class="campo">
        <label for="cfg_url">URL do projeto</label>
        <input type="text" id="cfg_url" value="${esc(c.url)}" placeholder="https://xxxxxxxx.supabase.co">
      </div>
      <div class="campo">
        <label for="cfg_anon">Chave anon public</label>
        <textarea id="cfg_anon" rows="3" placeholder="eyJhbGciOi...">${esc(c.anon)}</textarea>
      </div>
      <button class="btn primario" style="justify-content:center" data-acao="auth-salvar-config">Conectar</button>
    </form>
    <div class="acesso-links">
      <button class="btn sutil pequeno" data-acao="auth-tela" data-modo="entrar">Voltar</button>
      <button class="btn sutil pequeno" data-acao="auth-local">Usar sem banco (só neste navegador)</button>
    </div>`);
}

/* ------------------------------------------------------------ ações */
ACOES['auth-tela'] = (el, d) => telaLogin(d.modo || 'entrar');
ACOES['auth-config'] = () => telaConfigBanco();

ACOES['auth-ver-senha'] = (el) => {
  const inp = document.getElementById('ac_senha');
  if (!inp) return;
  const revelar = inp.type === 'password';
  inp.type = revelar ? 'text' : 'password';
  el.innerHTML = revelar ? OLHO_OFF : OLHO;
  el.setAttribute('aria-pressed', String(revelar));
  el.setAttribute('aria-label', revelar ? 'Ocultar senha' : 'Mostrar senha');
  inp.focus();
};

ACOES['auth-salvar-config'] = async () => {
  const url = document.getElementById('cfg_url').value.trim();
  const anon = document.getElementById('cfg_anon').value.trim();
  if (!/^https?:\/\/.+/.test(url) || anon.length < 20) {
    return telaConfigBanco('Confira a URL (começa com https://) e a chave anon public.');
  }
  SUPA.gravarConfig(url, anon);
  const r = await SUPA.iniciar();
  if (r.estado === 'erro' || r.estado === 'sem-biblioteca') {
    return telaConfigBanco('Não foi possível conectar: ' + (r.mensagem || 'biblioteca não carregou') + '.');
  }
  telaLogin('entrar', 'Conexão salva. Entre com sua conta ou crie uma.');
};

ACOES['auth-local'] = () => {
  try { localStorage.removeItem(CHAVE_CFG); } catch (e) {}
  location.reload();
};

ACOES['auth-entrar'] = async (el) => {
  if (!SUPA.sb) return telaConfigBanco('Configure a conexão com o banco antes de entrar.');
  const email = document.getElementById('ac_email').value.trim();
  const senha = document.getElementById('ac_senha').value;
  if (!email || !senha) return telaLogin('entrar', 'Informe e-mail e senha.');
  el.disabled = true; el.textContent = 'Entrando…';
  try {
    await SUPA.entrar(email, senha);
    await entrarNoSistema();
  } catch (err) {
    telaLogin('entrar', traduzErroAuth(err));
  }
};

ACOES['auth-cadastrar'] = async (el) => {
  if (!SUPA.sb) return telaConfigBanco('Configure a conexão com o banco antes de entrar.');
  const email = document.getElementById('ac_email').value.trim();
  const senha = document.getElementById('ac_senha').value;
  if (!email || senha.length < 6) return telaLogin('criar', 'Informe um e-mail válido e senha de pelo menos 6 caracteres.');
  el.disabled = true; el.textContent = 'Criando…';
  try {
    const r = await SUPA.cadastrar(email, senha);
    if (r && r.session) await entrarNoSistema();
    else telaLogin('entrar', 'Conta criada. Confirme o e-mail que enviamos e depois entre.');
  } catch (err) {
    telaLogin('criar', traduzErroAuth(err));
  }
};

ACOES['auth-recuperar'] = async (el) => {
  if (!SUPA.sb) return telaConfigBanco('Configure a conexão com o banco antes de entrar.');
  const email = document.getElementById('ac_email').value.trim();
  if (!email) return telaLogin('recuperar', 'Informe o e-mail.');
  el.disabled = true; el.textContent = 'Enviando…';
  try {
    await SUPA.recuperar(email);
    telaLogin('entrar', 'Link de redefinição enviado para ' + email + '.');
  } catch (err) {
    telaLogin('recuperar', traduzErroAuth(err));
  }
};

ACOES['auth-sair'] = () => {
  confirmar('Sair do sistema', 'Deseja encerrar a sessão neste dispositivo?', () => SUPA.sair(), 'Sair');
};

function traduzErroAuth(err) {
  const m = String((err && err.message) || err);
  if (/Invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
  if (/User already registered/i.test(m)) return 'Já existe uma conta com esse e-mail.';
  if (/Email not confirmed/i.test(m)) return 'Confirme o e-mail antes de entrar.';
  if (/Password should be at least/i.test(m)) return 'A senha precisa ter pelo menos 6 caracteres.';
  if (/rate limit|too many/i.test(m)) return 'Muitas tentativas. Aguarde um minuto e tente de novo.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Sem conexão com o banco. Verifique a URL do projeto.';
  return m;
}

/* carrega os dados e abre o sistema depois do login */
async function entrarNoSistema() {
  telaAcesso('<h2>Carregando suas obras…</h2><p class="acesso-sub">Buscando os dados no banco.</p>');
  try {
    const estado = await SUPA.carregar();

    if (SUPA.bloqueado) {
      return telaAcesso(`<h2>Acesso suspenso</h2>
        <p class="acesso-sub">Sua conta está temporariamente sem acesso ao sistema.
        Fale com o administrador para regularizar.</p>
        <div class="acesso-links">
          <button class="btn" data-acao="auth-recarregar">Tentar de novo</button>
          <button class="btn sutil pequeno" data-acao="auth-sair-simples">Sair</button>
        </div>`);
    }

    Store.estado = migrar(estado);
    Store.snapshot = JSON.parse(JSON.stringify(Store.estado));
    Store.backend = 'supabase';
    Store.modo = 'banco';
    Store.status = 'ok';
    Store.salvoEm = new Date().toISOString();
    if (!App.rota.obraId && Store.estado.obras.length) App.rota.obraId = Store.estado.obras[0].id;
    if (!SUPA.abaLiberada(App.rota.view)) App.rota = { view: 'carteira', obraId: App.rota.obraId };
    fecharAcesso();
    App.render();
  } catch (err) {
    const m = String(err.message || err);
    if (/relation .* does not exist|schema cache|Could not find the table/i.test(m)) {
      telaAcesso(`<h2>Banco ainda sem as tabelas</h2>
        <p class="acesso-sub">Abra o <b>SQL Editor</b> do Supabase, cole o conteúdo do arquivo
        <b>schema.sql</b> e clique em Run. Depois recarregue esta página.</p>
        <div class="acesso-aviso">${esc(m)}</div>
        <div class="acesso-links"><button class="btn" data-acao="auth-recarregar">Já executei, recarregar</button>
        <button class="btn sutil pequeno" data-acao="auth-sair-simples">Sair</button></div>`);
    } else {
      telaAcesso(`<h2>Não consegui carregar seus dados</h2>
        <div class="acesso-aviso">${esc(m)}</div>
        <div class="acesso-links"><button class="btn" data-acao="auth-recarregar">Tentar de novo</button>
        <button class="btn sutil pequeno" data-acao="auth-sair-simples">Sair</button></div>`);
    }
  }
}

ACOES['auth-recarregar'] = () => location.reload();
ACOES['auth-sair-simples'] = () => SUPA.sair();

export {
  SUPABASE_PADRAO,
  EXIGE_BANCO,
  CHAVE_CFG,
  ehArtefato,
  TABELAS_DB,
  pegar,
  definir,
  paraLinha,
  paraDataISO,
  paraApp,
  linhasDoEstado,
  SUPA,
  telaAcesso,
  fecharAcesso,
  telaLogin,
  telaConfigBanco,
  traduzErroAuth,
  entrarNoSistema
};
