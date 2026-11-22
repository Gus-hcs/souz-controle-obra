/**
 * modelos-exportacao.js — O conteúdo do relatório de cada aba, num formato
 * neutro que vira PDF, Excel ou CSV (io/exportar-tela.js).
 *
 * Cada modelo devolve:
 *   { titulo, arquivo, kpis: [{ rotulo, valor, contexto }],
 *     campos: [{ titulo, itens: [{ rotulo, valor, tipo }] }],
 *     secoes: [{ titulo, colunas: [{ rotulo, tipo, pdf, largura }], linhas, total }] }
 *
 * Os valores das linhas vão CRUS e tipados (número é número, data é
 * AAAA-MM-DD): o PDF formata em pt-BR e o Excel grava número de verdade,
 * com formato de célula. Nenhum número sai daqui calculado por conta
 * própria — tudo vem de dominio/calculos.js (regra 1 do CLAUDE.md); aqui
 * só se escolhe o que entra e em que ordem.
 *
 * Não importa nada de ui/: roda no vitest em ambiente node.
 */
import {
  competencia,
  fmtData,
  fmtDataCurta,
  fmtMoney,
  fmtNum,
  fmtPct,
  hojeISO,
  isISO,
  nomeExibicao,
  num,
  round2,
} from '../nucleo/base.js';
import { ocultarDocumento } from '../nucleo/contato.js';
import {
  andamentoParcela,
  basesContratuais,
  composicaoContrato,
  contratoFimVigente,
  contratoSituacao,
  contratoValor,
  diaImpraticavel,
  diarioIndicadores,
  efetivoDiario,
  empreitadaPrincipal,
  etapaCalc,
  indicadoresContrato,
  indicadoresPrestadores,
  indicadoresRecebimentos,
  kpisObra,
  lancamentoTotal,
  materialCalc,
  medicaoAPagar,
  medicaoAlerta,
  medicaoLiquido,
  medicaoPagamento,
  medicoesComPendencia,
  medicoesEmAberto,
  podeSolicitar,
  pontualidadePrestador,
  prazoObra,
  recebimentoDiferenca,
  recebimentoLiquido,
  resumoLancamentos,
  resumoMateriais,
  resumoMedicoes,
  resumoPrestador,
  saudeCliente,
  situacaoMaterial,
  totaisContratos,
  valorAgregadoObra,
  valorVendaObras,
  alertasObra,
  pendenciasObra,
  causasRaizObra,
  categoriaLancamento,
  CATEGORIAS_SAIDA,
} from '../dominio/calculos.js';

/* ------------------------------------------------------------ apoio */
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const reais = (v) => fmtMoney(v, { dec: 0 });
const soma = (linhas, i) => round2(linhas.reduce((s, l) => s + num(l[i]), 0));
const dataOuVazio = (iso) => (isISO(iso) ? iso : '');
const ROTULO_CATEGORIA = Object.fromEntries(CATEGORIAS_SAIDA);

/* coluna: rótulo, tipo e se vai ao PDF (o Excel leva todas) */
const col = (rotulo, tipo = 'texto', extra = {}) => ({ rotulo, tipo, pdf: true, ...extra });
const soExcel = (rotulo, tipo = 'texto', extra = {}) => col(rotulo, tipo, { ...extra, pdf: false });

/* linha de total: "Total · N itens" na primeira coluna, a soma nas
   colunas pedidas, vazio no resto */
function linhaTotal(colunas, linhas, somar, rotulo = 'Total') {
  if (linhas.length < 2) return null;
  return colunas.map((c, i) => {
    if (i === 0) return `${rotulo} (${linhas.length})`;
    return somar.includes(i) ? soma(linhas, i) : '';
  });
}

const nomeClienteDe = (estado, id) => {
  const c = (estado.clientes || []).find((x) => x.id === id);
  return c ? c.nome : '';
};

/* ================================================================
   CARTEIRA
   ================================================================ */
function modeloClientes(estado) {
  const itens = estado.clientes.map((c) => {
    const obras = estado.obras.filter((o) => o.clienteId === c.id);
    return { c, obras, saude: obras.length ? saudeCliente(obras) : null };
  });
  const emRisco = itens.filter(
    (d) => d.saude && (d.saude.nivel === 'critico' || d.saude.nivel === 'atencao'),
  ).length;
  const colunas = [
    col('Nome'),
    col('CPF/CNPJ'),
    col('Situação'),
    col('Telefone'),
    col('E-mail'),
    soExcel('Contato'),
    soExcel('Origem'),
    col('Obras'),
    col('Valor contratado', 'moeda'),
    soExcel('Observações'),
  ];
  const linhas = itens
    .slice()
    .sort((a, b) => String(a.c.nome).localeCompare(String(b.c.nome), 'pt'))
    .map((d) => [
      d.c.nome,
      /* LGPD: mascarado, como na lista da tela */
      ocultarDocumento(d.c.documento),
      d.saude ? d.saude.texto : d.c.situacao || 'Cliente',
      d.c.telefone,
      d.c.email,
      d.c.contato,
      d.c.origem,
      d.obras.map((o) => o.nome).join('; '),
      valorVendaObras(d.obras),
      d.c.observacoes,
    ]);
  return {
    titulo: 'Clientes',
    arquivo: 'clientes',
    kpis: [
      {
        rotulo: 'Clientes e interessados',
        valor: String(itens.length),
        contexto: `${itens.filter((d) => d.obras.length).length} com obra vinculada`,
      },
      {
        rotulo: 'Com obra em risco',
        valor: String(emRisco),
        contexto: emRisco ? 'atraso, custo ou caixa' : 'nenhum cliente com obra em risco',
      },
      {
        rotulo: 'Valor contratado',
        valor: reais(valorVendaObras(itens.flatMap((d) => d.obras))),
        contexto: 'soma do valor de venda das obras',
      },
    ],
    secoes: [
      {
        titulo: 'Clientes',
        colunas,
        linhas,
        total: linhaTotal(colunas, linhas, [8]),
      },
    ],
  };
}

function modeloPrestadores(estado) {
  const k = indicadoresPrestadores(estado);
  const ativos = estado.prestadores.filter((p) => !p.arquivado);
  const colunas = [
    col('Prestador'),
    col('Tipo'),
    col('Especialidade'),
    soExcel('Cidade'),
    col('Contato'),
    soExcel('Forma de contratação'),
    soExcel('Obras'),
    col('Contratado', 'moeda'),
    col('Pago', 'moeda'),
    col('A pagar agora', 'moeda'),
    col('A medir', 'moeda'),
    col('No prazo', 'pct'),
  ];
  const linhas = ativos
    .map((p) => ({ p, r: resumoPrestador(estado, p), pt: pontualidadePrestador(estado, p) }))
    .sort((a, b) => nomeExibicao(a.p.nome).localeCompare(nomeExibicao(b.p.nome), 'pt'))
    .map(({ p, r, pt }) => [
      nomeExibicao(p.nome) + (p.apelido ? ` (${p.apelido})` : ''),
      p.tipo === 'fornecedor' ? 'Fornecedor' : 'Serviço',
      p.especialidade,
      p.cidade,
      p.whatsapp || p.telefone,
      p.formaContratacao,
      r.obras.map((o) => o.obraNome).join('; '),
      /* sem contrato, "contratado R$ 0" seria falso: fica vazio */
      r.temContrato ? r.contratado : '',
      r.pago,
      r.temContrato ? r.aPagarAgora : '',
      r.temContrato ? r.aMedir : '',
      pt.pontualidade === null ? '' : pt.pontualidade,
    ]);
  return {
    titulo: 'Prestadores',
    arquivo: 'prestadores',
    kpis: [
      {
        rotulo: 'Prestadores ativos',
        valor: String(k.ativos),
        contexto: k.fornecedores
          ? `${k.servico} de serviço · ${plural(k.fornecedores, 'fornecedor', 'fornecedores')}`
          : 'todos de serviço',
      },
      { rotulo: 'Pago', valor: reais(k.pago), contexto: 'medições pagas e lançamentos' },
      {
        rotulo: 'A pagar agora',
        valor: reais(k.aPagarAgora),
        contexto: k.comSaldo
          ? `${plural(k.comSaldo, 'prestador', 'prestadores')} esperando`
          : 'ninguém esperando pagamento',
      },
      {
        rotulo: 'Entregas no prazo',
        valor: k.pontualidade === null ? '—' : fmtPct(k.pontualidade, 0),
        contexto:
          k.pontualidade === null
            ? 'nenhuma entrega com prazo ainda'
            : `${k.noPrazo} de ${k.entregas}`,
      },
    ],
    secoes: [
      {
        titulo: 'Prestadores ativos',
        colunas,
        linhas,
        total: linhaTotal(colunas, linhas, [7, 8, 9, 10]),
      },
    ],
  };
}

/* ================================================================
   PLANEJAR
   ================================================================ */
function modeloObraConfig(estado, o) {
  const k = kpisObra(o);
  const f = o.fin || {};
  const alvo = num(f.margemDesejada);
  return {
    titulo: 'Configuração da obra',
    arquivo: 'configuracao',
    kpis: [
      {
        rotulo: 'Empreitada principal',
        valor: reais(empreitadaPrincipal(o)),
        contexto: num(o.areaConstruida)
          ? `${fmtNum(o.areaConstruida, 2)} m² × ${reais(f.precoEmpreitadaM2)}/m²`
          : 'área construída não informada',
      },
      {
        rotulo: 'Custo previsto total',
        valor: reais(k.custoPrevisto),
        contexto: `obra física ${reais(k.custoFisicoPrevisto)} · terreno, taxas e comissão ${reais(k.custoNaoFisico)}`,
      },
      {
        rotulo: 'Resultado projetado',
        valor: k.resultado === null ? '—' : reais(k.resultado),
        contexto:
          k.margem === null
            ? 'valor de venda não informado'
            : `margem de ${fmtPct(k.margem)}${alvo ? ` · alvo ${fmtPct(alvo)}` : ''}`,
      },
    ],
    campos: [
      {
        titulo: 'Identificação',
        itens: [
          { rotulo: 'Nome da obra', valor: o.nome },
          { rotulo: 'Cliente', valor: nomeClienteDe(estado, o.clienteId) },
          { rotulo: 'Situação', valor: o.status },
          { rotulo: 'Cidade/UF', valor: o.cidade },
          { rotulo: 'Endereço', valor: o.endereco },
          { rotulo: 'Área construída (m²)', valor: num(o.areaConstruida), tipo: 'num' },
          { rotulo: 'Área de muro (m²)', valor: num(o.areaMuro), tipo: 'num' },
          { rotulo: 'Sistema construtivo', valor: o.sistema },
          { rotulo: 'Padrão de acabamento', valor: o.padrao },
          { rotulo: 'Responsável técnico', valor: o.responsavel },
          { rotulo: 'CREA/CAU do responsável', valor: o.creaCau },
        ],
      },
      {
        titulo: 'Prazo',
        itens: [
          { rotulo: 'Data de início', valor: dataOuVazio(o.dataInicio), tipo: 'data' },
          {
            rotulo: 'Data contratual de entrega',
            valor: dataOuVazio(o.previsaoConclusao),
            tipo: 'data',
          },
        ],
      },
      {
        titulo: 'Financiamento',
        itens: [
          { rotulo: 'Financiador', valor: f.financiador },
          { rotulo: 'Data da assinatura', valor: dataOuVazio(f.dataAssinatura), tipo: 'data' },
          { rotulo: 'Nº do contrato de financiamento', valor: f.contratoCaixa },
        ],
      },
      {
        titulo: 'Valores',
        itens: [
          { rotulo: 'Saldo inicial da obra', valor: num(f.saldoInicial), tipo: 'moeda' },
          { rotulo: 'Valor do terreno', valor: num(f.valorTerreno), tipo: 'moeda' },
          { rotulo: 'Financiado para obra', valor: num(f.valorFinanciado), tipo: 'moeda' },
          { rotulo: 'Recursos próprios previstos', valor: num(f.recursosProprios), tipo: 'moeda' },
          { rotulo: 'Preço empreitada/m²', valor: num(f.precoEmpreitadaM2), tipo: 'moeda' },
          { rotulo: 'Custo físico máximo/m²', valor: num(f.custoFisicoMaxM2), tipo: 'moeda' },
          { rotulo: 'Valor de venda/contrato', valor: num(f.valorVenda), tipo: 'moeda' },
          { rotulo: 'Margem desejada', valor: num(f.margemDesejada), tipo: 'pct' },
        ],
      },
      ...(String(o.observacoes || '').trim()
        ? [{ titulo: 'Observações', itens: [{ rotulo: 'Observações', valor: o.observacoes }] }]
        : []),
    ],
    secoes: [],
  };
}

function modeloContratos(estado, o) {
  const bases = basesContratuais(o).map((b) => ({
    b,
    principal: b.principal || b.registros[0] || {},
    ind: indicadoresContrato(o, b.base),
    sit: contratoSituacao(o, b.base),
    fim: contratoFimVigente(b.registros),
    comp: composicaoContrato(o, b.base),
  }));
  const t = totaisContratos(bases);
  const pago = round2(bases.reduce((s, x) => s + x.ind.pago, 0));

  const colunas = [
    col('Contrato'),
    col('Prestador'),
    col('Escopo'),
    soExcel('Regime'),
    soExcel('Início previsto', 'data'),
    col('Fim vigente', 'data'),
    col('Autorizado', 'moeda'),
    col('Medido', 'moeda'),
    col('Pago', 'moeda'),
    col('A pagar agora', 'moeda'),
    soExcel('A medir', 'moeda'),
    soExcel('Retido', 'moeda'),
    col('Situação'),
  ];
  const linhas = bases.map((x) => [
    x.b.base,
    nomeExibicao(x.principal.prestador || ''),
    x.principal.escopo,
    x.principal.regime,
    dataOuVazio(x.principal.inicioPrevisto),
    dataOuVazio(x.fim),
    x.ind.autorizado,
    x.ind.medido,
    x.ind.pago,
    x.ind.aPagarAgora,
    x.ind.aMedir,
    num(x.ind.retido),
    x.sit.texto,
  ]);

  const colRegistros = [
    col('Código'),
    col('Contrato-base'),
    col('Registro'),
    col('Escopo'),
    soExcel('Tipo de aditivo'),
    soExcel('Status do aditivo'),
    soExcel('Quantidade', 'num'),
    soExcel('Unidade'),
    soExcel('Preço unitário', 'moeda'),
    col('Valor', 'moeda'),
    col('Início', 'data'),
    col('Fim', 'data'),
    col('Status'),
    soExcel('Observações'),
  ];
  const registros = o.contratos.map((c) => [
    c.codigo,
    c.codigoBase || c.codigo,
    c.registro,
    c.escopo,
    c.registro === 'Aditivo' ? c.tipoAditivo : '',
    c.registro === 'Aditivo' ? c.statusAditivo : '',
    num(c.quantidade),
    c.unidade,
    num(c.precoUnitario),
    contratoValor(c),
    dataOuVazio(c.inicioPrevisto),
    dataOuVazio(
      c.registro === 'Aditivo' && isISO(c.novoPrazoAditivo) ? c.novoPrazoAditivo : c.fimPrevisto,
    ),
    c.status,
    c.observacoes,
  ]);

  return {
    titulo: 'Contratos e aditivos',
    arquivo: 'contratos',
    kpis: [
      {
        rotulo: 'Autorizado',
        valor: reais(t.autorizado),
        contexto: plural(bases.length, 'contrato', 'contratos'),
      },
      {
        rotulo: 'Medido',
        valor: reais(t.medido),
        contexto: `${fmtPct(t.autorizado > 0 ? t.medido / t.autorizado : 0, 0)} do autorizado`,
      },
      { rotulo: 'A pagar agora', valor: reais(t.aPagarAgora), contexto: 'já medido e não pago' },
      { rotulo: 'A medir', valor: reais(t.aMedir), contexto: `pago até aqui ${reais(pago)}` },
    ],
    secoes: [
      {
        titulo: 'Contratos por código-base',
        colunas,
        linhas,
        total: linhaTotal(colunas, linhas, [6, 7, 8, 9, 10, 11]),
      },
      {
        titulo: 'Registros (contratos e aditivos)',
        colunas: colRegistros,
        linhas: registros,
      },
    ],
  };
}

function modeloCronograma(estado, o) {
  const k = kpisObra(o);
  const va = valorAgregadoObra(o);
  const prazo = prazoObra(o);
  const hoje = hojeISO();
  const proxima = o.cronograma
    .filter((e) => etapaCalc(e).progresso < 1 && isISO(e.fimPrevisto) && e.fimPrevisto >= hoje)
    .sort((a, b) => a.fimPrevisto.localeCompare(b.fimPrevisto))[0];
  const nTravadas = k.etapasAtrasadas + k.etapasInicioAtrasado;
  const situacaoTexto = (c) =>
    c.atrasoInicio > 0
      ? `Início atrasado ${c.atrasoInicio} d`
      : c.situacao.charAt(0) +
        c.situacao.slice(1).toLowerCase() +
        (c.atraso > 0 ? ` · ${c.atraso} d` : '');

  const colunas = [
    col('Etapa'),
    col('Responsável'),
    col('Início previsto', 'data'),
    col('Fim previsto', 'data'),
    col('Início real', 'data'),
    col('Fim real', 'data'),
    col('Progresso', 'pct'),
    soExcel('Dias previstos', 'int'),
    soExcel('Dias de atraso', 'int'),
    soExcel('Peso', 'pct'),
    col('Situação'),
  ];
  const linhas = o.cronograma
    .map((e) => ({ e, c: etapaCalc(e) }))
    .sort((a, b) =>
      String(a.e.inicioPrevisto || '9').localeCompare(String(b.e.inicioPrevisto || '9')),
    )
    .map(({ e, c }) => [
      e.etapa,
      e.responsavel,
      dataOuVazio(e.inicioPrevisto),
      dataOuVazio(e.fimPrevisto),
      dataOuVazio(e.inicioReal),
      dataOuVazio(e.fimReal),
      c.progresso,
      c.diasPrevistos,
      c.atraso,
      num(e.peso),
      situacaoTexto(c),
    ]);
  return {
    titulo: 'Cronograma da obra',
    arquivo: 'cronograma',
    kpis: [
      {
        rotulo: 'Término projetado',
        valor: va.termino ? fmtData(va.termino) : '—',
        contexto: `${prazo.fimPrevisto ? `contrato ${fmtDataCurta(prazo.fimPrevisto)}` : 'sem data contratual'}${
          va.atrasoProjetado > 0 ? ` · +${va.atrasoProjetado} d` : ''
        }`,
      },
      {
        rotulo: 'Avanço físico',
        valor: fmtPct(k.progressoFisico, 0),
        contexto: `previsto ${fmtPct(va.previsto, 0)}`,
      },
      {
        rotulo: 'Etapas atrasadas',
        valor: String(nTravadas),
        contexto: nTravadas
          ? [
              k.etapasAtrasadas ? `${k.etapasAtrasadas} com fim vencido` : '',
              k.etapasInicioAtrasado ? `${k.etapasInicioAtrasado} sem começar` : '',
            ]
              .filter(Boolean)
              .join(' · ')
          : 'tudo no prazo',
      },
      {
        rotulo: 'Próxima entrega',
        valor: proxima ? proxima.etapa || '—' : '—',
        contexto: proxima ? fmtDataCurta(proxima.fimPrevisto) : 'nada com fim à frente',
      },
    ],
    secoes: [{ titulo: 'Etapas', colunas, linhas }],
  };
}

function modeloMateriais(estado, o) {
  const r = resumoMateriais(o);
  const colunas = [
    col('Material'),
    col('Etapa'),
    col('Necessário', 'num'),
    col('Un.'),
    soExcel('Comprado', 'num'),
    col('Falta', 'num'),
    soExcel('Preço previsto', 'moeda'),
    soExcel('Orçamento', 'moeda'),
    soExcel('Já comprado (R$)', 'moeda'),
    col('Falta (R$)', 'moeda'),
    col('Comprar até', 'data'),
    soExcel('Prioridade'),
    col('Situação'),
  ];
  const linhas = o.materiais
    .map((m) => ({ m, c: materialCalc(o, m) }))
    .sort((a, b) =>
      String(a.m.dataNecessaria || '9').localeCompare(String(b.m.dataNecessaria || '9')),
    )
    .map(({ m, c }) => [
      m.material,
      m.etapa,
      num(m.quantidadeNecessaria),
      m.unidade,
      c.comprada,
      c.saldo,
      num(m.precoPrevisto),
      c.orcamento,
      c.valorComprado,
      c.saldoValor,
      dataOuVazio(m.dataNecessaria),
      m.prioridade,
      situacaoMaterial(m, c).texto,
    ]);
  return {
    titulo: 'Plano de materiais',
    arquivo: 'materiais',
    kpis: [
      {
        rotulo: 'Falta comprar',
        valor: reais(r.faltaComprar),
        contexto: `${plural(r.itensComSaldo, 'item', 'itens')} com saldo`,
      },
      {
        rotulo: 'Vencidos sem compra',
        valor: String(r.vencidos),
        contexto: r.vencidos ? `${reais(r.vencidosValor)} — comprar já` : 'nada em atraso',
      },
      {
        rotulo: 'Já comprado',
        valor: reais(r.comprado),
        contexto: r.orcamento
          ? `${fmtPct(r.comprado / r.orcamento, 0)} de ${reais(r.orcamento)} orçados`
          : plural(o.materiais.length, 'item no plano', 'itens no plano'),
      },
      {
        rotulo: 'Desvio de orçamento',
        valor: r.comCompra ? `${r.desvio >= 0 ? '+' : '−'}${reais(Math.abs(r.desvio))}` : '—',
        contexto: !r.comCompra
          ? 'sem compras ainda'
          : r.desvio > 0.5
            ? 'acima do previsto'
            : r.desvio < -0.5
              ? 'abaixo do previsto'
              : 'dentro do previsto',
      },
    ],
    secoes: [
      {
        titulo: 'Itens do plano',
        colunas,
        linhas,
        total: linhaTotal(colunas, linhas, [7, 8, 9]),
      },
    ],
  };
}

/* ================================================================
   EXECUTAR
   ================================================================ */
const TEXTO_PAGAMENTO = {
  cancelada: 'Cancelada',
  quitada: 'Quitada',
  parcial: 'Paga em parte',
  aberta: 'Em aberto',
};

function modeloMedicoes(estado, o) {
  const rm = resumoMedicoes(o);
  const aberto = medicoesEmAberto(o);
  const comPendencia = medicoesComPendencia(o);
  const nAlerta = o.medicoes.filter(
    (m) => m.status !== 'Cancelado' && comPendencia.has(m.id),
  ).length;
  const prestadorDe = (base) => {
    const c = o.contratos.find(
      (x) => (x.codigoBase || x.codigo) === base && x.registro === 'Contrato',
    );
    return c ? nomeExibicao(c.prestador || '') : '';
  };
  const colunas = [
    col('Data', 'data'),
    col('Contrato'),
    col('Prestador'),
    col('Nº'),
    col('Medição'),
    soExcel('Progresso', 'pct'),
    soExcel('Valor medido', 'moeda'),
    soExcel('Desconto', 'moeda'),
    col('Líquido', 'moeda'),
    col('Pago', 'moeda'),
    col('A pagar', 'moeda'),
    soExcel('Data do pagamento', 'data'),
    soExcel('Status'),
    col('Situação'),
    soExcel('Documento'),
  ];
  const linhas = o.medicoes
    .slice()
    .sort((a, b) => String(a.data).localeCompare(String(b.data)))
    .map((m) => {
      const alerta = medicaoAlerta(o, m);
      return [
        dataOuVazio(m.data),
        m.contratoBase,
        prestadorDe(m.contratoBase),
        m.numero,
        m.descricao,
        num(m.progresso),
        num(m.valorMedido),
        num(m.desconto),
        medicaoLiquido(m),
        num(m.valorPago),
        medicaoAPagar(o, m),
        dataOuVazio(m.dataPagamento),
        m.status,
        alerta && alerta !== 'OK'
          ? alerta.charAt(0) + alerta.slice(1).toLowerCase()
          : TEXTO_PAGAMENTO[medicaoPagamento(o, m)],
        m.documento,
      ];
    });
  return {
    titulo: 'Medições',
    arquivo: 'medicoes',
    kpis: [
      {
        rotulo: 'Medido (líquido)',
        valor: reais(rm.medido),
        contexto: plural(o.medicoes.length, 'medição', 'medições'),
      },
      {
        rotulo: 'Pago aos prestadores',
        valor: reais(rm.pago),
        contexto: `${fmtPct(rm.medido ? rm.pago / rm.medido : 0, 0)} do medido`,
      },
      {
        rotulo: 'A pagar',
        valor: reais(aberto.total),
        contexto: aberto.itens.length ? `${aberto.itens.length} em aberto` : 'nada em aberto',
      },
      {
        rotulo: 'Com alerta',
        valor: String(nAlerta),
        contexto: nAlerta ? 'conferir antes de pagar' : 'nenhum alerta',
      },
    ],
    secoes: [
      {
        titulo: 'Medições',
        colunas,
        linhas,
        total: linhaTotal(colunas, linhas, [6, 7, 8, 9, 10]),
      },
    ],
  };
}

function modeloRecebimentos(estado, o) {
  const hoje = hojeISO();
  const k = indicadoresRecebimentos(o, hoje);
  const ps = podeSolicitar(o, hoje);
  const colunas = [
    col('Previsto para', 'data'),
    col('Origem'),
    col('Parcela'),
    soExcel('Nº'),
    col('Previsto', 'moeda'),
    soExcel('% de obra exigido', 'pct'),
    soExcel('Solicitada em', 'data'),
    soExcel('Aprovado', 'moeda'),
    soExcel('Descontos', 'moeda'),
    soExcel('Líquido esperado', 'moeda'),
    col('Recebido em', 'data'),
    col('Recebido', 'moeda'),
    col('Diferença', 'moeda'),
    col('Situação'),
  ];
  const linhas = o.recebimentos
    .slice()
    .sort((a, b) => String(a.dataPrevista || '9').localeCompare(String(b.dataPrevista || '9')))
    .map((r) => {
      const a = andamentoParcela(r, hoje);
      return [
        dataOuVazio(r.dataPrevista),
        r.origem,
        r.etapaPci || 'Parcela',
        r.numeroMedicao,
        num(r.valorPrevisto),
        num(r.percentExigido),
        dataOuVazio(r.dataSolicitacao),
        num(r.valorAprovado),
        num(r.descontos),
        recebimentoLiquido(r),
        dataOuVazio(r.dataRecebimento),
        num(r.valorRecebido),
        a.final ? recebimentoDiferenca(r) : '',
        a.texto,
      ];
    });
  return {
    titulo: 'Recebimentos',
    arquivo: 'recebimentos',
    kpis: [
      {
        rotulo: 'Recebido',
        valor: reais(k.recebido),
        contexto:
          k.pctRecebido === null ? 'nada previsto' : `${fmtPct(k.pctRecebido, 0)} do previsto`,
      },
      {
        rotulo: 'A receber',
        valor: reais(k.aReceber),
        contexto: k.proxima
          ? `próxima: ${reais(k.proxima.valor)} em ${fmtDataCurta(k.proxima.data)}`
          : k.aReceber > 0.005
            ? 'só parcelas vencidas'
            : 'nada a receber',
      },
      {
        rotulo: 'Atrasado',
        valor: reais(k.atrasado),
        contexto: k.nAtrasadas
          ? plural(k.nAtrasadas, 'parcela vencida', 'parcelas vencidas')
          : 'nada vencido',
      },
      ps
        ? {
            rotulo: 'Pode solicitar',
            valor: reais(ps.valor),
            contexto: `executado ${fmtPct(ps.executado, 0)} × liberado ${fmtPct(ps.liberado, 0)}`,
          }
        : { rotulo: 'Pode solicitar', valor: '—', contexto: 'sem valor financiado na obra' },
    ],
    secoes: [
      {
        titulo: 'Parcelas',
        colunas,
        linhas,
        total: linhaTotal(colunas, linhas, [4, 7, 8, 9, 11, 12]),
      },
    ],
  };
}

function modeloLancamentos(estado, o) {
  const r = resumoLancamentos(o);
  const c = r.porCategoria;
  const pct = (v) => (r.total > 0.005 ? `${fmtPct(v / r.total, 0)} do total` : '—');
  const colunas = [
    col('Data', 'data'),
    soExcel('Competência'),
    col('Descrição'),
    col('Tipo'),
    soExcel('Categoria'),
    col('Etapa'),
    col('Fornecedor'),
    soExcel('Documento'),
    soExcel('Quantidade', 'num'),
    soExcel('Unidade'),
    soExcel('Preço unitário', 'moeda'),
    soExcel('Desconto', 'moeda'),
    soExcel('Frete', 'moeda'),
    col('Total', 'moeda'),
    soExcel('Mão de obra (instalação)', 'moeda'),
    soExcel('Pagamento'),
  ];
  const linhas = o.lancamentos
    .slice()
    .sort((a, b) => String(a.data).localeCompare(String(b.data)))
    .map((l) => [
      dataOuVazio(l.data),
      competencia(l.data),
      l.descricao,
      l.tipo,
      ROTULO_CATEGORIA[categoriaLancamento(l)] || '',
      l.etapa,
      l.fornecedor,
      l.documento,
      num(l.quantidade),
      l.unidade,
      num(l.precoUnitario),
      num(l.desconto),
      num(l.frete),
      lancamentoTotal(l),
      num(l.valorMaoDeObra),
      l.formaPagamento,
    ]);

  /* resumo por mês: os mesmos lançamentos, somados por competência */
  const porMes = new Map();
  linhas.forEach((l) => {
    if (!l[1]) return;
    const m = porMes.get(l[1]) || { n: 0, v: 0 };
    m.n += 1;
    m.v += num(l[13]);
    porMes.set(l[1], m);
  });
  const colMes = [col('Mês'), col('Lançamentos', 'int'), col('Total', 'moeda')];
  const linhasMes = [...porMes.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([ym, m]) => [`${ym.slice(5, 7)}/${ym.slice(0, 4)}`, m.n, round2(m.v)]);

  return {
    titulo: 'Lançamentos',
    arquivo: 'lancamentos',
    kpis: [
      {
        rotulo: 'Total lançado',
        valor: reais(r.total),
        contexto: plural(r.n, 'lançamento', 'lançamentos'),
      },
      { rotulo: 'Material', valor: reais(c.material), contexto: pct(c.material) },
      { rotulo: 'Mão de obra e serviços', valor: reais(c.maoDeObra), contexto: pct(c.maoDeObra) },
      {
        rotulo: 'Taxas e extras',
        valor: reais(c.taxas + c.extras),
        contexto:
          r.naoObra.valor > 0.005
            ? `${reais(r.naoObra.valor)} fora da obra física`
            : 'nada fora da obra física',
      },
    ],
    secoes: [
      {
        titulo: 'Lançamentos',
        colunas,
        linhas,
        total: linhaTotal(colunas, linhas, [11, 12, 13, 14]),
      },
      ...(linhasMes.length > 1
        ? [
            {
              titulo: 'Por mês',
              colunas: colMes,
              linhas: linhasMes,
              total: ['Total', soma(linhasMes, 1), soma(linhasMes, 2)],
            },
          ]
        : []),
    ],
  };
}

function modeloDiario(estado, o) {
  const ind = diarioIndicadores(o);
  const totFotos = o.diario.reduce((s, d) => s + (d.fotos ? d.fotos.length : 0), 0);
  const colunas = [
    col('Data', 'data'),
    col('Clima'),
    col('Efetivo', 'int'),
    col('Etapa'),
    col('Atividades'),
    col('Ocorrências'),
    soExcel('Situação da ocorrência'),
    soExcel('Responsável pela ocorrência'),
    soExcel('Equipamentos'),
    soExcel('Impacta o prazo'),
    soExcel('Dias de impacto', 'int'),
    soExcel('Autor'),
    col('Fotos', 'int'),
  ];
  const linhas = o.diario
    .slice()
    .sort((a, b) => String(b.data).localeCompare(String(a.data)))
    .map((d) => [
      dataOuVazio(d.data),
      d.climaManha || d.climaTarde
        ? [d.climaManha && `manhã ${d.climaManha}`, d.climaTarde && `tarde ${d.climaTarde}`]
            .filter(Boolean)
            .join(' · ')
        : d.clima,
      efetivoDiario(d),
      d.etapa,
      d.atividades,
      d.ocorrencias,
      d.ocorrenciaStatus,
      d.ocorrenciaResponsavel,
      d.equipamentos,
      d.impactaPrazo ? 'Sim' : diaImpraticavel(d) ? 'Dia impraticável' : '',
      d.impactaPrazo ? num(d.diasImpacto) : '',
      d.autor,
      d.fotos ? d.fotos.length : 0,
    ]);
  return {
    titulo: 'Diário de obra',
    arquivo: 'diario',
    kpis: [
      {
        rotulo: 'Cobertura do diário',
        valor: ind.cobertura === null ? '—' : fmtPct(ind.cobertura, 0),
        contexto: `${ind.diasComRegistro} de ${ind.diasUteis} dias úteis`,
      },
      {
        rotulo: 'Sem registro há',
        valor: ind.semRegistroHa === null ? '—' : plural(ind.semRegistroHa, 'dia', 'dias'),
        contexto:
          ind.semRegistroHa === null
            ? 'nenhuma visita registrada'
            : `último em ${fmtDataCurta(ind.ultimo)}`,
      },
      {
        rotulo: 'Dias impraticáveis',
        valor: String(ind.diasImpraticaveis),
        contexto: ind.diasImpraticaveis ? 'base para aditivo de prazo' : 'nenhum registrado',
      },
      {
        rotulo: 'Ocorrências abertas',
        valor: String(ind.ocorrenciasAbertas),
        contexto: `${plural(totFotos, 'foto', 'fotos')} no diário`,
      },
    ],
    secoes: [{ titulo: 'Registros', colunas, linhas }],
  };
}

/* ================================================================
   ACOMPANHAR — Pendências
   ================================================================ */
const GRAVIDADE = { 3: 'Crítico', 2: 'Atenção', 1: 'Informativo' };

function modeloPendencias(estado, o) {
  const todos = alertasObra(o);
  const pend = pendenciasObra(o);
  const causas = causasRaizObra(o);
  const valorCausas = causas.reduce((s, c) => s + num(c.valor), 0);
  const nInfo = todos.filter((a) => a.sev === 1 && !a.silenciado).length;
  const colunas = [
    col('Gravidade'),
    col('Módulo'),
    col('Pendência'),
    col('Detalhe'),
    col('O que fazer'),
    col('Valor em jogo', 'moeda'),
  ];
  const linha = (a) => [
    GRAVIDADE[a.sev] || '',
    a.modulo,
    a.titulo,
    a.detalhe,
    a.acao,
    num(a.valor) || '',
  ];
  const vivos = todos
    .filter((a) => !a.silenciado)
    .sort((a, b) => b.sev - a.sev || num(b.valor) - num(a.valor))
    .map(linha);
  const tratados = todos.filter((a) => a.silenciado).map(linha);
  return {
    titulo: 'Pendências',
    arquivo: 'pendencias',
    kpis: [
      {
        rotulo: 'Problemas-raiz',
        valor: String(causas.length),
        contexto:
          valorCausas > 0.5
            ? `${reais(valorCausas)} em jogo`
            : causas.length
              ? 'sem valor em risco'
              : 'nada pendente',
      },
      {
        rotulo: 'Críticos',
        valor: String(pend.criticas),
        contexto: pend.criticas ? 'bloqueiam caixa ou entrega' : 'nada crítico',
      },
      {
        rotulo: 'Atenção',
        valor: String(pend.atencao),
        contexto: pend.atencao ? 'resolver nos próximos dias' : 'nada pendente',
      },
      {
        rotulo: 'Informativos',
        valor: String(nInfo),
        contexto: nInfo ? 'fora da contagem de pendências' : 'nenhum',
      },
    ],
    secoes: [
      { titulo: 'Em aberto', colunas, linhas: vivos },
      ...(tratados.length
        ? [{ titulo: 'Tratados · fora da contagem', colunas, linhas: tratados }]
        : []),
    ],
  };
}

/* ================================================================
   REGISTRO — view → modelo. `temDados` decide se o botão aparece:
   tela sem nada preenchido não tem o que exportar.
   ================================================================ */
const MODELOS = {
  clientes: { escopo: 'carteira', montar: modeloClientes, temDados: (e) => e.clientes.length > 0 },
  prestadores: {
    escopo: 'carteira',
    montar: modeloPrestadores,
    temDados: (e) => e.prestadores.some((p) => !p.arquivado),
  },
  'obra-config': { escopo: 'obra', montar: modeloObraConfig, temDados: (e, o) => !!o },
  contratos: {
    escopo: 'obra',
    montar: modeloContratos,
    temDados: (e, o) => !!o && o.contratos.length > 0,
  },
  cronograma: {
    escopo: 'obra',
    montar: modeloCronograma,
    temDados: (e, o) => !!o && o.cronograma.length > 0,
  },
  materiais: {
    escopo: 'obra',
    montar: modeloMateriais,
    temDados: (e, o) => !!o && o.materiais.length > 0,
  },
  medicoes: {
    escopo: 'obra',
    montar: modeloMedicoes,
    temDados: (e, o) => !!o && o.medicoes.length > 0,
  },
  recebimentos: {
    escopo: 'obra',
    montar: modeloRecebimentos,
    temDados: (e, o) => !!o && o.recebimentos.length > 0,
  },
  lancamentos: {
    escopo: 'obra',
    montar: modeloLancamentos,
    temDados: (e, o) => !!o && o.lancamentos.length > 0,
  },
  diario: { escopo: 'obra', montar: modeloDiario, temDados: (e, o) => !!o && o.diario.length > 0 },
  alertas: {
    escopo: 'obra',
    montar: modeloPendencias,
    temDados: (e, o) => !!o && alertasObra(o).length > 0,
  },
};

function podeExportar(view, estado, obra) {
  const m = MODELOS[view];
  if (!m) return false;
  if (m.escopo === 'obra' && !obra) return false;
  try {
    return !!m.temDados(estado, obra);
  } catch (e) {
    return false;
  }
}

function montarModelo(view, estado, obra) {
  const m = MODELOS[view];
  return m ? m.montar(estado, obra) : null;
}

/* ---------------------------------------------- formatação para o PDF */
function formatarValor(v, tipo) {
  if (v === '' || v === null || v === undefined) return '';
  switch (tipo) {
    case 'moeda':
      return fmtMoney(v);
    case 'num':
      return fmtNum(v, 2).replace(/,00$/, '');
    case 'int':
      return String(Math.round(num(v)));
    case 'pct':
      return fmtPct(v, 0);
    case 'data':
      return isISO(v) ? fmtData(v) : String(v);
    default:
      return String(v);
  }
}

export { MODELOS, podeExportar, montarModelo, formatarValor };
