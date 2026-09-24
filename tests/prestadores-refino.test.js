/**
 * Refino da tela de prestadores: nome de exibição, "sem contrato" no lugar
 * de um R$ 0 falso, e o aviso de pagamentos sem contrato.
 */
import { describe, expect, it } from 'vitest';
import {
  estadoInicial,
  migrar,
  nomeExibicao,
  novaObra,
  novoContrato,
  novoLancamento,
  novaMedicao,
  novoPrestador,
} from '../src/nucleo/base.js';
import {
  prestadoresPagosSemContrato,
  resumoPrestador,
  totaisPrestadores,
} from '../src/dominio/calculos.js';

describe('nomeExibicao — só o que está todo em caixa alta muda', () => {
  it.each([
    ['WESLEY PINTOR', 'Wesley Pintor'],
    ['MARIA DAS DORES DE SOUZA', 'Maria das Dores de Souza'],
    ['  JOÃO   PEDREIRO ', 'João Pedreiro'],
    ['João da Silva', 'João da Silva'],
    ['MRV Engenharia', 'MRV Engenharia'], // já escrito à mão: fica
    ['Construtora Alfa', 'Construtora Alfa'],
    ['', ''],
  ])('%s → %s', (entrada, esperado) => {
    expect(nomeExibicao(entrada)).toBe(esperado);
  });
});

function estado() {
  const e = estadoInicial();
  const P = (o) => Object.assign(novoPrestador(), o);
  e.prestadores.push(
    P({ id: 'com', nome: 'Com Contrato' }),
    P({ id: 'lanc', nome: 'Só Lançamento' }),
    P({ id: 'nada', nome: 'Sem Nada' }),
    P({ id: 'arq', nome: 'Arquivado Pago', arquivado: true }),
  );
  const o = Object.assign(novaObra(), { id: 'o1', nome: 'Casa 12' });
  o.contratos.push(
    Object.assign(novoContrato(), {
      codigo: 'CT-1',
      codigoBase: 'CT-1',
      prestadorId: 'com',
      valorInformado: 9000,
      status: 'Em andamento',
    }),
  );
  o.medicoes.push(
    Object.assign(novaMedicao(), {
      contratoBase: 'CT-1',
      valorMedido: 3000,
      valorPago: 3000,
      status: 'Pago',
    }),
  );
  o.lancamentos.push(
    ...[1, 2, 3, 4, 5].map((i) =>
      Object.assign(novoLancamento(), {
        descricao: `Semana ${i}`,
        prestadorId: 'lanc',
        quantidade: 1,
        precoUnitario: 7542,
      }),
    ),
    Object.assign(novoLancamento(), {
      descricao: 'Antigo',
      prestadorId: 'arq',
      quantidade: 1,
      precoUnitario: 100,
    }),
  );
  e.obras.push(o);
  return migrar(e);
}
const est = estado();
const [COM, LANC, NADA] = est.prestadores;

describe('sem contrato não vira R$ 0', () => {
  it('temContrato separa quem tem contrato de quem só recebeu por lançamento', () => {
    expect(resumoPrestador(est, COM).temContrato).toBe(true);
    expect(resumoPrestador(est, LANC).temContrato).toBe(false);
    expect(resumoPrestador(est, NADA).temContrato).toBe(false);
  });

  it('conta a origem dos pagamentos — "5 lançamentos", "1 medição"', () => {
    const r = resumoPrestador(est, LANC);
    expect(r.qtdLancamentos).toBe(5);
    expect(r.qtdMedicoesPagas).toBe(0);
    expect(r.pago).toBe(37710);
    expect(resumoPrestador(est, COM).qtdMedicoesPagas).toBe(1);
  });

  it('o rodapé sabe quando ninguém da lista tem contrato', () => {
    expect(totaisPrestadores(est, [LANC, NADA]).comContrato).toBe(0);
    expect(totaisPrestadores(est, [COM, LANC]).comContrato).toBe(1);
  });
});

describe('aviso de pagamentos sem contrato', () => {
  it('lista quem recebeu sem contrato, fora os arquivados', () => {
    expect(prestadoresPagosSemContrato(est)).toEqual([
      { id: 'lanc', nome: 'Só Lançamento', pago: 37710 },
    ]);
  });

  it('quem não recebeu nada não entra — não há o que vincular', () => {
    expect(prestadoresPagosSemContrato(est).some((x) => x.id === 'nada')).toBe(false);
  });
});
