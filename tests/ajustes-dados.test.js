// @vitest-environment jsdom
/**
 * Ajustes e dados (B12): saúde dos dados, listas (renomear, arquivar),
 * CNPJ da empresa e a importação de planilha por modelo.
 */
import { describe, expect, it } from 'vitest';
import { casa14, HOJE } from './casa14.fixture.js';
import {
  estadoInicial,
  migrar,
  novaObra,
  novoContrato,
  novoLancamento,
  novoPrestador,
} from '../src/nucleo/base.js';
import { renomearItemLista, saudeDados } from '../src/dominio/calculos.js';
import { validarEmpresa } from '../src/dominio/validacao.js';
import { lerValor, prepararImportacao } from '../src/io/importar.js';
import { Store } from '../src/dados/store.js';
import { campoHTML, opcoesLista } from '../src/ui/shell.js';

function estado() {
  const e = estadoInicial();
  e.obras.push(casa14());
  return e;
}

describe('saudeDados', () => {
  it('conta o que está desarrumado e aponta a obra', () => {
    const e = estado();
    e.prestadores.push(Object.assign(novoPrestador(), { nome: 'JOAO PEDREIRO' }));
    const o = e.obras[0];
    const l = () =>
      Object.assign(novoLancamento(), {
        data: '2026-08-26',
        fornecedor: 'Casa do Piso',
        precoUnitario: 3400,
      });
    o.lancamentos.push(l(), l());
    const s = Object.fromEntries(saudeDados(e, HOJE).map((x) => [x.chave, x]));
    expect(s.nomes.n).toBe(1);
    expect(s.duplicados.n).toBe(2);
    expect(s.duplicados.obraId).toBe(o.id);
    /* na Casa 14, 3 lançamentos sem etapa + os 2 duplicados sem etapa */
    expect(s['sem-etapa'].n).toBe(o.lancamentos.filter((x) => !x.etapa).length);
    expect(s['sem-prestador'].n).toBe(3);
  });
  it('sem nada a arrumar, lista vazia', () => {
    const e = estadoInicial();
    const o = novaObra('Limpa');
    o.contratos.push(Object.assign(novoContrato(), { codigo: 'C1', prestadorId: 'p1' }));
    e.obras.push(o);
    expect(saudeDados(e, HOJE)).toEqual([]);
  });
});

describe('renomearItemLista', () => {
  it('leva o nome novo aos registros, às etapas do contrato e à parcela', () => {
    const e = estado();
    const o = e.obras[0];
    o.contratos[0].etapas = ['Fundação', 'Estrutura'];
    o.recebimentos[1].etapaPci = 'Fundação';
    const n = renomearItemLista(e, 'etapas', 'Fundação', 'Fundação e baldrame');
    expect(e.listas.etapas).toContain('Fundação e baldrame');
    expect(e.listas.etapas).not.toContain('Fundação');
    expect(o.cronograma.find((x) => x.etapa === 'Fundação e baldrame')).toBeTruthy();
    expect(o.lancamentos.find((x) => x.etapa === 'Fundação')).toBeUndefined();
    expect(o.contratos[0].etapas).toEqual(['Fundação e baldrame', 'Estrutura']);
    expect(o.recebimentos[1].etapaPci).toBe('Fundação e baldrame');
    expect(n).toBeGreaterThan(3);
  });
  it('não renomeia para um nome que já existe nem item que não está na lista', () => {
    const e = estado();
    expect(renomearItemLista(e, 'etapas', 'Fundação', 'Estrutura')).toBe(0);
    expect(renomearItemLista(e, 'etapas', 'Não existe', 'X')).toBe(0);
    expect(e.listas.etapas).toContain('Fundação');
  });
  it('especialidade renomeada muda no prestador', () => {
    const e = estadoInicial();
    e.prestadores.push(
      Object.assign(novoPrestador(), { nome: 'Ana', especialidade: e.listas.especialidades[0] }),
    );
    const antiga = e.listas.especialidades[0];
    renomearItemLista(e, 'especialidades', antiga, 'Nova especialidade');
    expect(e.prestadores[0].especialidade).toBe('Nova especialidade');
  });
});

describe('itens arquivados', () => {
  it('somem das escolhas, mas o valor do registro continua no campo', () => {
    Store.estado = migrar(estadoInicial());
    Store.estado.listas.arquivados = { tiposSaida: ['Terreno'] };
    expect(opcoesLista('tiposSaida')).not.toContain('Terreno');
    const html = campoHTML(
      { k: 'tipo', label: 'Tipo', tipo: 'select', opcoes: opcoesLista('tiposSaida') },
      { tipo: 'Terreno' },
    );
    expect(html).toMatch(/<option value="Terreno" selected>/);
  });
  it('migrar conserta arquivados corrompidos', () => {
    const e = estadoInicial();
    e.listas.arquivados = 'lixo';
    expect(migrar(e).listas.arquivados).toEqual({});
    e.listas.arquivados = { etapas: ['A', 2, null] };
    expect(migrar(e).listas.arquivados.etapas).toEqual(['A', '2']);
  });
});

describe('CNPJ da empresa', () => {
  const erros = (cnpj) => validarEmpresa({ nome: 'X', cnpj }).filter((p) => p.sev === 'erro');
  it('aceita vazio e CNPJ válido, com ou sem pontuação', () => {
    expect(erros('')).toEqual([]);
    expect(erros('11.222.333/0001-81')).toEqual([]);
    expect(erros('11222333000181')).toEqual([]);
  });
  it('recusa dígito errado, tamanho errado e letras', () => {
    expect(erros('11.222.333/0001-00')).toHaveLength(1);
    expect(erros('123')).toHaveLength(1);
    expect(erros('11.222.333/0001-8A')).toHaveLength(1);
  });
});

describe('importação por modelo', () => {
  it('lê datas, números e porcentagens como vêm da planilha', () => {
    expect(lerValor('05/09/2026', 'data')).toBe('2026-09-05');
    expect(lerValor('2026-09-05', 'data')).toBe('2026-09-05');
    expect(lerValor(46270, 'data')).toMatch(/^2026-/);
    expect(lerValor('31/02', 'data')).toBe('inválida');
    expect(lerValor('1.234,56', 'numero')).toBeCloseTo(1234.56, 2);
    expect(lerValor(30, 'pct')).toBeCloseTo(0.3, 5);
    expect(lerValor('0,3', 'pct')).toBeCloseTo(0.3, 5);
  });

  it('lançamentos: cabeçalho sem acento serve, linha com erro é apontada', () => {
    const linhas = [
      {
        Data: '10/09/2026',
        Descricao: 'Cimento',
        'Preco unitario': '38,00',
        Quantidade: 40,
        Tipo: 'Material',
      },
      { Data: '31/13/2026', Descricao: 'Areia', 'Preco unitario': 100 },
      { Data: '', Descricao: '', 'Preco unitario': '' },
    ];
    const r = prepararImportacao('lancamentos', linhas, estadoInicial());
    expect(r.faltando).toEqual([]);
    expect(r.linhas).toHaveLength(2);
    expect(r.linhas[0].erros).toEqual([]);
    expect(r.linhas[0].registro.quantidade).toBe(40);
    expect(r.linhas[1].erros.some((x) => /Data/.test(x))).toBe(true);
    expect(r.linhas[1].n).toBe(3);
  });

  it('coluna obrigatória que falta é avisada', () => {
    const r = prepararImportacao('prestadores', [{ Telefone: '62999990000' }], estadoInicial());
    expect(r.faltando).toEqual(['Nome']);
  });

  it('obras: cliente existente é ligado; novo fica para criar; MCMV vira Econômico', () => {
    const e = estadoInicial();
    e.clientes.push({ id: 'c1', nome: 'Maria de Souza' });
    const r = prepararImportacao(
      'obras',
      [
        { 'Nome da obra': 'Casa 21', Cliente: 'maria de souza', 'Padrão de acabamento': 'MCMV' },
        { 'Nome da obra': 'Casa 22', Cliente: 'João Novo' },
      ],
      e,
    );
    expect(r.linhas[0].registro.clienteId).toBe('c1');
    expect(r.linhas[0].registro.padrao).toBe('Econômico');
    expect(r.linhas[1].registro.__clienteNovo).toBe('João Novo');
    expect(r.linhas.every((l) => !l.erros.length)).toBe(true);
  });

  it('prestadores: fornecedor reconhecido e telefone normalizado', () => {
    const r = prepararImportacao(
      'prestadores',
      [
        {
          Nome: 'Depósito Central',
          'Tipo (serviço ou fornecedor)': 'Fornecedor',
          Telefone: '(62) 3333-4444',
        },
      ],
      estadoInicial(),
    );
    expect(r.linhas[0].registro.tipo).toBe('fornecedor');
    expect(r.linhas[0].registro.telefone).toMatch(/^55/);
  });
});
