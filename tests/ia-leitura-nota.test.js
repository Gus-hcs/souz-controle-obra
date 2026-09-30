/**
 * Leitura de nota por IA (0027) — a parte que é conta do sistema: a
 * validação do que a IA devolve (igual no app e na função), os alertas da
 * conferência, a soma, a nota repetida, o fornecedor pelo CNPJ e a
 * conversão em lançamentos, que precisam passar em validarLancamento.
 */
import { describe, expect, it } from 'vitest';
import {
  lancamentoTotal,
  lancamentosDaLeitura,
  notaJaLancada,
  fornecedorPorCnpj,
  ratearNota,
  situacaoCotaIa,
  somaLeituraNota,
  unidadeDaNota,
  valorPorCategoria,
  camposCorrigidosNota,
} from '../src/dominio/calculos.js';
import {
  alertasLeituraNota,
  apenasErros,
  validarIaConfig,
  validarLancamento,
  validarLeituraNota,
} from '../src/dominio/validacao.js';
import { LISTAS_PADRAO, novoLancamento } from '../src/nucleo/base.js';
import * as funcao from '../supabase/functions/ia/leitura.js';

const item = (o) => ({
  descricao: 'Cimento CP II 50 kg',
  quantidade: 10,
  unidade: 'SC',
  valorUnitario: 38,
  valorTotal: 380,
  servico: false,
  valorServico: null,
  categoria: 'Cimento',
  etapa: 'Fundação',
  materialId: null,
  ...o,
});
const leitura = (o = {}) => ({
  legivel: true,
  motivo: null,
  tipoDocumento: 'nfe',
  fornecedor: 'Depósito Central Ltda',
  cnpj: '11222333000181',
  numero: '001201',
  dataEmissao: '2026-09-20',
  totalNota: 1480,
  desconto: 20,
  frete: 150,
  formaPagamento: 'PIX',
  itens: [
    item(),
    item({
      descricao: 'Bloco cerâmico 9x19x39',
      quantidade: 1,
      unidade: 'MIL',
      valorUnitario: 970,
      valorTotal: 970,
      categoria: 'Bloco',
      etapa: 'Fechamento/alvenaria',
    }),
  ],
  incertos: [],
  ...o,
});
const obra = () => ({
  id: 'o1',
  cronograma: [{ etapa: 'Fundação' }, { etapa: 'Fechamento/alvenaria' }],
  materiais: [{ id: 'mat-cim', material: 'Cimento CP II', etapa: 'Fundação' }],
  lancamentos: [],
});
const listas = LISTAS_PADRAO;

describe('validarLeituraNota: o que a IA devolve', () => {
  const campos = (l) => validarLeituraNota(l).map((p) => p.campo);
  it('leitura boa passa', () => {
    expect(validarLeituraNota(leitura())).toEqual([]);
    expect(
      validarLeituraNota(leitura({ legivel: false, motivo: 'foto de parede', itens: [] })),
    ).toEqual([]);
  });
  it('recusa formato quebrado, valor impossível e texto longo', () => {
    expect(campos(null)).toEqual(['leitura']);
    expect(campos(leitura({ cnpj: '11.222.333/0001-81' }))).toContain('cnpj');
    expect(campos(leitura({ dataEmissao: '20/09/2026' }))).toContain('dataEmissao');
    expect(campos(leitura({ totalNota: -1 }))).toContain('totalNota');
    expect(campos(leitura({ tipoDocumento: 'boleto' }))).toContain('tipoDocumento');
    expect(campos(leitura({ incertos: ['senha'] }))).toContain('incertos');
    expect(campos(leitura({ itens: [] }))).toContain('itens');
    expect(campos(leitura({ itens: [item({ quantidade: 0 })] }))).toContain('itens[0].quantidade');
    expect(campos(leitura({ itens: [item({ descricao: 'x'.repeat(201) })] }))).toContain(
      'itens[0].descricao',
    );
    expect(campos(leitura({ itens: [item({ valorTotal: null, valorUnitario: null })] }))).toContain(
      'itens[0].valorTotal',
    );
    expect(campos(leitura({ itens: Array.from({ length: 61 }, () => item()) }))).toContain('itens');
  });
  it('a cópia da função (supabase/functions/ia) diz exatamente o mesmo', () => {
    const casos = [
      leitura(),
      null,
      leitura({ cnpj: '123' }),
      leitura({ dataEmissao: '2026-02-30' }),
      leitura({ frete: Number.NaN }),
      leitura({ itens: [item({ servico: 'sim' }), item({ unidade: 'x'.repeat(21) })] }),
      leitura({ legivel: 'talvez', incertos: 'cnpj' }),
    ];
    for (const c of casos) {
      expect(funcao.validarLeituraNota(c).map((p) => p.campo)).toEqual(campos(c));
    }
    expect(funcao.LIMITES.itens).toBe(60);
  });
});

describe('conferência da nota (alertas, não bloqueiam)', () => {
  const avisos = (l, o = obra(), hoje = '2026-09-29') =>
    alertasLeituraNota(l, o, hoje).map((p) => p.campo);
  it('soma dos itens − desconto + frete contra o total', () => {
    expect(somaLeituraNota(leitura())).toEqual({ itens: 1350, calculado: 1480, diferenca: 0 });
    expect(avisos(leitura())).toEqual([]);
    expect(avisos(leitura({ totalNota: 1500 }))).toContain('totalNota');
  });
  it('CNPJ com dígito errado, data futura e campo incerto', () => {
    expect(avisos(leitura({ cnpj: '11222333000182' }))).toContain('cnpj');
    expect(avisos(leitura({ dataEmissao: '2026-10-05' }))).toContain('dataEmissao');
    expect(avisos(leitura({ incertos: ['numero'] }))).toContain('numero');
    expect(
      alertasLeituraNota(leitura({ incertos: ['numero'] }), obra()).every(
        (p) => p.sev === 'alerta',
      ),
    ).toBe(true);
  });
  it('nota já lançada: mesmo número (sem zeros à esquerda) e fornecedor', () => {
    const o = obra();
    o.lancamentos = [{ id: 'l9', documento: 'NF 1201', fornecedor: 'Depósito Central Ltda' }];
    expect(notaJaLancada(o, leitura()).map((l) => l.id)).toEqual(['l9']);
    expect(avisos(leitura(), o)).toContain('numero');
    o.lancamentos[0].fornecedor = 'Outra loja';
    expect(notaJaLancada(o, leitura())).toEqual([]);
    /* o fornecedor do cadastro, achado pelo CNPJ, também vale */
    o.lancamentos[0].fornecedor = 'Depósito Central';
    const prest = [{ id: 'p1', nome: 'Depósito Central', documento: '11.222.333/0001-81' }];
    expect(notaJaLancada(o, leitura(), prest)).toHaveLength(1);
    expect(fornecedorPorCnpj(prest, '11222333000181').id).toBe('p1');
    expect(fornecedorPorCnpj(prest, '')).toBeNull();
  });
});

describe('leitura → lançamentos', () => {
  const opc = (o = {}) => ({
    listas,
    anexoNf: 'storage:o1/lancamentos/nf.jpg',
    hoje: '2026-09-29',
    ...o,
  });
  it('um por item: desconto e frete rateados, a soma fecha com a nota', () => {
    const ls = lancamentosDaLeitura(leitura(), obra(), opc());
    expect(ls).toHaveLength(2);
    const total = ls.reduce((s, l) => s + lancamentoTotal(l), 0);
    expect(Math.round(total * 100) / 100).toBe(1480);
    expect(ls[0]).toMatchObject({
      descricao: 'Cimento CP II 50 kg',
      quantidade: 10,
      unidade: 'saco',
      precoUnitario: 38,
      tipo: 'Material',
      etapa: 'Fundação',
      documento: 'NF 001201',
      data: '2026-09-20',
      formaPagamento: 'PIX',
      anexoNf: 'storage:o1/lancamentos/nf.jpg',
    });
    expect(ls[1]).toMatchObject({ unidade: 'milheiro', etapa: 'Fechamento/alvenaria' });
    expect(ls[0].desconto + ls[1].desconto).toBeCloseTo(20, 2);
    expect(ls[0].frete + ls[1].frete).toBeCloseTo(150, 2);
  });
  it('um só com o total: a nota inteira, etapa e categoria mais comuns', () => {
    const [l] = lancamentosDaLeitura(leitura(), obra(), opc({ modo: 'total' }));
    expect(lancamentoTotal(l)).toBe(1480);
    expect(l.descricao).toBe('Cimento CP II 50 kg e mais 1 item');
    expect(l.observacoes).toContain('Bloco cerâmico');
  });
  it('etapa e item do plano só se existem na obra; senão ficam vazios', () => {
    const l = leitura({
      itens: [
        item({ etapa: 'Etapa inventada', materialId: 'mat-cim' }),
        item({ materialId: 'nao-existe', etapa: null }),
      ],
    });
    const [a, b] = lancamentosDaLeitura(l, obra(), opc());
    expect(a).toMatchObject({ materialId: 'mat-cim', etapa: 'Fundação' });
    expect(b).toMatchObject({ materialId: '', etapa: '' });
  });
  it('fornecimento + instalação separa a mão de obra; serviço puro é serviço', () => {
    const l = leitura({
      totalNota: null,
      desconto: null,
      frete: null,
      itens: [
        item({
          descricao: 'Bancada de granito instalada',
          quantidade: 1,
          unidade: 'UN',
          valorUnitario: 3000,
          valorTotal: 3000,
          servico: true,
          valorServico: 800,
        }),
        item({
          descricao: 'Mão de obra de pintura',
          quantidade: 1,
          unidade: 'SV',
          valorUnitario: 1200,
          valorTotal: 1200,
          servico: true,
          valorServico: null,
        }),
      ],
    });
    const [bancada, pintura] = lancamentosDaLeitura(l, obra(), opc());
    expect(bancada).toMatchObject({ tipo: 'Fornecimento + instalação', valorMaoDeObra: 800 });
    expect(valorPorCategoria(bancada)).toMatchObject({ maoDeObra: 800, material: 2200 });
    expect(pintura).toMatchObject({ tipo: 'Serviço avulso', unidade: 'serviço' });
  });
  it('fornecedor do cadastro pelo CNPJ; pagamento desconhecido vira "Outro"', () => {
    const prest = [{ id: 'p1', nome: 'Depósito Central (cadastro)', documento: '11222333000181' }];
    const [l] = lancamentosDaLeitura(
      leitura({ formaPagamento: 'VALE' }),
      obra(),
      opc({ prestadores: prest }),
    );
    expect(l).toMatchObject({ fornecedor: 'Depósito Central (cadastro)', formaPagamento: 'Outro' });
    const [c] = lancamentosDaLeitura(
      leitura({ formaPagamento: 'Cartão de crédito' }),
      obra(),
      opc(),
    );
    expect(c.formaPagamento).toBe('Cartão');
  });
  it('sem data na nota, a data de hoje; nota ilegível não gera lançamento', () => {
    const [l] = lancamentosDaLeitura(leitura({ dataEmissao: null }), obra(), opc());
    expect(l.data).toBe('2026-09-29');
    expect(lancamentosDaLeitura(leitura({ legivel: false, itens: [] }), obra(), opc())).toEqual([]);
  });
  it('todo lançamento gerado passa na validação de lançamento', () => {
    for (const modo of ['itens', 'total']) {
      for (const campos of lancamentosDaLeitura(leitura(), obra(), opc({ modo }))) {
        const l = Object.assign(novoLancamento(), campos);
        expect(apenasErros(validarLancamento(l))).toEqual([]);
      }
    }
  });
  it('rateio: o centavo que sobra vai para o maior item', () => {
    expect(ratearNota(10, [1, 1, 1])).toEqual([3.34, 3.33, 3.33]);
    expect(ratearNota(0, [5, 5])).toEqual([0, 0]);
    expect(unidadeDaNota('M2', listas.unidades)).toBe('m²');
    expect(unidadeDaNota('xyz', listas.unidades)).toBe('un');
  });
});

describe('campos corrigidos na conferência', () => {
  it('conta cabeçalho, itens e itens tirados; mesma coisa não conta', () => {
    const a = leitura();
    expect(camposCorrigidosNota(a, JSON.parse(JSON.stringify(a)))).toBe(0);
    const b = JSON.parse(JSON.stringify(a));
    b.numero = '1202';
    b.itens[0].valorTotal = 381;
    b.itens[1].etapa = 'Cobertura';
    expect(camposCorrigidosNota(a, b, 1)).toBe(4);
  });
});

describe('cota e configuração da IA', () => {
  it('situação para a tela: restante e aviso aos 80%', () => {
    expect(situacaoCotaIa({ ligada: true, cota_notas: 60, usado_notas: 48 })).toMatchObject({
      restante: 12,
      aviso: true,
      esgotada: false,
    });
    expect(situacaoCotaIa({ ligada: true, cota_notas: 60, usado_notas: 60 }).esgotada).toBe(true);
    expect(situacaoCotaIa(null)).toMatchObject({ ligada: false, esgotada: true });
  });
  it('configuração do admin espelha os CHECKs da 0027', () => {
    expect(
      validarIaConfig({ cotaNotas: 60, cotaTextos: 60, extraNotas: 0, validaAte: '2026-10-14' }),
    ).toEqual([]);
    const campos = (c) => validarIaConfig(c).map((p) => p.campo);
    expect(campos({ cotaNotas: -1, cotaTextos: 1.5, extraNotas: 100001 })).toEqual([
      'cotaNotas',
      'cotaTextos',
      'extraNotas',
    ]);
    expect(campos({ cotaNotas: 1, cotaTextos: 1, extraNotas: 0, validaAte: '14/10/2026' })).toEqual(
      ['validaAte'],
    );
  });
});
