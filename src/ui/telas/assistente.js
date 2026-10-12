/**
 * assistente.js — "Perguntar" (IA, 0028): a pessoa pergunta sobre as obras
 * em português e recebe a resposta com os números do próprio sistema.
 *
 * As ferramentas rodam aqui no navegador (dominio/assistente.js, sobre o
 * estado já carregado); a função `ia` faz a ponte com a Anthropic e só
 * libera a resposta se todo número dela veio de uma ferramenta. Nada é
 * gravado e a conversa fica só na sessão.
 *
 * Botão "Perguntar" no topo (computador) e botão redondo no canto
 * (celular); painel à direita / tela cheia no celular. Só para a equipe
 * (gestor e engenheiro) com a IA ligada; com ela desligada, o gestor vê o
 * convite com cadeado.
 */
import { esc, hojeISO } from '../../nucleo/base.js';
import { falhaIa, situacaoCotaIa } from '../../dominio/calculos.js';
import { conversarComIa } from '../../dominio/assistente.js';
import { Store } from '../../dados/store.js';
import { SUPA } from '../../dados/supabase.js';
import { ACOES } from '../acoes.js';
import { App, ICO, abrirModal, svg, VIEWS_OBRA } from '../shell.js';

/* situacao: linha de ia_situacao_perguntas (undefined = ainda não lida);
   conversa: só nesta sessão do navegador */
const Assist = {
  situacao: undefined,
  carregando: false,
  aberto: false,
  ocupado: false,
  conversa: [],
};

const TITULO_TELA = {
  painel: 'Painel',
  cronograma: 'Cronograma',
  lancamentos: 'Lançamentos',
  materiais: 'Plano de materiais',
  contratos: 'Contratos',
  recebimentos: 'Recebimentos',
  fluxo: 'Fluxo de caixa',
  diario: 'Diário de obra',
  alertas: 'Pendências',
  carteira: 'Carteira',
};

const SUGESTOES = {
  carteira: [
    'Qual obra está pior?',
    'Quais parcelas estão atrasadas?',
    'Qual obra tem o pior caixa?',
  ],
  painel: ['Como está esta obra?', 'O que está atrasado?', 'Quando entra a próxima parcela?'],
  lancamentos: [
    'Quanto gastei este mês?',
    'Quais os maiores fornecedores?',
    'Quanto gastei de cimento?',
  ],
  cronograma: ['Quais etapas estão atrasadas?', 'O que vem nas próximas semanas?'],
  materiais: ['O que falta comprar?', 'Algum material está travando etapa?'],
  recebimentos: ['Quando entra a próxima parcela?', 'Tem parcela atrasada?'],
  fluxo: ['Quando o caixa fica pior?', 'Quanto tenho em caixa hoje?'],
  diario: ['O que aconteceu na obra esta semana?', 'Tem ocorrência aberta?'],
  contratos: ['Quanto falta pagar dos contratos?', 'Tem medição em aberto?'],
  alertas: ['O que é mais urgente?', 'Quantas pendências críticas?'],
};

function carregarSituacao() {
  if (Assist.carregando || Assist.situacao !== undefined) return;
  Assist.carregando = true;
  SUPA.situacaoPerguntas()
    .then((s) => {
      Assist.situacao = s || { ligada: false };
    })
    .catch(() => {
      Assist.situacao = { ligada: false };
    })
    .finally(() => {
      Assist.carregando = false;
      App.renderTopo();
      garantirFab();
    });
}

const naEquipe = () =>
  !SUPA.construtora || ['gestor', 'engenheiro'].includes(SUPA.construtora.papel);
const ehGestor = () => (SUPA.construtora ? SUPA.construtora.papel === 'gestor' : true);
/* cota no formato de situacaoCotaIa (o mesmo cálculo da nota) */
const cota = () =>
  situacaoCotaIa(
    Assist.situacao &&
      Assist.situacao.ligada && {
        ligada: true,
        cota_notas: Assist.situacao.cota_perguntas,
        usado_notas: Assist.situacao.usado_perguntas,
      },
  );

/* "ligado", "convite" (gestor sem IA, ou com a cota de perguntas em zero:
   o recurso não está no plano) ou "" (não mostra) */
function modo() {
  if (Store.backend !== 'supabase' || !SUPA.usuario || !naEquipe()) return '';
  if (Assist.situacao === undefined) {
    carregarSituacao();
    return '';
  }
  const c = cota();
  if (c.ligada && !c.semCota) return 'ligado';
  return ehGestor() ? 'convite' : '';
}

/* botão do topo (gancho App.botaoTopo do shell) */
App.botaoTopo = () => {
  const m = modo();
  if (!m) return '';
  return `<button class="btn sutil assistente-topo" data-acao="${m === 'ligado' ? 'assistente-abrir' : 'assistente-convite'}" title="Perguntar sobre as obras">${svg(
    ICO[m === 'ligado' ? 'brilho' : 'cadeado'],
    14,
  )}<span class="rotulo-btn">Perguntar</span></button>`;
};

/* no celular: botão redondo no canto, fora do topo (que já está cheio) */
function garantirFab() {
  let fab = document.getElementById('assistente-fab');
  const ligado = modo() === 'ligado';
  if (!ligado) {
    if (fab) fab.remove();
    document.body.classList.remove('com-assistente');
    return;
  }
  if (!fab) {
    fab = document.createElement('button');
    fab.id = 'assistente-fab';
    fab.className = 'assistente-fab';
    fab.setAttribute('data-acao', 'assistente-abrir');
    fab.setAttribute('aria-label', 'Perguntar sobre as obras');
    fab.innerHTML = svg(ICO.brilho, 22);
    document.body.appendChild(fab);
  }
  document.body.classList.add('com-assistente');
}

ACOES['assistente-convite'] = () =>
  abrirModal({
    titulo: 'Perguntar sobre as obras',
    largura: 'estreito',
    corpo: `<p style="margin:0 0 var(--e3)">Pergunte em português — "o que está atrasado na Casa 07?", "quanto gastei de cimento este mês?" — e receba a resposta com os números do próprio sistema.</p>
      <p class="aviso-discreto" style="margin:0">Disponível no plano com IA. Fale com a Souz para ligar na sua construtora.</p>`,
    rodape: '<button class="btn" data-acao="fechar-modal">Entendi</button>',
  });

/* -------------------------------------------------------------- painel */
function contextoTela() {
  const tela = App.rota.view;
  return { tela, obraId: VIEWS_OBRA.has(tela) ? App.rota.obraId : '', hoje: hojeISO() };
}

/* **negrito** da resposta; o resto, texto puro */
const formatar = (t) =>
  esc(t)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/\n/g, '<br>');

function htmlConversa() {
  if (!Assist.conversa.length) {
    const ctx = contextoTela();
    const sug = SUGESTOES[ctx.tela] || SUGESTOES.carteira;
    return `<div class="assistente-vazio">
        <p>Pergunte sobre as suas obras. A resposta sai dos números do sistema.</p>
        <div class="assistente-sugestoes">${sug
          .map(
            (s) =>
              `<button class="pilula" data-acao="assistente-sugestao" data-texto="${esc(s)}">${esc(s)}</button>`,
          )
          .join('')}</div>
      </div>`;
  }
  return Assist.conversa
    .map((m) => {
      if (m.de === 'pessoa') return `<div class="assistente-msg pessoa">${esc(m.texto)}</div>`;
      if (m.de === 'pensando')
        return '<div class="assistente-msg ia pensando" aria-live="polite">Consultando os dados…</div>';
      const botoes = (m.telas || [])
        .filter((t) => TITULO_TELA[t.tela])
        .slice(0, 3)
        .map(
          (t) =>
            `<button class="btn sutil pequeno" data-acao="assistente-ir" data-view="${esc(t.tela)}" data-obra="${esc(t.obraId)}">Abrir ${esc(
              TITULO_TELA[t.tela],
            )}${t.obra ? ` · ${esc(t.obra.split(' — ')[0])}` : ''}</button>`,
        )
        .join('');
      return `<div class="assistente-msg ia${m.erro ? ' erro' : ''}${m.seguro === false ? ' inseguro' : ''}" aria-live="polite">${formatar(
        m.texto,
      )}${botoes ? `<div class="assistente-links">${botoes}</div>` : ''}</div>`;
    })
    .join('');
}

function htmlPainel() {
  const c = cota();
  return `<header class="assistente-cab">
      <h2>${svg(ICO.brilho, 16)} Perguntar</h2>
      <button class="btn sutil icone" data-acao="assistente-fechar" aria-label="Fechar">${svg(ICO.x, 14)}</button>
    </header>
    ${c.aviso ? `<p class="aviso-discreto tom-alerta assistente-cota">${c.usado} de ${c.cota} perguntas usadas este mês.</p>` : ''}
    <div class="assistente-conversa" data-testid="assistente-conversa">${htmlConversa()}</div>
    <form class="assistente-entrada" data-assistente-form>
      <textarea id="assistente-texto" rows="2" maxlength="500" placeholder="Ex.: o que está atrasado nesta obra?" aria-label="Sua pergunta"${
        Assist.ocupado ? ' disabled' : ''
      }></textarea>
      <button class="btn primario icone" data-acao="assistente-enviar" aria-label="Enviar pergunta"${Assist.ocupado ? ' disabled' : ''}>${svg(
        ICO.enviar,
        16,
      )}</button>
    </form>`;
}

function desenhar() {
  let p = document.getElementById('assistente');
  if (!Assist.aberto) {
    if (p) p.remove();
    document.body.classList.remove('assistente-aberto');
    return;
  }
  if (!p) {
    p = document.createElement('aside');
    p.id = 'assistente';
    p.className = 'assistente';
    p.setAttribute('role', 'dialog');
    p.setAttribute('aria-label', 'Perguntar sobre as obras');
    document.body.appendChild(p);
  }
  p.innerHTML = htmlPainel();
  document.body.classList.add('assistente-aberto');
  const cx = p.querySelector('.assistente-conversa');
  if (cx) cx.scrollTop = cx.scrollHeight;
}

ACOES['assistente-abrir'] = () => {
  Assist.aberto = true;
  desenhar();
  const t = document.getElementById('assistente-texto');
  if (t) t.focus();
};
ACOES['assistente-fechar'] = () => {
  Assist.aberto = false;
  desenhar();
};
ACOES['assistente-sugestao'] = (el, d) => perguntar(d.texto);
ACOES['assistente-enviar'] = () => {
  const t = document.getElementById('assistente-texto');
  if (t) perguntar(t.value);
};
ACOES['assistente-ir'] = (el, d) => {
  if (window.matchMedia && window.matchMedia('(max-width: 767px)').matches) {
    Assist.aberto = false;
    desenhar();
  }
  App.ir(d.view, d.obra || undefined);
};

async function perguntar(texto) {
  const pergunta = String(texto || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!pergunta || Assist.ocupado) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    Assist.conversa.push({
      de: 'ia',
      texto: 'Sem internet agora. Pergunte quando a rede voltar.',
      erro: true,
    });
    return desenhar();
  }
  if (cota().esgotada) {
    Assist.conversa.push({
      de: 'ia',
      texto: 'As perguntas deste mês acabaram. Fale com o gestor.',
      erro: true,
    });
    return desenhar();
  }
  Assist.ocupado = true;
  Assist.conversa.push({ de: 'pessoa', texto: pergunta }, { de: 'pensando' });
  desenhar();
  try {
    const r = await conversarComIa(pergunta, {
      enviar: (corpo) => SUPA.perguntarIa(corpo),
      estado: Store.estado,
      contexto: contextoTela(),
    });
    if (Assist.situacao)
      Assist.situacao.usado_perguntas = (Number(Assist.situacao.usado_perguntas) || 0) + 1;
    Assist.conversa.pop();
    Assist.conversa.push({ de: 'ia', texto: r.resposta, telas: r.telas, seguro: r.seguro });
  } catch (e) {
    Assist.conversa.pop();
    /* SUPA.perguntarIa já traz a frase para a pessoa (falhaIa); qualquer
       outra falha (uma ferramenta, a resposta fora do formato) vira a
       frase padrão — nunca o texto técnico do erro */
    Assist.conversa.push({
      de: 'ia',
      texto: e && e.motivo ? e.message : falhaIa({ status: 500 }, 'pergunta').mensagem,
      erro: true,
    });
  } finally {
    Assist.ocupado = false;
    desenhar();
    const t = document.getElementById('assistente-texto');
    if (t) t.focus();
  }
}

/* Enter envia; Shift+Enter quebra a linha. Esc fecha. */
document.addEventListener('keydown', (ev) => {
  if (ev.target && ev.target.id === 'assistente-texto' && ev.key === 'Enter' && !ev.shiftKey) {
    ev.preventDefault();
    perguntar(ev.target.value);
  }
  if (ev.key === 'Escape' && Assist.aberto && !document.querySelector('#modal-camada.aberto')) {
    Assist.aberto = false;
    desenhar();
  }
});

export { Assist, perguntar, garantirFab };
