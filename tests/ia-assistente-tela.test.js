// @vitest-environment jsdom
/**
 * "Perguntar" na tela (IA, 0028): quem vê o botão, o painel com as
 * sugestões da tela aberta, a conversa até a resposta (número em negrito e
 * botão "Abrir <tela>") e os casos de erro — sem rede, cota esgotada e
 * falha da função. A função `ia` é simulada; as ferramentas são as reais.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Store } from '../src/dados/store.js';
import { SUPA } from '../src/dados/supabase.js';
import { App } from '../src/ui/shell.js';
import { ACOES } from '../src/ui/acoes.js';
import { Assist } from '../src/ui/telas/assistente.js';
import { estadoDemo } from './fixture.js';

let salvo;
beforeAll(() => {
  salvo = {
    backend: Store.backend,
    estado: Store.estado,
    renderTopo: App.renderTopo,
    usuario: SUPA.usuario,
    construtora: SUPA.construtora,
    perguntarIa: SUPA.perguntarIa,
    situacaoPerguntas: SUPA.situacaoPerguntas,
  };
  App.renderTopo = () => {};
});
afterAll(() => {
  Object.assign(Store, { backend: salvo.backend, estado: salvo.estado });
  App.renderTopo = salvo.renderTopo;
  Object.assign(SUPA, {
    usuario: salvo.usuario,
    construtora: salvo.construtora,
    perguntarIa: salvo.perguntarIa,
    situacaoPerguntas: salvo.situacaoPerguntas,
  });
});

let obra;
beforeEach(() => {
  document.body.innerHTML = '<div id="modal-camada"></div><div id="toasts"></div>';
  Store.backend = 'supabase';
  Store.estado = estadoDemo();
  obra = Store.estado.obras[0];
  App.rota = { view: 'painel', obraId: obra.id };
  SUPA.usuario = { id: 'u1', email: 'eng@exemplo.com' };
  SUPA.construtora = { id: 'e1', nome: 'Construtora', papel: 'engenheiro' };
  Object.assign(Assist, {
    situacao: { ligada: true, cota_perguntas: 50, usado_perguntas: 3 },
    aberto: false,
    ocupado: false,
    conversa: [],
  });
});
const esperar = () => new Promise((r) => setTimeout(r, 0));

describe('quem vê o botão "Perguntar"', () => {
  it('equipe com a IA ligada vê o botão; no celular aparece o botão redondo', () => {
    expect(App.botaoTopo()).toContain('data-acao="assistente-abrir"');
  });
  it('IA desligada: o gestor vê o convite com cadeado; o engenheiro, nada', () => {
    Assist.situacao = { ligada: false };
    expect(App.botaoTopo()).toBe('');
    SUPA.construtora.papel = 'gestor';
    expect(App.botaoTopo()).toContain('data-acao="assistente-convite"');
  });
  it('cliente final, sem banco ou sem login: nada', () => {
    SUPA.construtora.papel = 'cliente';
    expect(App.botaoTopo()).toBe('');
    SUPA.construtora.papel = 'engenheiro';
    Store.backend = 'local';
    expect(App.botaoTopo()).toBe('');
    Store.backend = 'supabase';
    SUPA.usuario = null;
    expect(App.botaoTopo()).toBe('');
  });
  it('a situação vem do banco uma vez', async () => {
    let n = 0;
    SUPA.situacaoPerguntas = async () => {
      n++;
      return { ligada: true, cota_perguntas: 50, usado_perguntas: 0 };
    };
    Assist.situacao = undefined;
    expect(App.botaoTopo()).toBe('');
    App.botaoTopo();
    await esperar();
    expect(n).toBe(1);
    expect(App.botaoTopo()).toContain('assistente-abrir');
    expect(document.getElementById('assistente-fab')).toBeTruthy();
  });
});

describe('o painel e a conversa', () => {
  it('abre com as sugestões da tela aberta', () => {
    ACOES['assistente-abrir']();
    const p = document.getElementById('assistente');
    expect(p.getAttribute('role')).toBe('dialog');
    expect(p.textContent).toContain('O que está atrasado?');
    App.rota = { view: 'lancamentos', obraId: obra.id };
    ACOES['assistente-fechar']();
    ACOES['assistente-abrir']();
    expect(document.getElementById('assistente').textContent).toContain(
      'Quanto gastei de cimento?',
    );
  });

  it('pergunta → ferramentas no navegador → resposta com negrito e "Abrir"', async () => {
    const pedidos = [];
    SUPA.perguntarIa = async (corpo) => {
      pedidos.push(corpo);
      if (!corpo.id) {
        return {
          id: 'uso-1',
          estado: 'ferramentas',
          mensagens: [
            { role: 'user', content: [{ type: 'text', text: 'x' }] },
            { role: 'assistant', content: [] },
          ],
          pedidos: [{ id: 'tu_1', nome: 'cronograma', args: {} }],
        };
      }
      const resultado = JSON.parse(corpo.mensagens.at(-1).content[0].content);
      return {
        id: 'uso-1',
        estado: 'resposta',
        seguro: true,
        resposta: `São **${resultado.quantidade}** etapas atrasadas.`,
      };
    };
    ACOES['assistente-abrir']();
    ACOES['assistente-sugestao'](null, { texto: 'O que está atrasado?' });
    for (let i = 0; i < 6; i++) await esperar();
    expect(pedidos[0]).toMatchObject({ tarefa: 'pergunta', pergunta: 'O que está atrasado?' });
    expect(pedidos[0].contexto).toMatchObject({
      tela: 'painel',
      obraId: obra.id,
      obraNome: obra.nome,
    });
    const conversa = document.querySelector('[data-testid="assistente-conversa"]');
    expect(conversa.querySelector('.assistente-msg.pessoa').textContent).toBe(
      'O que está atrasado?',
    );
    const resposta = conversa.querySelector('.assistente-msg.ia');
    expect(resposta.querySelector('b').textContent).toMatch(/^\d+$/);
    expect(resposta.querySelector('[data-acao="assistente-ir"]').dataset).toMatchObject({
      view: 'cronograma',
      obra: obra.id,
    });
    expect(Assist.situacao.usado_perguntas).toBe(4);
  });

  it('erro da função vira mensagem na conversa; o painel volta a aceitar pergunta', async () => {
    SUPA.perguntarIa = async () => {
      throw new Error('As perguntas deste mês acabaram. Fale com o gestor.');
    };
    ACOES['assistente-abrir']();
    document.getElementById('assistente-texto').value = 'Como está a obra?';
    ACOES['assistente-enviar']();
    for (let i = 0; i < 4; i++) await esperar();
    const erro = document.querySelector('.assistente-msg.erro');
    expect(erro.textContent).toMatch(/acabaram/);
    expect(document.getElementById('assistente-texto').disabled).toBe(false);
  });

  it('cota esgotada: nem chama a função', async () => {
    let chamou = false;
    SUPA.perguntarIa = async () => {
      chamou = true;
    };
    Assist.situacao = { ligada: true, cota_perguntas: 50, usado_perguntas: 50 };
    ACOES['assistente-abrir']();
    ACOES['assistente-sugestao'](null, { texto: 'Como está esta obra?' });
    await esperar();
    expect(chamou).toBe(false);
    expect(document.querySelector('.assistente-msg.erro').textContent).toMatch(/acabaram/);
  });

  it('resposta que não passou na conferência aparece marcada', async () => {
    SUPA.perguntarIa = async () => ({
      id: 'uso-2',
      estado: 'resposta',
      seguro: false,
      resposta: 'Não consegui conferir os números desta resposta.',
    });
    ACOES['assistente-abrir']();
    ACOES['assistente-sugestao'](null, { texto: 'Como está esta obra?' });
    for (let i = 0; i < 4; i++) await esperar();
    expect(document.querySelector('.assistente-msg.inseguro')).toBeTruthy();
  });
});
