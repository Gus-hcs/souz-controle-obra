/**
 * executar.mjs — Percorre a matriz inteira e grava o resultado.
 *
 *   node tests/responsivo/executar.mjs [--rapido] [--sem-fluidez] [--tela=nome]
 *
 * --rapido       só os viewports de referência (celular, tablet, desktop, ultrawide)
 * --sem-fluidez  pula a parte com CPU estrangulada (que é a demorada)
 * --tela=nome    limita a uma tela, para trabalhar num defeito específico
 *
 * Sai com código 1 se houver qualquer falha de layout ou meta de fluidez
 * não batida — é isso que permite pendurar a suíte no CI.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { VIEWPORTS, TEMAS, ESTADOS, faixaDe } from './config.js';
import { checarLayout, checarFolhasDeEstilo } from './checagens.js';
import { ESTADOS_DADOS } from './fixtures.js';
import {
  METAS,
  OBSERVADORES,
  lerCls,
  zerarTarefas,
  lerTarefas,
  medirResposta,
  medirRolagem,
  checarMovimentoReduzido,
} from './fluidez.js';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '../..');
const SAIDA = path.join(RAIZ, 'docs', 'relatorio-responsivo');
const PORTA = 4310;

const args = process.argv.slice(2);
const RAPIDO = args.includes('--rapido');
const SEM_FLUIDEZ = args.includes('--sem-fluidez');
const SO_TELA = (args.find((a) => a.startsWith('--tela=')) || '').split('=')[1] || '';

const VIEWPORTS_USADOS = RAPIDO
  ? VIEWPORTS.filter((v) => ['celular', 'tablet', 'desktop', 'ultrawide'].includes(v.nome))
  : VIEWPORTS;
/* Os estados extras e a fluidez rodam num recorte: cobrir 9 viewports com
   cada estado multiplicaria o tempo sem achar nada novo — o que quebra num
   celular quebra nos dois tamanhos de celular. */
const VIEWPORTS_ESTADO = VIEWPORTS.filter((v) =>
  ['celular', 'tablet', 'desktop', 'ultrawide'].includes(v.nome),
);
const VIEWPORTS_FLUIDEZ = VIEWPORTS.filter((v) => ['celular', 'desktop'].includes(v.nome));

const pw = (await import(pathToFileURL(path.join(RAIZ, 'node_modules/playwright/index.js')).href))
  .default;

/* ------------------------------------------------------------ servidor */
const PASTA_BUILD = path.join(RAIZ, 'dist-local');
if (!fs.existsSync(path.join(PASTA_BUILD, 'index.html'))) {
  console.error('Build de teste não encontrado. Rode antes:');
  console.error('  npx vite build --mode teste --outDir dist-local --emptyOutDir');
  process.exit(2);
}
const servidor = http.createServer((req, res) => {
  const alvo = path.join(PASTA_BUILD, req.url === '/' ? 'index.html' : decodeURIComponent(req.url));
  if (!fs.existsSync(alvo) || fs.statSync(alvo).isDirectory()) {
    res.writeHead(404);
    return res.end();
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  fs.createReadStream(alvo).pipe(res);
});
await new Promise((ok) => servidor.listen(PORTA, ok));

fs.mkdirSync(SAIDA, { recursive: true });
const navegador = await pw.chromium.launch({ args: ['--no-sandbox'] });

const resultado = {
  geradoEm: new Date().toISOString(),
  metas: METAS,
  combinacoes: [],
  fluidez: [],
  folhas: [],
  resize: [],
  erroConsole: [],
};

/* Ruído esperado rodando o build fora do ar. */
const RUIDO = /fonts\.googleapis|fonts\.gstatic|net::ERR|404 \(Not Found\)|Failed to load resource/;

/** Abre um contexto já com o estado de dados e o tema escolhidos. */
async function abrirContexto({ estado, tema, viewport, escala = 1, movimentoReduzido = false }) {
  const ctx = await navegador.newContext({
    viewport: { width: Math.round(viewport.w / escala), height: Math.round(viewport.h / escala) },
    deviceScaleFactor: 1,
    reducedMotion: movimentoReduzido ? 'reduce' : 'no-preference',
    hasTouch: viewport.w < 768,
  });
  await ctx.addInitScript(
    ([json, t]) => {
      /* Se o estado não couber no localStorage, o sistema abre vazio e a
         suíte testaria o nada. Registra o erro para o executor recusar. */
      try {
        localStorage.setItem('souz_controle_obra_v1', json);
      } catch (e) {
        window.__fixtureErro = e.message;
      }
      localStorage.setItem('souz_tema', t);
    },
    [JSON.stringify(estado), tema],
  );
  await ctx.addInitScript(OBSERVADORES);
  return ctx;
}

/** Recusa seguir se o estado de teste não entrou no navegador. */
async function conferirFixture(pagina) {
  const erro = await pagina.evaluate(() => window.__fixtureErro || '');
  if (erro) {
    console.error(`
O estado de teste não coube no localStorage: ${erro}`);
    console.error('A suíte estaria testando um sistema vazio. Diminua a fixture.');
    process.exit(2);
  }
}

/** Lista as telas que o menu oferece neste estado de dados. */
async function telasDisponiveis(pagina) {
  const t = await pagina.evaluate(() =>
    [...document.querySelectorAll('#rail [data-view]')].map((b) => b.dataset.view),
  );
  return SO_TELA ? t.filter((v) => v === SO_TELA) : t;
}

async function irPara(pagina, view) {
  await pagina.evaluate((v) => {
    const b = document.querySelector(`#rail [data-view="${v}"]`);
    if (b) b.click();
  }, view);
  await pagina.waitForTimeout(260);
}

function nomeArquivo(...partes) {
  return partes.filter(Boolean).join('__').replace(/[^\w.-]+/g, '-') + '.jpg';
}

/* ====================================================== passada principal */
async function passada({ rotuloEstado, dados, viewports, temas, estado = null, extras = {} }) {
  for (const tema of temas) {
    for (const vp of viewports) {
      const ctx = await abrirContexto({
        estado: dados,
        tema,
        viewport: vp,
        escala: extras.escala || 1,
        movimentoReduzido: !!extras.movimentoReduzido,
      });
      const pagina = await ctx.newPage();
      const errosConsole = [];
      pagina.on('pageerror', (e) => errosConsole.push('exceção: ' + e.message));
      pagina.on('console', (m) => {
        if (m.type() === 'error' && !RUIDO.test(m.text())) errosConsole.push('console: ' + m.text());
      });

      await pagina.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'load' });
      await conferirFixture(pagina);
      await pagina.waitForTimeout(700);
      if (extras.escala && extras.escala !== 1) {
        await pagina.evaluate((z) => {
          document.documentElement.style.zoom = z;
        }, extras.escala);
        await pagina.waitForTimeout(250);
      }

      const telas = await telasDisponiveis(pagina);
      for (const view of telas) {
        if (estado && estado.somenteEm && !estado.somenteEm.includes(view)) continue;
        await irPara(pagina, view);
        if (estado && estado.preparar) {
          await pagina.evaluate(estado.preparar);
          await pagina.waitForTimeout(320);
        }

        const faixa = faixaDe(vp.w);
        const falhas = await pagina.evaluate(checarLayout, {
          alvoMin: faixa.alvoMin,
          fonteInput: faixa.fonteInput,
          faixa: faixa.chave,
          viewport: vp.nome,
        });

        const arquivo = nomeArquivo(view, rotuloEstado, vp.nome, tema, extras.sufixo);
        await pagina.screenshot({
          path: path.join(SAIDA, arquivo),
          quality: 72,
          type: 'jpeg',
        });

        resultado.combinacoes.push({
          tela: view,
          estado: rotuloEstado,
          viewport: vp.nome,
          largura: vp.w,
          altura: vp.h,
          tema,
          faixa: faixa.chave,
          extra: extras.sufixo || '',
          imagem: arquivo,
          falhas,
          errosConsole: errosConsole.splice(0),
        });
        process.stdout.write(falhas.length ? '×' : '.');
      }
      await ctx.close();
    }
  }
}

console.log('\n1/6  Matriz principal — todas as telas, todos os tamanhos, dois temas');
await passada({
  rotuloEstado: 'normal',
  dados: ESTADOS_DADOS.normal(),
  viewports: VIEWPORTS_USADOS,
  temas: TEMAS,
});

console.log('\n\n2/6  Estados de tela — vazio, volumoso, inspetor e sheet');
for (const [chave, est] of Object.entries(ESTADOS)) {
  if (chave === 'normal') continue;
  const dados = ESTADOS_DADOS[est.dados]();
  await passada({
    rotuloEstado: chave,
    dados,
    viewports: VIEWPORTS_ESTADO,
    temas: ['light'],
    estado: est,
  });
}

console.log('\n\n3/6  Zoom de 200% (acessibilidade)');
await passada({
  rotuloEstado: 'normal',
  dados: ESTADOS_DADOS.normal(),
  viewports: VIEWPORTS.filter((v) => v.nome === 'desktop'),
  temas: ['light'],
  extras: { escala: 2, sufixo: 'zoom200' },
});

/* ============================================ 4. movimento reduzido */
console.log('\n\n4/6  Movimento reduzido');
{
  const ctx = await abrirContexto({
    estado: ESTADOS_DADOS.normal(),
    tema: 'light',
    viewport: { w: 1440, h: 900 },
    movimentoReduzido: true,
  });
  const pagina = await ctx.newPage();
  await pagina.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'load' });
      await conferirFixture(pagina);
  await pagina.waitForTimeout(700);
  for (const view of await telasDisponiveis(pagina)) {
    await irPara(pagina, view);
    const fora = await checarMovimentoReduzido(pagina);
    if (fora.length) {
      resultado.combinacoes.push({
        tela: view,
        estado: 'movimento-reduzido',
        viewport: 'desktop',
        largura: 1440,
        altura: 900,
        tema: 'light',
        faixa: 'amplo',
        extra: 'reduced-motion',
        imagem: '',
        falhas: fora.map((f) => ({
          checagem: 'movimento-reduzido',
          gravidade: 'falha',
          seletor: f.seletor,
          medido: `${f.segundos}s`,
          meta: `≤ ${METAS.movimentoReduzido}s`,
          detalhe: 'anima mesmo com prefers-reduced-motion: reduce',
        })),
        errosConsole: [],
      });
      process.stdout.write('×');
    } else process.stdout.write('.');
  }
  await ctx.close();
}

/* ====================================================== 5. fluidez */
if (!SEM_FLUIDEZ) {
  console.log('\n\n5/6  Fluidez com a CPU 4× mais lenta');
  for (const vp of VIEWPORTS_FLUIDEZ) {
    for (const nomeDados of ['normal', 'volumoso']) {
      const ctx = await abrirContexto({
        estado: ESTADOS_DADOS[nomeDados](),
        tema: 'light',
        viewport: vp,
      });
      const pagina = await ctx.newPage();
      const cdp = await ctx.newCDPSession(pagina);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

      await pagina.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'load' });
      await conferirFixture(pagina);
      await pagina.waitForTimeout(1600);

      for (const view of await telasDisponiveis(pagina)) {
        await irPara(pagina, view);
        await pagina.waitForTimeout(500);

        const { cls, deslocamentos } = await lerCls(pagina);
        await zerarTarefas(pagina);

        /* As interações que a pessoa faz o dia todo. */
        const alvos = [
          ['trocar de aba', '#rail [data-view="painel"]'],
          ['abrir/fechar menu', '[data-acao="menu"]'],
          ['ordenar tabela', 'table.lista thead th.ord, table.tab thead th'],
          ['abrir registro', 'table.lista tbody tr[data-obra]'],
          ['abrir sheet', '[data-acao^="nova-"],[data-acao^="novo-"]'],
        ];
        const respostas = [];
        for (const [rotulo, sel] of alvos) {
          const ms = await medirResposta(pagina, sel);
          if (ms !== null) respostas.push({ acao: rotulo, ms });
          await pagina.waitForTimeout(120);
          await pagina.keyboard.press('Escape');
          await irPara(pagina, view);
          await pagina.waitForTimeout(150);
        }

        const rolagem = await medirRolagem(pagina);
        const tarefas = await lerTarefas(pagina);

        resultado.fluidez.push({
          tela: view,
          viewport: vp.nome,
          dados: nomeDados,
          cls,
          deslocamentos,
          respostas,
          rolagem,
          tarefasLongas: tarefas.filter((t) => t.dur > METAS.tarefaLonga),
        });
        process.stdout.write('.');
      }
      await ctx.close();
    }
  }
} else {
  console.log('\n\n5/6  Fluidez — pulada (--sem-fluidez)');
}

/* ============================== 6. folhas de estilo e redimensionamento */
console.log('\n\n6/6  Folhas de estilo e redimensionamento ao vivo');
{
  const ctx = await abrirContexto({
    estado: ESTADOS_DADOS.volumoso(),
    tema: 'light',
    viewport: { w: 1440, h: 900 },
  });
  const pagina = await ctx.newPage();
  await pagina.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'load' });
      await conferirFixture(pagina);
  await pagina.waitForTimeout(700);
  resultado.folhas = await pagina.evaluate(checarFolhasDeEstilo);

  /* Arrastar a janela de 1440 até 360, parando em cada degrau, e conferir
     que nada quebra no caminho — não só nos tamanhos "oficiais". */
  for (const view of ['carteira', 'medicoes', 'cronograma']) {
    await irPara(pagina, view);
    for (let w = 1440; w >= 360; w -= 90) {
      await pagina.setViewportSize({ width: w, height: 900 });
      await pagina.waitForTimeout(90);
      const faixa = faixaDe(w);
      const falhas = await pagina.evaluate(checarLayout, {
        alvoMin: 24, // aqui interessa só o que quebra o layout
        fonteInput: 0,
        faixa: faixa.chave,
        viewport: `resize-${w}`,
      });
      const duras = falhas.filter(
        (f) => f.checagem === 'rolagem-horizontal' || f.checagem === 'elemento-fora-da-viewport',
      );
      if (duras.length) resultado.resize.push({ tela: view, largura: w, falhas: duras });
    }
    await pagina.setViewportSize({ width: 1440, height: 900 });
  }
  await ctx.close();
}

await navegador.close();
servidor.close();

/* ------------------------------------------------------------ resumo */
const totalFalhas = resultado.combinacoes.reduce((s, c) => s + c.falhas.filter((f) => f.gravidade === 'falha').length, 0);
const combFalhas = resultado.combinacoes.filter((c) => c.falhas.some((f) => f.gravidade === 'falha')).length;
const fluidezRuim = resultado.fluidez.filter(
  (f) =>
    f.cls > METAS.cls ||
    f.respostas.some((r) => r.ms > METAS.resposta) ||
    (f.rolagem && f.rolagem.fps < METAS.fps) ||
    f.tarefasLongas.length,
).length;

resultado.resumo = {
  combinacoes: resultado.combinacoes.length,
  combinacoesComFalha: combFalhas,
  falhas: totalFalhas,
  medicoesFluidez: resultado.fluidez.length,
  fluidezForaDaMeta: fluidezRuim,
  avisosDeFolha: resultado.folhas.length,
  quebrasNoResize: resultado.resize.length,
};

fs.writeFileSync(path.join(SAIDA, 'resultado.json'), JSON.stringify(resultado, null, 2));

console.log('\n\n──────────────────────────────────────────────');
console.log(`combinações percorridas .... ${resultado.resumo.combinacoes}`);
console.log(`  com alguma falha ......... ${combFalhas}`);
console.log(`falhas de layout ........... ${totalFalhas}`);
console.log(`medições de fluidez ........ ${resultado.resumo.medicoesFluidez}`);
console.log(`  fora da meta ............. ${fluidezRuim}`);
console.log(`avisos nas folhas de estilo  ${resultado.folhas.length}`);
console.log(`quebras ao redimensionar ... ${resultado.resize.length}`);
console.log('──────────────────────────────────────────────');
console.log(`resultado em ${path.relative(RAIZ, path.join(SAIDA, 'resultado.json'))}`);

process.exit(totalFalhas || fluidezRuim || resultado.resize.length ? 1 : 0);
