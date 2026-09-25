/**
 * telas/fluxo.js — Fluxo de caixa, na linguagem nova.
 *
 * Nada calcula aqui: fluxoCaixa (dominio/calculos.js) já devolve mês a mês
 * entradas, saídas, saldo e o que falta liquidar. A tela só desenha.
 *
 * Para a frente, fluxoProjetado: o vale de caixa (menor saldo projetado
 * e a data) e os próximos eventos — parcelas, medições a pagar, saldo a
 * medir dos contratos e material a comprar — com o saldo depois de cada um.
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
import { fluxoCaixa, fluxoProjetado, kpisObra } from '../../dominio/calculos.js';
import { graficoFluxo } from '../../graficos/index.js';
import { App } from '../shell.js';
import { VIEWS } from '../telas-obra.js';
import { barraFiltros, dinheiro, lista, secao, seletor } from './componentes.js';

function kpisFluxo(k, tot, proj) {
  const item = (rotulo, valor, contexto, tom = '') => `<div class="kpi-item">
    <span class="kpi-rot">${esc(rotulo)}</span>
    <span class="kpi-val${tom ? ' ' + tom : ''}">${valor}</span>
    <span class="kpi-ctx">${contexto}</span>
  </div>`;

  return `<div class="kpis" role="group" aria-label="Indicadores de fluxo de caixa">
    ${item(
      'Caixa hoje',
      fmtMoney(k.saldoCaixa, { dec: 0 }),
      `inicial ${fmtMoneyCurto(k.saldoInicial)} + ${fmtMoneyCurto(tot.e)} − ${fmtMoneyCurto(tot.s)}`,
      k.saldoCaixa < 0 ? 'atraso' : '',
    )}
    ${item(
      'Vale de caixa',
      fmtMoney(proj.vale.saldo, { dec: 0 }),
      proj.vale.data === hojeISO() ? 'o menor saldo é hoje' : `menor saldo projetado, em ${fmtDataCurta(proj.vale.data)}`,
      proj.vale.saldo < 0 ? 'atraso' : proj.vale.saldo < k.saldoCaixa * 0.5 ? 'tom-alerta' : '',
    )}
    ${item('A receber', fmtMoney(k.previstoNaoRecebido, { dec: 0 }), 'parcelas previstas não creditadas')}
    ${item('A pagar', fmtMoney(k.medicoesNaoPagas, { dec: 0 }), 'medições em aberto', k.medicoesNaoPagas > 0.005 ? 'tom-alerta' : '')}
    ${item(
      'Posição no fim da obra',
      fmtMoney(k.posicaoProjetada, { dec: 0 }),
      `saldo + a receber − ${fmtMoneyCurto(k.custoAIncorrer)} ainda a gastar`,
      k.posicaoProjetada < 0 ? 'atraso' : '',
    )}
  </div>`;
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
  const linhas = proj.eventos.slice(0, 15);
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

  return `<div class="tela-lista">
    ${kpisFluxo(k, tot, proj)}
    ${secao('Movimento mensal', graficoFluxo(o, 280))}
    ${proj.eventos.length ? secao('Próximos movimentos · projetado', tabelaProjetada(proj)) : ''}
    ${barraFiltros({
      mostrar: dados.length > 1,
      controles: [
        seletor(
          'situacao',
          [
            ['movimento', 'Só com movimento'],
            ['futuros', 'Só meses futuros'],
          ],
          'Todos os meses',
        ),
      ],
      filtrados: itens.length,
      total: dados.length,
    })}
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
