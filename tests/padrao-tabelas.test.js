// @vitest-environment jsdom
/**
 * Padrão de tabela (rodada 3): colunas do mesmo tipo com a mesma largura.
 * As numéricas dividem igualmente a soma do que declararam; as de texto
 * ficam como estão, e a largura total da tabela não muda.
 */
import { describe, expect, it } from 'vitest';
import { larguraColunas, lista } from '../src/ui/telas/componentes.js';

describe('larguraColunas', () => {
  it('iguala as numéricas pela média e preserva a soma', () => {
    const colunas = [
      { k: 'mes', largura: '13%' },
      { k: 'ent', largura: '13%', num: true },
      { k: 'sai', largura: '26%', num: true },
      { k: 'sm', largura: '12%', num: true },
      { k: 'sa', largura: '16%', num: true },
      { k: 'liq', largura: '20%' },
    ];
    const w = larguraColunas(colunas);
    expect(w).toEqual(['13%', '16.75%', '16.75%', '16.75%', '16.75%', '20%']);
    expect(w.reduce((t, x) => t + parseFloat(x), 0)).toBeCloseTo(100, 5);
  });

  it('não mexe quando há uma numérica só ou largura fora de %', () => {
    expect(larguraColunas([{ largura: '40%' }, { largura: '60%', num: true }])).toEqual([
      '40%',
      '60%',
    ]);
    const misto = [
      { largura: '120px', num: true },
      { largura: '20%', num: true },
    ];
    expect(larguraColunas(misto)).toEqual(['120px', '20%']);
  });

  it('a lista desenha o colgroup já igualado', () => {
    const html = lista({
      id: 't-padrao',
      colunas: [
        { k: 'nome', rotulo: 'Nome', largura: '50%', valor: (i) => i.n, celula: (i) => i.n },
        { k: 'a', rotulo: 'A', largura: '20%', num: true, valor: (i) => i.a, celula: (i) => i.a },
        { k: 'b', rotulo: 'B', largura: '30%', num: true, valor: (i) => i.b, celula: (i) => i.b },
      ],
      itens: [{ n: 'x', a: 1, b: 2 }],
    });
    expect(html).toContain('<col style="width:50%"><col style="width:25%"><col style="width:25%">');
  });
});
