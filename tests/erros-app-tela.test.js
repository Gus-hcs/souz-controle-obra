// @vitest-environment jsdom
/**
 * Contas e acessos: o bloco "Erros do app" (0026) mostra os erros iguais
 * numa linha, com vezes, contas, tela e versão; sem a 0026 no banco, avisa
 * que falta a migração em vez de quebrar a tela.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SUPA } from '../src/dados/supabase.js';
import { VIEWS } from '../src/ui/telas-obra.js';
import { ACOES } from '../src/ui/acoes.js';
import '../src/ui/telas-cadastros.js';

const CONSTRUTORAS = [
  {
    id: 'sonho',
    nome: 'Construtora Sonho Real',
    plano: 'ativo',
    limite_usuarios: 2,
    limite_obras: 10,
    usuarios: 1,
    obras: 1,
  },
];
const agora = new Date();
const haMin = (m) => new Date(agora.getTime() - m * 60000).toISOString();
const ERROS = [
  {
    id: '1',
    criado_em: haMin(5),
    usuario_id: 'u1',
    mensagem: 'x is not defined',
    origem: 'https://obras.souztech.com/index.html:1:999',
    tela: 'painel',
    versao: 'a1b2c3d',
  },
  {
    id: '2',
    criado_em: haMin(50),
    usuario_id: 'u2',
    mensagem: 'x is not defined',
    origem: 'https://obras.souztech.com/index.html:1:999',
    tela: 'fluxo',
    versao: 'a1b2c3d',
  },
  {
    id: '3',
    criado_em: haMin(30),
    usuario_id: 'u1',
    mensagem: 'Cannot read properties of undefined',
    origem: '',
    tela: 'diario',
    versao: 'a1b2c3d',
  },
];

let original;
const esperar = () => new Promise((r) => setTimeout(r, 0));
async function desenhar(lerErros) {
  SUPA.lerErrosApp = lerErros;
  try {
    ACOES['admin-erros-recarregar']();
  } catch {
    /* o redesenho da tela inteira não existe no jsdom */
  }
  VIEWS.admin();
  await esperar();
  await esperar();
  const cx = document.createElement('div');
  cx.innerHTML = VIEWS.admin();
  if (process.env.SOUZ_DUMP_ERROS && cx.querySelector('[data-testid="lista-erros-app"]')) {
    const fs = await import('node:fs');
    fs.writeFileSync(process.env.SOUZ_DUMP_ERROS, cx.innerHTML);
  }
  return cx.querySelector('[data-testid="erros-app"]');
}

beforeAll(() => {
  original = {
    ehAdmin: SUPA.ehAdmin,
    lerConsumo: SUPA.lerConsumo,
    lerConstrutoras: SUPA.lerConstrutoras,
    lerErrosApp: SUPA.lerErrosApp,
  };
  SUPA.ehAdmin = true;
  SUPA.lerConsumo = async () => [];
  SUPA.lerConstrutoras = async () => CONSTRUTORAS;
  document.body.innerHTML = '<div id="conteudo"></div>';
});
afterAll(() => Object.assign(SUPA, original));

describe('Erros do app na tela do admin', () => {
  it('o mesmo erro numa linha, com vezes, contas, telas e versão', async () => {
    const secao = await desenhar(async () => ERROS);
    expect(secao).toBeTruthy();
    expect(secao.querySelector('h3').textContent).toContain('3 nas últimas 24 h');
    expect(secao.querySelector('h3').textContent).toContain('2 contas');
    const linhas = [...secao.querySelectorAll('tbody tr')];
    expect(linhas).toHaveLength(2);
    const primeira = linhas[0].querySelectorAll('td');
    expect(primeira[0].textContent).toContain('x is not defined');
    expect(primeira[0].textContent).toContain('index.html:1:999');
    expect(primeira[1].textContent).toContain('fluxo, painel');
    expect(primeira[2].textContent.trim()).toBe('2');
    expect(primeira[3].textContent.trim()).toBe('2');
    expect(secao.querySelector('[data-acao="admin-erros-limpar"]')).toBeTruthy();
  });
  it('sem erros: frase no lugar da tabela, sem "Limpar"', async () => {
    const secao = await desenhar(async () => []);
    expect(secao.querySelector('table')).toBeNull();
    expect(secao.textContent).toContain('Nenhum erro registrado');
    expect(secao.querySelector('[data-acao="admin-erros-limpar"]')).toBeNull();
  });
  it('sem a 0026 no banco: avisa que falta a migração', async () => {
    const secao = await desenhar(async () => {
      throw new Error('relation "public.erros_app" does not exist');
    });
    expect(secao.textContent).toContain('Aplique a migração 0026');
  });
});
