/**
 * telas-cadastros.js — Telas de cadastro: clientes, prestadores, relatórios e ajustes.
 */
import { esc, fmtData, fmtDataCurta, fmtMoney, fmtPct, fonteImagem, hojeISO, norm, num, PLANOS } from '../nucleo/base.js';
import { alertasObra, basesContratuais, contratoValor, etapaCalc, kpisObra } from '../dominio/calculos.js';
import { apenasErros, validarPerfilAdmin, validarSenhaForte, validarUsuarioNovo } from '../dominio/validacao.js';
import { Store, horaCurta } from '../dados/store.js';
import { SUPA } from '../dados/supabase.js';
import { App, abrirModal, acoesLinha, botao, campoBusca, campoHTML, cartao, chip, confirmar, fecharModal, filtraTexto, ICO, kpi, MENU, nomeCliente, svg, toast, tomSituacao, vazio } from './shell.js';
import { VIEWS } from './telas-obra.js';
import { ACOES } from './acoes.js';

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
  const MAX_ETAPAS = 6;

  const etapasVis = o.cronograma.slice(0, MAX_ETAPAS);
  const cliente = Store.estado.clientes.find((c) => c.id === o.clienteId);
  const logos = [
    Store.estado.empresa.logo ? `<img src="${fonteImagem(Store.estado.empresa.logo)}" alt="Logo da empresa">` : '',
    cliente && cliente.logo ? `<img src="${fonteImagem(cliente.logo)}" alt="Logo do cliente">` : '',
  ].filter(Boolean).join('');
  const previa = `
  <div class="relatorio" id="previa-relatorio">
    ${logos ? `<div class="relatorio-logos" style="margin-bottom:12px">${logos}</div>` : ''}
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid var(--linha-forte);padding-bottom:10px;margin-bottom:14px">
      <div>
        <h2 style="font-size:21px;margin:0">${esc(o.nome)}</h2>
        <div style="font-size:12px;color:var(--mudo)">${esc([nomeCliente(o.clienteId), o.cidade, o.endereco].filter(Boolean).join(' · '))}</div>
      </div>
      <div style="text-align:right;font-size:12px;color:var(--mudo)">
        <b style="font-family:'Space Grotesk','Inter',sans-serif;font-size:15px;color:var(--tinta)">${esc(Store.estado.empresa.nome || 'Souz Controle de Obra')}</b><br>
        Relatório de status · ${hoje}
      </div>
    </div>
    <h3 style="margin:4px 0 6px">Situação das etapas</h3>
    <table class="tab"><thead><tr><th>Etapa</th><th>Previsto</th><th class="num">Progresso</th><th>Situação</th></tr></thead>
      <tbody>${etapasVis.map((e) => {
        const c = etapaCalc(e);
        return `<tr><td>${esc(e.etapa)}</td><td class="mono">${fmtDataCurta(e.inicioPrevisto)} → ${fmtDataCurta(e.fimPrevisto)}</td>
          <td class="num mono">${fmtPct(c.progresso, 0)}</td><td>${chip(c.situacao, tomSituacao(c.situacao))}</td></tr>`;
      }).join('') || '<tr><td colspan="4">Cronograma não cadastrado.</td></tr>'}</tbody></table>
    ${o.cronograma.length > MAX_ETAPAS ? `<p style="margin:6px 0 0;font-size:12px;color:var(--mudo)">+ ${o.cronograma.length - MAX_ETAPAS} etapa(s) no documento completo</p>` : ''}
    <h3 style="margin:16px 0 6px">Contratos</h3>
    <table class="tab"><thead><tr><th>Contrato</th><th>Prestador</th><th class="num">Autorizado</th><th class="num">Pago</th><th class="num">Saldo</th></tr></thead>
      <tbody>${bases.map((b) => `<tr><td class="mono">${esc(b.base)}</td><td>${esc(b.prestador)}</td>
        <td class="num mono">${fmtMoney(b.autorizado)}</td><td class="num mono">${fmtMoney(b.pago)}</td>
        <td class="num mono ${b.saldo < 0 ? 'neg' : ''}">${fmtMoney(b.saldo)}</td></tr>`).join('') || '<tr><td colspan="5">Sem contratos.</td></tr>'}</tbody></table>
    ${al.length ? `<h3 style="margin:16px 0 6px">Pendências</h3>
      <ul style="margin:0;padding-left:18px;font-size:13px">${al.slice(0, 8).map((a) => `<li><b>${esc(a.titulo)}</b> — ${a.detalhe}</li>`).join('')}</ul>` : ''}
  </div>`;

  const docCard = (acao, titulo, texto) => `
    <button class="obra-cartao doc-cartao" data-acao="${acao}">
      <div class="doc-cartao-topo">
        <h4>${titulo}</h4>
        <span class="chip marca">PDF</span>
      </div>
      <p>${texto}</p>
      <span class="doc-cartao-baixar">${svg(ICO.baixar, 13)} Gerar PDF</span>
    </button>`;

  return `<div class="grade" style="gap:16px">
    <div class="hero nao-imprime">
      ${kpi('Avanço físico', fmtPct(k.progressoFisico, 0),
        `${k.etapasConcluidas} de ${k.etapasTotal} etapas concluídas`, { destaque: true })}
      ${kpi('Recebido', fmtMoney(k.recebido, { dec: 0 }),
        k.financiado ? `${fmtPct(k.recebido / k.financiado, 0)} de ${fmtMoney(k.financiado, { dec: 0 })} financiados` : `pago ${fmtMoney(k.totalPago, { dec: 0 })}`,
        { destaque: true })}
      ${kpi('Saldo em caixa', fmtMoney(k.saldoCaixa, { dec: 0 }),
        'recebido − pago', { destaque: true, tom: k.saldoCaixa < 0 ? 'critico' : 'ok' })}
    </div>

    ${cartao('Gerar documento', `
      <div class="grade g-cartoes">
        ${docCard('pdf-status', 'Relatório de status da obra',
          'Avanço físico, financeiro, contratos, cronograma e pendências. Para enviar ao cliente ou arquivar.')}
        ${docCard('pdf-prestacao', 'Prestação de contas',
          'Todas as entradas e saídas lançadas, medição a medição e nota a nota, com saldo final.')}
        ${docCard('pdf-medicao', 'Memória de medição',
          'Percentual por etapa e o valor a solicitar na próxima medição — no formato que o financiador (CAIXA e outros) espera.')}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;border-top:1px solid var(--linha);padding-top:14px">
        ${botao('Exportar lançamentos (CSV)', 'csv-lancamentos', {}, 'btn', 'baixar')}
        ${botao('Exportar medições (CSV)', 'csv-medicoes', {}, 'btn', 'baixar')}
        ${botao('Exportar recebimentos (CSV)', 'csv-recebimentos', {}, 'btn', 'baixar')}
        ${botao('Imprimir a prévia', 'imprimir', {}, 'btn sutil')}
      </div>`, { classe: 'nao-imprime' })}

    ${cartao('Prévia — amostra do relatório de status', previa, {
      semPadding: false,
      sub: 'o PDF traz a obra completa; abaixo é só uma amostra',
    })}
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
      <div class="campo c12">
        <label>Logo da empresa</label>
        <input type="hidden" data-campo="logo" id="emp_logo_val" value="${esc(emp.logo || '')}">
        <div class="logo-campo" id="logo-cx-empresa">${emp.logo
          ? `<img src="${fonteImagem(emp.logo)}" alt="Logo" class="logo-preview"><button type="button" class="btn sutil pequeno" data-acao="logo-remover" data-alvo="empresa">Remover</button>`
          : `<label class="btn pequeno" style="cursor:pointer">Escolher imagem<input type="file" accept="image/png,image/jpeg,image/webp" data-logo="1" data-alvo="empresa" hidden></label>`}</div>
        <span class="dica">PNG ou JPG. Aparece no cabeçalho do relatório em PDF, ao lado do nome.</span>
      </div>
    </form>`, { acoes: botao('Salvar', 'salvar-empresa', {}, 'btn primario pequeno') })}

    ${cartao('Dados e backup', `
      <div style="display:flex;flex-direction:column;gap:14px">
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${botao('Baixar backup (JSON)', 'backup-json', {}, 'btn', 'baixar')}
          ${botao('Restaurar backup', 'restaurar-json', {}, 'btn')}
          ${botao('Importar planilha (modelo MCMV)', 'importar-xlsx', {}, 'btn')}
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

/* ===================================================== ADMINISTRAÇÃO */
/* Só para quem tem perfis.admin = true. Lê o consumo de todos os clientes
   pela função admin_consumo() e libera/bloqueia acesso por aba. */
const Admin = { linhas: null, erro: '', carregando: false };

/* abas que o admin pode bloquear (carteira, painel e ajustes ficam sempre) */
const ABAS_CONTROLAVEIS = MENU
  .flatMap((g) => (g.soAdmin ? [] : g.itens))
  .filter((it) => !['carteira', 'painel', 'ajustes'].includes(it.v));

function carregarConsumo(forcar = false) {
  if (Admin.carregando) return;
  if (!forcar && (Admin.linhas || Admin.erro)) return;
  Admin.linhas = null;
  Admin.erro = '';
  Admin.carregando = true;
  SUPA.lerConsumo()
    .then((l) => { Admin.linhas = l; })
    .catch((e) => { Admin.erro = String((e && e.message) || e); })
    .finally(() => {
      Admin.carregando = false;
      if (App.rota.view === 'admin') App.renderConteudo();
    });
}

function quandoRelativo(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  const dias = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (dias <= 0) return 'hoje';
  if (dias === 1) return 'ontem';
  if (dias < 30) return `há ${dias} dias`;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

VIEWS.admin = () => {
  if (!SUPA.ehAdmin) {
    return cartao('Administração', vazio('Acesso restrito', 'Esta área é só para o administrador do sistema.'));
  }

  carregarConsumo();

  if (Admin.carregando && !Admin.linhas) {
    return cartao('Administração', vazio('Carregando…', 'Buscando o consumo dos clientes.'));
  }
  if (Admin.erro) {
    const naoInstalado = /admin_consumo.*does not exist|Could not find the function|schema cache/i.test(Admin.erro);
    return cartao('Administração', `
      ${vazio(naoInstalado ? 'Painel ainda não instalado' : 'Não foi possível carregar',
        naoInstalado
          ? 'Aplique db/migracoes/0005_admin_e_permissoes.sql no Supabase e marque a sua conta como admin.'
          : Admin.erro)}
      <div style="text-align:center;margin-top:8px">${botao('Tentar de novo', 'admin-recarregar', {}, 'btn')}</div>`);
  }

  const linhas = (Admin.linhas || []).slice();
  const busca = norm(App.filtros.busca || '');
  const vis = busca
    ? linhas.filter((l) => norm(l.email).includes(busca) || norm(l.empresa).includes(busca))
    : linhas;

  const totObras = linhas.reduce((s, l) => s + Number(l.obras || 0), 0);
  const ativos = linhas.filter((l) => l.plano === 'ativo').length;
  const restritos = linhas.filter((l) => l.bloqueado || (l.abas && Object.values(l.abas).some((x) => x === false))).length;

  const linhaHTML = (l) => {
    const abasBloqueadas = l.abas ? Object.values(l.abas).filter((x) => x === false).length : 0;
    const lim = l.limite_obras == null ? null : Number(l.limite_obras);
    const acessoTxt = [
      lim == null ? 'obras livres' : `${l.obras}/${lim} obras`,
      abasBloqueadas ? `${abasBloqueadas} aba(s) bloqueada(s)` : null,
    ].filter(Boolean).join(' · ');
    return `<tr>
      <td>
        <b>${esc(l.empresa || l.email || '—')}</b>
        ${l.eh_admin ? chip('admin', 'marca') : ''}
        <br><span style="font-size:11px;color:var(--mudo)">${esc(l.email || '')}</span>
      </td>
      <td>
        <select data-acao="admin-plano" data-id="${l.usuario_id}" style="width:auto;min-width:110px">
          ${PLANOS.map((p) => `<option value="${p}" ${p === l.plano ? 'selected' : ''}>${p}</option>`).join('')}
        </select>
      </td>
      <td class="num ${lim != null && Number(l.obras) >= lim ? 'neg' : ''}">${l.obras}${lim == null ? '' : ` / ${lim}`}</td>
      <td class="num">${l.contratos}</td>
      <td class="num">${l.medicoes}</td>
      <td class="num">${l.lancamentos}</td>
      <td class="num">${l.fotos}</td>
      <td>${quandoRelativo(l.ultima_atividade)}</td>
      <td>${botao(acessoTxt || 'editar', 'admin-editar', { id: l.usuario_id }, 'btn sutil pequeno', 'lapis')}</td>
      <td class="acoes" style="opacity:1;white-space:nowrap">
        ${l.eh_admin ? '' : `
          ${botao(l.bloqueado ? 'liberar' : 'bloquear', 'admin-bloquear',
            { id: l.usuario_id, para: l.bloqueado ? '0' : '1' }, l.bloqueado ? 'btn pequeno' : 'btn perigo pequeno')}
          <button class="btn sutil pequeno" data-acao="admin-excluir" data-id="${l.usuario_id}"
            title="Excluir conta" aria-label="Excluir conta">${svg(ICO.lixo, 14)}</button>`}
      </td>
    </tr>`;
  };

  return `<div class="grade" style="gap:16px">
    <div class="grade g4">
      ${kpi('Clientes', linhas.length, `${ativos} no plano ativo`)}
      ${kpi('Obras na plataforma', totObras, 'somando todas as contas')}
      ${kpi('Fotos guardadas', linhas.reduce((s, l) => s + Number(l.fotos || 0), 0), 'no diário de obra')}
      ${kpi('Contas com restrição', restritos, 'bloqueadas ou com aba fechada', restritos ? 'aviso' : 'ok')}
    </div>
    ${cartao('Consumo por cliente', `
      <div class="tab-rolagem"><table class="tab">
        <thead><tr>
          <th>Cliente</th><th>Plano</th>
          <th class="num">Obras</th><th class="num">Contr.</th><th class="num">Medições</th>
          <th class="num">Lançam.</th><th class="num">Fotos</th>
          <th>Última atividade</th><th>Editar</th><th></th>
        </tr></thead>
        <tbody>${vis.map(linhaHTML).join('') || `<tr><td colspan="10">${vazio('Nenhum cliente', 'Ainda não há contas cadastradas além da sua.')}</td></tr>`}</tbody>
      </table></div>`, {
      semPadding: true,
      acoes: `<div class="filtros">
        ${campoBusca('busca', 'Buscar por e-mail ou empresa…')}
        ${botao('Atualizar', 'admin-recarregar', {}, 'btn sutil pequeno')}
        ${botao('Novo cliente', 'admin-novo', {}, 'btn primario pequeno', 'mais')}
      </div>`,
    })}
  </div>`;
};

/* senha provisória em 3 blocos de 4, com minúscula, maiúscula, número e
   símbolo garantidos — passa na política de senha do Supabase (12+ com
   os quatro tipos). */
function senhaProvisoria() {
  const minus = 'abcdefghijkmnpqrstuvwxyz';
  const maius = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const nums = '23456789';
  const simb = '!@#$%&*-+=';
  const pega = (s) => s[Math.floor(Math.random() * s.length)];
  /* garante minúscula, maiúscula, número e símbolo; completa 12 e embaralha */
  const base = [pega(minus), pega(maius), pega(nums), pega(simb)];
  const pool = minus + maius + nums;
  while (base.length < 12) base.push(pega(pool));
  for (let i = base.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [base[i], base[j]] = [base[j], base[i]];
  }
  const s = base.join('');
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}

/* ---------------------------------------------------- ações do admin */
ACOES['admin-recarregar'] = () => { carregarConsumo(true); App.renderConteudo(); };

async function admChamar(fn, msgOk) {
  try {
    await fn();
    carregarConsumo(true);
    toast(msgOk, 'ok');
  } catch (e) {
    toast('Não foi possível salvar: ' + ((e && e.message) || e), 'critico', 6000);
    App.renderConteudo();
  }
}

ACOES['admin-plano'] = (el, d) => {
  const plano = el.value;
  const probs = apenasErros(validarPerfilAdmin({ plano }));
  if (probs.length) return toast(probs[0].mensagem, 'critico');
  admChamar(() => SUPA.adminSalvarPerfil(d.id, { plano }), 'Plano atualizado.');
};

ACOES['admin-bloquear'] = (el, d) => {
  const bloquear = d.para === '1';
  const alvo = (Admin.linhas || []).find((l) => l.usuario_id === d.id);
  const nome = (alvo && (alvo.empresa || alvo.email)) || 'este cliente';
  confirmar(bloquear ? 'Bloquear acesso' : 'Liberar acesso',
    bloquear
      ? `${nome} deixa de conseguir entrar no sistema até ser liberado. Confirmar?`
      : `Liberar o acesso de ${nome}?`,
    () => admChamar(() => SUPA.adminSalvarPerfil(d.id, { bloqueado: bloquear }),
      bloquear ? 'Acesso bloqueado.' : 'Acesso liberado.'),
    bloquear ? 'Bloquear' : 'Liberar');
};

ACOES['admin-editar'] = async (el, d) => {
  const alvo = (Admin.linhas || []).find((l) => l.usuario_id === d.id);
  if (!alvo) return;
  if (el) { el.disabled = true; }
  let perfil = {};
  try {
    perfil = await SUPA.adminLerPerfil(d.id);
  } catch (e) {
    toast('Não foi possível abrir o cadastro: ' + ((e && e.message) || e), 'critico', 6000);
    return;
  } finally {
    if (el) { el.disabled = false; }
  }
  const abas = (alvo.abas && typeof alvo.abas === 'object') ? alvo.abas : {};
  const lim = alvo.limite_obras == null ? '' : Number(alvo.limite_obras);
  const v = (x) => esc(perfil[x] || '');
  abrirModal({
    titulo: 'Editar cliente',
    corpo: `
      <p style="margin:0 0 14px;font-size:12px;color:var(--mudo)">${esc(alvo.email || '')}</p>

      <div class="secao-form"><span class="rotulo">Dados da empresa</span></div>
      <div class="form-grade">
        <div class="campo c8"><label for="adm_emp">Empresa</label>
          <input type="text" id="adm_emp" value="${v('empresa_nome')}"></div>
        <div class="campo c4"><label for="adm_crea">CREA / CAU</label>
          <input type="text" id="adm_crea" value="${v('crea_cau')}"></div>
        <div class="campo c6"><label for="adm_resp">Responsável</label>
          <input type="text" id="adm_resp" value="${v('responsavel')}"></div>
        <div class="campo c6"><label for="adm_tel">Telefone</label>
          <input type="text" id="adm_tel" value="${v('telefone')}"></div>
        <div class="campo c12"><label for="adm_email">E-mail de contato</label>
          <input type="text" id="adm_email" value="${v('email')}">
          <span class="dica">Só o dado do cadastro. O e-mail de login não muda por aqui.</span></div>
      </div>

      <div class="secao-form"><span class="rotulo">Plano e limites</span></div>
      <div class="form-grade">
        <div class="campo c6"><label for="adm_plano">Plano</label>
          <select id="adm_plano">
            ${PLANOS.map((p) => `<option value="${p}" ${p === alvo.plano ? 'selected' : ''}>${p}</option>`).join('')}
          </select></div>
        <div class="campo c6"><label for="adm_lim">Limite de obras</label>
          <input type="number" id="adm_lim" min="0" value="${lim}" placeholder="sem limite">
          <span class="dica">Vazio = sem limite. Tem ${alvo.obras} obra(s) hoje.</span></div>
      </div>

      <div class="secao-form"><span class="rotulo">Abas liberadas</span></div>
      <p style="margin:4px 0 10px;font-size:12px;color:var(--mudo)">Desmarque o que este cliente <b>não</b> deve ver.</p>
      <div style="display:flex;flex-wrap:wrap;gap:7px 18px">
        ${ABAS_CONTROLAVEIS.map((it) => `
          <label style="display:flex;align-items:center;gap:9px;font-size:13px;cursor:pointer">
            <input type="checkbox" data-aba="${it.v}" ${abas[it.v] === false ? '' : 'checked'} style="width:auto">
            ${esc(it.t)}
          </label>`).join('')}
      </div>

      <div class="secao-form"><span class="rotulo">Acesso</span></div>
      <p style="margin:4px 0 10px;font-size:12px;color:var(--mudo)">Aplicam na hora, sem passar pelo Salvar.</p>
      <div class="form-grade">
        <div class="campo c8"><label for="adm_login">E-mail de login</label>
          <input type="text" id="adm_login" value="${esc(alvo.email || '')}"></div>
        <div class="campo c4" style="display:flex;align-items:flex-end">
          ${botao('Trocar e-mail', 'admin-trocar-email', { id: d.id }, 'btn pequeno')}</div>
        <div class="campo c8"><label for="adm_senha_nova">Nova senha</label>
          <div style="display:flex;gap:6px">
            <input type="text" id="adm_senha_nova" value="${senhaProvisoria()}">
            ${botao('Gerar', 'admin-gerar-senha-edit', {}, 'btn pequeno')}
          </div></div>
        <div class="campo c4" style="display:flex;align-items:flex-end">
          ${botao('Redefinir senha', 'admin-redefinir-senha', { id: d.id }, 'btn pequeno')}</div>
      </div>

      ${alvo.eh_admin ? '' : `
      <div class="secao-form"><span class="rotulo" style="color:var(--critico)">Zona de perigo</span></div>
      <div style="border:1px solid color-mix(in srgb, var(--critico) 40%, transparent);border-radius:var(--r);padding:14px 16px;display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap">
        <span style="font-size:12.5px;color:var(--tinta2)">
          Apaga a conta e, em cascata, <b>${alvo.obras} obra(s)</b>, contratos, medições, lançamentos e fotos. Não dá para desfazer.
        </span>
        ${botao('Excluir conta', 'admin-excluir', { id: d.id }, 'btn perigo pequeno')}
      </div>`}`,
    rodape: `<button class="btn" data-acao="fechar-modal">Cancelar</button>
             <button class="btn primario" data-acao="admin-salvar-editar" data-id="${d.id}">Salvar</button>`,
  });
};

ACOES['admin-salvar-editar'] = (el, d) => {
  const val = (id) => (document.getElementById(id)?.value || '').trim();
  const info = {
    empresa_nome: val('adm_emp'),
    crea_cau: val('adm_crea'),
    responsavel: val('adm_resp'),
    telefone: val('adm_tel'),
    email: val('adm_email'),
  };
  const abas = {};
  document.querySelectorAll('#modal-camada [data-aba]').forEach((c) => {
    if (!c.checked) abas[c.dataset.aba] = false;
  });
  const plano = val('adm_plano');
  const bruto = val('adm_lim');
  const limiteObras = bruto === '' ? -1 : Number(bruto);
  const probs = apenasErros(validarPerfilAdmin({ plano, abas, limiteObras }));
  if (probs.length) return toast(probs[0].mensagem, 'critico');
  fecharModal();
  admChamar(async () => {
    await SUPA.adminEditarInfo(d.id, info);
    await SUPA.adminSalvarPerfil(d.id, { plano, abas, limiteObras });
  }, 'Cadastro atualizado.');
};

/* ------------------------------------------ acesso: e-mail, senha, exclusão */
ACOES['admin-gerar-senha-edit'] = () => {
  const inp = document.getElementById('adm_senha_nova');
  if (inp) inp.value = senhaProvisoria();
};

ACOES['admin-trocar-email'] = (el, d) => {
  const email = (document.getElementById('adm_login')?.value || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast('E-mail inválido.', 'critico');
  const alvo = (Admin.linhas || []).find((l) => l.usuario_id === d.id);
  confirmar('Trocar e-mail de login',
    `O login de ${esc((alvo && alvo.email) || 'esta conta')} passa a ser ${esc(email)}. O cliente entra com o novo e-mail e a mesma senha.`,
    () => { fecharModal(); admChamar(() => SUPA.adminTrocarEmail(d.id, email), 'E-mail de login trocado.'); },
    'Trocar');
};

ACOES['admin-redefinir-senha'] = (el, d) => {
  const senha = (document.getElementById('adm_senha_nova')?.value || '').trim();
  const probs = apenasErros(validarSenhaForte(senha));
  if (probs.length) return toast(probs[0].mensagem, 'critico');
  confirmar('Redefinir senha',
    'A senha atual deixa de valer na hora. Anote a nova antes de confirmar.',
    () => {
      fecharModal();
      admChamar(() => SUPA.adminRedefinirSenha(d.id, senha), `Senha redefinida. Nova senha: ${senha}`);
    },
    'Redefinir');
};

ACOES['admin-excluir'] = (el, d) => {
  const alvo = (Admin.linhas || []).find((l) => l.usuario_id === d.id);
  if (!alvo) return;
  const email = alvo.email || '';
  fecharModal();
  abrirModal({
    titulo: 'Excluir conta',
    largura: 'estreito',
    corpo: `
      <p style="margin:0 0 12px;font-size:13px;line-height:1.5">
        Isto apaga <b>${esc(alvo.empresa || email)}</b> e, em cascata,
        <b>${alvo.obras} obra(s)</b>, ${alvo.contratos} contrato(s), ${alvo.medicoes} medição(ões),
        ${alvo.lancamentos} lançamento(s) e ${alvo.fotos} foto(s). Não dá para desfazer.
      </p>
      <div class="campo c12">
        <label for="adm_del_confirma">Digite <b>${esc(email)}</b> para confirmar</label>
        <input type="text" id="adm_del_confirma" autocomplete="off" placeholder="${esc(email)}">
      </div>`,
    rodape: `<button class="btn" data-acao="fechar-modal">Cancelar</button>
             <button class="btn perigo" data-acao="admin-excluir-ok" data-id="${d.id}">Excluir para sempre</button>`,
  });
};

ACOES['admin-excluir-ok'] = (el, d) => {
  const alvo = (Admin.linhas || []).find((l) => l.usuario_id === d.id);
  const digitado = (document.getElementById('adm_del_confirma')?.value || '').trim().toLowerCase();
  if (!alvo || digitado !== String(alvo.email || '').toLowerCase()) {
    return toast('O e-mail digitado não confere.', 'critico');
  }
  fecharModal();
  admChamar(() => SUPA.adminExcluirUsuario(d.id), 'Conta excluída.');
};

ACOES['admin-novo'] = () => {
  abrirModal({
    titulo: 'Novo cliente',
    largura: 'estreito',
    corpo: `
      <p style="margin:0 0 14px;font-size:12.5px;color:var(--mudo)">
        Cria a conta de acesso já liberada. O cliente entra com este e-mail e a
        senha provisória, e troca a senha depois em <b>Ajustes</b>.
      </p>
      <div class="form-grade">
        <div class="campo c12"><label for="adm_novo_email">E-mail de acesso</label>
          <input type="email" id="adm_novo_email" autocomplete="off" placeholder="cliente@empresa.com"></div>
        <div class="campo c12"><label for="adm_novo_senha">Senha provisória</label>
          <div style="display:flex;gap:6px">
            <input type="text" id="adm_novo_senha" autocomplete="off" value="${senhaProvisoria()}">
            ${botao('Gerar', 'admin-gerar-senha', {}, 'btn pequeno')}
          </div>
          <span class="dica">Anote e passe ao cliente. 12+ caracteres, com maiúscula, número e símbolo.</span></div>
        <div class="campo c12"><label for="adm_novo_emp">Empresa (opcional)</label>
          <input type="text" id="adm_novo_emp" placeholder="nome que aparece nos relatórios"></div>
      </div>`,
    rodape: `<button class="btn" data-acao="fechar-modal">Cancelar</button>
             <button class="btn primario" data-acao="admin-criar">Criar conta</button>`,
  });
};

ACOES['admin-gerar-senha'] = () => {
  const inp = document.getElementById('adm_novo_senha');
  if (inp) inp.value = senhaProvisoria();
};

ACOES['admin-criar'] = async (el) => {
  const email = (document.getElementById('adm_novo_email')?.value || '').trim();
  const senha = document.getElementById('adm_novo_senha')?.value || '';
  const empresa = (document.getElementById('adm_novo_emp')?.value || '').trim();
  const probs = apenasErros(validarUsuarioNovo({ email, senha }));
  if (probs.length) return toast(probs[0].mensagem, 'critico');
  if (el) el.disabled = true;
  try {
    await SUPA.adminCriarUsuario(email, senha, empresa);
    fecharModal();
    toast(`Conta criada. ${email} já entra com a senha provisória: ${senha}`, 'ok', 14000);
    carregarConsumo(true);
  } catch (e) {
    if (el) el.disabled = false;
    toast('Não foi possível criar a conta: ' + ((e && e.message) || e), 'critico', 7000);
  }
};
