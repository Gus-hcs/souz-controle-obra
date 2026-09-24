/**
 * Composição do autorizado: contrato + acréscimos − supressões, com os
 * propostos à parte. A tela de Contratos mostra "37.440 − 1.500
 * (supressão)" a partir daqui — e a soma tem que bater com o autorizado de
 * indicadoresContrato, que é o número grande da mesma célula.
 */
import { describe, it, expect } from 'vitest';
import { novaObra, novoContrato } from '../src/nucleo/base.js';
import { composicaoContrato, indicadoresContrato } from '../src/dominio/calculos.js';
import { obraDaPlanilha } from './planilha.fixture.js';

const obra = (...aditivos) => {
  const o = novaObra('T');
  o.contratos.push(
    Object.assign(novoContrato(), {
      codigo: 'CT-001',
      codigoBase: 'CT-001',
      registro: 'Contrato',
      prestadorId: 'p',
      quantidade: 52,
      precoUnitario: 720,
    }),
  );
  aditivos.forEach((a, i) =>
    o.contratos.push(
      Object.assign(novoContrato(), {
        codigo: `CT-001-A${i + 1}`,
        codigoBase: 'CT-001',
        registro: 'Aditivo',
        ...a,
      }),
    ),
  );
  return o;
};
const confere = (o) => {
  const c = composicaoContrato(o, 'CT-001');
  expect(c.principal + c.totalAcrescimos - c.totalSupressoes).toBe(
    indicadoresContrato(o, 'CT-001').autorizado,
  );
  return c;
};

describe('composicaoContrato', () => {
  it('supressão aprovada subtrai; propostos ficam pendentes, com o sinal', () => {
    const c = confere(
      obra(
        { tipoAditivo: 'prazo', statusAditivo: 'proposto', novoPrazoAditivo: '2026-12-01' },
        { tipoAditivo: 'acrescimo', statusAditivo: 'proposto', valorInformado: 3200 },
        { tipoAditivo: 'supressao', statusAditivo: 'aprovado', valorInformado: 1500 },
      ),
    );
    expect(c.principal).toBe(37440);
    expect(c.totalSupressoes).toBe(1500);
    expect(c.supressoes).toHaveLength(1);
    expect(c.acrescimos).toHaveLength(0);
    expect(c.pendentes).toHaveLength(2);
    expect(c.pendentesValor).toBe(3200);
  });

  it('aditivo de prazo não mexe no valor, mesmo com valor digitado por engano', () => {
    const c = confere(
      obra({
        tipoAditivo: 'prazo',
        statusAditivo: 'aprovado',
        valorInformado: 999,
        novoPrazoAditivo: '2026-12-01',
      }),
    );
    expect(c.prazos).toHaveLength(1);
    expect(c.totalAcrescimos).toBe(0);
  });

  it('recusado e cancelado não contam em lugar nenhum', () => {
    const c = confere(
      obra(
        { tipoAditivo: 'acrescimo', statusAditivo: 'recusado', valorInformado: 5000 },
        {
          tipoAditivo: 'acrescimo',
          statusAditivo: 'aprovado',
          valorInformado: 800,
          status: 'Cancelado',
        },
      ),
    );
    expect(c.acrescimos).toHaveLength(0);
    expect(c.pendentes).toHaveLength(0);
  });

  it('planilha: CT-001 = 43.750 + aditivo de 6.500 (aditivo antigo vale como acréscimo aprovado)', () => {
    const o = obraDaPlanilha();
    const c = composicaoContrato(o, 'CT-001');
    expect(c.principal).toBe(43750);
    expect(c.totalAcrescimos).toBe(6500);
    expect(c.principal + c.totalAcrescimos).toBe(indicadoresContrato(o, 'CT-001').autorizado);
  });
});
