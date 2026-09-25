/**
 * Contraste dos tokens de interface (WCAG 2.1).
 *
 * Os valores saem de src/ui/tokens.css, não de uma cópia — se alguém clarear um
 * cinza para "ficar mais bonito" e cair abaixo de AA, o teste avisa.
 *
 * Limiares: 4,5:1 para texto pequeno (AA), 3:1 para borda, ícone e marca de
 * gráfico (objeto gráfico).
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const css = fs.readFileSync(path.resolve('src/ui/tokens.css'), 'utf8');

function bloco(abre) {
  const i = css.indexOf(abre);
  const ini = css.indexOf('{', i + abre.length - 1);
  let nivel = 0;
  let fim = ini;
  for (let j = ini; j < css.length; j++) {
    if (css[j] === '{') nivel++;
    else if (css[j] === '}' && --nivel === 0) {
      fim = j;
      break;
    }
  }
  const fora = new Map();
  for (const m of css.slice(ini + 1, fim).matchAll(/(--[\w-]+)\s*:\s*(#[0-9A-Fa-f]{6})\s*;/g)) {
    fora.set(m[1], m[2]);
  }
  return fora;
}

const CLARO = bloco(':root {');
const ESCURO = bloco(":root[data-theme='dark']");

function canal(c) {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function luminancia(hex) {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => canal(parseInt(h.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function razao(a, b) {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/* [frente, fundo, limiar] — o que a interface de fato encosta uma na outra. */
const PARES = [
  ['--tinta', '--fundo-conteudo', 4.5],
  ['--tinta2', '--fundo-conteudo', 4.5],
  ['--tinta3', '--fundo-conteudo', 4.5],
  ['--tinta', '--fundo-lateral-solido', 4.5],
  ['--tinta2', '--fundo-lateral-solido', 4.5],
  ['--tinta', '--fundo-campo', 4.5],
  ['--tinta', '--fundo-elevado', 4.5],
  ['--acento-texto', '--fundo-conteudo', 4.5],
  ['--acento-texto', '--fundo-lateral-solido', 4.5],
  ['--sobre-acento', '--acento', 4.5],
  ['--atraso', '--fundo-conteudo', 4.5],
  ['--atraso', '--atraso-fundo', 4.5],
  ['--alerta', '--fundo-conteudo', 4.5],
  ['--alerta', '--alerta-fundo', 4.5],
  ['--serie1', '--fundo-conteudo', 3],
  ['--serie2', '--fundo-conteudo', 3],
  ['--serie3', '--fundo-conteudo', 3],
  ['--serie4', '--fundo-conteudo', 3],
  ['--serie5', '--fundo-conteudo', 3],
  ['--serie6', '--fundo-conteudo', 3],
  /* barras pretas (lateral e topo), iguais nos dois temas */
  ['--barra-tinta', '--barra-fundo', 4.5],
  ['--barra-tinta2', '--barra-fundo', 4.5],
  ['--barra-tinta3', '--barra-fundo', 4.5],
  ['--barra-acento-texto', '--barra-fundo', 4.5],
  ['--barra-tinta', '--barra-ctrl', 4.5],
  ['--barra-tinta2', '--barra-ctrl', 4.5],
];

for (const [tema, tabela] of [
  ['claro', CLARO],
  ['escuro', ESCURO],
]) {
  describe(`contraste — tema ${tema}`, () => {
    for (const [frente, fundo, limiar] of PARES) {
      it(`${frente} sobre ${fundo} ≥ ${limiar}:1`, () => {
        const a = tabela.get(frente) ?? CLARO.get(frente);
        const b = tabela.get(fundo) ?? CLARO.get(fundo);
        expect(a, `${frente} não encontrado`).toBeTruthy();
        expect(b, `${fundo} não encontrado`).toBeTruthy();
        expect(Number(razao(a, b).toFixed(2))).toBeGreaterThanOrEqual(limiar);
      });
    }
  });
}
