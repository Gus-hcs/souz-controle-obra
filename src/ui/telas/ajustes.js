/**
 * telas/ajustes.js — Ajustes e dados.
 *
 * Tela de sistema, não de obra, organizada como os Ajustes do macOS: uma
 * navegação à esquerda e uma seção por vez — Empresa, Listas, Importar e
 * exportar, Backup e Saúde dos dados. Um modelo só de salvamento: tudo é
 * gravado sozinho ao mudar (sem botões "Salvar").
 *
 * - Empresa: nome, CNPJ, RT, CREA/CAU, contato e a logo, com a prévia do
 *   cabeçalho do PDF. validarEmpresa barra o que for inválido.
 * - Listas: itens editáveis — adicionar, renomear (renomearItemLista leva
 *   o nome novo aos registros), arrastar para ordenar e arquivar o que
 *   está em uso (some das escolhas, os registros antigos ficam).
 * - Importar e exportar: modelos de planilha (io/importar.js) e a MCMV.
 * - Backup: baixar e restaurar (com o nome da empresa digitado).
 * - Saúde dos dados: saudeDados, cada item com a contagem e o atalho.
 */
import { esc, fmtData, fonteImagem, hojeISO } from '../../nucleo/base.js';
import {
  listaProtegida,
  renomearItemLista,
  saudeDados,
  usoItensLista,
} from '../../dominio/calculos.js';
import { apenasErros, validarEmpresa } from '../../dominio/validacao.js';
import { Store, horaCurta, mutar } from '../../dados/store.js';
import { SUPA } from '../../dados/supabase.js';
import { baixar, carregarXLSX } from '../../io/index.js';
import { MODELOS, baixarModelo, confirmarImportacao, escolherArquivo } from '../../io/importar.js';
import { ACOES } from '../acoes.js';
import { App, abrirModal, botao, campoHTML, fecharModal, ICO, svg, toast } from '../shell.js';
import { VIEWS } from '../telas-obra.js';
import { faixaKpis } from './componentes.js';

const LISTAS_EDITAVEIS = [
  [
    'etapas',
    'Etapas da obra',
    'É o modelo do cronograma de toda obra nova ("Gerar etapas padrão").',
  ],
  ['tiposSaida', 'Tipos de saída'],
  ['unidades', 'Unidades'],
  ['formasPagamento', 'Formas de pagamento'],
  ['regimes', 'Regimes de contrato'],
  ['origensRecebimento', 'Origens de recebimento'],
  ['especialidades', 'Especialidades de prestador'],
  [
    'mensagensWhatsapp',
    'Mensagens prontas do WhatsApp',
    'Cada item: "Título | texto". Use {nome}, {obra}, {valor} (último pagamento) e {data} (amanhã).',
  ],
];

const SECOES = [
  ['empresa', 'Empresa'],
  ['listas', 'Listas'],
  ['importar', 'Importar e exportar'],
  ['backup', 'Backup'],
  ['saude', 'Saúde dos dados'],
];

/* Estado só de tela: a seção aberta e a lista escolhida. */
const tela = { secao: 'empresa', lista: 'etapas' };

/* ---------------------------------------------------------------- KPIs */
function kpisAjustes(e, tamanho, problemas) {
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
  return faixaKpis(
    [
      {
        rotulo: 'Obras cadastradas',
        valor: e.obras.length,
        contexto: 'nesta conta',
        filtra: false,
      },
      {
        rotulo: 'Registros no total',
        valor: totalRegistros,
        contexto: 'contratos, medições, recebimentos e mais',
        filtra: false,
      },
      {
        rotulo: 'Última gravação',
        valor: Store.salvoEm ? `${fmtData(Store.salvoEm.slice(0, 10))}` : '—',
        contexto: Store.salvoEm
          ? `às ${horaCurta(Store.salvoEm)} · ${tamanho} KB`
          : 'ainda não salvou',
        filtra: false,
      },
      {
        chave: 'saude',
        rotulo: 'Saúde dos dados',
        valor: problemas ? `${problemas} a arrumar` : 'em ordem',
        contexto: problemas
          ? 'duplicados, sem etapa, cadastros incompletos'
          : 'nada a arrumar no cadastro',
        tom: problemas ? 'tom-alerta' : '',
      },
    ],
    {
      rotulo: 'Indicadores da base de dados',
      acao: 'ajustes-secao',
      ativo: tela.secao === 'saude' ? 'saude' : '',
    },
  );
}

/* ----------------------------------------------------------- Empresa */
function previaCabecalho(emp) {
  return `<div class="folha folha-mini" aria-label="Prévia do cabeçalho do PDF">
    <header class="folha-cab">
      ${emp.logo && fonteImagem(emp.logo) ? `<div class="folha-logos"><img src="${fonteImagem(emp.logo)}" alt=""></div>` : ''}
      <div class="folha-tit">
        <div><h2>Casa 12 — Residencial Aurora</h2><span>Cliente · Cidade/UF</span></div>
        <div class="dir"><b>${esc(emp.nome || 'Nome da empresa')}</b><span>Relatório de status · ${esc(fmtData(hojeISO()))}</span></div>
      </div>
    </header>
    <div class="folha-assina"><div><i></i><b>${esc(emp.responsavel || 'Responsável técnico')}</b><span>${emp.creaCau ? `CREA/CAU ${esc(emp.creaCau)}` : 'CREA/CAU'}${emp.cnpj ? ` · CNPJ ${esc(emp.cnpj)}` : ''}</span></div></div>
  </div>`;
}

function secaoEmpresa(e) {
  const emp = e.empresa;
  const avisos = validarEmpresa(emp).filter((p) => p.sev === 'alerta');
  return `<section class="ajustes-secao" aria-label="Empresa">
    <h2>Empresa</h2>
    <p class="tinta2 ajustes-lead">Sai no cabeçalho e na assinatura dos relatórios. O responsável técnico daqui vale para as obras que não têm o próprio (Configuração da obra). Grava sozinho ao mudar.</p>
    ${avisos.length ? `<p class="aviso-linha" role="status">${avisos.map((p) => esc(p.mensagem)).join(' ')}</p>` : ''}
    <div class="ajustes-empresa">
      <form class="form-grade" data-form="1" data-empresa="1" onsubmit="return false">
        ${campoHTML({ k: 'nome', label: 'Nome da empresa', tipo: 'texto', col: 6 }, emp)}
        ${campoHTML({ k: 'cnpj', label: 'CNPJ', tipo: 'texto', col: 6, placeholder: '00.000.000/0000-00' }, emp)}
        ${campoHTML({ k: 'responsavel', label: 'Responsável técnico', tipo: 'texto', col: 6 }, emp)}
        ${campoHTML({ k: 'creaCau', label: 'CREA/CAU', tipo: 'texto', col: 6 }, emp)}
        ${campoHTML({ k: 'telefone', label: 'Telefone', tipo: 'texto', col: 6 }, emp)}
        ${campoHTML({ k: 'email', label: 'E-mail', tipo: 'texto', col: 6 }, emp)}
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
      <div class="ajustes-previa"><span class="tinta2">Como sai no PDF</span><div id="previa-cabecalho">${previaCabecalho(emp)}</div></div>
    </div>
  </section>`;
}

/* grava a empresa ao mudar qualquer campo (e a logo, que avisa com change) */
if (typeof document !== 'undefined') {
  document.addEventListener('change', (ev) => {
    const form = ev.target && ev.target.closest && ev.target.closest('form[data-empresa]');
    if (!form || App.rota.view !== 'ajustes' || Store.somenteLeitura()) return;
    const d = {};
    form.querySelectorAll('[data-campo]').forEach((el) => {
      d[el.dataset.campo] = String(el.value || '').trim();
    });
    const nova = { ...Store.estado.empresa, ...d };
    form.querySelectorAll('.campo.invalido').forEach((c) => c.classList.remove('invalido'));
    const erros = apenasErros(validarEmpresa(nova));
    if (erros.length) {
      erros.forEach((p) => {
        const el = form.querySelector(`#f_${p.campo}`);
        if (el && el.closest('.campo')) el.closest('.campo').classList.add('invalido');
      });
      toast(`Não salvou: ${erros[0].mensagem}`, 'aviso', 4500);
      return;
    }
    mutar((e) => Object.assign(e.empresa, d), { render: false });
    const prev = document.getElementById('previa-cabecalho');
    if (prev) prev.innerHTML = previaCabecalho(Store.estado.empresa);
  });
}

/* ------------------------------------------------------------ Listas */
function secaoListas(e) {
  const uso = usoItensLista(e);
  const [k, titulo, dica] =
    LISTAS_EDITAVEIS.find((x) => x[0] === tela.lista) || LISTAS_EDITAVEIS[0];
  const arq = (e.listas.arquivados || {})[k] || [];
  const itens = (e.listas[k] || []).filter((i) => !arq.includes(i));
  const emUso = (i) => (uso[k] && uso[k].get(i)) || 0;
  const leitura = Store.somenteLeitura();
  const linha = (item, idx, total) => {
    const n = emUso(item);
    return `<li class="lista-item" draggable="${!leitura}" data-lista="${k}" data-idx="${idx}">
      <span class="lista-alca" aria-hidden="true">⋮⋮</span>
      <input type="text" value="${esc(item)}" data-lista-renomear="${k}" data-antigo="${esc(item)}" aria-label="Renomear ${esc(item)}" ${leitura ? 'readonly' : ''}>
      ${n ? `<span class="tinta3 lista-uso">${n} em uso</span>` : ''}
      ${
        leitura
          ? ''
          : `<button class="btn sutil icone pequeno" data-acao="lista-mover" data-lista="${k}" data-idx="${idx}" data-para="-1" ${idx === 0 ? 'disabled' : ''} aria-label="Subir ${esc(item)}" title="Subir">↑</button>
             <button class="btn sutil icone pequeno" data-acao="lista-mover" data-lista="${k}" data-idx="${idx}" data-para="1" ${idx === total - 1 ? 'disabled' : ''} aria-label="Descer ${esc(item)}" title="Descer">↓</button>
             ${
               n
                 ? `<button class="btn sutil pequeno" data-acao="lista-arquivar" data-lista="${k}" data-item="${esc(item)}" title="Some das escolhas; os ${n} registros continuam">Arquivar</button>`
                 : `<button class="btn sutil icone pequeno acao-excluir" data-acao="lista-excluir" data-lista="${k}" data-item="${esc(item)}" aria-label="Excluir ${esc(item)}" title="Excluir">${svg(ICO.lixo, 13)}</button>`
             }`
      }
    </li>`;
  };
  const obra = App.obra();
  return `<section class="ajustes-secao" aria-label="Listas">
    <h2>Listas</h2>
    <p class="tinta2 ajustes-lead">As listas valem para todas as obras e gravam sozinhas. Item em uso não se exclui: arquive — ele some das escolhas e os registros antigos continuam com ele. Renomear leva o nome novo aos registros.</p>
    <div class="ajustes-listas">
      <nav class="listas-nav" aria-label="Listas">${LISTAS_EDITAVEIS.map(
        ([kk, t]) =>
          `<button type="button" class="${kk === k ? 'ativo' : ''}" data-acao="ajustes-lista" data-lista="${kk}" aria-current="${kk === k}">${esc(t)}<span class="tinta3">${(e.listas[kk] || []).length}</span></button>`,
      ).join('')}</nav>
      <div class="lista-editor">
        <h3>${esc(titulo)}</h3>
        ${dica ? `<p class="tinta2 ajustes-lead">${esc(dica)}</p>` : ''}
        <ul class="lista-itens" data-lista="${k}">${itens.map((it, i) => linha(it, (e.listas[k] || []).indexOf(it), itens.length)).join('')}</ul>
        ${
          leitura
            ? ''
            : `<form class="lista-nova" onsubmit="return false">
                <input type="text" id="lista-nova-${k}" placeholder="Novo item" aria-label="Novo item em ${esc(titulo)}">
                ${botao('Adicionar', 'lista-adicionar', { lista: k }, 'btn pequeno', 'mais')}
              </form>`
        }
        ${
          arq.length
            ? `<details class="lista-arquivados"><summary class="tinta2">Arquivados (${arq.length})</summary>
                <ul>${arq
                  .map(
                    (it) =>
                      `<li><span>${esc(it)}</span>${leitura ? '' : botao('Restaurar', 'lista-restaurar', { lista: k, item: it }, 'btn sutil pequeno')}</li>`,
                  )
                  .join('')}</ul></details>`
            : ''
        }
        ${
          k === 'etapas' && obra && obra.cronograma.length && !leitura
            ? `<p class="tinta2 ajustes-lead" style="margin-top:var(--e4)">Quer que as obras novas nasçam com as etapas de <b>${esc(obra.nome)}</b>?
                ${botao('Usar as etapas desta obra como modelo', 'listas-modelo-da-obra', {}, 'btn sutil pequeno')}</p>`
            : ''
        }
      </div>
    </div>
  </section>`;
}

/* ----------------------------------------------- Importar e exportar */
function secaoImportar(e) {
  const obra = App.obra();
  const cartao = (modelo, texto) => {
    const m = MODELOS[modelo];
    return `<div class="import-cartao">
      <b>${esc(m.rotulo)}</b>
      <span class="tinta2">${esc(texto)}</span>
      <span class="import-acoes">
        ${botao('Baixar modelo', 'baixar-modelo', { modelo }, 'btn sutil pequeno', 'baixar')}
        ${Store.somenteLeitura() ? '' : botao('Importar planilha', 'importar-modelo', { modelo }, 'btn pequeno')}
      </span>
    </div>`;
  };
  return `<section class="ajustes-secao" aria-label="Importar e exportar">
    <h2>Importar e exportar</h2>
    <p class="tinta2 ajustes-lead">Baixe a planilha-modelo, preencha e importe. Antes de gravar você vê cada linha e o que está errado nela; linha com erro não entra.</p>
    <div class="import-grade">
      ${cartao('obras', 'Uma obra por linha: nome, cliente, endereço, área, datas, valores e financiador.')}
      ${cartao('prestadores', 'Prestadores de serviço e fornecedores, com telefone e especialidade.')}
      ${cartao('lancamentos', `Compras e saídas${obra ? ` — entram em ${obra.nome}` : ' — abra a obra que vai recebê-las'}.`)}
      ${cartao('cronograma', `Etapas com datas e responsável${obra ? ` — entram em ${obra.nome}` : ' — abra a obra primeiro'}.`)}
      <div class="import-cartao">
        <b>Planilha MCMV</b>
        <span class="tinta2">A planilha de controle de obra financiada (modelo CAIXA): cria a obra inteira de uma vez.</span>
        <span class="import-acoes">${Store.somenteLeitura() ? '' : botao('Importar planilha MCMV', 'importar-xlsx', {}, 'btn pequeno')}</span>
      </div>
    </div>
    <h3 style="margin-top:var(--e6)">Exportar</h3>
    <p class="tinta2 ajustes-lead">Os registros de cada obra — lançamentos, medições e recebimentos — saem em CSV ou Excel em Relatórios → Exportar dados.${
      obra ? '' : ' Abra uma obra para exportar.'
    }</p>
    ${obra ? botao('Ir para Relatórios', 'ir', { view: 'relatorio' }, 'btn sutil pequeno') : ''}
    ${e.obras.length ? '' : `<p style="margin-top:var(--e4)">${botao('Carregar dados de exemplo', 'exemplo', {}, 'btn sutil')}</p>`}
  </section>`;
}

/* ----------------------------------------------------------- Backup */
function secaoBackup() {
  return `<section class="ajustes-secao" aria-label="Backup">
    <h2>Backup</h2>
    <p class="tinta2 ajustes-lead">O backup (JSON) tem a base inteira: serve para guardar uma cópia e para levar o sistema para outro servidor.</p>
    <div class="ajustes-botoes">
      ${botao('Baixar backup', 'backup-json', {}, 'btn primario', 'baixar')}
      ${Store.somenteLeitura() ? '' : botao('Restaurar backup…', 'restaurar-json', {}, 'btn')}
    </div>
    <dl class="pares ajustes-pares">
      <dt>Última gravação</dt><dd>${Store.salvoEm ? `${fmtData(Store.salvoEm.slice(0, 10))} ${horaCurta(Store.salvoEm)}` : '—'}</dd>
      ${
        /* infraestrutura (modo de gravação, conta, endereço do banco): só o administrador vê */
        SUPA.ehAdmin
          ? `<dt>Modo de gravação</dt><dd>${esc(Store.descricaoModo())}</dd>
             ${Store.backend === 'supabase' ? `<dt>Conta</dt><dd>${esc((SUPA.usuario && SUPA.usuario.email) || '')}</dd><dt>Projeto do banco</dt><dd>${esc(SUPA.cfg.url)}</dd>` : ''}`
          : ''
      }
    </dl>
    ${
      Store.somenteLeitura()
        ? ''
        : `<div class="zona-risco">
            <h3>Zona de risco</h3>
            <p>Apaga toda a base do sistema. Baixe um backup antes. Para confirmar, será preciso digitar o nome da empresa.</p>
            ${botao('Apagar todos os dados', 'zerar', {}, 'btn perigo', 'lixo')}
          </div>`
    }
  </section>`;
}

/* -------------------------------------------------- Saúde dos dados */
function secaoSaude(itens) {
  return `<section class="ajustes-secao" aria-label="Saúde dos dados">
    <h2>Saúde dos dados</h2>
    <p class="tinta2 ajustes-lead">O que está desarrumado no cadastro, em todas as obras. Cada item leva direto para onde se conserta.</p>
    ${
      itens.length
        ? `<ul class="saude-lista">${itens
            .map(
              (x) => `<li>
                <span class="saude-n">${x.n}</span>
                <span class="saude-txt"><b>${esc(x.titulo)}</b><span class="tinta2">${esc(x.detalhe)}</span></span>
                ${botao('Corrigir', 'saude-corrigir', { chave: x.chave }, 'btn sutil pequeno')}
              </li>`,
            )
            .join('')}</ul>`
        : '<p class="linha-cinza">Nada a arrumar: nomes, lançamentos e contratos em ordem.</p>'
    }
  </section>`;
}

/* ---------------------------------------------------------------- tela */
VIEWS.ajustes = () => {
  const e = Store.estado;
  const tamanho = (JSON.stringify(e).length / 1024).toFixed(0);
  const saude = saudeDados(e);
  const problemas = saude.reduce((s, x) => s + x.n, 0);
  const corpo = {
    empresa: () => secaoEmpresa(e),
    listas: () => secaoListas(e),
    importar: () => secaoImportar(e),
    backup: () => secaoBackup(),
    saude: () => secaoSaude(saude),
  }[tela.secao];

  return `<div class="tela-lista">
    ${kpisAjustes(e, tamanho, problemas)}
    <div class="ajustes-grade">
      <nav class="ajustes-nav" aria-label="Seções de ajustes">${SECOES.map(
        ([k, t]) =>
          `<button type="button" class="${k === tela.secao ? 'ativo' : ''}" data-acao="ajustes-secao" data-kpi="${k}" aria-current="${k === tela.secao}">
            ${esc(t)}${k === 'saude' && problemas ? `<span class="nav-conta">${problemas}</span>` : ''}</button>`,
      ).join('')}</nav>
      <div class="ajustes-corpo">${(corpo || SECOES[0])()}</div>
    </div>
  </div>`;
};

/* -------------------------------------------------------------- ações */
/* importação por modelo (io/importar.js): as dependências de tela vão na chamada */
const depImport = () => ({
  Store,
  mutar,
  App,
  abrirModal,
  fecharModal,
  toast,
  baixar,
  carregarXLSX,
});
ACOES['importar-modelo'] = (el, d) => escolherArquivo(d.modelo, depImport());
ACOES['baixar-modelo'] = (el, d) => baixarModelo(d.modelo, depImport());
ACOES['importar-confirmar'] = () => confirmarImportacao(depImport());

ACOES['ajustes-secao'] = (el, d) => {
  tela.secao = SECOES.some(([k]) => k === d.kpi) ? d.kpi : 'empresa';
  App.renderConteudo();
};
ACOES['ajustes-lista'] = (el, d) => {
  tela.lista = d.lista;
  App.renderConteudo();
};

const lista = (e, k) => {
  if (!Array.isArray(e.listas[k])) e.listas[k] = [];
  return e.listas[k];
};
const arquivados = (e, k) => {
  if (!e.listas.arquivados) e.listas.arquivados = {};
  if (!Array.isArray(e.listas.arquivados[k])) e.listas.arquivados[k] = [];
  return e.listas.arquivados[k];
};

ACOES['lista-adicionar'] = (el, d) => {
  const inp = document.getElementById(`lista-nova-${d.lista}`);
  const v = String((inp && inp.value) || '').trim();
  if (!v) return;
  if (lista(Store.estado, d.lista).includes(v))
    return toast('Esse item já está na lista.', 'aviso');
  mutar((e) => lista(e, d.lista).push(v));
  setTimeout(() => {
    const novo = document.getElementById(`lista-nova-${d.lista}`);
    if (novo) novo.focus();
  });
};
ACOES['lista-mover'] = (el, d) => moverItem(d.lista, Number(d.idx), Number(d.idx) + Number(d.para));
function moverItem(k, de, para) {
  const l = lista(Store.estado, k);
  if (de === para || de < 0 || para < 0 || de >= l.length || para >= l.length) return;
  mutar((e) => {
    const ls = lista(e, k);
    const [x] = ls.splice(de, 1);
    ls.splice(para, 0, x);
  });
}
ACOES['lista-excluir'] = (el, d) => {
  const uso = usoItensLista(Store.estado)[d.lista];
  if (uso && uso.get(d.item)) return toast('Item em uso: arquive em vez de excluir.', 'aviso');
  mutar((e) => {
    e.listas[d.lista] = lista(e, d.lista).filter((i) => i !== d.item);
  });
};
ACOES['lista-arquivar'] = (el, d) => {
  mutar((e) => {
    const a = arquivados(e, d.lista);
    if (!a.includes(d.item)) a.push(d.item);
  });
  toast(`"${d.item}" arquivado: some das escolhas, os registros continuam.`, 'ok');
};
ACOES['lista-restaurar'] = (el, d) => {
  mutar((e) => {
    e.listas.arquivados[d.lista] = arquivados(e, d.lista).filter((i) => i !== d.item);
  });
};
ACOES['listas-modelo-da-obra'] = () => {
  const o = App.obra();
  if (!o) return;
  const etapas = [
    ...new Set(o.cronograma.map((x) => String(x.etapa || '').trim()).filter(Boolean)),
  ];
  /* item em uso que a obra não tem continua na lista (listaProtegida) */
  const r = listaProtegida(
    usoItensLista(Store.estado).etapas,
    lista(Store.estado, 'etapas'),
    etapas,
  );
  mutar((e) => {
    e.listas.etapas = r.lista;
  });
  toast(`As obras novas nascem com as ${etapas.length} etapas de ${o.nome}.`, 'ok');
};
ACOES['saude-corrigir'] = (el, d) => {
  const x = saudeDados(Store.estado).find((i) => i.chave === d.chave);
  if (!x) return;
  if (x.acao && ACOES[x.acao] && !x.obraId) return ACOES[x.acao](el, {});
  App.ir(x.view, x.obraId || undefined);
  if (x.filtro) {
    App.filtros = { ...x.filtro };
    App.renderConteudo();
  }
  if (x.acao && ACOES[x.acao]) setTimeout(() => ACOES[x.acao](el, {}));
};

/* renomear ao sair do campo; leva o nome novo aos registros */
if (typeof document !== 'undefined') {
  document.addEventListener('change', (ev) => {
    const el = ev.target;
    if (!el || !el.dataset || !el.dataset.listaRenomear || App.rota.view !== 'ajustes') return;
    const k = el.dataset.listaRenomear;
    const antigo = el.dataset.antigo;
    const novo = String(el.value || '').trim();
    if (!novo || novo === antigo) {
      el.value = antigo;
      return;
    }
    if (lista(Store.estado, k).includes(novo)) {
      el.value = antigo;
      return toast('Já existe um item com esse nome.', 'aviso');
    }
    let n = 0;
    mutar((e) => {
      n = renomearItemLista(e, k, antigo, novo);
    });
    toast(
      n
        ? `Renomeado — ${n} registro${n === 1 ? '' : 's'} atualizado${n === 1 ? '' : 's'}.`
        : 'Renomeado.',
      'ok',
    );
  });

  /* arrastar para ordenar */
  let arrastando = null;
  document.addEventListener('dragstart', (ev) => {
    const li = ev.target.closest && ev.target.closest('.lista-item');
    if (!li) return;
    arrastando = { lista: li.dataset.lista, idx: Number(li.dataset.idx) };
    li.classList.add('arrastando');
    ev.dataTransfer.effectAllowed = 'move';
  });
  document.addEventListener('dragover', (ev) => {
    const li = ev.target.closest && ev.target.closest('.lista-item');
    if (!arrastando || !li || li.dataset.lista !== arrastando.lista) return;
    ev.preventDefault();
  });
  document.addEventListener('drop', (ev) => {
    const li = ev.target.closest && ev.target.closest('.lista-item');
    if (!arrastando || !li || li.dataset.lista !== arrastando.lista) return;
    ev.preventDefault();
    const de = arrastando.idx;
    arrastando = null;
    moverItem(li.dataset.lista, de, Number(li.dataset.idx));
  });
  document.addEventListener('dragend', () => {
    arrastando = null;
    document
      .querySelectorAll('.lista-item.arrastando')
      .forEach((x) => x.classList.remove('arrastando'));
  });
}
