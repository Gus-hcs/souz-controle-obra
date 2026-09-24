/**
 * telas/lancamentos.js — Compras, taxas e demais saídas sem medição.
 *
 * Uma linha por saída, mais recente primeiro. Lançamento sem etapa é o
 * único aviso da tela: sem etapa ele não entra no custo por etapa nem na
 * curva S, e isso passa despercebido se não estiver marcado.
 */
import {
  competencia,
  esc,
  fmtCompetencia,
  fmtDataCurta,
  fmtMoney,
  fmtMoneyCurto,
  fmtNum,
  fmtPct,
  norm,
  num,
} from '../../nucleo/base.js';
import { lancamentoTotal } from '../../dominio/calculos.js';
import { graficoBarras } from '../../graficos/index.js';
import { App, botao, opcoesEtapas, opcoesLista } from '../shell.js';
import { VIEWS } from '../telas-obra.js';
import {
  acoesRegistro,
  barraFiltros,
  botaoNovo,
  buscaToolbar,
  dinheiro,
  filtrando,
  lista,
  resumo,
  secao,
  seletor,
  vazioTela,
} from './componentes.js';

VIEWS.lancamentos = () => {
  const o = App.obra();
  const f = App.filtros;
  const todos = o.lancamentos;

  if (!todos.length) {
    return vazioTela({
      titulo: 'Nenhum lançamento',
      texto:
        'Registre aqui compras de material, taxas, honorários e serviços sem medição. Pagamento de prestador por medição vai em Medições.',
      acao: botao('Registrar lançamento', 'novo-lancamento', {}, 'btn primario', 'mais'),
    });
  }

  const totGeral = todos.reduce((s, l) => s + lancamentoTotal(l), 0);
  const totMat = todos
    .filter((l) => l.tipo === 'Material')
    .reduce((s, l) => s + lancamentoTotal(l), 0);
  const semEtapa = todos.filter((l) => !l.etapa);

  /* ------------------------------------------------------- filtros */
  const fornecedores = [...new Set(todos.map((l) => l.fornecedor).filter(Boolean))].sort();
  const meses = [...new Set(todos.map((l) => competencia(l.data)).filter(Boolean))]
    .sort()
    .reverse();
  const busca = norm(f.busca || '');
  let itens = todos.map((l) => ({ l, total: lancamentoTotal(l) }));
  if (f.tipo) itens = itens.filter((d) => d.l.tipo === f.tipo);
  if (f.etapa) itens = itens.filter((d) => d.l.etapa === f.etapa);
  if (f.fornecedor) itens = itens.filter((d) => d.l.fornecedor === f.fornecedor);
  if (f.mes) itens = itens.filter((d) => competencia(d.l.data) === f.mes);
  if (f.situacao === 'plano') itens = itens.filter((d) => d.l.materialId);
  if (f.situacao === 'avulso') itens = itens.filter((d) => !d.l.materialId);
  if (f.situacao === 'sem-etapa') itens = itens.filter((d) => !d.l.etapa);
  if (busca) {
    itens = itens.filter((d) =>
      norm(`${d.l.descricao} ${d.l.fornecedor} ${d.l.documento} ${d.l.categoria}`).includes(busca),
    );
  }

  /* -------------------------------------------------------- colunas */
  const colunas = [
    {
      k: 'data',
      rotulo: 'Data',
      largura: '8%',
      celular: 'some',
      valor: (d) => d.l.data || '',
      celula: (d) => `<span class="tinta2">${fmtDataCurta(d.l.data)}</span>`,
    },
    {
      k: 'descricao',
      rotulo: 'Descrição',
      largura: '33%',
      celular: 'principal',
      valor: (d) => d.l.descricao || '',
      celula: (d) => {
        const sub = [
          num(d.l.quantidade) && num(d.l.quantidade) !== 1
            ? `${fmtNum(d.l.quantidade, 2)} ${d.l.unidade || ''} × ${fmtMoney(d.l.precoUnitario)}`
            : null,
          d.l.materialId ? 'do plano de materiais' : null,
          d.l.documento || null,
        ]
          .filter(Boolean)
          .join(' · ');
        return `<div class="cel-dupla"><b>${esc(d.l.descricao || '—')}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</div>`;
      },
    },
    {
      k: 'tipo',
      rotulo: 'Tipo',
      largura: '11%',
      celular: 'some',
      valor: (d) => d.l.tipo || '',
      celula: (d) => `<span class="tinta2">${esc(d.l.tipo || '—')}</span>`,
    },
    {
      k: 'fornecedor',
      rotulo: 'Fornecedor',
      largura: '16%',
      celular: 'some',
      valor: (d) => d.l.fornecedor || '',
      celula: (d) => (d.l.fornecedor ? esc(d.l.fornecedor) : '<span class="tinta3">—</span>'),
    },
    {
      k: 'etapa',
      rotulo: 'Etapa',
      largura: '14%',
      celular: 'some',
      valor: (d) => d.l.etapa || '',
      celula: (d) =>
        d.l.etapa ? esc(d.l.etapa) : '<span class="cel-aviso-alerta">sem etapa</span>',
    },
    {
      k: 'total',
      rotulo: 'Total',
      largura: '12%',
      num: true,
      valor: (d) => d.total,
      celula: (d) => dinheiro(d.total),
      total: (ds) => dinheiro(ds.reduce((s, d) => s + d.total, 0)),
    },
    {
      k: 'acoes',
      rotulo: '',
      largura: '6%',
      celula: (d) => acoesRegistro('lancamento', d.l.id, d.l.descricao),
    },
  ];

  /* ------------------------------------------------- distribuição */
  const soma = (chave, rotuloVazio) => {
    const a = {};
    itens.forEach((d) => {
      const k = d.l[chave] || rotuloVazio;
      a[k] = (a[k] || 0) + d.total;
    });
    return Object.entries(a).map(([rotulo, valor]) => ({ rotulo, valor }));
  };
  const porTipo = soma('tipo', '—');
  const porEtapa = soma('etapa', 'Sem etapa');
  const graficos =
    itens.length > 1 && (porTipo.length > 1 || porEtapa.length > 1)
      ? secao(
          'Para onde foi o dinheiro',
          `<div class="grade-graficos">
            ${porTipo.length > 1 ? `<div><h3 class="sub-grafico">Por tipo</h3>${graficoBarras(porTipo, { formata: (v) => fmtMoneyCurto(v) })}</div>` : ''}
            ${porEtapa.length > 1 ? `<div><h3 class="sub-grafico">Por etapa</h3>${graficoBarras(porEtapa, { limite: 10, formata: (v) => fmtMoneyCurto(v) })}</div>` : ''}
          </div>`,
        )
      : '';

  return `<div class="tela-lista">
    ${resumo([
      {
        rotulo: 'Total lançado',
        valor: fmtMoney(totGeral, { dec: 0 }),
        nota: `${todos.length} lançamento${todos.length === 1 ? '' : 's'}`,
      },
      {
        rotulo: 'Compras de material',
        valor: fmtMoney(totMat, { dec: 0 }),
        nota: totGeral ? `${fmtPct(totMat / totGeral, 0)} do total` : '',
      },
      {
        rotulo: 'Sem etapa',
        valor: semEtapa.length ? `${semEtapa.length}` : 'nenhum',
        tom: semEtapa.length ? 'tom-alerta' : '',
        nota: semEtapa.length
          ? `${fmtMoney(
              semEtapa.reduce((s, l) => s + lancamentoTotal(l), 0),
              { dec: 0 },
            )} fora do custo por etapa`
          : 'tudo classificado',
      },
    ])}
    ${barraFiltros({
      mostrar:
        todos.length > 1 || filtrando(['tipo', 'etapa', 'fornecedor', 'mes', 'situacao', 'busca']),
      filtrados: itens.length,
      total: todos.length,
      controles: [
        seletor('tipo', opcoesLista('tiposSaida'), 'Todos os tipos'),
        seletor('etapa', opcoesEtapas(), 'Todas as etapas'),
        fornecedores.length > 1 ? seletor('fornecedor', fornecedores, 'Todos os fornecedores') : '',
        seletor(
          'situacao',
          [
            ['plano', 'Do plano de materiais'],
            ['avulso', 'Avulsos'],
            ['sem-etapa', 'Sem etapa'],
          ],
          'Qualquer origem',
        ),
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
      id: 'lancamentos',
      testid: 'lista-lancamentos',
      colunas,
      itens,
      ordemPadrao: { col: 'data', dir: -1 },
      rodapeRotulo: (n) => `${n} lançamentos`,
    })}
    ${graficos}
  </div>`;
};

VIEWS.lancamentos.toolbar = () => {
  const o = App.obra();
  if (!o || !o.lancamentos.length) return '';
  return (
    buscaToolbar('Buscar lançamento', 'busca-lancamentos') +
    botaoNovo('Novo lançamento', 'novo-lancamento')
  );
};
