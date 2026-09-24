/**
 * Os dois blocos de tema escuro em src/ui/tokens.css são gêmeos: um responde à
 * preferência do sistema, o outro ao escuro travado na mão. CSS puro não deixa
 * reusar um conjunto de variáveis em dois seletores, e o projeto não tem
 * pré-processador — então a única garantia de que continuam iguais é este teste.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const css = fs.readFileSync(path.resolve('src/ui/tokens.css'), 'utf8');

/** Lê as declarações `--x: valor;` do bloco que começa em `abre`. */
function variaveis(css, abre) {
  const i = css.indexOf(abre);
  if (i < 0) throw new Error(`bloco não encontrado: ${abre}`);
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
  const corpo = css.slice(ini + 1, fim);
  const fora = new Map();
  for (const m of corpo.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    fora.set(m[1], m[2].trim().replace(/\s+/g, ' '));
  }
  return fora;
}

describe('tokens de interface', () => {
  const claro = variaveis(css, ':root {');
  const escuroAuto = variaveis(css, ":root:not([data-theme='light'])");
  const escuroFixo = variaveis(css, ":root[data-theme='dark']");

  it('os dois blocos escuros declaram exatamente as mesmas variáveis', () => {
    expect([...escuroFixo.keys()].sort()).toEqual([...escuroAuto.keys()].sort());
  });

  it('os dois blocos escuros declaram exatamente os mesmos valores', () => {
    for (const [k, v] of escuroAuto) expect(`${k}: ${escuroFixo.get(k)}`).toBe(`${k}: ${v}`);
  });

  it('todo token de cor do claro tem correspondente no escuro', () => {
    /* medidas, tipo, raio e movimento não mudam com o tema — só as cores. */
    const soClaro = [...claro.keys()].filter(
      (k) =>
        /^--(fundo|tinta|separador|acento|sobre-acento|foco|anel-foco|atraso|alerta|neutro|serie|grade|sombra-(popover|menu|sheet))/.test(
          k,
        ) && !escuroAuto.has(k),
    );
    expect(soClaro).toEqual([]);
  });
});
