/**
 * Migração 0018 e o orçado × realizado por etapa: o que o cliente deve à
 * obra, há quanto tempo ele não recebe notícia, fornecedor × prestador de
 * serviço, e o orçamento de cada etapa contra o que saiu.
 */
import { describe, expect, it } from 'vitest';
import {
  alertasObra,
  diasSemStatusCliente,
  kpisObra,
  orcadoRealizadoPorEtapa,
  pendenciasDoCliente,
  pendenciasObra,
  ultimoStatusCliente,
} from '../src/dominio/calculos.js';
import { apenasErros, validarPendenciaCliente, validarPrestador } from '../src/dominio/validacao.js';
import { migrar, novaPendenciaCliente } from '../src/nucleo/base.js';
import { HOJE, casa14, h } from './casa14.fixture.js';

const comCliente = () => {
  const o = casa14();
  o.clienteId = 'cli1';
  return o;
};

describe('pendências do cliente', () => {
  it('abertas pelo prazo; vencidas separadas', () => {
    const o = comCliente();
    o.pendenciasCliente = [
      { ...novaPendenciaCliente(), id: 'p1', descricao: 'Escolher piso', prazo: h(-3) },
      { ...novaPendenciaCliente(), id: 'p2', descricao: 'Aprovar projeto', prazo: h(5) },
      { ...novaPendenciaCliente(), id: 'p3', descricao: 'Já foi', status: 'resolvida', resolvidaEm: h(-1) },
    ];
    const pc = pendenciasDoCliente(o, HOJE);
    expect(pc.abertas.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(pc.vencidas.map((p) => p.id)).toEqual(['p1']);
    expect(pc.resolvidas).toBe(1);
  });

  it('decisão vencida vira pendência da obra, causa própria', () => {
    const o = comCliente();
    const antes = pendenciasObra(o).total;
    o.pendenciasCliente = [{ ...novaPendenciaCliente(), id: 'p1', descricao: 'Escolher piso', prazo: h(-3) }];
    const a = alertasObra(o).find((x) => x.tipo === 'cliente-decisao');
    expect(a.sev).toBe(2);
    expect(a.raiz).toBe('cliente-decisao');
    expect(pendenciasObra(o).total).toBe(antes + 1);
  });

  it('validação: descrição, situação e data de resolução (CHECKs chk_pcli_*)', () => {
    const base = novaPendenciaCliente();
    const campos = (p) => apenasErros(validarPendenciaCliente(p)).map((x) => x.campo);
    expect(campos({ ...base, descricao: '' })).toContain('descricao');
    expect(campos({ ...base, descricao: 'x', status: 'talvez' })).toContain('status');
    expect(campos({ ...base, descricao: 'x', status: 'resolvida', resolvidaEm: '' })).toContain('resolvidaEm');
    expect(campos({ ...base, descricao: 'x' })).toEqual([]);
  });
});

describe('status para o cliente', () => {
  it('conta desde o último envio; nunca enviado conta desde o início da obra', () => {
    const o = comCliente();
    o.statusEnviadoEm = h(-20);
    expect(diasSemStatusCliente(o, HOJE)).toBe(20);
    o.statusEnviadoEm = '';
    expect(diasSemStatusCliente(o, HOJE)).toBe(240);
  });

  it('sem cliente ou obra concluída, não se aplica', () => {
    const o = casa14();
    o.clienteId = '';
    expect(diasSemStatusCliente(o, HOJE)).toBeNull();
    const c = comCliente();
    c.status = 'Concluída';
    expect(diasSemStatusCliente(c, HOJE)).toBeNull();
  });

  it('mais de 14 dias sem notícia: aviso informativo, fora da contagem', () => {
    const o = comCliente();
    o.statusEnviadoEm = h(-20);
    const a = alertasObra(o).find((x) => x.tipo === 'status-cliente');
    expect(a.sev).toBe(1);
    o.statusEnviadoEm = h(-3);
    expect(alertasObra(o).some((x) => x.tipo === 'status-cliente')).toBe(false);
  });

  it('último status entre as obras do cliente', () => {
    const a = comCliente();
    const b = comCliente();
    a.statusEnviadoEm = h(-10);
    b.statusEnviadoEm = h(-2);
    expect(ultimoStatusCliente([a, b], HOJE)).toEqual({ data: h(-2), dias: 2 });
    expect(ultimoStatusCliente([casa14()], HOJE)).toEqual({ data: '', dias: null });
  });
});

describe('fornecedor × prestador de serviço', () => {
  it('tipo fora da lista é erro (CHECK chk_prestador_tipo)', () => {
    const campos = (p) => apenasErros(validarPrestador(p)).map((x) => x.campo);
    expect(campos({ nome: 'Casa do Construtor', tipo: 'loja' })).toContain('tipo');
    expect(campos({ nome: 'Casa do Construtor', tipo: 'fornecedor' })).not.toContain('tipo');
  });
  it('cadastro antigo vira prestador de serviço; obra antiga ganha as listas novas', () => {
    const e = migrar({ prestadores: [{ id: 'p', nome: 'Zé' }], obras: [{ nome: 'A' }] });
    expect(e.prestadores[0].tipo).toBe('servico');
    expect(e.obras[0].pendenciasCliente).toEqual([]);
    expect(e.obras[0].statusEnviadoEm).toBe('');
  });
});

describe('orçado × realizado por etapa', () => {
  it('o realizado soma o total pago da obra', () => {
    const o = casa14();
    const total = orcadoRealizadoPorEtapa(o).reduce((s, l) => s + l.realizado, 0);
    expect(total).toBeCloseTo(kpisObra(o).totalPago, 2);
  });

  it('contrato sem etapas cai em "Contratos sem etapa"; com etapas, reparte pelo peso', () => {
    const o = casa14();
    let r = orcadoRealizadoPorEtapa(o);
    expect(r.find((l) => l.etapa === 'Contratos sem etapa').orcado).toBe(46080);
    const ct = o.contratos.find((c) => c.codigoBase === 'CT-002' && c.registro === 'Contrato');
    ct.etapas = [o.cronograma[0].etapa];
    r = orcadoRealizadoPorEtapa(o);
    const et = r.find((l) => l.etapa === o.cronograma[0].etapa);
    expect(et.orcado).toBeGreaterThanOrEqual(7800 - 0.5);
  });

  it('Casa 14: Fundação orçada em R$ 3.700 e realizada em R$ 3.480 (94%)', () => {
    const f = orcadoRealizadoPorEtapa(casa14()).find((l) => l.etapa === 'Fundação');
    expect(f.orcado).toBe(3700);
    expect(f.realizado).toBe(3480);
    expect(f.consumido).toBeCloseTo(0.94, 2);
  });
});
