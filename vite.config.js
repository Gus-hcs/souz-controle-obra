import { defineConfig } from 'vite';
import { createHash } from 'node:crypto';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * O sistema é publicado como um arquivo único (index.html com tudo dentro).
 * Isso mantém a publicação trivial — em GitHub Pages, em um servidor próprio ou
 * até aberto direto do disco — sem perder o código-fonte modular deste projeto.
 */

/* CSP por <meta>, só no build (o Pages não define header HTTP; em dev o CSP
   quebraria o websocket de recarga do Vite). frame-ancestors não vale por
   <meta> — o anti-frame fica no index.html.

   script-src sem 'unsafe-inline': o build embute o JS no HTML, então cada
   <script> embutido entra pelo hash (sha256), calculado depois do
   viteSingleFile; atributo de evento (onclick=, onsubmit=…) não roda — use
   o ouvinte por delegação do app.js. Bibliotecas de CDN: só dos hosts
   abaixo, e cada uma com SRI (src/io/index.js, LIBS).

   img-src e frame-src liberam o Storage do Supabase (link assinado da NF,
   do comprovante e da foto do diário) e blob: (PDF na tela e na impressão).
   Antes a imagem e o PDF do Storage eram bloqueados (auditoria, lote 3).
   Rodando o dist dentro de um artefato Claude, afrouxe o connect-src. */
const CDNS_SCRIPT = [
  'https://cdn.jsdelivr.net',
  'https://unpkg.com',
  'https://cdnjs.cloudflare.com',
  'https://cdn.sheetjs.com',
];
const csp = (hashes) =>
  [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
    "img-src 'self' data: blob: https://*.supabase.co",
    "frame-src 'self' blob: https://*.supabase.co",
    "worker-src 'self'",
    "font-src 'self' https://fonts.gstatic.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    `script-src 'self' ${hashes.map((h) => `'${h}'`).join(' ')} ${CDNS_SCRIPT.join(' ')}`,
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
    'upgrade-insecure-requests',
  ].join('; ');

const MARCA_CSP = '<meta http-equiv="Content-Security-Policy" content="__CSP__">';

/* Hash de cada <script> embutido (sem src e que não seja dado JSON), do
   jeito que o navegador calcula: sha256 do texto entre as tags. */
function hashesDosScripts(html) {
  const hashes = [];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const atributos = m[1];
    if (/\bsrc\s*=/i.test(atributos) || /type\s*=\s*["']?application\/json/i.test(atributos)) continue;
    /* o navegador converte CRLF em LF ao ler o HTML, antes do hash */
    const texto = m[2].replace(/\r\n?/g, '\n');
    hashes.push('sha256-' + createHash('sha256').update(texto, 'utf8').digest('base64'));
  }
  return [...new Set(hashes)];
}

const cabecalhosSeguranca = () => ({
  name: 'souz-cabecalhos-seguranca',
  apply: 'build',
  enforce: 'post',
  transformIndexHtml: {
    order: 'pre',
    handler: (html) => html.replace('<head>', `<head>
${MARCA_CSP}`),
  },
  /* depois do viteSingleFile, que embute o JS no HTML */
  generateBundle(_opcoes, bundle) {
    for (const arquivo of Object.values(bundle)) {
      if (arquivo.type !== 'asset' || !arquivo.fileName.endsWith('.html')) continue;
      const html = String(arquivo.source);
      if (!html.includes(MARCA_CSP)) continue;
      arquivo.source = html.replace(MARCA_CSP, MARCA_CSP.replace('__CSP__', csp(hashesDosScripts(html))));
    }
  },
});

/* versão que vai junto de cada erro do app (0026): na CI, o commit */
if (!process.env.VITE_VERSAO && process.env.GITHUB_SHA) {
  process.env.VITE_VERSAO = process.env.GITHUB_SHA.slice(0, 7);
}

export default defineConfig({
  base: './',
  plugins: [viteSingleFile(), cabecalhosSeguranca()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    reportCompressedSize: false,
    chunkSizeWarningLimit: 2000,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    coverage: { reporter: ['text', 'html'], include: ['src/**/*.js'] },
  },
});
