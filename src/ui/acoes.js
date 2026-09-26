/**
 * acoes.js — Ações: tudo que um clique dispara — abrir formulário, salvar, excluir.
 */
import { addDias, diasEntre, esc, fmtData, fmtMoney, fmtNum, fonteImagem, hojeISO, isISO, lerEfetivoFuncoes, norm, novaEtapaCronograma, novaMedicao, novaObra, novoCliente, novoContrato, novoDiario, novoLancamento, novoMaterial, novoPrestador, novoRecebimento, num, textoEfetivoFuncoes, uid } from '../nucleo/base.js';
import { alertasObra, efeitoDiarioNaEtapa, efetivoDiario, contratoTotalAutorizado, contratoTotalPago, contratoValor, etapaCalc, lancamentoTotal, listaProtegida, recebimentoDoFinanciamento, materialCalc, medicaoAlerta, resumoPrestador, unidadeSugeridaEtapa, usoItensLista } from '../dominio/calculos.js';
import { apenasErros, validarCliente, validarContrato, validarDependencias, validarDiario, validarEtapasContrato, validarEtapa, validarLancamento, validarLogo, validarMaterial, validarMedicao, validarObra, validarPrestador, validarRecebimento } from '../dominio/validacao.js';
import { Store, mutar } from '../dados/store.js';
import { SUPA } from '../dados/supabase.js';
import { App, VIEWS_OBRA, abrirForm, abrirModal, confirmar, confirmarDigitando, fecharModal, lerForm, modalAoSalvar, modalValidar, mostrarAvisosForm, opcoesEtapas, opcoesLista, partesNomeObra, toast } from './shell.js';
import { carregarAuditoria, implExpandida } from './telas-obra.js';
import { campoAnexo, comprimirImagem, htmlAnexo } from './anexos.js';

const ACOES = {};

/* ------------------------------------------------------- navegação */
/* Na carteira ("Todas as obras"), uma tela de obra sem obra escolhida
   abre o seletor em vez de cair, calada, na última obra lembrada; a
   escolha leva à tela pedida. */
let viewPendente = '';
ACOES.ir = (el, d) => {
  if (
    App.rota.view === 'carteira' && !d.obra && VIEWS_OBRA.has(d.view) &&
    Store.estado.obras.length > 1 && el && el.closest && el.closest('#rail')
  ) {
    const botaoObra = document.querySelector('[data-acao="obra-menu"]');
    if (botaoObra) {
      viewPendente = d.view;
      ACOES['obra-menu'](botaoObra);
      return;
    }
  }
  App.ir(d.view, d.obra);
};

/* ---------------------------------- cartão de implantação (Painel) */
ACOES['impl-toggle'] = (el, d) => {
  const id = d.obra || (App.obra() && App.obra().id);
  if (!id) return;
  if (implExpandida.has(id)) implExpandida.delete(id);
  else implExpandida.add(id);
  App.renderConteudo();
};

ACOES['ir-alertas-carteira'] = () => {
  const o = Store.estado.obras.find((x) => alertasObra(x).some((a) => a.sev === 3)) || Store.estado.obras[0];
  App.ir('alertas', o && o.id);
};
ACOES.menu = () => {
  if (window.innerWidth > 860) {
    const oculto = document.body.classList.toggle('rail-recolhido');
    try { localStorage.setItem('souz_rail', oculto ? '1' : ''); } catch (e) { /* privado */ }
  } else {
    document.body.classList.toggle('menu-aberto');
  }
};
ACOES['recarregar-auditoria'] = () => {
  const o = App.obra();
  if (o) { carregarAuditoria(o.id, true); App.renderConteudo(); }
};
ACOES.tema = () => {
  /* Sem escolha gravada, o sistema segue a preferência do aparelho. O botão
     alterna a partir do que está na tela agora, não de um padrão fixo. */
  const html = document.documentElement;
  const escolhido = html.getAttribute('data-theme');
  const escuroAgora = escolhido
    ? escolhido === 'dark'
    : window.matchMedia('(prefers-color-scheme: dark)').matches;
  const novo = escuroAgora ? 'light' : 'dark';
  html.setAttribute('data-theme', novo);
  try { localStorage.setItem('souz_tema', novo); } catch (e) { /* navegação privada */ }
};
ACOES['fechar-modal'] = () => fecharModal();
ACOES.imprimir = () => window.print();

ACOES['confirmar-ok'] = () => {
  const fn = modalAoSalvar;
  fecharModal();
  if (fn) fn();
};

/* Só confirma se o texto digitado bate (sem diferença de maiúscula,
   acento ou espaço nas pontas). */
ACOES['confirmar-digitado'] = () => {
  const campo = document.getElementById('f_confirma');
  if (!campo) return;
  if (norm(campo.value.trim()) !== norm(campo.dataset.confirma.trim())) {
    campo.focus();
    toast('O texto digitado não confere.', 'aviso');
    return;
  }
  const fn = modalAoSalvar;
  fecharModal();
  if (fn) fn();
};

ACOES['salvar-form'] = () => {
  const dados = lerForm();
  const fn = modalAoSalvar;
  if (!fn) return;
  if (modalValidar) {
    const problemas = modalValidar(dados) || [];
    const bloqueios = mostrarAvisosForm(problemas);
    if (bloqueios) {
      toast(`Corrija ${bloqueios === 1 ? 'o campo destacado' : `os ${bloqueios} campos destacados`} para salvar.`, 'critico');
      return;
    }
  }
  fn(dados);
};

/* ============================================================== OBRA */
function formObra(obra, aoConcluir) {
  const clientes = Store.estado.clientes.map((c) => ({ v: c.id, t: c.nome }));
  abrirForm({
    titulo: obra.id && Store.estado.obras.some((o) => o.id === obra.id) ? 'Editar obra' : 'Nova obra',
    campos: [
      { k: 'nome', label: 'Nome da obra', tipo: 'texto', col: 6, obrigatorio: true, placeholder: 'Casa 12 — Residencial Aurora' },
      { k: 'clienteId', label: 'Cliente', tipo: 'select', opcoes: clientes, col: 3, placeholder: 'sem cliente' },
      { k: 'status', label: 'Situação', tipo: 'select', opcoes: opcoesLista('statusObra'), col: 3, vazio: false },
      { k: 'cidade', label: 'Cidade/UF', tipo: 'texto', col: 4 },
      { k: 'endereco', label: 'Endereço', tipo: 'texto', col: 8 },
      { k: 'areaConstruida', label: 'Área construída (m²)', tipo: 'numero', col: 3 },
      { k: 'precoEmpreitadaM2', label: 'Preço empreitada/m²', tipo: 'dinheiro', col: 3 },
      { k: 'dataInicio', label: 'Início', tipo: 'data', col: 3 },
      { k: 'previsaoConclusao', label: 'Data contratual de entrega', tipo: 'data', col: 3 },
      { k: 'valorFinanciado', label: 'Financiado para obra', tipo: 'dinheiro', col: 4 },
      { k: 'valorVenda', label: 'Valor de venda', tipo: 'dinheiro', col: 4 },
      { k: 'saldoInicial', label: 'Saldo inicial em caixa', tipo: 'dinheiro', col: 4 },
      { k: 'contrato', label: 'Contrato de empreitada', tipo: 'calc', col: 12 }
    ],
    valores: {
      nome: obra.nome, clienteId: obra.clienteId, status: obra.status, cidade: obra.cidade,
      endereco: obra.endereco, areaConstruida: obra.areaConstruida, dataInicio: obra.dataInicio,
      previsaoConclusao: obra.previsaoConclusao, precoEmpreitadaM2: obra.fin.precoEmpreitadaM2,
      valorFinanciado: obra.fin.valorFinanciado, valorVenda: obra.fin.valorVenda, saldoInicial: obra.fin.saldoInicial
    },
    calcular: (d) => ({
      contrato: `Empreitada principal calculada: <b>${fmtMoney(num(d.areaConstruida) * num(d.precoEmpreitadaM2))}</b>
        (${fmtNum(d.areaConstruida, 2)} m² × ${fmtMoney(d.precoEmpreitadaM2)}/m²)`
    }),
    validar: (d) => validarObra(d),
    aoSalvar: (d) => {
      if (!d.nome) return toast('Informe o nome da obra.', 'aviso');
      Object.assign(obra, {
        nome: d.nome, clienteId: d.clienteId, status: d.status || 'Planejada', cidade: d.cidade,
        endereco: d.endereco, areaConstruida: d.areaConstruida, dataInicio: d.dataInicio,
        previsaoConclusao: d.previsaoConclusao
      });
      Object.assign(obra.fin, {
        precoEmpreitadaM2: d.precoEmpreitadaM2, valorFinanciado: d.valorFinanciado,
        valorVenda: d.valorVenda, saldoInicial: d.saldoInicial
      });
      fecharModal();
      aoConcluir(obra);
    }
  });
}

/* Teto de obras da conta (definido pelo admin). O banco também recusa,
   mas aqui a mensagem é clara e a obra não chega a ser criada. */
function limiteObrasAtingido() {
  const restantes = SUPA.obrasRestantes(Store.estado.obras.length);
  if (restantes !== null && restantes <= 0) {
    toast(`Sua conta permite ${SUPA.limiteObras} obra${SUPA.limiteObras === 1 ? '' : 's'}. Fale com o administrador para aumentar.`, 'aviso', 6000);
    return true;
  }
  return false;
}

ACOES['nova-obra'] = () => {
  if (limiteObrasAtingido()) return;
  const obra = novaObra('');
  formObra(obra, (o) => {
    mutar((e) => { e.obras.push(o); });
    App.ir('obra-config', o.id);
    toast('Obra criada. Ajuste os dados e cadastre o contrato principal.', 'ok');
  });
};


ACOES['duplicar-obra'] = () => {
  if (limiteObrasAtingido()) return;
  const o = App.obra();
  confirmar('Duplicar obra', `Criar uma cópia de "${o.nome}" com contratos, cronograma e plano de materiais, sem medições, recebimentos e lançamentos?`, () => {
    const copia = JSON.parse(JSON.stringify(o));
    copia.id = uid('obra');
    copia.nome = o.nome + ' (cópia)';
    copia.medicoes = []; copia.recebimentos = []; copia.lancamentos = []; copia.diario = [];
    copia.contratos.forEach((c) => { c.id = uid('ct'); });
    copia.materiais.forEach((m) => { m.id = uid('mat'); });
    copia.cronograma.forEach((e) => {
      e.id = uid('cr'); e.inicioReal = ''; e.fimReal = ''; e.progresso = 0; e.quantidadeExecutada = 0;
    });
    copia.status = 'Planejada';
    mutar((e) => { e.obras.push(copia); });
    App.ir('painel', copia.id);
    toast('Obra duplicada.', 'ok');
  }, 'Duplicar');
};

ACOES['excluir-obra'] = () => {
  const o = App.obra();
  confirmar('Excluir obra', `Excluir "${o.nome}" e todos os seus lançamentos? Esta ação não pode ser desfeita.`, () => {
    mutar((e) => { e.obras = e.obras.filter((x) => x.id !== o.id); });
    App.rota.obraId = '';
    App.ir('carteira');
    toast('Obra excluída.', 'aviso');
  });
};

/* Menu do seletor de obra: cada obra em duas linhas, como no botão. */
function fecharMenuObra() {
  viewPendente = '';
  const m = document.querySelector('.menu-obra');
  if (m) m.remove();
  const b = document.querySelector('[data-acao="obra-menu"]');
  if (b) b.setAttribute('aria-expanded', 'false');
}
ACOES['obra-menu'] = (el) => {
  if (document.querySelector('.menu-obra')) return fecharMenuObra();
  const naCarteira = App.rota.view === 'carteira';
  const item = (id, l1, l2, marcado) => `<button role="menuitemradio" aria-checked="${marcado}"
      data-acao="trocar-obra-id" data-obra="${esc(id)}"><span class="item-duplo"><b>${esc(l1)}</b>${l2 ? `<span>${esc(l2)}</span>` : ''}</span></button>`;
  const menu = document.createElement('div');
  menu.className = 'menu-ctx menu-obra';
  menu.setAttribute('role', 'menu');
  menu.innerHTML = [
    item('', 'Todas as obras', 'visão da carteira', naCarteira),
    '<hr>',
    ...Store.estado.obras.map((o) => {
      const [l1, l2] = partesNomeObra(o);
      return item(o.id, l1, l2, !naCarteira && o.id === App.rota.obraId);
    }),
  ].join('');
  document.body.appendChild(menu);
  const r = el.getBoundingClientRect();
  menu.style.left = r.left + 'px';
  menu.style.top = r.bottom + 4 + 'px';
  menu.style.minWidth = r.width + 'px';
  el.setAttribute('aria-expanded', 'true');
  const atual = menu.querySelector('[aria-checked="true"]') || menu.querySelector('button');
  if (atual) atual.focus();
};
ACOES['trocar-obra-id'] = (el, d) => {
  const pedida = viewPendente;
  fecharMenuObra();
  viewPendente = pedida;
  ACOES['trocar-obra']({ value: d.obra || '' });
};
document.addEventListener('mousedown', (ev) => {
  if (!ev.target.closest('.menu-obra, [data-acao="obra-menu"]')) fecharMenuObra();
});
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && document.querySelector('.menu-obra')) fecharMenuObra();
});

ACOES['trocar-obra'] = (el) => {
  /* "Todas as obras" leva à carteira; a obra ativa continua lembrada
     para quando se entrar numa tela de obra. */
  const pedida = viewPendente;
  viewPendente = '';
  if (!el.value) return App.ir('carteira');
  App.rota.obraId = el.value;
  App.ir(pedida || (VIEWS_OBRA.has(App.rota.view) ? App.rota.view : 'painel'), el.value);
};

/* ------------------------------------------------------ menu da conta */
function fecharMenuConta() {
  const m = document.querySelector('.menu-conta');
  if (m) m.remove();
  const b = document.querySelector('[data-acao="conta-menu"]');
  if (b) b.setAttribute('aria-expanded', 'false');
}

ACOES['conta-menu'] = (el) => {
  if (document.querySelector('.menu-conta')) return fecharMenuConta();
  const html = document.documentElement;
  const escolhido = html.getAttribute('data-theme');
  const escuro = escolhido ? escolhido === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  const logado = Store.backend === 'supabase' && SUPA.usuario;

  const menu = document.createElement('div');
  menu.className = 'menu-ctx menu-conta';
  menu.setAttribute('role', 'menu');
  menu.innerHTML = `
    ${logado ? `<div class="menu-rotulo">${esc(SUPA.usuario.email || '')}</div><hr>` : ''}
    <button role="menuitem" data-acao="tema">Usar tema ${escuro ? 'claro' : 'escuro'}</button>
    ${logado ? '<hr><button role="menuitem" data-acao="auth-sair">Sair</button>' : ''}`;
  document.body.appendChild(menu);

  /* Abre para cima, alinhado ao botão — ele fica no rodapé da lateral. */
  const r = el.getBoundingClientRect();
  menu.style.left = Math.max(8, r.left) + 'px';
  menu.style.bottom = window.innerHeight - r.top + 4 + 'px';
  el.setAttribute('aria-expanded', 'true');
  const primeiro = menu.querySelector('button');
  if (primeiro) primeiro.focus();
};

/* Fecha ao clicar fora, ao escolher um item e com Esc. */
document.addEventListener('mousedown', (ev) => {
  if (!ev.target.closest('.menu-conta, [data-acao="conta-menu"]')) fecharMenuConta();
});
document.addEventListener(
  'click',
  (ev) => {
    if (ev.target.closest('.menu-conta button')) setTimeout(fecharMenuConta);
  },
  true,
);
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && document.querySelector('.menu-conta')) fecharMenuConta();
});

/* Prestadores para escolher num contrato ou lançamento: os ativos, mais o
   que já está no registro (mesmo arquivado — não pode sumir da edição). */
function opcoesPrestador(atualId) {
  return Store.estado.prestadores
    .filter((p) => !p.arquivado || p.id === atualId)
    .slice()
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt'))
    .map((p) => ({ v: p.id, t: p.apelido && p.apelido !== p.nome ? `${p.nome} (${p.apelido})` : p.nome }));
}

/* Guarda também o nome no campo de texto antigo: relatórios e telas que
   ainda leem o nome continuam certos. Sem escolha, o texto antigo fica. */
function nomeDoPrestador(id, textoAntigo) {
  const p = id && Store.estado.prestadores.find((x) => x.id === id);
  return p ? p.nome : textoAntigo || '';
}

/* ========================================================= CONTRATOS */
function formContrato(c, novo, aoSalvar) {
  const o = App.obra();
  const bases = [...new Set(o.contratos.map((x) => x.codigoBase).filter(Boolean))];
  abrirForm({
    titulo: novo ? (c.registro === 'Aditivo' ? 'Novo aditivo' : 'Novo contrato') : 'Editar registro contratual',
    largura: 'largo',
    campos: [
      { secao: 'Identificação' },
      { k: 'codigo', label: 'Código', tipo: 'texto', col: 3, obrigatorio: true, dica: 'ex.: CT-002 ou CT-001-A1' },
      { k: 'codigoBase', label: 'Código-base', tipo: 'lista', opcoes: bases, col: 3, obrigatorio: true, dica: 'liga o aditivo ao contrato' },
      { k: 'registro', label: 'Tipo de registro', tipo: 'select', opcoes: ['Contrato', 'Aditivo'], col: 3, vazio: false },
      { k: 'status', label: 'Status', tipo: 'select', opcoes: opcoesLista('statusContrato'), col: 3, vazio: false },
      { k: 'prestadorId', label: 'Prestador', tipo: 'select', opcoes: opcoesPrestador(c.prestadorId), col: 6,
        placeholder: 'sem prestador',
        dica: !c.prestadorId && c.prestador ? `Digitado antes como "${c.prestador}" — escolha o cadastro.` : '' },
      { k: 'escopo', label: 'Escopo', tipo: 'texto', col: 6, placeholder: 'Empreitada principal, muro frontal…' },
      { secao: 'Valor' },
      { k: 'regime', label: 'Regime', tipo: 'select', opcoes: opcoesLista('regimes'), col: 3, vazio: false },
      { k: 'quantidade', label: 'Quantidade', tipo: 'numero', col: 2 },
      { k: 'unidade', label: 'Unidade', tipo: 'select', opcoes: opcoesLista('unidades'), col: 2, vazio: false },
      { k: 'precoUnitario', label: 'Preço unitário', tipo: 'dinheiro', col: 2 },
      { k: 'valorInformado', label: 'Valor fechado', tipo: 'dinheiro', col: 3, dica: 'se preenchido, prevalece' },
      { k: 'incluiMaterial', label: 'Inclui material?', tipo: 'check', col: 3 },
      { k: 'valor', label: 'Valor do registro', tipo: 'calc', col: 12 },
      { secao: 'Prazo' },
      { k: 'inicioPrevisto', label: 'Início previsto', tipo: 'data', col: 3 },
      { k: 'fimPrevisto', label: 'Fim previsto', tipo: 'data', col: 3 },
      /* etapas que ele executa (0016): o físico do contrato sai delas */
      { k: 'etapas', label: 'Etapas que este contrato executa', tipo: 'multi', col: 12,
        opcoes: [...new Set(o.cronograma.map((e) => e.etapa).filter(Boolean))],
        dica: 'base do "medido × físico": medir mais de 5 p.p. à frente do físico vira pendência' },
      { secao: 'Observações' },
      { k: 'observacoes', label: 'Observações', tipo: 'area', col: 12 }
    ],
    valores: c,
    calcular: (d) => {
      const v = num(d.valorInformado) > 0 ? num(d.valorInformado) : num(d.quantidade) * num(d.precoUnitario);
      const outros = o.contratos.filter((x) => x.codigoBase === d.codigoBase && x.id !== c.id && x.status !== 'Cancelado')
        .reduce((s, x) => s + contratoValor(x), 0);
      const pago = contratoTotalPago(o, d.codigoBase);
      return {
        valor: `Valor deste registro: <b>${fmtMoney(v)}</b> · total autorizado do ${esc(d.codigoBase || 'contrato')}: <b>${fmtMoney(outros + v)}</b>
          · já pago em medições: ${fmtMoney(pago)} · saldo: <b>${fmtMoney(outros + v - pago)}</b>`
      };
    },
    validar: (d) => [...validarContrato(d), ...validarEtapasContrato(d, o.cronograma)],
    aoSalvar: (d) => {
      if (!d.codigo) return toast('Informe o código do contrato.', 'aviso');
      if (!d.codigoBase) d.codigoBase = d.codigo;
      d.prestador = nomeDoPrestador(d.prestadorId, c.prestador);
      const statusAntes = c.status;
      Object.assign(c, d);
      fecharModal();
      aoSalvar(c);
      /* Concluiu um contrato com prestador e ainda sem nota? Pede a
         avaliação (opcional) — telas/prestadores.js cuida do resto. */
      const semNota = !(c.avalPrazo || c.avalQualidade || c.avalOrganizacao);
      if (c.status === 'Concluído' && statusAntes !== 'Concluído' && c.prestadorId && semNota && ACOES['avaliar-contrato']) {
        setTimeout(() => ACOES['avaliar-contrato'](null, { obra: o.id, id: c.id }), 60);
      }
    }
  });
}

ACOES['novo-contrato'] = () => {
  const o = App.obra();
  const c = novoContrato();
  const n = o.contratos.filter((x) => x.registro === 'Contrato').length + 1;
  c.codigo = 'CT-' + String(n).padStart(3, '0');
  c.codigoBase = c.codigo;
  if (n === 1) {
    c.escopo = 'Empreitada principal';
    c.regime = 'R$/m²';
    c.unidade = 'm²';
    c.quantidade = num(o.areaConstruida);
    c.precoUnitario = num(o.fin.precoEmpreitadaM2);
    c.incluiMaterial = 'Sim';
    c.inicioPrevisto = o.dataInicio;
    c.fimPrevisto = o.previsaoConclusao;
    c.status = 'Em andamento';
  }
  formContrato(c, true, () => { mutar(() => { o.contratos.push(c); }); toast('Contrato cadastrado.', 'ok'); });
};

ACOES['novo-aditivo'] = (el, d) => {
  const o = App.obra();
  const base = d.base || (o.contratos[0] && o.contratos[0].codigoBase) || '';
  const c = novoContrato();
  c.registro = 'Aditivo';
  c.codigoBase = base;
  const n = o.contratos.filter((x) => x.codigoBase === base && x.registro === 'Aditivo').length + 1;
  c.codigo = base + '-A' + n;
  c.status = 'Em andamento';
  const principal = o.contratos.find((x) => x.codigoBase === base && x.registro === 'Contrato');
  if (principal) c.prestador = principal.prestador;
  formContrato(c, true, () => { mutar(() => { o.contratos.push(c); }); toast('Aditivo cadastrado.', 'ok'); });
};

/* Excluir mora DENTRO da edição: a lixeira ao lado do lápis, na linha, era
   um toque errado de distância (luva, dedo sujo, sol). Na tela de toque a
   lixeira da linha some (interface.css) e este botão é o caminho. */
function comExcluir(tipo, id) {
  if (Store.somenteLeitura()) return;
  const esq = document.querySelector('#modal-camada footer .esq');
  if (!esq) return;
  esq.innerHTML = `<button class="btn perigo" data-acao="excluir-${tipo}" data-id="${esc(id)}">Excluir</button>`;
}

ACOES['editar-contrato'] = (el, d) => {
  const o = App.obra();
  const c = o.contratos.find((x) => x.id === d.id);
  if (!c) return;
  formContrato(c, false, () => { mutar(() => {}); toast('Contrato atualizado.', 'ok'); });
  comExcluir('contrato', c.id);
};

ACOES['excluir-contrato'] = (el, d) => {
  const o = App.obra();
  const c = o.contratos.find((x) => x.id === d.id);
  confirmar('Excluir registro contratual', `Excluir ${c.codigo} — ${c.escopo || 'sem escopo'}?`, () => {
    mutar(() => { o.contratos = o.contratos.filter((x) => x.id !== d.id); });
    toast('Registro excluído.', 'aviso');
  });
};

/* ========================================================== MEDIÇÕES */
function formMedicao(m, novo, aoSalvar) {
  const o = App.obra();
  const bases = [...new Set(o.contratos.map((c) => c.codigoBase).filter(Boolean))];
  abrirForm({
    titulo: novo ? 'Nova medição' : 'Editar medição',
    largura: 'largo',
    campos: [
      { k: 'contratoBase', label: 'Contrato', tipo: 'select', opcoes: bases, col: 4, obrigatorio: true, vazio: false },
      { k: 'numero', label: 'Nº da medição', tipo: 'texto', col: 2 },
      { k: 'data', label: 'Data da medição', tipo: 'data', col: 3 },
      { k: 'progresso', label: 'Progresso acumulado (%)', tipo: 'pct', col: 3 },
      { k: 'descricao', label: 'Descrição / período', tipo: 'texto', col: 12, placeholder: 'Fundação e baldrame — 1ª a 3ª semana' },
      { k: 'valorMedido', label: 'Valor medido', tipo: 'dinheiro', col: 3, obrigatorio: true },
      { k: 'desconto', label: 'Desconto / retenção', tipo: 'dinheiro', col: 3 },
      { k: 'valorPago', label: 'Valor pago', tipo: 'dinheiro', col: 3 },
      { k: 'dataPagamento', label: 'Data do pagamento', tipo: 'data', col: 3 },
      { k: 'status', label: 'Status', tipo: 'select', opcoes: opcoesLista('statusPagamento'), col: 3, vazio: false },
      { k: 'documento', label: 'Documento / recibo', tipo: 'texto', col: 4 },
      { k: 'resumo', label: 'Conferência', tipo: 'calc', col: 12 }
    ],
    valores: m,
    calcular: (d) => {
      const liq = Math.max(0, num(d.valorMedido) - num(d.desconto));
      const autorizado = contratoTotalAutorizado(o, d.contratoBase);
      const pagoOutras = o.medicoes.filter((x) => x.contratoBase === d.contratoBase && x.id !== m.id && x.status !== 'Cancelado')
        .reduce((s, x) => s + num(x.valorPago), 0);
      const saldo = autorizado - pagoOutras - num(d.valorPago);
      let aviso = '';
      if (num(d.valorPago) > liq + 0.005) aviso = ' <b style="color:var(--critico)">· pagamento acima do líquido medido</b>';
      else if (saldo < -0.005) aviso = ' <b style="color:var(--critico)">· ultrapassa o contrato autorizado</b>';
      return {
        resumo: `Líquido medido: <b>${fmtMoney(liq)}</b> · autorizado no contrato: ${fmtMoney(autorizado)}
          · já pago: ${fmtMoney(pagoOutras)} · saldo após esta medição: <b>${fmtMoney(saldo)}</b>${aviso}`
      };
    },
    validar: (d) => validarMedicao(d),
    aoSalvar: (d) => {
      if (!d.contratoBase) return toast('Selecione o contrato.', 'aviso');
      Object.assign(m, d);
      fecharModal();
      aoSalvar(m);
      const al = medicaoAlerta(o, m);
      if (al && al !== 'OK') toast('Atenção: ' + al.toLowerCase() + '.', 'critico', 5000);
    }
  });
}

ACOES['nova-medicao'] = (el, d) => {
  const o = App.obra();
  if (!o.contratos.length) return toast('Cadastre um contrato antes de medir.', 'aviso');
  const m = novaMedicao();
  m.contratoBase = d.base || o.contratos[0].codigoBase;
  m.numero = String(o.medicoes.filter((x) => x.contratoBase === m.contratoBase).length + 1);
  formMedicao(m, true, () => { mutar(() => { o.medicoes.push(m); }); toast('Medição registrada.', 'ok'); });
};

ACOES['editar-medicao'] = (el, d) => {
  const o = App.obra();
  const m = o.medicoes.find((x) => x.id === d.id);
  if (!m) return;
  formMedicao(m, false, () => { mutar(() => {}); toast('Medição atualizada.', 'ok'); });
  comExcluir('medicao', m.id);
};

ACOES['excluir-medicao'] = (el, d) => {
  const o = App.obra();
  const m = o.medicoes.find((x) => x.id === d.id);
  confirmar('Excluir medição', `Excluir a medição ${m.numero || ''} de ${fmtMoney(m.valorMedido)}?`, () => {
    mutar(() => { o.medicoes = o.medicoes.filter((x) => x.id !== d.id); });
    toast('Medição excluída.', 'aviso');
  });
};

/* ====================================================== RECEBIMENTOS */
function formRecebimento(r, novo, aoSalvar) {
  abrirForm({
    titulo: novo ? 'Nova parcela de recebimento' : 'Editar recebimento',
    largura: 'largo',
    campos: [
      { k: 'origem', label: 'Origem', tipo: 'select', opcoes: opcoesLista('origensRecebimento'), col: 3, vazio: false },
      { k: 'numeroMedicao', label: 'Nº da parcela / medição', tipo: 'texto', col: 3 },
      { k: 'etapaPci', label: 'Etapa / descrição', tipo: 'texto', col: 6 },
      { k: 'dataPrevista', label: 'Data prevista', tipo: 'data', col: 3 },
      { k: 'valorPrevisto', label: 'Valor previsto', tipo: 'dinheiro', col: 3 },
      { k: 'dataSolicitacao', label: 'Data da solicitação', tipo: 'data', col: 3 },
      { k: 'percentObra', label: '% obra informado', tipo: 'pct', col: 3 },
      /* parcela por marco físico (0016) — qualquer financiador */
      { k: 'percentExigido', label: '% de obra exigido', tipo: 'pct', col: 3, dica: 'o que o financiador exige para liberar' },
      { k: 'dataVistoria', label: 'Data da vistoria', tipo: 'data', col: 3 },
      { k: 'dataAprovacao', label: 'Data da aprovação', tipo: 'data', col: 3 },
      { k: 'valorAprovado', label: 'Valor aprovado', tipo: 'dinheiro', col: 3 },
      { k: 'descontos', label: 'Descontos / tarifas', tipo: 'dinheiro', col: 3 },
      { k: 'dataRecebimento', label: 'Data do recebimento', tipo: 'data', col: 3 },
      { k: 'valorRecebido', label: 'Valor recebido', tipo: 'dinheiro', col: 3 },
      { k: 'status', label: 'Status', tipo: 'select', opcoes: opcoesLista('statusRecebimento'), col: 3, vazio: false },
      { k: 'observacoes', label: 'Observações', tipo: 'texto', col: 9 },
      { k: 'resumo', label: 'Conferência', tipo: 'calc', col: 12 }
    ],
    valores: r,
    calcular: (d) => {
      const liq = Math.max(0, num(d.valorAprovado) - num(d.descontos));
      const dif = num(d.valorRecebido) - num(d.valorPrevisto);
      return {
        resumo: `Líquido esperado: <b>${fmtMoney(liq)}</b> · diferença previsto x recebido:
          <b style="color:${dif < 0 ? 'var(--critico)' : 'var(--ok)'}">${fmtMoney(dif)}</b>`
      };
    },
    validar: (d) => validarRecebimento(d),
    aoSalvar: (d) => { Object.assign(r, d); fecharModal(); aoSalvar(r); }
  });
}

ACOES['novo-recebimento'] = () => {
  const o = App.obra();
  const r = novoRecebimento();
  /* próxima parcela do financiador, seja ele quem for */
  r.numeroMedicao = String(o.recebimentos.filter((x) => recebimentoDoFinanciamento(x)).length + 1);
  const fin = String(o.fin.financiador || '').trim();
  if (fin && opcoesLista('origensRecebimento').includes(fin)) r.origem = fin;
  formRecebimento(r, true, () => { mutar(() => { o.recebimentos.push(r); }); toast('Parcela cadastrada.', 'ok'); });
};
ACOES['editar-recebimento'] = (el, d) => {
  const o = App.obra();
  const r = o.recebimentos.find((x) => x.id === d.id);
  if (!r) return;
  formRecebimento(r, false, () => { mutar(() => {}); toast('Recebimento atualizado.', 'ok'); });
  comExcluir('recebimento', r.id);
};
ACOES['excluir-recebimento'] = (el, d) => {
  const o = App.obra();
  confirmar('Excluir recebimento', 'Excluir esta parcela do cronograma de recebimentos?', () => {
    mutar(() => { o.recebimentos = o.recebimentos.filter((x) => x.id !== d.id); });
    toast('Parcela excluída.', 'aviso');
  });
};

/* ======================================================= LANÇAMENTOS */
/* Lançamento em modo rápido: item do plano, descrição, valor, tipo, etapa
   e data — o que se sabe na hora da compra. "Mais detalhes" abre o resto
   (quantidade, frete, fornecedor, NF…). Editar um lançamento que já tem
   detalhe abre tudo. Escolher o item do plano preenche descrição, etapa,
   unidade, tipo e o preço previsto. */
function formLancamento(l, novo, aoSalvar) {
  const o = App.obra();
  const planos = o.materiais.map((m) => ({ v: m.id, t: `${m.material}${m.etapa ? ` (${m.etapa})` : ''}` }));
  /* sugestões: fornecedores do cadastro (0018) + os já digitados */
  const fornecedores = [...new Set([
    ...Store.estado.prestadores.filter((p) => p.tipo === 'fornecedor' && !p.arquivado).map((p) => p.nome),
    ...o.lancamentos.map((x) => x.fornecedor),
  ].filter(Boolean))];
  const temDetalhe = !novo && (num(l.quantidade) !== 1 || num(l.frete) || num(l.desconto) ||
    l.fornecedor || l.documento || l.prestadorId || l.observacoes || l.categoria || l.anexoNf);
  abrirForm({
    titulo: novo ? 'Novo lançamento' : 'Editar lançamento',
    largura: 'largo',
    campos: [
      ...(planos.length
        ? [{ k: 'materialId', label: 'Item do plano de materiais', tipo: 'select', opcoes: planos, col: 12,
            placeholder: 'não é do plano', dica: 'escolher o item preenche descrição, etapa e unidade' }]
        : []),
      { k: 'descricao', label: 'Descrição', tipo: 'texto', col: 6, obrigatorio: true },
      { k: 'precoUnitario', label: 'Valor', tipo: 'dinheiro', col: 3, dica: 'por unidade, se houver quantidade' },
      { k: 'data', label: 'Data', tipo: 'data', col: 3, obrigatorio: true },
      { k: 'tipo', label: 'Tipo de saída', tipo: 'select', opcoes: opcoesLista('tiposSaida'), col: 6, vazio: false },
      { k: 'etapa', label: 'Etapa', tipo: 'select', opcoes: opcoesEtapas(), col: 6, placeholder: 'sem etapa' },
      { k: 'quantidade', label: 'Quantidade', tipo: 'numero', col: 3, detalhe: true },
      { k: 'unidade', label: 'Unidade', tipo: 'select', opcoes: opcoesLista('unidades'), col: 3, vazio: false, detalhe: true },
      { k: 'frete', label: 'Frete / acréscimo', tipo: 'dinheiro', col: 3, detalhe: true },
      { k: 'desconto', label: 'Desconto', tipo: 'dinheiro', col: 3, detalhe: true },
      { k: 'fornecedor', label: 'Fornecedor', tipo: 'lista', opcoes: fornecedores, col: 6, detalhe: true },
      { k: 'documento', label: 'Documento', tipo: 'texto', col: 3, placeholder: 'NF 1201', detalhe: true },
      { k: 'formaPagamento', label: 'Pagamento', tipo: 'select', opcoes: opcoesLista('formasPagamento'), col: 3, vazio: false, detalhe: true },
      { k: 'prestadorId', label: 'Pago a prestador', tipo: 'select', opcoes: opcoesPrestador(l.prestadorId), col: 6,
        placeholder: 'não é pagamento a prestador', dica: 'diária ou serviço pago direto, sem medição', detalhe: true },
      { k: 'categoria', label: 'Categoria', tipo: 'texto', col: 6, placeholder: 'Cimento, aço, taxas…', detalhe: true },
      { k: 'observacoes', label: 'Observações', tipo: 'texto', col: 12, detalhe: true },
      { k: 'total', label: 'Total do lançamento', tipo: 'calc', col: 12 }
    ],
    valores: { ...l, quantidade: novo && !num(l.quantidade) ? 1 : l.quantidade },
    calcular: (d) => ({
      total: `Total: <b>${fmtMoney(Math.max(0, num(d.quantidade) * num(d.precoUnitario) - num(d.desconto) + num(d.frete)))}</b>
        ${num(d.quantidade) !== 1 || num(d.desconto) || num(d.frete)
          ? `&nbsp;(${fmtNum(d.quantidade, 2)} × ${fmtMoney(d.precoUnitario)} − ${fmtMoney(d.desconto)} + ${fmtMoney(d.frete)})`
          : ''}`
    }),
    validar: (d) => validarLancamento({ ...d, anexoNf: notaEmEdicao.ref }),
    rodapeExtra: '<button type="button" class="btn sutil pequeno" data-acao="lanc-detalhes" aria-expanded="false">Mais detalhes</button>',
    aoSalvar: (d) => {
      if (!d.descricao) return toast('Informe a descrição do lançamento.', 'aviso');
      if (!num(d.quantidade)) d.quantidade = 1;
      if (d.prestadorId && !d.fornecedor) d.fornecedor = nomeDoPrestador(d.prestadorId, '');
      Object.assign(l, d, { anexoNf: notaEmEdicao.ref });
      fecharModal();
      aoSalvar(l);
    }
  });
  notaEmEdicao.ref = l.anexoNf || '';
  anexarNfAoForm(l);
  const form = document.querySelector('#modal-camada [data-form]');
  if (!form) return;
  /* a NF entra junto com os detalhes */
  const blocoNf = form.lastElementChild;
  if (blocoNf) blocoNf.classList.add('campo-detalhe');
  if (temDetalhe) mostrarDetalhesLanc(true);
  const sel = form.querySelector('#f_materialId');
  if (sel) {
    sel.addEventListener('change', () => {
      const m = o.materiais.find((x) => x.id === sel.value);
      if (!m) return;
      const preencher = (k, v) => {
        const el = form.querySelector(`#f_${k}`);
        if (el && v !== undefined && v !== null && v !== '') el.value = v;
      };
      const desc = form.querySelector('#f_descricao');
      if (desc && !desc.value.trim()) desc.value = m.material || '';
      preencher('etapa', m.etapa);
      preencher('unidade', m.unidade);
      preencher('tipo', 'Material');
      const preco = form.querySelector('#f_precoUnitario');
      if (preco && !num(preco.value) && num(m.precoPrevisto)) preco.value = fmtNum(m.precoPrevisto, 2);
      form.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }
}

function mostrarDetalhesLanc(abrir) {
  const form = document.querySelector('#modal-camada [data-form]');
  const botao = document.querySelector('#modal-camada [data-acao="lanc-detalhes"]');
  if (!form) return;
  form.classList.toggle('mostrar-detalhes', abrir);
  if (botao) {
    botao.setAttribute('aria-expanded', String(abrir));
    botao.textContent = abrir ? 'Menos detalhes' : 'Mais detalhes';
  }
}
ACOES['lanc-detalhes'] = () => {
  const form = document.querySelector('#modal-camada [data-form]');
  mostrarDetalhesLanc(!(form && form.classList.contains('mostrar-detalhes')));
};

/* Foto da nota fiscal (0019): câmera direto no celular ou galeria. Só o
   anexo — sem leitura automática. Reduzida como as fotos do diário. */
/* Nota fiscal do lançamento: foto ou PDF (ui/anexos.js). */
function anexarNfAoForm(l) {
  const form = document.querySelector('#modal-camada [data-form]');
  if (!form) return;
  campoAnexo(form, notaEmEdicao, {
    rotulo: 'Nota fiscal',
    destino: { obraId: App.obra().id, pasta: 'lancamentos', id: l.id },
    dica: 'foto ou PDF da nota, presa ao lançamento',
  });
}
const notaEmEdicao = { ref: '' };

ACOES['ver-nf'] = async (el, d) => {
  const l = App.obra().lancamentos.find((x) => x.id === d.id);
  if (!l || !l.anexoNf) return;
  const titulo = `Nota — ${l.descricao || 'lançamento'}${l.documento ? ` · ${l.documento}` : ''}`;
  try {
    abrirModal({ titulo, largura: 'largo', corpo: await htmlAnexo(l.anexoNf, `Nota fiscal de ${l.descricao || ''}`) });
  } catch (e) {
    toast('Não foi possível abrir a nota: ' + ((e && e.message) || e), 'critico');
  }
};

ACOES['novo-lancamento'] = () => {
  const o = App.obra();
  const l = novoLancamento();
  formLancamento(l, true, () => { mutar(() => { o.lancamentos.push(l); }); toast('Lançamento registrado.', 'ok'); });
};
ACOES['editar-lancamento'] = (el, d) => {
  const o = App.obra();
  const l = o.lancamentos.find((x) => x.id === d.id);
  if (!l) return;
  formLancamento(l, false, () => { mutar(() => {}); toast('Lançamento atualizado.', 'ok'); });
  comExcluir('lancamento', l.id);
};
ACOES['excluir-lancamento'] = (el, d) => {
  const o = App.obra();
  const l = o.lancamentos.find((x) => x.id === d.id);
  confirmar('Excluir lançamento', `Excluir "${l.descricao}" de ${fmtMoney(lancamentoTotal(l))}?`, () => {
    mutar(() => { o.lancamentos = o.lancamentos.filter((x) => x.id !== d.id); });
    toast('Lançamento excluído.', 'aviso');
  });
};

/* ========================================================= MATERIAIS */
function formMaterial(m, novo, aoSalvar) {
  abrirForm({
    titulo: novo ? 'Novo item do plano' : 'Editar item do plano',
    campos: [
      { k: 'etapa', label: 'Etapa', tipo: 'select', opcoes: opcoesEtapas(), col: 6, obrigatorio: true },
      { k: 'material', label: 'Material', tipo: 'texto', col: 6, obrigatorio: true, placeholder: 'Cimento CP II' },
      { k: 'quantidadeNecessaria', label: 'Quantidade necessária', tipo: 'numero', col: 4 },
      { k: 'unidade', label: 'Unidade', tipo: 'select', opcoes: opcoesLista('unidades'), col: 4, vazio: false },
      { k: 'precoPrevisto', label: 'Preço previsto unitário', tipo: 'dinheiro', col: 4 },
      { k: 'dataNecessaria', label: 'Data limite', tipo: 'data', col: 4 },
      { k: 'prioridade', label: 'Prioridade', tipo: 'select', opcoes: opcoesLista('prioridades'), col: 4, vazio: false },
      { k: 'status', label: 'Status', tipo: 'select', opcoes: opcoesLista('statusMaterial'), col: 4, vazio: false },
      { k: 'observacoes', label: 'Observações', tipo: 'texto', col: 12 },
      { k: 'orc', label: 'Orçamento previsto', tipo: 'calc', col: 12 }
    ],
    valores: m,
    calcular: (d) => ({
      orc: `Orçamento previsto: <b>${fmtMoney(num(d.quantidadeNecessaria) * num(d.precoPrevisto))}</b>`
    }),
    validar: (d) => validarMaterial(d),
    aoSalvar: (d) => {
      if (!d.material) return toast('Informe o material.', 'aviso');
      Object.assign(m, d);
      fecharModal();
      aoSalvar(m);
    }
  });
}

ACOES['novo-material'] = () => {
  const o = App.obra();
  const m = novoMaterial();
  m.etapa = App.filtros.etapa || '';
  formMaterial(m, true, () => { mutar(() => { o.materiais.push(m); }); toast('Item adicionado ao plano.', 'ok'); });
};
ACOES['editar-material'] = (el, d) => {
  const o = App.obra();
  const m = o.materiais.find((x) => x.id === d.id);
  if (!m) return;
  formMaterial(m, false, () => { mutar(() => {}); toast('Item atualizado.', 'ok'); });
  comExcluir('material', m.id);
};
ACOES['excluir-material'] = (el, d) => {
  const o = App.obra();
  const m = o.materiais.find((x) => x.id === d.id);
  confirmar('Excluir item do plano', `Excluir "${m.material}" do plano de materiais?`, () => {
    mutar(() => {
      o.materiais = o.materiais.filter((x) => x.id !== d.id);
      /* Quem apontava para o item perde a referência aqui também. No banco a
         FK faz ON DELETE SET NULL; sem isto o app guardava o id órfão e a
         próxima gravação daquele lançamento ou diário falhava na FK. */
      o.lancamentos.forEach((l) => { if (l.materialId === d.id) l.materialId = ''; });
      o.diario.forEach((r) => { if (r.ocorrenciaMaterialId === d.id) r.ocorrenciaMaterialId = ''; });
    });
    toast('Item excluído.', 'aviso');
  });
};

ACOES['comprar-material'] = (el, d) => {
  const o = App.obra();
  const m = o.materiais.find((x) => x.id === d.id);
  const c = materialCalc(o, m);
  const l = novoLancamento();
  Object.assign(l, {
    tipo: 'Material', etapa: m.etapa, descricao: m.material, categoria: m.material,
    quantidade: c.saldo, unidade: m.unidade, precoUnitario: m.precoPrevisto, materialId: m.id
  });
  formLancamento(l, true, () => {
    mutar(() => {
      o.lancamentos.push(l);
      const novo = materialCalc(o, m);
      m.status = novo.saldo <= 0 ? 'Comprado' : 'Comprado parcial';
    });
    toast('Compra lançada e saldo do plano atualizado.', 'ok');
  });
};

/* ======================================================== CRONOGRAMA */
function formEtapa(e, novo, aoSalvar) {
  abrirForm({
    titulo: novo ? 'Nova etapa' : 'Editar etapa',
    campos: [
      { k: 'etapa', label: 'Etapa', tipo: 'lista', opcoes: opcoesEtapas(), col: 8, obrigatorio: true },
      { k: 'responsavel', label: 'Responsável', tipo: 'texto', col: 4 },
      { k: 'inicioPrevisto', label: 'Início previsto', tipo: 'data', col: 3 },
      { k: 'fimPrevisto', label: 'Fim previsto', tipo: 'data', col: 3 },
      { k: 'inicioReal', label: 'Início real', tipo: 'data', col: 3 },
      { k: 'fimReal', label: 'Fim real', tipo: 'data', col: 3 },
      { k: 'progresso', label: 'Progresso (%)', tipo: 'pct', col: 3 },
      { k: 'quantidadeExecutada', label: 'Quantidade executada', tipo: 'numero', col: 3 },
      { k: 'unidadeProducao', label: 'Unidade de produção', tipo: 'select', opcoes: opcoesLista('unidades'), col: 3 },
      { k: 'peso', label: 'Peso na curva S (%)', tipo: 'pct', col: 3, dica: 'vazio = pela duração' },
      /* planilha do financiador (0016): PLS/PCI na CAIXA, cronograma físico-financeiro nos outros */
      { k: 'itemFinanciador', label: 'Item na planilha do financiador', tipo: 'texto', col: 3, placeholder: 'ex.: 3.2' },
      { k: 'pesoFinanciador', label: 'Peso na planilha do financiador (%)', tipo: 'pct', col: 3 },
      /* fim→início (0017): só começa depois que estas terminarem */
      { k: 'predecessoras', label: 'Começa depois de', tipo: 'multi', col: 12,
        opcoes: (App.obra() ? App.obra().cronograma : []).filter((x) => x.id !== e.id).map((x) => ({ v: x.id, t: x.etapa || 'sem nome' })),
        dica: 'as etapas que precisam terminar antes; o término projetado e o caminho crítico saem daqui' },
      { k: 'sit', label: 'Situação', tipo: 'calc', col: 12 }
    ],
    valores: e,
    calcular: (d) => {
      const c = etapaCalc(d);
      return { sit: `Situação: <b>${c.situacao}</b> · ${c.diasPrevistos} dia(s) previstos · ${c.diasRealizados} realizado(s)${c.atraso ? ` · <b style="color:var(--critico)">${c.atraso} dia(s) de atraso</b>` : ''}` };
    },
    validar: (d) => {
      const o = App.obra();
      const simulado = o ? o.cronograma.map((x) => (x.id === e.id ? { ...x, ...d } : x)) : [];
      if (o && !o.cronograma.includes(e)) simulado.push({ ...e, ...d });
      return [...validarEtapa(d), ...validarDependencias(simulado)];
    },
    aoSalvar: (d) => {
      if (!d.etapa) return toast('Informe o nome da etapa.', 'aviso');
      /* unidade vazia: a que a etapa costuma ter, não m² para tudo */
      if (!d.unidadeProducao) d.unidadeProducao = unidadeSugeridaEtapa(d.etapa);
      Object.assign(e, d);
      fecharModal();
      aoSalvar(e);
    }
  });
}

ACOES['nova-etapa'] = () => {
  const o = App.obra();
  const e = novaEtapaCronograma('');
  formEtapa(e, true, () => { mutar(() => { o.cronograma.push(e); }); toast('Etapa adicionada.', 'ok'); });
};
ACOES['editar-etapa'] = (el, d) => {
  const o = App.obra();
  const e = o.cronograma.find((x) => x.id === d.id);
  if (!e) return;
  formEtapa(e, false, () => { mutar(() => {}); toast('Etapa atualizada.', 'ok'); });
  comExcluir('etapa', e.id);
};
ACOES['excluir-etapa'] = (el, d) => {
  const o = App.obra();
  const e = o.cronograma.find((x) => x.id === d.id);
  confirmar('Excluir etapa', `Excluir "${e.etapa}" do cronograma?`, () => {
    mutar(() => { o.cronograma = o.cronograma.filter((x) => x.id !== d.id); });
    toast('Etapa excluída.', 'aviso');
  });
};

/* Distribui as etapas padrão entre início e previsão de conclusão */
ACOES['gerar-cronograma'] = () => {
  const o = App.obra();
  const etapas = opcoesEtapas().filter((e) => e !== 'Extras' && e !== 'Outros/não classificados');
  const ini = isISO(o.dataInicio) ? o.dataInicio : hojeISO();
  const fim = isISO(o.previsaoConclusao) ? o.previsaoConclusao : addDias(ini, 180);
  const total = Math.max(etapas.length, diasEntre(ini, fim));
  const passo = total / etapas.length;
  mutar(() => {
    o.cronograma = etapas.map((nome, i) => {
      const e = novaEtapaCronograma(nome);
      e.inicioPrevisto = addDias(ini, Math.round(i * passo));
      e.fimPrevisto = addDias(ini, Math.round((i + 1) * passo) - 1);
      return e;
    });
  });
  toast(`${etapas.length} etapas geradas entre ${fmtData(ini)} e ${fmtData(fim)}. Ajuste as datas conforme o planejamento.`, 'ok', 5200);
};

/* =============================================================== LOGO */
/* Reduz a imagem para caber num cabeçalho de relatório. PNG preserva o
   fundo transparente, comum em logo. */
async function comprimirLogo(file) {
  const dataUrl = await new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = rej;
    fr.readAsDataURL(file);
  });
  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = dataUrl;
  });
  const escala = Math.min(1, 360 / Math.max(img.width, img.height));
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(img.width * escala));
  cv.height = Math.max(1, Math.round(img.height * escala));
  cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
  return cv.toDataURL('image/png');
}

/* Alvos possíveis do seletor de logo. Cada um sabe ler e gravar o valor. */
const LOGO_ALVOS = {
  cliente: { get: () => window.__logo || '', set: (v) => { window.__logo = v; } },
  empresa: {
    get: () => (document.getElementById('emp_logo_val') || {}).value || '',
    set: (v) => { const h = document.getElementById('emp_logo_val'); if (h) h.value = v; },
  },
};

function renderLogoBox(alvo) {
  const cx = document.getElementById('logo-cx-' + alvo);
  if (!cx) return;
  const atual = (LOGO_ALVOS[alvo] || {}).get ? LOGO_ALVOS[alvo].get() : '';
  cx.innerHTML = atual
    ? `<img src="${fonteImagem(atual)}" alt="Logo" class="logo-preview">
       <button type="button" class="btn sutil pequeno" data-acao="logo-remover" data-alvo="${alvo}">Remover</button>`
    : `<label class="btn pequeno" style="cursor:pointer">Escolher imagem
        <input type="file" accept="image/png,image/jpeg,image/webp" data-logo="1" data-alvo="${alvo}" hidden></label>`;
}

ACOES['logo-selecionada'] = async (el, d) => {
  const f = el.files && el.files[0];
  if (!f) return;
  let dados;
  try { dados = await comprimirLogo(f); } catch (e) { return toast('Não foi possível ler a imagem.', 'critico'); }
  el.value = '';
  if (dados.length > 500000) return toast('A logo ficou pesada demais. Use uma imagem menor.', 'aviso');
  (LOGO_ALVOS[d.alvo] || LOGO_ALVOS.cliente).set(dados);
  renderLogoBox(d.alvo);
};

ACOES['logo-remover'] = (el, d) => {
  (LOGO_ALVOS[d.alvo] || LOGO_ALVOS.cliente).set('');
  renderLogoBox(d.alvo);
};

/* Anexa um seletor de logo ao formulário aberto (modal). */
function anexarCampoLogo(valorInicial, label) {
  window.__logo = valorInicial || '';
  const form = document.querySelector('#modal-camada [data-form]');
  if (!form) return;
  const bloco = document.createElement('div');
  bloco.className = 'campo c12';
  bloco.innerHTML = `<label>${esc(label)}</label>
    <div class="logo-campo" id="logo-cx-cliente"></div>
    <span class="dica">PNG ou JPG. Aparece no cabeçalho do relatório em PDF.</span>`;
  form.appendChild(bloco);
  renderLogoBox('cliente');
}

/* ============================================================ DIÁRIO */
function formDiario(reg, novo, aoSalvar) {
  window.__fotos = (reg.fotos || []).slice();
  const render = () => {
    const cx = document.getElementById('fotos-cx');
    if (!cx) return;
    cx.innerHTML = window.__fotos.map((f, i) =>
      `<figure><img src="${fonteImagem(f.dados)}" alt="${esc(f.nome || '')}">
        <button type="button" class="rm" data-acao="rm-foto" data-idx="${i}" aria-label="Remover foto">×</button></figure>`).join('')
      || '<span style="font-size:12px;color:var(--mudo)">Nenhuma foto anexada.</span>';
  };
  abrirForm({
    titulo: novo ? 'Novo registro no diário' : 'Editar registro',
    largura: 'largo',
    campos: [
      { k: 'data', label: 'Data', tipo: 'data', col: 3, obrigatorio: true },
      { k: 'clima', label: 'Clima', tipo: 'select', opcoes: opcoesLista('climas'), col: 3, vazio: false },
      { k: 'efetivo', label: 'Pessoas na obra', tipo: 'numero', col: 3, dec: 0 },
      { k: 'etapa', label: 'Etapa', tipo: 'select', opcoes: opcoesEtapas(), col: 3 },
      { k: 'atividades', label: 'Atividades executadas', tipo: 'area', col: 12, linhas: 3 },
      /* diário de campo (0017): o que o canteiro precisa registrar */
      { secao: 'Campo' },
      { k: 'climaManha', label: 'Clima de manhã', tipo: 'select', opcoes: opcoesLista('climas'), col: 3, placeholder: '—' },
      { k: 'climaTarde', label: 'Clima à tarde', tipo: 'select', opcoes: opcoesLista('climas'), col: 3, placeholder: '—' },
      { k: 'progressoEtapa', label: '% da etapa ao fim do dia', tipo: 'pct', col: 3, dica: 'atualiza o cronograma' },
      { k: 'impactaPrazo', label: 'Impacta o prazo?', tipo: 'check', col: 3 },
      { k: 'efetivoTexto', label: 'Efetivo por função', tipo: 'area', col: 6, linhas: 3,
        placeholder: 'Pedreiro 3\nServente 2', dica: 'uma função por linha; a soma vira o total de pessoas' },
      { k: 'equipamentos', label: 'Equipamentos', tipo: 'area', col: 3, linhas: 3, placeholder: 'betoneira, andaime…' },
      { k: 'diasImpacto', label: 'Dias de impacto', tipo: 'numero', col: 3, dec: 0, dica: 'só se impacta o prazo' },
      { k: 'ocorrencias', label: 'Ocorrências', tipo: 'area', col: 12, linhas: 2 },
      { k: 'autor', label: 'Registrado por', tipo: 'texto', col: 6 },
      /* Ocorrência como pendência (0015): "Piso parou: falta rejunte" com
         dono, prazo e o material que falta — vira alerta até resolver. */
      { secao: 'A ocorrência precisa de ação?' },
      {
        k: 'ocorrenciaStatus', label: 'Situação', tipo: 'select', col: 3, placeholder: 'Não — só registro',
        opcoes: [{ v: 'aberta', t: 'Sim — pendência aberta' }, { v: 'resolvida', t: 'Resolvida' }]
      },
      { k: 'ocorrenciaResponsavel', label: 'Responsável', tipo: 'texto', col: 3 },
      { k: 'ocorrenciaPrazo', label: 'Prazo', tipo: 'data', col: 3 },
      {
        k: 'ocorrenciaMaterialId', label: 'Material que falta', tipo: 'select', col: 3,
        opcoes: (App.obra() ? App.obra().materiais : []).map((m) => ({ v: m.id, t: m.material || 'sem nome' }))
      }
    ],
    /* o formulário fala texto e Sim/Não; o registro guarda lista e booleano */
    valores: { ...reg, efetivoTexto: textoEfetivoFuncoes(reg.efetivoFuncoes), impactaPrazo: reg.impactaPrazo ? 'Sim' : 'Não' },
    validar: (d) => validarDiario(diarioDoForm(d)),
    aoSalvar: (bruto) => {
      const d = diarioDoForm(bruto);
      /* data da resolução: carimbada ao marcar "Resolvida", limpa se reabrir */
      const resolvidaEm = d.ocorrenciaStatus === 'resolvida'
        ? reg.ocorrenciaResolvidaEm || (isISO(d.data) && d.data > hojeISO() ? d.data : hojeISO())
        : '';
      Object.assign(reg, d, { fotos: window.__fotos, ocorrenciaResolvidaEm: resolvidaEm });
      fecharModal();
      aoSalvar(reg);
    }
  });
  /* área de fotos anexada ao formulário */
  const form = document.querySelector('#modal-camada [data-form]');
  const bloco = document.createElement('div');
  bloco.className = 'campo c12';
  /* câmera direto no celular (capture) e galeria — os dois alimentam a
     mesma lista */
  bloco.innerHTML = `<label>Fotos</label>
    <div class="fotos-botoes">
      <label class="btn pequeno">Tirar foto<input type="file" accept="image/*" capture="environment" data-fotos="1" hidden></label>
      <label class="btn sutil pequeno">Da galeria<input type="file" accept="image/*" multiple data-fotos="1" hidden></label>
    </div>
    <span class="dica">As imagens são reduzidas automaticamente para não pesar a base.</span>
    <div class="fotos" id="fotos-cx" style="margin-top:8px"></div>`;
  form.appendChild(bloco);
  render();
  bloco.querySelectorAll('[data-fotos]').forEach((inp) => inp.addEventListener('change', async (ev) => {
    const arquivos = [...ev.target.files];
    for (const f of arquivos) {
      try {
        const dados = await comprimirImagem(f);
        window.__fotos.push({ id: uid('foto'), nome: f.name, dados });
      } catch (e) { toast('Não foi possível ler ' + f.name, 'critico'); }
    }
    ev.target.value = '';
    render();
  }));
}

/* Formulário → registro do diário: efetivo por função em lista (e o total
   vira a soma), "impacta o prazo" em booleano, dias zerados sem impacto. */
function diarioDoForm(d) {
  const out = { ...d };
  out.efetivoFuncoes = lerEfetivoFuncoes(d.efetivoTexto);
  delete out.efetivoTexto;
  if (out.efetivoFuncoes.length) out.efetivo = efetivoDiario(out);
  out.impactaPrazo = d.impactaPrazo === 'Sim';
  if (!out.impactaPrazo) out.diasImpacto = 0;
  return out;
}

/* O diário alimenta o cronograma (efeitoDiarioNaEtapa): início real,
   progresso e fim real da etapa do registro. Chamar dentro do mutar. */
function aplicarDiarioNoCronograma(o, r) {
  const etapa = o.cronograma.find((e) => norm(e.etapa) === norm(r.etapa));
  const mud = efeitoDiarioNaEtapa(etapa, r);
  if (Object.keys(mud).length) Object.assign(etapa, mud);
  return mud;
}
const avisoCronograma = (mud) =>
  Object.keys(mud).length ? ' Cronograma atualizado: ' + [
    mud.inicioReal ? `início real ${fmtData(mud.inicioReal)}` : '',
    mud.progresso !== undefined ? `${Math.round(mud.progresso * 100)}% da etapa` : '',
    mud.fimReal ? 'etapa concluída' : '',
  ].filter(Boolean).join(', ') + '.' : '';

/* Resolver a ocorrência sem abrir o formulário — é o gesto do canteiro. */
ACOES['resolver-ocorrencia'] = (el, d) => {
  const o = App.obra();
  const r = o.diario.find((x) => x.id === d.id);
  if (!r) return;
  mutar(() => {
    r.ocorrenciaStatus = 'resolvida';
    r.ocorrenciaResolvidaEm = isISO(r.data) && r.data > hojeISO() ? r.data : hojeISO();
  });
  toast('Ocorrência resolvida.', 'ok');
};

ACOES['rm-foto'] = (el, d) => {
  window.__fotos.splice(Number(d.idx), 1);
  const cx = document.getElementById('fotos-cx');
  cx.innerHTML = window.__fotos.map((f, i) =>
    `<figure><img src="${fonteImagem(f.dados)}" alt="${esc(f.nome || '')}">
      <button type="button" class="rm" data-acao="rm-foto" data-idx="${i}" aria-label="Remover foto">×</button></figure>`).join('')
    || '<span style="font-size:12px;color:var(--mudo)">Nenhuma foto anexada.</span>';
};

ACOES['novo-diario'] = () => {
  const o = App.obra();
  const r = novoDiario();
  /* "registrado por" é quem está logado; sem login, o responsável técnico */
  const email = SUPA.usuario && SUPA.usuario.email;
  r.autor = email ? email.split('@')[0] : Store.estado.empresa.responsavel || '';
  formDiario(r, true, () => {
    let mud = {};
    mutar(() => { o.diario.push(r); mud = aplicarDiarioNoCronograma(o, r); });
    toast('Registro salvo no diário.' + avisoCronograma(mud), 'ok');
  });
};
ACOES['editar-diario'] = (el, d) => {
  const o = App.obra();
  const r = o.diario.find((x) => x.id === d.id);
  if (!r) return;
  formDiario(r, false, () => {
    let mud = {};
    mutar(() => { mud = aplicarDiarioNoCronograma(o, r); });
    toast('Registro atualizado.' + avisoCronograma(mud), 'ok');
  });
  comExcluir('diario', r.id);
};
ACOES['excluir-diario'] = (el, d) => {
  const o = App.obra();
  const r = o.diario.find((x) => x.id === d.id);
  confirmar('Excluir registro', `Excluir o registro de ${fmtData(r.data)} e suas fotos?`, () => {
    mutar(() => { o.diario = o.diario.filter((x) => x.id !== d.id); });
    toast('Registro excluído.', 'aviso');
  });
};
ACOES['ver-foto'] = (el, d) => {
  const o = App.obra();
  const r = o.diario.find((x) => x.id === d.id);
  const f = r.fotos[Number(d.idx)];
  abrirModal({
    titulo: `${fmtData(r.data)} — ${f.nome || 'foto da obra'}`,
    largura: 'largo',
    corpo: `<img src="${fonteImagem(f.dados)}" alt="${esc(f.nome || '')}" style="width:100%;border-radius:4px">`
  });
};

/* ================================================ CLIENTES / PRESTADORES */
ACOES['novo-cliente'] = () => abrirFormCliente(novoCliente(), true);
ACOES['editar-cliente'] = (el, d) => {
  const c = Store.estado.clientes.find((x) => x.id === d.id);
  if (c) abrirFormCliente(c, false);
};
function abrirFormCliente(c, novo) {
  abrirForm({
    titulo: novo ? 'Novo cliente' : 'Editar cliente',
    campos: [
      { k: 'nome', label: 'Nome', tipo: 'texto', col: 8, obrigatorio: true },
      { k: 'situacao', label: 'Situação', tipo: 'select', opcoes: ['Cliente', 'Prospecção', 'Encerrado'], col: 4, vazio: false },
      { k: 'telefone', label: 'Telefone', tipo: 'texto', col: 4 },
      { k: 'email', label: 'E-mail', tipo: 'texto', col: 4 },
      { k: 'documento', label: 'CPF/CNPJ', tipo: 'texto', col: 4 },
      { k: 'contato', label: 'Contato', tipo: 'texto', col: 6 },
      { k: 'origem', label: 'Origem', tipo: 'texto', col: 6, placeholder: 'Indicação, imobiliária, redes…' },
      { k: 'observacoes', label: 'Observações', tipo: 'area', col: 12 }
    ],
    valores: c,
    validar: (d) => validarCliente({ ...d, logo: window.__logo }),
    aoSalvar: (d) => {
      if (!d.nome) return toast('Informe o nome.', 'aviso');
      Object.assign(c, d, { logo: window.__logo || '' });
      mutar((e) => { if (novo) e.clientes.push(c); });
      fecharModal();
      toast('Cliente salvo.', 'ok');
    }
  });
  anexarCampoLogo(c.logo, 'Logo do cliente');
}
ACOES['excluir-cliente'] = (el, d) => {
  const c = Store.estado.clientes.find((x) => x.id === d.id);
  confirmar('Excluir cliente', `Excluir "${c.nome}"? As obras vinculadas ficam sem cliente.`, () => {
    mutar((e) => {
      e.clientes = e.clientes.filter((x) => x.id !== d.id);
      e.obras.forEach((o) => { if (o.clienteId === d.id) o.clienteId = ''; });
    });
    toast('Cliente excluído.', 'aviso');
  });
};

ACOES['novo-prestador'] = () => abrirFormPrestador(novoPrestador(), true);
ACOES['editar-prestador'] = (el, d) => {
  const p = Store.estado.prestadores.find((x) => x.id === d.id);
  if (p) abrirFormPrestador(p, false);
};
function abrirFormPrestador(p, novo) {
  abrirForm({
    titulo: novo ? 'Novo prestador' : 'Editar prestador',
    campos: [
      { k: 'nome', label: 'Nome', tipo: 'texto', col: 8, obrigatorio: true },
      { k: 'especialidade', label: 'Especialidade', tipo: 'texto', col: 4, placeholder: 'Empreiteiro, pintor, elétrica…' },
      { k: 'telefone', label: 'Telefone', tipo: 'texto', col: 4 },
      { k: 'documento', label: 'CPF/CNPJ', tipo: 'texto', col: 4 },
      { k: 'avaliacao', label: 'Avaliação (0 a 5)', tipo: 'numero', col: 4, dec: 0 },
      { k: 'observacoes', label: 'Observações', tipo: 'area', col: 12 }
    ],
    valores: p,
    validar: (d) => validarPrestador(d),
    aoSalvar: (d) => {
      if (!d.nome) return toast('Informe o nome.', 'aviso');
      Object.assign(p, d);
      mutar((e) => { if (novo) e.prestadores.push(p); });
      fecharModal();
      toast('Prestador salvo.', 'ok');
    }
  });
}
ACOES['excluir-prestador'] = (el, d) => {
  const p = Store.estado.prestadores.find((x) => x.id === d.id);
  /* Quem tem contrato ou pagamento ligado não some: é arquivado. O banco
     garante o mesmo (ON DELETE RESTRICT, migração 0011). */
  const r = resumoPrestador(Store.estado, p);
  if (r.temVinculo) {
    confirmar('Arquivar prestador',
      `"${p.nome}" tem contratos ou pagamentos em ${r.obras.length} obra${r.obras.length > 1 ? 's' : ''}, então não pode ser excluído. ` +
      'Arquivar tira da lista e dos formulários, e mantém o histórico.',
      () => {
        mutar(() => { p.arquivado = true; });
        toast('Prestador arquivado.', 'ok');
      }, 'Arquivar');
    return;
  }
  confirmar('Excluir prestador', `Excluir "${p.nome}" do cadastro?`, () => {
    mutar((e) => { e.prestadores = e.prestadores.filter((x) => x.id !== d.id); });
    toast('Prestador excluído.', 'aviso');
  });
};

/* =========================================================== AJUSTES */
ACOES['salvar-empresa'] = () => {
  const d = lerForm();
  const probs = apenasErros(validarLogo(d.logo, 'logo'));
  if (probs.length) return toast(probs[0].mensagem, 'critico');
  mutar((e) => { Object.assign(e.empresa, d); });
  toast('Dados da empresa salvos.', 'ok');
};

/* Item em uso não sai da lista (usoItensLista): volta para o fim, e o
   aviso diz quantos registros o usam. */
ACOES['salvar-listas'] = () => {
  const campos = document.querySelectorAll('[data-lista]');
  const uso = usoItensLista(Store.estado);
  const mantidos = [];
  mutar((e) => {
    campos.forEach((c) => {
      const itens = c.value.split('\n').map((s) => s.trim()).filter(Boolean);
      if (!itens.length) return;
      const k = c.dataset.lista;
      const r = listaProtegida(uso[k], e.listas[k] || [], itens);
      e.listas[k] = r.lista;
      mantidos.push(...r.mantidos);
    });
  });
  if (mantidos.length) {
    const txt = mantidos.map((m) => `"${m.item}" (${m.registros} registro${m.registros === 1 ? '' : 's'})`).join(', ');
    toast(`Listas atualizadas. Continuam por estarem em uso: ${txt}.`, 'aviso');
    App.renderConteudo();
  } else toast('Listas atualizadas.', 'ok');
};

ACOES.zerar = () => {
  const palavra = String(Store.estado.empresa.nome || '').trim() || 'APAGAR';
  confirmarDigitando('Apagar todos os dados', 'Isso remove obras, contratos, medições, lançamentos e cadastros. Não há como desfazer. Baixe um backup antes.', palavra, () => {
    mutar((e) => {
      e.obras = []; e.clientes = []; e.prestadores = [];
    });
    App.rota.obraId = '';
    App.ir('carteira');
    toast('Base zerada.', 'aviso');
  }, 'Apagar tudo');
};

export {
  ACOES,
  formObra,
  formContrato,
  formMedicao,
  formRecebimento,
  formLancamento,
  formMaterial,
  formEtapa,
  comprimirImagem,
  formDiario,
  abrirFormCliente,
  abrirFormPrestador
};
