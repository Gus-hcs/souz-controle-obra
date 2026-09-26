/**
 * Construtoras (0021): a conta de empresa com limite de acessos. Vagas e
 * obras contra o contratado, o resumo da tela Contas e acessos e as
 * validações que espelham os CHECKs de empresas.
 */
import { describe, expect, it } from 'vitest';
import { obrasConstrutora, resumoConstrutoras, vagasConstrutora } from '../src/dominio/calculos.js';
import { apenasErros, validarConstrutora, validarNovoAcesso } from '../src/dominio/validacao.js';

const SENHA = 'Abcd-1234-xyz!';

describe('vagasConstrutora', () => {
  it('conta as vagas contra o limite, da linha do banco ou do app', () => {
    expect(vagasConstrutora({ usuarios: 3, limite_usuarios: 5 })).toMatchObject({
      usados: 3,
      limite: 5,
      livres: 2,
      cheia: false,
      texto: '3 de 5',
    });
    expect(vagasConstrutora({ usuarios: 5, limiteUsuarios: 5 })).toMatchObject({
      livres: 0,
      cheia: true,
    });
  });
  it('sem limite: nunca cheia, livres nulo', () => {
    const v = vagasConstrutora({ usuarios: 1, limite_usuarios: null });
    expect(v).toMatchObject({
      limite: null,
      livres: null,
      cheia: false,
      texto: '1 acesso · sem limite',
    });
  });
  it('acima do limite (limite baixado à mão no banco): cheia, livres zero', () => {
    expect(vagasConstrutora({ usuarios: 7, limite_usuarios: 5 })).toMatchObject({
      livres: 0,
      cheia: true,
    });
  });
});

describe('obrasConstrutora', () => {
  it('limite de obras da construtora', () => {
    expect(obrasConstrutora({ obras: 2, limite_obras: 10 })).toMatchObject({
      usadas: 2,
      livres: 8,
      cheia: false,
      texto: '2 de 10',
    });
    expect(obrasConstrutora({ obras: 0, limite_obras: 0 })).toMatchObject({ cheia: true });
    expect(obrasConstrutora({ obras: 4 }).texto).toBe('4 obras · sem limite');
  });
});

describe('resumoConstrutoras', () => {
  it('soma acessos, obras e o que pede atenção', () => {
    const r = resumoConstrutoras([
      {
        nome: 'Souz',
        plano: 'ativo',
        usuarios: 2,
        limite_usuarios: null,
        obras: 6,
        clientes_finais: 0,
      },
      {
        nome: 'Sonho Real',
        plano: 'ativo',
        usuarios: 5,
        limite_usuarios: 5,
        obras: 2,
        clientes_finais: 3,
      },
      { nome: 'Teste', plano: 'trial', usuarios: 1, limite_usuarios: 2, obras: 0 },
      {
        nome: 'Caloteira',
        plano: 'suspenso',
        bloqueada: true,
        usuarios: 1,
        limite_usuarios: 3,
        obras: 1,
      },
    ]);
    expect(r).toMatchObject({
      total: 4,
      ativas: 2,
      bloqueadas: 1,
      semVaga: 1,
      foraDoAtivo: 1,
      acessosUsados: 9,
      acessosContratados: 10,
      acessosUsadosComLimite: 7,
      semLimite: 1,
      obras: 9,
      clientesFinais: 3,
    });
  });
  it('lista vazia', () => {
    expect(resumoConstrutoras([])).toMatchObject({ total: 0, acessosUsados: 0, obras: 0 });
  });
});

describe('validarConstrutora', () => {
  const erros = (c, uso) => apenasErros(validarConstrutora(c, uso)).map((p) => p.campo);
  it('nome obrigatório e até 120 caracteres', () => {
    expect(erros({ nome: '  ' })).toEqual(['nome']);
    expect(erros({ nome: 'x'.repeat(121) })).toEqual(['nome']);
    expect(erros({ nome: 'Construtora Sonho Real' })).toEqual([]);
  });
  it('CNPJ com dígito verificador; vazio vale', () => {
    expect(erros({ nome: 'A', cnpj: '11.222.333/0001-81' })).toEqual([]);
    expect(erros({ nome: 'A', cnpj: '11.222.333/0001-00' })).toEqual(['cnpj']);
    expect(erros({ nome: 'A', cnpj: '' })).toEqual([]);
  });
  it('plano da lista', () => {
    expect(erros({ nome: 'A', plano: 'premium' })).toEqual(['plano']);
    expect(erros({ nome: 'A', plano: 'trial' })).toEqual([]);
  });
  it('limites: inteiros, vazio = sem limite, acesso ≥ 1, obra ≥ 0', () => {
    expect(erros({ nome: 'A', limiteUsuarios: '', limiteObras: '' })).toEqual([]);
    expect(erros({ nome: 'A', limiteUsuarios: 0 })).toEqual(['limiteUsuarios']);
    expect(erros({ nome: 'A', limiteUsuarios: 2.5 })).toEqual(['limiteUsuarios']);
    expect(erros({ nome: 'A', limiteObras: -1 })).toEqual(['limiteObras']);
    expect(erros({ nome: 'A', limiteUsuarios: 3, limiteObras: 0 })).toEqual([]);
  });
  it('não baixa o limite abaixo do que está em uso', () => {
    expect(
      erros({ nome: 'A', limiteUsuarios: 2, limiteObras: 1 }, { usuarios: 3, obras: 2 }),
    ).toEqual(['limiteUsuarios', 'limiteObras']);
    expect(
      erros({ nome: 'A', limiteUsuarios: 3, limiteObras: 2 }, { usuarios: 3, obras: 2 }),
    ).toEqual([]);
  });
});

describe('validarNovoAcesso', () => {
  const erros = (u, vagas) => apenasErros(validarNovoAcesso(u, vagas)).map((p) => p.campo);
  const cheia = vagasConstrutora({ usuarios: 5, limite_usuarios: 5 });
  const com = vagasConstrutora({ usuarios: 2, limite_usuarios: 5 });
  it('e-mail, senha forte e papel', () => {
    expect(erros({ email: 'eng@sonho.com', senha: SENHA, papel: 'engenheiro' }, com)).toEqual([]);
    expect(erros({ email: 'x', senha: SENHA, papel: 'engenheiro' }, com)).toEqual(['email']);
    expect(erros({ email: 'eng@sonho.com', senha: 'curta', papel: 'engenheiro' }, com)).toEqual([
      'senha',
    ]);
    expect(erros({ email: 'eng@sonho.com', senha: SENHA, papel: 'dono' }, com)).toEqual(['papel']);
  });
  it('sem vaga: gestor e engenheiro recusados; cliente final entra', () => {
    expect(erros({ email: 'a@b.com', senha: SENHA, papel: 'engenheiro' }, cheia)).toEqual([
      'papel',
    ]);
    expect(erros({ email: 'a@b.com', senha: SENHA, papel: 'gestor' }, cheia)).toEqual(['papel']);
    expect(erros({ email: 'a@b.com', senha: SENHA, papel: 'cliente' }, cheia)).toEqual([]);
  });
});
