import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * O sistema é publicado como um arquivo único (index.html com tudo dentro).
 * Isso mantém a publicação trivial — em GitHub Pages, em um servidor próprio ou
 * até aberto direto do disco — sem perder o código-fonte modular deste projeto.
 */

/* CSP por <meta>, só no build (o Pages não define header HTTP; em dev o CSP
   quebraria o websocket de recarga do Vite). O script-src mantém 'unsafe-inline'
   porque o build embute o JS no HTML — o CSP trava origem de script e destino
   de conexão, não injeção inline (essa é responsabilidade do esc()/fonteImagem()).
   Rodando o dist dentro de um artefato Claude, afrouxe o connect-src.
   frame-ancestors não vale por <meta> — o anti-frame fica no index.html. */
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self' https://fonts.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://cdnjs.cloudflare.com https://cdn.jsdelivr.net",
  'upgrade-insecure-requests',
].join('; ');

const cabecalhosSeguranca = () => ({
  name: 'souz-cabecalhos-seguranca',
  apply: 'build',
  transformIndexHtml: {
    order: 'pre',
    handler: (html) =>
      html.replace('<head>', `<head>\n<meta http-equiv="Content-Security-Policy" content="${CSP}">`),
  },
});

export default defineConfig({
  base: './',
  plugins: [cabecalhosSeguranca(), viteSingleFile()],
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
