// @vitest-environment jsdom
/**
 * Termos de uso e privacidade na tela de entrada: só o link para o texto
 * publicado fora do app, e só quando o endereço https está configurado
 * (VITE_TERMOS_URL, VITE_PRIVACIDADE_URL). Sem endereço, nada aparece.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { CFG } from '../src/config.js';
import { telaLogin } from '../src/dados/supabase.js';

const antes = { termosUrl: CFG.termosUrl, privacidadeUrl: CFG.privacidadeUrl };
afterEach(() => {
  Object.assign(CFG, antes);
  document.body.innerHTML = '';
});
const links = (modo = 'entrar') => {
  telaLogin(modo);
  return [...document.querySelectorAll('#acesso .acesso-legal a')].map((a) => ({
    texto: a.textContent,
    href: a.getAttribute('href'),
    alvo: a.getAttribute('target'),
    rel: a.getAttribute('rel'),
  }));
};

describe('termos de uso e privacidade na entrada', () => {
  it('sem endereço configurado, nenhum link', () => {
    Object.assign(CFG, { termosUrl: '', privacidadeUrl: '' });
    expect(links()).toEqual([]);
    expect(document.querySelector('.acesso-legal')).toBeNull();
  });
  it('com os dois endereços, os dois links em nova aba, sem passar a origem', () => {
    Object.assign(CFG, {
      termosUrl: 'https://souztech.com/termos',
      privacidadeUrl: 'https://souztech.com/privacidade',
    });
    expect(links()).toEqual([
      {
        texto: 'Termos de uso',
        href: 'https://souztech.com/termos',
        alvo: '_blank',
        rel: 'noopener noreferrer',
      },
      {
        texto: 'Política de privacidade',
        href: 'https://souztech.com/privacidade',
        alvo: '_blank',
        rel: 'noopener noreferrer',
      },
    ]);
    expect(links('criar')).toHaveLength(2);
    expect(links('recuperar')).toEqual([]);
  });
  it('só https: javascript:, http e texto solto não viram link', () => {
    Object.assign(CFG, { termosUrl: 'java' + 'script:alert(1)', privacidadeUrl: 'http://x.com/p' });
    expect(links()).toEqual([]);
    Object.assign(CFG, { termosUrl: 'termos', privacidadeUrl: 'https://souztech.com/privacidade' });
    expect(links().map((l) => l.texto)).toEqual(['Política de privacidade']);
  });
});
