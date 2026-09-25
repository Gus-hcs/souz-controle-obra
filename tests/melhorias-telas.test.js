/**
 * Melhorias por tela da auditoria de 25/09/2026 — as de esforço baixo.
 * Cada bloco prova a regra que a tela passou a mostrar.
 */
import { describe, expect, it } from 'vitest';
import { fmtQuando, novaObra } from '../src/nucleo/base.js';
import { ocultarDocumento } from '../src/nucleo/contato.js';
import {
  alteracaoSensivel,
  ativacaoConta,
  diasSemAtividade,
  listaProtegida,
  saudeCliente,
  saudeObra,
  usoItensLista,
} from '../src/dominio/calculos.js';
import { apenasErros, validarEmpresa } from '../src/dominio/validacao.js';
import { HOJE, casa14 } from './casa14.fixture.js';

describe('Clientes — CPF/CNPJ mascarado na lista (LGPD)', () => {
  it('CPF mostra só os 6 dígitos do meio', () => {
    expect(ocultarDocumento('123.456.789-09')).toBe('***.456.789-**');
    expect(ocultarDocumento('12345678909')).toBe('***.456.789-**');
  });

  it('CNPJ esconde a raiz e o dígito verificador', () => {
    expect(ocultarDocumento('12.345.678/0001-95')).toBe('**.345.678/0001-**');
  });

  it('documento fora do padrão nunca aparece cru', () => {
    expect(ocultarDocumento('RG 1234567')).toBe('•••67');
    expect(ocultarDocumento('')).toBe('');
    expect(ocultarDocumento(null)).toBe('');
  });
});

describe('Clientes — Situação é a saúde da obra do cliente', () => {
  it('cliente sem obra não tem saúde', () => {
    expect(saudeCliente([], HOJE)).toBeNull();
  });

  it('com mais de uma obra, vale a pior', () => {
    const ruim = casa14();
    const sem = novaObra('Terreno sem cronograma');
    const s = saudeCliente([sem, ruim], HOJE);
    expect(s.nivel).toBe(saudeObra(ruim, HOJE).nivel);
    expect(['critico', 'atencao']).toContain(s.nivel);
  });
});

describe('Trilha de auditoria — quando, em linguagem de gente', () => {
  const agora = new Date(2026, 8, 25, 18, 0);
  it('hoje e ontem com a hora', () => {
    expect(fmtQuando(new Date(2026, 8, 25, 17, 49).toISOString(), agora)).toBe('hoje, 17:49');
    expect(fmtQuando(new Date(2026, 8, 24, 9, 5).toISOString(), agora)).toBe('ontem, 09:05');
  });
  it('no mesmo ano, dia/mês; em outro, dia/mês/ano', () => {
    expect(fmtQuando(new Date(2026, 8, 2, 14, 3).toISOString(), agora)).toBe('02/09, 14:03');
    expect(fmtQuando(new Date(2025, 11, 30, 8, 0).toISOString(), agora)).toBe('30/12/25, 08:00');
  });
  it('instante inválido vira traço', () => {
    expect(fmtQuando('', agora)).toBe('—');
    expect(fmtQuando('lixo', agora)).toBe('—');
  });
});

describe('Trilha de auditoria — alteração sensível é o filtro padrão', () => {
  it('pago, recebido e aprovado são sensíveis', () => {
    expect(alteracaoSensivel({ operacao: 'UPDATE', campo: 'valor_pago' })).toBe(true);
    expect(alteracaoSensivel({ operacao: 'UPDATE', campo: 'valor_recebido' })).toBe(true);
    expect(alteracaoSensivel({ operacao: 'INSERT', campo: 'valor_aprovado' })).toBe(true);
  });
  it('exclusão de qualquer campo é sensível', () => {
    expect(alteracaoSensivel({ operacao: 'DELETE', campo: 'quantidade' })).toBe(true);
  });
  it('preço em digitação não é', () => {
    expect(alteracaoSensivel({ operacao: 'UPDATE', campo: 'preco_unitario' })).toBe(false);
    expect(alteracaoSensivel(null)).toBe(false);
  });
});

describe('Ajustes — lista do sistema não perde item em uso', () => {
  const estado = () => ({ obras: [casa14()], prestadores: [{ especialidade: 'Pintura' }] });

  it('conta quantos registros usam cada item', () => {
    const uso = usoItensLista(estado());
    const o = casa14();
    const etapa = o.cronograma[0].etapa;
    expect(uso.etapas.get(etapa)).toBeGreaterThan(0);
    expect(uso.especialidades.get('Pintura')).toBe(1);
  });

  it('item em uso volta para a lista; item sem uso sai', () => {
    const uso = new Map([['Pisos', 12]]);
    const r = listaProtegida(uso, ['Pisos', 'Telhado', 'Muro'], ['Telhado']);
    expect(r.lista).toEqual(['Telhado', 'Pisos']);
    expect(r.mantidos).toEqual([{ item: 'Pisos', registros: 12 }]);
  });

  it('acrescentar e reordenar não é afetado', () => {
    const r = listaProtegida(new Map([['A', 1]]), ['A', 'B'], ['C', 'A']);
    expect(r.lista).toEqual(['C', 'A']);
    expect(r.mantidos).toEqual([]);
  });
});

describe('Ajustes — RT e CREA faltando é alerta, não erro', () => {
  it('avisa o que falta sem bloquear', () => {
    const p = validarEmpresa({ nome: 'Souz', responsavel: '', creaCau: '' });
    expect(p.map((x) => x.campo)).toEqual(['responsavel', 'creaCau']);
    expect(apenasErros(p)).toEqual([]);
  });
  it('completo não avisa', () => {
    expect(validarEmpresa({ responsavel: 'Eng. Ana', creaCau: 'GO-12345/D' })).toEqual([]);
  });
});

describe('Contas e acessos — ativação e conta parada', () => {
  it('conta os passos dados e diz o que falta', () => {
    const a = ativacaoConta({ obras: 1, contratos: 2, medicoes: 0, lancamentos: 5, diario: 0, fotos: 0 });
    expect(a.feitos).toBe(3);
    expect(a.total).toBe(6);
    expect(a.faltam).toEqual(['mediu', 'usa o diário', 'tira foto']);
  });
  it('dias sem atividade; nunca = null', () => {
    const agora = new Date('2026-09-25T12:00:00Z');
    expect(diasSemAtividade('2026-09-10T12:00:00Z', agora)).toBe(15);
    expect(diasSemAtividade('2026-09-25T08:00:00Z', agora)).toBe(0);
    expect(diasSemAtividade(null, agora)).toBeNull();
  });
});
