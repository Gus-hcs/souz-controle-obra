import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * O sistema é publicado como um arquivo único (index.html com tudo dentro).
 * Isso mantém a publicação trivial — em GitHub Pages, em um servidor próprio ou
 * até aberto direto do disco — sem perder o código-fonte modular deste projeto.
 */
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
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
