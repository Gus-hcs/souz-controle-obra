/**
 * Teste de fumaça: sobe o sistema construído, injeta uma obra de demonstração e
 * percorre todas as telas conferindo que nenhuma quebra nem renderiza vazia.
 *
 *   npm run test:e2e         (usa dist-local, o build de modo teste)
 *   node tests/fumaca.e2e.mjs <pasta-do-build>
 */
import pw from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { estadoDemo } from './fixture.js';

const { chromium } = pw;
const pasta = path.resolve(process.argv[2] || 'dist-local');

const servidor = http.createServer((req, res) => {
  const alvo = path.join(pasta, req.url === '/' ? 'index.html' : decodeURIComponent(req.url));
  if (!fs.existsSync(alvo) || fs.statSync(alvo).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': alvo.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/plain' });
  fs.createReadStream(alvo).pipe(res);
});
await new Promise((ok) => servidor.listen(4173, ok));

const navegador = await chromium.launch({
  executablePath: process.env.CHROMIUM_BIN || undefined,
  args: ['--no-sandbox'],
});
const pagina = await navegador.newPage();
const erros = [];
/* Ruído esperado quando o build roda fora do ar: as fontes do Google e a
   sondagem do arquivo de estado, que só existe na versão artefato. */
const ignorar = /ERR_TUNNEL|ERR_FAILED|fonts\.googleapis|fonts\.gstatic|net::ERR|404 \(Not Found\)/;
pagina.on('pageerror', (e) => erros.push('exceção: ' + e.message));
pagina.on('console', (m) => {
  if (m.type() === 'error' && !ignorar.test(m.text())) erros.push('console: ' + m.text());
});

const estado = JSON.stringify(estadoDemo());
await pagina.addInitScript((json) => {
  localStorage.setItem('souz_controle_obra_v1', json);
}, estado);

await pagina.goto('http://127.0.0.1:4173/', { waitUntil: 'load' });
await pagina.waitForTimeout(1000);

const telas = await pagina.evaluate(() =>
  Array.from(document.querySelectorAll('#rail [data-view]')).map((b) => b.dataset.view));
console.log(`telas encontradas: ${telas.length} → ${telas.join(', ')}\n`);
if (telas.length < 10) erros.push(`menu incompleto: ${telas.length} telas`);

for (const v of telas) {
  await pagina.click(`#rail [data-view="${v}"]`);
  await pagina.waitForTimeout(260);
  const info = await pagina.evaluate(() => {
    const c = document.getElementById('conteudo');
    return { chars: c.innerText.trim().length, svg: c.querySelectorAll('svg').length,
             linhas: c.querySelectorAll('tbody tr').length };
  });
  const marca = info.chars > 40 ? 'ok ' : 'VAZIO';
  console.log(`  ${marca} ${v.padEnd(16)} ${String(info.chars).padStart(5)} car.  ${info.linhas} linhas  ${info.svg} svg`);
  if (info.chars <= 40) erros.push(`tela ${v} praticamente vazia`);
}

/* abre um formulário e confere que o cálculo ao vivo responde */
await pagina.click('#rail [data-view="medicoes"]');
await pagina.waitForTimeout(250);
const temNovo = await pagina.$('[data-acao="nova-medicao"]');
if (temNovo) {
  await temNovo.click();
  await pagina.waitForTimeout(350);
  const aberto = await pagina.evaluate(() =>
    document.getElementById('modal-camada').classList.contains('aberto'));
  console.log(`\n  formulário de medição abre: ${aberto ? 'sim' : 'NÃO'}`);
  if (!aberto) erros.push('formulário de medição não abriu');

  /* validação: valor negativo tem que barrar a gravação */
  if (aberto) {
    await pagina.fill('[data-campo="valorMedido"]', '-500');
    await pagina.click('[data-acao="salvar-form"]');
    await pagina.waitForTimeout(200);
    const barrou = await pagina.evaluate(() => {
      const m = document.getElementById('modal-camada');
      return m.classList.contains('aberto') && !!m.querySelector('.form-avisos .linha.erro');
    });
    console.log(`  gravação barrada por valor inválido: ${barrou ? 'sim' : 'NÃO'}`);
    if (!barrou) erros.push('validação não barrou valor medido negativo');
  }
  await pagina.keyboard.press('Escape');
}

await navegador.close();
servidor.close();

if (erros.length) {
  console.log('\nFALHAS:');
  erros.forEach((e) => console.log('  - ' + e));
  process.exit(1);
}
console.log('\nSem exceções, todas as telas renderizaram e o formulário abre.');
