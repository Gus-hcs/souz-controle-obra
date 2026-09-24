/**
 * telas/prestadores.js — Prestadores: cadastro rápido, contato em 1 toque,
 * números que se preenchem sozinhos.
 *
 * Quem preenche é o próprio cliente, muitas vezes pelo celular na obra.
 * Por isso: três campos para cadastrar (nome, especialidade, WhatsApp), o
 * WhatsApp abre com um toque, e Contratado/Pago/A pagar nunca são
 * digitados — saem de resumoPrestador (dominio/calculos.js), a partir dos
 * contratos e lançamentos ligados a cada um.
 *
 * Prestador com contrato ou pagamento ligado não é apagado: é arquivado.
 * O banco garante o mesmo (ON DELETE RESTRICT, migração 0011).
 */
import {
  addDias,
  esc,
  fmtDataCurta,
  fmtMoney,
  FORMAS_CONTRATACAO,
  hojeISO,
  norm,
  novoPrestador,
  TIPOS_PIX,
} from '../../nucleo/base.js';
import {
  formatarTelefoneBR,
  lerModelosMensagem,
  linkTelefone,
  linkWhatsApp,
  mascaraTelefone,
  normalizarTelefoneBR,
  preencherMensagem,
} from '../../nucleo/contato.js';
import {
  avaliacaoPrestador,
  CRITERIOS_AVAL,
  duplicadosPrestador,
  resumoPrestador,
  sugestaoNomePrestador,
  totaisPrestadores,
} from '../../dominio/calculos.js';
import { apenasErros, validarPrestador } from '../../dominio/validacao.js';
import { Store, mutar } from '../../dados/store.js';
import { ACOES } from '../acoes.js';
import { App, ICO, abrirModal, botao, fecharModal, svg, toast } from '../shell.js';
import { VIEWS } from '../telas-obra.js';
import { buscaToolbar, dinheiro, lista, vazioTela } from './componentes.js';

/* Estado só de tela. */
const tela = { selecao: '', especialidade: '', comSaldo: false, arquivados: false };

/* Valores de prestador sem centavos: a coluna fica estreita com o inspetor
   aberto, e para contratado e pago o real inteiro basta. */
const reais = (v, o = {}) => dinheiro(v, { dec: 0, ...o });

const somenteLeitura = () => Store.somenteLeitura();
const acharPrestador = (id) => Store.estado.prestadores.find((p) => p.id === id);
/* Como a pessoa é chamada na obra: o apelido, se houver; senão o nome
   inteiro. Primeiro nome não serve — "Construtora Alfa" virava "Construtora". */
const comoChamar = (p) => String(p.apelido || p.nome || '').trim();

/* --------------------------------------------------------------- contato */

/* Botões de contato. Links reais (target=_blank, rel=noopener); o clique
   passa por "abrir-externo" porque a linha inteira também é clicável. */
function botoesContato(p, { grande = false } = {}) {
  const cls = `btn-contato${grande ? ' grande' : ''}`;
  const out = [];
  if (p.whatsapp && p.temWhatsapp !== false) {
    out.push(`<a class="${cls}" href="${esc(linkWhatsApp(p.whatsapp))}" target="_blank" rel="noopener"
      data-acao="abrir-externo" title="WhatsApp" aria-label="Abrir WhatsApp de ${esc(p.nome)}">${svg(ICO.whatsapp, 15)}</a>`);
    out.push(`<button class="${cls} menu" data-acao="prest-mensagens" data-id="${esc(p.id)}"
      title="Mensagem pronta" aria-label="Mensagens prontas para ${esc(p.nome)}" aria-haspopup="menu">${svg(ICO.seta, 10)}</button>`);
  }
  const ligar = p.whatsapp || p.telefone;
  if (ligar) {
    out.push(`<a class="${cls}" href="${esc(linkTelefone(p.telefone && (!p.whatsapp || p.temWhatsapp === false) ? p.telefone : p.whatsapp))}"
      data-acao="abrir-externo" title="Ligar" aria-label="Ligar para ${esc(p.nome)}">${svg(ICO.telefone, 15)}</a>`);
  }
  if (!p.whatsapp && !somenteLeitura()) {
    out.push(
      `<button class="btn-link" data-acao="editar-prestador" data-id="${esc(p.id)}" data-foco="whatsapp">Adicionar WhatsApp</button>`,
    );
  }
  return `<span class="contatos">${out.join('')}</span>`;
}

/* Variáveis das mensagens prontas: {nome}, {obra}, {valor}, {data}. */
function variaveisMensagem(p) {
  const r = resumoPrestador(Store.estado, p);
  const ativa = App.obra();
  const obra = (ativa && r.obras.find((o) => o.obraId === ativa.id)) || r.obras[0];
  return {
    nome: comoChamar(p),
    obra: obra ? obra.obraNome : ativa ? ativa.nome : '',
    valor: r.pagamentos[0] ? fmtMoney(r.pagamentos[0].valor) : '',
    data: fmtDataCurta(addDias(hojeISO(), 1)),
  };
}

/* ----------------------------------------------------------------- lista */

function base() {
  const busca = norm(App.filtros.busca || '');
  const dig = busca.replace(/\D/g, '');
  return Store.estado.prestadores.filter((p) => {
    if (!!p.arquivado !== tela.arquivados) return false;
    if (tela.especialidade && p.especialidade !== tela.especialidade) return false;
    if (!busca) return true;
    if (norm(`${p.nome} ${p.apelido} ${p.especialidade}`).includes(busca)) return true;
    return dig.length >= 4 && `${p.whatsapp}${p.telefone}`.includes(dig);
  });
}

function dados() {
  let ds = base().map((p) => ({
    p,
    r: resumoPrestador(Store.estado, p),
    a: avaliacaoPrestador(Store.estado, p),
  }));
  if (tela.comSaldo) ds = ds.filter((d) => d.r.aPagar > 0.005);
  return ds;
}

const COLUNAS = [
  {
    k: 'nome',
    rotulo: 'Prestador',
    largura: '24%',
    celular: 'principal',
    valor: (d) => norm(d.p.nome),
    celula: (d) =>
      `<div class="cel-obra"><b>${esc(d.p.nome)}</b>${d.p.apelido && d.p.apelido !== d.p.nome ? `<span>${esc(d.p.apelido)}</span>` : ''}</div>`,
  },
  {
    k: 'especialidade',
    rotulo: 'Especialidade',
    largura: '11%',
    valor: (d) => d.p.especialidade || '',
    celula: (d) =>
      d.p.especialidade ? `<span class="tinta2">${esc(d.p.especialidade)}</span>` : '',
  },
  {
    k: 'contato',
    rotulo: 'Contato',
    largura: '13%',
    classe: 'cel-contato',
    celula: (d) => botoesContato(d.p),
  },
  {
    k: 'obras',
    rotulo: 'Obras',
    largura: '6%',
    num: true,
    celular: 'some',
    valor: (d) => d.r.obras.length,
    celula: (d) => (d.r.obras.length ? `${d.r.obras.length}` : ''),
  },
  {
    k: 'contratado',
    rotulo: 'Contratado',
    largura: '12%',
    num: true,
    celular: 'some',
    valor: (d) => d.r.contratado,
    celula: (d) => reais(d.r.contratado, { cinzaNoZero: true }),
    total: (ds) =>
      reais(
        totaisPrestadores(
          Store.estado,
          ds.map((d) => d.p),
        ).contratado,
      ),
  },
  {
    k: 'pago',
    rotulo: 'Pago',
    largura: '12%',
    num: true,
    celular: 'some',
    valor: (d) => d.r.pago,
    celula: (d) => reais(d.r.pago, { cinzaNoZero: true }),
    total: (ds) =>
      reais(
        totaisPrestadores(
          Store.estado,
          ds.map((d) => d.p),
        ).pago,
      ),
  },
  {
    k: 'aPagar',
    rotulo: 'A pagar',
    largura: '11%',
    num: true,
    valor: (d) => d.r.aPagar,
    celula: (d) => reais(d.r.aPagar, { cinzaNoZero: true }),
    total: (ds) =>
      reais(
        totaisPrestadores(
          Store.estado,
          ds.map((d) => d.p),
        ).aPagar,
      ),
  },
  {
    k: 'avaliacao',
    rotulo: 'Avaliação',
    largura: '8%',
    num: true,
    celular: 'some',
    valor: (d) => (d.a.media === null ? -1 : d.a.media),
    /* sem avaliação, célula vazia — nem traço, nem zero */
    celula: (d) =>
      d.a.media === null
        ? ''
        : `<span class="nota" title="${d.a.avaliacoes} avaliação(ões)">${d.a.media.toFixed(1).replace('.', ',')} ${svg(ICO.estrela, 11)}</span>`,
  },
  {
    k: 'acoes',
    rotulo: '',
    largura: '3%',
    celula: (d) =>
      somenteLeitura()
        ? ''
        : `<button class="btn sutil icone pequeno" data-acao="prest-menu" data-id="${esc(d.p.id)}"
      title="Mais ações" aria-label="Mais ações para ${esc(d.p.nome)}" aria-haspopup="menu">${svg(ICO.maisH, 15)}</button>`,
  },
];

function barraFiltros(todos) {
  const esp = [...new Set(todos.map((p) => p.especialidade).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'pt'),
  );
  const arquivados = Store.estado.prestadores.filter((p) => p.arquivado).length;
  return `<div class="filtro-barra nao-imprime">
    <select data-acao="prest-especialidade" aria-label="Especialidade">
      <option value="">Todas as especialidades</option>
      ${esp.map((e) => `<option ${e === tela.especialidade ? 'selected' : ''}>${esc(e)}</option>`).join('')}
    </select>
    <button class="filtro-chave" data-acao="prest-com-saldo" aria-pressed="${tela.comSaldo}">Com saldo a pagar</button>
    ${
      arquivados || tela.arquivados
        ? `<button class="filtro-chave" data-acao="prest-arquivados" aria-pressed="${tela.arquivados}">Arquivados (${arquivados})</button>`
        : ''
    }
    ${(() => {
      /* Arrumação do cadastro fica junto dos filtros, não na toolbar: no
         celular ela empurrava o título para fora da tela. */
      const sug = somenteLeitura() ? 0 : sugestoes().length;
      return sug
        ? `<button class="btn pequeno filtro-dir" data-acao="prest-revisar-nomes"
            title="Nomes em caixa alta ou com a especialidade junto">Revisar nomes (${sug})</button>`
        : '';
    })()}
  </div>`;
}

/* -------------------------------------------------------------- inspetor */

function inspetor(p) {
  const r = resumoPrestador(Store.estado, p);
  const a = avaliacaoPrestador(Store.estado, p);
  const par = (rot, val) =>
    val ? `<div class="par"><dt>${esc(rot)}</dt><dd>${val}</dd></div>` : '';
  const pix = TIPOS_PIX.find((t) => t.v === p.tipoPix);
  const forma = FORMAS_CONTRATACAO.find((f) => f.v === p.formaContratacao);

  const contato =
    p.whatsapp || p.telefone
      ? `<div class="inspetor-contato">
        ${p.whatsapp ? `<div class="linha-contato"><span><b>${esc(formatarTelefoneBR(p.whatsapp))}</b><span class="tinta3">${p.temWhatsapp === false ? 'sem WhatsApp' : 'WhatsApp'}</span></span>${botoesContato({ ...p, telefone: '' }, { grande: true })}</div>` : ''}
        ${
          p.telefone
            ? `<div class="linha-contato"><span><b>${esc(formatarTelefoneBR(p.telefone))}</b><span class="tinta3">telefone</span></span>
            <span class="contatos"><a class="btn-contato grande" href="${esc(linkTelefone(p.telefone))}" data-acao="abrir-externo" aria-label="Ligar para ${esc(p.nome)}">${svg(ICO.telefone, 15)}</a></span></div>`
            : ''
        }
      </div>`
      : `<p class="tinta2 inspetor-vazio">Sem telefone. ${somenteLeitura() ? '' : `<button class="btn-link" data-acao="editar-prestador" data-id="${esc(p.id)}" data-foco="whatsapp">Adicionar WhatsApp</button>`}</p>`;

  const obras = r.obras.length
    ? `<table class="mini-tab"><thead><tr><th>Obra</th><th class="num">Contratado</th><th class="num">Pago</th></tr></thead>
        <tbody>${r.obras.map((o) => `<tr><td>${esc(o.obraNome)}</td><td class="num">${reais(o.contratado, { cinzaNoZero: true })}</td><td class="num">${reais(o.pago, { cinzaNoZero: true })}</td></tr>`).join('')}</tbody></table>`
    : '<p class="tinta2 inspetor-vazio">Ainda sem contrato nem pagamento. Escolha este prestador num contrato ou num lançamento.</p>';

  const pagamentos = r.pagamentos.length
    ? `<ol class="pagamentos">${r.pagamentos
        .slice(0, 5)
        .map(
          (x) => `<li>
          <span class="tinta2">${fmtDataCurta(x.data)}</span>
          <span class="pg-txt"><b>${esc(x.descricao)}</b><span>${esc(x.obraNome)} · ${x.origem === 'medicao' ? 'medição' : 'lançamento'}</span></span>
          <span class="num">${fmtMoney(x.valor)}</span></li>`,
        )
        .join('')}</ol>`
    : '<p class="tinta2 inspetor-vazio">Nenhum pagamento ainda.</p>';

  const avaliacao =
    a.media === null
      ? '<p class="tinta2 inspetor-vazio">Sem avaliação. Ela é pedida quando um contrato dele é concluído.</p>'
      : `<dl class="pares">
        ${par('Média', `${a.media.toFixed(1).replace('.', ',')} ${svg(ICO.estrela, 11)} <span class="tinta3">${a.avaliacoes} contrato${a.avaliacoes > 1 ? 's' : ''}</span>`)}
        ${a.criterios.map((c) => par(c.rotulo, c.media === null ? '<span class="tinta3">—</span>' : c.media.toFixed(1).replace('.', ','))).join('')}
      </dl>`;

  return `<aside class="inspetor" data-testid="inspetor-prestador" aria-label="${esc(p.nome)}">
    <div class="inspetor-cab">
      <h2>${esc(p.nome)}<span class="sub">${esc([p.apelido && p.apelido !== p.nome ? p.apelido : '', p.especialidade].filter(Boolean).join(' · ') || 'sem especialidade')}${p.arquivado ? ' · arquivado' : ''}</span></h2>
      <button class="btn sutil icone" data-acao="prest-fechar" title="Fechar" aria-label="Fechar">${svg(ICO.x, 13)}</button>
    </div>
    <div class="inspetor-corpo">
      <div class="inspetor-secao"><h3>Contato</h3>${contato}</div>
      ${
        p.chavePix
          ? `<div class="inspetor-secao"><h3>PIX${pix ? ` · ${esc(pix.t)}` : ''}</h3>
          <div class="linha-pix"><code>${esc(p.chavePix)}</code>
          <button class="btn pequeno" data-acao="prest-copiar-pix" data-id="${esc(p.id)}">${svg(ICO.copiar, 13)}<span>Copiar PIX</span></button></div></div>`
          : ''
      }
      <div class="inspetor-secao"><h3>Números</h3><dl class="pares">
        ${par('Contratado', reais(r.contratado))}
        ${par('Pago', `${reais(r.pago)}${r.pagoLancamentos ? ` <span class="tinta3">${fmtMoney(r.pagoLancamentos, { dec: 0 })} por lançamento</span>` : ''}`)}
        ${par('A pagar', reais(r.aPagar))}
        ${r.medidoNaoPago > 0.005 ? par('Medido e não pago', reais(r.medidoNaoPago)) : ''}
      </dl></div>
      <div class="inspetor-secao"><h3>Obras</h3>${obras}</div>
      <div class="inspetor-secao"><h3>Últimos pagamentos</h3>${pagamentos}</div>
      <div class="inspetor-secao"><h3>Avaliação</h3>${avaliacao}</div>
      ${
        p.documento || forma || p.observacoes
          ? `<div class="inspetor-secao"><h3>Cadastro</h3><dl class="pares">
        ${par('CPF/CNPJ', esc(p.documento))}
        ${forma ? par('Contratação', `${esc(forma.t)}${p.valorReferencia ? ` · ${fmtMoney(p.valorReferencia)}` : ''}`) : ''}
      </dl>${p.observacoes ? `<p class="obs">${esc(p.observacoes)}</p>` : ''}</div>`
          : ''
      }
      ${
        somenteLeitura()
          ? ''
          : `<div class="inspetor-secao acoes-inspetor">
        ${botao('Editar', 'editar-prestador', { id: p.id }, 'btn')}
        ${
          p.arquivado
            ? botao('Desarquivar', 'prest-desarquivar', { id: p.id }, 'btn')
            : botao(
                r.temVinculo ? 'Arquivar' : 'Excluir',
                'excluir-prestador',
                { id: p.id },
                'btn sutil',
              )
        }
      </div>`
      }
    </div>
  </aside>`;
}

/* ------------------------------------------------------------------ tela */

VIEWS.prestadores = () => {
  const todos = Store.estado.prestadores;
  if (!todos.length) {
    return vazioTela({
      titulo: 'Nenhum prestador cadastrado',
      texto:
        'Cadastre quem trabalha nas suas obras para controlar o que foi contratado e pago a cada um.',
      acao: somenteLeitura()
        ? ''
        : botao('Cadastrar prestador', 'novo-prestador', {}, 'btn primario', 'mais'),
    });
  }
  const ds = dados();
  const sel = tela.selecao && acharPrestador(tela.selecao);
  return `<div class="tela-prestadores">
    <div class="tela-principal">
      ${barraFiltros(todos.filter((p) => !!p.arquivado === tela.arquivados))}
      ${lista({
        id: 'prestadores',
        testid: 'lista-prestadores',
        tabelaClasse: 'lista-prestadores',
        colunas: COLUNAS,
        itens: ds,
        ordemPadrao: { col: 'nome', dir: 1 },
        rodapeRotulo: (n) => `${n} prestadores`,
        linhaAttrs: (d) =>
          `data-acao="prest-selecionar" data-id="${esc(d.p.id)}" data-prestador="${esc(d.p.id)}"${d.p.id === tela.selecao ? ' aria-selected="true"' : ''}`,
        linhaClasse: () => 'clicavel',
      })}
    </div>
    ${sel ? inspetor(sel) : ''}
  </div>`;
};
VIEWS.prestadores.paineis = true;

VIEWS.prestadores.toolbar = () => {
  if (!Store.estado.prestadores.length) return '';
  return `${buscaToolbar('Buscar prestador', 'busca-prestadores')}
    ${somenteLeitura() ? '' : botao('<span class="rotulo-btn">Novo prestador</span>', 'novo-prestador', {}, 'btn primario', 'mais')}`;
};

/* ============================================================ formulário
   Sheet, não modal central. Três campos para cadastrar; o resto em "Mais
   detalhes". Erro por campo, em tempo real, só depois de tocar no campo. */

const CAMPOS_DETALHE = [
  'apelido',
  'telefone',
  'documento',
  'chavePix',
  'formaContratacao',
  'valorReferencia',
  'observacoes',
];
let form = null; // { p, novo, tocados:Set }

function campo(k, rotulo, controle, extra = '') {
  return `<div class="campo campo-prest" data-campo-prest="${k}">
    <label for="pf_${k}">${esc(rotulo)}</label>${controle}${extra}
    <span class="erro" data-erro="${k}" aria-live="polite"></span>
  </div>`;
}

function htmlForm(p, detalhes) {
  const v = (k) => esc(p[k] ?? '');
  const tel = (k) => (p[k] ? esc(formatarTelefoneBR(p[k])) : '');
  const opcoes = (lista, atual, vazio) =>
    `<option value="">${esc(vazio)}</option>${lista.map((o) => `<option value="${esc(o.v)}" ${o.v === atual ? 'selected' : ''}>${esc(o.t)}</option>`).join('')}`;
  const contatos =
    typeof navigator !== 'undefined' && navigator.contacts && 'select' in navigator.contacts;

  return `<div class="form-prest" data-form-prest="1">
    <div class="form-prest-avisos" data-avisos-prest></div>
    ${contatos ? `<button type="button" class="btn sutil pequeno importar-contato" data-acao="prest-importar-contato">${svg(ICO.contatos, 14)}Importar dos contatos</button>` : ''}
    ${campo('nome', 'Nome', `<input type="text" id="pf_nome" data-prest="nome" value="${v('nome')}" autocomplete="off" required>`)}
    ${campo(
      'especialidade',
      'Especialidade',
      `<input type="text" id="pf_especialidade" data-prest="especialidade" value="${v('especialidade')}"
        list="pf_lista_esp" autocomplete="off" placeholder="Pedreiro, Pintor…">
        <datalist id="pf_lista_esp">${(Store.estado.listas.especialidades || []).map((e) => `<option value="${esc(e)}"></option>`).join('')}</datalist>`,
    )}
    ${campo(
      'whatsapp',
      'WhatsApp',
      `<input type="tel" id="pf_whatsapp" data-prest="whatsapp" data-mascara="tel" inputmode="tel"
        autocomplete="tel" value="${tel('whatsapp')}" placeholder="(62) 99999-8888">`,
    )}

    <button type="button" class="btn-link mais-detalhes" data-acao="prest-mais-detalhes" aria-expanded="${detalhes}">
      ${detalhes ? 'Menos detalhes' : 'Mais detalhes'} <span class="tinta3">apelido, PIX, documento, contratação</span>
    </button>
    <div class="form-prest-mais" ${detalhes ? '' : 'hidden'}>
      ${campo('apelido', 'Como é chamado na obra', `<input type="text" id="pf_apelido" data-prest="apelido" value="${v('apelido')}" placeholder="opcional">`)}
      ${campo('telefone', 'Telefone alternativo', `<input type="tel" id="pf_telefone" data-prest="telefone" data-mascara="tel" inputmode="tel" value="${tel('telefone')}" placeholder="opcional">`)}
      <label class="check-linha"><input type="checkbox" data-prest="temWhatsapp" ${p.temWhatsapp !== false ? 'checked' : ''}> O número principal tem WhatsApp</label>
      ${campo('documento', 'CPF ou CNPJ', `<input type="text" id="pf_documento" data-prest="documento" inputmode="numeric" value="${v('documento')}" placeholder="opcional">`)}
      <div class="form-prest-par">
        ${campo('tipoPix', 'Tipo da chave PIX', `<select id="pf_tipoPix" data-prest="tipoPix">${opcoes(TIPOS_PIX, p.tipoPix, 'sem PIX')}</select>`)}
        ${campo('chavePix', 'Chave PIX', `<input type="text" id="pf_chavePix" data-prest="chavePix" value="${v('chavePix')}" autocomplete="off">`)}
      </div>
      <div class="form-prest-par">
        ${campo('formaContratacao', 'Forma de contratação', `<select id="pf_formaContratacao" data-prest="formaContratacao">${opcoes(FORMAS_CONTRATACAO, p.formaContratacao, 'não definida')}</select>`)}
        ${campo('valorReferencia', 'Valor de referência', `<input type="text" id="pf_valorReferencia" data-prest="valorReferencia" inputmode="decimal" value="${p.valorReferencia ? esc(String(p.valorReferencia).replace('.', ',')) : ''}" placeholder="R$ por diária, m²…">`)}
      </div>
      ${campo('observacoes', 'Observações', `<textarea id="pf_observacoes" data-prest="observacoes" rows="3">${v('observacoes')}</textarea>`)}
    </div>
  </div>`;
}

/* Lê o formulário no formato do cadastro: telefones só em dígitos. */
function lerFormPrest() {
  const cx = document.querySelector('[data-form-prest]');
  const out = {};
  if (!cx) return out;
  cx.querySelectorAll('[data-prest]').forEach((el) => {
    const k = el.dataset.prest;
    if (el.type === 'checkbox') out[k] = el.checked;
    else out[k] = String(el.value || '').trim();
  });
  for (const k of ['whatsapp', 'telefone']) {
    if (out[k]) out[k] = normalizarTelefoneBR(out[k]) || out[k];
  }
  out.valorReferencia = out.valorReferencia
    ? Number(String(out.valorReferencia).replace(/\./g, '').replace(',', '.')) || 0
    : 0;
  return out;
}

/* Mostra erro por campo (só nos tocados, ou em todos ao salvar) e o aviso
   de duplicidade no topo. Devolve quantos erros bloqueiam. */
function validarForm(todos = false) {
  if (!form) return 0;
  const d = { ...form.p, ...lerFormPrest() };
  const probs = validarPrestador(d, Store.estado.listas);
  document.querySelectorAll('[data-erro]').forEach((el) => {
    const k = el.dataset.erro;
    const p = probs.find((x) => x.campo === k && x.sev === 'erro');
    const mostrar = p && (todos || form.tocados.has(k));
    el.textContent = mostrar ? p.mensagem : '';
    el.closest('.campo-prest').classList.toggle('invalido', !!mostrar);
  });
  const avisos = document.querySelector('[data-avisos-prest]');
  if (avisos) {
    const dup = duplicadosPrestador(Store.estado, d);
    const esp = probs.find((x) => x.sev === 'alerta' && x.campo === 'especialidade');
    avisos.innerHTML = [
      ...dup.map(
        (x) =>
          `<div class="aviso-linha">Já existe <b>${esc(x.nome)}</b>${x.arquivado ? ' (arquivado)' : ''} com ${esc(x.motivos.join(' e '))}.</div>`,
      ),
      esp && form.tocados.has('especialidade')
        ? `<div class="aviso-linha discreto">${esc(esp.mensagem)}</div>`
        : '',
    ].join('');
  }
  return apenasErros(probs).length;
}

function abrirFormPrestador(p, novo, { foco = '' } = {}) {
  const detalhes =
    (!novo && CAMPOS_DETALHE.some((k) => p[k])) || (!!foco && CAMPOS_DETALHE.includes(foco));
  form = { p, novo, tocados: new Set() };
  abrirModal({
    titulo: novo ? 'Novo prestador' : 'Editar prestador',
    largura: 'sheet-prestador',
    corpo: htmlForm(p, detalhes),
    rodape: `<span class="esq"></span>
      <button class="btn" data-acao="fechar-modal">Cancelar</button>
      ${novo ? '<button class="btn" data-acao="prest-salvar" data-outro="1">Salvar e adicionar outro</button>' : ''}
      <button class="btn primario" data-acao="prest-salvar">Salvar</button>`,
  });
  if (foco)
    setTimeout(() => {
      const el = document.getElementById('pf_' + foco);
      if (el) el.focus();
    }, 40);
}

function salvarPrestador(outro) {
  if (!form) return;
  form.tocados = new Set(Object.keys(lerFormPrest()));
  if (validarForm(true)) {
    const primeiro = document.querySelector(
      '.campo-prest.invalido input, .campo-prest.invalido select',
    );
    if (primeiro) primeiro.focus();
    return;
  }
  const d = lerFormPrest();
  const { p, novo } = form;
  mutar((e) => {
    Object.assign(p, d);
    if (novo) e.prestadores.push(p);
    /* especialidade nova entra na lista — o alerta avisou */
    if (p.especialidade && !(e.listas.especialidades || []).includes(p.especialidade)) {
      e.listas.especialidades = [...(e.listas.especialidades || []), p.especialidade];
    }
  });
  toast(novo ? `${p.nome} cadastrado.` : 'Prestador atualizado.', 'ok');
  fecharModal();
  form = null;
  if (outro) abrirFormPrestador(novoPrestador(), true);
  else if (novo) {
    tela.selecao = p.id;
    App.renderConteudo();
  }
}

/* ============================================================== ações */

ACOES['novo-prestador'] = () => abrirFormPrestador(novoPrestador(), true);
ACOES['editar-prestador'] = (el, d) => {
  const p = acharPrestador(d.id);
  if (p) abrirFormPrestador(p, false, { foco: d.foco || '' });
};
ACOES['prest-salvar'] = (el, d) => salvarPrestador(d.outro === '1');
ACOES['prest-mais-detalhes'] = (el) => {
  const mais = document.querySelector('.form-prest-mais');
  if (!mais) return;
  mais.hidden = !mais.hidden;
  el.setAttribute('aria-expanded', String(!mais.hidden));
  el.firstChild.textContent = mais.hidden ? 'Mais detalhes ' : 'Menos detalhes ';
  if (!mais.hidden) {
    const a = document.getElementById('pf_apelido');
    if (a) a.focus();
  }
};

ACOES['prest-selecionar'] = (el, d) => {
  tela.selecao = tela.selecao === d.id ? '' : d.id;
  App.renderConteudo();
};
ACOES['prest-fechar'] = () => {
  tela.selecao = '';
  App.renderConteudo();
};
ACOES['prest-com-saldo'] = () => {
  tela.comSaldo = !tela.comSaldo;
  App.renderConteudo();
};
ACOES['prest-arquivados'] = () => {
  tela.arquivados = !tela.arquivados;
  tela.selecao = '';
  App.renderConteudo();
};
ACOES['prest-especialidade'] = (el) => {
  tela.especialidade = el.value;
  App.renderConteudo();
};
ACOES['prest-desarquivar'] = (el, d) => {
  const p = acharPrestador(d.id);
  if (!p) return;
  mutar(() => {
    p.arquivado = false;
  });
  toast(`${p.nome} voltou para a lista.`, 'ok');
};

/* Link externo dentro de linha clicável: abre ele, não seleciona a linha. */
ACOES['abrir-externo'] = (el) => {
  const href = el.getAttribute('href') || '';
  if (href.startsWith('tel:')) window.location.href = href;
  else window.open(href, '_blank', 'noopener');
};

ACOES['prest-copiar-pix'] = async (el, d) => {
  const p = acharPrestador(d.id);
  if (!p || !p.chavePix) return;
  try {
    await navigator.clipboard.writeText(p.chavePix);
  } catch (e) {
    const t = document.createElement('textarea');
    t.value = p.chavePix;
    document.body.appendChild(t);
    t.select();
    document.execCommand('copy');
    t.remove();
  }
  const rot = el.querySelector('span');
  if (rot) {
    rot.textContent = 'Copiado';
    el.classList.add('copiado');
    setTimeout(() => {
      rot.textContent = 'Copiar PIX';
      el.classList.remove('copiado');
    }, 1600);
  }
};

/* Contact Picker API — só existe no Chrome Android; o botão só aparece lá. */
ACOES['prest-importar-contato'] = async () => {
  try {
    const [c] = await navigator.contacts.select(['name', 'tel'], { multiple: false });
    if (!c) return;
    const nome = document.getElementById('pf_nome');
    const whats = document.getElementById('pf_whatsapp');
    if (nome && c.name && c.name[0]) nome.value = c.name[0];
    if (whats && c.tel && c.tel[0])
      whats.value = mascaraTelefone(normalizarTelefoneBR(c.tel[0])?.slice(2) || c.tel[0]);
    form && ['nome', 'whatsapp'].forEach((k) => form.tocados.add(k));
    validarForm();
  } catch (e) {
    /* o usuário cancelou a escolha */
  }
};

/* ---------------------------------------------- menus: mensagens e ⋯ */

function fecharMenuPrest() {
  const m = document.querySelector('.menu-prest');
  if (m) m.remove();
}

function abrirMenuEm(el, html) {
  fecharMenuPrest();
  const menu = document.createElement('div');
  menu.className = 'menu-ctx menu-prest';
  menu.setAttribute('role', 'menu');
  menu.innerHTML = html;
  document.body.appendChild(menu);
  const r = el.getBoundingClientRect();
  const m = menu.getBoundingClientRect();
  menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - m.width - 8)) + 'px';
  const abaixo = r.bottom + 4;
  menu.style.top =
    (abaixo + m.height > window.innerHeight - 8 ? r.top - m.height - 4 : abaixo) + 'px';
  const primeiro = menu.querySelector('a, button');
  if (primeiro) primeiro.focus();
}

ACOES['prest-mensagens'] = (el, d) => {
  const p = acharPrestador(d.id);
  if (!p) return;
  const vars = variaveisMensagem(p);
  const modelos = lerModelosMensagem(Store.estado.listas.mensagensWhatsapp);
  abrirMenuEm(
    el,
    modelos
      .map((m) => {
        const texto = preencherMensagem(m.texto, vars);
        return `<a role="menuitem" href="${esc(linkWhatsApp(p.whatsapp, texto))}" target="_blank" rel="noopener"
      data-acao="abrir-externo" title="${esc(texto)}">${esc(m.titulo)}</a>`;
      })
      .join('') +
      '<hr><button role="menuitem" data-acao="ir" data-view="ajustes">Editar mensagens…</button>',
  );
};

function menuLinha(p) {
  if (somenteLeitura()) return '';
  const r = resumoPrestador(Store.estado, p);
  return [
    `<button role="menuitem" data-acao="editar-prestador" data-id="${esc(p.id)}">${svg(ICO.lapis, 13)}Editar</button>`,
    p.whatsapp
      ? `<button role="menuitem" data-acao="prest-mensagens-do-menu" data-id="${esc(p.id)}">${svg(ICO.whatsapp, 13)}Mensagem pronta…</button>`
      : '',
    '<hr>',
    p.arquivado
      ? `<button role="menuitem" data-acao="prest-desarquivar" data-id="${esc(p.id)}">Desarquivar</button>`
      : `<button role="menuitem" data-acao="excluir-prestador" data-id="${esc(p.id)}">${r.temVinculo ? 'Arquivar' : 'Excluir'}</button>`,
  ].join('');
}

ACOES['prest-menu'] = (el, d) => {
  const p = acharPrestador(d.id);
  if (p) abrirMenuEm(el, menuLinha(p));
};
ACOES['prest-mensagens-do-menu'] = (el, d) => {
  const alvo =
    document.querySelector(`[data-acao="prest-mensagens"][data-id="${CSS.escape(d.id)}"]`) || el;
  setTimeout(() => ACOES['prest-mensagens'](alvo, d));
};

document.addEventListener('contextmenu', (ev) => {
  if (App.rota.view !== 'prestadores') return;
  const tr = ev.target.closest('tr[data-prestador]');
  if (!tr || somenteLeitura()) return;
  ev.preventDefault();
  const p = acharPrestador(tr.dataset.prestador);
  if (!p) return;
  fecharMenuPrest();
  const menu = document.createElement('div');
  menu.className = 'menu-ctx menu-prest';
  menu.setAttribute('role', 'menu');
  menu.innerHTML = menuLinha(p);
  document.body.appendChild(menu);
  const m = menu.getBoundingClientRect();
  menu.style.left = Math.min(ev.clientX, window.innerWidth - m.width - 8) + 'px';
  menu.style.top = Math.min(ev.clientY, window.innerHeight - m.height - 8) + 'px';
});
document.addEventListener('mousedown', (ev) => {
  if (!ev.target.closest('.menu-prest, [data-acao="prest-menu"], [data-acao="prest-mensagens"]'))
    fecharMenuPrest();
});
document.addEventListener(
  'click',
  (ev) => {
    if (ev.target.closest('.menu-prest a, .menu-prest button')) setTimeout(fecharMenuPrest);
  },
  true,
);
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && document.querySelector('.menu-prest')) {
    ev.stopPropagation();
    fecharMenuPrest();
  }
});

/* ------------------------------------------ digitação no formulário */

document.addEventListener('input', (ev) => {
  const el = ev.target;
  if (!el.dataset || !el.dataset.prest || !form) return;
  if (el.dataset.mascara === 'tel') {
    const fim = el.selectionStart === el.value.length;
    el.value = mascaraTelefone(el.value);
    if (fim) el.setSelectionRange(el.value.length, el.value.length);
  }
  form.tocados.add(el.dataset.prest);
  validarForm();
});
/* Sair de um campo preenchido mostra o erro dele. Sair de um campo VAZIO
   não: o foco automático no Nome, seguido de um toque no WhatsApp, não
   pode gritar "precisa de um nome" — isso fica para a hora de salvar. */
document.addEventListener('focusout', (ev) => {
  const el = ev.target;
  if (!el.dataset || !el.dataset.prest || !form || !String(el.value || '').trim()) return;
  form.tocados.add(el.dataset.prest);
  validarForm();
});
document.addEventListener('keydown', (ev) => {
  const el = ev.target;
  if (ev.key !== 'Enter' || !form || !el.dataset || !el.dataset.prest || el.tagName === 'TEXTAREA')
    return;
  ev.preventDefault();
  salvarPrestador(false);
});

/* ============================================== revisão de nomes
   Prévia de "WESLEY PINTOR" → Wesley · Wesley Pintor · Pintor. Nada muda
   sem a pessoa marcar e confirmar. */

function sugestoes() {
  const esp = Store.estado.listas.especialidades || [];
  return Store.estado.prestadores
    .filter((p) => !p.arquivado)
    .map((p) => sugestaoNomePrestador(p, esp))
    .filter(Boolean);
}

ACOES['prest-revisar-nomes'] = () => {
  const lista = sugestoes();
  if (!lista.length) return toast('Nenhum nome para revisar.', 'ok');
  const fmt = (x) =>
    [
      x.nome && `<b>${esc(x.nome)}</b>`,
      x.apelido && `<span class="tinta2">${esc(x.apelido)}</span>`,
      x.especialidade && `<span class="tinta2">${esc(x.especialidade)}</span>`,
    ]
      .filter(Boolean)
      .join(' · ');
  abrirModal({
    titulo: 'Revisar nomes de prestadores',
    largura: 'sheet-prestador',
    corpo: `<p class="tinta2" style="margin:0 0 12px;font-size:var(--t-peq)">Nomes em caixa alta viram nome de gente; a especialidade
        escrita junto ao nome vai para o campo certo, e o nome completo fica como apelido. Desmarque o que não quiser mudar.</p>
      <ul class="revisao-nomes">${lista
        .map(
          (s) => `<li><label>
        <input type="checkbox" data-sugestao="${esc(s.id)}" checked>
        <span class="revisao-antes">${esc(s.antes.nome)}</span>
        <span class="revisao-depois">${fmt(s.depois)}</span>
      </label></li>`,
        )
        .join('')}</ul>`,
    rodape: `<span class="esq"></span><button class="btn" data-acao="fechar-modal">Cancelar</button>
      <button class="btn primario" data-acao="prest-aplicar-nomes">Aplicar marcados</button>`,
  });
};

ACOES['prest-aplicar-nomes'] = () => {
  const marcados = new Set(
    [...document.querySelectorAll('[data-sugestao]:checked')].map((el) => el.dataset.sugestao),
  );
  const lista = sugestoes().filter((s) => marcados.has(s.id));
  if (!lista.length) return fecharModal();
  mutar((e) => {
    lista.forEach((s) => {
      const p = e.prestadores.find((x) => x.id === s.id);
      if (p) Object.assign(p, s.depois);
      if (
        s.depois.especialidade &&
        !(e.listas.especialidades || []).includes(s.depois.especialidade)
      ) {
        e.listas.especialidades = [...(e.listas.especialidades || []), s.depois.especialidade];
      }
    });
  });
  fecharModal();
  toast(
    `${lista.length} nome${lista.length > 1 ? 's' : ''} ajustado${lista.length > 1 ? 's' : ''}.`,
    'ok',
  );
  App.render();
};

/* ======================================== avaliação ao concluir contrato
   Chamado por formContrato (acoes.js) quando um contrato ligado a um
   prestador passa a Concluído. Opcional: "Agora não" fecha sem gravar. */

let avaliando = null;

ACOES['avaliar-contrato'] = (el, d) => {
  const obra = Store.estado.obras.find((o) => o.id === d.obra);
  const c = obra && obra.contratos.find((x) => x.id === d.id);
  const p = c && c.prestadorId && acharPrestador(c.prestadorId);
  if (!p) return;
  avaliando = {
    c,
    notas: {
      avalPrazo: c.avalPrazo || 0,
      avalQualidade: c.avalQualidade || 0,
      avalOrganizacao: c.avalOrganizacao || 0,
    },
  };
  const linha = ([k, rotulo]) => `<div class="aval-linha"><span>${rotulo}</span>
    <span class="segmentado" role="radiogroup" aria-label="${rotulo}">${[1, 2, 3, 4, 5]
      .map(
        (n) =>
          `<button type="button" role="radio" aria-checked="${avaliando.notas[k] === n}" data-acao="prest-nota" data-k="${k}" data-n="${n}">${n}</button>`,
      )
      .join('')}</span></div>`;
  abrirModal({
    titulo: `Como foi o trabalho de ${comoChamar(p)}?`,
    largura: 'estreito',
    corpo: `<p class="tinta2" style="margin:0 0 12px;font-size:var(--t-peq)">${esc(c.codigo)} · ${esc(c.escopo || obra.nome)} foi concluído.
        De 1 a 5 — é opcional, e vira a média dele na lista de prestadores.</p>
      <div class="aval-form">${CRITERIOS_AVAL.map(linha).join('')}</div>`,
    rodape: `<span class="esq"></span><button class="btn" data-acao="fechar-modal">Agora não</button>
      <button class="btn primario" data-acao="prest-salvar-aval">Salvar avaliação</button>`,
  });
};

ACOES['prest-nota'] = (el, d) => {
  if (!avaliando) return;
  avaliando.notas[d.k] = Number(d.n);
  el.parentElement
    .querySelectorAll('button')
    .forEach((b) => b.setAttribute('aria-checked', String(b === el)));
};

ACOES['prest-salvar-aval'] = () => {
  if (!avaliando) return fecharModal();
  const { c, notas } = avaliando;
  mutar(() => {
    Object.assign(c, notas);
  });
  avaliando = null;
  fecharModal();
  toast('Avaliação registrada.', 'ok');
};

export { tela };
