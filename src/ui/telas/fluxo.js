/**
 * telas/fluxo.js — Fluxo de caixa, na linguagem nova.
 *
 * Nada calcula aqui: fluxoCaixa (dominio/calculos.js) já devolve mês a mês
 * entradas, saídas, saldo e o que falta liquidar. A tela só desenha.
 *
 * Para a frente, fluxoProjetado: o vale de caixa (menor saldo projetado
 * e a data) e os próximos eventos — parcelas, medições a pagar, saldo a
 * medir dos contratos e material a comprar — com o saldo depois de cada um.
 *
 * Ao lado dos próximos movimentos, os gráficos (analiseFluxo): saídas
 * por categoria e entradas por origem na coluna; embaixo da tabela, o
 * saldo mês a mês com o menor saldo previsto. O período dos gráficos é o
 * do filtro da tela.
 */
import {
  competencia,
  esc,
  fmtCompetencia,
  fmtDataCurta,
  fmtMoney,
  fmtMoneyCurto,
  hojeISO,
} from '../../nucleo/base.js';
import { analiseFluxo, fluxoCaixa, fluxoProjetado, kpisObra } from '../../dominio/calculos.js';
import { graficoAuto, graficoRosca, graficoSaldoProjetado } from '../../graficos/index.js';
import { App } from '../shell.js';
import { VIEWS } from '../telas-obra.js';
import { barraFiltros, dinheiro, faixaKpis, lista } from './componentes.js';

function kpisFluxo(k, tot, proj) {
  return faixaKpis(
    [
      {
        rotulo: 'Caixa hoje',
        valor: fmtMoney(k.saldoCaixa, { dec: 0 }),
        contexto: `inicial ${fmtMoneyCurto(k.saldoInicial)} + ${fmtMoneyCurto(tot.e)} − ${fmtMoneyCurto(tot.s)}`,
        tom: k.saldoCaixa < 0 ? 'atraso' : '',
      },
      {
        rotulo: 'Vale de caixa',
        valor: fmtMoney(proj.vale.saldo, { dec: 0 }),
        contexto:
          proj.vale.data === hojeISO()
            ? 'o menor saldo é hoje'
            : `menor saldo projetado, em ${fmtDataCurta(proj.vale.data)}`,
        tom:
          proj.vale.saldo < 0 ? 'atraso' : proj.vale.saldo < k.saldoCaixa * 0.5 ? 'tom-alerta' : '',
      },
      {
        rotulo: 'A receber',
        valor: fmtMoney(k.previstoNaoRecebido, { dec: 0 }),
        contexto: 'parcelas previstas não creditadas',
      },
      {
        rotulo: 'A pagar',
        valor: fmtMoney(k.medicoesNaoPagas, { dec: 0 }),
        contexto: 'medições em aberto',
        tom: k.medicoesNaoPagas > 0.005 ? 'tom-alerta' : '',
      },
      {
        rotulo: 'Posição no fim da obra',
        valor: fmtMoney(k.posicaoProjetada, { dec: 0 }),
        contexto: `saldo + a receber − ${fmtMoneyCurto(k.custoAIncorrer)} ainda a gastar`,
        tom: k.posicaoProjetada < 0 ? 'atraso' : '',
      },
    ],
    { rotulo: 'Indicadores de fluxo de caixa' },
  );
}

/* Os próximos eventos projetados, com o saldo depois de cada um; o do
   vale em destaque. */
const TIPO_EVENTO = {
  entrada: 'Entrada',
  'entrada-vencida': 'Entrada vencida',
  medicao: 'Medição a pagar',
  contrato: 'A medir',
  material: 'Material',
};
function tabelaProjetada(proj) {
  const linhas = proj.eventos.slice(0, 20);
  return `<div class="tab-rolagem"><table class="tab tab-projetada">
    <thead><tr><th>Data</th><th>Movimento</th><th class="num">Valor</th><th class="num">Saldo depois</th></tr></thead>
    <tbody>${linhas.map((e) => {
      const vale = e.data === proj.vale.data && e.saldoApos === proj.vale.saldo;
      return `<tr${vale ? ' class="linha-vale"' : ''}>
        <td class="mono">${esc(fmtDataCurta(e.data))}</td>
        <td><span class="tinta2">${esc(TIPO_EVENTO[e.tipo] || e.tipo)}</span> · ${esc(e.descricao)}</td>
        <td class="num ${e.valor < 0 ? '' : 'feito'}">${e.valor > 0 ? '+' : '−'}${esc(fmtMoney(Math.abs(e.valor), { dec: 0 }))}</td>
        <td class="num ${e.saldoApos < 0 ? 'atraso' : ''}"><b>${esc(fmtMoney(e.saldoApos, { dec: 0 }))}</b>${vale ? ' <span class="tom-alerta">← vale</span>' : ''}</td>
      </tr>`;
    }).join('')}</tbody></table></div>
    ${proj.eventos.length > linhas.length ? `<p class="tinta3" style="font-size:var(--t-peq);margin:var(--e2) 0 0">+ ${proj.eventos.length - linhas.length} movimentos depois; saldo no fim ${esc(fmtMoney(proj.saldoFinal, { dec: 0 }))}.</p>` : ''}`;
}

/* ---------------------------------------------------------------- tela */
VIEWS.fluxo = () => {
  const o = App.obra();
  const f = App.filtros;
  const dados = fluxoCaixa(o);
  const k = kpisObra(o);
  const proj = fluxoProjetado(o);
  const hojeM = competencia(hojeISO());

  const tot = dados.reduce(
    (a, d) => ({
      e: a.e + d.entradas,
      m: a.m + d.medicoes,
      ou: a.ou + d.outras,
      s: a.s + d.saidas,
    }),
    { e: 0, m: 0, ou: 0, s: 0 },
  );

  let itens = dados;
  if (f.situacao === 'movimento') itens = itens.filter((d) => d.entradas || d.saidas);
  if (f.situacao === 'futuros') itens = itens.filter((d) => d.ym > hojeM);

  const colunas = [
    {
      k: 'mes',
      rotulo: 'Mês',
      largura: '13%',
      celular: 'principal',
      valor: (d) => d.ym,
      celula: (d) =>
        `<b>${esc(fmtCompetencia(d.ym))}</b>${d.ym > hojeM ? '<span class="tinta3"> · futuro</span>' : ''}`,
    },
    {
      k: 'entradas',
      rotulo: 'Entradas',
      largura: '13%',
      num: true,
      celular: 'some',
      valor: (d) => d.entradas,
      celula: (d) => dinheiro(d.entradas, { cinzaNoZero: true, dec: 0 }),
      total: (ds) =>
        dinheiro(
          ds.reduce((s, d) => s + d.entradas, 0),
          { dec: 0 },
        ),
    },
    {
      k: 'saidas',
      rotulo: 'Saídas',
      largura: '26%',
      num: true,
      valor: (d) => d.saidas,
      celula: (d) => {
        const sub = [
          d.medicoes ? `med. ${fmtMoneyCurto(d.medicoes)}` : null,
          d.outras ? `outras ${fmtMoneyCurto(d.outras)}` : null,
        ]
          .filter(Boolean)
          .join(' · ');
        return `<div class="cel-num-nota">
          <b>${dinheiro(d.saidas, { cinzaNoZero: true, dec: 0 })}</b>
          ${sub ? `<span>${esc(sub)}</span>` : ''}
        </div>`;
      },
      total: (ds) =>
        dinheiro(
          ds.reduce((s, d) => s + d.saidas, 0),
          { dec: 0 },
        ),
    },
    {
      k: 'saldoMes',
      rotulo: 'Saldo do mês',
      largura: '12%',
      num: true,
      celular: 'some',
      valor: (d) => d.saldoMes,
      celula: (d) => dinheiro(d.saldoMes, { cinzaNoZero: true, dec: 0 }),
    },
    {
      k: 'acumulado',
      rotulo: 'Saldo acumulado',
      largura: '16%',
      num: true,
      valor: (d) => d.acumulado,
      celula: (d) =>
        `<b class="${d.acumulado < 0 ? 'atraso' : ''}">${dinheiro(d.acumulado, { dec: 0 })}</b>`,
    },
    {
      k: 'aliquidar',
      rotulo: 'A liquidar',
      largura: '20%',
      celular: 'some',
      celula: (d) => {
        if (!d.previstasNaoRecebidas && !d.medicoesNaoPagas && !d.vencidasNaoRecebidas) return '<span class="tinta3">—</span>';
        return [
          /* parcela vencida: no mês corrente, marcada — não no mês que passou */
          d.vencidasNaoRecebidas
            ? `<span class="atraso" title="parcelas vencidas sem crédito">+${esc(fmtMoneyCurto(d.vencidasNaoRecebidas))} vencido</span>`
            : '',
          d.previstasNaoRecebidas
            ? `<span class="tom-alerta">+${esc(fmtMoneyCurto(d.previstasNaoRecebidas))}</span>`
            : '',
          d.medicoesNaoPagas
            ? `<span class="atraso">−${esc(fmtMoneyCurto(d.medicoesNaoPagas))}</span>`
            : '',
        ]
          .filter(Boolean)
          .join(' ');
      },
    },
  ];

  /* a coluna de gráficos, no período do filtro */
  const an = analiseFluxo(o, f.situacao || '', hojeISO());
  const periodo = f.situacao === 'futuros' ? 'meses futuros' : f.situacao === 'movimento' ? 'meses com movimento' : 'a obra toda';
  const bloco = (titulo, nota, conteudo) => `<section class="analise-bloco">
      <div class="analise-cab"><h2>${esc(titulo)}</h2>${nota ? `<span class="tinta3">${esc(nota)}</span>` : ''}</div>
      <div class="analise-corpo">${conteudo}</div>
    </section>`;
  /* à direita as duas roscas; o saldo projetado fica embaixo dos próximos
     movimentos, largo — três gráficos empilhados numa coluna estreita
     deixavam a tabela com um vão vazio da altura de dois deles */
  const graficos = `<div class="fluxo-graficos">
      ${bloco('Saídas por categoria', periodo, graficoRosca(an.saidasPorCategoria, { centro: 'saídas', rotulo: 'Saídas por categoria' }))}
      ${bloco('Entradas por origem', periodo, graficoRosca(an.entradasPorOrigem, { centro: 'entradas', rotulo: 'Entradas por origem' }))}
    </div>`;
  const saldo = bloco('Saldo projetado', `entradas × saídas por mês · ${periodo}`, graficoAuto((w) => graficoSaldoProjetado(an.meses, an.menor, { largura: w, altura: 240 }), 760));

  return `<div class="tela-lista">
    ${kpisFluxo(k, tot, proj)}
    ${barraFiltros({
      pilulas: {
        chave: 'situacao',
        todos: 'Todos os meses',
        total: dados.length,
        opcoes: [
          {
            valor: 'movimento',
            rotulo: 'Com movimento',
            n: dados.filter((d) => d.entradas || d.saidas).length,
          },
          { valor: 'futuros', rotulo: 'Futuros', n: dados.filter((d) => d.ym > hojeM).length },
        ],
      },
      filtrados: itens.length,
      total: dados.length,
    })}
    <div class="fluxo-topo">
      <div class="fluxo-esq">
        ${bloco(
          'Próximos movimentos planejados',
          proj.eventos.length ? `${proj.eventos.length} movimentos · saldo depois de cada um` : '',
          proj.eventos.length
            ? tabelaProjetada(proj)
            : '<p class="tinta2 painel-vazio">Nada planejado: sem parcela a receber, medição a pagar, contrato a medir ou material a comprar.</p>',
        )}
        ${saldo}
      </div>
      ${graficos}
    </div>
    ${lista({
      id: 'fluxo',
      testid: 'lista-fluxo',
      colunas,
      itens,
      ordemPadrao: { col: 'mes', dir: 1 },
      rodapeRotulo: (n) => `${n} meses`,
    })}
  </div>`;
};
