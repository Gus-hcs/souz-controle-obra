/**
 * telas-obra.js — Estado e helpers compartilhados que sobrevivem à telas
 * novas: alertaHTML (carteira.js e as telas de obra usam) e a carga da
 * trilha de auditoria (acoes.js e telas/auditoria.js usam).
 *
 * As telas em si (painel, contratos, medições, recebimentos, lançamentos,
 * materiais, cronograma, curva, fluxo, alertas, diário, configuração da
 * obra, carteira) já foram todas migradas para ui/telas/*.js, na
 * linguagem visual nova. Este arquivo só guarda o que elas ainda importam.
 */
import { esc, fmtData, fmtMoney } from '../nucleo/base.js';
import { Store } from '../dados/store.js';
import { SUPA } from '../dados/supabase.js';
import { App } from './shell.js';

const VIEWS = {};

/* obraIds onde o usuário abriu o cartão de implantação já montada
   (telas/painel.js lê e escreve; a ação impl-toggle fica em acoes.js) */
const implExpandida = new Set();

/* Verbo da ação no botão, pela tela onde se resolve — "abrir" pequeno e
   sem cor não dizia o que fazer (auditoria, tela de Alertas). */
const VERBO_VIEW = {
  medicoes: 'Ver medição',
  contratos: 'Ver contrato',
  cronograma: 'Atualizar cronograma',
  materiais: 'Registrar compra',
  recebimentos: 'Ver parcela',
  lancamentos: 'Conferir lançamentos',
  fluxo: 'Ver caixa',
  curva: 'Ver curva S',
  painel: 'Ver painel',
  'obra-config': 'Ajustar configuração',
  diario: 'Ver ocorrência',
};
function rotuloAcao(a) {
  return VERBO_VIEW[a.ref && a.ref.view] || 'Abrir';
}

function botaoAcao(a) {
  return a.ref && a.ref.view
    ? `<button class="btn pequeno" data-acao="ir" data-view="${esc(a.ref.view)}" data-obra="${esc(a.obraId)}">${esc(rotuloAcao(a))}</button>`
    : '';
}

/* "R$ 37.500 em jogo · 40 dias" — o que faz um alerta pesar mais que outro */
function pesoAlerta(a) {
  return [
    a.valor > 0.5 ? `${fmtMoney(a.valor, { dec: 0 })} em jogo` : '',
    a.dias > 0 ? `${a.dias} dia${a.dias === 1 ? '' : 's'}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

/* Tratamento de alerta (migração 0015): só para quem escreve na obra, e só
   se a tabela já existe no banco — sem ela, o botão some em vez de falhar. */
function podeTratar() {
  if (Store.somenteLeitura()) return false;
  return Store.backend !== 'supabase' || SUPA.tabelaDisponivel('alertas_tratamento');
}

/* A linha que diz o que já se decidiu sobre o alerta. */
function linhaTratamento(a) {
  const t = a.tratamento;
  if (a.reaberto) return `<span class="trat reaberto">Reaberto: ${esc(a.reaberto)}</span>`;
  if (!t) return '';
  const quem = t.responsavel ? ` · com ${esc(t.responsavel)}` : '';
  const nota = t.nota ? ` · ${esc(t.nota)}` : '';
  if (a.silenciado && t.status === 'adiado') return `<span class="trat">Adiado até ${fmtData(t.adiarAte)}${quem}${nota}</span>`;
  if (a.silenciado) return `<span class="trat">Resolvido em ${fmtData(t.dataMarcacao)}${quem}${nota}</span>`;
  return `<span class="trat andamento">Em tratamento${quem}${nota}</span>`;
}

/* Botões de decisão: Tratar (ou Reabrir, quando já está silenciado). */
function botaoTratar(chaves, obraId, silenciado) {
  if (!podeTratar() || !chaves.length) return '';
  return silenciado
    ? `<button class="btn sutil pequeno" data-acao="reabrir-alerta" data-obra="${esc(obraId)}" data-chaves="${esc(chaves.join('|'))}">Reabrir</button>`
    : `<button class="btn sutil pequeno" data-acao="tratar-alerta" data-obra="${esc(obraId)}" data-chaves="${esc(chaves.join('|'))}">Tratar</button>`;
}

function alertaHTML(a, mostrarObra = false) {
  const peso = pesoAlerta(a);
  return `<div class="alerta s${a.sev}${a.silenciado ? ' silenciado' : ''}">
    <span class="sev"></span>
    <div class="txt">
      <b>${esc(a.titulo)}</b>
      ${mostrarObra ? `<span class="chip" style="margin-left:6px">${esc(a.obraNome)}</span>` : ''}
      <p>${esc(a.detalhe)}${peso ? ` <span class="tinta3">· ${esc(peso)}</span>` : ''}</p>
      <span class="acao">→ ${esc(a.acao)}</span>
      ${linhaTratamento(a)}
    </div>
    <div class="alerta-botoes">${botaoTratar(a.chave ? [a.chave] : [], a.obraId, a.silenciado)}${botaoAcao(a)}</div>
  </div>`;
}

/* Uma causa-raiz (causasRaizObra): o problema, o que ele custa, a ação —
   e os sintomas embaixo, recolhidos, em vez de soltos na lista. */
function causaHTML(c, mostrarObra = false) {
  const peso = pesoAlerta(c);
  const sint = c.sintomas.length
    ? `<details class="causa-sintomas"><summary>${c.sintomas.length} sintoma${c.sintomas.length > 1 ? 's' : ''} desta causa</summary>
        <ul>${c.sintomas.map((s) => `<li class="s${s.sev}">${esc(s.titulo)}</li>`).join('')}</ul>
      </details>`
    : '';
  return `<div class="alerta causa s${c.sev}">
    <span class="sev"></span>
    <div class="txt">
      <b>${esc(c.titulo)}</b>
      ${mostrarObra ? `<span class="chip" style="margin-left:6px">${esc(c.obraNome)}</span>` : ''}
      <p>${esc(c.detalhe)}${peso ? ` <span class="tinta3">· ${esc(peso)}</span>` : ''}</p>
      <span class="acao">→ ${esc(c.acao)}</span>
      ${linhaTratamento(c.principal)}
      ${sint}
    </div>
    <div class="alerta-botoes">${botaoTratar(
      [c.principal, ...c.sintomas].map((a) => a.chave).filter(Boolean),
      c.obraId,
      false,
    )}${botaoAcao(c)}</div>
  </div>`;
}

/* Frase-âncora (historiaObra / historiaCarteira): a primeira coisa da tela.
   Situação em uma linha, com cor por pedaço; "Por quê" = as causas-raiz;
   "Fazer" = um botão por causa, com o verbo da ação. */
const TOM_ANCORA = { critico: 'atraso', atencao: 'tom-alerta', ok: 'feito' };

function fraseAncoraHTML(h, { status = '', mostrarObra = false } = {}) {
  const sit = h.situacao
    .map((x) => `<span class="${TOM_ANCORA[x.nivel] || ''}">${esc(x.texto)}</span>`)
    .join('<span class="tinta3"> · </span>');
  const causas = h.causas.length
    ? `<p class="ancora-linha"><span class="ancora-rot">Por quê</span><span>${h.causas
        .map((c) => `${esc(c.titulo)}${mostrarObra ? ` <span class="tinta3">(${esc(c.obraNome)})</span>` : ''}`)
        .join('<span class="tinta3"> · </span>')}</span></p>`
    : '';
  const acoes = h.causas.length
    ? `<p class="ancora-linha ancora-acoes"><span class="ancora-rot">Fazer</span><span>${h.causas
        .map(
          (c) =>
            `<button class="btn pequeno" data-acao="ir" data-view="${esc((c.ref && c.ref.view) || 'alertas')}" data-obra="${esc(c.obraId)}" title="${esc(c.titulo)}">${esc(c.acao.replace(/\.$/, ''))}</button>`,
        )
        .join('')}</span></p>`
    : '';
  return `<section class="frase-ancora n-${h.nivel}" aria-label="Situação">
    <p class="ancora-situacao">${status ? `<span class="tinta2">${esc(status)}</span><span class="tinta3"> · </span>` : ''}${sit || '<span class="tinta2">Sem números para contar ainda.</span>'}</p>
    ${causas}
    ${acoes}
  </section>`;
}

/* ==================================================== TRILHA DE AUDITORIA
   Só o estado da carga e o carregamento ficam aqui (acoes.js precisa de
   carregarAuditoria e este módulo não pode importar telas/auditoria.js —
   ele importa componentes.js, que importa acoes.js, e fecharia um ciclo).
   O resto — formatação e a tela em si — está em telas/auditoria.js. */
const Auditoria = { chave: '', linhas: null, erro: '', carregando: false };

function carregarAuditoria(chave, forcar = false) {
  if (Auditoria.carregando) return;
  if (!forcar && Auditoria.chave === chave && (Auditoria.linhas || Auditoria.erro)) return;
  Auditoria.chave = chave;
  Auditoria.linhas = null;
  Auditoria.erro = '';
  Auditoria.carregando = true;
  SUPA.lerAuditoria(chave)
    .then((linhas) => {
      Auditoria.linhas = linhas;
    })
    .catch((e) => {
      Auditoria.erro = String((e && e.message) || e);
    })
    .finally(() => {
      Auditoria.carregando = false;
      const o = App.obra();
      if (App.rota.view === 'auditoria' && o && o.id === chave) App.renderConteudo();
    });
}

export {
  VIEWS,
  alertaHTML,
  causaHTML,
  fraseAncoraHTML,
  rotuloAcao,
  Auditoria,
  carregarAuditoria,
  implExpandida,
};
