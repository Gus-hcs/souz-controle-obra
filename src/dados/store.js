/**
 * store.js — Persistência: carrega, guarda e sincroniza o estado da aplicação.
 */
import { APP, estadoInicial, migrar } from '../nucleo/base.js';
import { SUPA } from './supabase.js';
import { App, toast } from '../ui/shell.js';

const ARQUIVO_DADOS = 'dados/estado.json';
const CHAVE_LOCAL = 'souz_controle_obra_v1';

const Store = {
  estado: estadoInicial(),
  snapshot: null,       // último estado confirmado no banco
  backend: 'artefato',  // artefato | supabase | local
  api: null,            // namespace da capacidade "artifact"
  modo: 'iniciando',    // arquivo | pagina | local | leitura
  status: 'ok',         // ok | salvando | erro | leitura
  ultimoErro: '',
  salvoEm: null,
  pendente: false,
  timer: null,
  ouvintes: [],

  aoMudar(fn) { this.ouvintes.push(fn); },
  notificar() { this.ouvintes.forEach((f) => { try { f(); } catch (e) { console.error(e); } }); },

  /* ------------------------------------------------------------ carga */
  async iniciar() {
    const candidatos = [];

    /* 1. arquivo de dados publicado */
    try {
      const r = await fetch(ARQUIVO_DADOS, { cache: 'no-store' });
      if (r.ok) {
        const j = await r.json();
        if (j && typeof j === 'object') candidatos.push({ origem: 'arquivo', dados: j });
      }
    } catch (e) { /* arquivo ainda não existe */ }

    /* 2. estado embutido na página */
    try {
      const el = document.getElementById('souz-estado');
      if (el && el.textContent.trim().length > 2) {
        const j = JSON.parse(el.textContent);
        if (j && typeof j === 'object') candidatos.push({ origem: 'pagina', dados: j });
      }
    } catch (e) { /* sem estado embutido */ }

    /* 3. cache local */
    try {
      const s = localStorage.getItem(CHAVE_LOCAL);
      if (s) {
        const j = JSON.parse(s);
        if (j && typeof j === 'object') candidatos.push({ origem: 'local', dados: j });
      }
    } catch (e) { /* localStorage indisponível */ }

    candidatos.sort((a, b) =>
      String(b.dados?.meta?.savedAt || '').localeCompare(String(a.dados?.meta?.savedAt || '')));

    if (candidatos.length) {
      this.estado = migrar(candidatos[0].dados);
      this.salvoEm = this.estado.meta.savedAt || null;
    }

    /* capacidade de publicação (pode demorar; a interface já está de pé) */
    try {
      this.api = await claude.use('artifact');
    } catch (e) { this.api = null; }
    if (!this.api) {
      this.modo = 'local';
      this.status = 'local';
    } else {
      this.modo = 'arquivo';
    }
    this.notificar();
    return this.estado;
  },

  /* ------------------------------------------------------------ salvar */
  marcarSujo(imediato = false) {
    this.pendente = true;
    this.status = 'salvando';
    this.notificar();
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.salvar(), imediato ? 120 : 1200);
  },

  serializar() {
    this.estado.meta.savedAt = new Date().toISOString();
    this.estado.meta.versao = APP.versao;
    return JSON.stringify(this.estado);
  },

  gravarLocal(json) {
    try { localStorage.setItem(CHAVE_LOCAL, json); } catch (e) { /* cota/privado */ }
  },

  async salvar() {
    if (!this.pendente) return;
    const json = this.serializar();
    this.gravarLocal(json);

    /* ---- banco de dados online ---- */
    if (this.backend === 'supabase') {
      try {
        const anterior = this.snapshot || estadoInicial();
        await SUPA.sincronizar(anterior, this.estado);
        this.snapshot = JSON.parse(JSON.stringify(this.estado));
        this.pendente = false;
        this.status = 'ok';
        this.salvoEm = this.estado.meta.savedAt;
      } catch (err) {
        this.pendente = false;
        this.status = 'erro';
        this.ultimoErro = String((err && err.message) || err);
        toast('Não foi possível gravar no banco: ' + this.ultimoErro, 'critico', 7000);
      }
      this.notificar();
      return;
    }

    if (!this.api) {
      this.pendente = false;
      this.modo = 'local';
      this.status = 'local';
      this.notificar();
      return;
    }

    /* 1ª tentativa: publicar só o arquivo de dados (não recarrega a página) */
    if (this.modo !== 'pagina') {
      try {
        await this.api.publish({ [ARQUIVO_DADOS]: { content: json, contentType: 'application/json' } });
        this.pendente = false;
        this.modo = 'arquivo';
        this.status = 'ok';
        this.salvoEm = this.estado.meta.savedAt;
        this.notificar();
        return;
      } catch (err) {
        const cod = err && err.code;
        if (cod === 'conflict') { this.status = 'conflito'; this.notificar(); return; }
        if (cod === 'not_writer' || cod === 'not_granted' || cod === 'consent_required') {
          this.modo = 'leitura'; this.status = 'leitura'; this.pendente = false; this.notificar(); return;
        }
        if (cod === 'rate_limited') {
          this.status = 'salvando'; this.notificar();
          clearTimeout(this.timer);
          this.timer = setTimeout(() => this.salvar(), 6000);
          return;
        }
        /* capability_disabled / read_only_path / outros → tenta a página inteira */
        this.modo = 'pagina';
      }
    }

    /* 2ª tentativa: republicar a página com o estado embutido */
    try {
      const html = await this.montarPaginaComEstado(json);
      if (!html) throw { code: 'invalid_content', message: 'sem fonte da página' };
      sessionStorage.setItem('souz_rota', JSON.stringify(App.rota || {}));
      await this.api.publish(html);
      this.pendente = false;
      this.status = 'ok';
      this.salvoEm = this.estado.meta.savedAt;
      this.notificar();
    } catch (err) {
      const cod = (err && err.code) || 'erro';
      if (cod === 'conflict') { this.status = 'conflito'; this.notificar(); return; }
      if (cod === 'not_writer' || cod === 'not_granted') {
        this.modo = 'leitura'; this.status = 'leitura';
      } else {
        this.modo = 'local';
        this.status = 'erro';
        this.ultimoErro = (err && err.message) || String(err);
      }
      this.pendente = false;
      this.notificar();
    }
  },

  async montarPaginaComEstado(json) {
    let fonte = '';
    for (const url of ['index.html', location.pathname, location.href]) {
      try {
        const r = await fetch(url, { cache: 'no-store' });
        if (!r.ok) continue;
        const t = await r.text();
        if (/^\s*<!doctype/i.test(t) && t.includes('id="souz-estado"')) { fonte = t; break; }
      } catch (e) { /* tenta a próxima */ }
    }
    if (!fonte) return null;
    const marcador = /(<script[^>]*id="souz-estado"[^>]*>)([\s\S]*?)(<\/script>)/i;
    if (!marcador.test(fonte)) return null;
    const seguro = json.replace(/<\//g, '<\\/');
    return fonte.replace(marcador, (m, a, b, c) => a + seguro + c);
  },

  /* --------------------------------------------------------- utilidades */
  descricaoStatus() {
    switch (this.status) {
      case 'salvando': return { texto: 'salvando…', tom: 'aviso' };
      case 'leitura': return { texto: 'somente leitura', tom: 'neutro' };
      case 'conflito': return { texto: 'atualizando…', tom: 'aviso' };
      case 'local': return { texto: 'salvo neste navegador', tom: 'aviso' };
      case 'erro': return { texto: 'falha ao salvar', tom: 'critico' };
      default:
        return {
          texto: this.salvoEm ? 'salvo ' + horaCurta(this.salvoEm) : 'pronto',
          tom: 'ok'
        };
    }
  },

  somenteLeitura() { return this.modo === 'leitura'; },

  descricaoModo() {
    if (this.backend === 'supabase') return 'banco de dados online';
    if (this.modo === 'arquivo') return 'nuvem (arquivo de dados)';
    if (this.modo === 'pagina') return 'nuvem (página completa)';
    if (this.modo === 'leitura') return 'somente leitura';
    return 'somente neste navegador';
  }
};

const horaCurta = (iso) => {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch (e) { return ''; }
};

/* Toda alteração de dados passa por aqui: garante gravação e re-render. */
function mutar(fn, opts = {}) {
  if (Store.somenteLeitura()) {
    toast('Este acesso é somente leitura.', 'aviso');
    return false;
  }
  fn(Store.estado);
  Store.marcarSujo(opts.imediato);
  if (opts.render !== false) App.render();
  return true;
}

export {
  ARQUIVO_DADOS,
  CHAVE_LOCAL,
  Store,
  horaCurta,
  mutar
};
