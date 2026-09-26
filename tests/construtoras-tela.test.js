// @vitest-environment jsdom
/**
 * Contas e acessos com construtoras (0021): a tela desenha a faixa de KPIs,
 * a lista de construtoras, os usuários da aberta (com o papel editável) e
 * as contas sem construtora. Sem a 0021 no banco, volta a tela de antes.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SUPA } from '../src/dados/supabase.js';
import { VIEWS } from '../src/ui/telas-obra.js';
import { ACOES } from '../src/ui/acoes.js';
import '../src/ui/telas-cadastros.js';

const CONTAS = [
  {
    usuario_id: 'a',
    email: 'gustavo@souz.com',
    empresa: 'Souz',
    eh_admin: true,
    bloqueado: false,
    empresa_id: 'souz',
    papel_empresa: 'gestor',
    obras: 5,
  },
  {
    usuario_id: 'b',
    email: 'cesar@sonho.com',
    empresa: 'Sonho Real',
    eh_admin: false,
    bloqueado: false,
    empresa_id: 'sonho',
    papel_empresa: 'gestor',
    obras: 1,
  },
  {
    usuario_id: 'c',
    email: 'eng@sonho.com',
    empresa: 'Sonho Real',
    eh_admin: false,
    bloqueado: false,
    empresa_id: 'sonho',
    papel_empresa: 'engenheiro',
    obras: 0,
  },
  {
    usuario_id: 'd',
    email: 'dono.casa@x.com',
    empresa: 'Sonho Real',
    eh_admin: false,
    bloqueado: false,
    empresa_id: 'sonho',
    papel_empresa: 'cliente',
    obras: 0,
  },
  {
    usuario_id: 'e',
    email: 'avulso@x.com',
    empresa: '',
    eh_admin: false,
    bloqueado: false,
    empresa_id: null,
    papel_empresa: null,
    obras: 0,
  },
];
const CONSTRUTORAS = [
  {
    id: 'sonho',
    nome: 'Construtora Sonho Real',
    cnpj: '11.222.333/0001-81',
    plano: 'ativo',
    limite_usuarios: 2,
    limite_obras: 10,
    bloqueada: false,
    usuarios: 2,
    usuarios_bloqueados: 0,
    clientes_finais: 1,
    obras: 1,
  },
  {
    id: 'souz',
    nome: 'Souz Engenharia',
    cnpj: null,
    plano: 'ativo',
    limite_usuarios: null,
    limite_obras: null,
    bloqueada: false,
    usuarios: 1,
    usuarios_bloqueados: 0,
    clientes_finais: 0,
    obras: 5,
  },
];

let original;
const esperar = () => new Promise((r) => setTimeout(r, 0));

async function desenhar(construtoras) {
  SUPA.lerConsumo = async () => CONTAS;
  SUPA.lerConstrutoras = async () => {
    if (construtoras === 'sem0021')
      throw new Error('Could not find the function public.admin_empresas');
    return construtoras;
  };
  document.body.innerHTML = '<div id="conteudo"></div>';
  /* "Atualizar" da tela: descarta o que já estava carregado */
  try {
    ACOES['admin-recarregar']();
  } catch {
    /* o redesenho da tela inteira não existe no jsdom — só a carga importa */
  }
  VIEWS.admin(); // dispara a carga
  await esperar();
  await esperar();
  return VIEWS.admin();
}

beforeAll(() => {
  original = {
    ehAdmin: SUPA.ehAdmin,
    lerConsumo: SUPA.lerConsumo,
    lerConstrutoras: SUPA.lerConstrutoras,
  };
  SUPA.ehAdmin = true;
});
afterAll(() => Object.assign(SUPA, original));

describe('Contas e acessos com construtoras', () => {
  it('KPIs, lista, usuários da aberta e contas sem construtora', async () => {
    const html = await desenhar(CONSTRUTORAS);
    const cx = document.createElement('div');
    cx.innerHTML = html;
    expect(cx.querySelector('[data-testid="lista-construtoras"]')).toBeTruthy();
    expect(cx.textContent).toContain('Acessos em uso');
    /* a primeira em ordem alfabética abre: Sonho Real, sem vaga (2 de 2) */
    const secao = cx.querySelector('[data-testid="usuarios-construtora"]');
    expect(secao.textContent).toContain('Construtora Sonho Real');
    expect(secao.textContent).toContain('2 de 2');
    expect(secao.textContent).toContain('Sem vaga');
    expect(secao.querySelectorAll('select[data-acao="admin-papel"]')).toHaveLength(3);
    /* gestor antes do engenheiro, cliente final por último */
    const emails = [...secao.querySelectorAll('tbody tr b')].map((b) => b.textContent);
    expect(emails).toEqual(['cesar@sonho.com', 'eng@sonho.com', 'dono.casa@x.com']);
    expect(cx.querySelector('[data-testid="contas-sem-construtora"]').textContent).toContain(
      'avulso@x.com',
    );
    expect(VIEWS.admin.toolbar()).toContain('Nova construtora');
    if (process.env.SOUZ_DUMP_ADMIN) {
      const fs = await import('node:fs');
      fs.writeFileSync(process.env.SOUZ_DUMP_ADMIN, html);
    }
  });

  it('sem a 0021 no banco: a tela de antes, conta por conta', async () => {
    const html = await desenhar('sem0021');
    expect(html).toContain('data-testid="lista-contas"');
    expect(html).not.toContain('lista-construtoras');
  });
});
