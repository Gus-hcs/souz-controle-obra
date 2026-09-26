/**
 * relatorio.mjs — Transforma resultado.json em docs/relatorio-responsivo.html.
 *
 *   node tests/responsivo/relatorio.mjs
 *
 * O relatório é para ser aberto e lido por gente: a grade de screenshots
 * mostra o que está acontecendo, e a tabela de falhas diz onde. As falhas
 * vêm agrupadas por causa raiz, porque corrigir 200 sintomas um a um é o
 * jeito errado — quase sempre são cinco causas.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '../..');
const PASTA = path.join(RAIZ, 'docs', 'relatorio-responsivo');
const JSON_ENTRADA = path.join(PASTA, 'resultado.json');
const HTML_SAIDA = path.join(RAIZ, 'docs', 'relatorio-responsivo.html');

if (!fs.existsSync(JSON_ENTRADA)) {
  console.error('Não achei resultado.json. Rode antes: npm run test:responsivo');
  process.exit(2);
}
const r = JSON.parse(fs.readFileSync(JSON_ENTRADA, 'utf8'));

const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );

/* ------------------------------------------------------- causas raiz
   O que cada checagem costuma significar em termos de conserto. É isso
   que transforma "200 falhas" em "5 coisas para arrumar". */
const CAUSAS = {
  'alvo-de-toque': {
    titulo: 'Controles pequenos demais para o dedo',
    causa:
      'A altura de controle é 28px (--alt-ctrl), pensada para ponteiro do macOS. Abaixo de 768px o alvo precisa de 44px.',
    onde: 'tokens.css + interface.css',
  },
  'fonte-minima': {
    titulo: 'Texto abaixo de 12px',
    causa: '--t-mini vale 11px e é usado em rótulo de coluna, contador e cabeçalho de seção.',
    onde: 'tokens.css',
  },
  'zoom-no-ios': {
    titulo: 'Campo faz o iOS dar zoom sozinho',
    causa:
      'Input com fonte menor que 16px: o Safari amplia a página ao focar e o enquadramento se perde.',
    onde: 'interface.css',
  },
  'rolagem-horizontal': {
    titulo: 'A página inteira rola de lado',
    causa:
      'Algum conteúdo largo não está contido: tabela ou gráfico sem contêiner de rolagem próprio.',
    onde: 'interface.css',
  },
  'elemento-fora-da-viewport': {
    titulo: 'Elemento passa da borda da tela',
    causa: 'Largura fixa ou mínima maior que a tela, ou flex sem min-width: 0.',
    onde: 'interface.css',
  },
  'texto-cortado': {
    titulo: 'Texto cortado sem reticências',
    causa: 'Caixa com overflow escondido e conteúdo maior, sem text-overflow nem quebra de linha.',
    onde: 'interface.css',
  },
  'interativo-coberto': {
    titulo: 'Botão coberto por outro elemento',
    causa: 'Sobreposição de camadas: z-index ou posicionamento fixo cobrindo área clicável.',
    onde: 'interface.css',
  },
  'grafico-fora-do-container': {
    titulo: 'Gráfico maior que a caixa',
    causa: 'SVG sem largura fluida ou com viewBox de largura mínima.',
    onde: 'graficos/index.js + interface.css',
  },
  'kpi-largura-desigual': {
    titulo: 'Cards de KPI com larguras diferentes na mesma linha',
    causa:
      'A faixa não está usando faixaKpis ou uma regra local sobrepôs a grade de colunas iguais.',
    onde: 'ui/telas/componentes.js (faixaKpis) + ui/padrao.css',
  },
  'kpi-altura-desigual': {
    titulo: 'Cards de KPI com alturas diferentes',
    causa: 'Contexto sem o corte de duas linhas ou grade sem linhas de altura igual.',
    onde: 'ui/padrao.css (.kpis, .kpi-ctx)',
  },
  'area-vazia-a-direita': {
    titulo: 'Tela que não usa a largura disponível',
    causa:
      'max-width local, tabela com largura pelo conteúdo ou bloco sem par no painel de análise.',
    onde: 'ui/padrao.css (contêiner) + a tela',
  },
  'painel-rolagem-horizontal': {
    titulo: 'Gráfico ou painel lateral rolando de lado',
    causa: 'SVG desenhado mais largo que o bloco, ou coluna fixa estreita demais para o conteúdo.',
    onde: 'graficos/index.js (graficoAuto) + ui/padrao.css',
  },
  'largura-de-leitura': {
    titulo: 'Linha de texto longa demais no ultrawide',
    causa: 'Falta limite de largura de leitura no conteúdo.',
    onde: 'interface.css',
  },
  'movimento-reduzido': {
    titulo: 'Anima com prefers-reduced-motion ligado',
    causa: 'A regra de movimento reduzido não alcança esta animação.',
    onde: 'tokens.css + interface.css',
  },
  'anima-propriedade-cara': {
    titulo: 'Anima propriedade que força recálculo de layout',
    causa: 'Transição em width/height/top/left/margin/box-shadow em vez de transform/opacity.',
    onde: 'interface.css + estilo.css',
  },
  'usa-100vh': {
    titulo: 'Usa 100vh em vez de 100dvh',
    causa: 'No celular, 100vh conta a barra do navegador e o rodapé fica escondido atrás dela.',
    onde: 'interface.css',
  },
};

/* ------------------------------------------------------- agrupamentos */
const porCausa = new Map();
const registrar = (f, contexto) => {
  const g = porCausa.get(f.checagem) || {
    checagem: f.checagem,
    gravidade: f.gravidade,
    total: 0,
    telas: new Set(),
    viewports: new Set(),
    seletores: new Map(),
    exemplos: [],
  };
  g.total++;
  if (contexto.tela) g.telas.add(contexto.tela);
  if (contexto.viewport) g.viewports.add(contexto.viewport);
  g.seletores.set(f.seletor, (g.seletores.get(f.seletor) || 0) + 1);
  if (g.exemplos.length < 8) g.exemplos.push({ ...f, ...contexto });
  porCausa.set(f.checagem, g);
};
for (const c of r.combinacoes)
  for (const f of c.falhas)
    registrar(f, { tela: c.tela, viewport: c.viewport, tema: c.tema, estado: c.estado });
for (const f of r.folhas) registrar(f, {});

const causas = [...porCausa.values()].sort((a, b) => b.total - a.total);

/* Antes × depois: as capturas guardadas em relatorio-responsivo/antes e
   relatorio-responsivo/depois (tela__largura__tema.jpg), tiradas com a
   mesma obra de demonstração. Só aparece quando as duas pastas existem. */
function antesDepoisHTML() {
  const pAntes = path.join(PASTA, 'antes');
  const pDepois = path.join(PASTA, 'depois');
  if (!fs.existsSync(pAntes) || !fs.existsSync(pDepois)) return '';
  const nomes = fs.readdirSync(pDepois).filter((f) => f.endsWith('.jpg'));
  const telasAD = [...new Set(nomes.map((f) => f.split('__')[0]))].sort();
  const larguras = ['1920', '1440', '1024', '390'];
  const bloco = (tema) => `
<h3 style="margin:24px 0 8px">Tema ${tema === 'light' ? 'claro' : 'escuro'}</h3>
<div class="grade"><table>
  <thead><tr><th>Tela</th>${larguras.map((w) => `<th>${w}px</th>`).join('')}</tr></thead>
  <tbody>${telasAD
    .map(
      (t) =>
        `<tr><td><b>${esc(t)}</b></td>${larguras
          .map((w) => {
            const arq = `${t}__${w}__${tema}.jpg`;
            const tem = (d) => fs.existsSync(path.join(PASTA, d, arq));
            const fig = (d, rot) =>
              tem(d)
                ? `<figure><img loading="lazy" src="relatorio-responsivo/${d}/${esc(arq)}" alt="${esc(t)} ${rot} ${w}px"
                  data-legenda="${esc(`${t} · ${rot} · ${w}px · ${tema}`)}"><figcaption>${rot}</figcaption></figure>`
                : '';
            return `<td><div class="ad">${fig('antes', 'antes')}${fig('depois', 'depois')}</div></td>`;
          })
          .join('')}</tr>`,
    )
    .join('')}</tbody></table></div>`;
  return `<h2>Antes × depois</h2>
<p class="sub">Padronização das telas (set/2026). Cada célula: antes à esquerda, depois à direita. Clique para ampliar.</p>
${bloco('light')}${bloco('dark')}`;
}

/* Matriz tela × viewport, para a grade de screenshots. */
const telas = [...new Set(r.combinacoes.map((c) => c.tela))].sort();
const viewports = [];
for (const c of r.combinacoes) {
  if (!viewports.some((v) => v.nome === c.viewport))
    viewports.push({ nome: c.viewport, w: c.largura, h: c.altura });
}
viewports.sort((a, b) => a.w - b.w || a.h - b.h);

const achar = (tela, viewport, tema, estado = 'normal', extra = '') =>
  r.combinacoes.find(
    (c) =>
      c.tela === tela &&
      c.viewport === viewport &&
      c.tema === tema &&
      c.estado === estado &&
      (c.extra || '') === extra,
  );

const M = r.metas;
const fluidezRuim = (f) =>
  f.cls > M.cls ||
  f.respostas.some((x) => x.ms > M.resposta) ||
  (f.rolagem && f.rolagem.fps < M.fps) ||
  f.tarefasLongas.length > 0;

const res = r.resumo;
const combOk = res.combinacoes - res.combinacoesComFalha;
const pct = res.combinacoes ? Math.round((combOk / res.combinacoes) * 100) : 0;

/* ------------------------------------------------------------- html */
const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Responsividade e fluidez — Souz Controle de Obra</title>
<style>
  :root {
    color-scheme: light dark;
    --fundo: #fff; --fundo2: #f6f7f7; --tinta: #161a19; --tinta2: #5b6462; --tinta3: #69726f;
    --linha: rgba(0,0,0,.1); --ok: #0a6b62; --falha: #c0392b; --aviso: #8a5a00;
    --fonte: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --fundo: #1b1f1e; --fundo2: #242a28; --tinta: #f2f4f3; --tinta2: #a7b0ae; --tinta3: #858e8b;
      --linha: rgba(255,255,255,.12); --ok: #3fc9b8; --falha: #f08070; --aviso: #e0a44a;
    }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--fundo); color: var(--tinta); font-family: var(--fonte);
         font-size: 14px; line-height: 1.5; }
  .env { max-width: 1400px; margin: 0 auto; padding: 32px 20px 80px; }
  h1 { font-size: 24px; margin: 0 0 4px; }
  h2 { font-size: 18px; margin: 44px 0 12px; padding-top: 20px; border-top: 1px solid var(--linha); }
  h3 { font-size: 15px; margin: 0 0 6px; }
  .sub { color: var(--tinta2); margin: 0 0 24px; font-size: 13px; }
  .placar { display: flex; gap: 28px; flex-wrap: wrap; padding: 18px 20px; background: var(--fundo2);
            border-radius: 10px; margin-bottom: 8px; }
  .placar div { display: flex; flex-direction: column; }
  .placar b { font-size: 26px; font-variant-numeric: tabular-nums; line-height: 1.15; }
  .placar span { font-size: 12px; color: var(--tinta2); }
  .ok { color: var(--ok); } .ruim { color: var(--falha); } .meio { color: var(--aviso); }
  table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 8px; }
  th { text-align: left; font-size: 11px; font-weight: 600; color: var(--tinta2);
       padding: 6px 10px; border-bottom: 1px solid var(--linha); white-space: nowrap; }
  td { padding: 6px 10px; border-bottom: 1px solid var(--linha); vertical-align: top; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  code { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12px;
         background: var(--fundo2); padding: 1px 5px; border-radius: 4px; word-break: break-all; }
  details { border: 1px solid var(--linha); border-radius: 8px; margin-bottom: 10px; background: var(--fundo); }
  details[open] { background: var(--fundo2); }
  summary { padding: 12px 16px; cursor: pointer; display: flex; align-items: baseline; gap: 10px; }
  summary::-webkit-details-marker { display: none; }
  summary h3 { flex: 1; }
  .conta { font-variant-numeric: tabular-nums; font-weight: 600; }
  .corpo { padding: 0 16px 16px; }
  .porque { color: var(--tinta2); font-size: 13px; margin: 0 0 10px; }
  .onde { font-size: 12px; color: var(--tinta3); }
  .grade { overflow-x: auto; }
  .grade table { min-width: 100%; }
  .grade th:first-child, .grade td:first-child { position: sticky; left: 0; background: var(--fundo); }
  .tira { display: flex; gap: 4px; }
  figure { margin: 0; }
  figure img { display: block; width: 150px; height: auto; border: 1px solid var(--linha);
               border-radius: 4px; cursor: zoom-in; background: var(--fundo2); }
  figure img.temFalha { border-color: var(--falha); border-width: 2px; }
  figcaption { font-size: 10px; color: var(--tinta3); text-align: center; margin-top: 2px; }
  dialog { border: 0; border-radius: 10px; padding: 0; max-width: 96vw; max-height: 96vh;
           background: var(--fundo); }
  dialog::backdrop { background: rgba(0,0,0,.7); }
  dialog img { display: block; max-width: 92vw; max-height: 88vh; }
  dialog .legenda { padding: 10px 14px; font-size: 13px; }
  .pill { display: inline-block; font-size: 11px; padding: 1px 7px; border-radius: 99px;
          background: var(--fundo2); color: var(--tinta2); margin-right: 4px; }
  .vazio-bom { padding: 24px; text-align: center; color: var(--ok); font-weight: 600; }
.ad{display:flex;gap:4px}.ad figure{flex:1}
</style>
</head>
<body>
<div class="env">

<h1>Responsividade e fluidez</h1>
<p class="sub">Souz Controle de Obra · gerado em ${esc(new Date(r.geradoEm).toLocaleString('pt-BR'))}</p>

<div class="placar">
  <div><b class="${res.combinacoesComFalha ? 'ruim' : 'ok'}">${combOk}/${res.combinacoes}</b><span>combinações sem falha (${pct}%)</span></div>
  <div><b class="${res.falhas ? 'ruim' : 'ok'}">${res.falhas}</b><span>falhas de layout</span></div>
  <div><b class="${res.fluidezForaDaMeta ? 'ruim' : 'ok'}">${res.fluidezForaDaMeta}/${res.medicoesFluidez}</b><span>medições de fluidez fora da meta</span></div>
  <div><b class="${res.avisosDeFolha ? 'meio' : 'ok'}">${res.avisosDeFolha}</b><span>avisos nas folhas de estilo</span></div>
  <div><b class="${res.quebrasNoResize ? 'ruim' : 'ok'}">${res.quebrasNoResize}</b><span>quebras ao redimensionar</span></div>
  <div><b>${causas.length}</b><span>causas raiz distintas</span></div>
</div>

<h2>Falhas por causa raiz</h2>
<p class="sub">Ordenadas pelo tanto que aparecem. O número grande é sintoma; o conserto é no que está em “onde”.</p>
${
  causas.length
    ? causas
        .map(
          (g) => `
<details${g.total > 20 ? ' open' : ''}>
  <summary>
    <span class="conta ${g.gravidade === 'aviso' ? 'meio' : 'ruim'}">${g.total}</span>
    <h3>${esc((CAUSAS[g.checagem] || {}).titulo || g.checagem)}</h3>
    <span class="pill">${esc(g.checagem)}</span>
    ${g.telas.size ? `<span class="pill">${g.telas.size} tela${g.telas.size > 1 ? 's' : ''}</span>` : ''}
    ${g.viewports.size ? `<span class="pill">${g.viewports.size} tamanho${g.viewports.size > 1 ? 's' : ''}</span>` : ''}
  </summary>
  <div class="corpo">
    <p class="porque">${esc((CAUSAS[g.checagem] || {}).causa || '')}</p>
    <p class="onde">Onde se corrige: <code>${esc((CAUSAS[g.checagem] || {}).onde || '—')}</code></p>
    ${
      g.telas.size
        ? `<p class="onde">Telas atingidas: ${[...g.telas]
            .sort()
            .map((t) => `<span class="pill">${esc(t)}</span>`)
            .join('')}</p>`
        : ''
    }
    <table>
      <thead><tr><th>Seletor culpado</th><th class="num">Ocorrências</th></tr></thead>
      <tbody>${[...g.seletores.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([s, n]) => `<tr><td><code>${esc(s)}</code></td><td class="num">${n}</td></tr>`)
        .join('')}</tbody>
    </table>
    <table>
      <thead><tr><th>Tela</th><th>Tamanho</th><th>Estado</th><th>Medido</th><th>Meta</th></tr></thead>
      <tbody>${g.exemplos
        .map(
          (e) => `<tr><td>${esc(e.tela || '—')}</td><td>${esc(e.viewport || '—')}</td>
            <td>${esc(e.estado || '—')}</td><td>${esc(e.medido)}</td><td>${esc(e.meta)}</td></tr>`,
        )
        .join('')}</tbody>
    </table>
  </div>
</details>`,
        )
        .join('')
    : '<p class="vazio-bom">Nenhuma falha de layout.</p>'
}

<h2>Fluidez com a CPU 4× mais lenta</h2>
<p class="sub">Metas: CLS &lt; ${M.cls} · resposta &lt; ${M.resposta}ms · sem tarefa acima de ${M.tarefaLonga}ms · rolagem ≥ ${M.fps} fps.</p>
${
  r.fluidez.length
    ? `<table>
  <thead><tr><th>Tela</th><th>Tamanho</th><th>Dados</th><th class="num">CLS</th>
    <th class="num">Pior resposta</th><th class="num">Rolagem</th><th class="num">Tarefas &gt; ${M.tarefaLonga}ms</th></tr></thead>
  <tbody>${r.fluidez
    .map((f) => {
      const pior = f.respostas.length ? Math.max(...f.respostas.map((x) => x.ms)) : null;
      const nomePior = pior !== null ? (f.respostas.find((x) => x.ms === pior) || {}).acao : '';
      return `<tr${fluidezRuim(f) ? ' style="background:rgba(192,57,43,.07)"' : ''}>
        <td>${esc(f.tela)}</td><td>${esc(f.viewport)}</td><td>${esc(f.dados)}</td>
        <td class="num ${f.cls > M.cls ? 'ruim' : ''}">${f.cls}</td>
        <td class="num ${pior > M.resposta ? 'ruim' : ''}">${pior === null ? '—' : `${pior}ms <span class="onde">${esc(nomePior)}</span>`}</td>
        <td class="num ${f.rolagem && f.rolagem.fps < M.fps ? 'ruim' : ''}">${f.rolagem ? f.rolagem.fps + ' fps' : '—'}</td>
        <td class="num ${f.tarefasLongas.length ? 'ruim' : ''}">${f.tarefasLongas.length || '—'}</td>
      </tr>`;
    })
    .join('')}</tbody></table>`
    : '<p class="sub">Medição de fluidez não rodou nesta passada.</p>'
}

${
  r.resize.length
    ? `<h2>Quebras ao arrastar a janela</h2>
<p class="sub">De 1440px até 360px, de 90 em 90. Larguras onde algo estourou fora dos tamanhos “oficiais”.</p>
<table><thead><tr><th>Tela</th><th class="num">Largura</th><th>Checagem</th><th>Seletor</th></tr></thead>
<tbody>${r.resize
        .flatMap((q) =>
          q.falhas.map(
            (f) =>
              `<tr><td>${esc(q.tela)}</td><td class="num">${q.largura}px</td><td>${esc(f.checagem)}</td><td><code>${esc(f.seletor)}</code></td></tr>`,
          ),
        )
        .join('')}</tbody></table>`
    : ''
}

${antesDepoisHTML()}

<h2>Grade de telas</h2>
<p class="sub">Linhas: telas. Colunas: tamanhos. Moldura vermelha = combinação com falha. Clique para ampliar.</p>
${['light', 'dark']
  .map(
    (tema) => `
<h3 style="margin:24px 0 8px">Tema ${tema === 'light' ? 'claro' : 'escuro'}</h3>
<div class="grade">
<table>
  <thead><tr><th>Tela</th>${viewports.map((v) => `<th>${esc(v.nome)}<br><span class="onde">${v.w}×${v.h}</span></th>`).join('')}</tr></thead>
  <tbody>${telas
    .map(
      (t) =>
        `<tr><td><b>${esc(t)}</b></td>${viewports
          .map((v) => {
            const c = achar(t, v.nome, tema);
            if (!c || !c.imagem) return '<td></td>';
            const falhou = c.falhas.some((f) => f.gravidade === 'falha');
            return `<td><figure>
            <img loading="lazy" class="${falhou ? 'temFalha' : ''}" src="relatorio-responsivo/${esc(c.imagem)}"
                 alt="${esc(t)} em ${esc(v.nome)}" data-legenda="${esc(`${t} · ${v.nome} (${v.w}×${v.h}) · ${tema} · ${c.falhas.length} falha(s)`)}">
            <figcaption>${falhou ? `<span class="ruim">${c.falhas.filter((f) => f.gravidade === 'falha').length} falha(s)</span>` : 'ok'}</figcaption>
          </figure></td>`;
          })
          .join('')}</tr>`,
    )
    .join('')}</tbody>
</table>
</div>`,
  )
  .join('')}

<h2>Estados de tela</h2>
<div class="grade">
<table>
  <thead><tr><th>Tela</th><th>Estado</th>${['celular', 'tablet', 'desktop', 'ultrawide'].map((n) => `<th>${n}</th>`).join('')}</tr></thead>
  <tbody>${[
    ...new Set(
      r.combinacoes
        .filter((c) => !['normal', 'movimento-reduzido'].includes(c.estado))
        .map((c) => `${c.tela}|${c.estado}`),
    ),
  ]
    .sort()
    .map((chave) => {
      const [t, est] = chave.split('|');
      return `<tr><td><b>${esc(t)}</b></td><td>${esc(est)}</td>${[
        'celular',
        'tablet',
        'desktop',
        'ultrawide',
      ]
        .map((vn) => {
          const c = achar(t, vn, 'light', est);
          if (!c || !c.imagem) return '<td></td>';
          const falhou = c.falhas.some((f) => f.gravidade === 'falha');
          return `<td><figure><img loading="lazy" class="${falhou ? 'temFalha' : ''}"
            src="relatorio-responsivo/${esc(c.imagem)}" alt="${esc(t)} ${esc(est)} ${esc(vn)}"
            data-legenda="${esc(`${t} · ${est} · ${vn}`)}">
            <figcaption>${falhou ? `<span class="ruim">${c.falhas.filter((f) => f.gravidade === 'falha').length}</span>` : 'ok'}</figcaption></figure></td>`;
        })
        .join('')}</tr>`;
    })
    .join('')}</tbody>
</table>
</div>

</div>

<dialog id="lupa"><img alt=""><div class="legenda"></div></dialog>
<script>
  const lupa = document.getElementById('lupa');
  document.addEventListener('click', (ev) => {
    const img = ev.target.closest('figure img');
    if (img) {
      lupa.querySelector('img').src = img.src;
      lupa.querySelector('.legenda').textContent = img.dataset.legenda || '';
      lupa.showModal();
      return;
    }
    if (ev.target === lupa) lupa.close();
  });
</script>
</body>
</html>`;

fs.writeFileSync(HTML_SAIDA, html);
console.log(`relatório em ${path.relative(RAIZ, HTML_SAIDA)}`);
console.log(`  ${combOk}/${res.combinacoes} combinações sem falha · ${causas.length} causas raiz`);
