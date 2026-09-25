/**
 * Melhorias por tela da auditoria de 25/09/2026 — as de esforço baixo.
 * Cada bloco prova a regra que a tela passou a mostrar.
 */
import { describe, expect, it } from 'vitest';
import { fmtQuando, novaObra } from '../src/nucleo/base.js';
import { ocultarDocumento } from '../src/nucleo/contato.js';
import { alteracaoSensivel, saudeCliente, saudeObra } from '../src/dominio/calculos.js';
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
