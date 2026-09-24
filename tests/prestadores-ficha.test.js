/**
 * Ficha do prestador: avaliação, duplicidade no cadastro, totais da lista
 * e as mensagens prontas do WhatsApp.
 */
import { describe, expect, it } from 'vitest';
import {
  estadoInicial,
  LISTAS_PADRAO,
  migrar,
  novaMedicao,
  novaObra,
  novoContrato,
  novoLancamento,
  novoPrestador,
} from '../src/nucleo/base.js';
import {
  avaliacaoPrestador,
  duplicadosPrestador,
  resumoPrestador,
  totaisPrestadores,
} from '../src/dominio/calculos.js';
import { validarContrato } from '../src/dominio/validacao.js';
import { lerModelosMensagem, preencherMensagem } from '../src/nucleo/contato.js';

const prest = (o) => Object.assign(novoPrestador(), o);

function estado() {
  const e = estadoInicial();
  e.prestadores.push(
    prest({ id: 'a', nome: 'Ana', whatsapp: '5562999998888', documento: '529.982.247-25' }),
    prest({ id: 'b', nome: 'Beto', telefone: '5562999998888' }),
    prest({ id: 'c', nome: 'Caio', documento: '52998224725' }),
    prest({ id: 'd', nome: 'Dani' }),
  );
  const o = Object.assign(novaObra(), { id: 'o1', nome: 'Casa 12' });
  o.contratos.push(
    Object.assign(novoContrato(), {
      codigo: 'CT-1',
      codigoBase: 'CT-1',
      prestadorId: 'a',
      valorInformado: 10000,
      status: 'Concluído',
      avalPrazo: 4,
      avalQualidade: 5,
      avalOrganizacao: 3,
    }),
    Object.assign(novoContrato(), {
      codigo: 'CT-2',
      codigoBase: 'CT-2',
      prestadorId: 'a',
      valorInformado: 6000,
      status: 'Concluído',
      avalPrazo: 2,
      avalQualidade: 0,
      avalOrganizacao: 0,
    }),
    Object.assign(novoContrato(), {
      codigo: 'CT-3',
      codigoBase: 'CT-3',
      prestadorId: 'b',
      valorInformado: 4000,
      status: 'Em andamento',
    }),
  );
  o.medicoes.push(
    Object.assign(novaMedicao(), {
      contratoBase: 'CT-1',
      valorMedido: 10000,
      valorPago: 10000,
      status: 'Pago',
    }),
  );
  o.lancamentos.push(
    Object.assign(novoLancamento(), {
      descricao: 'Diária',
      prestadorId: 'b',
      quantidade: 2,
      precoUnitario: 200,
    }),
  );
  e.obras.push(o);
  return migrar(e);
}
const est = estado();
const [A, B, C, D] = est.prestadores;

describe('avaliação do prestador', () => {
  const a = avaliacaoPrestador(est, A);

  it('nota do contrato = média dos critérios informados; média = média dos contratos', () => {
    /* CT-1: (4+5+3)/3 = 4; CT-2: só prazo, 2 → média (4+2)/2 = 3 */
    expect(a.media).toBeCloseTo(3, 9);
    expect(a.avaliacoes).toBe(2);
  });

  it('média por critério ignora o 0 (não avaliado)', () => {
    const porK = Object.fromEntries(a.criterios.map((c) => [c.chave, c.media]));
    expect(porK.avalPrazo).toBeCloseTo(3, 9);
    expect(porK.avalQualidade).toBeCloseTo(5, 9);
    expect(porK.avalOrganizacao).toBeCloseTo(3, 9);
  });

  it('sem nenhuma avaliação, a média é nula — a célula fica vazia', () => {
    expect(avaliacaoPrestador(est, B).media).toBeNull();
  });

  it('nota fora de 1–5 é recusada no contrato; 0 é "não avaliado"', () => {
    expect(validarContrato({ codigo: 'X', avalPrazo: 6 }).map((p) => p.campo)).toEqual([
      'avalPrazo',
    ]);
    expect(validarContrato({ codigo: 'X', avalPrazo: 2.5 }).map((p) => p.campo)).toEqual([
      'avalPrazo',
    ]);
    expect(validarContrato({ codigo: 'X', avalPrazo: 0, avalQualidade: 5 })).toEqual([]);
  });
});

describe('duplicidade no cadastro', () => {
  it('mesmo telefone (WhatsApp de um = telefone do outro)', () => {
    expect(duplicadosPrestador(est, A).map((x) => [x.nome, x.motivos])).toEqual([
      ['Beto', ['mesmo telefone']],
      ['Caio', ['mesmo CPF/CNPJ']],
    ]);
  });

  it('CPF com e sem pontuação é o mesmo documento', () => {
    expect(duplicadosPrestador(est, C).map((x) => x.nome)).toEqual(['Ana']);
  });

  it('sem telefone nem documento, sem duplicidade', () => {
    expect(duplicadosPrestador(est, D)).toEqual([]);
  });

  it('não compara o prestador com ele mesmo', () => {
    expect(duplicadosPrestador(est, A).some((x) => x.id === 'a')).toBe(false);
  });
});

describe('totais da lista', () => {
  it('são a soma dos resumos, pela mesma função', () => {
    const t = totaisPrestadores(est, est.prestadores);
    const soma = (k) => est.prestadores.reduce((s, p) => s + resumoPrestador(est, p)[k], 0);
    expect(t).toEqual({
      contratado: soma('contratado'),
      pago: soma('pago'),
      aPagarAgora: soma('aPagarAgora'),
      aMedir: soma('aMedir'),
      comContrato: est.prestadores.filter((p) => resumoPrestador(est, p).temContrato).length,
    });
    expect(t.comContrato).toBe(2); // Ana e Beto têm contrato; Caio e Dani, não
    expect(t.contratado).toBe(20000);
    expect(t.pago).toBe(10000 + 400);
  });
});

describe('mensagens prontas', () => {
  it('lê "Título | texto" da lista de Ajustes', () => {
    const m = lerModelosMensagem(LISTAS_PADRAO.mensagensWhatsapp);
    expect(m.map((x) => x.titulo)).toEqual([
      'Chamar',
      'Confirmar serviço amanhã',
      'Aviso de pagamento',
      'Pedir fotos do serviço',
    ]);
  });

  it('linha sem "|" vira título e texto', () => {
    expect(lerModelosMensagem(['Bom dia!'])).toEqual([{ titulo: 'Bom dia!', texto: 'Bom dia!' }]);
  });

  it('preenche as variáveis', () => {
    expect(
      preencherMensagem('Olá, {nome}! O pagamento de {valor} da obra {obra} foi feito em {data}.', {
        nome: 'Wesley',
        valor: 'R$ 1.200,00',
        obra: 'Casa 12',
        data: '25/09',
      }),
    ).toBe('Olá, Wesley! O pagamento de R$ 1.200,00 da obra Casa 12 foi feito em 25/09.');
  });

  it('variável sem valor some sem deixar chave nem espaço sobrando', () => {
    expect(preencherMensagem('Olá, {nome}! Obra {obra}.', { nome: 'Ana' })).toBe('Olá, Ana! Obra.');
  });
});
