/**
 * config.js — A matriz do que é testado: tamanhos de tela, temas e estados.
 *
 * Um lugar só para isso, porque a matriz é o que se ajusta quando aparece um
 * aparelho novo ou um estado de tela que ninguém tinha olhado.
 */

/* Os tamanhos saem de aparelho real, não de número redondo. A coluna "porquê"
   é o que impede a lista de crescer sem critério. */
const VIEWPORTS = [
  { nome: 'celular-pequeno', w: 360, h: 740, porque: 'Android básico de mestre de obra' },
  { nome: 'celular', w: 390, h: 844, porque: 'iPhone comum' },
  { nome: 'celular-deitado', w: 844, h: 390, porque: 'foto do diário na horizontal' },
  { nome: 'tablet', w: 768, h: 1024, porque: 'tablet na obra' },
  { nome: 'tablet-deitado', w: 1024, h: 768, porque: 'tablet na obra, deitado' },
  { nome: 'notebook', w: 1280, h: 720, porque: 'notebook de escritório' },
  { nome: 'desktop', w: 1440, h: 900, porque: 'referência principal' },
  { nome: 'full-hd', w: 1920, h: 1080, porque: 'monitor comum de escritório' },
  { nome: 'ultrawide', w: 2560, h: 1080, porque: 'conteúdo não pode esticar sem limite' },
];

const TEMAS = ['light', 'dark'];

/* As faixas de comportamento. O teste não adivinha o que deveria acontecer:
   ele compara com o que está declarado aqui. */
const FAIXAS = {
  celular: { ate: 767, lateral: 'gaveta', inspetor: 'sheet', alvoMin: 44, fonteInput: 16 },
  medio: { ate: 1199, lateral: 'icones', inspetor: 'sobreposto', alvoMin: 32, fonteInput: 13 },
  amplo: { ate: Infinity, lateral: 'completa', inspetor: 'lado-a-lado', alvoMin: 24, fonteInput: 13 },
};

function faixaDe(largura) {
  if (largura <= FAIXAS.celular.ate) return { chave: 'celular', ...FAIXAS.celular };
  if (largura <= FAIXAS.medio.ate) return { chave: 'medio', ...FAIXAS.medio };
  return { chave: 'amplo', ...FAIXAS.amplo };
}

/* Estados de tela que escondem defeito quando não são olhados.
   `preparar` roda dentro da página, depois de a tela já ter renderizado. */
const ESTADOS = {
  normal: { rotulo: 'com dados', dados: 'normal' },
  vazio: { rotulo: 'sem nenhum dado', dados: 'vazio' },
  volumoso: { rotulo: 'lista com 200 linhas', dados: 'volumoso' },
  inspetor: {
    rotulo: 'inspetor aberto',
    dados: 'normal',
    somenteEm: ['carteira'],
    preparar: () => {
      const tr = document.querySelector('table.lista tbody tr[data-obra]');
      if (tr) tr.click();
    },
  },
  sheet: {
    rotulo: 'sheet aberto',
    dados: 'normal',
    somenteEm: ['medicoes', 'lancamentos', 'clientes', 'materiais'],
    preparar: () => {
      const b = document.querySelector(
        '[data-acao^="nova-"],[data-acao^="novo-"]',
      );
      if (b) b.click();
    },
  },
};

/* Rodadas extras além da matriz principal. */
const EXTRAS = {
  zoom200: { viewport: 'desktop', escala: 2, rotulo: 'zoom de 200%' },
};

export { VIEWPORTS, TEMAS, FAIXAS, ESTADOS, EXTRAS, faixaDe };
