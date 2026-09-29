// @vitest-environment jsdom
/**
 * Exportação CSV sem fórmula (auditoria M-07): texto que começa com = + - @
 * (ou tab/CR) sai com um ' na frente, para o Excel não executar; número —
 * inclusive negativo no formato brasileiro — continua número.
 */
import { describe, expect, it } from 'vitest';
import { paraCSV } from '../src/io/index.js';

const celula = (v) =>
  paraCSV(['x'], [[v]])
    .replace(/^﻿/, '')
    .split('\r\n')[1];

describe('CSV sem fórmula', () => {
  it('neutraliza o que o Excel leria como fórmula', () => {
    expect(celula('=HYPERLINK("http://x","clique")')).toBe(
      `"'=HYPERLINK(""http://x"",""clique"")"`,
    );
    expect(celula('+55 45 9999')).toBe("'+55 45 9999");
    expect(celula('-cmd|calc')).toBe("'-cmd|calc");
    expect(celula('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(celula('\t=1+1')).toBe("'\t=1+1");
  });

  it('número continua número, inclusive negativo', () => {
    expect(celula('-1.234,56')).toBe('-1.234,56');
    expect(celula('-12')).toBe('-12');
    expect(celula('1.234,56')).toBe('1.234,56');
  });

  it('texto comum não muda', () => {
    expect(celula('Cimento CP-II')).toBe('Cimento CP-II');
    expect(celula('2026-09-27')).toBe('2026-09-27');
    expect(celula('')).toBe('');
  });
});
