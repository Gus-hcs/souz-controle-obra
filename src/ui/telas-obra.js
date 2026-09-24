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
import { esc } from '../nucleo/base.js';
import { SUPA } from '../dados/supabase.js';
import { App } from './shell.js';

const VIEWS = {};

/* obraIds onde o usuário abriu o cartão de implantação já montada
   (telas/painel.js lê e escreve; a ação impl-toggle fica em acoes.js) */
const implExpandida = new Set();

function alertaHTML(a, mostrarObra = false) {
  return `<div class="alerta s${a.sev}">
    <span class="sev"></span>
    <div class="txt">
      <b>${esc(a.titulo)}</b>
      ${mostrarObra ? `<span class="chip" style="margin-left:6px">${esc(a.obraNome)}</span>` : ''}
      <p>${esc(a.detalhe)}</p>
      <span class="acao">→ ${esc(a.acao)}</span>
    </div>
    ${a.ref && a.ref.view ? `<button class="btn sutil pequeno" data-acao="ir" data-view="${a.ref.view}" data-obra="${a.obraId}">abrir</button>` : ''}
  </div>`;
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

export { VIEWS, alertaHTML, Auditoria, carregarAuditoria, implExpandida };
