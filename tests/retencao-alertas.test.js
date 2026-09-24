/**
 * Retenção do contrato nos alertas de medição.
 *
 * Com retenção, a medição é paga pelo líquido menos a parte retida — que
 * fica presa até a entrega. Isso não é falta de pagamento: não pode gerar
 * "marcada como paga sem quitação" nem "em aberto há N dias".
 */
import { describe, it, expect } from 'vitest';
import { addDias, hojeISO, novaMedicao, novaObra, novoContrato } from '../src/nucleo/base.js';
import {
  alertasObra,
  indicadoresContrato,
  kpisObra,
  medicaoAlerta,
  medicaoAPagar,
  medicaoRetencao,
} from '../src/dominio/calculos.js';

function obraCom({ retencao = 0.1, pago = 9000, status = 'Pago', diasAtras = 30 } = {}) {
  const o = novaObra('Teste retenção');
  o.contratos.push(
    Object.assign(novoContrato(), {
      codigo: 'CT-001',
      codigoBase: 'CT-001',
      registro: 'Contrato',
      prestadorId: 'p1',
      valorInformado: 50000,
      retencaoPct: retencao,
    }),
  );
  o.medicoes.push(
    Object.assign(novaMedicao(), {
      contratoBase: 'CT-001',
      numero: '1',
      data: addDias(hojeISO(), -diasAtras),
      valorMedido: 10000,
      desconto: 0,
      valorPago: pago,
      status,
    }),
  );
  return o;
}
const titulos = (o) =>
  alertasObra(o)
    .filter((a) => a.modulo === 'Medições')
    .map((a) => a.titulo);

describe('retenção de 10% na medição', () => {
  it('pago 90%: retenção não é falta — sem alerta e nada a pagar', () => {
    const o = obraCom({ pago: 9000 });
    const m = o.medicoes[0];
    expect(medicaoRetencao(o, m)).toBe(1000);
    expect(medicaoAPagar(o, m)).toBe(0);
    expect(medicaoAlerta(o, m)).toBe('OK');
    expect(titulos(o)).toEqual([]);
  });

  it('pago 80%: falta R$ 1.000 além da retenção — alerta', () => {
    const o = obraCom({ pago: 8000 });
    const m = o.medicoes[0];
    expect(medicaoAPagar(o, m)).toBe(1000);
    expect(medicaoAlerta(o, m)).toBe('PAGAMENTO INCOMPLETO');
    expect(titulos(o)).toEqual([
      'Medição 1 marcada como paga sem quitação',
      'Medição 1 em aberto há 30 dias',
    ]);
    expect(alertasObra(o).find((a) => a.titulo.includes('sem quitação')).detalhe).toMatch(/1\.000/);
  });

  it('em aberto e recente (menos de 15 dias): conta como a pagar, sem alerta de atraso', () => {
    const o = obraCom({ pago: 0, status: 'Em aberto', diasAtras: 5 });
    expect(medicaoAPagar(o, o.medicoes[0])).toBe(9000);
    expect(titulos(o)).toEqual([]);
  });

  it('o "a pagar" do contrato e o da obra somam igual ao das medições', () => {
    const o = obraCom({ pago: 8000 });
    expect(indicadoresContrato(o, 'CT-001').aPagarAgora).toBe(1000);
    expect(kpisObra(o).medicoesNaoPagas).toBe(1000);
  });
});

describe('sem retenção, nada muda', () => {
  it('pago a menos com status Pago continua alertando', () => {
    const o = obraCom({ retencao: 0, pago: 9000 });
    expect(medicaoAPagar(o, o.medicoes[0])).toBe(1000);
    expect(medicaoAlerta(o, o.medicoes[0])).toBe('PAGAMENTO INCOMPLETO');
  });

  it('medição cancelada não tem nada a pagar', () => {
    const o = obraCom({ retencao: 0, pago: 0, status: 'Cancelado' });
    expect(medicaoAPagar(o, o.medicoes[0])).toBe(0);
  });
});
