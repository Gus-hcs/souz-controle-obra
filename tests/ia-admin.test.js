// @vitest-environment jsdom
/**
 * Contas e acessos: a IA de cada construtora (0027) — a linha com a
 * situação e o uso do mês, e o formulário do admin que liga, define a cota
 * e o prazo do teste, validado antes de ir ao banco.
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
    limite_usuarios: 3,
    limite_obras: 10,
    usuarios: 1,
    obras: 2,
  },
];
const mes = new Date().toISOString().slice(0, 7);
let gravado = null;
let original;
const esperar = () => new Promise((r) => setTimeout(r, 0));

beforeAll(() => {
  original = { ...SUPA };
  SUPA.ehAdmin = true;
  SUPA.lerConsumo = async () => [];
  SUPA.lerConstrutoras = async () => CONSTRUTORAS;
  SUPA.lerErrosApp = async () => [];
  SUPA.lerIaAdmin = async () => [
    {
      empresa_id: 'sonho',
      usuario_id: null,
      ligada: true,
      cota_notas: 600,
      cota_textos: 600,
      extra_notas: 50,
      extra_mes: mes,
      valida_ate: '2026-10-14',
      usado_notas: 42,
      usado_textos: 7,
      custo_usd_mes: 0.83,
    },
  ];
  SUPA.adminDefinirIa = async (v) => {
    gravado = v;
  };
  document.body.innerHTML =
    '<div id="conteudo"></div><div id="modal-camada"></div><div id="toasts"></div>';
});
afterAll(() => Object.assign(SUPA, original));

async function tela() {
  VIEWS.admin();
  for (let i = 0; i < 4; i++) await esperar();
  VIEWS.admin();
  for (let i = 0; i < 4; i++) await esperar();
  const cx = document.createElement('div');
  cx.innerHTML = VIEWS.admin();
  return cx;
}

describe('IA em Contas e acessos', () => {
  it('a construtora mostra IA ligada, uso do mês (com as notas a mais), custo e prazo', async () => {
    const cx = await tela();
    const linha = cx.querySelector('[data-testid="ia-construtora"]').textContent;
    expect(linha).toContain('IA ligada');
    expect(linha).toContain('42 de 650 notas este mês');
    expect(linha).toContain('7 de 600 textos');
    expect(linha).toContain('US$ 0.83');
    expect(linha).toContain('até 14/10/2026');
    expect(cx.querySelector('[data-acao="admin-ia"][data-empresa="sonho"]')).toBeTruthy();
  });

  it('o formulário valida e grava ligada, cota e prazo', async () => {
    await tela();
    ACOES['admin-ia'](null, { empresa: 'sonho' });
    const f = document.querySelector('#modal-camada [data-form]');
    expect(f).toBeTruthy();
    expect(f.querySelector('#f_cotaNotas').value).toMatch(/600/);
    /* cota negativa: não grava */
    f.querySelector('#f_cotaNotas').value = '-5';
    ACOES['salvar-form']();
    await esperar();
    expect(gravado).toBeNull();
    f.querySelector('#f_cotaNotas').value = '300';
    f.querySelector('#f_ligada').value = 'Desligada';
    ACOES['salvar-form']();
    for (let i = 0; i < 3; i++) await esperar();
    expect(gravado).toMatchObject({
      empresaId: 'sonho',
      usuarioId: null,
      ligada: false,
      cotaNotas: 300,
    });
  });
});
