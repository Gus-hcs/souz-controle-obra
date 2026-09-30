/**
 * Parte de mão de obra no lançamento e contrato anexado (0025).
 *
 * "Fornecimento + instalação" (bancada de mármore instalada, calhas e
 * rufos) pode dizer quanto do total é instalação: essa parte conta como
 * mão de obra nos indicadores de Lançamentos, no Fluxo e na cobertura do
 * plano; sem ela, tudo continua material, como antes. O contrato ganha o
 * arquivo assinado na pasta contratos/ e o link passa a ser só https.
 */
import { describe, expect, it } from 'vitest';
import {
  analiseFluxo,
  coberturaPlanoMateriais,
  resumoLancamentos,
  valorPorCategoria,
} from '../src/dominio/calculos.js';
import { apenasErros, validarContrato, validarLancamento } from '../src/dominio/validacao.js';
import { prepararImportacao } from '../src/io/importar.js';
import { estadoInicial, novoContrato, novoLancamento } from '../src/nucleo/base.js';

const lanc = (extra) => ({ ...novoLancamento(), data: '2026-09-10', ...extra });
const BANCADA = lanc({
  id: 'l1',
  tipo: 'Fornecimento + instalação',
  descricao: 'Bancada de mármore instalada',
  quantidade: 1,
  precoUnitario: 3000,
  valorMaoDeObra: 800,
});

describe('valorPorCategoria', () => {
  it('fornecimento + instalação com a parte informada: divide material e mão de obra', () => {
    expect(valorPorCategoria(BANCADA)).toEqual({
      material: 2200,
      maoDeObra: 800,
      taxas: 0,
      extras: 0,
    });
  });
  it('sem a parte: tudo material, como antes', () => {
    expect(valorPorCategoria({ ...BANCADA, valorMaoDeObra: 0 }).material).toBe(3000);
  });
  it('a parte só vale em fornecimento + instalação', () => {
    const cimento = lanc({
      tipo: 'Material',
      quantidade: 10,
      precoUnitario: 40,
      valorMaoDeObra: 100,
    });
    expect(valorPorCategoria(cimento)).toEqual({
      material: 400,
      maoDeObra: 0,
      taxas: 0,
      extras: 0,
    });
    const diaria = lanc({ tipo: 'Serviço avulso', precoUnitario: 250 });
    expect(valorPorCategoria(diaria).maoDeObra).toBe(250);
  });
  it('a soma das partes é sempre o total (parte maior que o total fica no total)', () => {
    const p = valorPorCategoria({ ...BANCADA, valorMaoDeObra: 5000 });
    expect(p.material + p.maoDeObra).toBe(3000);
    expect(p.maoDeObra).toBe(3000);
  });
});

describe('indicadores com a parte de mão de obra', () => {
  const obra = () => ({
    ...estadoInicial().obras[0],
    id: 'o1',
    fin: {},
    lancamentos: [
      BANCADA,
      lanc({ id: 'l2', tipo: 'Material', precoUnitario: 1000, materialId: 'm1' }),
    ],
    materiais: [{ id: 'm1', material: 'Granito', etapa: '' }],
    medicoes: [],
    recebimentos: [],
    contratos: [],
    cronograma: [],
    diario: [],
  });
  it('Lançamentos: material e mão de obra por categoria', () => {
    const r = resumoLancamentos(obra());
    expect(r.porCategoria.material).toBe(3200);
    expect(r.porCategoria.maoDeObra).toBe(800);
    expect(r.total).toBe(4000);
  });
  it('Fluxo: as saídas do mês repartidas do mesmo jeito', () => {
    const s = Object.fromEntries(
      analiseFluxo(obra(), '', '2026-09-30').saidasPorCategoria.map((x) => [x.chave, x.valor]),
    );
    expect(s.material).toBe(3200);
    expect(s.maoDeObra).toBe(800);
  });
  it('cobertura do plano conta a parte material de fornecimento + instalação', () => {
    const c = coberturaPlanoMateriais(obra());
    expect(c.total).toBe(3200);
    expect(c.noPlano).toBe(1000);
  });
});

describe('validação (espelha os CHECKs da 0025)', () => {
  it('parte de mão de obra: de zero ao total', () => {
    expect(apenasErros(validarLancamento(BANCADA))).toEqual([]);
    const acima = apenasErros(validarLancamento({ ...BANCADA, valorMaoDeObra: 3500 }));
    expect(acima.map((p) => p.campo)).toContain('valorMaoDeObra');
    const negativa = apenasErros(validarLancamento({ ...BANCADA, valorMaoDeObra: -1 }));
    expect(negativa.map((p) => p.campo)).toContain('valorMaoDeObra');
  });
  const contrato = (extra) => ({ ...novoContrato(), codigo: 'CT-001', ...extra });
  it('contrato anexado: foto/PDF ou Storage na pasta contratos/', () => {
    expect(
      apenasErros(validarContrato(contrato({ anexo: 'storage:o1/contratos/ct.pdf' }))),
    ).toEqual([]);
    expect(
      apenasErros(validarContrato(contrato({ anexo: 'data:application/pdf;base64,JVBE' }))),
    ).toEqual([]);
    const outraPasta = apenasErros(
      validarContrato(contrato({ anexo: 'storage:o1/lancamentos/x.pdf' })),
    );
    expect(outraPasta.map((p) => p.campo)).toContain('anexo');
  });
  it('link do documento: só https', () => {
    expect(
      apenasErros(validarContrato(contrato({ documentoUrl: 'https://drive.exemplo.com/ct' }))),
    ).toEqual([]);
    const script = apenasErros(
      validarContrato(contrato({ documentoUrl: 'java' + 'script:alert(1)' })),
    );
    expect(script.map((p) => p.campo)).toContain('documentoUrl');
    const http = apenasErros(validarContrato(contrato({ documentoUrl: 'http://site.com/ct' })));
    expect(http.map((p) => p.campo)).toContain('documentoUrl');
  });
});

describe('importação por modelo', () => {
  it('lê a coluna da mão de obra e zera fora de fornecimento + instalação', () => {
    const r = prepararImportacao(
      'lancamentos',
      [
        {
          Data: '10/09/2026',
          Descrição: 'Bancada',
          Tipo: 'Fornecimento + instalação',
          'Preço unitário': 3000,
          'Mão de obra (instalação)': 800,
        },
        {
          Data: '10/09/2026',
          Descrição: 'Cimento',
          Tipo: 'Material',
          'Preço unitário': 40,
          'Mão de obra (instalação)': 10,
        },
      ],
      estadoInicial(),
    );
    expect(r.linhas.map((x) => x.registro.valorMaoDeObra)).toEqual([800, 0]);
    expect(r.linhas.every((x) => !x.erros.length)).toBe(true);
  });
});
