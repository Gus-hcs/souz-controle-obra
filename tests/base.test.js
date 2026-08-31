/**
 * Testes da base: leitura de números e normalização do estado.
 *
 * Estes dois pontos já causaram erro real na importação de planilha — número
 * em formato americano lido como brasileiro, e coleções perdendo a ordem —
 * então ficam cobertos aqui.
 */
import { describe, it, expect } from 'vitest';
import { num, competencia, diasEntre, addDias, isISO, slug, migrar, estadoInicial, novaObra } from '../src/nucleo/base.js';

describe('num(): lê número em qualquer formato que apareça na planilha', () => {
  const casos = [
    ['formato brasileiro', '1.234,56', 1234.56],
    ['formato americano', '1,234.56', 1234.56],
    ['milhar brasileiro sem decimal', '1.500', 1500],
    /* "1,500" é ambíguo: 1500 em inglês, 1,5 em português. O sistema é
       brasileiro, então lê como 1,5 — e a importação de planilha lê os
       números como número, não como texto, justamente para não depender disso. */
    ['vírgula única é decimal brasileiro', '1,500', 1.5],
    ['decimal simples com vírgula', '12,5', 12.5],
    ['decimal simples com ponto', '12.5', 12.5],
    ['com moeda e espaços', ' R$ 3.480,90 ', 3480.9],
    ['negativo brasileiro', '-2.000,25', -2000.25],
    ['milhões americano', '5,000,000.00', 5000000],
    ['já numérico', 4200, 4200],
    ['vazio', '', 0],
    ['nulo', null, 0],
    ['texto sem número', 'à combinar', 0],
    ['traço isolado', '-', 0],
    ['percentual em texto', '15%', 15],
  ];
  casos.forEach(([nome, entrada, saida]) => {
    it(nome, () => expect(num(entrada)).toBeCloseTo(saida, 6));
  });

  it('nunca devolve NaN nem Infinity', () => {
    ['abc', '..', ',,', '1e999', undefined, {}, []].forEach((v) => {
      expect(Number.isFinite(num(v))).toBe(true);
    });
  });
});

describe('datas', () => {
  it('reconhece o formato ISO', () => {
    expect(isISO('2026-03-02')).toBe(true);
    expect(isISO('02/03/2026')).toBe(false);
    expect(isISO('')).toBe(false);
  });
  it('conta dias entre datas', () => {
    expect(diasEntre('2026-03-02', '2026-03-12')).toBe(10);
    expect(diasEntre('2026-03-12', '2026-03-02')).toBe(-10);
  });
  it('soma dias sem escorregar de mês', () => {
    expect(addDias('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDias('2026-02-28', 1)).toBe('2026-03-01');
  });
  it('extrai a competência', () => {
    expect(competencia('2026-07-15')).toBe('2026-07');
  });
});

describe('slug', () => {
  it('tira acento e espaço', () => {
    expect(slug('Fundação e baldrame')).toBe('fundacao-e-baldrame');
  });
});

describe('migrar(): normaliza o estado vindo de qualquer origem', () => {
  it('não perde nada ao rodar duas vezes', () => {
    const e = estadoInicial();
    e.obras.push(novaObra('Casa 1'));
    const a = migrar(structuredClone(e));
    const b = migrar(structuredClone(a));
    expect(b).toEqual(a);
  });

  it('preenche as coleções que faltam na obra', () => {
    const e = estadoInicial();
    e.obras.push({ id: 'x', nome: 'Casa sem nada' });
    const m = migrar(e);
    ['contratos', 'medicoes', 'recebimentos', 'materiais', 'lancamentos', 'cronograma', 'diario']
      .forEach((c) => expect(Array.isArray(m.obras[0][c])).toBe(true));
  });

  it('guarda número de medição como texto, para não oscilar de tipo', () => {
    const e = estadoInicial();
    const o = novaObra('Casa 2');
    o.medicoes.push({ id: 'm1', numero: 3, contratoBase: 'CT-001' });
    e.obras.push(o);
    expect(typeof migrar(e).obras[0].medicoes[0].numero).toBe('string');
  });

  it('aceita estado vazio ou corrompido sem quebrar', () => {
    expect(() => migrar({})).not.toThrow();
    expect(() => migrar({ obras: null })).not.toThrow();
    expect(migrar({}).obras).toEqual([]);
  });
});
