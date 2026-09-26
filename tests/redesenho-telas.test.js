// @vitest-environment jsdom
/**
 * Redesenho das telas (set/2026, Parte B): os números novos de
 * Cronograma, Materiais, Medições, Recebimentos, Lançamentos, Fluxo de
 * caixa e Relatórios — conferidos na Casa 14 (a obra-problema da
 * demonstração) e em casos pequenos montados à mão.
 */
import { describe, expect, it } from 'vitest';
import { casa14, h, HOJE } from './casa14.fixture.js';
import {
  estadoInicial,
  migrar,
  normalizarPadrao,
  novaObra,
  novoLancamento,
  novoRecebimento,
  novoRelatorioGerado,
  novoPrestador,
} from '../src/nucleo/base.js';
import {
  agendaObra,
  analiseFluxo,
  andamentoParcela,
  categoriaLancamento,
  composicaoPorTipo,
  condicaoParcela,
  curvaRecebimentos,
  fluxoProjetado,
  gastoPorEtapa,
  historicoParcela,
  indicadoresRecebimentos,
  kpisObra,
  lancamentosDuplicados,
  lancamentosDuplicadosAbertos,
  lancamentosPorMes,
  lancamentoTotal,
  liberadoExecutado,
  podeSolicitar,
  prestacaoContas,
  responsaveisCronograma,
  resumoLancamentos,
  resumoMateriais,
  resumoMedicoes,
  rtDoRelatorio,
} from '../src/dominio/calculos.js';
import { anexoValido, validarObra, validarRelatorioGerado } from '../src/dominio/validacao.js';
import { fatiasRosca } from '../src/graficos/index.js';

const recebimento = (o, x) => Object.assign(novoRecebimento(), x);

/* ================================================= Recebimentos (B7) */
describe('Pode solicitar', () => {
  it('é o executado menos o liberado, em valor, menos o que já foi pedido', () => {
    const o = casa14();
    const le = liberadoExecutado(o);
    const ps = podeSolicitar(o, HOJE);
    /* a parcela 3 (R$ 37.500) já foi solicitada e não caiu */
    expect(ps.emAndamento).toBeCloseTo(37500, 2);
    expect(ps.valor).toBeCloseTo(Math.max(0, le.bancando - 37500), 2);
    expect(ps.executado).toBeCloseTo(le.executado, 6);
    expect(ps.liberado).toBeCloseTo(le.liberado, 6);
  });

  it('nunca negativo, e null sem valor financiado', () => {
    const o = casa14();
    o.recebimentos.forEach((r) => {
      if (r.origem === 'CAIXA') r.valorRecebido = 60000;
    });
    expect(podeSolicitar(o, HOJE).valor).toBe(0);
    o.fin.valorFinanciado = 0;
    expect(podeSolicitar(o, HOJE)).toBeNull();
  });
});

describe('indicadoresRecebimentos', () => {
  it('recebido, % do previsto, próxima, atrasado e tarifas', () => {
    const k = indicadoresRecebimentos(casa14(), HOJE);
    expect(k.recebido).toBeCloseTo(18000 + 29790 + 37237.5, 2);
    expect(k.previstoTotal).toBeCloseTo(168000, 2);
    expect(k.pctRecebido).toBeCloseTo(85027.5 / 168000, 6);
    expect(k.recebidoProprio).toBeCloseTo(18000, 2);
    expect(k.tarifas).toBeCloseTo(210 + 262.5, 2);
    expect(k.proxima).toMatchObject({ valor: 45000, data: h(30), numero: '4' });
    expect(k.atrasado).toBeCloseTo(37500, 2);
    expect(k.maisAntiga).toMatchObject({ numero: '3', dias: 40 });
  });
});

describe('andamentoParcela', () => {
  it('financiamento: solicitada, vencida, com os dias', () => {
    const o = casa14();
    const a = andamentoParcela(
      o.recebimentos.find((r) => r.numeroMedicao === '3'),
      HOJE,
    );
    expect(a.tipo).toBe('financiamento');
    expect(a.passos).toEqual(['Prevista', 'Solicitada', 'Em vistoria', 'Aprovada', 'Creditada']);
    expect(a.passo).toBe(1);
    expect(a.texto).toBe('Solicitada há 45 dias');
    expect(a.vencida).toBe(true);
    expect(a.diasAtraso).toBe(40);
  });

  it('cliente: prevista → cobrada → recebida', () => {
    const o = casa14();
    const cli = andamentoParcela(
      o.recebimentos.find((r) => r.origem === 'Cliente'),
      HOJE,
    );
    expect(cli.passos).toEqual(['Prevista', 'Cobrada', 'Recebida']);
    expect(cli.final).toBe(true);
    expect(cli.texto).toMatch(/^Recebida em /);
    const cobrada = andamentoParcela(
      recebimento(o, {
        origem: 'Cliente',
        dataPrevista: h(10),
        dataSolicitacao: h(-2),
        valorPrevisto: 5000,
      }),
      HOJE,
    );
    expect(cobrada.passo).toBe(1);
    expect(cobrada.texto).toBe('Cobrada há 2 dias');
    expect(cobrada.vencida).toBe(false);
  });

  it('prevista no futuro diz para quando; cancelada não tem passo', () => {
    const o = casa14();
    const a = andamentoParcela(
      o.recebimentos.find((r) => r.numeroMedicao === '4'),
      HOJE,
    );
    expect(a.passo).toBe(0);
    expect(a.texto).toMatch(/^Prevista para /);
    expect(andamentoParcela(recebimento(o, { status: 'Cancelado' }), HOJE).cancelada).toBe(true);
  });
});

describe('condicaoParcela', () => {
  it('etapa ligada: exige a etapa a 100%', () => {
    const o = casa14();
    const c = condicaoParcela(
      o,
      recebimento(o, { origem: 'CAIXA', etapaPci: 'Pisos e revestimentos', valorPrevisto: 1 }),
    );
    expect(c.texto).toBe('exige Pisos e revestimentos 100% · hoje 30%');
    expect(c.cumprida).toBe(false);
  });
  it('% de obra exigido, sem etapa ligada', () => {
    const o = casa14();
    const c = condicaoParcela(
      o,
      recebimento(o, { origem: 'CAIXA', percentExigido: 0.5, valorPrevisto: 1 }),
    );
    expect(c.tipo).toBe('obra');
    expect(c.cumprida).toBe(true);
    expect(c.texto).toMatch(/^exige 50% da obra · hoje \d+%$/);
  });
  it('cliente e parcela já creditada não têm condição', () => {
    const o = casa14();
    expect(
      condicaoParcela(
        o,
        o.recebimentos.find((r) => r.origem === 'Cliente'),
      ),
    ).toBeNull();
    expect(
      condicaoParcela(
        o,
        o.recebimentos.find((r) => r.numeroMedicao === '1'),
      ),
    ).toBeNull();
  });
});

describe('curvaRecebimentos e histórico', () => {
  it('acumula previsto e recebido; o futuro não tem recebido', () => {
    const o = casa14();
    const c = curvaRecebimentos(o, HOJE);
    const ult = c[c.length - 1];
    expect(ult.previsto).toBeCloseTo(168000, 2);
    const hoje = c.filter((m) => m.recebido !== null).pop();
    expect(hoje.recebido).toBeCloseTo(kpisObra(o).recebido, 2);
    expect(c.filter((m) => m.ym > HOJE.slice(0, 7)).every((m) => m.recebido === null)).toBe(true);
  });
  it('histórico da parcela só com os passos que aconteceram', () => {
    const o = casa14();
    const hist = historicoParcela(o.recebimentos.find((r) => r.numeroMedicao === '3'));
    expect(hist.map((x) => x.passo)).toEqual(['Prevista', 'Solicitada']);
  });
});

/* ================================================= Lançamentos (B8) */
describe('categorias de saída e composição', () => {
  it('cada tipo cai numa das quatro categorias', () => {
    const l = (tipo) => categoriaLancamento({ tipo });
    expect(l('Material')).toBe('material');
    expect(l('Fornecimento + instalação')).toBe('material');
    expect(l('Serviço avulso')).toBe('maoDeObra');
    expect(l('Taxa/imposto')).toBe('taxas');
    expect(l('Comissão imobiliária')).toBe('extras');
    expect(l('Tipo que o usuário inventou')).toBe('extras');
  });

  it('as categorias somam o total lançado', () => {
    const r = resumoLancamentos(casa14());
    const c = r.porCategoria;
    expect(c.material).toBeCloseTo(90 * 37 + 150 + 20000, 2);
    expect(c.taxas).toBeCloseTo(262 + 650, 2);
    expect(c.extras).toBeCloseTo(1200 + 6150, 2);
    expect(c.maoDeObra).toBe(0);
    expect(c.material + c.maoDeObra + c.taxas + c.extras).toBeCloseTo(r.total, 2);
  });

  it('composição por tipo e gasto por etapa, do maior para o menor', () => {
    const o = casa14();
    const comp = composicaoPorTipo(o.lancamentos);
    expect(comp[0]).toEqual({ rotulo: 'Material', valor: 23480 });
    expect(comp.map((x) => x.rotulo)).toEqual([
      'Material',
      'Comissão imobiliária',
      'Honorário técnico/gestão',
      'Taxa/imposto',
    ]);
    const etapa = gastoPorEtapa(o.lancamentos);
    expect(etapa[0].rotulo).toBe('Sem etapa');
    expect(etapa.reduce((s, x) => s + x.valor, 0)).toBeCloseTo(resumoLancamentos(o).total, 2);
  });

  it('a rosca junta o que passa de cinco fatias em "Outros"', () => {
    const itens = [9, 8, 7, 6, 5, 4, 3].map((v, i) => ({ rotulo: `t${i}`, valor: v }));
    const f = fatiasRosca(itens, 5);
    expect(f).toHaveLength(6);
    expect(f[5]).toMatchObject({ rotulo: 'Outros', valor: 7 });
    expect(fatiasRosca(itens.slice(0, 6), 5)).toHaveLength(6);
  });
});

describe('lancamentosPorMes', () => {
  it('agrupa por mês, o mais recente primeiro, com o subtotal', () => {
    const o = casa14();
    const g = lancamentosPorMes(o.lancamentos);
    expect(g.map((x) => x.ym)).toEqual([...g.map((x) => x.ym)].sort().reverse());
    expect(g.reduce((s, x) => s + x.total, 0)).toBeCloseTo(resumoLancamentos(o).total, 2);
    g.forEach((x) =>
      expect(x.total).toBeCloseTo(
        x.lancamentos.reduce((s, l) => s + lancamentoTotal(l), 0),
        2,
      ),
    );
  });
  it('sem data vai para o fim', () => {
    const ls = [
      Object.assign(novoLancamento(), { data: '', precoUnitario: 10 }),
      Object.assign(novoLancamento(), { data: '2026-01-10', precoUnitario: 20 }),
    ];
    expect(lancamentosPorMes(ls).map((x) => x.ym)).toEqual(['2026-01', '']);
  });
});

describe('duplicados em aberto', () => {
  it('"não é duplicado" (tratamento resolvido) tira o grupo da lista', () => {
    const o = novaObra('Dup');
    const l = () =>
      Object.assign(novoLancamento(), {
        data: '2026-08-26',
        fornecedor: 'Casa do Piso',
        precoUnitario: 3400,
      });
    o.lancamentos.push(l(), l());
    expect(lancamentosDuplicadosAbertos(o, HOJE)).toHaveLength(1);
    const id = lancamentosDuplicados(o)[0][0].id;
    o.tratamentos.push({
      chave: `duplicado:${id}`,
      status: 'resolvido',
      sevMarcada: 2,
      valorMarcado: 3400,
    });
    expect(lancamentosDuplicadosAbertos(o, HOJE)).toHaveLength(0);
  });
});

/* ================================================= Fluxo de caixa (B9) */
describe('analiseFluxo', () => {
  it('o menor saldo da obra toda é o vale de caixa', () => {
    const o = casa14();
    const an = analiseFluxo(o, '', HOJE);
    const proj = fluxoProjetado(o, HOJE);
    expect(an.menor.saldo).toBeCloseTo(proj.vale.saldo, 2);
    expect(an.menor.data).toBe(proj.vale.data);
  });

  it('o último mês fecha com o saldo final projetado', () => {
    const o = casa14();
    const an = analiseFluxo(o, '', HOJE);
    expect(an.meses[an.meses.length - 1].saldo).toBeCloseTo(fluxoProjetado(o, HOJE).saldoFinal, 2);
  });

  it('"futuros" só tem meses depois do de hoje', () => {
    const an = analiseFluxo(casa14(), 'futuros', HOJE);
    expect(an.meses.length).toBeGreaterThan(0);
    expect(an.meses.every((m) => m.ym > HOJE.slice(0, 7) && m.projetado)).toBe(true);
  });

  it('saídas e entradas por categoria cobrem o realizado', () => {
    const o = casa14();
    const an = analiseFluxo(o, '', HOJE);
    const s = Object.fromEntries(an.saidasPorCategoria.map((x) => [x.chave, x.valor]));
    const medPagas = o.medicoes.reduce((t, m) => t + m.valorPago, 0);
    expect(s.maoDeObra).toBeGreaterThanOrEqual(medPagas - 0.01);
    expect(s.material).toBeGreaterThanOrEqual(23480 - 0.01);
    expect(s.taxas).toBeCloseTo(912, 2);
    const e = Object.fromEntries(an.entradasPorOrigem.map((x) => [x.chave, x.valor]));
    expect(e.cliente).toBeCloseTo(18000, 2);
    expect(e.financiamento).toBeGreaterThanOrEqual(kpisObra(o).recebidoFinanciamento - 0.01);
  });

  it('menor saldo negativo quando falta dinheiro', () => {
    const o = casa14();
    o.fin.saldoInicial = -200000;
    expect(analiseFluxo(o, '', HOJE).menor.saldo).toBeLessThan(0);
  });
});

/* ================================================= Cronograma (B4) */
describe('agendaObra e responsaveisCronograma', () => {
  it('próximos 14 dias em ordem: começa, entrega de material, termina', () => {
    const a = agendaObra(casa14(), HOJE, 14);
    expect(a.map((x) => [x.data, x.texto])).toEqual([
      [h(5), 'Pintura começa'],
      [h(8), 'Entrega: Tinta acrílica 18 L'],
      [h(10), 'Forro/gesso termina'],
    ]);
  });

  it('por responsável: quem tem mais atraso primeiro, com o WhatsApp do cadastro', () => {
    const prest = [
      Object.assign(novoPrestador(), { nome: 'Antônio Ribeiro', whatsapp: '5562999990000' }),
    ];
    const r = responsaveisCronograma(casa14(), prest, HOJE);
    expect(r[0]).toMatchObject({
      nome: 'Antônio Ribeiro',
      atrasadas: 4,
      maiorAtraso: 40,
      emAndamento: 4,
    });
    expect(r[0].prestador.whatsapp).toBe('5562999990000');
    expect(r.find((x) => x.nome === 'Gesso Arte')).toMatchObject({
      atrasadas: 1,
      maiorAtraso: 20,
      emAndamento: 0,
    });
  });
});

/* ================================================= Materiais e Medições */
describe('resumoMateriais', () => {
  it('falta comprar e o que comprar nos próximos 14 dias (vencido primeiro)', () => {
    const r = resumoMateriais(casa14(), HOJE, 14);
    expect(r.faltaComprar).toBeCloseTo(10 * 37 + 40 * 31 + 9 * 235, 2);
    expect(r.comprarProximos.map((x) => [x.material, x.vencido])).toEqual([
      ['Rejunte', true],
      ['Tinta acrílica 18 L', false],
    ]);
    expect(r.faltaPorEtapa[0]).toEqual({ rotulo: 'Pintura', valor: 2115 });
  });
});

describe('resumoMedicoes', () => {
  it('totais sem as canceladas e o a pagar por contrato', () => {
    const r = resumoMedicoes(casa14());
    expect(r.medido).toBeCloseTo(7900 + 9350 + 7900 + 5400 + 3900 + 3900, 2);
    expect(r.pago).toBeCloseTo(31350, 2);
    expect(r.aPagarPorContrato.map((x) => [x.base, x.valor])).toEqual([
      ['CT-001', 5400],
      ['CT-002', 1600],
    ]);
  });
  it('medido × físico: CT-001 medido à frente', () => {
    const mf = resumoMedicoes(casa14()).medidoFisico.find((x) => x.base === 'CT-001');
    expect(mf.alerta).toBe(true);
    expect(mf.medido).toBeGreaterThan(mf.fisico);
  });
});

/* ================================================= Relatórios (B10) */
describe('prestacaoContas', () => {
  it('sem período fecha com o caixa de hoje', () => {
    const o = casa14();
    expect(prestacaoContas(o).saldoFinal).toBeCloseTo(kpisObra(o).saldoCaixa, 2);
  });
  it('com período: saldo anterior + entradas − saídas = saldo final', () => {
    const o = casa14();
    const pc = prestacaoContas(o, h(-130), '');
    expect(pc.saldoFinal).toBeCloseTo(pc.saldoAnterior + pc.totEntradas - pc.totSaidas, 2);
    /* até hoje, o fim do período é o caixa de hoje */
    expect(pc.saldoFinal).toBeCloseTo(kpisObra(o).saldoCaixa, 2);
    expect(pc.entradas.every((r) => r.dataRecebimento >= h(-130))).toBe(true);
  });
});

describe('rtDoRelatorio', () => {
  it('o da obra vence o da empresa; na falta, vale o da empresa', () => {
    const o = novaObra('X');
    const emp = { responsavel: 'Eng. Empresa', creaCau: 'CREA 1' };
    expect(rtDoRelatorio(o, emp)).toMatchObject({
      nome: 'Eng. Empresa',
      origemNome: 'empresa',
      falta: [],
    });
    o.responsavel = 'Eng. Obra';
    o.creaCau = 'CREA 2';
    expect(rtDoRelatorio(o, emp)).toMatchObject({
      nome: 'Eng. Obra',
      registro: 'CREA 2',
      origemNome: 'obra',
    });
  });
  it('avisa só o que não existe em nenhum dos dois', () => {
    const o = novaObra('X');
    o.responsavel = 'Eng. Obra';
    expect(rtDoRelatorio(o, {}).falta).toEqual(['CREA/CAU']);
    expect(rtDoRelatorio(novaObra('Y'), {}).falta).toEqual(['responsável técnico', 'CREA/CAU']);
  });
});

describe('relatório gerado (validação e migração)', () => {
  it('tipo conhecido, opções em objeto, arquivo no Storage da obra', () => {
    const r = Object.assign(novoRelatorioGerado(), {
      tipo: 'status',
      opcoes: { observacao: 'ok' },
    });
    expect(validarRelatorioGerado(r)).toEqual([]);
    expect(validarRelatorioGerado({ ...r, tipo: 'outro' })).toHaveLength(1);
    expect(validarRelatorioGerado({ ...r, opcoes: [] })).toHaveLength(1);
    expect(validarRelatorioGerado({ ...r, opcoes: { observacao: 'x'.repeat(601) } })).toHaveLength(
      1,
    );
    expect(validarRelatorioGerado({ ...r, arquivo: 'storage:o1/relatorios/rel-1.pdf' })).toEqual(
      [],
    );
    expect(validarRelatorioGerado({ ...r, arquivo: 'https://outro.site/x.pdf' })).toHaveLength(1);
  });
  it('migrar cria a lista e conserta opções corrompidas', () => {
    const e = estadoInicial();
    const o = novaObra('M');
    delete o.relatoriosGerados;
    e.obras.push(o);
    expect(migrar(e).obras[0].relatoriosGerados).toEqual([]);
    o.relatoriosGerados = [{ id: 'r1', tipo: 'status', opcoes: 'lixo' }];
    expect(migrar(e).obras[0].relatoriosGerados[0].opcoes).toEqual({});
  });
});

/* ================================================= Anexos e padrão */
describe('anexoValido', () => {
  it('aceita vazio, foto, PDF e referência ao Storage da obra', () => {
    expect(anexoValido('')).toBe(true);
    expect(anexoValido('data:image/jpeg;base64,AAAA')).toBe(true);
    expect(anexoValido('data:application/pdf;base64,AAAA')).toBe(true);
    expect(anexoValido('storage:obra-1/lancamentos/lanc-1-1700000000.pdf')).toBe(true);
    expect(anexoValido('storage:obra-1/recebimentos/rec_2.jpg')).toBe(true);
  });
  it('recusa outra pasta, outro formato e arquivo grande demais', () => {
    expect(anexoValido('storage:obra-1/outra/x.pdf')).toBe(false);
    expect(anexoValido('storage:../x.pdf')).toBe(false);
    expect(anexoValido('data:text/html;base64,AAAA')).toBe(false);
    expect(anexoValido('data:image/png;base64,' + 'A'.repeat(1500001))).toBe(false);
  });
});

describe('padrão de acabamento', () => {
  it('MCMV é programa: vira Econômico; o resto é traduzido', () => {
    expect(normalizarPadrao('MCMV')).toBe('Econômico');
    expect(normalizarPadrao('MCMV / popular')).toBe('Econômico');
    expect(normalizarPadrao('Normal')).toBe('Médio');
    expect(normalizarPadrao('médio')).toBe('Médio');
    expect(normalizarPadrao('Alto padrão')).toBe('Alto');
    expect(normalizarPadrao('')).toBe('');
    expect(normalizarPadrao('qualquer coisa')).toBe('');
  });
  it('migrar normaliza e validarObra recusa o que não é da lista', () => {
    const e = estadoInicial();
    e.obras.push(Object.assign(novaObra('P'), { padrao: 'MCMV' }));
    expect(migrar(e).obras[0].padrao).toBe('Econômico');
    expect(
      validarObra({ nome: 'x', padrao: 'MCMV', fin: {} }).some((p) => p.campo === 'padrao'),
    ).toBe(true);
    expect(
      validarObra({ nome: 'x', padrao: 'Alto', fin: {} }).some((p) => p.campo === 'padrao'),
    ).toBe(false);
  });
});
