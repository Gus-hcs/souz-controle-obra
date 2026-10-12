// @vitest-environment jsdom
/**
 * A IA indisponível: chave ausente (503), função não publicada (404), cota
 * em zero, falha passageira e falta de rede. A regra é uma só para a nota
 * e para o "Perguntar": a pessoa lê uma frase em português, sem termo
 * técnico, e sabe o que fazer. As telas estão em ia-tela.test.js e
 * ia-assistente-tela.test.js.
 */
import { describe, expect, it } from 'vitest';
import { falhaIa, situacaoCotaIa } from '../src/dominio/calculos.js';
import { SUPA } from '../src/dados/supabase.js';

const TECNICO =
  /\b(503|404|500|502|json|token|chave|api|secret|função|function|http|servidor|edge)\b/i;
const resposta = (status, corpo) => ({
  status,
  json: async () => {
    if (corpo === undefined) throw new SyntaxError('Unexpected token <');
    return corpo;
  },
});

describe('falhaIa: o motivo e a frase para a pessoa', () => {
  it('chave ausente (503) ou função não publicada (404): fora do ar, sem tentar de novo', () => {
    for (const status of [503, 404]) {
      for (const tarefa of ['nota', 'pergunta']) {
        const f = falhaIa({ status, erro: 'A IA ainda não foi configurada.' }, tarefa);
        expect(f).toMatchObject({ motivo: 'fora-do-ar', foraDoAr: true });
        expect(f.mensagem).toMatch(/indisponível no momento/);
      }
    }
    expect(falhaIa({ status: 503 }, 'nota').mensagem).toMatch(/Lance à mão/);
    expect(falhaIa({ status: 503 }, 'pergunta').mensagem).toMatch(/continuam nas telas/);
  });

  it('cota, limite por hora e IA desligada (4xx): vale a frase que a função mandou', () => {
    const cota = falhaIa(
      { status: 429, erro: 'As perguntas deste mês acabaram. Fale com o gestor.' },
      'pergunta',
    );
    expect(cota).toMatchObject({ motivo: 'limite', foraDoAr: false });
    expect(cota.mensagem).toMatch(/acabaram/);
    expect(falhaIa({ status: 403, erro: 'O período de teste da IA terminou.' }).motivo).toBe(
      'sem-acesso',
    );
    expect(falhaIa({ status: 422, erro: 'A leitura veio incompleta. Tente de novo.' }).motivo).toBe(
      'pedido',
    );
  });

  it('erro interno, gateway ou 4xx sem frase: passageiro, tente de novo', () => {
    for (const status of [500, 502, 504, 418]) {
      const f = falhaIa({
        status,
        erro: status === 500 ? 'Função sem configuração de ambiente.' : '',
      });
      expect(f).toMatchObject({ motivo: 'temporario', foraDoAr: false });
      expect(f.mensagem).toMatch(/Tente de novo/);
    }
  });

  it('sem resposta: rede; sessão vencida: entrar de novo', () => {
    expect(falhaIa({}, 'nota')).toMatchObject({ motivo: 'rede', foraDoAr: false });
    expect(falhaIa(undefined, 'pergunta').mensagem).toMatch(/Sem conexão/);
    expect(falhaIa({ status: 401, erro: 'Sem credencial.' }).mensagem).toMatch(/sessão expirou/);
  });

  it('nenhuma frase própria tem termo técnico', () => {
    for (const tarefa of ['nota', 'pergunta']) {
      for (const status of [0, 401, 404, 500, 502, 503, 504]) {
        expect(falhaIa({ status, erro: 'x' }, tarefa).mensagem).not.toMatch(TECNICO);
      }
    }
  });
});

describe('cota em zero: o recurso não está no plano', () => {
  it('semCota só com a IA ligada e a cota em zero; sem aviso de "0 de 0"', () => {
    expect(situacaoCotaIa({ ligada: true, cota_notas: 0, usado_notas: 0 })).toMatchObject({
      ligada: true,
      semCota: true,
      esgotada: true,
      aviso: false,
    });
    expect(situacaoCotaIa({ ligada: true, cota_notas: 60, usado_notas: 60 }).semCota).toBe(false);
    expect(situacaoCotaIa({ ligada: false }).semCota).toBe(false);
    expect(situacaoCotaIa(null).semCota).toBe(false);
  });
});

describe('SUPA: o erro da função vira frase para a pessoa', () => {
  const comFuncao = async (erro, chamada) => {
    const antes = SUPA.sb;
    SUPA.sb = { functions: { invoke: async () => ({ data: null, error: erro }) } };
    try {
      await chamada();
      throw new Error('devia ter falhado');
    } catch (e) {
      return e;
    } finally {
      SUPA.sb = antes;
    }
  };
  const nota = () => SUPA.lerNotaComIa('o1', 'storage:o1/lancamentos/x.jpg', {});
  const pergunta = () => SUPA.perguntarIa({ tarefa: 'pergunta', pergunta: 'Como está?' });

  it('503 com a frase da função: fora do ar, sem repetir "não foi configurada"', async () => {
    const erro = {
      message: 'Edge Function returned a non-2xx status code',
      context: resposta(503, { erro: 'A IA ainda não foi configurada.' }),
    };
    const n = await comFuncao(erro, nota);
    expect(n).toMatchObject({ motivo: 'fora-do-ar', foraDoAr: true });
    expect(n.message).not.toMatch(/configurada|non-2xx|Edge/);
    const p = await comFuncao(erro, pergunta);
    expect(p.message).toMatch(/assistente está indisponível/);
  });

  it('429 com a frase da cota: passa adiante', async () => {
    const e = await comFuncao(
      {
        message: 'non-2xx',
        context: resposta(429, {
          erro: 'As leituras de nota deste mês acabaram. Lance à mão ou fale com o gestor.',
        }),
      },
      nota,
    );
    expect(e.message).toMatch(/acabaram/);
    expect(e.foraDoAr).toBe(false);
  });

  it('resposta sem JSON (página de erro do gateway): vale o status', async () => {
    const e = await comFuncao({ message: 'non-2xx', context: resposta(502) }, pergunta);
    expect(e.motivo).toBe('temporario');
    expect(e.message).not.toMatch(/Unexpected|token/);
  });

  it('pedido que nem saiu (rede): sem o texto do navegador', async () => {
    const e = await comFuncao(
      {
        message: 'Failed to send a request to the Edge Function',
        context: new TypeError('Failed to fetch'),
      },
      nota,
    );
    expect(e.motivo).toBe('rede');
    expect(e.message).not.toMatch(/Failed|Edge|fetch/);
  });
});
