/**
 * telas-cadastros.js — Contas e acessos (administração do sistema).
 * Relatórios moram em telas/relatorios.js.
 */
import { esc, norm, PAPEIS_CONSTRUTORA, PAPEIS_EQUIPE, PLANOS } from '../nucleo/base.js';
import {
  ativacaoConta,
  diasSemAtividade,
  obrasConstrutora,
  resumoConstrutoras,
  vagasConstrutora,
} from '../dominio/calculos.js';
import {
  apenasErros,
  validarConstrutora,
  validarNovoAcesso,
  validarPerfilAdmin,
  validarSenhaForte,
  validarUsuarioNovo,
} from '../dominio/validacao.js';
import { SUPA } from '../dados/supabase.js';
import { App, abrirModal, botao, cartao, chip, confirmar, fecharModal, MENU, toast, vazio } from './shell.js';
import { buscaToolbar, faixaKpis, lista } from './telas/componentes.js';
import { VIEWS } from './telas-obra.js';
import { ACOES } from './acoes.js';

/* Relatórios: telas/relatorios.js */

/* ===================================================== ADMINISTRAÇÃO */
/* Só para quem tem perfis.admin = true. Lê o consumo de todos os clientes
   pela função admin_consumo() e libera/bloqueia acesso por aba.
   A lista abre pela conta parada há mais tempo (diasSemAtividade) — é
   quem precisa de uma ligação — e mostra a ativação (ativacaoConta).
   Excluir conta fica dentro de "Editar", não na linha. */
/* construtoras: lista de admin_empresas() (0021) — null enquanto a
   migração não estiver aplicada: aí a tela é a de antes, conta por conta.
   sel: a construtora aberta embaixo da lista. */
const Admin = { linhas: null, construtoras: null, sel: '', erro: '', carregando: false };
const semFuncao = (e) => /Could not find the function|schema cache|does not exist/i.test(String((e && e.message) || e));

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
  Promise.all([
    SUPA.lerConsumo(),
    SUPA.lerConstrutoras().catch((e) => {
      if (semFuncao(e)) return null; // 0021 ainda não aplicada
      throw e;
    }),
  ])
    .then(([l, c]) => {
      Admin.linhas = l;
      Admin.construtoras = c;
    })
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
    return cartao('Contas e acessos', vazio('Acesso restrito', 'Esta área é só para o administrador do sistema.'));
  }

  carregarConsumo();

  if (Admin.carregando && !Admin.linhas) {
    return cartao('Contas e acessos', vazio('Carregando…', 'Buscando o consumo dos clientes.'));
  }
  if (Admin.erro) {
    const naoInstalado = /admin_consumo.*does not exist|Could not find the function|schema cache/i.test(Admin.erro);
    return cartao('Contas e acessos', `
      ${vazio(naoInstalado ? 'Painel ainda não instalado' : 'Não foi possível carregar',
        naoInstalado
          ? 'Aplique db/migracoes/0005_admin_e_permissoes.sql no Supabase e marque a sua conta como admin.'
          : Admin.erro)}
      <div style="text-align:center;margin-top:8px">${botao('Tentar de novo', 'admin-recarregar', {}, 'btn')}</div>`);
  }

  if (Admin.construtoras) return telaConstrutoras();

  const agora = new Date();
  const parada = (l) => {
    const d = diasSemAtividade(l.ultima_atividade, agora);
    return d == null ? Infinity : d;
  };
  const linhas = (Admin.linhas || []).slice().sort((a, b) => parada(b) - parada(a));
  const paradas = linhas.filter((l) => !l.eh_admin && parada(l) >= 14).length;
  const busca = norm(App.filtros.busca || '');
  const vis = busca
    ? linhas.filter((l) => norm(l.email).includes(busca) || norm(l.empresa).includes(busca))
    : linhas;

  const totObras = linhas.reduce((s, l) => s + Number(l.obras || 0), 0);
  const ativos = linhas.filter((l) => l.plano === 'ativo').length;
  const restritos = linhas.filter((l) => l.bloqueado || (l.abas && Object.values(l.abas).some((x) => x === false))).length;

  const linhaHTML = (l) => {
    const at = ativacaoConta(l);
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
      <td class="num" title="${esc(at.faltam.length ? 'Falta: ' + at.faltam.join(', ') : 'todos os passos')}">
        <span class="${at.feitos <= 2 ? 'tom-alerta' : ''}">${at.feitos}/${at.total}</span></td>
      <td class="${parada(l) >= 14 && !l.eh_admin ? 'tom-alerta' : ''}">${quandoRelativo(l.ultima_atividade)}</td>
      <td>${botao(acessoTxt || 'editar', 'admin-editar', { id: l.usuario_id }, 'btn sutil pequeno', 'lapis')}</td>
      <td class="acoes" style="opacity:1;white-space:nowrap">
        ${l.eh_admin ? '' : botao(l.bloqueado ? 'liberar' : 'bloquear', 'admin-bloquear',
          { id: l.usuario_id, para: l.bloqueado ? '0' : '1' }, l.bloqueado ? 'btn pequeno' : 'btn sutil pequeno')}
      </td>
    </tr>`;
  };

  return `<div class="tela-lista">
    ${faixaKpis(
      [
        { rotulo: 'Clientes', valor: linhas.length, contexto: `${ativos} no plano ativo` },
        { rotulo: 'Obras na plataforma', valor: totObras, contexto: 'somando todas as contas' },
        {
          rotulo: 'Paradas há 14+ dias',
          valor: paradas,
          contexto: paradas ? 'no topo da lista — vale uma ligação' : 'todas as contas em uso',
          tom: paradas ? 'tom-alerta' : '',
        },
        {
          rotulo: 'Contas com restrição',
          valor: restritos,
          contexto: 'bloqueadas ou com aba fechada',
          tom: restritos ? 'tom-alerta' : '',
        },
      ],
      { rotulo: 'Indicadores das contas' },
    )}
    <div class="lista-cx"><div class="tab-rolagem"><table class="tab tab-contas" data-testid="lista-contas">
      <thead><tr>
        <th>Cliente</th><th>Plano</th>
        <th class="num">Obras</th><th class="num">Contr.</th><th class="num">Medições</th>
        <th class="num">Lançam.</th><th class="num">Fotos</th>
        <th class="num" title="obra, contrato, medição, gasto, diário e foto">Ativação</th>
        <th>Última atividade</th><th>Editar</th><th></th>
      </tr></thead>
      <tbody>${vis.map(linhaHTML).join('') || `<tr><td colspan="11">${vazio('Nenhum cliente', busca ? 'Nenhuma conta com essa busca.' : 'Ainda não há contas cadastradas além da sua.')}</td></tr>`}</tbody>
    </table></div></div>
  </div>`;
};

/* busca, atualizar e novo cliente na toolbar, como nas outras telas */
VIEWS.admin.toolbar = () => {
  if (!SUPA.ehAdmin || !Admin.linhas) return '';
  if (Admin.construtoras) {
    return `${buscaToolbar('Buscar construtora, CNPJ ou e-mail…', 'busca-contas')}
    ${botao('Atualizar', 'admin-recarregar', {}, 'btn sutil pequeno')}
    ${botao('<span class="rotulo-btn">Nova construtora</span>', 'admin-nova-construtora', {}, 'btn primario', 'mais')}`;
  }
  return `${buscaToolbar('Buscar por e-mail ou empresa…', 'busca-contas')}
    ${botao('Atualizar', 'admin-recarregar', {}, 'btn sutil pequeno')}
    ${botao('<span class="rotulo-btn">Novo cliente</span>', 'admin-novo', {}, 'btn primario', 'mais')}`;
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

/* Trocar plano mexe em cobrança e acesso: confirma antes. Cancelar
   devolve o select ao plano atual. */
ACOES['admin-plano'] = (el, d) => {
  const plano = el.value;
  const probs = apenasErros(validarPerfilAdmin({ plano }));
  if (probs.length) return toast(probs[0].mensagem, 'critico');
  const alvo = (Admin.linhas || []).find((l) => l.usuario_id === d.id);
  if (!alvo || alvo.plano === plano) return;
  el.value = alvo.plano;
  confirmar('Mudar plano',
    `Mudar ${alvo.empresa || alvo.email || 'esta conta'} de "${alvo.plano}" para "${plano}"?`,
    () => admChamar(() => SUPA.adminSalvarPerfil(d.id, { plano }), 'Plano atualizado.'),
    'Mudar plano');
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
  /* Com construtoras (0021), dados da empresa, plano e limite de obras são
     da construtora: aqui fica só a construtora e o papel desta conta. */
  const comConstrutoras = !!Admin.construtoras;
  const blocoConta = comConstrutoras
    ? `<div class="secao-form"><span class="rotulo">Construtora e papel</span></div>
      <div class="form-grade">
        <div class="campo c6"><label for="adm_emp_id">Construtora</label>
          <select id="adm_emp_id" ${alvo.eh_admin ? 'disabled' : ''}>
            <option value="">sem construtora</option>
            ${(Admin.construtoras || []).map((c) => `<option value="${esc(c.id)}" ${c.id === alvo.empresa_id ? 'selected' : ''}>${esc(c.nome)} · ${esc(vagasConstrutora(c).texto)} acessos</option>`).join('')}
          </select></div>
        <div class="campo c6"><label for="adm_papel">Papel</label>
          <select id="adm_papel" ${alvo.eh_admin ? 'disabled' : ''}>
            ${PAPEIS_CONSTRUTORA.map((p) => `<option value="${p.v}" ${p.v === (alvo.papel_empresa || 'engenheiro') ? 'selected' : ''}>${esc(p.t)}</option>`).join('')}
          </select>
          <span class="dica">Gestor e engenheiro ocupam vaga; cliente final não.</span></div>
      </div>`
    : `<div class="secao-form"><span class="rotulo">Dados da empresa</span></div>
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
      </div>`;
  abrirModal({
    titulo: comConstrutoras ? 'Editar acesso' : 'Editar cliente',
    corpo: `
      <p style="margin:0 0 14px;font-size:12px;color:var(--mudo)">${esc(alvo.email || '')}</p>

      ${blocoConta}

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
          ${comConstrutoras
            ? 'Apaga o login desta pessoa. As obras e os registros que ela fez continuam com a construtora. Não dá para desfazer.'
            : `Apaga a conta e, em cascata, <b>${alvo.obras} obra(s)</b>, contratos, medições, lançamentos e fotos. Não dá para desfazer.`}
        </span>
        ${botao('Excluir conta', 'admin-excluir', { id: d.id }, 'btn perigo pequeno')}
      </div>`}`,
    rodape: `<button class="btn" data-acao="fechar-modal">Cancelar</button>
             <button class="btn primario" data-acao="admin-salvar-editar" data-id="${d.id}">Salvar</button>`,
  });
};

ACOES['admin-salvar-editar'] = (el, d) => {
  const val = (id) => (document.getElementById(id)?.value || '').trim();
  const abasMarcadas = {};
  document.querySelectorAll('#modal-camada [data-aba]').forEach((c) => {
    if (!c.checked) abasMarcadas[c.dataset.aba] = false;
  });
  /* Com construtoras: abas desta conta, e a construtora/papel se mudaram. */
  if (Admin.construtoras) {
    const alvo = (Admin.linhas || []).find((l) => l.usuario_id === d.id);
    if (!alvo) return;
    const emp = val('adm_emp_id');
    const papel = val('adm_papel');
    const mudou = !alvo.eh_admin && (emp !== (alvo.empresa_id || '') || (emp && papel !== alvo.papel_empresa));
    const c = emp ? construtora(emp) : null;
    if (mudou && c && papel !== 'cliente' && !(PAPEIS_EQUIPE.includes(alvo.papel_empresa) && alvo.empresa_id === emp && !alvo.bloqueado)) {
      if (vagasConstrutora(c).cheia) {
        return toast(`${c.nome} está sem vaga (${vagasConstrutora(c).texto}). Aumente o limite ou escolha cliente final.`, 'critico', 7000);
      }
    }
    fecharModal();
    if (emp) Admin.sel = emp;
    return admChamar(async () => {
      await SUPA.adminSalvarPerfil(d.id, { abas: abasMarcadas });
      if (mudou) await SUPA.adminLigarUsuario(d.id, emp || null, papel);
    }, 'Acesso atualizado.');
  }
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
      <p style="margin:0 0 12px;font-size:13px;line-height:1.5">${
        Admin.construtoras
          ? `Isto apaga o login de <b>${esc(email)}</b>. As obras e os registros que a pessoa fez
        continuam com a construtora. Não dá para desfazer.`
          : `Isto apaga <b>${esc(alvo.empresa || email)}</b> e, em cascata,
        <b>${alvo.obras} obra(s)</b>, ${alvo.contratos} contrato(s), ${alvo.medicoes} medição(ões),
        ${alvo.lancamentos} lançamento(s) e ${alvo.fotos} foto(s). Não dá para desfazer.`
      }</p>
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

/* ===================================================== CONSTRUTORAS (0021)
   A construtora é o cliente que compra o sistema: um nome, um plano, um
   limite de acessos (gestor + engenheiros) e de obras. Em cima, a lista
   das construtoras; embaixo, os usuários da que estiver aberta. O banco
   confere a vaga e o limite de obras de novo — aqui é para a mensagem
   sair antes, clara. */
const PAPEL_ROTULO = Object.fromEntries(PAPEIS_CONSTRUTORA.map((p) => [p.v, p.t]));

function situacaoConstrutora(c) {
  if (c.bloqueada) return { t: 'Bloqueada', tom: 'atraso' };
  if (vagasConstrutora(c).cheia) return { t: 'Sem vaga', tom: 'tom-alerta' };
  if (c.plano !== 'ativo') {
    return { t: c.plano === 'trial' ? 'Em teste' : 'Plano ' + c.plano, tom: 'tom-alerta' };
  }
  return { t: 'Ativa', tom: '' };
}

function telaConstrutoras() {
  const cs = Admin.construtoras || [];
  const contas = Admin.linhas || [];
  const usuariosDe = (id) => contas.filter((l) => l.empresa_id === id);
  const busca = norm(App.filtros.busca || '');
  const visiveis = busca
    ? cs.filter(
        (c) =>
          norm(c.nome).includes(busca) ||
          norm(c.cnpj || '').includes(busca) ||
          usuariosDe(c.id).some((u) => norm(u.email).includes(busca)),
      )
    : cs;
  if (!visiveis.some((c) => c.id === Admin.sel)) Admin.sel = (visiveis[0] || {}).id || '';
  const aberta = cs.find((c) => c.id === Admin.sel);
  const soltas = contas.filter((l) => !l.empresa_id);
  const r = resumoConstrutoras(cs);
  const atencao = r.semVaga + r.bloqueadas + r.foraDoAtivo;
  const s = (n, um, varios) => (n === 1 ? um : varios);

  const kpis = faixaKpis(
    [
      {
        rotulo: 'Construtoras',
        valor: r.total,
        contexto: `${r.ativas} ${s(r.ativas, 'ativa', 'ativas')}${
          r.bloqueadas ? ` · ${r.bloqueadas} ${s(r.bloqueadas, 'bloqueada', 'bloqueadas')}` : ''
        }`,
      },
      {
        rotulo: 'Acessos em uso',
        valor: r.acessosUsados,
        contexto: r.acessosContratados
          ? `${r.acessosUsadosComLimite} de ${r.acessosContratados} contratados${
              r.semLimite ? ` · ${r.semLimite} ${s(r.semLimite, 'construtora', 'construtoras')} sem limite` : ''
            }`
          : 'nenhuma construtora com limite definido',
      },
      {
        rotulo: 'Obras',
        valor: r.obras,
        contexto: `${r.clientesFinais} ${s(r.clientesFinais, 'cliente final', 'clientes finais')} acompanhando`,
      },
      {
        rotulo: 'Pedem atenção',
        valor: atencao,
        contexto:
          [
            r.semVaga ? `${r.semVaga} sem vaga` : '',
            r.bloqueadas ? `${r.bloqueadas} ${s(r.bloqueadas, 'bloqueada', 'bloqueadas')}` : '',
            r.foraDoAtivo ? `${r.foraDoAtivo} fora do plano ativo` : '',
          ]
            .filter(Boolean)
            .join(' · ') || 'todas em dia',
        tom: atencao ? 'tom-alerta' : '',
      },
    ],
    { rotulo: 'Indicadores das construtoras' },
  );

  const colunas = [
    {
      k: 'nome',
      rotulo: 'Construtora',
      largura: '28%',
      celular: 'principal',
      valor: (c) => c.nome,
      celula: (c) =>
        `<div class="cel-dupla"><b title="${esc(c.nome)}">${esc(c.nome)}</b><span>${
          c.cnpj ? esc(c.cnpj) : 'sem CNPJ'
        }</span></div>`,
    },
    { k: 'plano', rotulo: 'Plano', largura: '10%', valor: (c) => c.plano, celula: (c) => esc(c.plano) },
    {
      k: 'acessos',
      rotulo: 'Acessos',
      largura: '14%',
      num: true,
      valor: (c) => vagasConstrutora(c).usados,
      celula: (c) => {
        const v = vagasConstrutora(c);
        return `<span class="${v.cheia ? 'tom-alerta' : ''}">${esc(v.texto)}</span>`;
      },
    },
    {
      k: 'obras',
      rotulo: 'Obras',
      largura: '14%',
      num: true,
      valor: (c) => obrasConstrutora(c).usadas,
      celula: (c) => {
        const o = obrasConstrutora(c);
        return `<span class="${o.cheia ? 'tom-alerta' : ''}">${esc(o.texto)}</span>`;
      },
    },
    {
      k: 'clientes',
      rotulo: 'Clientes finais',
      largura: '10%',
      num: true,
      celular: 'some',
      valor: (c) => Number(c.clientes_finais || 0),
      celula: (c) => String(Number(c.clientes_finais || 0)),
    },
    {
      k: 'atividade',
      rotulo: 'Última atividade',
      largura: '12%',
      celular: 'some',
      valor: (c) => c.ultima_atividade || '',
      celula: (c) => quandoRelativo(c.ultima_atividade),
    },
    {
      k: 'situacao',
      rotulo: 'Situação',
      largura: '12%',
      valor: (c) => situacaoConstrutora(c).t,
      celula: (c) => {
        const st = situacaoConstrutora(c);
        return `<span class="${st.tom}">${esc(st.t)}</span>`;
      },
    },
  ];

  const tabela = cs.length
    ? lista({
        id: 'admin-construtoras',
        testid: 'lista-construtoras',
        colunas,
        itens: visiveis,
        ordemPadrao: { col: 'nome', dir: 1 },
        rodapeRotulo: (n) => `${n} ${s(n, 'construtora', 'construtoras')}`,
        linhaAttrs: (c) =>
          `data-acao="admin-construtora" data-id="${esc(c.id)}"${
            c.id === Admin.sel ? ' aria-selected="true"' : ''
          }`,
      })
    : vazio('Nenhuma construtora', 'Crie a primeira em "Nova construtora".');

  return `<div class="tela-lista tela-construtoras">
    ${kpis}
    ${tabela}
    ${aberta ? secaoUsuarios(aberta, usuariosDe(aberta.id)) : ''}
    ${soltas.length ? secaoSoltas(soltas) : ''}
  </div>`;
}

/* Os usuários da construtora aberta: papel editável, situação, ativação. */
function secaoUsuarios(c, usuarios) {
  const v = vagasConstrutora(c);
  const o = obrasConstrutora(c);
  const ordem = { gestor: 0, engenheiro: 1, cliente: 2 };
  const us = usuarios
    .slice()
    .sort(
      (a, b) =>
        (ordem[a.papel_empresa] ?? 3) - (ordem[b.papel_empresa] ?? 3) ||
        String(a.email).localeCompare(String(b.email)),
    );
  const linhaU = (u) => {
    const at = ativacaoConta(u);
    const equipe = PAPEIS_EQUIPE.includes(u.papel_empresa);
    const papel = u.eh_admin
      ? esc(PAPEL_ROTULO[u.papel_empresa] || '—')
      : `<select data-acao="admin-papel" data-id="${esc(u.usuario_id)}" aria-label="Papel de ${esc(u.email || '')}" style="width:auto;min-width:130px">
          ${PAPEIS_CONSTRUTORA.map(
            (p) => `<option value="${p.v}" ${p.v === u.papel_empresa ? 'selected' : ''}>${esc(p.t)}</option>`,
          ).join('')}
        </select>`;
    return `<tr>
      <td><div class="cel-dupla"><b title="${esc(u.email || '')}">${esc(u.email || '—')}</b>${
        u.eh_admin ? '<span>admin do sistema</span>' : ''
      }</div></td>
      <td>${papel}</td>
      <td>${u.bloqueado ? '<span class="atraso">Bloqueado</span>' : equipe ? 'Ativo · ocupa vaga' : 'Ativo'}</td>
      <td title="${esc(at.faltam.length ? 'Falta: ' + at.faltam.join(', ') : 'todos os passos')}"><span class="${
        at.feitos <= 2 ? 'tom-alerta' : ''
      }">${at.feitos}/${at.total}</span></td>
      <td>${quandoRelativo(u.ultima_atividade)}</td>
      <td class="acoes" style="opacity:1;white-space:nowrap">
        ${botao('Editar', 'admin-editar', { id: u.usuario_id }, 'btn sutil pequeno', 'lapis')}
        ${
          u.eh_admin
            ? ''
            : botao(
                u.bloqueado ? 'Liberar' : 'Bloquear',
                'admin-bloquear',
                { id: u.usuario_id, para: u.bloqueado ? '0' : '1' },
                u.bloqueado ? 'btn pequeno' : 'btn sutil pequeno',
              )
        }
      </td>
    </tr>`;
  };
  return `<section class="caixa secao-construtora" data-testid="usuarios-construtora">
    <div class="caixa-cab">
      <h3>${esc(c.nome)} <span class="tinta2" style="font-weight:400">· ${esc(v.texto)} acessos · ${esc(
        o.texto,
      )} obras · plano ${esc(c.plano)}</span></h3>
      <div class="dir">
        ${botao('Editar construtora', 'admin-editar-construtora', { id: c.id }, 'btn sutil pequeno', 'lapis')}
        ${botao(
          c.bloqueada ? 'Liberar construtora' : 'Bloquear construtora',
          'admin-bloquear-construtora',
          { id: c.id },
          c.bloqueada ? 'btn pequeno' : 'btn sutil pequeno',
        )}
        ${botao('Novo acesso', 'admin-novo-acesso', { id: c.id }, 'btn primario pequeno', 'mais')}
      </div>
    </div>
    ${
      v.cheia
        ? `<p class="aviso-discreto tom-alerta">Sem vaga: ${esc(v.texto)} acessos em uso. Engenheiro ou gestor novo só depois de aumentar o limite ou bloquear alguém. Cliente final não ocupa vaga.</p>`
        : ''
    }
    ${
      us.length
        ? `<div class="tab-rolagem"><table class="tab tab-contas" data-testid="lista-usuarios-construtora">
      <thead><tr><th>Usuário</th><th>Papel</th><th>Situação</th><th title="obra, contrato, medição, gasto, diário e foto">Ativação</th><th>Última atividade</th><th></th></tr></thead>
      <tbody>${us.map(linhaU).join('')}</tbody></table></div>`
        : '<p class="linha-cinza">Nenhum usuário ainda. Crie o primeiro acesso — o gestor da construtora.</p>'
    }
  </section>`;
}

/* Contas sem construtora: cadastro feito pela tela de entrada ou conta
   desligada. Não criam obra (0021); o admin liga a uma construtora. */
function secaoSoltas(soltas) {
  const linhaS = (u) => `<tr>
        <td><b>${esc(u.email || '—')}</b></td>
        <td>${quandoRelativo(u.criado_em)}</td>
        <td>${quandoRelativo(u.ultima_atividade)}</td>
        <td class="acoes" style="opacity:1;white-space:nowrap">
          ${botao('Ligar a uma construtora', 'admin-ligar', { id: u.usuario_id }, 'btn pequeno')}
          ${botao('Editar', 'admin-editar', { id: u.usuario_id }, 'btn sutil pequeno', 'lapis')}
        </td>
      </tr>`;
  return `<section class="caixa" data-testid="contas-sem-construtora">
    <div class="caixa-cab"><h3>Contas sem construtora <span class="tinta2" style="font-weight:400">· ${soltas.length}</span></h3></div>
    <p class="aviso-discreto">Não criam obra nem veem dados de construtora. Ligue a uma construtora ou exclua.</p>
    <div class="tab-rolagem"><table class="tab tab-contas">
      <thead><tr><th>Conta</th><th>Criada</th><th>Última atividade</th><th></th></tr></thead>
      <tbody>${soltas.map(linhaS).join('')}</tbody></table></div>
  </section>`;
}

const construtora = (id) => (Admin.construtoras || []).find((c) => c.id === id);
const usoDe = (c) => ({ usuarios: vagasConstrutora(c).usados, obras: obrasConstrutora(c).usadas });

ACOES['admin-construtora'] = (el, d) => {
  Admin.sel = d.id;
  App.renderConteudo();
};

/* --------------------------------------------- criar e editar construtora */
function formConstrutora(c) {
  const nova = !c;
  const x = c || { nome: '', cnpj: '', plano: 'ativo', limite_usuarios: null, limite_obras: null };
  const uso = nova ? null : usoDe(x);
  abrirModal({
    titulo: nova ? 'Nova construtora' : `Editar ${x.nome}`,
    largura: 'estreito',
    corpo: `
      <div class="form-grade">
        <div class="campo c12"><label for="cst_nome">Nome</label>
          <input type="text" id="cst_nome" value="${esc(x.nome)}" placeholder="Construtora Sonho Real" maxlength="120"></div>
        <div class="campo c6"><label for="cst_cnpj">CNPJ</label>
          <input type="text" id="cst_cnpj" value="${esc(x.cnpj || '')}" placeholder="00.000.000/0000-00" inputmode="numeric"></div>
        <div class="campo c6"><label for="cst_plano">Plano</label>
          <select id="cst_plano">${PLANOS.map(
            (p) => `<option value="${p}" ${p === x.plano ? 'selected' : ''}>${p}</option>`,
          ).join('')}</select></div>
        <div class="campo c6"><label for="cst_lim_u">Acessos contratados</label>
          <input type="number" id="cst_lim_u" min="1" value="${x.limite_usuarios ?? ''}" placeholder="sem limite">
          <span class="dica">Gestor + engenheiros. Cliente final não conta.${
            uso ? ` Em uso: ${uso.usuarios}.` : ''
          }</span></div>
        <div class="campo c6"><label for="cst_lim_o">Limite de obras</label>
          <input type="number" id="cst_lim_o" min="0" value="${x.limite_obras ?? ''}" placeholder="sem limite">
          <span class="dica">Somando a equipe toda.${uso ? ` Hoje: ${uso.obras}.` : ''}</span></div>
      </div>
      ${
        nova
          ? '<p class="aviso-discreto" style="margin-top:var(--e3)">Depois de criar, abra a construtora e crie o primeiro acesso — o gestor.</p>'
          : `<div class="zona-risco">
        <b>Excluir construtora</b>
        <p>Só dá para excluir a construtora vazia: sem usuários, obras, clientes e prestadores.</p>
        ${botao('Excluir construtora', 'admin-excluir-construtora', { id: x.id }, 'btn perigo pequeno', 'lixo')}
      </div>`
      }`,
    rodape: `<button class="btn" data-acao="fechar-modal">Cancelar</button>
             <button class="btn primario" data-acao="admin-salvar-construtora" data-id="${esc(x.id || '')}">${
               nova ? 'Criar construtora' : 'Salvar'
             }</button>`,
  });
}

ACOES['admin-nova-construtora'] = () => formConstrutora(null);
ACOES['admin-editar-construtora'] = (el, d) => {
  const c = construtora(d.id);
  if (c) formConstrutora(c);
};

ACOES['admin-salvar-construtora'] = async (el, d) => {
  const val = (id) => (document.getElementById(id)?.value || '').trim();
  const atual = d.id ? construtora(d.id) : null;
  const dados = {
    nome: val('cst_nome'),
    cnpj: val('cst_cnpj'),
    plano: val('cst_plano'),
    limiteUsuarios: val('cst_lim_u'),
    limiteObras: val('cst_lim_o'),
    bloqueada: atual ? !!atual.bloqueada : false,
  };
  const probs = apenasErros(validarConstrutora(dados, atual ? usoDe(atual) : {}));
  if (probs.length) return toast(probs[0].mensagem, 'critico', 6000);
  if (el) el.disabled = true;
  try {
    const id = await SUPA.adminSalvarConstrutora(d.id || null, dados);
    fecharModal();
    if (id) Admin.sel = id;
    carregarConsumo(true);
    toast(
      d.id
        ? 'Construtora atualizada.'
        : `Construtora ${dados.nome} criada. Agora crie o primeiro acesso — o gestor.`,
      'ok',
      7000,
    );
  } catch (e) {
    if (el) el.disabled = false;
    toast('Não foi possível salvar: ' + ((e && e.message) || e), 'critico', 7000);
  }
};

ACOES['admin-bloquear-construtora'] = (el, d) => {
  const c = construtora(d.id);
  if (!c) return;
  const bloquear = !c.bloqueada;
  confirmar(
    bloquear ? 'Bloquear construtora' : 'Liberar construtora',
    bloquear
      ? `Toda a equipe da ${esc(c.nome)} deixa de conseguir entrar até ser liberada. Os dados ficam guardados. Confirmar?`
      : `Liberar o acesso de toda a equipe da ${esc(c.nome)}?`,
    () =>
      admChamar(
        () =>
          SUPA.adminSalvarConstrutora(c.id, {
            nome: c.nome,
            cnpj: c.cnpj,
            plano: c.plano,
            limiteUsuarios: c.limite_usuarios,
            limiteObras: c.limite_obras,
            bloqueada: bloquear,
          }),
        bloquear ? 'Construtora bloqueada.' : 'Construtora liberada.',
      ),
    bloquear ? 'Bloquear' : 'Liberar',
  );
};

ACOES['admin-excluir-construtora'] = (el, d) => {
  const c = construtora(d.id);
  if (!c) return;
  fecharModal();
  confirmar(
    'Excluir construtora',
    `Excluir ${esc(c.nome)}? Só funciona com ela vazia: sem usuários, obras e cadastros.`,
    () => {
      Admin.sel = '';
      admChamar(() => SUPA.adminExcluirConstrutora(c.id), 'Construtora excluída.');
    },
    'Excluir',
  );
};

/* ------------------------------------------------------------ acessos */
function opcoesPapel(nome, selecionado, vagas) {
  return `<div class="escolha-papel" role="radiogroup" aria-label="Papel">
    ${PAPEIS_CONSTRUTORA.map((p) => {
      const semVaga = p.v !== 'cliente' && vagas && vagas.cheia;
      return `<label class="escolha-papel-item${semVaga ? ' sem-vaga' : ''}">
        <input type="radio" name="${nome}" value="${p.v}" ${p.v === selecionado ? 'checked' : ''}>
        <span><b>${esc(p.t)}</b><span class="tinta2">${esc(p.desc)}${semVaga ? ' — sem vaga agora' : ''}</span></span>
      </label>`;
    }).join('')}
  </div>`;
}

/* a construtora ainda não tem gestor: o primeiro acesso sugerido é ele */
function semGestor(c) {
  return !(Admin.linhas || []).some((l) => l.empresa_id === c.id && l.papel_empresa === 'gestor');
}

ACOES['admin-novo-acesso'] = (el, d) => {
  const c = construtora(d.id);
  if (!c) return;
  const v = vagasConstrutora(c);
  const sugerido = v.cheia ? 'cliente' : semGestor(c) ? 'gestor' : 'engenheiro';
  abrirModal({
    titulo: `Novo acesso · ${c.nome}`,
    largura: 'estreito',
    corpo: `
      <p style="margin:0 0 var(--e3);font-size:var(--t-peq);color:var(--tinta2)">
        ${esc(v.texto)} acessos em uso${v.limite !== null ? ` · ${v.livres} ${v.livres === 1 ? 'livre' : 'livres'}` : ''}.
        A pessoa entra com este e-mail e a senha provisória, e troca a senha depois em <b>Ajustes</b>.
      </p>
      ${opcoesPapel('acs_papel', sugerido, v)}
      <div class="form-grade" style="margin-top:var(--e3)">
        <div class="campo c12"><label for="acs_email">E-mail de acesso</label>
          <input type="email" id="acs_email" autocomplete="off" placeholder="nome@construtora.com"></div>
        <div class="campo c12"><label for="acs_senha">Senha provisória</label>
          <div style="display:flex;gap:6px">
            <input type="text" id="acs_senha" autocomplete="off" value="${senhaProvisoria()}">
            ${botao('Gerar', 'admin-gerar-senha-acesso', {}, 'btn pequeno')}
          </div>
          <span class="dica">Anote e passe à pessoa. 12+ caracteres, com maiúscula, número e símbolo.</span></div>
      </div>
      <p class="aviso-discreto" style="margin-top:var(--e2)">Cliente final: depois de criar, o gestor convida para a obra em Configuração → Equipe.</p>`,
    rodape: `<button class="btn" data-acao="fechar-modal">Cancelar</button>
             <button class="btn primario" data-acao="admin-criar-acesso" data-id="${esc(c.id)}">Criar acesso</button>`,
  });
};

ACOES['admin-gerar-senha-acesso'] = () => {
  const inp = document.getElementById('acs_senha');
  if (inp) inp.value = senhaProvisoria();
};

ACOES['admin-criar-acesso'] = async (el, d) => {
  const c = construtora(d.id);
  if (!c) return;
  const email = (document.getElementById('acs_email')?.value || '').trim();
  const senha = document.getElementById('acs_senha')?.value || '';
  const papel = document.querySelector('#modal-camada input[name="acs_papel"]:checked')?.value || '';
  const probs = apenasErros(validarNovoAcesso({ email, senha, papel }, vagasConstrutora(c)));
  if (probs.length) return toast(probs[0].mensagem, 'critico', 6000);
  if (el) el.disabled = true;
  try {
    await SUPA.adminCriarAcesso({ email, senha, empresaId: c.id, empresaNome: c.nome, papel });
    fecharModal();
    carregarConsumo(true);
    toast(
      `Acesso criado: ${email} (${PAPEL_ROTULO[papel]}), senha provisória ${senha}. Passe à pessoa.`,
      'ok',
      16000,
    );
  } catch (e) {
    if (el) el.disabled = false;
    toast('Não foi possível criar o acesso: ' + ((e && e.message) || e), 'critico', 8000);
  }
};

/* Troca de papel na tabela. Virar gestor ou engenheiro ocupa vaga: o
   banco recusa se não houver. Cancelar devolve o select. */
ACOES['admin-papel'] = (el, d) => {
  const u = (Admin.linhas || []).find((l) => l.usuario_id === d.id);
  if (!u || !u.empresa_id || el.value === u.papel_empresa) return;
  const papel = el.value;
  el.value = u.papel_empresa;
  const c = construtora(u.empresa_id) || {};
  let efeito = '.';
  if (papel === 'cliente') {
    efeito =
      '. Deixa de ver as obras da construtora e perde os convites de equipe; como cliente final, vê só a obra para a qual for convidado.';
  } else if (u.papel_empresa === 'cliente') {
    efeito = `, ocupando uma vaga (${esc(vagasConstrutora(c).texto)} em uso).`;
  }
  confirmar(
    'Mudar papel',
    `${esc(u.email)} passa de ${esc(PAPEL_ROTULO[u.papel_empresa] || '—')} para ${esc(PAPEL_ROTULO[papel])}${efeito}`,
    () => admChamar(() => SUPA.adminLigarUsuario(u.usuario_id, u.empresa_id, papel), 'Papel alterado.'),
    'Mudar',
  );
};

/* Liga uma conta sem construtora a uma construtora, com um papel. */
ACOES['admin-ligar'] = (el, d) => {
  const u = (Admin.linhas || []).find((l) => l.usuario_id === d.id);
  const cs = Admin.construtoras || [];
  if (!u) return;
  if (!cs.length) return toast('Crie uma construtora antes.', 'aviso');
  abrirModal({
    titulo: 'Ligar a uma construtora',
    largura: 'estreito',
    corpo: `
      <p style="margin:0 0 var(--e3);font-size:var(--t-peq);color:var(--tinta2)">${esc(u.email || '')}</p>
      <div class="form-grade">
        <div class="campo c12"><label for="lig_emp">Construtora</label>
          <select id="lig_emp">${cs
            .map(
              (c) =>
                `<option value="${esc(c.id)}">${esc(c.nome)} · ${esc(vagasConstrutora(c).texto)} acessos</option>`,
            )
            .join('')}</select></div>
      </div>
      <div style="margin-top:var(--e3)">${opcoesPapel('lig_papel', 'engenheiro', null)}</div>`,
    rodape: `<button class="btn" data-acao="fechar-modal">Cancelar</button>
             <button class="btn primario" data-acao="admin-ligar-ok" data-id="${esc(u.usuario_id)}">Ligar</button>`,
  });
};

ACOES['admin-ligar-ok'] = (el, d) => {
  const emp = document.getElementById('lig_emp')?.value || '';
  const papel = document.querySelector('#modal-camada input[name="lig_papel"]:checked')?.value || '';
  const c = construtora(emp);
  if (!c || !papel) return toast('Escolha a construtora e o papel.', 'critico');
  if (papel !== 'cliente' && vagasConstrutora(c).cheia) {
    return toast(
      `${c.nome} está sem vaga (${vagasConstrutora(c).texto}). Aumente o limite ou ligue como cliente final.`,
      'critico',
      7000,
    );
  }
  fecharModal();
  Admin.sel = c.id;
  admChamar(() => SUPA.adminLigarUsuario(d.id, c.id, papel), `Conta ligada à ${c.nome}.`);
};
