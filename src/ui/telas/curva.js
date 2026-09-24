/**
 * telas/curva.js — Curva S, na linguagem nova.
 *
 * curvaS (dominio/calculos.js) já devolve tudo pronto, mês a mês. A frase
 * em português que interpreta o gráfico é o melhor texto da tela — não
 * mudou uma vírgula.
 */
import { esc, fmtCompetencia, fmtMoney, fmtPct } from '../../nucleo/base.js';
import { curvaS, kpisObra } from '../../dominio/calculos.js';
import { graficoCurvaS } from '../../graficos/index.js';
import { App, botao } from '../shell.js';
import { VIEWS } from '../telas-obra.js';
import { barraFiltros, dinheiro, lista, secao, seletor, vazioTela } from './componentes.js';

function kpisCurva(k, previstoHoje, desvio, desvioFinFis) {
  const item = (rotulo, valor, contexto, tom = '') => `<div class="kpi-item">
    <span class="kpi-rot">${esc(rotulo)}</span>
    <span class="kpi-val${tom ? ' ' + tom : ''}">${valor}</span>
    <span class="kpi-ctx">${contexto}</span>
  </div>`;

  return `<div class="kpis" role="group" aria-label="Indicadores da curva S">
    ${item('Avanço físico', fmtPct(k.progressoFisico, 1), `previsto ${fmtPct(previstoHoje, 1)} para hoje`)}
    ${item(
      'Desvio de prazo',
      (desvio >= 0 ? '+' : '') + fmtPct(desvio, 1),
      desvio < -0.01
        ? 'obra atrás do planejado'
        : desvio > 0.01
          ? 'obra adiantada'
          : 'no cronograma',
      desvio < -0.05 ? 'atraso' : desvio < -0.01 ? 'tom-alerta' : '',
    )}
    ${item(
      'Avanço financeiro',
      fmtPct(k.progressoFinanceiro, 1),
      `${fmtMoney(k.totalPago, { dec: 0 })} de ${fmtMoney(k.custoPrevisto, { dec: 0 })} previstos`,
      desvioFinFis > 0.1 ? 'tom-alerta' : '',
    )}
  </div>`;
}

/* ---------------------------------------------------------------- tela */
VIEWS.curva = () => {
  const o = App.obra();
  const f = App.filtros;
  const dados = curvaS(o);
  const k = kpisObra(o);

  if (!dados.length) {
    return vazioTela({
      titulo: 'Sem curva S ainda',
      texto: 'Cadastre o cronograma com datas previstas para gerar a curva.',
      acao: botao('Ir para o cronograma', 'ir', { view: 'cronograma' }, 'btn primario'),
    });
  }

  const atual = dados.filter((d) => d.fisicoRealizado !== null).pop();
  const previstoHoje = atual ? atual.fisicoPrevisto : 0;
  const desvio = atual ? atual.fisicoRealizado - atual.fisicoPrevisto : 0;
  const desvioFinFis = k.progressoFinanceiro - k.progressoFisico;

  const fraseFisica =
    Math.abs(desvio) < 0.01
      ? 'A obra está <b>no ritmo do cronograma</b>.'
      : desvio < 0
        ? `A obra está <b>${fmtPct(-desvio, 1)} atrás</b> do cronograma físico.`
        : `A obra está <b>${fmtPct(desvio, 1)} à frente</b> do cronograma físico.`;
  const fraseFin =
    Math.abs(desvioFinFis) < 0.04
      ? 'O desembolso acompanha o avanço.'
      : desvioFinFis > 0
        ? `O desembolso está <b>${fmtPct(desvioFinFis, 1)} à frente</b> do avanço físico — atenção ao caixa.`
        : `O desembolso está <b>${fmtPct(-desvioFinFis, 1)} atrás</b> do avanço físico.`;

  let itens = dados;
  if (f.situacao === 'realizado') itens = itens.filter((d) => !d.futuro);
  if (f.situacao === 'projecao') itens = itens.filter((d) => d.futuro);

  const colunas = [
    {
      k: 'mes',
      rotulo: 'Mês',
      largura: '18%',
      celular: 'principal',
      valor: (d) => d.ym,
      celula: (d) =>
        `<b>${esc(fmtCompetencia(d.ym))}</b>${d.futuro ? '<span class="tinta3"> · projeção</span>' : ''}`,
    },
    {
      k: 'fisPrev',
      rotulo: 'Físico previsto',
      largura: '16%',
      num: true,
      celular: 'some',
      valor: (d) => d.fisicoPrevisto,
      celula: (d) => fmtPct(d.fisicoPrevisto, 1),
    },
    {
      k: 'fisReal',
      rotulo: 'Físico realizado',
      largura: '16%',
      num: true,
      valor: (d) => (d.fisicoRealizado === null ? -1 : d.fisicoRealizado),
      celula: (d) =>
        d.fisicoRealizado === null ? '<span class="tinta3">—</span>' : fmtPct(d.fisicoRealizado, 1),
    },
    {
      k: 'desvio',
      rotulo: 'Desvio',
      largura: '14%',
      num: true,
      valor: (d) => (d.desvio === null ? 0 : d.desvio),
      celula: (d) => {
        if (d.desvio === null) return '<span class="tinta3">—</span>';
        const cls = d.desvio < -0.03 ? 'atraso' : d.desvio > 0.03 ? 'tom-alerta' : '';
        return `<span class="${cls}">${fmtPct(d.desvio, 1)}</span>`;
      },
    },
    {
      k: 'finReal',
      rotulo: 'Financeiro realizado',
      largura: '18%',
      num: true,
      celular: 'some',
      valor: (d) => (d.financeiroRealizado === null ? -1 : d.financeiroRealizado),
      celula: (d) =>
        d.financeiroRealizado === null
          ? '<span class="tinta3">—</span>'
          : fmtPct(d.financeiroRealizado, 1),
    },
    {
      k: 'desembolso',
      rotulo: 'Desembolso acumulado',
      largura: '18%',
      num: true,
      celular: 'some',
      valor: (d) => d.desembolsoAcumulado || 0,
      celula: (d) =>
        d.financeiroRealizado === null
          ? '<span class="tinta3">—</span>'
          : dinheiro(d.desembolsoAcumulado, { dec: 0 }),
    },
  ];

  return `<div class="tela-lista">
    ${kpisCurva(k, previstoHoje, desvio, desvioFinFis)}
    ${secao('Curva S', `<p class="tinta2" style="margin:0 0 var(--e3)">${fraseFisica} ${fraseFin}</p>${graficoCurvaS(o, 320)}`)}
    ${barraFiltros({
      mostrar: dados.length > 1,
      controles: [
        seletor(
          'situacao',
          [
            ['realizado', 'Só realizado'],
            ['projecao', 'Só projeção'],
          ],
          'Tudo',
        ),
      ],
      filtrados: itens.length,
      total: dados.length,
    })}
    ${lista({
      id: 'curva',
      testid: 'lista-curva',
      colunas,
      itens,
      ordemPadrao: { col: 'mes', dir: 1 },
      rodapeRotulo: (n) => `${n} meses`,
    })}
    <p class="tinta3" style="font-size:var(--t-peq)">
      A curva física prevista distribui o peso de cada etapa ao longo das datas planejadas. O peso vem do
      campo Peso da etapa; se estiver zerado, é proporcional à duração prevista. A curva financeira acumula
      o desembolso real (medições pagas + lançamentos) sobre o custo total previsto.
    </p>
  </div>`;
};
