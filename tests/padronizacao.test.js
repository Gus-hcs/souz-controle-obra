// @vitest-environment jsdom
/**
 * Padronização das telas (set/2026): a faixa de KPIs de Prestadores sai de
 * indicadoresPrestadores, e os componentes comuns (faixaKpis, barraFiltros,
 * painelAnalise) desenham o mesmo padrão em qualquer tela.
 */
import { describe, expect, it } from 'vitest';
import {
  estadoInicial,
  novaEtapaCronograma,
  novaMedicao,
  novaObra,
  novoContrato,
  novoLancamento,
  novoPrestador,
} from '../src/nucleo/base.js';
import {
  indicadoresPrestadores,
  pontualidadePrestador,
  resumoPrestador,
} from '../src/dominio/calculos.js';
import { App } from '../src/ui/shell.js';
import { barraFiltros, faixaKpis, painelAnalise } from '../src/ui/telas/componentes.js';

const HOJE = '2026-09-25';

function estado() {
  const e = estadoInicial();
  const prest = (o) => Object.assign(novoPrestador(), o);
  e.prestadores.push(
    prest({ id: 'a', nome: 'Antônio Ribeiro' }),
    prest({ id: 'b', nome: 'Gesso Arte' }),
    prest({ id: 'c', nome: 'Depósito Central', tipo: 'fornecedor' }),
    prest({ id: 'd', nome: 'Arquivado', arquivado: true }),
  );
  const o = Object.assign(novaObra(), { id: 'o1', nome: 'Casa 14' });
  o.contratos.push(
    Object.assign(novoContrato(), {
      codigo: 'CT-1',
      codigoBase: 'CT-1',
      prestadorId: 'a',
      valorInformado: 20000,
      inicioPrevisto: '2026-05-01',
      fimPrevisto: '2026-08-31',
    }),
  );
  o.medicoes.push(
    Object.assign(novaMedicao(), {
      contratoBase: 'CT-1',
      data: '2026-08-10',
      valorMedido: 7000,
      valorPago: 0,
      status: 'Em aberto',
    }),
    Object.assign(novaMedicao(), {
      contratoBase: 'CT-1',
      data: '2026-07-10',
      valorMedido: 5000,
      valorPago: 5000,
      status: 'Pago',
    }),
  );
  o.lancamentos.push(
    Object.assign(novoLancamento(), {
      data: '2026-07-01',
      descricao: 'Cimento',
      fornecedor: 'Depósito Central',
      prestadorId: 'c',
      quantidade: 1,
      precoUnitario: 780,
    }),
  );
  o.cronograma.push(
    Object.assign(novaEtapaCronograma(), {
      etapa: 'Alvenaria',
      responsavel: 'Antônio Ribeiro',
      fimPrevisto: '2026-07-01',
      fimReal: '2026-07-20',
      progresso: 1,
    }),
    Object.assign(novaEtapaCronograma(), {
      etapa: 'Forro/gesso',
      responsavel: 'Gesso Arte',
      fimPrevisto: '2026-09-01',
      fimReal: '2026-09-01',
      progresso: 1,
    }),
    Object.assign(novaEtapaCronograma(), {
      etapa: 'Reboco',
      responsavel: 'Antônio Ribeiro',
      fimPrevisto: '2026-09-10',
      progresso: 0.5,
    }),
  );
  e.obras.push(o);
  return e;
}

describe('indicadoresPrestadores', () => {
  it('conta ativos por tipo e deixa o arquivado de fora', () => {
    const k = indicadoresPrestadores(estado(), HOJE);
    expect(k.ativos).toBe(3);
    expect(k.fornecedores).toBe(1);
    expect(k.servico).toBe(2);
  });

  it('soma o pago e o a pagar agora igual à ficha de cada um', () => {
    const e = estado();
    const k = indicadoresPrestadores(e, HOJE);
    const ativos = e.prestadores.filter((p) => !p.arquivado);
    const soma = (campo) => ativos.reduce((s, p) => s + resumoPrestador(e, p)[campo], 0);
    expect(k.pago).toBeCloseTo(soma('pago'), 2);
    expect(k.pago).toBeCloseTo(5780, 2);
    expect(k.aPagarAgora).toBeCloseTo(soma('aPagarAgora'), 2);
    expect(k.aPagarAgora).toBeCloseTo(7000, 2);
    expect(k.comSaldo).toBe(1);
  });

  it('diz há quantos dias espera quem espera mais', () => {
    /* medição em aberto de 10/08 → 46 dias até 25/09 */
    expect(indicadoresPrestadores(estado(), HOJE).esperaMaisAntiga).toBe(46);
  });

  it('pontualidade de todos juntos = soma das pontualidades de cada um', () => {
    const e = estado();
    const k = indicadoresPrestadores(e, HOJE);
    const ativos = e.prestadores.filter((p) => !p.arquivado);
    const entregas = ativos.reduce((s, p) => s + pontualidadePrestador(e, p, HOJE).entregas, 0);
    const noPrazo = ativos.reduce((s, p) => s + pontualidadePrestador(e, p, HOJE).noPrazo, 0);
    expect(k.entregas).toBe(entregas);
    expect(k.noPrazo).toBe(noPrazo);
    /* Alvenaria atrasou, Reboco está atrasado agora, Forro no prazo */
    expect(k.entregas).toBe(3);
    expect(k.noPrazo).toBe(1);
    expect(k.pontualidade).toBeCloseTo(1 / 3, 5);
    expect(k.atrasadasAgora).toBe(1);
  });

  it('sem entrega com prazo, pontualidade é null (não 0%)', () => {
    const e = estadoInicial();
    e.prestadores.push(novoPrestador());
    const k = indicadoresPrestadores(e, HOJE);
    expect(k.pontualidade).toBeNull();
    expect(k.esperaMaisAntiga).toBeNull();
  });
});

describe('faixaKpis', () => {
  const div = (html) => {
    const d = document.createElement('div');
    d.innerHTML = html;
    return d;
  };

  it('um card por item, com o número de cards declarado para o CSS', () => {
    const d = div(
      faixaKpis([
        { rotulo: 'A', valor: '1', contexto: 'x' },
        null,
        { rotulo: 'B', valor: '2', contexto: 'y' },
        { rotulo: 'C', valor: '3', contexto: 'z' },
      ]),
    );
    const faixa = d.querySelector('.kpis');
    expect(faixa.dataset.n).toBe('3');
    expect(faixa.querySelectorAll('.kpi-item')).toHaveLength(3);
  });

  it('card só é botão quando filtra a tela', () => {
    const d = div(
      faixaKpis(
        [
          { chave: 'total', rotulo: 'Total', valor: '1', contexto: '', filtra: false },
          { chave: 'aberto', rotulo: 'A pagar', valor: '2', contexto: '' },
        ],
        { acao: 'med-kpi', ativo: 'aberto' },
      ),
    );
    const [a, b] = d.querySelectorAll('.kpi-item');
    expect(a.tagName).toBe('DIV');
    expect(b.tagName).toBe('BUTTON');
    expect(b.dataset.acao).toBe('med-kpi');
    expect(b.getAttribute('aria-pressed')).toBe('true');
    expect(b.classList.contains('ativo')).toBe(true);
  });

  it('o contexto inteiro vai para o tooltip, sem as tags', () => {
    const d = div(
      faixaKpis([
        { rotulo: 'X', valor: '1', contexto: '<span class="atraso">3 atrasadas</span> · ok' },
      ]),
    );
    expect(d.querySelector('.kpi-ctx').getAttribute('title')).toBe('3 atrasadas · ok');
  });

  it('não desenha mais o card antigo (.kpi, .resumo)', () => {
    const d = div(faixaKpis([{ rotulo: 'X', valor: '1', contexto: '' }]));
    expect(d.querySelector('.kpi, .resumo')).toBeNull();
  });
});

describe('barraFiltros', () => {
  it('pílula com zero some; o menu não mostra grupo sem escolha', () => {
    App.filtros = {};
    const d = document.createElement('div');
    d.innerHTML = barraFiltros({
      pilulas: {
        chave: 'situacao',
        total: 4,
        opcoes: [
          { valor: 'a', rotulo: 'Atrasadas', n: 2 },
          { valor: 'b', rotulo: 'Paralisadas', n: 0 },
        ],
      },
      mais: [
        { chave: 'etapa', rotulo: 'Etapa', opcoes: [['x', 'X', 1]] },
        {
          chave: 'mes',
          rotulo: 'Mês',
          opcoes: [
            ['2026-08', 'ago', 1],
            ['2026-09', 'set', 3],
          ],
        },
      ],
      filtrados: 4,
      total: 4,
    });
    const rotulos = [...d.querySelectorAll('.pilula')].map(
      (b) => b.textContent.trim().split(/\s+/)[0],
    );
    expect(rotulos).toEqual(['Todos', 'Atrasadas', 'Mais']);
    expect(d.querySelector('select')).toBeNull();
  });

  it('filtro do menu ligado vira etiqueta com ×', () => {
    App.filtros = { mes: '2026-09' };
    const d = document.createElement('div');
    d.innerHTML = barraFiltros({
      mais: [
        {
          chave: 'mes',
          rotulo: 'Mês',
          opcoes: [
            ['2026-08', 'ago'],
            ['2026-09', 'set'],
          ],
        },
      ],
      filtrados: 3,
      total: 4,
    });
    const et = d.querySelector('.etiqueta-filtro');
    expect(et.dataset.acao).toBe('filtro-tirar');
    expect(et.textContent).toContain('set');
    expect(d.querySelector('.filtro-conta').textContent).toBe('3 de 4');
    App.filtros = {};
  });
});

describe('painelAnalise', () => {
  it('bloco sem conteúdo não entra; um só ocupa a linha', () => {
    const d = document.createElement('div');
    d.innerHTML = painelAnalise([
      { titulo: 'A pagar por contrato', conteudo: '<svg></svg>' },
      { titulo: 'Vazio', conteudo: '' },
    ]);
    expect(d.querySelectorAll('.analise-bloco')).toHaveLength(1);
    expect(d.querySelector('.painel-analise').classList.contains('um')).toBe(true);
  });

  it('sem nenhum bloco, nada', () => {
    expect(painelAnalise([{ titulo: 'x', conteudo: '' }])).toBe('');
  });
});
