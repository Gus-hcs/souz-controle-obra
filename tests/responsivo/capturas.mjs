/**
 * capturas.mjs — as imagens "antes × depois" do relatório responsivo.
 *
 * Abre um build de teste com a obra de exemplo e fotografa cada tela do
 * menu, inteira (o conteúdo que rola por dentro é solto para a página
 * crescer), nos temas claro e escuro, em 1920, 1440, 1024 e 390px.
 * Grava `<tela>__<largura>__<tema>.jpg`, o nome que relatorio.mjs procura.
 *
 *   npx vite build --mode teste --outDir dist-local --emptyOutDir
 *   node tests/responsivo/capturas.mjs dist-local docs/relatorio-responsivo/depois
 *
 * Para o "antes", rode o mesmo contra o build de outra versão (uma cópia à
 * parte com `git worktree`) gravando em docs/relatorio-responsivo/antes.
 * Argumentos: <pasta do build> <pasta de saída> [porta, padrão 4312].
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [PASTA, SAIDA, PORTA = '4312'] = process.argv.slice(2);
if (!PASTA || !SAIDA || !fs.existsSync(path.join(PASTA, 'index.html'))) {
  console.error(
    'uso: node tests/responsivo/capturas.mjs <pasta do build> <pasta de saída> [porta]',
  );
  process.exit(1);
}
fs.mkdirSync(SAIDA, { recursive: true });

const pw = (
  await import(pathToFileURL(path.join(process.cwd(), 'node_modules/playwright/index.js')).href)
).default;

const servidor = http.createServer((req, res) => {
  const arq = path.join(PASTA, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
  if (!fs.existsSync(arq) || fs.statSync(arq).isDirectory()) {
    res.writeHead(404);
    return res.end();
  }
  res.writeHead(200, {
    'content-type': arq.endsWith('.html') ? 'text/html' : 'application/octet-stream',
  });
  fs.createReadStream(arq).pipe(res);
});
await new Promise((ok) => servidor.listen(Number(PORTA), ok));

/* solta a rolagem interna: a página cresce e o fullPage pega a tela toda */
const SOLTAR = `
  html, body, #app, #principal, #conteudo, .tela-principal, #conteudo.paineis { height: auto !important; max-height: none !important; overflow: visible !important; }
  #toasts { display: none !important; }
  @media (min-width: 861px) {
    #rail { position: relative !important; height: auto !important; align-self: stretch; }
  }`;

const navegador = await pw.chromium.launch();
const erros = [];
let n = 0;
for (const largura of [1920, 1440, 1024, 390]) {
  for (const tema of ['light', 'dark']) {
    const ctx = await navegador.newContext({
      viewport: { width: largura, height: largura < 800 ? 844 : 1000 },
      colorScheme: tema,
    });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => erros.push(`${largura} ${tema}: ${e.message}`));
    await p.goto(`http://127.0.0.1:${PORTA}/`);
    await p.waitForTimeout(500);
    await p.click('[data-acao="exemplo"]');
    await p.click('[data-acao="confirmar-ok"]');
    await p.waitForTimeout(1500);
    const telas = await p.evaluate(() =>
      [...document.querySelectorAll('#rail [data-view]')].map((b) => b.dataset.view),
    );
    for (const tela of telas) {
      await p.evaluate((v) => {
        document.querySelector(`#rail [data-view="${v}"]`)?.click();
        document.body.classList.remove('menu-aberto');
      }, tela);
      await p.waitForTimeout(700);
      const estilo = await p.addStyleTag({ content: SOLTAR });
      await p.waitForTimeout(300);
      await p.screenshot({
        path: path.join(SAIDA, `${tela}__${largura}__${tema}.jpg`),
        type: 'jpeg',
        quality: 70,
        fullPage: true,
      });
      await estilo.evaluate((el) => el.remove());
      n++;
    }
    await ctx.close();
  }
}
await navegador.close();
servidor.close();
console.log(`${n} capturas em ${SAIDA}`);
if (erros.length) {
  console.error(erros.join('\n'));
  process.exit(1);
}
