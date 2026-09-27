// @vitest-environment jsdom
/**
 * Diário no canteiro sem rede (Onda 4): a gravação no banco que falha
 * por falta de rede fica pendente no aparelho e é reenviada quando a
 * rede volta. Erro que não é de rede continua sendo erro.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CHAVE_BASE_OFFLINE, Store, erroDeRede } from '../src/dados/store.js';
import { SUPA } from '../src/dados/supabase.js';
import { estadoInicial } from '../src/nucleo/base.js';
import { ACOES } from '../src/ui/acoes.js';

describe('erro de rede', () => {
  it('reconhece as mensagens de falta de rede dos navegadores', () => {
    expect(erroDeRede(new Error('Failed to fetch'))).toBe(true);
    expect(erroDeRede(new Error('NetworkError when attempting to fetch resource.'))).toBe(true);
    expect(erroDeRede('Load failed')).toBe(true);
    expect(erroDeRede(new Error('new row violates check constraint'))).toBe(false);
  });
});

describe('Store sem rede', () => {
  const original = SUPA.sincronizar;

  beforeEach(() => {
    document.body.innerHTML = '<div id="toasts"></div>';
    localStorage.clear();
    Store.backend = 'supabase';
    Store.estado = estadoInicial();
    Store.snapshot = estadoInicial();
    Store.estado.empresa.nome = 'Mudou sem rede';
    Store.pendente = true;
    Store.esperandoRede = false;
  });

  afterEach(() => {
    SUPA.sincronizar = original;
    Store.backend = 'local';
  });

  it('falha de rede: fica pendente, guarda a base e não mostra erro', async () => {
    SUPA.sincronizar = async () => {
      throw new Error('Failed to fetch');
    };
    await Store.salvar();
    expect(Store.status).toBe('offline');
    expect(Store.pendente).toBe(true);
    expect(localStorage.getItem(CHAVE_BASE_OFFLINE)).toBeTruthy();
    expect(Store.descricaoStatus().texto).toMatch(/sem rede/);
  });

  it('a rede volta: envia a diferença e apaga a base guardada', async () => {
    let chamadas = 0;
    SUPA.sincronizar = async () => {
      chamadas++;
      if (chamadas === 1) throw new Error('Failed to fetch');
    };
    await Store.salvar();
    expect(Store.status).toBe('offline');
    window.dispatchEvent(new Event('online'));
    await new Promise((r) => setTimeout(r, 0));
    expect(chamadas).toBe(2);
    expect(Store.status).toBe('ok');
    expect(localStorage.getItem(CHAVE_BASE_OFFLINE)).toBeNull();
  });

  it('erro que não é de rede continua sendo erro', async () => {
    SUPA.sincronizar = async () => {
      throw new Error('new row violates check constraint "chk_receb_exigido"');
    };
    await Store.salvar();
    expect(Store.status).toBe('erro');
    expect(Store.pendente).toBe(false);
  });
});

/* Auditoria A-06 e M-01: a cópia do aparelho que não cabe avisa, e sair
   com alteração que não chegou ao banco pede confirmação digitada. */
describe('cópia do aparelho e sair sem rede', () => {
  const original = { sair: SUPA.sair, sincronizar: SUPA.sincronizar, setItem: Storage.prototype.setItem };
  let saiu;

  beforeEach(() => {
    document.body.innerHTML = '<div id="modal-camada"></div><div id="toasts"></div>';
    localStorage.clear();
    Store.backend = 'supabase';
    Store.estado = estadoInicial();
    Store.snapshot = estadoInicial();
    Store.pendente = false;
    Store.localCheio = false;
    saiu = 0;
    SUPA.sair = async () => {
      saiu++;
    };
  });

  afterEach(() => {
    SUPA.sair = original.sair;
    SUPA.sincronizar = original.sincronizar;
    Storage.prototype.setItem = original.setItem;
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    Store.backend = 'local';
    Store.pendente = false;
  });

  it('cota cheia: avisa uma vez, em vez de engolir o erro', () => {
    Storage.prototype.setItem = () => {
      throw new DOMException('cheio', 'QuotaExceededError');
    };
    Store.gravarLocal('{"x":1}');
    Store.gravarLocal('{"x":2}');
    const avisos = [...document.querySelectorAll('#toasts .toast')];
    expect(avisos).toHaveLength(1);
    expect(avisos[0].textContent).toMatch(/modo sem rede deste aparelho está cheio/);
  });

  it('sem rede e com alteração pendente: pede SAIR digitado e não apaga nada', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    Store.pendente = true;
    localStorage.setItem(CHAVE_BASE_OFFLINE, '{}');
    await ACOES['auth-sair-simples']();
    const modal = document.getElementById('modal-camada');
    expect(modal.classList.contains('aberto')).toBe(true);
    expect(modal.textContent).toMatch(/Digite SAIR para confirmar/);
    expect(saiu).toBe(0);
    expect(localStorage.getItem(CHAVE_BASE_OFFLINE)).toBe('{}');
  });

  it('com rede: envia o pendente antes e sai sem perguntar', async () => {
    let enviados = 0;
    SUPA.sincronizar = async () => {
      enviados++;
    };
    Store.pendente = true;
    await ACOES['auth-sair-simples']();
    expect(enviados).toBe(1);
    expect(saiu).toBe(1);
    expect(document.getElementById('modal-camada').classList.contains('aberto')).toBe(false);
  });
});
