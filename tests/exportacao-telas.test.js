/**
 * Exportação por aba (botão "Exportar" do topo): o relatório de cada aba
 * sai de io/modelos-exportacao.js, e os números dele precisam ser os
 * mesmos de dominio/calculos.js — o PDF e o Excel não podem contar uma
 * história diferente da tela.
 */
import { describe, expect, it } from 'vitest';
import { estadoDemo } from './fixture.js';
import { novaObra, novoCliente } from '../src/nucleo/base.js';
import {
  resumoLancamentos,
  resumoMateriais,
  resumoMedicoes,
  totaisContratos,
  basesContratuais,
  indicadoresContrato,
  composicaoContrato,
  pendenciasObra,
} from '../src/dominio/calculos.js';
import {
  MODELOS,
  formatarValor,
  montarModelo,
  podeExportar,
} from '../src/io/modelos-exportacao.js';

const TIPOS = new Set(['texto', 'moeda', 'num', 'int', 'pct', 'data']);
const coluna = (secao, rotulo) => secao.colunas.findIndex((c) => c.rotulo === rotulo);
const somaColuna = (secao, rotulo) => {
  const i = coluna(secao, rotulo);
  return Math.round(secao.linhas.reduce((s, l) => s + (Number(l[i]) || 0), 0) * 100) / 100;
};

describe('modelos de exportação', () => {
  const e = estadoDemo();
  const o = e.obras[0];

  it('toda aba monta um relatório bem formado', () => {
    Object.keys(MODELOS).forEach((view) => {
      const m = montarModelo(view, e, o);
      expect(m.titulo, view).toBeTruthy();
      expect(m.arquivo, view).toMatch(/^[a-z-]+$/);
      expect(Array.isArray(m.kpis)).toBe(true);
      m.kpis.forEach((k) => expect(typeof k.valor, `${view}: ${k.rotulo}`).toBe('string'));
      m.secoes.forEach((s) => {
        s.colunas.forEach((c) => expect(TIPOS.has(c.tipo), `${view}: ${c.rotulo}`).toBe(true));
        /* o PDF precisa de ao menos uma coluna; A4 retrato cabe até 9 */
        const noPdf = s.colunas.filter((c) => c.pdf).length;
        expect(noPdf, `${view}: ${s.titulo}`).toBeGreaterThan(0);
        expect(noPdf, `${view}: ${s.titulo}`).toBeLessThanOrEqual(9);
        s.linhas.forEach((l) => expect(l.length, `${view}: ${s.titulo}`).toBe(s.colunas.length));
        if (s.total) expect(s.total.length).toBe(s.colunas.length);
      });
    });
  });

  it('datas vão cruas (AAAA-MM-DD) e números como número', () => {
    Object.keys(MODELOS).forEach((view) => {
      montarModelo(view, e, o).secoes.forEach((s) => {
        s.colunas.forEach((c, i) => {
          s.linhas.forEach((l) => {
            const v = l[i];
            if (v === '' || v === null || v === undefined) return;
            if (c.tipo === 'data') expect(v, `${view}: ${c.rotulo}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
            if (['moeda', 'num', 'int', 'pct'].includes(c.tipo))
              expect(typeof v, `${view}: ${c.rotulo}`).toBe('number');
          });
        });
      });
    });
  });

  it('lançamentos: o total da tabela é o total lançado', () => {
    const m = montarModelo('lancamentos', e, o);
    expect(somaColuna(m.secoes[0], 'Total')).toBeCloseTo(resumoLancamentos(o).total, 2);
    const porMes = m.secoes.find((s) => s.titulo === 'Por mês');
    if (porMes) expect(somaColuna(porMes, 'Total')).toBeCloseTo(resumoLancamentos(o).total, 2);
  });

  it('medições: líquido e pago batem com resumoMedicoes', () => {
    const m = montarModelo('medicoes', e, o);
    const rm = resumoMedicoes(o);
    const ativas = {
      ...m.secoes[0],
      linhas: m.secoes[0].linhas.filter((l) => l[12] !== 'Cancelado'),
    };
    expect(somaColuna(ativas, 'Líquido')).toBeCloseTo(rm.medido, 2);
    expect(somaColuna(ativas, 'Pago')).toBeCloseTo(rm.pago, 2);
  });

  it('contratos: autorizado e medido batem com totaisContratos', () => {
    const m = montarModelo('contratos', e, o);
    const linhas = basesContratuais(o).map((b) => ({
      ind: indicadoresContrato(o, b.base),
      comp: composicaoContrato(o, b.base),
    }));
    const t = totaisContratos(linhas);
    expect(somaColuna(m.secoes[0], 'Autorizado')).toBeCloseTo(t.autorizado, 2);
    expect(somaColuna(m.secoes[0], 'Medido')).toBeCloseTo(t.medido, 2);
    expect(somaColuna(m.secoes[0], 'A pagar agora')).toBeCloseTo(t.aPagarAgora, 2);
  });

  it('materiais: o "falta (R$)" é o falta comprar do plano', () => {
    const m = montarModelo('materiais', e, o);
    const r = resumoMateriais(o);
    const s = m.secoes[0];
    const iSit = coluna(s, 'Situação');
    const ativos = { ...s, linhas: s.linhas.filter((l) => l[iSit] !== 'Cancelado') };
    expect(somaColuna(ativos, 'Falta (R$)')).toBeCloseTo(r.faltaComprar, 2);
  });

  it('pendências: em aberto são as de pendenciasObra mais os informativos', () => {
    const m = montarModelo('alertas', e, o);
    const p = pendenciasObra(o);
    const abertos = m.secoes[0].linhas;
    expect(abertos.filter((l) => l[0] !== 'Informativo').length).toBe(p.total);
  });

  it('clientes: CPF/CNPJ sai mascarado (LGPD), como na lista', () => {
    const e2 = estadoDemo();
    e2.clientes.push(Object.assign(novoCliente(), { nome: 'Ana', documento: '123.456.789-09' }));
    const m = montarModelo('clientes', e2, null);
    const ana = m.secoes[0].linhas.find((l) => l[0] === 'Ana');
    expect(ana[1]).toBe('***.456.789-**');
    expect(JSON.stringify(m)).not.toContain('123.456.789-09');
  });

  it('cronograma não leva valor em R$ (o cliente final também exporta)', () => {
    const m = montarModelo('cronograma', e, o);
    m.secoes.forEach((s) => s.colunas.forEach((c) => expect(c.tipo).not.toBe('moeda')));
    m.kpis.forEach((k) => expect(k.valor).not.toMatch(/R\$/));
  });
});

describe('quando o botão aparece', () => {
  it('só na aba com algo preenchido', () => {
    const e = estadoDemo();
    const vazia = novaObra('Vazia');
    e.obras.push(vazia);
    [
      'contratos',
      'cronograma',
      'materiais',
      'medicoes',
      'recebimentos',
      'lancamentos',
      'diario',
    ].forEach((v) => {
      expect(podeExportar(v, e, vazia), v).toBe(false);
      expect(podeExportar(v, e, e.obras[0]), v).toBe(true);
    });
    /* a configuração sempre tem os dados da obra */
    expect(podeExportar('obra-config', e, vazia)).toBe(true);
  });

  it('aba de obra sem obra escolhida e aba sem modelo: sem botão', () => {
    const e = estadoDemo();
    expect(podeExportar('lancamentos', e, null)).toBe(false);
    expect(podeExportar('painel', e, e.obras[0])).toBe(false);
    expect(podeExportar('clientes', e, null)).toBe(true);
  });
});

describe('formatarValor (PDF)', () => {
  it('formata em pt-BR e deixa vazio o que não tem valor', () => {
    expect(formatarValor(1234.5, 'moeda')).toBe('R$ 1.234,50');
    expect(formatarValor(0.456, 'pct')).toBe('46%');
    expect(formatarValor('2026-11-21', 'data')).toBe('21/11/2026');
    expect(formatarValor(12, 'num')).toBe('12');
    expect(formatarValor(2.5, 'num')).toBe('2,50');
    expect(formatarValor('', 'moeda')).toBe('');
    expect(formatarValor(null, 'data')).toBe('');
  });
});
