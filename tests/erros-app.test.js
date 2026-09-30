/**
 * Erros do app (0026): o registro sai sem dado da obra, a validação espelha
 * os CHECKs da migração, cada erro vai uma vez por sessão e com teto, e o
 * admin vê os iguais agrupados.
 */
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dadosDoEvento, ligarMonitorErros, registroErroApp } from '../src/dados/erros.js';
import { LIMITES_ERRO_APP, validarErroApp } from '../src/dominio/validacao.js';
import { resumoErrosApp } from '../src/dominio/calculos.js';

const SQL = fs.readFileSync('db/migracoes/0026_erros_app.sql', 'utf8');

describe('registroErroApp: nada da obra sai do aparelho', () => {
  it('corta e-mail, CPF/CNPJ/telefone, consulta de URL e data: URI', () => {
    const r = registroErroApp({
      mensagem:
        'Falha ao salvar maria.souza@exemplo.com.br CPF 123.456.789-09 tel (62) 99876-5432 em https://x.supabase.co/storage/v1/object/sign/anexos/o1/nf.pdf?token=abc.def',
      origem: 'https://obras.souztech.com/index.html?v=1#painel:1:234567',
      pilha:
        'Error\n    at f (https://obras.souztech.com/index.html?token=segredo:1:1234567)\n    at data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA',
      tela: 'lancamentos',
      versao: 'a1b2c3d',
      navegador: 'Mozilla/5.0',
    });
    expect(r.mensagem).not.toMatch(/maria|123\.456|99876|token/);
    expect(r.mensagem).toMatch(/\[e-mail\].*\[número\].*\[número\].*nf\.pdf$/);
    expect(r.origem).toBe('https://obras.souztech.com/index.html');
    expect(r.pilha).not.toMatch(/segredo|iVBOR/);
    expect(r.pilha).toMatch(/index\.html/);
    expect(validarErroApp(r)).toEqual([]);
  });
  it('corta no tamanho do banco e zera tela fora do padrão', () => {
    const r = registroErroApp({
      mensagem: 'x'.repeat(5000),
      pilha: 'y'.repeat(9000),
      tela: '<script>',
      navegador: 'z'.repeat(900),
    });
    expect(r.mensagem.length).toBe(LIMITES_ERRO_APP.mensagem);
    expect(r.pilha.length).toBe(LIMITES_ERRO_APP.pilha);
    expect(r.navegador.length).toBe(LIMITES_ERRO_APP.navegador);
    expect(r.tela).toBe('');
    expect(validarErroApp(r)).toEqual([]);
  });
  it('erro sem mensagem ainda vira um registro válido', () => {
    expect(registroErroApp({}).mensagem).toBe('Erro sem mensagem');
  });
});

describe('validarErroApp espelha os CHECKs da 0026', () => {
  it('os limites do app são os mesmos da migração', () => {
    expect(SQL).toMatch(/btrim\(mensagem\)\) between 1 and (\d+)/);
    expect(Number(SQL.match(/btrim\(mensagem\)\) between 1 and (\d+)/)[1])).toBe(
      LIMITES_ERRO_APP.mensagem,
    );
    for (const campo of ['origem', 'pilha', 'versao', 'navegador']) {
      const m = SQL.match(new RegExp(`char_length\\(${campo}\\) <= (\\d+)`));
      expect(m && Number(m[1]), campo).toBe(LIMITES_ERRO_APP[campo]);
    }
    expect(SQL).toContain("tela ~ '^[a-z0-9-]{0,40}$'");
  });
  it('recusa mensagem vazia, campo longo e tela fora do padrão', () => {
    const campos = (r) => validarErroApp(r).map((p) => p.campo);
    expect(campos({ mensagem: '  ' })).toContain('mensagem');
    expect(campos({ mensagem: 'ok', origem: 'o'.repeat(201) })).toContain('origem');
    expect(campos({ mensagem: 'ok', tela: 'Painel da obra' })).toContain('tela');
    expect(validarErroApp({ mensagem: 'ok', tela: 'obra-config' })).toEqual([]);
  });
});

describe('dadosDoEvento: o que não é defeito do app fica de fora', () => {
  const erro = (message, stack = '') => Object.assign(new Error(message), { stack });
  it('erro de script: mensagem, arquivo:linha:coluna e pilha', () => {
    const d = dadosDoEvento({
      type: 'error',
      error: erro('x is not defined', 'ReferenceError'),
      filename: 'https://obras.souztech.com/index.html',
      lineno: 1,
      colno: 99,
    });
    expect(d).toMatchObject({
      mensagem: 'x is not defined',
      origem: 'https://obras.souztech.com/index.html:1:99',
    });
  });
  it('promessa rejeitada: origem tirada da pilha', () => {
    const d = dadosDoEvento({
      type: 'unhandledrejection',
      reason: erro(
        'falhou',
        'Error: falhou\n    at g (https://obras.souztech.com/index.html:1:5000)',
      ),
    });
    expect(d.origem).toBe('https://obras.souztech.com/index.html:1:5000');
  });
  it('ignora script de outro domínio, ResizeObserver, queda de rede e extensão', () => {
    expect(dadosDoEvento({ type: 'error', message: 'Script error.' })).toBeNull();
    expect(
      dadosDoEvento({
        type: 'error',
        message: 'ResizeObserver loop completed with undelivered notifications.',
      }),
    ).toBeNull();
    expect(
      dadosDoEvento({ type: 'unhandledrejection', reason: new TypeError('Failed to fetch') }),
    ).toBeNull();
    expect(
      dadosDoEvento({
        type: 'error',
        error: erro('boom'),
        filename: 'chrome-extension://abc/c.js',
        lineno: 1,
        colno: 1,
      }),
    ).toBeNull();
  });
});

describe('ligarMonitorErros', () => {
  const montar = (opcoes = {}) => {
    const alvo = new EventTarget();
    const enviados = [];
    const m = ligarMonitorErros({
      alvo,
      enviar: async (r) => {
        enviados.push(r);
      },
      tela: () => 'painel',
      versao: 'teste',
      navegador: 'vitest',
      ...opcoes,
    });
    const dispara = (msg) => {
      const ev = new Event('error');
      ev.error = new Error(msg);
      alvo.dispatchEvent(ev);
    };
    return { m, enviados, dispara };
  };
  const esperar = () => new Promise((r) => setTimeout(r, 0));

  it('o mesmo erro vai uma vez por sessão, com tela e versão', async () => {
    const { enviados, dispara } = montar();
    dispara('boom');
    dispara('boom');
    dispara('outro');
    await esperar();
    expect(enviados.map((r) => r.mensagem)).toEqual(['boom', 'outro']);
    expect(enviados[0]).toMatchObject({ tela: 'painel', versao: 'teste', navegador: 'vitest' });
  });
  it('no máximo `max` erros por sessão', async () => {
    const { enviados, dispara } = montar({ max: 3 });
    for (let i = 0; i < 10; i++) dispara('erro ' + i);
    await esperar();
    expect(enviados).toHaveLength(3);
  });
  it('sem rede ou sem conta não envia, e não gasta a vez', async () => {
    let pode = false;
    const { enviados, dispara } = montar({ podeEnviar: () => pode });
    dispara('boom');
    pode = true;
    dispara('boom');
    await esperar();
    expect(enviados).toHaveLength(1);
  });
  it('falha ao enviar desliga o monitor na sessão, sem lançar', async () => {
    let tentativas = 0;
    const { m, dispara } = montar({
      enviar: async () => {
        tentativas++;
        throw new Error('relation "public.erros_app" does not exist');
      },
    });
    dispara('a');
    await esperar();
    dispara('b');
    await esperar();
    expect(tentativas).toBe(1);
    expect(m.estado.desligado).toBe(true);
  });
  it('desligar() tira os ouvintes', async () => {
    const { m, enviados, dispara } = montar();
    m.desligar();
    dispara('boom');
    await esperar();
    expect(enviados).toHaveLength(0);
  });
});

describe('resumoErrosApp', () => {
  const agora = Date.parse('2026-09-29T12:00:00Z');
  const e = (mensagem, criado_em, usuario_id, tela = 'painel', versao = 'v1') => ({
    mensagem,
    origem: 'index.html:1:10',
    criado_em,
    usuario_id,
    tela,
    versao,
  });
  it('agrupa o mesmo erro, conta vezes e contas, o mais recente em cima', () => {
    const r = resumoErrosApp(
      [
        e('A', '2026-09-29T10:00:00Z', 'u1'),
        e('A', '2026-09-27T10:00:00Z', 'u2', 'fluxo', 'v0'),
        e('A', '2026-09-29T11:00:00Z', 'u1'),
        e('B', '2026-09-29T11:30:00Z', 'u3'),
      ],
      agora,
    );
    expect(r).toMatchObject({ total: 4, ultimas24h: 3, contas: 3 });
    expect(r.linhas.map((l) => l.mensagem)).toEqual(['B', 'A']);
    expect(r.linhas[1]).toMatchObject({
      vezes: 3,
      contas: 2,
      telas: ['fluxo', 'painel'],
      versoes: ['v0', 'v1'],
      primeiro: '2026-09-27T10:00:00Z',
      ultimo: '2026-09-29T11:00:00Z',
    });
  });
  it('lista vazia', () => {
    expect(resumoErrosApp([], agora)).toEqual({ total: 0, ultimas24h: 0, contas: 0, linhas: [] });
  });
});
