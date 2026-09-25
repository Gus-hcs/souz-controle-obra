/**
 * Onda 1 da auditoria tela a tela (25/09/2026) — "confiança nos números".
 *
 * A obra daqui é a Casa 14 da demonstração (db/demo/02_casa14_vila_nova.sql),
 * a que a auditoria usou como referência. Cada teste prova um número que a
 * auditoria achou errado ou divergente entre telas:
 *   1. valor contratado: supressão subtrai, aditivo proposto fica fora;
 *   2. % do financiamento: dinheiro do cliente não é liberação da CAIXA;
 *   3. contagem de alertas: a mesma em menu, painel, alertas e medições;
 *   6. posição projetada: desconta o que ainda falta gastar;
 *   8. custo por m²: só custo físico, e o alerta é informativo.
 */
import { describe, it, expect, vi, afterAll } from 'vitest';
import {
  novaObra,
  novoContrato,
  novaMedicao,
  novoRecebimento,
  novoLancamento,
  novoMaterial,
  novaEtapaCronograma,
} from '../src/nucleo/base.js';
import {
  alertasObra,
  basesContratuais,
  contratoTotalAutorizado,
  kpisObra,
  lancamentoCustoFisico,
  medicoesComPendencia,
  pendenciasObra,
  recebimentoDoFinanciamento,
} from '../src/dominio/calculos.js';

const HOJE = '2026-09-25';
vi.useFakeTimers();
vi.setSystemTime(new Date(`${HOJE}T12:00:00Z`));
afterAll(() => vi.useRealTimers());

const h = (n) => {
  const d = new Date(`${HOJE}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const perto = (a, b, tol = 0.01) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);

function casa14() {
  const o = novaObra('Casa 14 — Vila Nova Esperança');
  Object.assign(o, {
    areaConstruida: 52,
    dataInicio: h(-240),
    previsaoConclusao: h(-10),
    status: 'Em andamento',
  });
  Object.assign(o.fin, {
    saldoInicial: 3000,
    valorTerreno: 42000,
    valorFinanciado: 150000,
    recursosProprios: 18000,
    precoEmpreitadaM2: 720,
    custoFisicoMaxM2: 1200,
    valorVenda: 205000,
    margemDesejada: 0.15,
  });

  const c = (x) => Object.assign(novoContrato(), x);
  o.contratos.push(
    c({ codigo: 'CT-001', codigoBase: 'CT-001', registro: 'Contrato', quantidade: 52, precoUnitario: 720,
        valorInformado: 0, inicioPrevisto: h(-236), fimPrevisto: h(-30), status: 'Em andamento' }),
    c({ codigo: 'CT-001-A1', codigoBase: 'CT-001', registro: 'Aditivo', tipoAditivo: 'prazo',
        statusAditivo: 'proposto', valorInformado: 0, novoPrazoAditivo: h(25), status: 'Em andamento' }),
    c({ codigo: 'CT-001-A2', codigoBase: 'CT-001', registro: 'Aditivo', tipoAditivo: 'acrescimo',
        statusAditivo: 'proposto', valorInformado: 3200, status: 'Em andamento' }),
    c({ codigo: 'CT-001-A3', codigoBase: 'CT-001', registro: 'Aditivo', tipoAditivo: 'supressao',
        statusAditivo: 'aprovado', valorInformado: 1500, status: 'Em andamento' }),
    c({ codigo: 'CT-002', codigoBase: 'CT-002', registro: 'Contrato', valorInformado: 7800,
        inicioPrevisto: h(-150), fimPrevisto: h(-110), status: 'Concluído' }),
    c({ codigo: 'CT-003', codigoBase: 'CT-003', registro: 'Contrato', quantidade: 52, precoUnitario: 45,
        valorInformado: 0, inicioPrevisto: h(-20), fimPrevisto: h(10), status: 'Planejado' }),
  );

  const m = (x) => Object.assign(novaMedicao(), x);
  o.medicoes.push(
    m({ contratoBase: 'CT-001', numero: '1', data: h(-205), valorMedido: 7900, dataPagamento: h(-202), valorPago: 7900, status: 'Pago' }),
    m({ contratoBase: 'CT-001', numero: '2', data: h(-160), valorMedido: 9350, dataPagamento: h(-157), valorPago: 9350, status: 'Pago' }),
    m({ contratoBase: 'CT-001', numero: '3', data: h(-100), valorMedido: 7900, dataPagamento: h(-96), valorPago: 7900, status: 'Pago' }),
    m({ contratoBase: 'CT-001', numero: '4', data: h(-45), valorMedido: 5400, valorPago: 0, status: 'Em aberto' }),
    m({ contratoBase: 'CT-002', numero: '1', data: h(-128), valorMedido: 3900, dataPagamento: h(-125), valorPago: 3900, status: 'Pago' }),
    m({ contratoBase: 'CT-002', numero: '2', data: h(-108), valorMedido: 3900, dataPagamento: h(-100), valorPago: 2300, status: 'Parcial' }),
  );

  const r = (x) => Object.assign(novoRecebimento(), x);
  o.recebimentos.push(
    r({ origem: 'Cliente', etapaPci: 'Entrada do cliente', dataPrevista: h(-240), valorPrevisto: 18000,
        dataRecebimento: h(-238), valorRecebido: 18000, status: 'Recebido' }),
    r({ origem: 'CAIXA', numeroMedicao: '1', dataPrevista: h(-210), valorPrevisto: 30000, valorAprovado: 30000,
        descontos: 210, dataRecebimento: h(-204), valorRecebido: 29790, status: 'Recebido' }),
    r({ origem: 'CAIXA', numeroMedicao: '2', dataPrevista: h(-165), valorPrevisto: 37500, valorAprovado: 37500,
        descontos: 262.5, dataRecebimento: h(-158), valorRecebido: 37237.5, status: 'Recebido' }),
    r({ origem: 'CAIXA', numeroMedicao: '3', dataPrevista: h(-40), valorPrevisto: 37500, dataSolicitacao: h(-45),
        status: 'Solicitado' }),
    r({ origem: 'CAIXA', numeroMedicao: '4', dataPrevista: h(30), valorPrevisto: 45000, status: 'Previsto' }),
  );

  const mat = (x) => Object.assign(novoMaterial(), x);
  const cimento = mat({ etapa: 'Fundação', material: 'Cimento CP II 50 kg', quantidadeNecessaria: 100, unidade: 'saco', dataNecessaria: h(-230), precoPrevisto: 37 });
  const rejunte = mat({ etapa: 'Pisos e revestimentos', material: 'Rejunte', quantidadeNecessaria: 40, unidade: 'saco', dataNecessaria: h(-6), precoPrevisto: 31 });
  const tinta = mat({ etapa: 'Pintura', material: 'Tinta acrílica 18 L', quantidadeNecessaria: 9, unidade: 'lata', dataNecessaria: h(8), precoPrevisto: 235 });
  o.materiais.push(cimento, rejunte, tinta);

  const l = (x) => Object.assign(novoLancamento(), x);
  o.lancamentos.push(
    l({ data: h(-232), tipo: 'Taxa/imposto', descricao: 'ART', quantidade: 1, precoUnitario: 262 }),
    l({ data: h(-230), tipo: 'Taxa/imposto', descricao: 'Alvará', quantidade: 1, precoUnitario: 650 }),
    l({ data: h(-228), tipo: 'Material', etapa: 'Fundação', descricao: 'Cimento CP II 50 kg', quantidade: 90,
        precoUnitario: 37, frete: 150, materialId: cimento.id }),
    l({ data: h(-120), tipo: 'Material', descricao: 'Material de obra', quantidade: 1, precoUnitario: 20000 }),
    l({ data: h(-40), tipo: 'Honorário técnico/gestão', descricao: 'Acompanhamento', quantidade: 1, precoUnitario: 1200 }),
    l({ data: h(-20), tipo: 'Comissão imobiliária', descricao: 'Comissão do corretor', quantidade: 1, precoUnitario: 6150 }),
  );

  const e = (x) => Object.assign(novaEtapaCronograma(), x);
  o.cronograma.push(
    e({ etapa: 'Fundação', inicioPrevisto: h(-232), fimPrevisto: h(-210), inicioReal: h(-229), fimReal: h(-200), progresso: 1, peso: 12 }),
    e({ etapa: 'Reboco e requadros', inicioPrevisto: h(-110), fimPrevisto: h(-40), inicioReal: h(-100), progresso: 0.9, peso: 9 }),
    e({ etapa: 'Pintura', inicioPrevisto: h(5), fimPrevisto: h(25), progresso: 0, peso: 6 }),
  );
  return o;
}

describe('1. valor contratado — uma fonte só', () => {
  const o = casa14();

  it('CT-001: supressão subtrai e o aditivo proposto fica fora (35.940, não 42.140)', () => {
    expect(contratoTotalAutorizado(o, 'CT-001')).toBe(35940);
    const b = basesContratuais(o).find((x) => x.base === 'CT-001');
    expect(b.autorizado).toBe(35940);
    expect(b.valorAditivos).toBe(-1500);
    expect(b.pendente).toBe(3200);
  });

  it('contratado da obra é 46.080 — o mesmo número da tela de Contratos', () => {
    const k = kpisObra(o);
    expect(k.contratado).toBe(46080);
    expect(k.aditivosPendentes).toBe(3200);
    expect(k.contratado).toBe(basesContratuais(o).reduce((s, b) => s + b.autorizado, 0));
  });
});

describe('2. % do financiamento — só o dinheiro do financiador', () => {
  const o = casa14();
  const k = kpisObra(o);

  it('entrada do cliente fica fora do liberado (44,7%, não 57%)', () => {
    perto(k.recebido, 85027.5);
    perto(k.recebidoFinanciamento, 67027.5);
    perto(k.recebidoProprio, 18000);
    perto(k.liberadoFinanciamento, 0.44685, 0.0001);
  });

  it('a receber do financiamento desconta só o que o financiador liberou', () => {
    perto(k.aReceber, 150000 - 67027.5);
  });

  it('origem: Cliente e Recursos próprios são próprios; CAIXA, Outro e vazio, financiamento', () => {
    expect(recebimentoDoFinanciamento({ origem: 'CAIXA' })).toBe(true);
    expect(recebimentoDoFinanciamento({ origem: 'Outro' })).toBe(true);
    expect(recebimentoDoFinanciamento({ origem: '' })).toBe(true);
    expect(recebimentoDoFinanciamento({ origem: 'Cliente' })).toBe(false);
    expect(recebimentoDoFinanciamento({ origem: 'Recursos próprios' })).toBe(false);
  });

  it('sem valor financiado, o % não existe (null), não é 0%', () => {
    const s = casa14();
    s.fin.valorFinanciado = 0;
    expect(kpisObra(s).liberadoFinanciamento).toBeNull();
  });
});

describe('3. contagem de alertas — a mesma em toda tela', () => {
  const o = casa14();
  const pend = pendenciasObra(o);

  it('pendência = crítico + atenção; informativo aparece mas não soma', () => {
    const todos = alertasObra(o);
    expect(pend.total).toBe(todos.filter((a) => a.sev >= 2).length);
    expect(pend.total + pend.avisos).toBe(todos.length);
    expect(pend.criticas + pend.atencao).toBe(pend.total);
  });

  it('medições: conta a medição em aberto há 45 dias e a parcial há 108 (antes dizia 0)', () => {
    const ids = medicoesComPendencia(o);
    const abertas = o.medicoes.filter((m) => m.numero === '4' || (m.contratoBase === 'CT-002' && m.numero === '2'));
    expect(ids.size).toBe(2);
    abertas.forEach((m) => expect(ids.has(m.id)).toBe(true));
    expect(ids.size).toBe(pend.porView.medicoes);
  });
});

describe('6. posição no fim da obra — desconta o que falta gastar', () => {
  const o = casa14();
  const k = kpisObra(o);

  it('custo a incorrer = saldo dos contratos + materiais a comprar', () => {
    perto(k.custoAIncorrer, Math.max(0, k.saldoContratual) + k.materiaisSaldo);
    perto(k.custoAIncorrer, k.custoPrevisto - k.totalPago);
  });

  it('posição = saldo + a receber − custo a incorrer (nunca só − medições a pagar)', () => {
    perto(k.posicaoProjetada, k.saldoCaixa + k.previstoNaoRecebido - k.custoAIncorrer);
    expect(k.posicaoProjetada).toBeLessThan(k.saldoCaixa + k.previstoNaoRecebido - k.medicoesNaoPagas);
  });
});

describe('8. custo por m² — só obra física', () => {
  const o = casa14();
  const k = kpisObra(o);

  it('taxa, honorário, comissão e terreno não são custo físico', () => {
    ['Taxa/imposto', 'Honorário técnico/gestão', 'Comissão imobiliária', 'Terreno'].forEach((tipo) =>
      expect(lancamentoCustoFisico({ tipo })).toBe(false),
    );
    ['Material', 'Serviço avulso', 'Fornecimento + instalação', 'Outra saída'].forEach((tipo) =>
      expect(lancamentoCustoFisico({ tipo })).toBe(true),
    );
  });

  it('custo físico previsto = previsto − (262 + 650 + 1.200 + 6.150)', () => {
    perto(k.custoNaoFisico, 8262);
    perto(k.custoFisicoPrevisto, k.custoPrevisto - 8262);
    perto(k.custoFisicoPrevistoM2, k.custoFisicoPrevisto / 52);
  });

  it('teto estourado vira informativo, não crítico, e compara o custo físico', () => {
    const a = alertasObra(o).find((x) => /Custo físico por m²/.test(x.titulo));
    expect(a).toBeTruthy();
    expect(a.sev).toBe(1);
    expect(a.detalhe).toContain('/m² de obra física');
  });

  it('sem estouro físico, nenhum alerta — mesmo com comissão alta no total', () => {
    const s = casa14();
    s.fin.custoFisicoMaxM2 = Math.ceil(kpisObra(s).custoFisicoPrevistoM2) + 1;
    expect(kpisObra(s).custoPrevistoM2).toBeGreaterThan(s.fin.custoFisicoMaxM2);
    expect(alertasObra(s).some((x) => /Custo físico por m²/.test(x.titulo))).toBe(false);
  });
});
