// Importação da planilha MCMV no navegador, de ponta a ponta — o build
// real carrega o SheetJS do CDN (com SRI), recebe dois .xlsx de verdade pelo
// seletor de arquivo do botão "Importar planilha MCMV" (Ajustes): um com
// células numéricas e de data formatadas como numa planilha do Excel, outro
// com texto em português. Depois lê o estado salvo e confere, em Node, os
// números de cada obra importada contra a obra de referência.
//
// Não entra na CI (depende do CDN do SheetJS). Rode depois de mexer no
// importador (planilhaParaObra em src/io/index.js):
//   npm run test:e2e   (gera o dist-local)
//   node tests/importacao-mcmv.navegador.mjs dist-local
// Os dois .xlsx gerados e a captura ficam numa pasta temporária.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const RAIZ = process.cwd();
const imp = (p) => import(pathToFileURL(path.join(RAIZ, p)).href);
const pw = (await imp('node_modules/playwright/index.js')).default;
const { obraDaPlanilha } = await imp('tests/planilha.fixture.js');
const { gradesMCMV } = await imp('tests/mcmv.grades.js');
const C = await imp('src/dominio/calculos.js');
const { migrar } = await imp('src/nucleo/base.js');
const PASTA = path.resolve(process.argv[2] || 'dist-local');
const SAIDA = fs.mkdtempSync(path.join(os.tmpdir(), 'souz-mcmv-'));
const srv = http.createServer((req, res) => {
  const alvo = path.join(
    PASTA,
    req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]),
  );
  if (!fs.existsSync(alvo) || fs.statSync(alvo).isDirectory()) {
    res.writeHead(404);
    return res.end();
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  fs.createReadStream(alvo).pipe(res);
});
await new Promise((ok) => srv.listen(4202, ok));
let falhas = 0;
const confere = (nome, ok, det = '') => {
  if (!ok) falhas++;
  console.log(`${ok ? 'ok  ' : 'FALHOU'} ${nome}${det ? ' — ' + det : ''}`);
};

const ref = obraDaPlanilha();
const gradeNum = gradesMCMV(ref, { cliente: 'Maria Aparecida', formato: 'iso' });
const gradeBr = gradesMCMV(ref, { cliente: 'Maria Aparecida', formato: 'br' });

const nav = await pw.chromium.launch();
const p = await nav.newPage({ viewport: { width: 1440, height: 900 } });
const erros = [];
p.on('pageerror', (e) => erros.push(e.message));
/* o 404 de dados/estado.json é o Store procurando estado no servidor no
   modo local — antigo e esperado; qualquer outra resposta de erro conta */
p.on('console', (m) => {
  if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) erros.push(m.text());
});
p.on('response', (r) => {
  if (r.status() >= 400 && !r.url().endsWith('/dados/estado.json'))
    erros.push(`${r.status()} ${r.url()}`);
});
await p.addInitScript(() => {
  if (!sessionStorage.getItem('p5')) {
    localStorage.clear();
    sessionStorage.setItem('p5', '1');
  }
  sessionStorage.setItem('souz_rota', JSON.stringify({ view: 'ajustes', obraId: '' }));
});
await p.goto('http://127.0.0.1:4202/');
await p.waitForTimeout(900);
const antes = await p.evaluate(
  () =>
    (JSON.parse(localStorage.getItem('souz_controle_obra_v1') || '{"obras":[]}').obras || [])
      .length,
);

await p.click('[data-acao="ajustes-secao"][data-kpi="importar"]');
await p.waitForTimeout(300);
const escolha = p.waitForEvent('filechooser', { timeout: 30000 });
await p.click('[data-acao="importar-xlsx"]');
const seletor = await escolha;
const sri = await p.evaluate(() => {
  const s = [...document.scripts].find((x) => /xlsx/i.test(x.src));
  return s ? { src: s.src, integridade: !!s.integrity } : null;
});
confere(
  'SheetJS carregado do CDN com integridade (SRI)',
  !!(sri && sri.integridade),
  sri ? sri.src : 'script não achado',
);

/* os dois arquivos, montados pelo SheetJS de verdade na página */
const arquivos = await p.evaluate(
  ([gNum, gBr]) => {
    const ISO = /^\d{4}-\d{2}-\d{2}$/;
    const livro = (grades, formatado) => {
      const wb = XLSX.utils.book_new();
      for (const [nome, grade] of Object.entries(grades)) {
        const aoa = formatado
          ? grade.map((l) =>
              l.map((c) => (typeof c === 'string' && ISO.test(c) ? new Date(c + 'T12:00:00Z') : c)),
            )
          : grade;
        const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
        if (formatado) {
          for (const k of Object.keys(ws)) {
            const c = ws[k];
            if (k[0] === '!' || !c) continue;
            if (c.t === 'd') c.z = 'dd/mm/yyyy';
            else if (c.t === 'n' && !Number.isInteger(c.v) && Math.abs(c.v) < 1) c.z = '0%';
            else if (c.t === 'n') c.z = '#,##0.00';
          }
        }
        XLSX.utils.book_append_sheet(wb, ws, nome);
      }
      return Array.from(
        new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx', cellDates: true })),
      );
    };
    return { num: livro(gNum, true), br: livro(gBr, false) };
  },
  [gradeNum, gradeBr],
);
fs.writeFileSync(path.join(SAIDA, 'obra-mcmv-formatada.xlsx'), Buffer.from(arquivos.num));
fs.writeFileSync(path.join(SAIDA, 'obra-mcmv-texto.xlsx'), Buffer.from(arquivos.br));
const mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
await seletor.setFiles([
  { name: 'obra-mcmv-formatada.xlsx', mimeType: mime, buffer: Buffer.from(arquivos.num) },
  { name: 'obra-mcmv-texto.xlsx', mimeType: mime, buffer: Buffer.from(arquivos.br) },
]);
await p.waitForTimeout(1500);
const toasts = await p.$$eval('#toasts .toast', (l) => l.map((t) => t.innerText.trim()));
confere(
  'aviso de importação na tela',
  toasts.some((t) => /2 obra\(s\) importada/.test(t)),
  toasts.join(' | '),
);
confere('nenhum aviso de dado fora do padrão', !toasts.some((t) => /fora do padrão/.test(t)));
const texto = await p.evaluate(() => document.getElementById('conteudo').innerText);
confere('abre a Carteira com a obra', /Casa 12/.test(texto));
await p.screenshot({ path: path.join(SAIDA, 'carteira-depois-importar-1440.png') });

const estado = migrar(
  await p.evaluate(() => JSON.parse(localStorage.getItem('souz_controle_obra_v1'))),
);
const novas = estado.obras.slice(antes);
confere('duas obras importadas e salvas no aparelho', novas.length === 2, `${novas.length}`);
const kRef = C.kpisObra(ref);
const campos = [
  'recebido',
  'contratado',
  'totalPago',
  'saldoCaixa',
  'saldoContratual',
  'progressoFisico',
  'materiaisSaldo',
  'custoPrevisto',
];
novas.forEach((o, i) => {
  const rotulo = i === 0 ? 'células formatadas' : 'texto em português';
  const k = C.kpisObra(o);
  const dif = campos.filter((c) => Math.abs((k[c] || 0) - (kRef[c] || 0)) > 0.02);
  confere(
    `${rotulo}: painel igual ao da obra de referência`,
    !dif.length,
    dif.map((c) => `${c} ${k[c]} ≠ ${kRef[c]}`).join('; '),
  );
  const cont = [o.contratos, o.medicoes, o.recebimentos, o.lancamentos, o.materiais, o.cronograma]
    .map((l) => l.length)
    .join('/');
  confere(
    `${rotulo}: contratos/medições/recebimentos/lançamentos/materiais/etapas`,
    cont === '4/5/4/6/3/7',
    cont,
  );
  const datas = o.cronograma.map((e) => e.inicioPrevisto).join(',');
  const datasRef = ref.cronograma.map((e) => e.inicioPrevisto).join(',');
  confere(
    `${rotulo}: datas do cronograma sem virar um dia (fuso)`,
    datas === datasRef,
    datas === datasRef ? '' : datas,
  );
  /* a importada tem cliente ligado e a de referência não: o alerta de
     "cliente sem notícia" é só dela, e está certo */
  const titulos = (x) =>
    C.alertasObra(x)
      .map((al) => al.titulo)
      .filter((t) => !/^Cliente sem notícia/.test(t))
      .sort()
      .join(' || ');
  confere(
    `${rotulo}: mesmas pendências e alertas da obra de referência`,
    titulos(o) === titulos(ref),
    C.alertasObra(o)
      .map((al) => al.titulo)
      .filter((x) => !titulos(ref).includes(x))
      .slice(0, 2)
      .join(' | '),
  );
  const cli = estado.clientes.find((c) => c.id === o.clienteId);
  confere(`${rotulo}: cliente ligado`, !!cli && cli.nome === 'Maria Aparecida');
});
confere(
  'um cliente só para as duas obras',
  estado.clientes.filter((c) => c.nome === 'Maria Aparecida').length === 1,
);
confere('sem erro de página', !erros.length, erros.slice(0, 3).join(' | '));
await nav.close();
srv.close();
console.log(`\narquivos e captura em ${SAIDA}`);
console.log(falhas ? `${falhas} FALHA(S)` : 'tudo ok');
process.exit(falhas ? 1 : 0);
