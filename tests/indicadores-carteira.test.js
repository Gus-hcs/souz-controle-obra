/**
 * Indicadores da carteira: uma função por indicador, e toda tela a consome.
 *
 * A fixture reproduz a carteira que mostrava números diferentes para a mesma
 * coisa (KPI x total da tabela x painel x sidebar): quatro obras — uma com
 * valor de venda, cronograma atrasado e contrato medido 8% acima do
 * autorizado; duas recém-criadas, vazias; e uma com custo mas sem valor de
 * venda nem cronograma. Os nomes são fictícios; o formato é o da carteira real.
 *
 * As datas são fixas e `hoje` é passado explicitamente sempre que a função
 * aceita, para o teste não mudar de resultado conforme o dia em que roda.
 */
import { describe, expect, it } from 'vitest';
import {
  estadoInicial,
  migrar,
  novaEtapaCronograma,
  novaMedicao,
  novaObra,
  novoContrato,
  novoLancamento,
  novoMaterial,
  novoRecebimento,
} from '../src/nucleo/base.js';
import {
  agendaCarteira,
  alertasObra,
  avancoCarteira,
  custoCarteira,
  avancoPrevistoObra,
  caixaCarteira,
  curvaS,
  curvaSCarteira,
  kpisCarteira,
  kpisObra,
  ORDEM_SAUDE,
  pendenciasCarteira,
  pendenciasObra,
  prazoObra,
  resultadoCarteira,
  riscoCarteira,
  saudeObra,
} from '../src/dominio/calculos.js';

const HOJE = '2026-09-23';

const etapa = (nome, ini, fim, progresso, peso = 1) =>
  Object.assign(novaEtapaCronograma(nome), {
    inicioPrevisto: ini,
    fimPrevisto: fim,
    progresso,
    peso,
    inicioReal: progresso > 0 ? ini : '',
  });

const contrato = (base, valor, status = 'Em andamento') =>
  Object.assign(novoContrato(), { codigo: base, codigoBase: base, valorInformado: valor, status });

const medicao = (base, valor, pago, data = '2026-06-01') =>
  Object.assign(novaMedicao(), {
    contratoBase: base,
    valorMedido: valor,
    valorPago: pago,
    data,
    status: pago >= valor ? 'Pago' : 'Em aberto',
  });

/* ------------------------------------------------------------ fixture */
function carteiraDoPrint() {
  const e = estadoInicial();

  /* Obra A — a "Casa 12": venda, cronograma com etapas atrasadas, contrato
     de R$ 50.250 medido em R$ 54.500 (+8,5%), saldo inicial de R$ 5.000. */
  const a = Object.assign(novaObra(), {
    nome: 'Obra A',
    cidade: 'Cidade X',
    status: 'Em andamento',
    dataInicio: '2026-01-10',
    previsaoConclusao: '2026-10-30',
  });
  a.fin.valorVenda = 195000;
  a.fin.saldoInicial = 5000;
  a.contratos.push(contrato('CT-001', 50250));
  /* Medido 54.500 contra 50.250 autorizados, mas pago só 50.000: é
     "medido acima do contrato" (atenção), não "pago acima" (crítico). */
  a.medicoes.push(
    medicao('CT-001', 30000, 30000, '2026-04-01'),
    medicao('CT-001', 24500, 20000, '2026-07-01'),
  );
  a.cronograma.push(
    etapa('Fundação', '2026-01-10', '2026-03-10', 1, 2),
    etapa('Alvenaria', '2026-03-11', '2026-06-10', 1, 3),
    etapa('Pisos e revestimentos', '2026-06-11', '2026-09-03', 0.6, 2), // 20 dias atrasada em HOJE
    etapa('Forro', '2026-07-01', '2026-09-08', 0.4, 1), // 15 dias
    etapa('Pintura', '2026-09-20', '2026-10-30', 0, 2),
  );
  a.recebimentos.push(
    Object.assign(novoRecebimento(), {
      origem: 'CAIXA',
      etapaPci: 'Parcela 1',
      valorPrevisto: 60000,
      valorRecebido: 60000,
      dataPrevista: '2026-03-01',
      dataRecebimento: '2026-03-05',
      status: 'Recebido',
    }),
    Object.assign(novoRecebimento(), {
      origem: 'CAIXA',
      etapaPci: 'Parcela 2',
      valorPrevisto: 40000,
      dataPrevista: '2026-10-03',
      status: 'Previsto',
    }),
    Object.assign(novoRecebimento(), {
      origem: 'CAIXA',
      etapaPci: 'Parcela 3',
      valorPrevisto: 30000,
      dataPrevista: '2026-11-15',
      status: 'Previsto',
    }),
  );
  a.materiais.push(
    Object.assign(novoMaterial(), {
      material: 'Porcelanato',
      quantidadeNecessaria: 50,
      precoPrevisto: 46,
      dataNecessaria: '2026-09-30',
      status: 'Comprar',
    }),
    Object.assign(novoMaterial(), {
      material: 'Tinta',
      quantidadeNecessaria: 12,
      precoPrevisto: 210,
      dataNecessaria: '2026-11-20',
      status: 'Planejar',
    }),
  );

  /* Obras B e C — recém-criadas, sem nada. */
  const b = Object.assign(novaObra(), { nome: 'Obra B', status: 'Em andamento' });
  const c = Object.assign(novaObra(), { nome: 'Obra C', status: 'Em andamento' });

  /* Obra D — a "Scarlett": custo, recebimento, sem venda e sem cronograma. */
  const d = Object.assign(novaObra(), { nome: 'Obra D', status: 'Em andamento' });
  d.contratos.push(contrato('CT-010', 120000));
  d.medicoes.push(medicao('CT-010', 20000, 20000));
  d.recebimentos.push(
    Object.assign(novoRecebimento(), {
      origem: 'Cliente',
      valorPrevisto: 29583,
      valorRecebido: 29583,
      dataPrevista: '2026-05-01',
      dataRecebimento: '2026-05-01',
      status: 'Recebido',
    }),
  );

  e.obras.push(a, b, c, d);
  return migrar(e);
}

const est = carteiraDoPrint();
const obras = est.obras;
const [A, B, , D] = obras;

/* ======================================================== resultado */
describe('resultado projetado — uma regra, os dois lugares', () => {
  const r = resultadoCarteira(obras);
  const k = kpisCarteira(est);

  it('o KPI e o total da tabela são o mesmo número', () => {
    const somaDaTabela = obras
      .map((o) => kpisObra(o).resultado)
      .filter((v) => v !== null)
      .reduce((s, v) => s + v, 0);
    expect(k.resultado).toBeCloseTo(r.resultado, 6);
    expect(r.resultado).toBeCloseTo(somaDaTabela, 6);
  });

  it('obra sem valor de venda fica fora e é contada à parte', () => {
    expect(r.obrasComVenda).toBe(1);
    expect(r.obrasSemVenda).toBe(3);
    /* A Obra D tem custo previsto e nenhuma receita: antes ela empurrava
       o resultado para um prejuízo que não existe. */
    expect(kpisObra(D).custoComTerreno).toBeGreaterThan(0);
    expect(r.resultado).toBeCloseTo(kpisObra(A).resultado, 6);
  });

  it('a margem é o resultado sobre a venda das obras que entram na conta', () => {
    expect(r.margem).toBeCloseTo(r.resultado / r.venda, 9);
    expect(k.margem).toBeCloseTo(r.margem, 9);
  });

  it('sem nenhuma obra com venda, o resultado é nulo — não zero', () => {
    expect(resultadoCarteira([B, D]).resultado).toBeNull();
  });
});

/* ======================================================== pendências */
describe('pendências — uma contagem em todo lugar', () => {
  const p = pendenciasCarteira(obras);

  it('KPI, soma por obra e lista têm o mesmo total', () => {
    expect(kpisCarteira(est).pendencias).toBe(p.total);
    expect(obras.reduce((s, o) => s + pendenciasObra(o).total, 0)).toBe(p.total);
    expect(p.itens.length).toBe(p.total);
  });

  it('só conta o que pede ação: atenção e crítico; aviso fica de fora', () => {
    const todos = obras.flatMap((o) => alertasObra(o));
    expect(p.total).toBe(todos.filter((a) => a.sev >= 2).length);
    expect(p.avisos).toBe(todos.filter((a) => a.sev < 2).length);
    expect(p.total).toBe(p.criticas + p.atencao);
    expect(p.itens.every((a) => a.sev >= 2)).toBe(true);
  });

  it('o detalhamento por tipo soma o total', () => {
    const soma = Object.values(p.porTipo).reduce((s, n) => s + n, 0);
    expect(soma).toBe(p.total);
    expect(Object.keys(p.porTipo).sort()).toEqual(['contrato', 'financeiro', 'material', 'prazo']);
  });

  it('a contagem por tela bate com o total', () => {
    const soma = Object.values(p.porView).reduce((s, n) => s + n, 0);
    expect(soma).toBe(p.total);
  });

  it('os itens saem do mais grave para o menos grave', () => {
    for (let i = 1; i < p.itens.length; i++)
      expect(p.itens[i - 1].sev).toBeGreaterThanOrEqual(p.itens[i].sev);
  });
});

/* ============================================================ custo */
describe('custo — realizado sobre orçado', () => {
  it('soma o pago e o custo previsto das obras', () => {
    const c = custoCarteira(obras);
    expect(c.realizado).toBeCloseTo(
      obras.reduce((s, o) => s + kpisObra(o).totalPago, 0),
      6,
    );
    expect(c.orcado).toBeCloseTo(
      obras.reduce((s, o) => s + kpisObra(o).custoPrevisto, 0),
      6,
    );
    expect(c.consumido).toBeCloseTo(c.realizado / c.orcado, 9);
  });

  it('obra sem orçamento não tem % consumido — nulo, não zero', () => {
    expect(custoCarteira([B]).consumido).toBeNull();
  });
});

/* ============================================================ caixa */
describe('caixa — as três parcelas aparecem, e a conta fecha', () => {
  const c = caixaCarteira(obras, HOJE);

  it('saldo = saldo inicial + recebido − pago', () => {
    expect(c.saldo).toBeCloseTo(c.saldoInicial + c.recebido - c.pago, 6);
    expect(c.saldoInicial).toBe(5000);
  });

  it('é o mesmo número do KPI e da soma das obras', () => {
    expect(kpisCarteira(est).saldoCaixa).toBeCloseTo(c.saldo, 6);
    expect(obras.reduce((s, o) => s + kpisObra(o).saldoCaixa, 0)).toBeCloseTo(c.saldo, 6);
  });

  it('a projeção de 30 dias só inclui o que cai dentro do período', () => {
    /* Entra a parcela de 03/10 (40 mil); a de 15/11 fica de fora. Sai a
       medição em aberto (4.500, já devida) e o porcelanato de 30/09
       (50 × 46); a tinta de 20/11 fica de fora. */
    expect(c.aReceber).toBeCloseTo(40000, 6);
    expect(c.aPagar).toBeCloseTo(4500 + 50 * 46, 6);
    expect(c.projecao).toBeCloseTo(c.saldo + 40000 - 6800, 6);
  });
});

/* =========================================================== avanço */
describe('avanço físico — ponderado pelo custo previsto, com previsto de hoje', () => {
  const av = avancoCarteira(obras, HOJE);

  it('obra sem cronograma ou sem custo previsto fica fora da média', () => {
    expect(av.obras).toBe(1);
    expect(av.fora).toBe(3);
  });

  it('com uma obra só na conta, o avanço é o dela', () => {
    expect(av.realizado).toBeCloseTo(kpisObra(A).progressoFisico, 9);
    expect(av.previsto).toBeCloseTo(avancoPrevistoObra(A, HOJE), 9);
    expect(av.desvio).toBeCloseTo(av.realizado - av.previsto, 9);
  });

  it('pondera pelo custo: a obra maior pesa mais que a menor', () => {
    const grande = JSON.parse(JSON.stringify(A));
    const pequena = JSON.parse(JSON.stringify(A));
    grande.id = 'g';
    pequena.id = 'p';
    pequena.cronograma.forEach((e) => {
      e.progresso = 0;
      e.inicioReal = '';
    });
    pequena.contratos[0].valorInformado = 5000;
    pequena.medicoes = [];
    const kg = kpisObra(grande),
      kp = kpisObra(pequena);
    const r = avancoCarteira([grande, pequena], HOJE);
    const esperado =
      (kg.custoPrevisto * kg.progressoFisico + kp.custoPrevisto * kp.progressoFisico) /
      (kg.custoPrevisto + kp.custoPrevisto);
    expect(r.realizado).toBeCloseTo(esperado, 9);
    /* e é diferente da média simples, que era o que a tela mostrava */
    expect(r.realizado).not.toBeCloseTo((kg.progressoFisico + kp.progressoFisico) / 2, 3);
  });

  it('o previsto de hoje sai do cronograma: etapas encerradas contam inteiras', () => {
    /* Em HOJE, Fundação, Alvenaria, Pisos e Forro já deveriam ter acabado
       (2+3+2+1 = 8 de 10 de peso), e a Pintura está 3 dias dentro de 40. */
    const esperado = 8 / 10 + (2 / 10) * (3 / 40);
    expect(avancoPrevistoObra(A, HOJE)).toBeCloseTo(esperado, 3);
  });
});

/* ============================================================ prazo */
describe('prazo — fim previsto e desvio em dias', () => {
  it('fim previsto é a previsão de conclusão da obra', () => {
    expect(prazoObra(A, HOJE).fimPrevisto).toBe('2026-10-30');
  });

  it('o desvio é o atraso da etapa mais atrasada', () => {
    expect(prazoObra(A, HOJE).desvioDias).toBe(20); // Pisos: fim 03/09, hoje 23/09
  });

  it('sem cronograma, sem desvio', () => {
    expect(prazoObra(D, HOJE).desvioDias).toBe(0);
  });
});

/* ============================================================ saúde */
describe('saúde da obra — nível e motivo', () => {
  it('atraso e custo acima do contrato aparecem juntos, o pior primeiro', () => {
    const s = saudeObra(A, HOJE);
    expect(s.nivel).toBe('atencao');
    expect(s.texto).toBe('Atrasada 20d · +1');
    expect(s.motivos.map((m) => m.texto)).toEqual(['Atrasada 20d', 'Custo +8%']);
  });

  it('atraso de 30 dias ou mais é crítico', () => {
    expect(saudeObra(A, '2026-10-03').nivel).toBe('critico');
  });

  it('pagar acima do contrato é crítico', () => {
    const o = JSON.parse(JSON.stringify(D));
    o.medicoes.push(medicao('CT-010', 110000, 110000));
    expect(saudeObra(o, HOJE).nivel).toBe('critico');
  });

  it('caixa negativo é crítico', () => {
    const o = JSON.parse(JSON.stringify(D));
    o.recebimentos = [];
    const s = saudeObra(o, HOJE);
    expect(s.nivel).toBe('critico');
    expect(s.texto).toContain('Caixa negativo');
  });

  it('obra vazia é "Configuração incompleta", com o que falta', () => {
    const s = saudeObra(B, HOJE);
    expect(s.nivel).toBe('incompleta');
    expect(s.texto).toBe('Configuração incompleta');
    expect(s.faltando).toEqual(['cronograma', 'orçamento']);
  });

  it('obra em dia é "No prazo"', () => {
    const o = JSON.parse(JSON.stringify(A));
    o.cronograma.forEach((e) => {
      e.progresso = 1;
    });
    o.medicoes = [medicao('CT-001', 50000, 50000)];
    expect(saudeObra(o, HOJE).texto).toBe('No prazo');
  });

  it('a ordem vai do pior para o melhor', () => {
    expect(ORDEM_SAUDE.critico).toBeLessThan(ORDEM_SAUDE.atencao);
    expect(ORDEM_SAUDE.atencao).toBeLessThan(ORDEM_SAUDE.incompleta);
    expect(ORDEM_SAUDE.incompleta).toBeLessThan(ORDEM_SAUDE.ok);
  });
});

describe('obras em risco', () => {
  it('conta crítico e atenção, separando prazo e custo', () => {
    const r = riscoCarteira(obras, HOJE);
    expect(r.total).toBe(1);
    expect(r.de).toBe(4);
    expect(r.prazo).toBe(1);
    expect(r.custo).toBe(1);
    expect(r.incompletas).toBe(3);
  });
});

/* =========================================================== agenda */
describe('próximos 14 dias', () => {
  const ag = agendaCarteira(obras, HOJE, 14);

  it('traz só o que cai no período, em ordem de data', () => {
    expect(ag.map((x) => [x.data, x.tipo])).toEqual([
      ['2026-09-30', 'material'],
      ['2026-10-03', 'recebimento'],
    ]);
  });

  it('cada item leva à tela onde se resolve', () => {
    expect(ag.map((x) => x.view)).toEqual(['materiais', 'recebimentos']);
  });

  it('o que já foi recebido não aparece', () => {
    expect(ag.some((x) => x.titulo.includes('Parcela 1'))).toBe(false);
  });
});

/* ========================================================== curva S */
describe('curva S da carteira', () => {
  it('com uma obra na conta, é a curva dela', () => {
    const cart = curvaSCarteira(obras);
    const dela = curvaS(A);
    expect(cart.map((p) => p.ym)).toEqual(dela.map((p) => p.ym));
    cart.forEach((p, i) => expect(p.fisicoPrevisto).toBeCloseTo(dela[i].fisicoPrevisto, 9));
  });

  it('os valores ficam entre 0 e 100%', () => {
    curvaSCarteira(obras).forEach((p) => {
      expect(p.fisicoPrevisto).toBeGreaterThanOrEqual(0);
      expect(p.fisicoPrevisto).toBeLessThanOrEqual(1.000001);
    });
  });

  it('sem nenhuma obra com cronograma, não há curva', () => {
    expect(curvaSCarteira([B, D])).toEqual([]);
  });
});

/* Lançamento e fixture: garante que a fixture continua coerente. */
describe('fixture', () => {
  it('reproduz o formato da carteira real: 4 obras, 1 com venda, 3 sem', () => {
    expect(obras.length).toBe(4);
    expect(obras.filter((o) => kpisObra(o).venda > 0).length).toBe(1);
    expect(novoLancamento).toBeTypeOf('function');
  });
});
