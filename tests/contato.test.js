/**
 * Telefone brasileiro do jeito que se digita no celular, na obra — e os
 * links de WhatsApp e ligação que saem dele.
 */
import { describe, expect, it } from 'vitest';
import {
  formatarTelefoneBR,
  linkTelefone,
  linkWhatsApp,
  mascaraTelefone,
  motivoTelefoneInvalido,
  normalizarTelefoneBR,
  tipoTelefone,
} from '../src/nucleo/contato.js';

describe('normalizarTelefoneBR — entradas bagunçadas viram 55 + DDD + número', () => {
  it.each([
    ['(62) 9 9999-8888', '5562999998888'],
    ['62999998888', '5562999998888'],
    ['+55 62 99999 8888', '5562999998888'],
    ['55 62 99999-8888', '5562999998888'],
    ['062 99999-8888', '5562999998888'],
    ['(62) 3222-1234', '556232221234'], // fixo
    ['55 99999-8888', '5555999998888'], // DDD 55 (RS) sem código de país
  ])('%s → %s', (entrada, esperado) => {
    expect(normalizarTelefoneBR(entrada)).toBe(esperado);
  });

  it.each([
    ['(20) 99999-8888', 'DDD 20 não existe.'],
    ['(62) 8888-777', 'Número incompleto: falta o DDD ou algum dígito.'],
    ['9999-8888', 'Número incompleto: falta o DDD ou algum dígito.'],
    ['(62) 8 9999-8888', 'Celular com 9 dígitos começa com 9.'],
    ['(62) 9999-8888', 'Número fixo começa com 2, 3, 4 ou 5.'],
    ['', 'Informe o número.'],
  ])('%s é recusado: %s', (entrada, motivo) => {
    expect(normalizarTelefoneBR(entrada)).toBeNull();
    expect(motivoTelefoneInvalido(entrada)).toBe(motivo);
  });

  it('número já normalizado continua igual', () => {
    expect(normalizarTelefoneBR('5562999998888')).toBe('5562999998888');
  });
});

describe('formatação e máscara', () => {
  it('exibe celular e fixo no formato brasileiro', () => {
    expect(formatarTelefoneBR('5562999998888')).toBe('(62) 99999-8888');
    expect(formatarTelefoneBR('556232221234')).toBe('(62) 3222-1234');
  });

  it('a máscara organiza enquanto se digita, sem validar', () => {
    expect(mascaraTelefone('6')).toBe('(6');
    expect(mascaraTelefone('629999')).toBe('(62) 9999');
    expect(mascaraTelefone('6232221234')).toBe('(62) 3222-1234');
    expect(mascaraTelefone('62999998888')).toBe('(62) 99999-8888');
    expect(mascaraTelefone('62999998888123')).toBe('(62) 99999-8888');
  });

  it('distingue celular de fixo', () => {
    expect(tipoTelefone('5562999998888')).toBe('celular');
    expect(tipoTelefone('556232221234')).toBe('fixo');
  });
});

describe('links', () => {
  it('WhatsApp com texto codificado', () => {
    expect(linkWhatsApp('5562999998888', 'Olá, João! Amanhã às 7h?')).toBe(
      'https://wa.me/5562999998888?text=Ol%C3%A1%2C%20Jo%C3%A3o!%20Amanh%C3%A3%20%C3%A0s%207h%3F',
    );
  });

  it('WhatsApp sem texto não leva ?text=', () => {
    expect(linkWhatsApp('5562999998888')).toBe('https://wa.me/5562999998888');
  });

  it('ligação com +', () => {
    expect(linkTelefone('5562999998888')).toBe('tel:+5562999998888');
  });
});
