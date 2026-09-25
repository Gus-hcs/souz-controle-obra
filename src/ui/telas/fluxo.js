/**
 * telas/fluxo.js — Fluxo de caixa, na linguagem nova.
 *
 * Nada calcula aqui: fluxoCaixa (dominio/calculos.js) já devolve mês a mês
 * entradas, saídas, saldo e o que falta liquidar. A tela só desenha.
 */
import {
  competencia,
  esc,
  fmtCompetencia,
  fmtMoney,
  fmtMoneyCurto,
  hojeISO,
} from '../../nucleo/base.js';
import { fluxoCaixa, kpisObra } from '../../dominio/calculos.js';
import { graficoFluxo } from '../../graficos/index.js';
import { App } from '../shell.js';
import { VIEWS } from '../telas-obra.js';
import { barraFiltros, dinheiro, lista, secao, seletor } from './componentes.js';

function kpisFluxo(k, tot) {
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

/* ---------------------------------------------------------------- tela */
VIEWS.fluxo = () => {
  const o = App.obra();
  const f = App.filtros;
  const dados = fluxoCaixa(o);
  const k = kpisObra(o);
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
        if (!d.previstasNaoRecebidas && !d.medicoesNaoPagas) return '<span class="tinta3">—</span>';
        return [
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
    ${kpisFluxo(k, tot)}
    ${secao('Movimento mensal', graficoFluxo(o, 280))}
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
