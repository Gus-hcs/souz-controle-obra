/**
 * telas/lancamentos.js — Compras, taxas e demais saídas sem medição.
 *
 * Uma linha por saída, mais recente primeiro. Lançamento sem etapa é o
 * único aviso da tela: sem etapa ele não entra no custo por etapa nem na
 * curva S, e isso passa despercebido se não estiver marcado.
 *
 * O topo vem de resumoLancamentos; o ícone de duplicado, de
 * lancamentosDuplicados (a mesma regra do alerta); a natureza da saída
 * (Venda, Administração, Taxas, Terreno), de lancamentoNatureza.
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
  nomeExibicao,
  norm,
  num,
} from '../../nucleo/base.js';
import {
  lancamentoNatureza,
  lancamentosDuplicados,
  lancamentoTotal,
  ligadoAoPrestador,
  orcadoRealizadoPorEtapa,
  resumoLancamentos,
} from '../../dominio/calculos.js';
import { graficoBarras } from '../../graficos/index.js';
import { Store } from '../../dados/store.js';
import { ACOES } from '../acoes.js';
import { App, botao, ICO, opcoesEtapas, opcoesLista, svg } from '../shell.js';
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

  const r = resumoLancamentos(o);
  /* id → quantos iguais existem (para o title do ícone) */
  const duplicado = new Map();
  lancamentosDuplicados(o).forEach((ls) => ls.forEach((l) => duplicado.set(l.id, ls.length)));

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
  /* Vindo da ficha do prestador ("Ver todos os lançamentos"): só os dele. */
  const prestFiltro = f.prestadorId && Store.estado.prestadores.find((p) => p.id === f.prestadorId);
  if (prestFiltro)
    itens = itens.filter((d) => ligadoAoPrestador(prestFiltro, d.l.prestadorId, d.l.fornecedor));
  if (f.mes) itens = itens.filter((d) => competencia(d.l.data) === f.mes);
  if (f.situacao === 'plano') itens = itens.filter((d) => d.l.materialId);
  if (f.situacao === 'avulso') itens = itens.filter((d) => !d.l.materialId);
  if (f.situacao === 'sem-etapa') itens = itens.filter((d) => !d.l.etapa);
  if (f.situacao === 'duplicados') itens = itens.filter((d) => duplicado.has(d.l.id));
  if (f.situacao === 'nao-obra') itens = itens.filter((d) => lancamentoNatureza(d.l) !== 'Obra');
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
          /* frete e desconto mudam o total: sem eles a conta da linha não fecha */
          num(d.l.frete) ? `+${fmtMoney(d.l.frete, { dec: 0 })} frete` : null,
          num(d.l.desconto) ? `−${fmtMoney(d.l.desconto, { dec: 0 })} desc.` : null,
          d.l.materialId ? 'do plano de materiais' : null,
          d.l.documento || null,
        ]
          .filter(Boolean)
          .join(' · ');
        const dup = duplicado.get(d.l.id);
        const marca = dup
          ? `<span class="marca-duplicado" title="${dup} lançamentos iguais: mesma data, fornecedor e valor" aria-label="possível duplicado">${svg(ICO.alerta, 12)}</span>`
          : '';
        /* clipe da NF (0019): abre a foto da nota */
        const nf = d.l.anexoNf
          ? `<button class="btn-link marca-nf" data-acao="ver-nf" data-id="${esc(d.l.id)}" title="Ver a foto da nota" aria-label="Ver a foto da nota de ${esc(d.l.descricao || '')}">${svg(ICO.clipe, 12)}</button>`
          : '';
        return `<div class="cel-dupla"><b>${marca}${esc(d.l.descricao || '—')}${nf}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</div>`;
      },
    },
    {
      k: 'tipo',
      rotulo: 'Tipo',
      largura: '11%',
      celular: 'some',
      valor: (d) => d.l.tipo || '',
      celula: (d) =>
        `<span class="tinta2" title="natureza: ${esc(lancamentoNatureza(d.l))}">${esc(d.l.tipo || '—')}</span>`,
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
  /* Por natureza (Obra, Venda, Administração, Taxas, Terreno): comissão
     de corretor e honorário não se misturam com o custo da casa. */
  const porNatureza = (() => {
    const a = {};
    itens.forEach((d) => {
      const k = lancamentoNatureza(d.l);
      a[k] = (a[k] || 0) + d.total;
    });
    return Object.entries(a).map(([rotulo, valor]) => ({ rotulo, valor }));
  })();
  const porEtapa = soma('etapa', 'Sem etapa');
  const graficos =
    itens.length > 1 && (porNatureza.length > 1 || porEtapa.length > 1)
      ? secao(
          'Para onde foi o dinheiro',
          `<div class="grade-graficos">
            ${porNatureza.length > 1 ? `<div><h3 class="sub-grafico">Por natureza</h3>${graficoBarras(porNatureza, { formata: (v) => fmtMoneyCurto(v) })}</div>` : ''}
            ${porEtapa.length > 1 ? `<div><h3 class="sub-grafico">Por etapa</h3>${graficoBarras(porEtapa, { limite: 10, formata: (v) => fmtMoneyCurto(v) })}</div>` : ''}
          </div>`,
        )
      : '';

  /* orçado × realizado por etapa (orcadoRealizadoPorEtapa): plano de
     materiais + contratos ligados às etapas, contra o que saiu */
  const orr = orcadoRealizadoPorEtapa(o);
  const tabelaOrcado = orr.length
    ? secao(
        'Orçado × realizado por etapa',
        `<div class="tab-rolagem"><table class="tab">
          <thead><tr><th>Etapa</th><th class="num">Orçado</th><th class="num">Realizado</th><th class="num">Diferença</th><th class="num">Consumido</th></tr></thead>
          <tbody>${orr.map((l) => `<tr>
            <td>${esc(l.etapa)}</td>
            <td class="num">${l.orcado > 0.005 ? esc(fmtMoney(l.orcado, { dec: 0 })) : '<span class="tinta3">sem orçamento</span>'}</td>
            <td class="num">${esc(fmtMoney(l.realizado, { dec: 0 }))}</td>
            <td class="num ${l.orcado > 0.005 && l.diferenca > 0.5 ? 'atraso' : ''}">${l.orcado > 0.005 ? `${l.diferenca > 0 ? '+' : l.diferenca < 0 ? '−' : ''}${esc(fmtMoney(Math.abs(l.diferenca), { dec: 0 }))}` : '—'}</td>
            <td class="num ${l.consumido !== null && l.consumido > 1 ? 'atraso' : ''}">${l.consumido === null ? '—' : fmtPct(l.consumido, 0)}</td>
          </tr>`).join('')}</tbody></table></div>
        <p class="tinta3" style="font-size:var(--t-peq);margin:var(--e2) 0 0">Orçado = plano de materiais + contratos ligados às etapas (em Contratos, "Etapas que este contrato executa").</p>`,
      )
    : '';

  return `<div class="tela-lista">
    ${resumo([
      {
        rotulo: 'Total lançado',
        valor: fmtMoney(r.total, { dec: 0 }),
        nota: `${r.n} lançamento${r.n === 1 ? '' : 's'}${
          r.naoObra.valor > 0.005 ? ` · ${fmtMoney(r.naoObra.valor, { dec: 0 })} fora da obra física` : ''
        }`,
      },
      {
        rotulo: 'Compras de material',
        valor: fmtMoney(r.material, { dec: 0 }),
        nota: r.total ? `${fmtPct(r.material / r.total, 0)} do total` : '',
      },
      {
        rotulo: 'Sem etapa',
        valor: r.semEtapa.n ? `${r.semEtapa.n}` : 'nenhum',
        tom: r.semEtapa.n ? 'tom-alerta' : '',
        nota: r.semEtapa.n
          ? `${fmtMoney(r.semEtapa.valor, { dec: 0 })} fora do custo por etapa`
          : 'tudo classificado',
      },
    ])}
    ${barraFiltros({
      mostrar:
        todos.length > 1 ||
        filtrando(['tipo', 'etapa', 'fornecedor', 'mes', 'situacao', 'busca', 'prestadorId']),
      filtrados: itens.length,
      total: todos.length,
      controles: [
        prestFiltro
          ? `<button class="pilula ativa" data-acao="lanc-sem-prestador" title="Tirar o filtro de prestador">
              ${esc(nomeExibicao(prestFiltro.nome))} <span aria-hidden="true">✕</span></button>`
          : '',
        seletor('tipo', opcoesLista('tiposSaida'), 'Todos os tipos'),
        seletor('etapa', opcoesEtapas(), 'Todas as etapas'),
        fornecedores.length > 1 ? seletor('fornecedor', fornecedores, 'Todos os fornecedores') : '',
        seletor(
          'situacao',
          [
            ['plano', 'Do plano de materiais'],
            ['avulso', 'Avulsos'],
            ['sem-etapa', 'Sem etapa'],
            ['duplicados', 'Possíveis duplicados'],
            ['nao-obra', 'Fora da obra física'],
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
    ${tabelaOrcado}
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

/* Tira o filtro de prestador que veio da ficha dele. */
ACOES['lanc-sem-prestador'] = () => {
  delete App.filtros.prestadorId;
  App.renderConteudo();
};
