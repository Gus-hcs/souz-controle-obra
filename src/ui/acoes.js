/**
 * acoes.js — Ações: tudo que um clique dispara — abrir formulário, salvar, excluir.
 */
import { addDias, diasEntre, esc, fmtData, fmtMoney, fmtNum, fonteImagem, hojeISO, isISO, novaEtapaCronograma, novaMedicao, novaObra, novoCliente, novoContrato, novoDiario, novoLancamento, novoMaterial, novoPrestador, novoRecebimento, num, uid } from '../nucleo/base.js';
import { alertasObra, basesContratuais, contratoTotalAutorizado, contratoTotalPago, contratoValor, etapaCalc, lancamentoTotal, materialCalc, medicaoAlerta } from '../dominio/calculos.js';
import { apenasErros, validarCliente, validarContrato, validarDiario, validarEtapa, validarLancamento, validarLogo, validarMaterial, validarMedicao, validarObra, validarPrestador, validarRecebimento } from '../dominio/validacao.js';
import { Store, mutar } from '../dados/store.js';
import { SUPA } from '../dados/supabase.js';
import { App, VIEWS_OBRA, abrirForm, abrirModal, confirmar, fecharModal, lerForm, modalAoSalvar, modalValidar, mostrarAvisosForm, opcoesEtapas, opcoesLista, toast } from './shell.js';
import { carregarAuditoria, contratosAbertos } from './telas-obra.js';

const ACOES = {};

/* ------------------------------------------------------- navegação */
ACOES.ir = (el, d) => App.ir(d.view, d.obra);

/* ------------------------------------------- contratos: expandir/recolher */
ACOES['ct-toggle'] = (el, d) => {
  if (contratosAbertos.has(d.base)) contratosAbertos.delete(d.base);
  else contratosAbertos.add(d.base);
  App.renderConteudo();
};
ACOES['ct-todos'] = (el, d) => {
  contratosAbertos.clear();
  if (d.abrir === '1') basesContratuais(App.obra()).forEach((b) => contratosAbertos.add(b.base));
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
  /* O escuro é o padrão; alterna só entre padrão e claro. */
  const claro = document.documentElement.getAttribute('data-theme') === 'light';
  const novo = claro ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', novo);
  try { localStorage.setItem('souz_tema', novo); } catch (e) {}
};
ACOES['fechar-modal'] = () => fecharModal();
ACOES.imprimir = () => window.print();

ACOES['confirmar-ok'] = () => {
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

/* Gate de validação para os formulários que não passam por 'salvar-form'
   (a configuração da obra tem o próprio botão). */
function barrar(problemas, alvo) {
  const erros = apenasErros(problemas);
  if (!erros.length) return false;
  const lista = erros.map((p) => '• ' + p.mensagem).join('\n');
  toast((alvo ? alvo + ':\n' : '') + lista, 'critico', 6000);
  return true;
}

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
      { k: 'previsaoConclusao', label: 'Previsão de conclusão', tipo: 'data', col: 3 },
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

ACOES['salvar-obra-config'] = () => {
  const d = lerForm();
  const o = App.obra();
  if (barrar(validarObra(d), 'Configuração da obra')) return;
  mutar(() => {
    Object.keys(d).forEach((k) => {
      if (k.startsWith('fin.')) o.fin[k.slice(4)] = d[k];
      else o[k] = d[k];
    });
  });
  toast('Configuração salva.', 'ok');
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

ACOES['trocar-obra'] = (el) => {
  App.rota.obraId = el.value;
  App.ir(VIEWS_OBRA.has(App.rota.view) ? App.rota.view : 'painel', el.value);
};

/* ========================================================= CONTRATOS */
function formContrato(c, novo, aoSalvar) {
  const o = App.obra();
  const prestadores = Store.estado.prestadores.map((p) => p.nome);
  const bases = [...new Set(o.contratos.map((x) => x.codigoBase).filter(Boolean))];
  abrirForm({
    titulo: novo ? (c.registro === 'Aditivo' ? 'Novo aditivo' : 'Novo contrato') : 'Editar registro contratual',
    largura: 'largo',
    campos: [
      { k: 'codigo', label: 'Código', tipo: 'texto', col: 3, obrigatorio: true, dica: 'ex.: CT-002 ou CT-001-A1' },
      { k: 'codigoBase', label: 'Código-base', tipo: 'lista', opcoes: bases, col: 3, obrigatorio: true, dica: 'liga o aditivo ao contrato' },
      { k: 'registro', label: 'Tipo de registro', tipo: 'select', opcoes: ['Contrato', 'Aditivo'], col: 3, vazio: false },
      { k: 'status', label: 'Status', tipo: 'select', opcoes: opcoesLista('statusContrato'), col: 3, vazio: false },
      { k: 'prestador', label: 'Prestador', tipo: 'lista', opcoes: prestadores, col: 6 },
      { k: 'escopo', label: 'Escopo', tipo: 'texto', col: 6, placeholder: 'Empreitada principal, muro frontal…' },
      { k: 'regime', label: 'Regime', tipo: 'select', opcoes: opcoesLista('regimes'), col: 3, vazio: false },
      { k: 'quantidade', label: 'Quantidade', tipo: 'numero', col: 2 },
      { k: 'unidade', label: 'Unidade', tipo: 'select', opcoes: opcoesLista('unidades'), col: 2, vazio: false },
      { k: 'precoUnitario', label: 'Preço unitário', tipo: 'dinheiro', col: 2 },
      { k: 'valorInformado', label: 'Valor fechado', tipo: 'dinheiro', col: 3, dica: 'se preenchido, prevalece' },
      { k: 'incluiMaterial', label: 'Inclui material?', tipo: 'check', col: 3 },
      { k: 'inicioPrevisto', label: 'Início previsto', tipo: 'data', col: 3 },
      { k: 'fimPrevisto', label: 'Fim previsto', tipo: 'data', col: 3 },
      { k: 'valor', label: 'Valor do registro', tipo: 'calc', col: 12 },
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
    validar: (d) => validarContrato(d),
    aoSalvar: (d) => {
      if (!d.codigo) return toast('Informe o código do contrato.', 'aviso');
      if (!d.codigoBase) d.codigoBase = d.codigo;
      Object.assign(c, d);
      fecharModal();
      aoSalvar(c);
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

ACOES['editar-contrato'] = (el, d) => {
  const o = App.obra();
  const c = o.contratos.find((x) => x.id === d.id);
  if (c) formContrato(c, false, () => { mutar(() => {}); toast('Contrato atualizado.', 'ok'); });
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
  if (m) formMedicao(m, false, () => { mutar(() => {}); toast('Medição atualizada.', 'ok'); });
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
  r.numeroMedicao = String(o.recebimentos.filter((x) => x.origem === 'CAIXA').length + 1);
  formRecebimento(r, true, () => { mutar(() => { o.recebimentos.push(r); }); toast('Parcela cadastrada.', 'ok'); });
};
ACOES['editar-recebimento'] = (el, d) => {
  const o = App.obra();
  const r = o.recebimentos.find((x) => x.id === d.id);
  if (r) formRecebimento(r, false, () => { mutar(() => {}); toast('Recebimento atualizado.', 'ok'); });
};
ACOES['excluir-recebimento'] = (el, d) => {
  const o = App.obra();
  confirmar('Excluir recebimento', 'Excluir esta parcela do cronograma de recebimentos?', () => {
    mutar(() => { o.recebimentos = o.recebimentos.filter((x) => x.id !== d.id); });
    toast('Parcela excluída.', 'aviso');
  });
};

/* ======================================================= LANÇAMENTOS */
function formLancamento(l, novo, aoSalvar) {
  const o = App.obra();
  const planos = o.materiais.map((m) => ({ v: m.id, t: `${m.material} (${m.etapa})` }));
  const fornecedores = [...new Set(o.lancamentos.map((x) => x.fornecedor).filter(Boolean))];
  abrirForm({
    titulo: novo ? 'Novo lançamento' : 'Editar lançamento',
    largura: 'largo',
    campos: [
      { k: 'data', label: 'Data', tipo: 'data', col: 3, obrigatorio: true },
      { k: 'tipo', label: 'Tipo de saída', tipo: 'select', opcoes: opcoesLista('tiposSaida'), col: 3, vazio: false },
      { k: 'etapa', label: 'Etapa', tipo: 'select', opcoes: opcoesEtapas(), col: 3 },
      { k: 'categoria', label: 'Categoria', tipo: 'texto', col: 3, placeholder: 'Cimento, aço, taxas…' },
      { k: 'descricao', label: 'Descrição', tipo: 'texto', col: 6, obrigatorio: true },
      { k: 'fornecedor', label: 'Fornecedor', tipo: 'lista', opcoes: fornecedores, col: 4 },
      { k: 'documento', label: 'Documento', tipo: 'texto', col: 2, placeholder: 'NF 1201' },
      { k: 'quantidade', label: 'Quantidade', tipo: 'numero', col: 2 },
      { k: 'unidade', label: 'Unidade', tipo: 'select', opcoes: opcoesLista('unidades'), col: 2, vazio: false },
      { k: 'precoUnitario', label: 'Preço unitário', tipo: 'dinheiro', col: 2 },
      { k: 'desconto', label: 'Desconto', tipo: 'dinheiro', col: 2 },
      { k: 'frete', label: 'Frete / acréscimo', tipo: 'dinheiro', col: 2 },
      { k: 'formaPagamento', label: 'Pagamento', tipo: 'select', opcoes: opcoesLista('formasPagamento'), col: 2, vazio: false },
      { k: 'materialId', label: 'Item do plano de materiais', tipo: 'select', opcoes: planos, col: 6, placeholder: 'não vincular' },
      { k: 'observacoes', label: 'Observações', tipo: 'texto', col: 6 },
      { k: 'total', label: 'Total do lançamento', tipo: 'calc', col: 12 }
    ],
    valores: l,
    calcular: (d) => ({
      total: `Total: <b>${fmtMoney(Math.max(0, num(d.quantidade) * num(d.precoUnitario) - num(d.desconto) + num(d.frete)))}</b>
        &nbsp;(${fmtNum(d.quantidade, 2)} × ${fmtMoney(d.precoUnitario)} − ${fmtMoney(d.desconto)} + ${fmtMoney(d.frete)})`
    }),
    validar: (d) => validarLancamento(d),
    aoSalvar: (d) => {
      if (!d.descricao) return toast('Informe a descrição do lançamento.', 'aviso');
      Object.assign(l, d);
      fecharModal();
      aoSalvar(l);
    }
  });
}

ACOES['novo-lancamento'] = () => {
  const o = App.obra();
  const l = novoLancamento();
  formLancamento(l, true, () => { mutar(() => { o.lancamentos.push(l); }); toast('Lançamento registrado.', 'ok'); });
};
ACOES['editar-lancamento'] = (el, d) => {
  const o = App.obra();
  const l = o.lancamentos.find((x) => x.id === d.id);
  if (l) formLancamento(l, false, () => { mutar(() => {}); toast('Lançamento atualizado.', 'ok'); });
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
  if (m) formMaterial(m, false, () => { mutar(() => {}); toast('Item atualizado.', 'ok'); });
};
ACOES['excluir-material'] = (el, d) => {
  const o = App.obra();
  const m = o.materiais.find((x) => x.id === d.id);
  confirmar('Excluir item do plano', `Excluir "${m.material}" do plano de materiais?`, () => {
    mutar(() => { o.materiais = o.materiais.filter((x) => x.id !== d.id); });
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
      { k: 'sit', label: 'Situação', tipo: 'calc', col: 12 }
    ],
    valores: e,
    calcular: (d) => {
      const c = etapaCalc(d);
      return { sit: `Situação: <b>${c.situacao}</b> · ${c.diasPrevistos} dia(s) previstos · ${c.diasRealizados} realizado(s)${c.atraso ? ` · <b style="color:var(--critico)">${c.atraso} dia(s) de atraso</b>` : ''}` };
    },
    validar: (d) => validarEtapa(d),
    aoSalvar: (d) => {
      if (!d.etapa) return toast('Informe o nome da etapa.', 'aviso');
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
  if (e) formEtapa(e, false, () => { mutar(() => {}); toast('Etapa atualizada.', 'ok'); });
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
async function comprimirImagem(file, maxLado = 1280, qualidade = 0.66) {
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
  const escala = Math.min(1, maxLado / Math.max(img.width, img.height));
  const cv = document.createElement('canvas');
  cv.width = Math.round(img.width * escala);
  cv.height = Math.round(img.height * escala);
  cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
  return cv.toDataURL('image/jpeg', qualidade);
}

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
      { k: 'ocorrencias', label: 'Ocorrências / pendências', tipo: 'area', col: 12, linhas: 2 },
      { k: 'autor', label: 'Registrado por', tipo: 'texto', col: 6 }
    ],
    valores: reg,
    validar: (d) => validarDiario(d),
    aoSalvar: (d) => {
      Object.assign(reg, d, { fotos: window.__fotos });
      fecharModal();
      aoSalvar(reg);
    }
  });
  /* área de fotos anexada ao formulário */
  const form = document.querySelector('#modal-camada [data-form]');
  const bloco = document.createElement('div');
  bloco.className = 'campo c12';
  bloco.innerHTML = `<label>Fotos</label>
    <input type="file" accept="image/*" multiple data-fotos="1" style="font-size:12px">
    <span class="dica">As imagens são reduzidas automaticamente para não pesar a base.</span>
    <div class="fotos" id="fotos-cx" style="margin-top:8px"></div>`;
  form.appendChild(bloco);
  render();
  bloco.querySelector('[data-fotos]').addEventListener('change', async (ev) => {
    const arquivos = [...ev.target.files];
    for (const f of arquivos) {
      try {
        const dados = await comprimirImagem(f);
        window.__fotos.push({ id: uid('foto'), nome: f.name, dados });
      } catch (e) { toast('Não foi possível ler ' + f.name, 'critico'); }
    }
    ev.target.value = '';
    render();
  });
}

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
  r.autor = Store.estado.empresa.responsavel || '';
  formDiario(r, true, () => { mutar(() => { o.diario.push(r); }); toast('Registro salvo no diário.', 'ok'); });
};
ACOES['editar-diario'] = (el, d) => {
  const o = App.obra();
  const r = o.diario.find((x) => x.id === d.id);
  if (r) formDiario(r, false, () => { mutar(() => {}); toast('Registro atualizado.', 'ok'); });
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

ACOES['salvar-listas'] = () => {
  const campos = document.querySelectorAll('[data-lista]');
  mutar((e) => {
    campos.forEach((c) => {
      const itens = c.value.split('\n').map((s) => s.trim()).filter(Boolean);
      if (itens.length) e.listas[c.dataset.lista] = itens;
    });
  });
  toast('Listas atualizadas.', 'ok');
};

ACOES.zerar = () => {
  confirmar('Apagar todos os dados', 'Isso remove obras, contratos, medições, lançamentos e cadastros. Baixe um backup antes.', () => {
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
