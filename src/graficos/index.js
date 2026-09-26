/**
 * index.js — Gráficos em SVG puro: curva S, fluxo de caixa, Gantt e barras.
 */
import { addMeses, competencia, diasEntre, esc, fimDoMes, fmtCompetencia, fmtDataCurta, fmtMoney, fmtMoneyCurto, fmtPct, hojeISO, inicioDoMes, isISO, num, round2 } from '../nucleo/base.js';
import { agendaCronograma, curvaS, etapaCalc, fluxoCaixa, fluxoCarteira, temDependencias, valorAgregadoObra } from '../dominio/calculos.js';
import { vazio } from '../ui/shell.js';

const GRAFICOS = {};   /* id → { pontos, rotulos, formata } para o hover */
let seqGrafico = 0;

const escNum = (n) => (isFinite(n) ? n : 0);

function ticks(min, max, n = 4) {
  if (max === min) { max = min + 1; }
  const bruto = (max - min) / n;
  const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(bruto) || 1)));
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((p) => p >= bruto) || mag * 10;
  const ini = Math.floor(min / passo) * passo;
  /* o topo do eixo tem que ficar acima do maior valor (com uma folga),
     senão a linha do acumulado sai da área do gráfico */
  const fim = Math.ceil((max + (max - min) * 0.05) / passo) * passo;
  const out = [];
  for (let v = ini; v <= fim + passo * 0.001; v += passo) out.push(round2(v));
  return out;
}

function caminho(pontos) {
  return pontos.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
}

/* ------------------------------------------------------------ CURVA S */
/* Aceita uma obra (calcula a curva dela) ou a série já calculada — é assim
   que a curva consolidada da carteira usa o mesmo desenho.
   Com a obra, desenha também a tendência: do físico realizado de hoje
   até 100% no término projetado (valorAgregadoObra), tracejada.
   Financeiro realizado em índigo (--s3): o âmbar é da cor de alerta. */
function graficoCurvaS(obraOuSerie, altura = 300) {
  const ehObra = !Array.isArray(obraOuSerie);
  const dados = ehObra ? curvaS(obraOuSerie) : obraOuSerie;
  if (dados.length < 2) {
    return vazio('Sem curva S ainda', 'Cadastre o cronograma com datas previstas para gerar a curva.');
  }
  const W = 920, H = altura, ml = 46, mr = 16, mt = 14, mb = 34;
  const x0 = ml, x1 = W - mr, y0 = H - mb, y1 = mt;
  const n = dados.length;
  const px = (i) => x0 + (n === 1 ? 0 : (i * (x1 - x0)) / (n - 1));
  const py = (v) => y0 - Math.max(0, Math.min(1.05, v)) * (y0 - y1) / 1.05;

  const grade = [0, 0.25, 0.5, 0.75, 1].map((v) =>
    `<line class="grade-l" x1="${x0}" y1="${py(v).toFixed(1)}" x2="${x1}" y2="${py(v).toFixed(1)}"/>
     <text x="${x0 - 8}" y="${(py(v) + 3.5).toFixed(1)}" text-anchor="end">${(v * 100).toFixed(0)}%</text>`).join('');

  const serie = (campo) => dados.map((d, i) => (d[campo] === null ? null : [px(i), py(d[campo])])).filter(Boolean);
  const sFisPrev = serie('fisicoPrevisto');
  const sFisReal = serie('fisicoRealizado');
  const sFinReal = serie('financeiroRealizado');
  /* liberado acumulado pelo financiador (0016): abaixo do físico = a
     construtora está bancando a diferença */
  const sLib = serie('liberadoFinanciador');

  const areaReal = sFisReal.length > 1
    ? `<path d="${caminho(sFisReal)} L ${sFisReal[sFisReal.length - 1][0].toFixed(1)} ${y0} L ${sFisReal[0][0].toFixed(1)} ${y0} Z" fill="url(#gradS)"/>` : '';

  const linha = (pts, cor, tracejada, larg = 2) => pts.length > 1
    ? `<path d="${caminho(pts)}" fill="none" stroke="${cor}" stroke-width="${larg}" stroke-linejoin="round" stroke-linecap="round" ${tracejada ? 'stroke-dasharray="6 4"' : ''}/>` : '';

  /* lado: 'acima' | 'abaixo' | '' (automático). Quando os dois pontos
     finais estão perto, um rótulo vai para cima e o outro para baixo —
     antes "76%" e "79%" saíam um em cima do outro. */
  const fim = (pts, cor, texto, lado = '') => {
    if (!pts.length) return '';
    const [fx, fy] = pts[pts.length - 1];
    const acima = lado ? lado === 'acima' && fy > y1 + 12 : fy > y1 + 22;
    return `<circle cx="${fx.toFixed(1)}" cy="${fy.toFixed(1)}" r="4" fill="${cor}" stroke="var(--sup)" stroke-width="2"/>
      ${texto ? `<text x="${fx.toFixed(1)}" y="${(fy + (acima ? -9 : 15)).toFixed(1)}" text-anchor="end" fill="${cor}" style="font-size:11px;font-weight:600">${texto}</text>` : ''}`;
  };
  let ladoFis = '', ladoFin = '';
  if (sFisReal.length && sFinReal.length) {
    const yFis = sFisReal[sFisReal.length - 1][1];
    const yFin = sFinReal[sFinReal.length - 1][1];
    if (Math.abs(yFis - yFin) < 18) {
      ladoFis = yFis <= yFin ? 'acima' : 'abaixo';
      ladoFin = ladoFis === 'acima' ? 'abaixo' : 'acima';
    }
  }

  const passo = Math.max(1, Math.ceil(n / 12));
  const rotulosX = dados.map((d, i) => (i % passo === 0 || i === n - 1)
    ? `<text x="${px(i).toFixed(1)}" y="${y0 + 16}" text-anchor="middle">${fmtCompetencia(d.ym)}</text>` : '').join('');

  /* posição exata de hoje entre o mês corrente e o seguinte */
  const hoje = hojeISO();
  const iMes = dados.findIndex((d) => d.ym === competencia(hoje));
  let xHoje = null;
  if (iMes >= 0) {
    const diasMes = diasEntre(inicioDoMes(dados[iMes].ym), fimDoMes(dados[iMes].ym)) + 1;
    xHoje = px(iMes) + ((diasEntre(inicioDoMes(dados[iMes].ym), hoje) + 1) / diasMes) *
      ((x1 - x0) / Math.max(1, n - 1));
  }
  const marcaHoje = xHoje === null ? ''
    : `<line x1="${xHoje.toFixed(1)}" y1="${y1}" x2="${xHoje.toFixed(1)}" y2="${y0}" stroke="var(--linha-forte)" stroke-width="1" stroke-dasharray="3 3"/>
       <text x="${xHoje.toFixed(1)}" y="${y1 + 10}" text-anchor="middle">hoje</text>`;

  const id = 'gr' + (++seqGrafico);
  GRAFICOS[id] = {
    x0, x1, n, W,
    linhas: dados.map((d) => [
      `<b>${fmtCompetencia(d.ym)}</b>`,
      `Físico previsto: ${fmtPct(d.fisicoPrevisto, 0)}`,
      d.fisicoRealizado === null ? null : `Físico realizado: ${fmtPct(d.fisicoRealizado, 0)}`,
      d.financeiroRealizado === null ? null : `Financeiro realizado: ${fmtPct(d.financeiroRealizado, 0)}`,
      d.liberadoFinanciador == null ? null : `Liberado pelo financiador: ${fmtPct(d.liberadoFinanciador, 0)}`,
      d.financeiroRealizado === null || d.desembolsoAcumulado === undefined ? null : `Desembolso: ${fmtMoney(d.desembolsoAcumulado, { dec: 0 })}`
    ].filter(Boolean).join('<br>'))
  };

  const ultReal = dados.filter((d) => d.fisicoRealizado !== null).pop();
  const ultFin = dados.filter((d) => d.financeiroRealizado !== null).pop();

  /* Tendência: do último físico realizado até 100% no término projetado.
     Término além do último mês do gráfico: a linha sai pela borda na
     inclinação certa (extrapola a largura de um mês). */
  let tendencia = '';
  let legendaTendencia = '';
  const va = ehObra && ultReal && ultReal.fisicoRealizado < 1 ? valorAgregadoObra(obraOuSerie) : null;
  if (va && isISO(va.termino) && sFisReal.length) {
    const [ax, ay] = sFisReal[sFisReal.length - 1];
    const larguraMes = (x1 - x0) / Math.max(1, n - 1);
    const ymT = competencia(va.termino);
    const iUlt = n - 1;
    let mesesDepois = 0;
    let c = dados[iUlt].ym;
    while (c < ymT && mesesDepois < 120) { c = addMeses(c, 1); mesesDepois++; }
    const iT = dados.findIndex((d) => d.ym === ymT);
    const diasMes = diasEntre(inicioDoMes(ymT), fimDoMes(ymT)) + 1;
    const fracao = (diasEntre(inicioDoMes(ymT), va.termino) + 1) / diasMes;
    const xT = (iT >= 0 ? px(iT) : x1 + mesesDepois * larguraMes) + fracao * larguraMes;
    const yT = py(1);
    if (xT > ax + 1) {
      let bx = xT, by = yT;
      if (xT > x1) {
        bx = x1;
        by = ay + (yT - ay) * ((x1 - ax) / (xT - ax));
      }
      tendencia = `<path d="M${ax.toFixed(1)} ${ay.toFixed(1)} L${bx.toFixed(1)} ${by.toFixed(1)}" fill="none" stroke="var(--s1)" stroke-width="1.5" stroke-dasharray="2 4" stroke-linecap="round" opacity=".8"/>
        ${xT <= x1 ? `<circle cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="3" fill="none" stroke="var(--s1)" stroke-width="1.5"/>` : ''}`;
      legendaTendencia = `<span style="color:var(--s1)"><i class="traco pontilhado"></i>Tendência · termina ${fmtDataCurta(va.termino)}</span>`;
    }
  }

  return `
  <div class="legenda" style="margin-bottom:10px">
    <span style="color:var(--s1)"><i style="background:var(--s1)"></i>Físico realizado</span>
    <span style="color:var(--s1)"><i class="traco"></i>Físico previsto</span>
    <span style="color:var(--s3)"><i style="background:var(--s3)"></i>Financeiro realizado</span>
    ${sLib.length > 1 ? '<span style="color:var(--serie4)"><i style="background:var(--serie4)"></i>Liberado pelo financiador</span>' : ''}
    ${legendaTendencia}
  </div>
  <div class="grafico-cx" data-grafico="${id}" style="position:relative">
    <svg class="grafico" viewBox="0 0 ${W} ${H}" role="img" aria-label="Curva S de avanço físico e financeiro">
      <defs><linearGradient id="gradS" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="var(--s1)" stop-opacity=".22"/>
        <stop offset="1" stop-color="var(--s1)" stop-opacity="0"/>
      </linearGradient></defs>
      ${grade}
      ${marcaHoje}
      ${areaReal}
      ${linha(sFisPrev, 'var(--s1)', true)}
      ${tendencia}
      ${linha(sLib, 'var(--serie4)', false, 1.6)}
      ${linha(sFinReal, 'var(--s3)', false)}
      ${linha(sFisReal, 'var(--s1)', false, 2.4)}
      ${fim(sFisReal, 'var(--s1)', ultReal ? fmtPct(ultReal.fisicoRealizado, 0) : '', ladoFis)}
      ${fim(sFinReal, 'var(--s3)', ultFin ? fmtPct(ultFin.financeiroRealizado, 0) : '', ladoFin)}
      <line class="eixo" x1="${x0}" y1="${y0}" x2="${x1}" y2="${y0}"/>
      ${rotulosX}
      <line class="cursor" x1="0" y1="${y1}" x2="0" y2="${y0}" stroke="var(--linha-forte)" stroke-width="1" style="display:none"/>
    </svg>
    <div class="tt" style="display:none"></div>
  </div>`;
}

/* ------------------------------------------------------ FLUXO DE CAIXA */
function graficoFluxo(obra, altura = 280) {
  return renderFluxo(fluxoCaixa(obra), altura);
}

/* Fluxo de caixa somando todas as obras da carteira. */
function graficoFluxoCarteira(estado, altura = 280) {
  return renderFluxo(fluxoCarteira(estado), altura);
}

function renderFluxo(dados, altura = 280) {
  if (!dados.length) return vazio('Sem movimento', 'Registre recebimentos, medições ou lançamentos.');
  const W = 920, H = altura, ml = 62, mr = 16, mt = 14, mb = 34;
  const x0 = ml, x1 = W - mr, y0 = H - mb, y1 = mt;
  const n = dados.length;
  const maxV = Math.max(1, ...dados.map((d) => Math.max(d.entradas, d.saidas, d.acumulado)));
  const minV = Math.min(0, ...dados.map((d) => d.acumulado));
  const tk = ticks(minV, maxV, 4);
  const lo = tk[0], hi = tk[tk.length - 1];
  const py = (v) => y0 - ((v - lo) / (hi - lo || 1)) * (y0 - y1);
  const larguraCol = (x1 - x0) / n;
  const lb = Math.min(16, larguraCol * 0.32);

  const grade = tk.map((v) =>
    `<line class="grade-l" x1="${x0}" y1="${py(v).toFixed(1)}" x2="${x1}" y2="${py(v).toFixed(1)}"/>
     <text x="${x0 - 8}" y="${(py(v) + 3.5).toFixed(1)}" text-anchor="end">${fmtMoneyCurto(v)}</text>`).join('');

  const barras = dados.map((d, i) => {
    const cx = x0 + larguraCol * (i + 0.5);
    const b = (v, dx, cor) => {
      const alt = Math.abs(py(v) - py(0));
      if (alt < 0.6) return '';
      return `<rect x="${(cx + dx).toFixed(1)}" y="${Math.min(py(v), py(0)).toFixed(1)}" width="${lb.toFixed(1)}" height="${alt.toFixed(1)}" rx="2" fill="${cor}"/>`;
    };
    return b(d.entradas, -lb - 1, 'var(--s1)') + b(d.saidas, 1, 'var(--s2)');
  }).join('');

  const pts = dados.map((d, i) => [x0 + larguraCol * (i + 0.5), py(d.acumulado)]);
  const linhaAcum = `<path d="${caminho(pts)}" fill="none" stroke="var(--tinta)" stroke-width="2" stroke-linejoin="round" opacity=".78"/>`;
  const zero = (lo < 0) ? `<line x1="${x0}" y1="${py(0).toFixed(1)}" x2="${x1}" y2="${py(0).toFixed(1)}" stroke="var(--linha-forte)" stroke-width="1"/>` : '';

  const passo = Math.max(1, Math.ceil(n / 12));
  const rotulosX = dados.map((d, i) => (i % passo === 0 || i === n - 1)
    ? `<text x="${(x0 + larguraCol * (i + 0.5)).toFixed(1)}" y="${y0 + 16}" text-anchor="middle">${fmtCompetencia(d.ym)}</text>` : '').join('');

  const id = 'gr' + (++seqGrafico);
  GRAFICOS[id] = {
    x0, x1, n, W,
    linhas: dados.map((d) => `<b>${fmtCompetencia(d.ym)}</b><br>
      Entradas: ${fmtMoney(d.entradas)}<br>
      Medições pagas: ${fmtMoney(d.medicoes)}<br>
      Materiais e outras: ${fmtMoney(d.outras)}<br>
      Saldo do mês: ${fmtMoney(d.saldoMes)}<br>
      Acumulado: ${fmtMoney(d.acumulado)}`)
  };

  return `
  <div class="legenda" style="margin-bottom:10px">
    <span style="color:var(--s1)"><i style="background:var(--s1)"></i>Entradas</span>
    <span style="color:var(--s2)"><i style="background:var(--s2)"></i>Saídas</span>
    <span style="color:var(--tinta2)"><i style="background:var(--tinta)"></i>Saldo acumulado</span>
  </div>
  <div class="grafico-cx" data-grafico="${id}" style="position:relative">
    <svg class="grafico" viewBox="0 0 ${W} ${H}" role="img" aria-label="Fluxo de caixa mensal">
      ${grade}${zero}${barras}${linhaAcum}
      <line class="eixo" x1="${x0}" y1="${y0}" x2="${x1}" y2="${y0}"/>
      ${rotulosX}
      <line class="cursor" x1="0" y1="${y1}" x2="0" y2="${y0}" stroke="var(--linha-forte)" stroke-width="1" style="display:none"/>
    </svg>
    <div class="tt" style="display:none"></div>
  </div>`;
}

/* -------------------------------------------------------------- GANTT
   Interativo (Fase 2): registra em GRAFICOS com modo 'linhas-y' — o hover
   não segue X como nos gráficos de série (curva S, fluxo), segue a LINHA
   sob o cursor (ver desenharGraficosPendentes). Fase 3: quando o diário
   tem fotos citando a etapa (mesmo texto em d.etapa), a linha ganha um
   selo com a contagem — clicar leva ao Diário já filtrado pela etapa. */
/* A escala de meses se ajusta à largura disponível: a linha do tempo tem
   a largura da área que sobra ao lado dos nomes, sem faixa vazia à
   direita. A largura medida fica guardada (larguraGantt) para o próximo
   desenho já nascer certo; o ResizeObserver do shell chama ajustarGantt
   quando a área muda. Abaixo de GANTT_MIN a linha do tempo rola de lado. */
const GANTT_ROTULOS = 168;
const GANTT_MIN = 420;
let larguraGantt = 760;

function graficoGantt(obra) {
  const etapas = obra.cronograma.filter((e) => isISO(e.inicioPrevisto) || isISO(e.inicioReal));
  if (!etapas.length) return vazio('Cronograma sem datas', 'Informe início e fim previstos das etapas.');
  return `<div class="gantt" data-gantt="${esc(obra.id)}" data-largura="${larguraGantt}">${ganttInterno(obra, larguraGantt)}</div>`;
}

/* Redesenha o Gantt se a área mudou de largura. Devolve true se redesenhou. */
function ajustarGantt(cx, obra) {
  const w = Math.max(GANTT_MIN, Math.floor(cx.clientWidth - GANTT_ROTULOS));
  if (!obra || !cx.clientWidth || Math.abs(w - Number(cx.dataset.largura)) < 6) return false;
  larguraGantt = w;
  cx.dataset.largura = String(w);
  cx.innerHTML = ganttInterno(obra, w);
  return true;
}

function ganttInterno(obra, largura) {
  const etapas = obra.cronograma.filter((e) => isISO(e.inicioPrevisto) || isISO(e.inicioReal));
  const datas = [];
  etapas.forEach((e) => ['inicioPrevisto', 'fimPrevisto', 'inicioReal', 'fimReal'].forEach((k) => { if (isISO(e[k])) datas.push(e[k]); }));
  datas.push(hojeISO());
  datas.sort();
  const ini = datas[0], fim = datas[datas.length - 1];
  const span = Math.max(1, diasEntre(ini, fim));
  /* Fase 4: duas <svg> lado a lado, não uma só — a coluna de etapas (ml)
     fica fixa fora do .tab-rolagem, só a linha do tempo rola. Antes as
     duas viviam na mesma <svg> e rolar para ver setembro fazia o nome da
     etapa sumir pela esquerda junto — no celular isso quebrava a leitura. */
  const ml = GANTT_ROTULOS, WT = Math.max(GANTT_MIN, largura), mr = 14, linhaH = 28, mt = 26;
  const H = mt + etapas.length * linhaH + 12;
  const x0 = 0, x1 = WT - mr;
  const px = (d) => x0 + (diasEntre(ini, d) / span) * (x1 - x0);

  const fotosPorEtapa = new Map();
  (obra.diario || []).forEach((d) => {
    if (!d.etapa || !d.fotos || !d.fotos.length) return;
    fotosPorEtapa.set(d.etapa, (fotosPorEtapa.get(d.etapa) || 0) + d.fotos.length);
  });

  const meses = [];
  let c = competencia(ini);
  while (c <= competencia(fim) && meses.length < 40) { meses.push(c); c = addMeses(c, 1); }
  const gradeMes = meses.map((m) => {
    const d = inicioDoMes(m);
    if (d < ini) return '';
    return `<line class="grade-l" x1="${px(d).toFixed(1)}" y1="${mt - 8}" x2="${px(d).toFixed(1)}" y2="${H - 6}"/>
            <text x="${px(d).toFixed(1)}" y="${mt - 12}" text-anchor="${px(d) < 22 ? 'start' : px(d) > x1 - 22 ? 'end' : 'middle'}">${fmtCompetencia(m)}</text>`;
  }).join('');

  const tooltips = [];
  const rotulos = [];
  /* caminho crítico (0017): só existe com dependências cadastradas */
  const criticas = new Set(temDependencias(obra)
    ? agendaCronograma(obra, hojeISO(), valorAgregadoObra(obra).idp).critico : []);
  const linhas = etapas.map((e, i) => {
    const y = mt + i * linhaH;
    const c2 = etapaCalc(e);
    /* A barra é da cor do andamento; só o trecho depois do fim previsto é
       vermelho. Antes a etapa inteira ficava vermelha com um dia de atraso
       — e parecia que nada ali tinha andado no prazo. */
    const cor = c2.situacao === 'CONCLUÍDO' ? 'var(--ok)' : 'var(--s1)';
    let prev = '', real = '';
    if (isISO(e.inicioPrevisto) && isISO(e.fimPrevisto)) {
      const a = px(e.inicioPrevisto), b = Math.max(px(e.fimPrevisto), a + 3);
      prev = `<rect x="${a.toFixed(1)}" y="${y + 5}" width="${(b - a).toFixed(1)}" height="7" rx="3" fill="var(--linha-forte)" opacity=".55"/>`;
    }
    if (isISO(e.inicioReal)) {
      const a = px(e.inicioReal);
      const b = Math.max(px(isISO(e.fimReal) ? e.fimReal : hojeISO()), a + 3);
      const p = Math.min(1, Math.max(0, c2.progresso));
      /* trilha translúcida = tempo decorrido; preenchimento cheio = o que já
         foi executado. Antes as duas eram a mesma cor sólida — dava pra ver
         só uma barra, nunca quanto da etapa estava pronto de fato. */
      real = `<rect x="${a.toFixed(1)}" y="${y + 13}" width="${(b - a).toFixed(1)}" height="8" rx="3" fill="${cor}" opacity="${p >= 1 ? 1 : 0.28}"/>`;
      if (p > 0 && p < 1) {
        real += `<rect x="${a.toFixed(1)}" y="${y + 13}" width="${((b - a) * p).toFixed(1)}" height="8" rx="3" fill="${cor}"/>`;
      }
      /* trecho além do fim previsto: vermelho translúcido, e cheio na parte
         já executada — mesma leitura do resto da barra */
      if (isISO(e.fimPrevisto)) {
        const lim = Math.max(a, px(e.fimPrevisto));
        if (b - lim > 0.5) {
          const feito = p >= 1 ? b : a + (b - a) * p;
          /* etapa já concluída: o atraso é histórico — vermelho mais leve
             que o do atraso que ainda está acontecendo */
          real += `<rect x="${lim.toFixed(1)}" y="${y + 13}" width="${(b - lim).toFixed(1)}" height="8" rx="3" fill="var(--critico)" opacity="${p >= 1 ? 0.45 : 0.35}"/>`;
          if (p < 1 && feito > lim + 0.5) {
            real += `<rect x="${lim.toFixed(1)}" y="${y + 13}" width="${(feito - lim).toFixed(1)}" height="8" rx="3" fill="var(--critico)"/>`;
          }
        }
      }
    }
    const nFotos = fotosPorEtapa.get(e.etapa) || 0;
    const selo = nFotos
      ? `<a data-acao="ir-diario-etapa" data-etapa="${esc(e.etapa)}" data-obra="${esc(obra.id)}" style="cursor:pointer">
          <circle cx="${ml - 13}" cy="${y + 10}" r="7.5" fill="var(--s1)"/>
          <text x="${ml - 13}" y="${y + 13}" text-anchor="middle" fill="var(--sup)" style="font-size:8.5px;font-weight:700">${nFotos}</text>
        </a>`
      : '';
    const critica = criticas.has(e.id);
    const nomeCurto = e.etapa.length > 20 ? e.etapa.slice(0, 19) + '…' : e.etapa;
    rotulos.push(`<text x="8" y="${y + 17}" fill="${critica ? 'var(--critico)' : 'var(--tinta2)'}" style="font-size:11.5px${critica ? ';font-weight:600' : ''}">${critica ? '◆ ' : ''}${esc(nomeCurto)}</text>${selo}`);

    tooltips.push([
      `<b>${esc(e.etapa)}</b>`,
      `Situação: ${c2.situacao.charAt(0) + c2.situacao.slice(1).toLowerCase()}`,
      isISO(e.inicioPrevisto) || isISO(e.fimPrevisto)
        ? `Previsto: ${isISO(e.inicioPrevisto) ? fmtDataCurta(e.inicioPrevisto) : '?'} → ${isISO(e.fimPrevisto) ? fmtDataCurta(e.fimPrevisto) : '?'}`
        : null,
      isISO(e.inicioReal)
        ? `Real: ${fmtDataCurta(e.inicioReal)} → ${isISO(e.fimReal) ? fmtDataCurta(e.fimReal) : 'em curso'}`
        : null,
      `Progresso: ${fmtPct(c2.progresso, 0)}`,
      c2.atraso > 0 ? `${c2.atraso} dia${c2.atraso === 1 ? '' : 's'} de atraso` : null,
      criticas.has(e.id) ? 'No caminho crítico: atrasar aqui atrasa a obra' : null,
      nFotos ? `${nFotos} foto${nFotos === 1 ? '' : 's'} no diário — clique no selo para ver` : null,
    ].filter(Boolean).join('<br>'));

    return `${prev}${real}`;
  }).join('');

  const hoje = `<line x1="${px(hojeISO()).toFixed(1)}" y1="${mt - 6}" x2="${px(hojeISO()).toFixed(1)}" y2="${H - 6}" stroke="var(--critico)" stroke-width="1.5" stroke-dasharray="4 3"/>`;

  const id = 'gr' + (++seqGrafico);
  GRAFICOS[id] = { modo: 'linhas-y', W: WT, H, mt, linhaH, n: etapas.length, linhas: tooltips };

  return `<div class="legenda" style="margin-bottom:8px">
      <span style="color:var(--mudo)"><i style="background:var(--linha-forte)"></i>Previsto</span>
      <span style="color:var(--s1)"><i style="background:var(--s1)"></i>Em andamento</span>
      <span style="color:var(--ok)"><i style="background:var(--ok)"></i>Concluído</span>
      <span style="color:var(--critico)"><i style="background:var(--critico)"></i>Além do fim previsto · linha de hoje</span>
    </div>
    <div class="gantt-flex">
      <svg class="grafico" viewBox="0 0 ${ml} ${H}" style="width:${ml}px;height:${H}px;flex:none" aria-hidden="true">
        ${rotulos.join('')}
      </svg>
      <div class="tab-rolagem" style="flex:1;min-width:0" data-rolar-para="${px(hojeISO()).toFixed(0)}"><div class="grafico-cx" data-grafico="${id}" style="position:relative">
        <svg class="grafico" viewBox="0 0 ${WT} ${H}" style="width:${WT}px;height:${H}px" role="img" aria-label="Cronograma da obra, interativo">
          ${gradeMes}${linhas}${hoje}
        </svg>
        <div class="tt" style="display:none"></div>
      </div></div>
    </div>`;
}

/* =============================================== GRÁFICOS DE APOIO
   Os quatro gráficos dos painéis de análise (Recebimentos, Fluxo): linhas
   no tempo, colunas verticais, rosca e saldo projetado. SVG próprio, cores
   dos tokens, tooltip no hover e no toque (desenharGraficosPendentes), sem
   animação — nada a desligar para prefers-reduced-motion. */
/* Gráfico na largura do bloco: desenha com uma largura provável e o
   ResizeObserver do shell (ajustarGraficosAuto) redesenha com a largura
   medida — o texto fica sempre do mesmo tamanho, em vez de o SVG inteiro
   crescer ou encolher com a tela. fn(largura) → html. */
const AUTO = new Map();
let seqAuto = 0;
function graficoAuto(fn, larguraPadrao = 560) {
  const id = 'ga' + (++seqAuto);
  AUTO.set(id, fn);
  return `<div class="grafico-auto" data-auto="${id}" data-largura="${larguraPadrao}">${fn(larguraPadrao)}</div>`;
}
function limparGraficosAuto() {
  AUTO.clear();
}
/* Redesenha os que mudaram de largura; devolve quantos redesenhou. */
function ajustarGraficosAuto(raiz = document) {
  let n = 0;
  raiz.querySelectorAll('[data-auto]').forEach((el) => {
    const fn = AUTO.get(el.dataset.auto);
    const w = Math.floor(el.clientWidth);
    if (!fn || w < 120 || Math.abs(w - Number(el.dataset.largura)) < 8) return;
    el.dataset.largura = String(w);
    el.innerHTML = fn(w);
    n++;
  });
  return n;
}

const semDados = (txt = 'Sem dados para exibir.') => `<p class="tinta2 painel-vazio">${esc(txt)}</p>`;
const eixoY = (tk, x0, x1, py, formata) => tk.map((v) =>
  `<line class="grade-l" x1="${x0}" y1="${py(v).toFixed(1)}" x2="${x1}" y2="${py(v).toFixed(1)}"/>
   <text x="${x0 - 6}" y="${(py(v) + 3.5).toFixed(1)}" text-anchor="end">${esc(formata(v))}</text>`).join('');
const legendaHTML = (itens) => `<div class="legenda" style="margin-bottom:8px">${itens
  .map(([nome, cor, tracejada]) => `<span style="color:var(--tinta2)"><i style="background:${cor}${tracejada ? ';opacity:.6' : ''}"></i>${esc(nome)}</span>`)
  .join('')}</div>`;
const caixaGrafico = (id, W, H, rotulo, miolo, cursor = true, y1 = 0, y0 = H) => `
  <div class="grafico-cx" data-grafico="${id}" style="position:relative">
    <svg class="grafico" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(rotulo)}">
      ${miolo}
      ${cursor ? `<line class="cursor" x1="0" y1="${y1}" x2="0" y2="${y0}" stroke="var(--linha-forte)" stroke-width="1" style="display:none"/>` : ''}
    </svg>
    <div class="tt" style="display:none"></div>
  </div>`;

/* Linhas no tempo. rotulos: ['2026-03', …]; series: [{ nome, cor, valores,
   tracejada }] (null = sem valor naquele mês); hoje: 'AAAA-MM-DD'. */
function graficoLinhas({ rotulos, series, formata = (v) => fmtMoneyCurto(v), hoje = hojeISO(), altura = 220, largura = 560, rotulo = 'Gráfico de linhas' }) {
  const n = rotulos.length;
  if (n < 2) return semDados('Poucos meses para desenhar a linha.');
  const W = largura, H = altura, ml = 66, mr = 12, mt = 12, mb = 28;
  const x0 = ml, x1 = W - mr, y0 = H - mb, y1 = mt;
  const todos = series.flatMap((s) => s.valores.filter((v) => v !== null && v !== undefined));
  const tk = ticks(Math.min(0, ...todos), Math.max(1, ...todos), 4);
  const lo = tk[0], hi = tk[tk.length - 1];
  const px = (i) => x0 + (i * (x1 - x0)) / (n - 1);
  const py = (v) => y0 - ((v - lo) / (hi - lo || 1)) * (y0 - y1);
  const linhas = series.map((s) => {
    const pts = s.valores.map((v, i) => (v === null || v === undefined ? null : [px(i), py(v)])).filter(Boolean);
    if (!pts.length) return '';
    const [fx, fy] = pts[pts.length - 1];
    return `<path d="${caminho(pts)}" fill="none" stroke="${s.cor}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"${s.tracejada ? ' stroke-dasharray="6 4"' : ''}/>
      <circle cx="${fx.toFixed(1)}" cy="${fy.toFixed(1)}" r="3.5" fill="${s.cor}" stroke="var(--sup)" stroke-width="1.5"/>`;
  }).join('');
  const iHoje = rotulos.indexOf(competencia(hoje));
  let marca = '';
  if (iHoje >= 0) {
    const ym = rotulos[iHoje];
    const fr = (diasEntre(inicioDoMes(ym), hoje) + 1) / (diasEntre(inicioDoMes(ym), fimDoMes(ym)) + 1);
    const xh = Math.min(x1, px(iHoje) + fr * ((x1 - x0) / (n - 1)));
    marca = `<line x1="${xh.toFixed(1)}" y1="${y1}" x2="${xh.toFixed(1)}" y2="${y0}" stroke="var(--critico)" stroke-width="1.2" stroke-dasharray="4 3"/>
      <text x="${xh.toFixed(1)}" y="${y1 + 9}" text-anchor="middle" style="fill:var(--critico)">hoje</text>`;
  }
  const passo = Math.max(1, Math.ceil(n / Math.max(3, Math.floor(W / 70))));
  const eixoX = rotulos.map((ym, i) => (i % passo === 0 || i === n - 1)
    ? `<text x="${px(i).toFixed(1)}" y="${y0 + 16}" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}">${fmtCompetencia(ym)}</text>` : '').join('');
  const id = 'gr' + (++seqGrafico);
  GRAFICOS[id] = {
    x0, x1, n, W,
    linhas: rotulos.map((ym, i) => [`<b>${fmtCompetencia(ym)}</b>`, ...series.map((s) =>
      s.valores[i] === null || s.valores[i] === undefined ? null : `${esc(s.nome)}: ${esc(formata(s.valores[i]))}`)]
      .filter(Boolean).join('<br>')),
  };
  return legendaHTML(series.map((s) => [s.nome, s.cor, s.tracejada])) + caixaGrafico(id, W, H, rotulo,
    `${eixoY(tk, x0, x1, py, formata)}${linhas}${marca}<line class="eixo" x1="${x0}" y1="${y0}" x2="${x1}" y2="${y0}"/>${eixoX}`,
    true, y1, y0);
}

/* Colunas verticais: itens [{ rotulo, valor, cor?, dica? }], na ordem dada. */
function graficoColunas(itens, { formata = (v) => fmtMoneyCurto(v), cor = 'var(--serie1)', altura = 220, largura = 560, rotulo = 'Gráfico de colunas' } = {}) {
  const lista = itens.filter((i) => Math.abs(num(i.valor)) > 0.005);
  if (!lista.length) return semDados();
  const n = lista.length;
  const W = largura, H = altura, ml = 66, mr = 12, mt = 16, mb = 28;
  const x0 = ml, x1 = W - mr, y0 = H - mb, y1 = mt;
  const tk = ticks(0, Math.max(1, ...lista.map((i) => i.valor)), 4);
  const hi = tk[tk.length - 1];
  const py = (v) => y0 - (v / (hi || 1)) * (y0 - y1);
  const larg = (x1 - x0) / n;
  const lb = Math.min(56, larg * 0.62);
  const colunas = lista.map((it, i) => {
    const cx = x0 + larg * (i + 0.5);
    const y = py(it.valor);
    return `<rect x="${(cx - lb / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${lb.toFixed(1)}" height="${Math.max(1, y0 - y).toFixed(1)}" rx="2" fill="${it.cor || cor}"/>
      ${n <= 8 ? `<text x="${cx.toFixed(1)}" y="${(y - 5).toFixed(1)}" text-anchor="middle" style="font-weight:600">${esc(formata(it.valor))}</text>` : ''}`;
  }).join('');
  const passo = Math.max(1, Math.ceil(n / 8));
  const eixoX = lista.map((it, i) => (i % passo === 0 || i === n - 1)
    ? `<text x="${(x0 + larg * (i + 0.5)).toFixed(1)}" y="${y0 + 16}" text-anchor="middle">${esc(it.rotulo)}</text>` : '').join('');
  const id = 'gr' + (++seqGrafico);
  GRAFICOS[id] = { modo: 'colunas', x0, x1, n, W, linhas: lista.map((it) => `<b>${esc(it.rotulo)}</b><br>${esc(formata(it.valor))}${it.dica ? `<br>${esc(it.dica)}` : ''}`) };
  return caixaGrafico(id, W, H, rotulo,
    `${eixoY(tk, x0, x1, py, formata)}${colunas}<line class="eixo" x1="${x0}" y1="${y0}" x2="${x1}" y2="${y0}"/>${eixoX}`,
    true, y1, y0);
}

/* Rosca: no máximo `max` fatias + "Outros", o total no centro e a legenda
   com valor e %. fatias: [{ rotulo, valor, cor? }]. */
const CORES_FATIA = ['var(--serie1)', 'var(--serie2)', 'var(--serie3)', 'var(--serie4)', 'var(--serie5)', 'var(--serie6)'];
function fatiasRosca(itens, max = 5) {
  const pos = itens.filter((i) => num(i.valor) > 0.005).sort((a, b) => b.valor - a.valor);
  if (pos.length <= max + 1) return pos;
  const resto = pos.slice(max).reduce((s, i) => s + i.valor, 0);
  return [...pos.slice(0, max), { rotulo: 'Outros', valor: round2(resto), cor: 'var(--serie6)' }];
}
function graficoRosca(itens, { formata = (v) => fmtMoneyCurto(v), centro = 'total', max = 5, rotulo = 'Gráfico de rosca' } = {}) {
  const fatias = fatiasRosca(itens, max);
  if (!fatias.length) return semDados();
  const total = fatias.reduce((s, f) => s + f.valor, 0);
  const S = 160, c = S / 2, rExt = 74, rInt = 50;
  let ang = -Math.PI / 2;
  const ponto = (r, a) => `${(c + r * Math.cos(a)).toFixed(2)} ${(c + r * Math.sin(a)).toFixed(2)}`;
  const arcos = fatias.map((f, i) => {
    const cor = f.cor || CORES_FATIA[i % CORES_FATIA.length];
    const frac = f.valor / total;
    if (frac >= 0.9999) {
      return `<circle cx="${c}" cy="${c}" r="${(rExt + rInt) / 2}" fill="none" stroke="${cor}" stroke-width="${rExt - rInt}" data-fatia="${i}"/>`;
    }
    const a0 = ang, a1 = ang + frac * Math.PI * 2;
    ang = a1;
    const grande = a1 - a0 > Math.PI ? 1 : 0;
    return `<path data-fatia="${i}" fill="${cor}" stroke="var(--fundo-conteudo)" stroke-width="1.5"
      d="M ${ponto(rExt, a0)} A ${rExt} ${rExt} 0 ${grande} 1 ${ponto(rExt, a1)} L ${ponto(rInt, a1)} A ${rInt} ${rInt} 0 ${grande} 0 ${ponto(rInt, a0)} Z"/>`;
  }).join('');
  const id = 'gr' + (++seqGrafico);
  GRAFICOS[id] = { modo: 'fatias', linhas: fatias.map((f) => `<b>${esc(f.rotulo)}</b><br>${esc(formata(f.valor))} · ${fmtPct(f.valor / total, 0)}`) };
  const legenda = `<ul class="rosca-legenda">${fatias.map((f, i) => `<li>
      <i style="background:${f.cor || CORES_FATIA[i % CORES_FATIA.length]}"></i>
      <span class="rosca-rot">${esc(f.rotulo)}</span>
      <span class="num">${esc(formata(f.valor))}</span>
      <span class="num tinta2">${fmtPct(f.valor / total, 0)}</span></li>`).join('')}</ul>`;
  return `<div class="rosca">
    <div class="grafico-cx rosca-svg" data-grafico="${id}" style="position:relative">
      <svg class="grafico" viewBox="0 0 ${S} ${S}" role="img" aria-label="${esc(rotulo)}">
        ${arcos}
        <text x="${c}" y="${c - 3}" text-anchor="middle" class="rosca-total">${esc(formata(total))}</text>
        <text x="${c}" y="${c + 13}" text-anchor="middle">${esc(centro)}</text>
      </svg>
      <div class="tt" style="display:none"></div>
    </div>
    ${legenda}
  </div>`;
}

/* Saldo projetado: entradas × saídas por mês em colunas e a linha do saldo
   acumulado; o menor saldo marcado — em cor de alerta se for negativo.
   meses: [{ ym, entradas, saidas, saldo }]; menor: { saldo, data }. */
function graficoSaldoProjetado(meses, menor, { altura = 240, largura = 560 } = {}) {
  if (!meses.length) return semDados('Nada projetado no período.');
  const n = meses.length;
  const W = largura, H = altura, ml = 66, mr = 10, mt = 14, mb = 28;
  const x0 = ml, x1 = W - mr, y0 = H - mb, y1 = mt;
  const maxV = Math.max(1, ...meses.map((m) => Math.max(m.entradas, m.saidas, m.saldo)));
  const minV = Math.min(0, ...meses.map((m) => m.saldo));
  const tk = ticks(minV, maxV, 4);
  const lo = tk[0], hi = tk[tk.length - 1];
  const py = (v) => y0 - ((v - lo) / (hi - lo || 1)) * (y0 - y1);
  const larg = (x1 - x0) / n;
  const lb = Math.min(18, larg * 0.3);
  const barras = meses.map((m, i) => {
    const cx = x0 + larg * (i + 0.5);
    const b = (v, dx, cor) => {
      const a = Math.abs(py(v) - py(0));
      return a < 0.6 ? '' : `<rect x="${(cx + dx).toFixed(1)}" y="${Math.min(py(v), py(0)).toFixed(1)}" width="${lb.toFixed(1)}" height="${a.toFixed(1)}" rx="2" fill="${cor}"/>`;
    };
    return b(m.entradas, -lb - 1, 'var(--serie1)') + b(m.saidas, 1, 'var(--serie2)');
  }).join('');
  const pts = meses.map((m, i) => [x0 + larg * (i + 0.5), py(m.saldo)]);
  const iMenor = menor ? meses.findIndex((m) => m.ym === competencia(menor.data)) : -1;
  const negativo = menor && menor.saldo < 0;
  const marca = iMenor >= 0
    ? `<circle cx="${pts[iMenor][0].toFixed(1)}" cy="${py(menor.saldo).toFixed(1)}" r="4.5" fill="${negativo ? 'var(--critico)' : 'var(--alerta)'}" stroke="var(--sup)" stroke-width="1.5"/>`
    : '';
  const zero = lo < 0 ? `<line x1="${x0}" y1="${py(0).toFixed(1)}" x2="${x1}" y2="${py(0).toFixed(1)}" stroke="var(--linha-forte)" stroke-width="1"/>` : '';
  const passo = Math.max(1, Math.ceil(n / Math.max(3, Math.floor(W / 70))));
  const eixoX = meses.map((m, i) => (i % passo === 0 || i === n - 1)
    ? `<text x="${(x0 + larg * (i + 0.5)).toFixed(1)}" y="${y0 + 16}" text-anchor="middle">${fmtCompetencia(m.ym)}</text>` : '').join('');
  const id = 'gr' + (++seqGrafico);
  GRAFICOS[id] = { modo: 'colunas', x0, x1, n, W, linhas: meses.map((m) => `<b>${fmtCompetencia(m.ym)}</b><br>
    Entradas: ${fmtMoney(m.entradas, { dec: 0 })}<br>Saídas: ${fmtMoney(m.saidas, { dec: 0 })}<br>Saldo: ${fmtMoney(m.saldo, { dec: 0 })}`) };
  return legendaHTML([['Entradas', 'var(--serie1)'], ['Saídas', 'var(--serie2)'], ['Saldo acumulado', 'var(--tinta)']]) +
    caixaGrafico(id, W, H, 'Saldo projetado por mês',
      `${eixoY(tk, x0, x1, py, (v) => fmtMoneyCurto(v))}${zero}${barras}
       <path d="${caminho(pts)}" fill="none" stroke="var(--tinta)" stroke-width="2" stroke-linejoin="round" opacity=".8"/>
       ${marca}<line class="eixo" x1="${x0}" y1="${y0}" x2="${x1}" y2="${y0}"/>${eixoX}`, true, y1, y0) +
    (menor ? `<p class="grafico-nota ${negativo ? 'atraso' : 'tinta2'}">menor saldo: ${fmtMoney(menor.saldo, { dec: 0 })} em ${fmtDataCurta(menor.data)}</p>` : '');
}

/* ------------------------------------------------- BARRAS HORIZONTAIS */
function graficoBarras(itens, opcoes = {}) {
  const { formata = (v) => fmtMoney(v), cor = 'var(--s1)', max: maxForcado, manterZeros = false } = opcoes;
  const base = manterZeros ? itens.slice() : itens.filter((i) => num(i.valor) !== 0);
  /* manterOrdem: série no tempo (mês a mês) não se reordena por valor */
  const lista = (opcoes.manterOrdem ? base : base.sort((a, b) => b.valor - a.valor)).slice(0, opcoes.limite || 12);
  if (!lista.length) return `<p style="color:var(--mudo);margin:0">Sem dados para exibir.</p>`;
  const max = maxForcado || Math.max(...lista.map((i) => Math.abs(i.valor))) || 1;
  return `<div style="display:flex;flex-direction:column;gap:9px">${lista.map((i) => `
    <div>
      <div style="display:flex;gap:8px;font-size:12.5px;margin-bottom:3px">
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(i.rotulo)}</span>
        <b class="num mono" style="margin-left:auto;font-size:12px">${formata(i.valor)}</b>
      </div>
      <div class="barra" style="height:8px"><i style="width:${(Math.abs(i.valor) / max * 100).toFixed(1)}%;background:${i.cor || cor}"></i></div>
    </div>`).join('')}</div>`;
}

/* ------------------------------------------- interação (hover/tooltip) */
function desenharGraficosPendentes() {
  document.querySelectorAll('[data-grafico]').forEach((cx) => {
    const g = GRAFICOS[cx.dataset.grafico];
    if (!g || cx.dataset.pronto) return;
    cx.dataset.pronto = '1';
    const svgEl = cx.querySelector('svg');
    const cursor = cx.querySelector('.cursor');
    const tt = cx.querySelector('.tt');
    Object.assign(tt.style, {
      position: 'absolute', pointerEvents: 'none', zIndex: '5',
      background: 'var(--rail)', color: 'var(--rail-tinta)', padding: '7px 10px',
      borderRadius: '4px', fontSize: '12px', lineHeight: '1.45',
      boxShadow: '0 6px 18px rgba(0,0,0,.3)', whiteSpace: 'nowrap', maxWidth: '260px'
    });

    /* Gantt (Fase 2): o hover segue a LINHA sob o cursor, não uma posição X
       fixa como nos gráficos de série — cada etapa é uma linha, não um
       ponto no tempo. Sem cursor vertical; o tooltip acompanha o mouse. */
    if (g.modo === 'linhas-y') {
      const moverY = (ev) => {
        const r = svgEl.getBoundingClientRect();
        const cx = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left;
        const cy = (ev.touches ? ev.touches[0].clientY : ev.clientY) - r.top;
        const ySvg = (cy / r.height) * g.H;
        const i = Math.floor((ySvg - g.mt) / g.linhaH);
        if (i < 0 || i >= g.n) { tt.style.display = 'none'; return; }
        tt.style.display = '';
        tt.innerHTML = g.linhas[i];
        tt.style.left = Math.min(Math.max(6, cx + 14), r.width - tt.offsetWidth - 6) + 'px';
        tt.style.top = Math.min(Math.max(6, cy - 10), r.height - tt.offsetHeight - 6) + 'px';
      };
      const sairY = () => { tt.style.display = 'none'; };
      svgEl.addEventListener('mousemove', moverY);
      svgEl.addEventListener('mouseleave', sairY);
      svgEl.addEventListener('touchmove', moverY, { passive: true });
      svgEl.addEventListener('touchend', sairY);
      return;
    }

    /* Rosca: o tooltip é da fatia sob o dedo ou o mouse. */
    if (g.modo === 'fatias') {
      const moverF = (ev) => {
        const pt = ev.touches ? ev.touches[0] : ev;
        const alvo = ev.touches ? document.elementFromPoint(pt.clientX, pt.clientY) : ev.target;
        const f = alvo && alvo.closest ? alvo.closest('[data-fatia]') : null;
        if (!f) { tt.style.display = 'none'; return; }
        const r = cx.getBoundingClientRect();
        tt.style.display = '';
        tt.innerHTML = g.linhas[Number(f.dataset.fatia)];
        tt.style.left = Math.min(Math.max(4, pt.clientX - r.left + 12), r.width - tt.offsetWidth - 4) + 'px';
        tt.style.top = Math.max(4, pt.clientY - r.top - tt.offsetHeight - 8) + 'px';
      };
      const sairF = () => { tt.style.display = 'none'; };
      svgEl.addEventListener('mousemove', moverF);
      svgEl.addEventListener('mouseleave', sairF);
      svgEl.addEventListener('touchstart', moverF, { passive: true });
      svgEl.addEventListener('touchmove', moverF, { passive: true });
      svgEl.addEventListener('touchend', sairF);
      return;
    }
    /* Colunas: o índice é a coluna sob o cursor, o cursor no meio dela. */
    if (g.modo === 'colunas') {
      const moverC = (ev) => {
        const r = svgEl.getBoundingClientRect();
        const cliente = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left;
        const xSvg = (cliente / r.width) * g.W;
        const larg = (g.x1 - g.x0) / g.n;
        const i = Math.max(0, Math.min(g.n - 1, Math.floor((xSvg - g.x0) / larg)));
        const xPos = g.x0 + larg * (i + 0.5);
        cursor.style.display = '';
        cursor.setAttribute('x1', xPos); cursor.setAttribute('x2', xPos);
        tt.style.display = '';
        tt.innerHTML = g.linhas[i];
        const px = (xPos / g.W) * r.width;
        tt.style.left = Math.min(Math.max(6, px + 12), r.width - tt.offsetWidth - 6) + 'px';
        tt.style.top = '8px';
      };
      const sairC = () => { cursor.style.display = 'none'; tt.style.display = 'none'; };
      svgEl.addEventListener('mousemove', moverC);
      svgEl.addEventListener('mouseleave', sairC);
      svgEl.addEventListener('touchstart', moverC, { passive: true });
      svgEl.addEventListener('touchmove', moverC, { passive: true });
      svgEl.addEventListener('touchend', sairC);
      return;
    }

    const mover = (ev) => {
      const r = svgEl.getBoundingClientRect();
      const cliente = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left;
      const xSvg = (cliente / r.width) * g.W;
      const passo = (g.x1 - g.x0) / Math.max(1, g.n - 1);
      let i = Math.round((xSvg - g.x0) / (g.n > 1 ? passo : 1));
      if (g.n > 1 && (g.x1 - g.x0) / g.n > 0 && g.linhas.length === g.n) {
        const largura = (g.x1 - g.x0) / g.n;
        const alt = Math.floor((xSvg - g.x0) / largura);
        if (Math.abs(alt - i) > 1) i = alt;
      }
      i = Math.max(0, Math.min(g.n - 1, i));
      const xPos = g.n > 1 ? g.x0 + i * passo : (g.x0 + g.x1) / 2;
      cursor.style.display = '';
      cursor.setAttribute('x1', xPos); cursor.setAttribute('x2', xPos);
      tt.style.display = '';
      tt.innerHTML = g.linhas[i];
      const px = (xPos / g.W) * r.width;
      tt.style.left = Math.min(Math.max(6, px + 12), r.width - tt.offsetWidth - 6) + 'px';
      tt.style.top = '8px';
    };
    const sair = () => { cursor.style.display = 'none'; tt.style.display = 'none'; };
    svgEl.addEventListener('mousemove', mover);
    svgEl.addEventListener('mouseleave', sair);
    svgEl.addEventListener('touchmove', mover, { passive: true });
    svgEl.addEventListener('touchend', sair);
  });
}

export {
  graficoAuto,
  limparGraficosAuto,
  ajustarGraficosAuto,
  graficoLinhas,
  graficoColunas,
  graficoRosca,
  graficoSaldoProjetado,
  fatiasRosca,
  ajustarGantt,
  GRAFICOS,
  seqGrafico,
  escNum,
  ticks,
  caminho,
  graficoCurvaS,
  graficoFluxo,
  graficoFluxoCarteira,
  graficoGantt,
  graficoBarras,
  desenharGraficosPendentes
};
