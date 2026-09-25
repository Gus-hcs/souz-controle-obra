/**
 * telas/curva.js — Curva S, na linguagem nova.
 *
 * curvaS (dominio/calculos.js) já devolve tudo pronto, mês a mês. A frase
 * em português que interpreta o gráfico é o melhor texto da tela — não
 * mudou uma vírgula.
 */
import { esc, fmtCompetencia, fmtData, fmtMoney, fmtNum, fmtPct } from '../../nucleo/base.js';
import { curvaS, kpisObra, nivelIndice, valorAgregadoObra } from '../../dominio/calculos.js';
import { graficoCurvaS } from '../../graficos/index.js';
import { App, botao } from '../shell.js';
import { VIEWS } from '../telas-obra.js';
import {
  barraFiltros,
  dinheiro,
  faixaKpis,
  fmtIndice,
  lista,
  secao,
  tomNivel,
  vazioTela,
} from './componentes.js';

/* Primeiro a resposta (quando acaba, quanto vai custar), depois os
   índices que a explicam, por último os percentuais crus. */
function kpisCurva(k, va, desvio, desvioFinFis) {
  const atraso = va.atrasoProjetado;
  const dias = (n) => `${n} dia${n === 1 ? '' : 's'}`;
  return faixaKpis(
    [
      {
        rotulo: 'Término projetado',
        valor: va.termino ? fmtData(va.termino) : '—',
        contexto:
          atraso === null
            ? 'sem data contratual'
            : atraso > 0
              ? `${dias(atraso)} depois da data contratual`
              : atraso < 0
                ? `${dias(-atraso)} antes da data contratual`
                : 'na data contratual',
        tom: atraso > 0 ? tomNivel(nivelIndice(va.idp, 'idp')) || 'tom-alerta' : '',
      },
      {
        rotulo: 'IDP · prazo',
        valor: fmtIndice(va.idp),
        contexto:
          va.idp === null
            ? 'obra ainda sem previsto'
            : `ritmo de ${fmtPct(va.idp, 0)} do planejado${va.idpTravado ? ' · projeção limitada' : ''}`,
        tom: tomNivel(nivelIndice(va.idp, 'idp')),
      },
      {
        rotulo: 'IDC · custo',
        valor: fmtIndice(va.idc),
        contexto:
          va.idc === null
            ? 'sem gasto físico ainda'
            : `a cada R$ 1 gasto, entregou R$ ${fmtNum(va.idc, 2)} · término ${fmtMoney(va.eac, { dec: 0 })}`,
        tom: tomNivel(nivelIndice(va.idc, 'idc')),
      },
      {
        rotulo: 'Avanço físico',
        valor: fmtPct(k.progressoFisico, 1),
        contexto: `previsto ${fmtPct(va.previsto, 1)} · ${(desvio >= 0 ? '+' : '−') + fmtNum(Math.abs(desvio) * 100, 1)} p.p.`,
        tom: desvio < -0.1 ? 'atraso' : desvio < -0.05 ? 'tom-alerta' : '',
      },
      {
        rotulo: 'Orçamento consumido',
        valor: fmtPct(k.progressoFinanceiro, 1),
        contexto: `${fmtMoney(k.totalPago, { dec: 0 })} de ${fmtMoney(k.custoPrevisto, { dec: 0 })} previstos`,
        tom: desvioFinFis > 0.1 ? 'tom-alerta' : '',
      },
    ],
    { rotulo: 'Indicadores da curva S' },
  );
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
  const desvio = atual ? atual.fisicoRealizado - atual.fisicoPrevisto : 0;
  const desvioFinFis = k.progressoFinanceiro - k.progressoFisico;
  const va = valorAgregadoObra(o);

  const pp = (v) => `${fmtNum(Math.abs(v) * 100, 1)} p.p.`;
  const fraseFisica =
    Math.abs(desvio) < 0.01
      ? 'A obra está <b>no ritmo do cronograma</b>.'
      : desvio < 0
        ? `A obra está <b>${pp(desvio)} atrás</b> do cronograma físico.`
        : `A obra está <b>${pp(desvio)} à frente</b> do cronograma físico.`;
  /* Diz o número sempre que houver diferença — "acompanha" escondia 2,4 p.p. */
  const fraseFin =
    Math.abs(desvioFinFis) < 0.01
      ? 'O gasto acompanha o avanço físico.'
      : desvioFinFis > 0
        ? `O gasto está <b>${pp(desvioFinFis)} à frente</b> do avanço físico${desvioFinFis >= 0.04 ? ' — atenção ao caixa' : ''}.`
        : `O gasto está <b>${pp(desvioFinFis)} atrás</b> do avanço físico.`;

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
    ${kpisCurva(k, va, desvio, desvioFinFis)}
    ${secao('Curva S', `<p class="tinta2" style="margin:0 0 var(--e3)">${fraseFisica} ${fraseFin}</p><div class="nao-celular">${graficoCurvaS(o, 320)}</div>`)}
    ${barraFiltros({
      pilulas: {
        chave: 'situacao',
        todos: 'Tudo',
        total: dados.length,
        opcoes: [
          { valor: 'realizado', rotulo: 'Realizado', n: dados.filter((d) => !d.futuro).length },
          { valor: 'projecao', rotulo: 'Projeção', n: dados.filter((d) => d.futuro).length },
        ],
      },
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
