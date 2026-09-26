/**
 * telas/lancamentos.js — Compras, taxas e demais saídas sem medição.
 *
 * A faixa de cima diz para onde foi o dinheiro nas quatro categorias de
 * saída (categoriaLancamento): material, mão de obra e serviços, taxas e
 * extras. A lista vem agrupada por mês, com o subtotal no cabeçalho do
 * grupo (lancamentosPorMes). Cada linha: descrição com o detalhe embaixo
 * (quantidade × preço, frete, NF), tipo com o ponto da categoria, o
 * vínculo com o plano de materiais e o clipe da nota. Suspeita de
 * duplicado vem explicada, com "Não é duplicado" (tratamento do alerta,
 * lancamentosDuplicadosAbertos) e "Excluir este". Clicar na linha abre o
 * inspetor com tudo — anexo, vínculos e a trilha de alterações.
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
  hojeISO,
  isISO,
  nomeExibicao,
  norm,
  num,
} from '../../nucleo/base.js';
import {
  alertasObra,
  categoriaLancamento,
  CATEGORIAS_SAIDA,
  composicaoPorTipo,
  gastoPorEtapa,
  lancamentoNatureza,
  lancamentosDuplicadosAbertos,
  lancamentosPorMes,
  lancamentoTotal,
  ligadoAoPrestador,
  orcadoRealizadoPorEtapa,
  resumoLancamentos,
  tratamentoDoAlerta,
} from '../../dominio/calculos.js';
import { graficoBarras, graficoRosca } from '../../graficos/index.js';
import { Store, mutar } from '../../dados/store.js';
import { ACOES } from '../acoes.js';
import { App, botao, ICO, opcoesEtapas, opcoesLista, svg, toast } from '../shell.js';
import { VIEWS } from '../telas-obra.js';
import { historicoDoRegistro } from './auditoria.js';
import {
  barraFiltros,
  botaoNovo,
  buscaToolbar,
  dinheiro,
  faixaKpis,
  lista,
  painelAnalise,
  secao,
  vazioTela,
} from './componentes.js';

/* Estado só de tela: o lançamento com o inspetor aberto. */
const tela = { selecao: '' };
const ROTULO_CAT = Object.fromEntries(CATEGORIAS_SAIDA);
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/* ---------------------------------------------------------------- KPIs */
function kpisLancamentos(r) {
  const pct = (v) => (r.total > 0.005 ? `${fmtPct(v / r.total, 0)} do total` : '—');
  const c = r.porCategoria;
  const taxasExtras = c.taxas + c.extras;
  return faixaKpis(
    [
      {
        rotulo: 'Total lançado',
        valor: fmtMoney(r.total, { dec: 0 }),
        contexto: plural(r.n, 'lançamento', 'lançamentos'),
      },
      { rotulo: 'Material', valor: fmtMoney(c.material, { dec: 0 }), contexto: pct(c.material) },
      {
        rotulo: 'Mão de obra e serviços',
        valor: fmtMoney(c.maoDeObra, { dec: 0 }),
        contexto: `${pct(c.maoDeObra)} · medições ficam em Medições`,
      },
      {
        rotulo: 'Taxas e extras',
        valor: fmtMoney(taxasExtras, { dec: 0 }),
        contexto:
          r.naoObra.valor > 0.005
            ? `${fmtMoney(r.naoObra.valor, { dec: 0 })} fora da obra física`
            : 'nada fora da obra física',
      },
    ],
    { rotulo: 'Indicadores de lançamentos' },
  );
}

/* ------------------------------------------------------------- células */
function celulaDescricao(d, dup) {
  const l = d.l;
  const detalhe = [
    num(l.quantidade) && num(l.quantidade) !== 1
      ? `${fmtNum(l.quantidade, 2)} ${l.unidade || ''} × ${fmtMoney(l.precoUnitario)}`
      : null,
    /* frete e desconto mudam o total: sem eles a conta da linha não fecha */
    num(l.frete) ? `+${fmtMoney(l.frete, { dec: 0 })} frete` : null,
    num(l.desconto) ? `−${fmtMoney(l.desconto, { dec: 0 })} desconto` : null,
    l.documento || null,
  ]
    .filter(Boolean)
    .join(' · ');
  const vinculo = l.materialId
    ? `<span class="marca-vinculo" title="Do plano de materiais" aria-label="do plano de materiais">${svg(ICO.vinculo, 12)}</span>`
    : '';
  /* clipe da NF (0019/0020): abre a foto ou o PDF da nota */
  const nf = l.anexoNf
    ? `<button class="btn-link marca-nf" data-acao="ver-nf" data-id="${esc(l.id)}" title="Ver a nota fiscal" aria-label="Ver a nota fiscal de ${esc(l.descricao || '')}">${svg(ICO.clipe, 12)}</button>`
    : '';
  const aviso = dup
    ? `<span class="aviso-duplicado">${svg(ICO.alerta, 12)} Possível duplicado: mesmo valor, fornecedor e data de outro lançamento.
        ${
          Store.somenteLeitura()
            ? ''
            : `<button class="btn-link" data-acao="lanc-nao-duplicado" data-id="${esc(dup.primeiro)}">Não é duplicado</button>
               <button class="btn-link" data-acao="excluir-lancamento" data-id="${esc(l.id)}">Excluir este</button>`
        }</span>`
    : '';
  return `<div class="cel-lanc"><span class="cel-lanc-tit"><b>${esc(l.descricao || '—')}</b>${vinculo}${nf}</span>${
    detalhe ? `<span class="tinta2">${esc(detalhe)}</span>` : ''
  }${aviso}</div>`;
}

const celulaTipo = (l) => {
  const cat = categoriaLancamento(l);
  return `<span class="tipo-ponto" title="${esc(ROTULO_CAT[cat])} · natureza ${esc(lancamentoNatureza(l))}"><i class="cat-${cat}"></i><span class="tipo-txt">${esc(l.tipo || '—')}</span></span>`;
};

/* ------------------------------------------------------------ inspetor */
function inspetorLancamento(o, l) {
  const mat = l.materialId ? o.materiais.find((m) => m.id === l.materialId) : null;
  const prest = l.prestadorId ? Store.estado.prestadores.find((p) => p.id === l.prestadorId) : null;
  const par = (rot, val) =>
    val === '' || val === null || val === undefined ? '' : `<dt>${esc(rot)}</dt><dd>${val}</dd>`;
  return `<aside class="inspetor" tabindex="-1" data-testid="inspetor-lancamento" aria-label="${esc(l.descricao || 'Lançamento')}">
    <div class="inspetor-cab">
      <h2>${esc(l.descricao || 'Lançamento')}<span class="sub">${esc([isISO(l.data) ? fmtDataCurta(l.data) : '', l.tipo].filter(Boolean).join(' · '))}</span></h2>
      ${
        Store.somenteLeitura()
          ? ''
          : `<button class="btn sutil icone" data-acao="editar-lancamento" data-id="${esc(l.id)}" title="Editar" aria-label="Editar lançamento">${svg(ICO.lapis, 14)}</button>
             <button class="btn sutil icone acao-excluir" data-acao="excluir-lancamento" data-id="${esc(l.id)}" title="Excluir" aria-label="Excluir lançamento">${svg(ICO.lixo, 14)}</button>`
      }
      <button class="btn sutil icone" data-acao="lanc-fechar" title="Fechar" aria-label="Fechar">${svg(ICO.x, 13)}</button>
    </div>
    <div class="inspetor-corpo">
      <div class="inspetor-secao"><dl class="pares">
        ${par('Total', `<b>${fmtMoney(lancamentoTotal(l))}</b>`)}
        ${num(l.quantidade) !== 1 ? par('Quantidade', `${fmtNum(l.quantidade, 2)} ${esc(l.unidade || '')} × ${fmtMoney(l.precoUnitario)}`) : ''}
        ${num(l.frete) ? par('Frete', fmtMoney(l.frete)) : ''}
        ${num(l.desconto) ? par('Desconto', fmtMoney(l.desconto)) : ''}
        ${par('Categoria', esc(ROTULO_CAT[categoriaLancamento(l)]))}
        ${par('Fornecedor', esc(l.fornecedor || ''))}
        ${par('Documento', esc(l.documento || ''))}
        ${par('Pagamento', esc(l.formaPagamento || ''))}
      </dl></div>
      <div class="inspetor-secao"><h3>Vínculos</h3><dl class="pares">
        <dt>Etapa</dt><dd>${l.etapa ? esc(l.etapa) : '<span class="cel-aviso-alerta">sem etapa</span>'}</dd>
        <dt>Plano de materiais</dt><dd>${mat ? `${svg(ICO.vinculo, 12)} ${esc(mat.material)}` : '<span class="tinta3">não é do plano</span>'}</dd>
        ${prest ? par('Prestador', esc(nomeExibicao(prest.nome))) : ''}
      </dl></div>
      <div class="inspetor-secao"><h3>Nota fiscal</h3>${
        l.anexoNf
          ? `<button class="btn pequeno" data-acao="ver-nf" data-id="${esc(l.id)}">${svg(ICO.clipe, 13)}Ver a nota</button>`
          : `<p class="linha-cinza">Nenhuma anexada.</p>${Store.somenteLeitura() ? '' : botao('Anexar nota', 'editar-lancamento', { id: l.id }, 'btn sutil pequeno')}`
      }</div>
      ${l.observacoes ? `<div class="inspetor-secao"><h3>Observações</h3><p class="obs">${esc(l.observacoes)}</p></div>` : ''}
      <div class="inspetor-secao"><h3>Alterações</h3>${historicoDoRegistro(o, 'lancamentos', l.id)}</div>
    </div>
  </aside>`;
}

/* ---------------------------------------------------------------- tela */
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
  /* id → grupo de duplicados ainda em aberto (sem "não é duplicado") */
  const duplicado = new Map();
  lancamentosDuplicadosAbertos(o, hojeISO()).forEach((ls) =>
    ls.forEach((l) => duplicado.set(l.id, { n: ls.length, primeiro: ls[0].id })),
  );

  /* ------------------------------------------------------- filtros */
  const fornecedores = [...new Set(todos.map((l) => l.fornecedor).filter(Boolean))].sort();
  const meses = [...new Set(todos.map((l) => competencia(l.data)).filter(Boolean))]
    .sort()
    .reverse();
  const busca = norm(f.busca || '');
  const todosItens = todos.map((l) => ({ l, total: lancamentoTotal(l) }));
  const SITUACOES_LANC = [
    { valor: 'plano', rotulo: 'Do plano de materiais', pertence: (d) => d.l.materialId },
    { valor: 'avulso', rotulo: 'Avulsos', pertence: (d) => !d.l.materialId },
    { valor: 'sem-etapa', rotulo: 'Sem etapa', pertence: (d) => !d.l.etapa },
    { valor: 'duplicados', rotulo: 'Possíveis duplicados', pertence: (d) => duplicado.has(d.l.id) },
    { valor: 'com-nota', rotulo: 'Com nota anexada', pertence: (d) => !!d.l.anexoNf },
    {
      valor: 'nao-obra',
      rotulo: 'Fora da obra física',
      pertence: (d) => lancamentoNatureza(d.l) !== 'Obra',
    },
  ];
  let itens = todosItens;
  if (f.tipo) itens = itens.filter((d) => d.l.tipo === f.tipo);
  if (f.etapa) itens = itens.filter((d) => d.l.etapa === f.etapa);
  if (f.fornecedor) itens = itens.filter((d) => d.l.fornecedor === f.fornecedor);
  /* Vindo da ficha do prestador ("Ver todos os lançamentos"): só os dele. */
  const prestFiltro = f.prestadorId && Store.estado.prestadores.find((p) => p.id === f.prestadorId);
  if (prestFiltro)
    itens = itens.filter((d) => ligadoAoPrestador(prestFiltro, d.l.prestadorId, d.l.fornecedor));
  if (f.mes) itens = itens.filter((d) => competencia(d.l.data) === f.mes);
  const situacao = SITUACOES_LANC.find((x) => x.valor === f.situacao);
  if (situacao) itens = itens.filter(situacao.pertence);
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
      largura: '38%',
      celular: 'principal',
      valor: (d) => d.l.descricao || '',
      celula: (d) => celulaDescricao(d, duplicado.get(d.l.id)),
    },
    {
      k: 'tipo',
      rotulo: 'Tipo',
      largura: '15%',
      celular: 'some',
      valor: (d) => d.l.tipo || '',
      celula: (d) => celulaTipo(d.l),
    },
    {
      k: 'fornecedor',
      rotulo: 'Fornecedor',
      largura: '15%',
      celular: 'some',
      valor: (d) => d.l.fornecedor || '',
      celula: (d) => (d.l.fornecedor ? esc(d.l.fornecedor) : '<span class="tinta3">—</span>'),
    },
    {
      k: 'etapa',
      rotulo: 'Etapa',
      largura: '12%',
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
  ];

  /* grupos por mês: subtotal de lancamentosPorMes */
  const porMes = new Map(lancamentosPorMes(itens.map((d) => d.l)).map((g) => [g.ym, g]));
  const grupos = {
    de: (d) => (isISO(d.l.data) ? competencia(d.l.data) : ''),
    ordem: (a, b) => (!a ? 1 : !b ? -1 : b.localeCompare(a)),
    cabecalho: (ym) => {
      const g = porMes.get(ym) || { lancamentos: [], total: 0 };
      return `<span class="grupo-seta" aria-hidden="true">${svg(ICO.seta, 10)}</span>
        <b>${ym ? esc(fmtCompetencia(ym)) : 'Sem data'}</b>
        <span class="tinta2">${plural(g.lancamentos.length, 'lançamento', 'lançamentos')}</span>
        <span class="grupo-total">${fmtMoney(g.total)}</span>`;
    },
  };

  /* ------------------------------------------------ painel de análise */
  const lsFiltrados = itens.map((d) => d.l);
  const orr = orcadoRealizadoPorEtapa(o);
  const tabelaOrcado = orr.length
    ? secao(
        'Orçado × realizado por etapa',
        `<div class="lista-cx"><div class="tab-rolagem"><table class="tab">
          <thead><tr><th>Etapa</th><th class="num">Orçado</th><th class="num">Realizado</th><th class="num">Diferença</th><th class="num">Consumido</th></tr></thead>
          <tbody>${orr
            .map(
              (l) => `<tr>
            <td>${esc(l.etapa)}</td>
            <td class="num">${l.orcado > 0.005 ? esc(fmtMoney(l.orcado, { dec: 0 })) : '<span class="tinta3">sem orçamento</span>'}</td>
            <td class="num">${esc(fmtMoney(l.realizado, { dec: 0 }))}</td>
            <td class="num ${l.orcado > 0.005 && l.diferenca > 0.5 ? 'atraso' : ''}">${l.orcado > 0.005 ? `${l.diferenca > 0 ? '+' : l.diferenca < 0 ? '−' : ''}${esc(fmtMoney(Math.abs(l.diferenca), { dec: 0 }))}` : '—'}</td>
            <td class="num ${l.consumido !== null && l.consumido > 1 ? 'atraso' : ''}">${l.consumido === null ? '—' : fmtPct(l.consumido, 0)}</td>
          </tr>`,
            )
            .join('')}</tbody></table></div></div>
        <p class="nota-rodape">Orçado = plano de materiais + contratos ligados às etapas (em Contratos, "Etapas que este contrato executa").</p>`,
      )
    : '';

  const sel = tela.selecao && todos.find((l) => l.id === tela.selecao);

  return `<div class="tela-contratos">
    <div class="tela-principal">
      <div class="tela-lista">
        ${kpisLancamentos(r)}
        ${
          r.semEtapa.n
            ? `<div class="faixa-aviso" role="status">
                <span>${plural(r.semEtapa.n, 'lançamento sem etapa', 'lançamentos sem etapa')} (${fmtMoney(r.semEtapa.valor, { dec: 0 })}) — ${r.semEtapa.n === 1 ? 'fica' : 'ficam'} fora do custo por etapa e da curva S</span>
                <button class="btn-link" data-acao="filtro-pilula" data-chave="situacao" data-valor="sem-etapa">Classificar</button>
              </div>`
            : ''
        }
        ${barraFiltros({
          pilulas: {
            chave: 'tipo',
            todos: 'Todos',
            total: todosItens.length,
            opcoes: [...new Set([...opcoesLista('tiposSaida'), ...todos.map((l) => l.tipo)])]
              .filter(Boolean)
              .map((t) => ({
                valor: t,
                rotulo: t,
                n: todosItens.filter((d) => d.l.tipo === t).length,
              })),
          },
          mais: [
            {
              chave: 'etapa',
              rotulo: 'Etapa',
              todos: 'Todas as etapas',
              opcoes: opcoesEtapas()
                .map((e) => [e, e, todosItens.filter((d) => d.l.etapa === e).length])
                .filter((op) => op[2] > 0),
            },
            {
              chave: 'fornecedor',
              rotulo: 'Fornecedor',
              todos: 'Todos os fornecedores',
              opcoes: fornecedores.map((fo) => [
                fo,
                fo,
                todosItens.filter((d) => d.l.fornecedor === fo).length,
              ]),
            },
            {
              chave: 'situacao',
              rotulo: 'Origem',
              todos: 'Qualquer origem',
              opcoes: SITUACOES_LANC.map((x) => [
                x.valor,
                x.rotulo,
                todosItens.filter(x.pertence).length,
              ]).filter((op) => op[2] > 0 || f.situacao === op[0]),
            },
            {
              chave: 'mes',
              rotulo: 'Mês',
              todos: 'Todos os meses',
              opcoes: meses.map((ym) => [
                ym,
                fmtCompetencia(ym),
                todosItens.filter((d) => competencia(d.l.data) === ym).length,
              ]),
            },
          ],
          extra: prestFiltro
            ? `<button type="button" class="etiqueta-filtro" data-acao="lanc-sem-prestador" title="Tirar o filtro de prestador">
                <span class="tinta2">Prestador:</span> ${esc(nomeExibicao(prestFiltro.nome))} <span aria-hidden="true">×</span></button>`
            : '',
          filtrados: itens.length,
          total: todos.length,
        })}
        ${lista({
          id: 'lancamentos',
          testid: 'lista-lancamentos',
          colunas,
          itens,
          grupos,
          ordemPadrao: { col: 'data', dir: -1 },
          rodapeRotulo: (n) => `${n} lançamentos`,
          linhaAttrs: (d) =>
            `data-acao="lanc-selecionar" data-id="${esc(d.l.id)}"${d.l.id === tela.selecao ? ' aria-selected="true"' : ''}`,
          linhaClasse: (d) => `clicavel${duplicado.has(d.l.id) ? ' linha-duplicado' : ''}`,
        })}
        ${painelAnalise([
          {
            titulo: 'Gasto por etapa',
            conteudo: graficoBarras(gastoPorEtapa(lsFiltrados), {
              limite: 10,
              formata: (v) => fmtMoneyCurto(v),
            }),
          },
          {
            titulo: 'Composição por tipo',
            conteudo: graficoRosca(composicaoPorTipo(lsFiltrados), {
              centro: 'total',
              rotulo: 'Composição dos lançamentos por tipo',
            }),
          },
        ])}
        ${tabelaOrcado}
      </div>
    </div>
    ${sel ? inspetorLancamento(o, sel) : ''}
  </div>`;
};
VIEWS.lancamentos.paineis = true;

VIEWS.lancamentos.toolbar = () => {
  const o = App.obra();
  if (!o || !o.lancamentos.length) return '';
  return (
    buscaToolbar('Buscar lançamento', 'busca-lancamentos') +
    botaoNovo('Novo lançamento', 'novo-lancamento')
  );
};

/* -------------------------------------------------------------- ações */
ACOES['lanc-selecionar'] = (el, d) => {
  tela.selecao = tela.selecao === d.id ? '' : d.id;
  App.renderConteudo();
};
ACOES['lanc-fechar'] = () => {
  tela.selecao = '';
  App.renderConteudo();
};

/* Tira o filtro de prestador que veio da ficha dele. */
ACOES['lanc-sem-prestador'] = () => {
  delete App.filtros.prestadorId;
  App.renderConteudo();
};

/* "Não é duplicado": marca o alerta do grupo como resolvido (0015). Se o
   valor em jogo subir depois, o alerta volta sozinho. */
ACOES['lanc-nao-duplicado'] = (el, d) => {
  const o = App.obra();
  const alerta = alertasObra(o).find((a) => a.chave === `duplicado:${d.id}`);
  if (!alerta) return;
  const t = tratamentoDoAlerta(
    o,
    alerta,
    { status: 'resolvido', nota: 'não é duplicado' },
    hojeISO(),
  );
  mutar(() => {
    o.tratamentos = [...o.tratamentos.filter((x) => x.id !== t.id), t];
  });
  toast('Marcado: não é duplicado.', 'ok');
};
