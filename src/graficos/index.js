/**
 * index.js — Gráficos em SVG puro: curva S, fluxo de caixa, Gantt e barras.
 */
import { addMeses, competencia, diasEntre, esc, fimDoMes, fmtCompetencia, fmtMoney, fmtMoneyCurto, fmtPct, hojeISO, inicioDoMes, isISO, num, round2 } from '../nucleo/base.js';
import { curvaS, etapaCalc, fluxoCaixa } from '../dominio/calculos.js';
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
  const out = [];
  for (let v = ini; v <= max + passo * 0.001; v += passo) out.push(round2(v));
  return out;
}

function caminho(pontos) {
  return pontos.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
}

/* ------------------------------------------------------------ CURVA S */
function graficoCurvaS(obra, altura = 300) {
  const dados = curvaS(obra);
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

  const areaReal = sFisReal.length > 1
    ? `<path d="${caminho(sFisReal)} L ${sFisReal[sFisReal.length - 1][0].toFixed(1)} ${y0} L ${sFisReal[0][0].toFixed(1)} ${y0} Z" fill="url(#gradS)"/>` : '';

  const linha = (pts, cor, tracejada, larg = 2) => pts.length > 1
    ? `<path d="${caminho(pts)}" fill="none" stroke="${cor}" stroke-width="${larg}" stroke-linejoin="round" stroke-linecap="round" ${tracejada ? 'stroke-dasharray="6 4"' : ''}/>` : '';

  const fim = (pts, cor, texto) => {
    if (!pts.length) return '';
    const [fx, fy] = pts[pts.length - 1];
    const acima = fy > y1 + 22;
    return `<circle cx="${fx.toFixed(1)}" cy="${fy.toFixed(1)}" r="4" fill="${cor}" stroke="var(--sup)" stroke-width="2"/>
      ${texto ? `<text x="${fx.toFixed(1)}" y="${(fy + (acima ? -9 : 15)).toFixed(1)}" text-anchor="end" fill="${cor}" style="font-size:11px;font-weight:600">${texto}</text>` : ''}`;
  };

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
      d.financeiroRealizado === null ? null : `Desembolso: ${fmtMoney(d.desembolsoAcumulado, { dec: 0 })}`
    ].filter(Boolean).join('<br>'))
  };

  const ultReal = dados.filter((d) => d.fisicoRealizado !== null).pop();
  const ultFin = dados.filter((d) => d.financeiroRealizado !== null).pop();

  return `
  <div class="legenda" style="margin-bottom:10px">
    <span style="color:var(--s1)"><i style="background:var(--s1)"></i>Físico realizado</span>
    <span style="color:var(--s1)"><i class="traco"></i>Físico previsto</span>
    <span style="color:var(--s2)"><i style="background:var(--s2)"></i>Financeiro realizado</span>
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
      ${linha(sFinReal, 'var(--s2)', false)}
      ${linha(sFisReal, 'var(--s1)', false, 2.4)}
      ${fim(sFisReal, 'var(--s1)', ultReal ? fmtPct(ultReal.fisicoRealizado, 0) : '')}
      ${fim(sFinReal, 'var(--s2)', ultFin ? fmtPct(ultFin.financeiroRealizado, 0) : '')}
      <line class="eixo" x1="${x0}" y1="${y0}" x2="${x1}" y2="${y0}"/>
      ${rotulosX}
      <line class="cursor" x1="0" y1="${y1}" x2="0" y2="${y0}" stroke="var(--linha-forte)" stroke-width="1" style="display:none"/>
    </svg>
    <div class="tt" style="display:none"></div>
  </div>`;
}

/* ------------------------------------------------------ FLUXO DE CAIXA */
function graficoFluxo(obra, altura = 280) {
  const dados = fluxoCaixa(obra);
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

/* -------------------------------------------------------------- GANTT */
function graficoGantt(obra) {
  const etapas = obra.cronograma.filter((e) => isISO(e.inicioPrevisto) || isISO(e.inicioReal));
  if (!etapas.length) return vazio('Cronograma sem datas', 'Informe início e fim previstos das etapas.');
  const datas = [];
  etapas.forEach((e) => ['inicioPrevisto', 'fimPrevisto', 'inicioReal', 'fimReal'].forEach((k) => { if (isISO(e[k])) datas.push(e[k]); }));
  datas.push(hojeISO());
  datas.sort();
  const ini = datas[0], fim = datas[datas.length - 1];
  const span = Math.max(1, diasEntre(ini, fim));
  const W = 920, linhaH = 26, ml = 176, mr = 14, mt = 26;
  const H = mt + etapas.length * linhaH + 12;
  const x0 = ml, x1 = W - mr;
  const px = (d) => x0 + (diasEntre(ini, d) / span) * (x1 - x0);

  const meses = [];
  let c = competencia(ini);
  while (c <= competencia(fim) && meses.length < 40) { meses.push(c); c = addMeses(c, 1); }
  const gradeMes = meses.map((m) => {
    const d = inicioDoMes(m);
    if (d < ini) return '';
    return `<line class="grade-l" x1="${px(d).toFixed(1)}" y1="${mt - 8}" x2="${px(d).toFixed(1)}" y2="${H - 6}"/>
            <text x="${px(d).toFixed(1)}" y="${mt - 12}" text-anchor="middle">${fmtCompetencia(m)}</text>`;
  }).join('');

  const linhas = etapas.map((e, i) => {
    const y = mt + i * linhaH;
    const c2 = etapaCalc(e);
    const cor = c2.situacao === 'ATRASADO' ? 'var(--critico)' : c2.situacao === 'CONCLUÍDO' ? 'var(--ok)' : 'var(--s1)';
    let prev = '', real = '';
    if (isISO(e.inicioPrevisto) && isISO(e.fimPrevisto)) {
      const a = px(e.inicioPrevisto), b = Math.max(px(e.fimPrevisto), a + 3);
      prev = `<rect x="${a.toFixed(1)}" y="${y + 4}" width="${(b - a).toFixed(1)}" height="7" rx="3" fill="var(--linha-forte)" opacity=".55"/>`;
    }
    if (isISO(e.inicioReal)) {
      const a = px(e.inicioReal);
      const b = Math.max(px(isISO(e.fimReal) ? e.fimReal : hojeISO()), a + 3);
      real = `<rect x="${a.toFixed(1)}" y="${y + 12}" width="${(b - a).toFixed(1)}" height="8" rx="3" fill="${cor}"/>`;
      if (c2.progresso > 0 && c2.progresso < 1) {
        real += `<rect x="${a.toFixed(1)}" y="${y + 12}" width="${((b - a) * c2.progresso).toFixed(1)}" height="8" rx="3" fill="${cor}"/>
                 <rect x="${a.toFixed(1)}" y="${y + 12}" width="${(b - a).toFixed(1)}" height="8" rx="3" fill="none" stroke="${cor}" stroke-width="1"/>`;
      }
    }
    return `<text x="8" y="${y + 15}" fill="var(--tinta2)" style="font-size:11.5px">${esc(e.etapa.length > 26 ? e.etapa.slice(0, 25) + '…' : e.etapa)}</text>
            <title>${esc(e.etapa)} — ${c2.situacao}</title>${prev}${real}`;
  }).join('');

  const hoje = `<line x1="${px(hojeISO()).toFixed(1)}" y1="${mt - 6}" x2="${px(hojeISO()).toFixed(1)}" y2="${H - 6}" stroke="var(--critico)" stroke-width="1.5" stroke-dasharray="4 3"/>`;

  return `<div class="legenda" style="margin-bottom:8px">
      <span style="color:var(--mudo)"><i style="background:var(--linha-forte)"></i>Previsto</span>
      <span style="color:var(--s1)"><i style="background:var(--s1)"></i>Em andamento</span>
      <span style="color:var(--ok)"><i style="background:var(--ok)"></i>Concluído</span>
      <span style="color:var(--critico)"><i style="background:var(--critico)"></i>Atrasado · linha de hoje</span>
    </div>
    <div class="tab-rolagem"><svg class="grafico" viewBox="0 0 ${W} ${H}" style="min-width:640px" role="img" aria-label="Cronograma da obra">
      ${gradeMes}${linhas}${hoje}
    </svg></div>`;
}

/* ------------------------------------------------- BARRAS HORIZONTAIS */
function graficoBarras(itens, opcoes = {}) {
  const { formata = (v) => fmtMoney(v), cor = 'var(--s1)', max: maxForcado } = opcoes;
  const lista = itens.filter((i) => num(i.valor) !== 0).sort((a, b) => b.valor - a.valor).slice(0, opcoes.limite || 12);
  if (!lista.length) return `<p style="color:var(--mudo);margin:0">Sem dados para exibir.</p>`;
  const max = maxForcado || Math.max(...lista.map((i) => Math.abs(i.valor)));
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
  GRAFICOS,
  seqGrafico,
  escNum,
  ticks,
  caminho,
  graficoCurvaS,
  graficoFluxo,
  graficoGantt,
  graficoBarras,
  desenharGraficosPendentes
};
