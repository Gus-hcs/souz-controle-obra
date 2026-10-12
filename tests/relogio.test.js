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

  it('nenhum teste devolve o relógio real no meio do arquivo', () => {
    const fora = [];
    for (const arq of readdirSync('tests').filter((a) => a.endsWith('.test.js'))) {
      if (arq === 'relogio.test.js') continue;
      readFileSync(`tests/${arq}`, 'utf8')
        .split('\n')
        .forEach((linha, i) => {
          if (
            /useRealTimers/.test(linha) &&
            !/^\s*afterAll\(\(\) => vi\.useRealTimers\(\)\);?\s*$/.test(linha)
          )
            fora.push(`${arq}:${i + 1}`);
        });
    }
    expect(fora).toEqual([]);
  });
});
