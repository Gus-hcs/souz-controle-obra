/**
 * Situação calculada e indicadores por código-base — Fase 1 do redesenho de
 * "Contratos e aditivos" (ver print e briefing da tela).
 *
 * A fixture reproduz a obra do print: CT-001 (Marcos Empreitada, empreitada
 * principal + aditivo do muro) e CT-002 (Pintura Silva, ainda não iniciado).
 * "Hoje" fica travado em 24/09/2026 — a mesma data em que a situação foi
 * descrita no briefing ("Atrasado 22 dias" para o CT-001).
 */
import { describe, expect, it } from 'vitest';
import {
  estadoInicial,
  novaObra,
  novoContrato,
  novaMedicao,
  novoPrestador,
} from '../src/nucleo/base.js';
import {
  contratoFimVigente,
  contratoSituacao,
  indicadoresContrato,
  previaVinculoPrestadores,
} from '../src/dominio/calculos.js';

const HOJE = '2026-09-24';

const C = (o) => Object.assign(novoContrato(), { status: 'Em andamento', ...o });
const M = (o) => Object.assign(novaMedicao(), o);

function obraDoPrint() {
  const obra = Object.assign(novaObra(), { id: 'o1', nome: 'Casa 12 — Residencial Aurora' });
  obra.contratos.push(
    C({
      id: 'ct-001',
      codigo: 'CT-001',
      codigoBase: 'CT-001',
      registro: 'Contrato',
      prestador: 'Marcos Empreitada',
      escopo: 'Empreitada principal',
      regime: 'R$/m²',
      quantidade: 62.5,
      unidade: 'm²',
      precoUnitario: 700,
      inicioPrevisto: '2026-03-05',
      fimPrevisto: '2026-09-02',
    }),
    C({
      id: 'ct-001-a1',
      codigo: 'CT-001-A1',
      codigoBase: 'CT-001',
      registro: 'Aditivo',
      prestador: 'Marcos Empreitada',
      escopo: 'Muro frontal e calçada',
      regime: 'Preço fechado',
      valorInformado: 6500,
      inicioPrevisto: '2026-07-04',
      fimPrevisto: '2026-07-23',
    }),
    C({
      id: 'ct-002',
      codigo: 'CT-002',
      codigoBase: 'CT-002',
      registro: 'Contrato',
      prestador: 'Pintura Silva',
      escopo: 'Pintura geral',
      regime: 'Preço fechado',
      valorInformado: 4200,
      status: 'Planejado',
      inicioPrevisto: '2026-08-23',
      fimPrevisto: '2026-09-17',
    }),
  );
  obra.medicoes.push(
    M({
      contratoBase: 'CT-001',
      numero: '1',
      data: '2026-08-25',
      valorMedido: 46700,
      valorPago: 46500,
      status: 'Parcial',
    }),
  );
  return obra;
}

describe('indicadoresContrato — autorizado, medido, pago, retido, a_pagar_agora, a_medir', () => {
  const obra = obraDoPrint();

  it('CT-001: autorizado soma o aditivo aprovado; a_pagar_agora é medido − pago (sem retenção)', () => {
    const i = indicadoresContrato(obra, 'CT-001');
    expect(i.autorizado).toBeCloseTo(50250, 2); // 43.750 (principal) + 6.500 (aditivo)
    expect(i.medido).toBeCloseTo(46700, 2);
    expect(i.pago).toBeCloseTo(46500, 2);
    expect(i.retido).toBe(0);
    expect(i.aPagarAgora).toBeCloseTo(200, 2);
    expect(i.aMedir).toBeCloseTo(3550, 2); // 50.250 − 46.700
  });

  it('CT-002: nada medido nem pago — a_medir é o autorizado inteiro', () => {
    const i = indicadoresContrato(obra, 'CT-002');
    expect(i.autorizado).toBeCloseTo(4200, 2);
    expect(i.medido).toBe(0);
    expect(i.pago).toBe(0);
    expect(i.aPagarAgora).toBe(0);
    expect(i.aMedir).toBeCloseTo(4200, 2);
  });

  it('retenção pequena: reduz a_pagar_agora, sem zerar', () => {
    const o2 = obraDoPrint();
    o2.contratos.find((c) => c.id === 'ct-001').retencaoPct = 0.002; // 46.700 × 0,2% = 93,40
    const i = indicadoresContrato(o2, 'CT-001');
    expect(i.retido).toBeCloseTo(93.4, 2);
    expect(i.aPagarAgora).toBeCloseTo(46700 - 93.4 - 46500, 2); // 106,60
  });

  it('retenção maior que o saldo: a_pagar_agora nunca fica negativo', () => {
    const o2 = obraDoPrint();
    o2.contratos.find((c) => c.id === 'ct-001').retencaoPct = 0.05; // retido > (medido − pago)
    const i = indicadoresContrato(o2, 'CT-001');
    expect(i.retido).toBeCloseTo(46700 * 0.05, 2);
    expect(i.aPagarAgora).toBe(0);
  });

  it('aditivo proposto ou recusado não entra no autorizado; supressão subtrai', () => {
    const o2 = obraDoPrint();
    const a1 = o2.contratos.find((c) => c.id === 'ct-001-a1');
    a1.statusAditivo = 'proposto';
    expect(indicadoresContrato(o2, 'CT-001').autorizado).toBeCloseTo(43750, 2);

    a1.statusAditivo = 'aprovado';
    a1.tipoAditivo = 'supressao';
    expect(indicadoresContrato(o2, 'CT-001').autorizado).toBeCloseTo(43750 - 6500, 2);
  });
});

describe('contratoSituacao — nunca contradiz as datas, nunca é digitada', () => {
  const obra = obraDoPrint();

  it('CT-001: passou do fim vigente sem medir tudo → "Atrasado N dias"', () => {
    const s = contratoSituacao(obra, 'CT-001', HOJE);
    expect(s.texto).toBe('Atrasado 22 dias');
    expect(s.chave).toBe('atrasado');
    expect(s.atrasoDias).toBe(22);
  });

  it('CT-002: início já passou e nada foi medido → "Não iniciado · atrasado" (não "Planejado")', () => {
    const s = contratoSituacao(obra, 'CT-002', HOJE);
    expect(s.texto).toBe('Não iniciado · atrasado');
  });

  it('antes do início → "Não iniciado"', () => {
    const s = contratoSituacao(obra, 'CT-002', '2026-08-01');
    expect(s.texto).toBe('Não iniciado');
  });

  it('dentro do prazo, com algo medido → "Em andamento"', () => {
    const s = contratoSituacao(obra, 'CT-001', '2026-08-20');
    expect(s.texto).toBe('Em andamento');
  });

  it('aditivo de prazo aprovado estende o fim vigente e tira o atraso', () => {
    const o2 = obraDoPrint();
    o2.contratos.push(
      C({
        id: 'ct-001-a2',
        codigo: 'CT-001-A2',
        codigoBase: 'CT-001',
        registro: 'Aditivo',
        tipoAditivo: 'prazo',
        statusAditivo: 'aprovado',
        novoPrazoAditivo: '2026-10-15',
        motivoAditivo: 'Chuvas em agosto atrasaram a cobertura.',
      }),
    );
    expect(contratoFimVigente(o2.contratos.filter((c) => c.codigoBase === 'CT-001'))).toBe(
      '2026-10-15',
    );
    expect(contratoSituacao(o2, 'CT-001', HOJE).texto).toBe('Em andamento');
  });

  it('aditivo de prazo PROPOSTO não estende o fim — continua atrasado', () => {
    const o2 = obraDoPrint();
    o2.contratos.push(
      C({
        id: 'ct-001-a2',
        codigo: 'CT-001-A2',
        codigoBase: 'CT-001',
        registro: 'Aditivo',
        tipoAditivo: 'prazo',
        statusAditivo: 'proposto',
        novoPrazoAditivo: '2026-10-15',
      }),
    );
    expect(contratoSituacao(o2, 'CT-001', HOJE).texto).toBe('Atrasado 22 dias');
  });

  it('medido 100% e pago abaixo do líquido → "Medido 100% · a pagar"', () => {
    const o2 = obraDoPrint();
    const med = o2.medicoes.find((m) => m.contratoBase === 'CT-001');
    med.valorMedido = 50250;
    med.valorPago = 40000;
    expect(contratoSituacao(o2, 'CT-001', HOJE).texto).toBe('Medido 100% · a pagar');
  });

  it('medido 100% e pago cobre o líquido (sem retenção pendente) → "Encerrado"', () => {
    const o2 = obraDoPrint();
    const med = o2.medicoes.find((m) => m.contratoBase === 'CT-001');
    med.valorMedido = 50250;
    med.valorPago = 50250;
    expect(contratoSituacao(o2, 'CT-001', HOJE).texto).toBe('Encerrado');
  });

  it('override manual: Paralisado com motivo, ignora as datas', () => {
    const o2 = obraDoPrint();
    Object.assign(
      o2.contratos.find((c) => c.id === 'ct-002'),
      {
        situacaoManual: 'Paralisado',
        motivoSituacaoManual: 'Cliente pediu para aguardar.',
      },
    );
    const s = contratoSituacao(o2, 'CT-002', '2026-08-01'); // antes do início — sem override seria "Não iniciado"
    expect(s.texto).toBe('Paralisado');
    expect(s.motivo).toBe('Cliente pediu para aguardar.');
  });
});

describe('previaVinculoPrestadores — casamento pelo nome digitado, sem aplicar nada', () => {
  it('casa exatamente um prestador; contrato já ligado por id não entra na prévia', () => {
    const e = estadoInicial();
    e.prestadores.push(
      Object.assign(novoPrestador(), { id: 'p-marcos', nome: 'Marcos Empreitada' }),
    );
    const obra = obraDoPrint();
    e.obras.push(obra);

    const previa = previaVinculoPrestadores(e);
    expect(previa.casaram.map((x) => x.referencia)).toEqual(
      expect.arrayContaining(['CT-001', 'CT-001-A1']),
    );
    expect(previa.casaram.every((x) => x.prestadorId === 'p-marcos')).toBe(true);
    // CT-002 (Pintura Silva) não tem cadastro correspondente
    expect(previa.semCadastro.map((x) => x.referencia)).toContain('CT-002');
  });

  it('nome ambíguo (dois prestadores com o mesmo nome) aparece em "ambíguos"', () => {
    const e = estadoInicial();
    e.prestadores.push(
      Object.assign(novoPrestador(), { id: 'p1', nome: 'Pintura Silva' }),
      Object.assign(novoPrestador(), { id: 'p2', nome: 'Pintura Silva' }),
    );
    const obra = obraDoPrint();
    e.obras.push(obra);

    const previa = previaVinculoPrestadores(e);
    const ambiguo = previa.ambiguos.find((x) => x.referencia === 'CT-002');
    expect(ambiguo).toBeTruthy();
    expect(ambiguo.candidatos).toHaveLength(2);
  });

  it('contrato já com prestadorId não entra na prévia, mesmo com texto preenchido', () => {
    const e = estadoInicial();
    e.prestadores.push(
      Object.assign(novoPrestador(), { id: 'p-marcos', nome: 'Marcos Empreitada' }),
    );
    const obra = obraDoPrint();
    obra.contratos.find((c) => c.id === 'ct-001').prestadorId = 'p-marcos';
    e.obras.push(obra);

    const previa = previaVinculoPrestadores(e);
    expect(previa.casaram.some((x) => x.referencia === 'CT-001')).toBe(false);
  });
});
