// @vitest-environment jsdom
/**
 * Concorrência (docs/SINCRONIZACAO.md, opção 2): a linha só é alterada ou
 * apagada se o banco ainda estiver na versão que este aparelho carregou
 * (atualizado_em). Outra pessoa gravou antes → conflito, nada é
 * sobrescrito nem ressuscitado.
 *
 * O banco aqui é falso, em memória, com a mesma API encadeada do
 * supabase-js que o sincronizar usa.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { SUPA } from '../src/dados/supabase.js';
import { estadoInicial, novaObra, novoLancamento } from '../src/nucleo/base.js';

let relogio = 0;
const agora = () => `2026-09-25T10:00:${String(++relogio).padStart(2, '0')}.000000+00:00`;

function bancoFalso() {
  const tabelas = new Map();
  const tab = (n) => {
    if (!tabelas.has(n)) tabelas.set(n, new Map());
    return tabelas.get(n);
  };
  const consulta = (nome) => {
    const filtros = [];
    let acao = null;
    let carga = null;
    const casa = (r) => filtros.every(([c, v]) => (Array.isArray(v) ? v.includes(r[c]) : r[c] === v));
    const q = {
      upsert(linhas) { acao = 'upsert'; carga = linhas; return q; },
      update(linha) { acao = 'update'; carga = linha; return q; },
      delete() { acao = 'delete'; return q; },
      select() { if (!acao) acao = 'select'; return q; },
      eq(c, v) { filtros.push([c, v]); return q; },
      in(c, v) { filtros.push([c, v]); return q; },
      then(ok) {
        const t = tab(nome);
        let data = [];
        if (acao === 'upsert') {
          data = carga.map((l) => { const r = { ...l, atualizado_em: agora() }; t.set(l.id, r); return r; });
        } else if (acao === 'update') {
          [...t.values()].filter(casa).forEach((r) => {
            const novo = { ...r, ...carga, atualizado_em: agora() };
            t.set(r.id, novo);
            data.push(novo);
          });
        } else if (acao === 'delete') {
          [...t.values()].filter(casa).forEach((r) => { t.delete(r.id); data.push(r); });
        } else {
          data = [...t.values()].filter(casa);
        }
        return Promise.resolve({ data, error: null }).then(ok);
      },
    };
    return q;
  };
  return { from: consulta, tab };
}

/* estado com uma obra e um lançamento, já "carregado" do banco (versões) */
function cenario() {
  const db = bancoFalso();
  SUPA.sb = db;
  SUPA.usuario = { id: 'u1', email: 'a@x.com' };
  SUPA.indisponiveis = new Set();
  const e = estadoInicial();
  const o = novaObra('Casa');
  const l = { ...novoLancamento(), descricao: 'Cimento', precoUnitario: 10 };
  o.lancamentos.push(l);
  e.obras.push(o);
  return { db, e };
}
const clone = (x) => JSON.parse(JSON.stringify(x));

describe('sincronizar com carimbo de versão', () => {
  beforeEach(() => { relogio = 0; });

  it('linha nova grava e o item recebe a versão do banco', async () => {
    const { e } = cenario();
    await SUPA.sincronizar(clone(estadoInicial()), e);
    expect(e.obras[0].lancamentos[0].versao).toMatch(/^2026-09-25T10:00/);
  });

  it('alteração com a versão certa grava e atualiza a versão', async () => {
    const { db, e } = cenario();
    await SUPA.sincronizar(clone(estadoInicial()), e);
    const antes = clone(e);
    e.obras[0].lancamentos[0].precoUnitario = 12;
    const r = await SUPA.sincronizar(antes, e);
    expect(r.enviadas).toBe(1);
    expect(db.tab('lancamentos').get(e.obras[0].lancamentos[0].id).preco_unitario).toBe(12);
    expect(e.obras[0].lancamentos[0].versao).not.toBe(antes.obras[0].lancamentos[0].versao);
  });

  it('outra pessoa alterou antes: conflito, e o valor dela fica', async () => {
    const { db, e } = cenario();
    await SUPA.sincronizar(clone(estadoInicial()), e);
    const antes = clone(e);
    const id = e.obras[0].lancamentos[0].id;
    /* B grava no banco depois que A carregou */
    const linha = db.tab('lancamentos').get(id);
    db.tab('lancamentos').set(id, { ...linha, preco_unitario: 99, atualizado_em: agora() });
    e.obras[0].lancamentos[0].precoUnitario = 12;
    await expect(SUPA.sincronizar(antes, e)).rejects.toMatchObject({ codigo: 'conflito' });
    expect(db.tab('lancamentos').get(id).preco_unitario).toBe(99);
  });

  it('exclusão de linha que outra pessoa mudou: conflito, não apaga', async () => {
    const { db, e } = cenario();
    await SUPA.sincronizar(clone(estadoInicial()), e);
    const antes = clone(e);
    const id = e.obras[0].lancamentos[0].id;
    db.tab('lancamentos').set(id, { ...db.tab('lancamentos').get(id), descricao: 'Mudou', atualizado_em: agora() });
    e.obras[0].lancamentos = [];
    await expect(SUPA.sincronizar(antes, e)).rejects.toMatchObject({ codigo: 'conflito' });
    expect(db.tab('lancamentos').has(id)).toBe(true);
  });

  it('exclusão de linha que já tinha sido apagada: sem conflito', async () => {
    const { db, e } = cenario();
    await SUPA.sincronizar(clone(estadoInicial()), e);
    const antes = clone(e);
    db.tab('lancamentos').clear();
    e.obras[0].lancamentos = [];
    await expect(SUPA.sincronizar(antes, e)).resolves.toBeTruthy();
  });

  it('o resto grava mesmo quando uma linha dá conflito', async () => {
    const { db, e } = cenario();
    const l2 = { ...novoLancamento(), descricao: 'Areia' };
    e.obras[0].lancamentos.push(l2);
    await SUPA.sincronizar(clone(estadoInicial()), e);
    const antes = clone(e);
    const [a, b] = e.obras[0].lancamentos;
    db.tab('lancamentos').set(a.id, { ...db.tab('lancamentos').get(a.id), atualizado_em: agora() });
    a.precoUnitario = 50;
    b.precoUnitario = 7;
    await expect(SUPA.sincronizar(antes, e)).rejects.toMatchObject({ codigo: 'conflito' });
    expect(db.tab('lancamentos').get(b.id).preco_unitario).toBe(7);
  });
});
