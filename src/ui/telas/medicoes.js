/**
 * telas/medicoes.js — Medições de prestadores, na linguagem nova.
 *
 * Uma linha por medição, em uma altura só: data, contrato, o que foi
 * medido, e os três valores que importam — líquido, pago, a pagar. A
 * situação é texto cinza; só o alerta que exige ação ganha cor.
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
  round2,
} from '../../nucleo/base.js';
import { medicaoAlerta, medicaoLiquido } from '../../dominio/calculos.js';
import { graficoBarras } from '../../graficos/index.js';
import { ACOES } from '../acoes.js';
import { App, botao, opcoesLista } from '../shell.js';
import { VIEWS } from '../telas-obra.js';
import {
  acoesRegistro,
  barraFiltros,
  botaoNovo,
  buscaToolbar,
  dinheiro,
  filtrando,
  lista,
  secao,
  seletor,
  vazioTela,
} from './componentes.js';

/* Alerta que é erro de dinheiro (pagou demais, estourou o contrato) é
   vermelho; o resto é âmbar. */
const ALERTA_GRAVE = new Set(['PAGO ACIMA DA MEDIÇÃO', 'CONTRATO ULTRAPASSADO']);

/* --------------------------------------------------------------- KPIs
   Medido e Pago são só leitura; A pagar e Com alerta filtram a lista ao
   clicar — mesmo padrão de telas/contratos.js, telas/cronograma.js e
   telas/materiais.js. */
function kpisMedicoes(itensTodos, totMed, totPago, emAberto, comAlerta) {
  const item = (chave, rotulo, valor, contexto, tom = '', filtravel = false) => {
    const ativo = filtravel && App.filtros.kpiMed === chave;
    return `<div class="kpi-item${ativo ? ' ativo' : ''}"${filtravel ? ` data-acao="med-kpi" data-kpi="${chave}" role="button" tabindex="0" aria-pressed="${ativo}" title="Filtrar a lista"` : ''}>
      <span class="kpi-rot">${esc(rotulo)}</span>
      <span class="kpi-val${tom ? ' ' + tom : ''}">${valor}</span>
      <span class="kpi-ctx">${contexto}</span>
    </div>`;
  };

  return `<div class="kpis" role="group" aria-label="Indicadores de medições">
    ${item('medido', 'Medido (líquido)', fmtMoney(totMed, { dec: 0 }), `${itensTodos.length} mediç${itensTodos.length === 1 ? 'ão' : 'ões'}`)}
    ${item('pago', 'Pago aos prestadores', fmtMoney(totPago, { dec: 0 }), `${fmtPct(totMed ? totPago / totMed : 0, 0)} do medido`)}
    ${item(
      'aberto',
      'A pagar',
      fmtMoney(totMed - totPago, { dec: 0 }),
      emAberto.length ? `${emAberto.length} em aberto` : 'nada em aberto',
      emAberto.length ? 'tom-alerta' : '',
      true,
    )}
    ${item(
      'alerta',
      'Com alerta',
      comAlerta.length,
      comAlerta.length ? 'confira antes de pagar' : 'nenhum alerta',
      comAlerta.length ? 'atraso' : '',
      true,
    )}
  </div>`;
}

ACOES['med-kpi'] = (el, d) => {
  App.filtros.kpiMed = App.filtros.kpiMed === d.kpi ? '' : d.kpi;
  App.renderConteudo();
};

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
  const ativas = o.medicoes.filter((m) => m.status !== 'Cancelado');
  const totMed = ativas.reduce((s, m) => s + medicaoLiquido(m), 0);
  const totPago = ativas.reduce((s, m) => s + num(m.valorPago), 0);
  const emAberto = ativas.filter((m) => medicaoLiquido(m) - num(m.valorPago) > 0.005);
  const comAlerta = ativas.filter((m) => {
    const al = medicaoAlerta(o, m);
    return al && al !== 'OK';
  });

  /* ------------------------------------------------------- filtros */
  const bases = [...new Set(o.contratos.map((c) => c.codigoBase).filter(Boolean))];
  const prestadores = [...new Set(o.contratos.map((c) => c.prestador).filter(Boolean))].sort();
  const meses = [...new Set(o.medicoes.map((m) => competencia(m.data)).filter(Boolean))]
    .sort()
    .reverse();
  const busca = norm(f.busca || '');

  let itens = o.medicoes.map((m) => {
    const liq = medicaoLiquido(m);
    const pago = num(m.valorPago);
    return {
      m,
      liq,
      pago,
      falta: liq - pago,
      alerta: medicaoAlerta(o, m),
      prestador: prestadorDe(m.contratoBase),
    };
  });
  if (f.base) itens = itens.filter((d) => d.m.contratoBase === f.base);
  if (f.prestador) itens = itens.filter((d) => d.prestador === f.prestador);
  if (f.status) itens = itens.filter((d) => d.m.status === f.status);
  if (f.mes) itens = itens.filter((d) => competencia(d.m.data) === f.mes);
  if (f.situacao === 'pagas')
    itens = itens.filter((d) => d.m.status !== 'Cancelado' && d.falta <= 0.005);
  if (f.kpiMed === 'aberto')
    itens = itens.filter((d) => d.m.status !== 'Cancelado' && d.falta > 0.005);
  if (f.kpiMed === 'alerta') itens = itens.filter((d) => d.alerta && d.alerta !== 'OK');
  if (busca) {
    itens = itens.filter((d) =>
      norm(
        `${d.m.contratoBase} ${d.m.descricao} ${d.m.documento} ${d.m.numero} ${d.prestador}`,
      ).includes(busca),
    );
  }

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
      k: 'descricao',
      rotulo: 'Medição',
      largura: '22%',
      celular: 'principal',
      valor: (d) => d.m.descricao || '',
      celula: (d) => {
        const sub = [
          d.m.numero ? `nº ${d.m.numero}` : null,
          num(d.m.progresso) ? fmtPct(d.m.progresso, 0) : null,
          d.m.documento || null,
        ]
          .filter(Boolean)
          .join(' · ');
        return `<div class="cel-dupla"><b>${esc(d.m.descricao || '—')}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</div>`;
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
  const porContrato = bases
    .map((base) => ({
      rotulo: `${base} · ${prestadorDe(base) || '—'}`,
      valor: round2(
        ativas
          .filter((m) => m.contratoBase === base)
          .reduce((s, m) => s + medicaoLiquido(m) - num(m.valorPago), 0),
      ),
    }))
    .filter((x) => x.valor > 0.005);

  return `<div class="tela-lista">
    ${kpisMedicoes(ativas, totMed, totPago, emAberto, comAlerta)}
    ${barraFiltros({
      mostrar:
        o.medicoes.length > 1 ||
        filtrando(['base', 'prestador', 'status', 'mes', 'situacao', 'kpiMed', 'busca']),
      filtrados: itens.length,
      total: o.medicoes.length,
      controles: [
        bases.length > 1 ? seletor('base', bases, 'Todos os contratos') : '',
        prestadores.length > 1 ? seletor('prestador', prestadores, 'Todos os prestadores') : '',
        seletor('status', opcoesLista('statusPagamento'), 'Todos os status'),
        seletor('situacao', [['pagas', 'Quitadas']], 'Todas as medições'),
        meses.length > 1
          ? seletor(
              'mes',
              meses.map((ym) => [ym, fmtCompetencia(ym)]),
              'Todos os meses',
            )
          : '',
      ],
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
    ${porContrato.length > 1 ? secao('A pagar por contrato', graficoBarras(porContrato, { formata: (v) => fmtMoneyCurto(v), cor: 'var(--alerta)' })) : ''}
  </div>`;
};

VIEWS.medicoes.toolbar = () => {
  const o = App.obra();
  if (!o || !o.medicoes.length) return '';
  return (
    buscaToolbar('Buscar medição', 'busca-medicoes') + botaoNovo('Nova medição', 'nova-medicao')
  );
};
