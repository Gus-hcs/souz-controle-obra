/**
 * erros.js — Erros do app (0026): o que quebra no aparelho de alguém chega
 * ao administrador, sem dado da obra.
 *
 * registroErroApp limpa e corta o registro (e-mail, número longo, parâmetro
 * de URL e data: URI saem; tamanhos de validarErroApp). ligarMonitorErros
 * escuta error e unhandledrejection: cada erro vai uma vez por sessão, no
 * máximo `max`, só quando podeEnviar() (rede, conta logada e ativa). Falha
 * ao enviar desliga o monitor na sessão — erro do monitor não gera erro.
 */
import { LIMITES_ERRO_APP, validarErroApp } from '../dominio/validacao.js';

/* não é defeito do app: extensão do navegador, script de outro domínio
   (o navegador esconde a mensagem), aviso benigno do ResizeObserver e
   queda de rede, que a gravação offline já trata */
const IGNORAR_MENSAGEM =
  /^Script error\.?$|ResizeObserver loop|Failed to fetch|NetworkError|Load failed|network error|AbortError|The user aborted/i;
const IGNORAR_ORIGEM = /^(chrome|moz|safari(-web)?)-extension:/i;

const cortar = (s, max) => {
  const t = String(s == null ? '' : s);
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
};

/* URL sem consulta nem âncora (link assinado do Storage leva token) e
   data: URI sem o conteúdo */
function limparUrls(s) {
  return String(s || '')
    .replace(/\b(https?:\/\/[^\s?#'"()<>]+)[?#][^\s'"()<>]*/g, '$1')
    .replace(/\bdata:([a-z]+\/[a-z0-9.+-]+)[^\s'"()<>]{8,}/gi, 'data:$1…');
}
/* mensagem: além das URLs, e-mail e número longo (CPF, CNPJ, telefone,
   conta) — a pilha só tem arquivo:linha:coluna, e coluna de arquivo
   minificado passa de 6 dígitos */
function limparMensagem(s) {
  return limparUrls(s)
    .replace(/[^\s@<>()'"]+@[^\s@<>()'"]+\.[a-z]{2,}/gi, '[e-mail]')
    .replace(/\d(?:[.\-/ ]?\d){7,}/g, '[número]');
}

function registroErroApp({ mensagem, origem, pilha, tela, versao, navegador }) {
  const L = LIMITES_ERRO_APP;
  const t = String(tela || '');
  return {
    mensagem: cortar(limparMensagem(mensagem).trim() || 'Erro sem mensagem', L.mensagem),
    origem: cortar(limparUrls(origem), L.origem),
    pilha: cortar(limparUrls(pilha), L.pilha),
    tela: /^[a-z0-9-]{0,40}$/.test(t) ? t : '',
    versao: cortar(versao, L.versao),
    navegador: cortar(navegador, L.navegador),
  };
}

/* evento do navegador → { mensagem, origem, pilha } (ou null: ignorar) */
function dadosDoEvento(ev) {
  let erro;
  let origem = '';
  if (ev && ev.type === 'unhandledrejection') {
    erro = ev.reason;
  } else {
    erro = ev && ev.error;
    if (ev && ev.filename) origem = `${ev.filename}:${ev.lineno || 0}:${ev.colno || 0}`;
  }
  const mensagem =
    (erro && erro.message) || (ev && ev.message) || (erro != null ? String(erro) : '');
  const pilha = (erro && erro.stack) || '';
  if (!origem && pilha) {
    const m = pilha.match(/(?:https?|file|blob):[^\s()]+:\d+:\d+/);
    if (m) origem = m[0];
  }
  if (IGNORAR_MENSAGEM.test(String(mensagem).trim()) || (erro && erro.name === 'AbortError')) {
    return null;
  }
  if (IGNORAR_ORIGEM.test(origem) || IGNORAR_ORIGEM.test(pilha.split('\n').slice(0, 3).join(' '))) {
    return null;
  }
  return { mensagem, origem, pilha };
}

function ligarMonitorErros({
  alvo = typeof window !== 'undefined' ? window : null,
  enviar,
  podeEnviar = () => true,
  tela = () => '',
  versao = '',
  navegador = typeof navigator !== 'undefined' ? navigator.userAgent : '',
  max = 20,
}) {
  const estado = { enviados: 0, vistos: new Set(), desligado: false };
  const ouvir = (ev) => {
    if (estado.desligado || estado.enviados >= max) return;
    const d = dadosDoEvento(ev);
    if (!d) return;
    let podeAgora = false;
    try {
      podeAgora = !!podeEnviar();
    } catch (e) {
      podeAgora = false;
    }
    if (!podeAgora) return;
    const reg = registroErroApp({ ...d, tela: tela(), versao, navegador });
    const chave = reg.mensagem + '|' + reg.origem;
    if (estado.vistos.has(chave)) return;
    if (validarErroApp(reg).length) return;
    estado.vistos.add(chave);
    estado.enviados++;
    Promise.resolve()
      .then(() => enviar(reg))
      .catch(() => {
        /* sem a 0026, sem permissão ou sem rede: para de tentar nesta sessão */
        estado.desligado = true;
      });
  };
  if (alvo) {
    alvo.addEventListener('error', ouvir);
    alvo.addEventListener('unhandledrejection', ouvir);
  }
  return {
    estado,
    ouvir,
    desligar() {
      if (alvo) {
        alvo.removeEventListener('error', ouvir);
        alvo.removeEventListener('unhandledrejection', ouvir);
      }
    },
  };
}

export { registroErroApp, dadosDoEvento, ligarMonitorErros };
