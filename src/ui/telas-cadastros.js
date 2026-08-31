/**
 * telas-cadastros.js — Telas de cadastro: clientes, prestadores, relatórios e ajustes.
 */
import { esc, fmtData, fmtDataCurta, fmtMoney, fmtPct, hojeISO, norm, num } from '../nucleo/base.js';
import { alertasObra, basesContratuais, contratoValor, etapaCalc, kpisObra } from '../dominio/calculos.js';
import { Store, horaCurta } from '../dados/store.js';
import { SUPA } from '../dados/supabase.js';
import { App, acoesLinha, botao, campoBusca, campoHTML, cartao, chip, filtraTexto, kpi, nomeCliente, tomSituacao, vazio } from './shell.js';
import { VIEWS } from './telas-obra.js';

/* =========================================================== CLIENTES */
VIEWS.clientes = () => {
  const e = Store.estado;
  const lista = filtraTexto(e.clientes, App.filtros.busca, ['nome', 'contato', 'telefone', 'email', 'origem']);
  const linhas = lista.map((c) => {
    const obras = e.obras.filter((o) => o.clienteId === c.id);
    const valor = obras.reduce((s, o) => s + num(o.fin.valorVenda), 0);
    return `<tr>
      <td><b>${esc(c.nome)}</b>${c.documento ? `<br><span style="font-size:11px;color:var(--mudo)" class="mono">${esc(c.documento)}</span>` : ''}</td>
      <td>${chip(c.situacao || 'Cliente', c.situacao === 'Prospecção' ? 'aviso' : 'ok')}</td>
      <td>${esc(c.telefone || '—')}</td>
      <td class="trunc">${esc(c.email || '—')}</td>
      <td>${esc(c.origem || '—')}</td>
      <td>${obras.length ? obras.map((o) => `<button class="chip marca" data-acao="ir" data-view="painel" data-obra="${o.id}" style="cursor:pointer">${esc(o.nome)}</button>`).join(' ') : '<span style="color:var(--mudo)">—</span>'}</td>
      <td class="num mono">${valor ? fmtMoney(valor, { dec: 0 }) : '—'}</td>
      <td class="acoes">${acoesLinha('cliente', c.id)}</td>
    </tr>`;
  }).join('');

  return cartao('Clientes e interessados', `
    <div class="tab-rolagem"><table class="tab">
      <thead><tr><th>Nome</th><th>Situação</th><th>Telefone</th><th>E-mail</th><th>Origem</th>
        <th>Obras</th><th class="num">Valor contratado</th><th></th></tr></thead>
      <tbody>${linhas || `<tr><td colspan="8">${vazio('Nenhum cliente', 'Cadastre compradores e interessados para vincular às obras e acompanhar a carteira.')}</td></tr>`}</tbody>
    </table></div>`, {
    semPadding: true,
    acoes: `<div class="filtros">${campoBusca('busca', 'Buscar cliente…')}
      ${botao('Novo cliente', 'novo-cliente', {}, 'btn primario pequeno', 'mais')}</div>`
  });
};

/* ======================================================== PRESTADORES */
VIEWS.prestadores = () => {
  const e = Store.estado;
  const lista = filtraTexto(e.prestadores, App.filtros.busca, ['nome', 'especialidade', 'telefone']);
  const linhas = lista.map((p) => {
    let contratado = 0, pago = 0;
    const obras = new Set();
    e.obras.forEach((o) => {
      o.contratos.filter((c) => norm(c.prestador) === norm(p.nome) && c.status !== 'Cancelado').forEach((c) => {
        contratado += contratoValor(c); obras.add(o.nome);
      });
      const bases = o.contratos.filter((c) => norm(c.prestador) === norm(p.nome)).map((c) => c.codigoBase);
      o.medicoes.filter((m) => bases.includes(m.contratoBase) && m.status !== 'Cancelado')
        .forEach((m) => { pago += num(m.valorPago); });
    });
    return `<tr>
      <td><b>${esc(p.nome)}</b></td>
      <td>${esc(p.especialidade || '—')}</td>
      <td>${esc(p.telefone || '—')}</td>
      <td>${p.avaliacao ? '★'.repeat(Math.min(5, Math.round(num(p.avaliacao)))) : '—'}</td>
      <td>${obras.size ? esc([...obras].join(', ')) : '—'}</td>
      <td class="num mono">${fmtMoney(contratado, { dec: 0 })}</td>
      <td class="num mono">${fmtMoney(pago, { dec: 0 })}</td>
      <td class="acoes">${acoesLinha('prestador', p.id)}</td>
    </tr>`;
  }).join('');

  return cartao('Prestadores e empreiteiros', `
    <div class="tab-rolagem"><table class="tab">
      <thead><tr><th>Nome</th><th>Especialidade</th><th>Telefone</th><th>Avaliação</th>
        <th>Obras</th><th class="num">Contratado</th><th class="num">Pago</th><th></th></tr></thead>
      <tbody>${linhas || `<tr><td colspan="8">${vazio('Nenhum prestador', 'Cadastre empreiteiros e prestadores para reaproveitar em contratos e acompanhar o quanto cada um já recebeu.')}</td></tr>`}</tbody>
    </table></div>`, {
    semPadding: true,
    acoes: `<div class="filtros">${campoBusca('busca', 'Buscar prestador…')}
      ${botao('Novo prestador', 'novo-prestador', {}, 'btn primario pequeno', 'mais')}</div>`
  });
};

/* ========================================================= RELATÓRIOS */
VIEWS.relatorio = () => {
  const o = App.obra();
  const k = kpisObra(o);
  const al = alertasObra(o);
  const bases = basesContratuais(o);
  const hoje = fmtData(hojeISO());

  const previa = `
  <div class="relatorio" id="previa-relatorio">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid var(--linha-forte);padding-bottom:10px;margin-bottom:14px">
      <div>
        <h2 style="font-size:21px;margin:0">${esc(o.nome)}</h2>
        <div style="font-size:12px;color:var(--mudo)">${esc([nomeCliente(o.clienteId), o.cidade, o.endereco].filter(Boolean).join(' · '))}</div>
      </div>
      <div style="text-align:right;font-size:12px;color:var(--mudo)">
        <b style="font-family:'Barlow Condensed';font-size:15px;color:var(--tinta)">${esc(Store.estado.empresa.nome || 'Souz Controle de Obra')}</b><br>
        Relatório de status · ${hoje}
      </div>
    </div>
    <div class="grade g4" style="gap:10px;margin-bottom:14px">
      ${kpi('Avanço físico', fmtPct(k.progressoFisico, 0), `${k.etapasConcluidas} de ${k.etapasTotal} etapas`)}
      ${kpi('Recebido', fmtMoney(k.recebido, { dec: 0 }), `de ${fmtMoney(k.financiado, { dec: 0 })}`)}
      ${kpi('Pago', fmtMoney(k.totalPago, { dec: 0 }), `custo/m² ${k.area ? fmtMoney(k.custoM2, { dec: 0 }) : '—'}`)}
      ${kpi('Saldo em caixa', fmtMoney(k.saldoCaixa, { dec: 0 }), '', k.saldoCaixa < 0 ? 'critico' : 'ok')}
    </div>
    <h3 style="margin:14px 0 6px">Situação das etapas</h3>
    <table class="tab"><thead><tr><th>Etapa</th><th>Previsto</th><th class="num">Progresso</th><th>Situação</th></tr></thead>
      <tbody>${o.cronograma.map((e) => {
        const c = etapaCalc(e);
        return `<tr><td>${esc(e.etapa)}</td><td class="mono">${fmtDataCurta(e.inicioPrevisto)} → ${fmtDataCurta(e.fimPrevisto)}</td>
          <td class="num mono">${fmtPct(c.progresso, 0)}</td><td>${chip(c.situacao, tomSituacao(c.situacao))}</td></tr>`;
      }).join('') || '<tr><td colspan="4">Cronograma não cadastrado.</td></tr>'}</tbody></table>
    <h3 style="margin:16px 0 6px">Contratos</h3>
    <table class="tab"><thead><tr><th>Contrato</th><th>Prestador</th><th class="num">Autorizado</th><th class="num">Pago</th><th class="num">Saldo</th></tr></thead>
      <tbody>${bases.map((b) => `<tr><td class="mono">${esc(b.base)}</td><td>${esc(b.prestador)}</td>
        <td class="num mono">${fmtMoney(b.autorizado)}</td><td class="num mono">${fmtMoney(b.pago)}</td>
        <td class="num mono ${b.saldo < 0 ? 'neg' : ''}">${fmtMoney(b.saldo)}</td></tr>`).join('') || '<tr><td colspan="5">Sem contratos.</td></tr>'}</tbody></table>
    ${al.length ? `<h3 style="margin:16px 0 6px">Pendências</h3>
      <ul style="margin:0;padding-left:18px;font-size:13px">${al.slice(0, 10).map((a) => `<li><b>${esc(a.titulo)}</b> — ${a.detalhe}</li>`).join('')}</ul>` : ''}
  </div>`;

  return `<div class="grade" style="gap:16px">
    ${cartao('Gerar documento', `
      <div class="grade g3">
        <button class="obra-cartao" data-acao="pdf-status">
          <h4>Relatório de status da obra</h4>
          <p style="font-size:12.5px;color:var(--mudo);margin:0">PDF com avanço físico, financeiro, contratos, cronograma e pendências. Para enviar ao cliente ou arquivar.</p>
          <span class="chip marca" style="align-self:flex-start">PDF</span>
        </button>
        <button class="obra-cartao" data-acao="pdf-prestacao">
          <h4>Prestação de contas</h4>
          <p style="font-size:12.5px;color:var(--mudo);margin:0">PDF com todas as entradas e saídas lançadas, medição a medição e nota a nota, com saldo final.</p>
          <span class="chip marca" style="align-self:flex-start">PDF</span>
        </button>
        <button class="obra-cartao" data-acao="pdf-medicao">
          <h4>Memória de medição CAIXA</h4>
          <p style="font-size:12.5px;color:var(--mudo);margin:0">PDF com o percentual por etapa e o valor a solicitar na próxima medição do PCI.</p>
          <span class="chip marca" style="align-self:flex-start">PDF</span>
        </button>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;border-top:1px solid var(--linha);padding-top:14px">
        ${botao('Exportar lançamentos (CSV)', 'csv-lancamentos', {}, 'btn', 'baixar')}
        ${botao('Exportar medições (CSV)', 'csv-medicoes', {}, 'btn', 'baixar')}
        ${botao('Exportar recebimentos (CSV)', 'csv-recebimentos', {}, 'btn', 'baixar')}
        ${botao('Imprimir esta página', 'imprimir', {}, 'btn sutil')}
      </div>`)}
    ${cartao('Prévia — relatório de status', previa, { semPadding: false })}
  </div>`;
};

/* ============================================================ AJUSTES */
VIEWS.ajustes = () => {
  const e = Store.estado;
  const emp = e.empresa;
  const tamanho = (JSON.stringify(e).length / 1024).toFixed(0);
  const listasEditaveis = [
    ['etapas', 'Etapas da obra'], ['tiposSaida', 'Tipos de saída'], ['unidades', 'Unidades'],
    ['formasPagamento', 'Formas de pagamento'], ['regimes', 'Regimes de contrato'],
    ['origensRecebimento', 'Origens de recebimento']
  ];

  return `<div class="grade" style="gap:16px">
    ${cartao('Empresa', `<form class="form-grade" data-form="1" onsubmit="return false">
      ${campoHTML({ k: 'nome', label: 'Nome da empresa', tipo: 'texto', col: 6 }, emp)}
      ${campoHTML({ k: 'responsavel', label: 'Responsável técnico', tipo: 'texto', col: 6 }, emp)}
      ${campoHTML({ k: 'creaCau', label: 'CREA/CAU', tipo: 'texto', col: 4 }, emp)}
      ${campoHTML({ k: 'telefone', label: 'Telefone', tipo: 'texto', col: 4 }, emp)}
      ${campoHTML({ k: 'email', label: 'E-mail', tipo: 'texto', col: 4 }, emp)}
    </form>`, { acoes: botao('Salvar', 'salvar-empresa', {}, 'btn primario pequeno') })}

    ${cartao('Dados e backup', `
      <div style="display:flex;flex-direction:column;gap:14px">
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${botao('Baixar backup (JSON)', 'backup-json', {}, 'btn', 'baixar')}
          ${botao('Restaurar backup', 'restaurar-json', {}, 'btn')}
          ${botao('Importar planilha MCMV', 'importar-xlsx', {}, 'btn')}
          ${botao('Carregar dados de exemplo', 'exemplo', {}, 'btn sutil')}
        </div>
        <table class="tab">
          <tbody>
            <tr><td style="width:220px">Obras cadastradas</td><td class="mono">${e.obras.length}</td></tr>
            <tr><td>Registros no total</td><td class="mono">${e.obras.reduce((s, o) =>
              s + o.contratos.length + o.medicoes.length + o.recebimentos.length + o.lancamentos.length + o.materiais.length + o.cronograma.length + o.diario.length, 0)}</td></tr>
            <tr><td>Tamanho da base</td><td class="mono">${tamanho} KB</td></tr>
            <tr><td>Modo de gravação</td><td class="mono">${Store.descricaoModo()}</td></tr>
            ${Store.backend === 'supabase' ? `<tr><td>Conta</td><td class="mono">${esc((SUPA.usuario && SUPA.usuario.email) || '')}</td></tr>
            <tr><td>Projeto do banco</td><td class="mono">${esc(SUPA.cfg.url)}</td></tr>` : ''}
            <tr><td>Última gravação</td><td class="mono">${Store.salvoEm ? fmtData(Store.salvoEm.slice(0, 10)) + ' ' + horaCurta(Store.salvoEm) : '—'}</td></tr>
          </tbody>
        </table>
        <p style="margin:0;font-size:12.5px;color:var(--mudo)">
          O backup JSON contém toda a base e serve tanto para guardar cópia quanto para migrar o sistema
          para um servidor próprio no futuro.
        </p>
      </div>`)}

    ${cartao('Listas do sistema', `
      <div class="grade g2">
        ${listasEditaveis.map(([k, t]) => `
          <div class="campo">
            <label>${t}</label>
            <textarea data-lista="${k}" rows="5">${esc((e.listas[k] || []).join('\n'))}</textarea>
            <span class="dica">Um item por linha.</span>
          </div>`).join('')}
      </div>`, { acoes: botao('Salvar listas', 'salvar-listas', {}, 'btn primario pequeno') })}

    ${cartao('Zona de risco', `
      <p style="margin:0 0 10px;font-size:13px">Apaga toda a base do sistema. Baixe um backup antes.</p>
      ${botao('Apagar todos os dados', 'zerar', {}, 'btn perigo', 'lixo')}`)}
  </div>`;
};
