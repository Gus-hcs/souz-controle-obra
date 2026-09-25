/**
 * telas/ajustes.js — Ajustes e dados, na linguagem nova.
 *
 * Tela de sistema, não de obra: dados da empresa, backup, listas editáveis
 * e a zona de risco. Sem cálculo de domínio — só lê e grava Store.estado.
 */
import { esc, fmtData, fonteImagem } from '../../nucleo/base.js';
import { Store, horaCurta } from '../../dados/store.js';
import { SUPA } from '../../dados/supabase.js';
import { botao, campoHTML } from '../shell.js';
import { VIEWS } from '../telas-obra.js';

const LISTAS_EDITAVEIS = [
  ['etapas', 'Etapas da obra'],
  ['tiposSaida', 'Tipos de saída'],
  ['unidades', 'Unidades'],
  ['formasPagamento', 'Formas de pagamento'],
  ['regimes', 'Regimes de contrato'],
  ['origensRecebimento', 'Origens de recebimento'],
  ['especialidades', 'Especialidades de prestador'],
  [
    'mensagensWhatsapp',
    'Mensagens prontas do WhatsApp',
    'Uma por linha: "Título | texto". Use {nome}, {obra}, {valor} (último pagamento) e {data} (amanhã).',
  ],
];

function kpisAjustes(e, tamanho) {
  const totalRegistros = e.obras.reduce(
    (s, o) =>
      s +
      o.contratos.length +
      o.medicoes.length +
      o.recebimentos.length +
      o.lancamentos.length +
      o.materiais.length +
      o.cronograma.length +
      o.diario.length,
    0,
  );
  const item = (rotulo, valor, contexto) => `<div class="kpi-item">
    <span class="kpi-rot">${esc(rotulo)}</span>
    <span class="kpi-val">${valor}</span>
    <span class="kpi-ctx">${contexto}</span>
  </div>`;

  return `<div class="kpis" role="group" aria-label="Indicadores da base de dados">
    ${item('Obras cadastradas', e.obras.length, 'nesta conta')}
    ${item('Registros no total', totalRegistros, 'contratos, medições, recebimentos e mais')}
    ${item(
      'Última gravação',
      Store.salvoEm ? `${fmtData(Store.salvoEm.slice(0, 10))}` : '—',
      Store.salvoEm ? horaCurta(Store.salvoEm) : 'ainda não salvou',
    )}
    ${item('Tamanho da base', `${tamanho} KB`, Store.descricaoModo())}
  </div>`;
}

/* ---------------------------------------------------------------- tela */
VIEWS.ajustes = () => {
  const e = Store.estado;
  const emp = e.empresa;
  const tamanho = (JSON.stringify(e).length / 1024).toFixed(0);

  return `<div class="tela-lista">
    ${kpisAjustes(e, tamanho)}

    <div class="caixa">
      <div class="caixa-cab">
        <h3>Empresa</h3>
        <div class="dir">${botao('Salvar', 'salvar-empresa', {}, 'btn primario pequeno')}</div>
      </div>
      <form class="form-grade" data-form="1" onsubmit="return false">
        ${campoHTML({ k: 'nome', label: 'Nome da empresa', tipo: 'texto', col: 6 }, emp)}
        ${campoHTML({ k: 'responsavel', label: 'Responsável técnico', tipo: 'texto', col: 6 }, emp)}
        ${campoHTML({ k: 'creaCau', label: 'CREA/CAU', tipo: 'texto', col: 4 }, emp)}
        ${campoHTML({ k: 'telefone', label: 'Telefone', tipo: 'texto', col: 4 }, emp)}
        ${campoHTML({ k: 'email', label: 'E-mail', tipo: 'texto', col: 4 }, emp)}
        <div class="campo c12">
          <label>Logo da empresa</label>
          <input type="hidden" data-campo="logo" id="emp_logo_val" value="${esc(emp.logo || '')}">
          <div class="logo-campo" id="logo-cx-empresa">${
            emp.logo
              ? `<img src="${fonteImagem(emp.logo)}" alt="Logo" class="logo-preview"><button type="button" class="btn sutil pequeno" data-acao="logo-remover" data-alvo="empresa">Remover</button>`
              : `<label class="btn pequeno" style="cursor:pointer">Escolher imagem<input type="file" accept="image/png,image/jpeg,image/webp" data-logo="1" data-alvo="empresa" hidden></label>`
          }</div>
          <span class="dica">PNG ou JPG. Aparece no cabeçalho do relatório em PDF, ao lado do nome.</span>
        </div>
      </form>
    </div>

    <div class="caixa">
      <div class="caixa-cab"><h3>Dados e backup</h3></div>
      <div style="display:flex;flex-direction:column;gap:14px">
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${botao('Baixar backup (JSON)', 'backup-json', {}, 'btn', 'baixar')}
          ${botao('Restaurar backup', 'restaurar-json', {}, 'btn')}
          ${botao('Importar planilha (modelo MCMV)', 'importar-xlsx', {}, 'btn')}
          ${botao('Carregar dados de exemplo', 'exemplo', {}, 'btn sutil')}
        </div>
        <table class="tab">
          <tbody>
            <tr><td style="width:220px">Modo de gravação</td><td class="mono">${esc(Store.descricaoModo())}</td></tr>
            ${
              Store.backend === 'supabase'
                ? `<tr><td>Conta</td><td class="mono">${esc((SUPA.usuario && SUPA.usuario.email) || '')}</td></tr>${
                    /* endereço do banco é infraestrutura: só o administrador vê */
                    SUPA.ehAdmin
                      ? `
            <tr><td>Projeto do banco</td><td class="mono">${esc(SUPA.cfg.url)}</td></tr>`
                      : ''
                  }`
                : ''
            }
            <tr><td>Última gravação</td><td class="mono">${Store.salvoEm ? fmtData(Store.salvoEm.slice(0, 10)) + ' ' + horaCurta(Store.salvoEm) : '—'}</td></tr>
          </tbody>
        </table>
        <p class="tinta3" style="margin:0;font-size:var(--t-peq)">
          O backup JSON contém toda a base e serve tanto para guardar cópia quanto para migrar o sistema
          para um servidor próprio no futuro.
        </p>
      </div>
    </div>

    <div class="caixa">
      <div class="caixa-cab">
        <h3>Listas do sistema</h3>
        <div class="dir">${botao('Salvar listas', 'salvar-listas', {}, 'btn primario pequeno')}</div>
      </div>
      <div class="grade g2">
        ${LISTAS_EDITAVEIS.map(
          ([k, t, dica]) => `
          <div class="campo">
            <label for="lista_${k}">${esc(t)}</label>
            <textarea id="lista_${k}" data-lista="${k}" rows="5">${esc((e.listas[k] || []).join('\n'))}</textarea>
            <span class="dica">${esc(dica || 'Um item por linha.')}</span>
          </div>`,
        ).join('')}
      </div>
    </div>

    <div class="caixa">
      <div class="caixa-cab"><h3>Zona de risco</h3></div>
      <p style="margin:0 0 var(--e3);font-size:var(--t-corpo)">Apaga toda a base do sistema. Baixe um backup antes.</p>
      ${botao('Apagar todos os dados', 'zerar', {}, 'btn perigo', 'lixo')}
    </div>
  </div>`;
};
