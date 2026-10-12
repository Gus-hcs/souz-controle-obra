/**
 * O relógio dos testes: a data fica congelada em HOJE para a suíte
 * inteira (tests/relogio/congelar.js). Sem isto, teste com data relativa
 * passa no dia em que foi escrito e quebra semanas depois — foi o que
 * travou a publicação em out/2026 (cliente-e-fornecedor.test.js).
 *
 * `npm run test:relogio` roda a suíte com o relógio da máquina adiantado
 * em 30, 90 e 365 dias.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { hojeISO } from '../src/nucleo/base.js';
import { HOJE, h } from './casa14.fixture.js';

describe('relógio dos testes', () => {
  it('hojeISO() devolve o HOJE da fixture, não o dia em que a suíte roda', () => {
    expect(hojeISO()).toBe(HOJE);
    expect(new Date().toISOString().slice(0, 10)).toBe(HOJE);
    expect(h(0)).toBe(HOJE);
  });

  it('só a data é congelada: setTimeout continua real', async () => {
    const r = await new Promise((ok) => setTimeout(() => ok('passou'), 5));
    expect(r).toBe('passou');
  });

  /* useRealTimers só dentro de um afterAll: no fim do arquivo, depois de
     todos os testes dele. */
  const dentroDeAfterAll = (texto, pos) => {
    const ini = texto.lastIndexOf('afterAll(', pos);
    if (ini < 0) return false;
    let aberto = 0;
    for (let i = ini + 'afterAll'.length; i < pos; i++) {
      if (texto[i] === '(') aberto++;
      else if (texto[i] === ')') aberto--;
      if (aberto === 0) return false;
    }
    return aberto > 0;
  };

  it('a conferência reconhece o afterAll de uma linha e o de bloco', () => {
    const umaLinha = 'afterAll(() => vi.useRealTimers());';
    const bloco = 'afterAll(() => {\n  vi.useRealTimers();\n  limpar();\n});';
    const solto = 'afterAll(() => limpar());\nit("x", () => { vi.useRealTimers(); });';
    expect(dentroDeAfterAll(umaLinha, umaLinha.indexOf('useRealTimers'))).toBe(true);
    expect(dentroDeAfterAll(bloco, bloco.indexOf('useRealTimers'))).toBe(true);
    expect(dentroDeAfterAll(solto, solto.indexOf('useRealTimers'))).toBe(false);
  });

  it('nenhum teste devolve o relógio real no meio do arquivo', () => {
    const fora = [];
    for (const arq of readdirSync('tests').filter((a) => a.endsWith('.test.js'))) {
      if (arq === 'relogio.test.js') continue;
      const texto = readFileSync(`tests/${arq}`, 'utf8');
      for (const m of texto.matchAll(/useRealTimers/g)) {
        if (!dentroDeAfterAll(texto, m.index))
          fora.push(`${arq}:${texto.slice(0, m.index).split('\n').length}`);
      }
    }
    expect(fora).toEqual([]);
  });
});
