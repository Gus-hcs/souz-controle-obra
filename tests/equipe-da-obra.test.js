// @vitest-environment jsdom
/**
 * Equipe da obra (Configuração da obra) depois da 0023: em obra de
 * construtora a equipe vem da construtora, sem controle de papel nem de
 * remoção — só o cliente convidado pode sair; "(você)" só na linha de quem
 * entrou. Sem a 0023 (membros_da_obra sem origem) a tabela é a de antes.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { SUPA } from '../src/dados/supabase.js';
import { Equipe, equipeHTML } from '../src/ui/telas/obra-config.js';

const OBRA = { id: 'o1' };
const mostrar = (linhas) => {
  Equipe.obraId = OBRA.id;
  Equipe.linhas = linhas;
  Equipe.erro = '';
  Equipe.carregando = false;
  const div = document.createElement('div');
  div.innerHTML = equipeHTML(OBRA);
  return div;
};
const guardado = { usuario: SUPA.usuario, construtora: SUPA.construtora };
afterEach(() => {
  SUPA.usuario = guardado.usuario;
  SUPA.construtora = guardado.construtora;
});

describe('equipe da obra', () => {
  it('obra de construtora: equipe da construtora sem controle, cliente só com remover', () => {
    SUPA.usuario = { id: 'g1' };
    SUPA.construtora = { nome: 'Construtora A', papel: 'gestor' };
    const div = mostrar([
      {
        id: 'g1',
        usuario_id: 'g1',
        email: 'gestor@exemplo.com',
        papel: 'dono',
        origem: 'construtora:gestor',
      },
      {
        id: 'e1',
        usuario_id: 'e1',
        email: 'eng@exemplo.com',
        papel: 'dono',
        origem: 'construtora:engenheiro',
      },
      {
        id: 'm1',
        usuario_id: 'c1',
        email: 'cliente@exemplo.com',
        papel: 'cliente',
        origem: 'obra',
      },
    ]);
    const linhas = [...div.querySelectorAll('tbody tr')];
    expect(linhas).toHaveLength(3);
    expect(linhas[0].textContent).toContain('Gestor da construtora');
    expect(linhas[0].textContent).toContain('(você)');
    expect(linhas[1].textContent).toContain('Engenheiro da construtora');
    expect(linhas[1].textContent).not.toContain('(você)');
    expect(linhas[0].querySelector('[data-acao]')).toBeNull();
    expect(linhas[1].querySelector('[data-acao]')).toBeNull();
    /* o cliente: sai com o botão, mas não vira engenheiro (o banco recusa) */
    expect(linhas[2].textContent).toContain('Cliente');
    expect(linhas[2].querySelector('select[data-acao="equipe-papel"]')).toBeNull();
    expect(linhas[2].querySelector('[data-acao="equipe-remover"]').dataset.id).toBe('m1');
  });

  it('obra avulsa com a 0023: dono é "você" só se for você; os outros com controle', () => {
    SUPA.usuario = { id: 'd1' };
    SUPA.construtora = null;
    const div = mostrar([
      { id: 'm0', usuario_id: 'd1', email: 'dono@exemplo.com', papel: 'dono', origem: 'obra' },
      { id: 'm1', usuario_id: 'e1', email: 'eng@exemplo.com', papel: 'engenheiro', origem: 'obra' },
    ]);
    const linhas = [...div.querySelectorAll('tbody tr')];
    expect(linhas[0].textContent).toContain('Dono');
    expect(linhas[0].textContent).toContain('(você)');
    expect(linhas[1].querySelector('select[data-acao="equipe-papel"]')).not.toBeNull();
    expect(linhas[1].querySelector('[data-acao="equipe-remover"]')).not.toBeNull();
  });

  it('sem a 0023 (sem origem): a tabela de antes', () => {
    SUPA.usuario = { id: 'd1' };
    SUPA.construtora = null;
    const div = mostrar([
      { id: 'm0', usuario_id: 'd1', email: 'dono@exemplo.com', papel: 'dono' },
      { id: 'm1', usuario_id: 'c1', email: 'cli@exemplo.com', papel: 'cliente' },
    ]);
    const linhas = [...div.querySelectorAll('tbody tr')];
    expect(linhas[0].textContent).toContain('(você)');
    expect(linhas[1].querySelector('select[data-acao="equipe-papel"]')).not.toBeNull();
  });
});
