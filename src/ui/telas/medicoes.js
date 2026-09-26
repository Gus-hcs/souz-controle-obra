/**
 * telas/medicoes.js — Medições de prestadores, na linguagem nova.
 *
 * Uma linha por medição, em uma altura só: data, contrato, o que foi
 * medido, e os três valores que importam — líquido, pago, a pagar. A
 * situação é texto cinza; só o alerta que exige ação ganha cor.
 *
 * "A pagar" é a soma de medicaoAPagar (já sem retenção) — o KPI e a
 * coluna dão o mesmo número — e diz a idade da conta mais antiga
 * (medicoesEmAberto). Pagamento parcial fica âmbar na Situação
 * (medicaoPagamento).
 */
import {
  competencia,
  esc,
  fmtCompetencia,
  fmtDataCurta,
  fmtMoney,
  fmtMoneyCurto,
  fmtPct,
  isISO,
  norm,
  num,
} from '../../nucleo/base.js';
import {
  medicaoAPagar,
  medicaoAlerta,
  medicaoLiquido,
  medicaoPagamento,
  medicoesComPendencia,
  medicoesEmAberto,
  medidoFisicoContrato,
  resumoMedicoes,
} from '../../dominio/calculos.js';
import { graficoBarras } from '../../graficos/index.js';
import { ACOES } from '../acoes.js';
import { App, botao } from '../shell.js';
import { VIEWS } from '../telas-obra.js';
import {
  acoesRegistro,
  barraFiltros,
  botaoNovo,
  buscaToolbar,
  dinheiro,
  faixaKpis,
  lista,
  painelAnalise,
  vazioTela,
} from './componentes.js';

/* Alerta que é erro de dinheiro (pagou demais, estourou o contrato) é
   vermelho; o resto é âmbar. */
const ALERTA_GRAVE = new Set(['PAGO ACIMA DA MEDIÇÃO', 'CONTRATO ULTRAPASSADO']);

/* Situação calculada (a pagar, pago em parte, quitada), nunca o status
   digitado — é o que vira pílula de filtro. */
const SITUACOES_MEDICAO = [
  {
    valor: 'aberto',
    rotulo: 'A pagar',
    pertence: (d) => d.m.status !== 'Cancelado' && d.falta > 0.005,
  },
  { valor: 'parcial', rotulo: 'Pagas em parte', pertence: (d) => d.pagamento === 'parcial' },
  {
    valor: 'pagas',
    rotulo: 'Quitadas',
    pertence: (d) => d.m.status !== 'Cancelado' && d.falta <= 0.005,
  },
  { valor: 'canceladas', rotulo: 'Canceladas', pertence: (d) => d.m.status === 'Cancelado' },
];

/* --------------------------------------------------------------- KPIs
   Medido e Pago são só leitura; A pagar e Com alerta filtram a lista ao
   clicar — mesmo padrão de telas/contratos.js, telas/cronograma.js e
   telas/materiais.js. */
function kpisMedicoes(itensTodos, totMed, totPago, aberto, comAlerta) {
  const n = aberto.itens.length;
  const idade = aberto.maisAntiga
    ? ` · a mais antiga há ${aberto.maisAntiga.dias} dia${aberto.maisAntiga.dias === 1 ? '' : 's'}`
    : '';
  return faixaKpis(
    [
      {
        chave: 'medido',
        rotulo: 'Medido (líquido)',
        valor: fmtMoney(totMed, { dec: 0 }),
        contexto: `${itensTodos.length} mediç${itensTodos.length === 1 ? 'ão' : 'ões'}`,
        filtra: false,
      },
      {
        chave: 'pago',
        rotulo: 'Pago aos prestadores',
        valor: fmtMoney(totPago, { dec: 0 }),
        contexto: `${fmtPct(totMed ? totPago / totMed : 0, 0)} do medido`,
        filtra: false,
      },
      {
        chave: 'aberto',
        rotulo: 'A pagar',
        valor: fmtMoney(aberto.total, { dec: 0 }),
        contexto: n ? `${n} em aberto${idade}` : 'nada em aberto',
        tom: !n ? '' : aberto.maisAntiga && aberto.maisAntiga.dias > 60 ? 'atraso' : 'tom-alerta',
      },
      {
        chave: 'alerta',
        rotulo: 'Com alerta',
        valor: comAlerta.length,
        contexto: comAlerta.length ? 'confira antes de pagar' : 'nenhum alerta',
        tom: comAlerta.length ? 'atraso' : '',
      },
    ],
    { rotulo: 'Indicadores de medições', acao: 'med-kpi', ativo: App.filtros.kpiMed },
  );
}

ACOES['med-kpi'] = (el, d) => {
  App.filtros.kpiMed = App.filtros.kpiMed === d.kpi ? '' : d.kpi;
  App.renderConteudo();
};

/* Medido × físico: duas barras por contrato — o que foi medido e o físico
   das etapas dele. Medido mais de 5 p.p. à frente fica em destaque, com o
   valor adiantado. */
function blocoMedidoFisico(linhas) {
  if (!linhas.length) {
    return '<p class="tinta2 painel-vazio">Sem contrato com etapas ou físico para comparar.</p>';
  }
  const barra = (v, classe) =>
    `<span class="mf-trilha"><i class="${classe}" style="width:${(Math.max(0, Math.min(1, v)) * 100).toFixed(1)}%"></i></span>`;
  return `<ul class="mf-lista">${linhas
    .map(
      (l) => `<li class="${l.alerta ? 'mf-alerta' : ''}">
        <div class="mf-cab"><b>${esc(l.base)}</b><span class="tinta2">${esc(l.prestador || '')}</span>
          <span class="mf-dif ${l.alerta ? 'atraso' : 'tinta2'}">${l.alerta ? `medido ${Math.round(l.diferenca * 100)} p.p. à frente · ${fmtMoney(l.adiantado, { dec: 0 })} adiantados` : l.diferenca < -0.05 ? 'físico à frente' : 'em linha'}</span></div>
        <div class="mf-linha"><span class="tinta2">Medido</span>${barra(l.medido, 'mf-medido')}<span class="num">${fmtPct(l.medido, 0)}</span></div>
        <div class="mf-linha"><span class="tinta2">Físico${l.pelaObra ? ' da obra' : ''}</span>${barra(l.fisico, 'mf-fisico')}<span class="num">${fmtPct(l.fisico, 0)}</span></div>
      </li>`,
    )
    .join('')}</ul>`;
}

VIEWS.medicoes = () => {
  const o = App.obra();
  const f = App.filtros;

  const prestadorDe = (base) => {
    const c =
      o.contratos.find((x) => x.codigoBase === base && x.registro === 'Contrato') ||
      o.contratos.find((x) => x.codigoBase === base);
    return (c && c.prestador) || '';
  };

  if (!o.medicoes.length) {
    return vazioTela({
      titulo: 'Nenhuma medição registrada',
      texto: o.contratos.length
        ? 'Registre aqui a medição de cada prestador. Pagamento por medição entra só nesta tela — nunca em Lançamentos, para não contar duas vezes.'
        : 'Medição é sempre de um contrato. Cadastre o contrato do prestador primeiro.',
      acao: o.contratos.length
        ? botao('Registrar medição', 'nova-medicao', {}, 'btn primario', 'mais')
        : botao('Cadastrar contrato', 'ir', { view: 'contratos' }, 'btn primario'),
    });
  }

  /* -------------------------------------------------------- totais */
  const rm = resumoMedicoes(o);
  const ativas = o.medicoes.filter((m) => m.status !== 'Cancelado');
  const totMed = rm.medido;
  const totPago = rm.pago;
  const aberto = medicoesEmAberto(o);
  /* Mesma regra do menu e da tela de Alertas (pendenciasObra): conta também
     a medição em aberto há muito tempo, não só o erro de valor. */
  const comPendencia = medicoesComPendencia(o);
  const comAlerta = ativas.filter((m) => comPendencia.has(m.id));

  /* ------------------------------------------------------- filtros */
  const bases = [...new Set(o.contratos.map((c) => c.codigoBase).filter(Boolean))];
  const prestadores = [...new Set(o.contratos.map((c) => c.prestador).filter(Boolean))].sort();
  const meses = [...new Set(o.medicoes.map((m) => competencia(m.data)).filter(Boolean))]
    .sort()
    .reverse();
  const busca = norm(f.busca || '');

  const todosItens = o.medicoes.map((m) => {
    const liq = medicaoLiquido(m);
    const pago = num(m.valorPago);
    return {
      m,
      liq,
      pago,
      falta: medicaoAPagar(o, m),
      pagamento: medicaoPagamento(o, m),
      alerta: medicaoAlerta(o, m),
      prestador: prestadorDe(m.contratoBase),
    };
  });
  let itens = todosItens;
  if (f.base) itens = itens.filter((d) => d.m.contratoBase === f.base);
  if (f.prestador) itens = itens.filter((d) => d.prestador === f.prestador);
  if (f.mes) itens = itens.filter((d) => competencia(d.m.data) === f.mes);
  const situacaoMed = SITUACOES_MEDICAO.find((x) => x.valor === f.situacao);
  if (situacaoMed) itens = itens.filter(situacaoMed.pertence);
  if (f.kpiMed === 'aberto')
    itens = itens.filter((d) => d.m.status !== 'Cancelado' && d.falta > 0.005);
  if (f.kpiMed === 'alerta') itens = itens.filter((d) => comPendencia.has(d.m.id));
  if (busca) {
    itens = itens.filter((d) =>
      norm(
        `${d.m.contratoBase} ${d.m.descricao} ${d.m.documento} ${d.m.numero} ${d.prestador}`,
      ).includes(busca),
    );
  }

  const fisicoPorContrato = new Map(bases.map((b) => [b, medidoFisicoContrato(o, b)]));

  /* -------------------------------------------------------- colunas */
  const colunas = [
    {
      k: 'data',
      rotulo: 'Data',
      largura: '8%',
      celular: 'some',
      valor: (d) => d.m.data || '',
      celula: (d) => `<span class="tinta2">${fmtDataCurta(d.m.data)}</span>`,
    },
    {
      k: 'contrato',
      rotulo: 'Contrato',
      largura: '18%',
      celular: 'some',
      valor: (d) => d.m.contratoBase || '',
      celula: (d) =>
        `<div class="cel-dupla"><b>${esc(d.m.contratoBase || '—')}</b>${d.prestador ? `<span>${esc(d.prestador)}</span>` : ''}</div>`,
    },
    {
      k: 'numero',
      rotulo: 'Nº',
      largura: '5%',
      celular: 'some',
      valor: (d) => Number(d.m.numero) || d.m.numero || '',
      celula: (d) => (d.m.numero ? esc(d.m.numero) : '<span class="tinta3">—</span>'),
    },
    {
      k: 'descricao',
      rotulo: 'Medição',
      largura: '13%',
      celular: 'principal',
      valor: (d) => d.m.descricao || '',
      /* no celular o nº e o % somem como coluna: voltam na linha de baixo */
      celula: (d) => {
        const cel = [
          d.m.numero ? `nº ${d.m.numero}` : null,
          num(d.m.progresso) ? fmtPct(d.m.progresso, 0) : null,
        ].filter(Boolean);
        return `<div class="cel-dupla"><b>${esc(d.m.descricao || '—')}</b>${
          d.m.documento ? `<span>${esc(d.m.documento)}</span>` : ''
        }${cel.length ? `<span class="so-celular">${esc(cel.join(' · '))}</span>` : ''}</div>`;
      },
    },
    {
      k: 'progresso',
      rotulo: '% × físico',
      largura: '9%',
      num: true,
      celular: 'some',
      valor: (d) => num(d.m.progresso),
      /* o % medido e, embaixo, o físico do contrato (medidoFisicoContrato):
         medir à frente do físico é pagar o que não está na obra */
      celula: (d) => {
        const mf = fisicoPorContrato.get(d.m.contratoBase);
        const pct = num(d.m.progresso) ? fmtPct(d.m.progresso, 0) : '—';
        return mf
          ? `<div class="cel-num-nota"><span>${pct}</span><span class="${mf.alerta ? 'atraso' : ''}">físico ${fmtPct(mf.fisico, 0)}</span></div>`
          : num(d.m.progresso) ? pct : '<span class="tinta3">—</span>';
      },
    },
    {
      k: 'liquido',
      rotulo: 'Líquido',
      largura: '11%',
      num: true,
      valor: (d) => d.liq,
      celula: (d) => dinheiro(d.liq),
      total: (ds) => dinheiro(ds.reduce((s, d) => s + d.liq, 0)),
    },
    {
      k: 'pago',
      rotulo: 'Pago',
      largura: '11%',
      num: true,
      celular: 'some',
      valor: (d) => d.pago,
      /* A data do pagamento vai no title: numa linha só, ela não cabe, e
         quase nunca é o que se procura ao bater o olho. */
      celula: (d) =>
        `<span title="${isISO(d.m.dataPagamento) ? `pago em ${fmtDataCurta(d.m.dataPagamento)}` : ''}">${dinheiro(d.pago, { cinzaNoZero: true })}</span>`,
      total: (ds) => dinheiro(ds.reduce((s, d) => s + d.pago, 0)),
    },
    {
      k: 'falta',
      rotulo: 'A pagar',
      largura: '11%',
      num: true,
      valor: (d) => d.falta,
      celula: (d) => dinheiro(d.falta, { cinzaNoZero: true }),
      total: (ds) => dinheiro(ds.reduce((s, d) => s + d.falta, 0)),
    },
    {
      k: 'situacao',
      rotulo: 'Situação',
      largura: '13%',
      valor: (d) => (d.alerta && d.alerta !== 'OK' ? '0' + d.alerta : '1' + d.m.status),
      /* O alerta, quando existe, é mais importante que o status: toma o lugar
         dele. Em minúsculas — caixa alta era grito. */
      celula: (d) => {
        if (d.alerta && d.alerta !== 'OK') {
          const cls = ALERTA_GRAVE.has(d.alerta) ? 'atraso' : 'cel-aviso-alerta';
          const txt = d.alerta.charAt(0) + d.alerta.slice(1).toLowerCase();
          return `<span class="${cls}" title="${esc(d.m.status)}">${esc(txt)}</span>`;
        }
        /* pagou parte e falta parte: âmbar, qualquer que seja o status */
        if (d.pagamento === 'parcial') {
          return `<span class="cel-aviso-alerta" title="status: ${esc(d.m.status || '—')}">Pago em parte</span>`;
        }
        return `<span class="tinta2">${esc(d.m.status || '—')}</span>`;
      },
    },
    {
      k: 'acoes',
      rotulo: '',
      largura: '6%',
      celula: (d) =>
        acoesRegistro('medicao', d.m.id, d.m.descricao || `medição ${d.m.numero || ''}`),
    },
  ];

  /* ------------------------------------------------ a pagar por contrato */
  const porContrato = rm.aPagarPorContrato.map((x) => ({
    rotulo: `${x.base} · ${x.prestador || '—'}`,
    valor: x.valor,
  }));

  return `<div class="tela-lista">
    ${kpisMedicoes(ativas, totMed, totPago, aberto, comAlerta)}
    ${barraFiltros({
      pilulas: {
        chave: 'situacao',
        todos: 'Todas',
        total: todosItens.length,
        opcoes: SITUACOES_MEDICAO.map((x) => ({
          valor: x.valor,
          rotulo: x.rotulo,
          n: todosItens.filter(x.pertence).length,
        })),
      },
      mais: [
        {
          chave: 'base',
          rotulo: 'Contrato',
          todos: 'Todos os contratos',
          opcoes: bases.map((b) => [
            b,
            prestadorDe(b) ? `${b} · ${prestadorDe(b)}` : b,
            todosItens.filter((d) => d.m.contratoBase === b).length,
          ]),
        },
        {
          chave: 'prestador',
          rotulo: 'Prestador',
          todos: 'Todos os prestadores',
          opcoes: prestadores.map((p) => [p, p, todosItens.filter((d) => d.prestador === p).length]),
        },
        {
          chave: 'mes',
          rotulo: 'Mês',
          todos: 'Todos os meses',
          opcoes: meses.map((ym) => [
            ym,
            fmtCompetencia(ym),
            todosItens.filter((d) => competencia(d.m.data) === ym).length,
          ]),
        },
      ],
      filtrados: itens.length,
      total: o.medicoes.length,
    })}
    ${lista({
      id: 'medicoes',
      testid: 'lista-medicoes',
      colunas,
      itens,
      ordemPadrao: { col: 'data', dir: -1 },
      rodapeRotulo: (n) => `${n} medições`,
    })}
    <p class="nota-rodape">Pagamento por medição entra só nesta tela. Compras, taxas e serviços sem
      medição vão em Lançamentos; entradas de financiamento ou do cliente, em Recebimentos.</p>
    ${painelAnalise([
      {
        titulo: 'A pagar por contrato',
        conteudo: porContrato.length
          ? graficoBarras(porContrato, { formata: (v) => fmtMoneyCurto(v), cor: 'var(--serie2)' })
          : '<p class="tinta2 painel-vazio">Nada a pagar.</p>',
      },
      {
        titulo: 'Medido × físico por contrato',
        nota: 'medido à frente do físico = pagou serviço ainda não feito',
        conteudo: blocoMedidoFisico(rm.medidoFisico),
      },
    ])}
  </div>`;
};

VIEWS.medicoes.toolbar = () => {
  const o = App.obra();
  if (!o || !o.medicoes.length) return '';
  return (
    buscaToolbar('Buscar medição', 'busca-medicoes') + botaoNovo('Nova medição', 'nova-medicao')
  );
};
