/**
 * Prestadores: vínculo com contratos e lançamentos, números calculados,
 * validação do cadastro e a sugestão de normalização de nomes.
 *
 * A fixture reproduz o problema que motivou a mudança: contrato cadastrado
 * sem prestador ("prestador não informado"), pagamento de diária lançado
 * direto em Lançamentos, e prestador com nome e especialidade misturados
 * em caixa alta.
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
  indicadoresContrato,
  ligadoAoPrestador,
  resumoPrestador,
  sugestaoNomePrestador,
} from '../src/dominio/calculos.js';
import {
  motivoChavePixInvalida,
  motivoCpfCnpjInvalido,
  validarPrestador,
} from '../src/dominio/validacao.js';

const prest = (o) => Object.assign(novoPrestador(), o);
const contrato = (o) => Object.assign(novoContrato(), { status: 'Em andamento', ...o });
const lanc = (o) => Object.assign(novoLancamento(), { quantidade: 1, ...o });
const med = (o) => Object.assign(novaMedicao(), o);

function estado() {
  const e = estadoInicial();
  const wesley = prest({
    id: 'p-wesley',
    nome: 'Wesley',
    apelido: 'Wesley Pintor',
    especialidade: 'Pintor',
  });
  const joao = prest({ id: 'p-joao', nome: 'João Batista', especialidade: 'Pedreiro' });
  e.prestadores.push(wesley, joao);

  const o = Object.assign(novaObra(), { id: 'o1', nome: 'Casa 12' });
  o.contratos.push(
    contrato({
      codigo: 'CT-001',
      codigoBase: 'CT-001',
      prestadorId: 'p-joao',
      valorInformado: 50000,
    }),
    contrato({
      codigo: 'CT-001-A1',
      codigoBase: 'CT-001',
      registro: 'Aditivo',
      valorInformado: 5000,
    }), // herda do base
    contrato({
      codigo: 'CT-002',
      codigoBase: 'CT-002',
      prestador: 'WESLEY PINTOR',
      valorInformado: 12000,
    }), // legado, só nome
    contrato({ codigo: 'CT-003', codigoBase: 'CT-003', valorInformado: 8000 }), // sem prestador nenhum
    contrato({
      codigo: 'CT-004',
      codigoBase: 'CT-004',
      prestadorId: 'p-joao',
      valorInformado: 3000,
      status: 'Cancelado',
    }),
  );
  o.medicoes.push(
    med({
      contratoBase: 'CT-001',
      valorMedido: 20000,
      valorPago: 20000,
      data: '2026-04-01',
      status: 'Pago',
    }),
    med({
      contratoBase: 'CT-001',
      valorMedido: 10000,
      valorPago: 6000,
      data: '2026-05-01',
      status: 'Parcial',
    }),
    med({
      contratoBase: 'CT-002',
      valorMedido: 4000,
      valorPago: 4000,
      data: '2026-06-01',
      status: 'Pago',
    }),
    med({
      contratoBase: 'CT-003',
      valorMedido: 8000,
      valorPago: 8000,
      data: '2026-06-01',
      status: 'Pago',
    }),
  );
  o.lancamentos.push(
    lanc({
      descricao: 'Diárias semana 1',
      prestadorId: 'p-joao',
      precoUnitario: 900,
      data: '2026-06-10',
    }),
    lanc({
      descricao: 'Tinta',
      fornecedor: 'Depósito Central',
      precoUnitario: 1500,
      data: '2026-06-11',
    }),
    lanc({
      descricao: 'Retoque',
      fornecedor: 'Wesley Pintor',
      precoUnitario: 300,
      data: '2026-06-12',
    }), // pelo apelido
  );
  e.obras.push(o);
  return migrar(e);
}

const est = estado();
const [WESLEY, JOAO] = est.prestadores;

/* ================================================================ vínculo */
describe('vínculo com contratos e lançamentos', () => {
  it('pelo id quando existe', () => {
    expect(ligadoAoPrestador(JOAO, 'p-joao', '')).toBe(true);
    expect(ligadoAoPrestador(WESLEY, 'p-joao', 'Wesley')).toBe(false); // id de outro vence o nome
  });

  it('registro antigo, sem id, casa pelo nome ou apelido, sem acento nem caixa', () => {
    expect(ligadoAoPrestador(WESLEY, '', 'WESLEY PINTOR')).toBe(true);
    expect(ligadoAoPrestador(JOAO, '', 'joao batista')).toBe(true);
    expect(ligadoAoPrestador(JOAO, '', '')).toBe(false);
  });
});

/* =============================================================== números */
describe('contratado, pago e a pagar são calculados', () => {
  const j = resumoPrestador(est, JOAO);
  const w = resumoPrestador(est, WESLEY);

  it('contratado: contratos dele, aditivo sem prestador herda do base, cancelado fica fora', () => {
    expect(j.contratado).toBe(50000 + 5000);
    expect(w.contratado).toBe(12000);
  });

  it('pago: medições dos contratos dele + lançamentos ligados a ele', () => {
    expect(j.pagoMedicoes).toBe(26000);
    expect(j.pagoLancamentos).toBe(900);
    expect(j.pago).toBe(26900);
    expect(w.pago).toBe(4000 + 300);
  });

  it('a pagar agora: já medido e não pago; a medir: o que ainda vai virar conta', () => {
    expect(j.aPagarAgora).toBe(30000 - 26000);
    expect(j.aMedir).toBe(55000 - 30000);
    expect(w.aPagarAgora).toBe(0); // mediu 4 mil e pagou 4 mil
    expect(w.aMedir).toBe(12000 - 4000);
  });

  it('é a mesma conta da tela de Contratos (indicadoresContrato)', () => {
    const o = est.obras[0];
    expect(j.aPagarAgora).toBe(indicadoresContrato(o, 'CT-001').aPagarAgora);
    expect(j.aMedir).toBe(indicadoresContrato(o, 'CT-001').aMedir);
    expect(j.contratado).toBe(indicadoresContrato(o, 'CT-001').autorizado);
  });

  it('obras e pagamentos por obra', () => {
    expect(j.obras).toEqual([
      {
        obraId: 'o1',
        obraNome: 'Casa 12',
        contratado: 55000,
        pago: 26900,
        aPagarAgora: 4000,
        aMedir: 25000,
      },
    ]);
    expect(j.pagamentos.map((p) => p.valor)).toEqual([900, 6000, 20000]); // mais recente primeiro
  });

  it('contrato sem prestador e compra de material não entram em ninguém', () => {
    const total = resumoPrestador(est, JOAO).contratado + resumoPrestador(est, WESLEY).contratado;
    expect(total).toBe(67000); // CT-003 (8 mil) fica de fora
  });

  it('quem tem vínculo não pode ser apagado; quem não tem, pode', () => {
    expect(j.temVinculo).toBe(true);
    const novo = prest({ id: 'p-novo', nome: 'Carlos' });
    expect(resumoPrestador(est, novo).temVinculo).toBe(false);
  });
});

/* ============================================================== validação */
describe('validação do cadastro', () => {
  const erros = (p) => validarPrestador(prest(p), LISTAS_PADRAO).filter((x) => x.sev === 'erro');

  it('nome é obrigatório', () => {
    expect(erros({ nome: ' ' }).map((x) => x.campo)).toEqual(['nome']);
  });

  it('WhatsApp e telefone inválidos são recusados, com o motivo', () => {
    expect(erros({ nome: 'A', whatsapp: '(20) 99999-8888' })[0].mensagem).toBe(
      'DDD 20 não existe.',
    );
    expect(erros({ nome: 'A', whatsapp: '5562999998888' })).toEqual([]);
    expect(erros({ nome: 'A', telefone: '123' })[0].campo).toBe('telefone');
  });

  it('CPF e CNPJ pelos dígitos verificadores', () => {
    expect(motivoCpfCnpjInvalido('529.982.247-25')).toBe('');
    expect(motivoCpfCnpjInvalido('529.982.247-26')).toBe('CPF inválido: confira os dígitos.');
    expect(motivoCpfCnpjInvalido('11.222.333/0001-81')).toBe('');
    expect(motivoCpfCnpjInvalido('11.222.333/0001-80')).toBe('CNPJ inválido: confira os dígitos.');
    expect(motivoCpfCnpjInvalido('111.111.111-11')).toMatch(/todos os dígitos iguais/);
    expect(motivoCpfCnpjInvalido('123')).toBe('CPF tem 11 dígitos; CNPJ, 14.');
    expect(motivoCpfCnpjInvalido('')).toBe('');
  });

  it('chave PIX validada pelo tipo', () => {
    expect(motivoChavePixInvalida('cpf_cnpj', '529.982.247-25')).toBe('');
    expect(motivoChavePixInvalida('telefone', '+5562999998888')).toBe('');
    expect(motivoChavePixInvalida('email', 'joao@obra.com.br')).toBe('');
    expect(motivoChavePixInvalida('aleatoria', '123e4567-e89b-12d3-a456-426614174000')).toBe('');
    expect(motivoChavePixInvalida('email', 'joao@')).not.toBe('');
    expect(motivoChavePixInvalida('aleatoria', 'abc')).not.toBe('');
    expect(motivoChavePixInvalida('', 'joao@obra.com.br')).toBe('Escolha o tipo da chave PIX.');
  });

  it('forma de contratação e valor de referência', () => {
    expect(erros({ nome: 'A', formaContratacao: 'hora' })[0].campo).toBe('formaContratacao');
    expect(erros({ nome: 'A', formaContratacao: 'diaria', valorReferencia: -1 })[0].campo).toBe(
      'valorReferencia',
    );
  });

  it('cidade é opcional e tem no máximo 60 caracteres (chk_prest_cidade)', () => {
    expect(erros({ nome: 'A' })).toEqual([]);
    expect(erros({ nome: 'A', cidade: 'Anápolis/GO' })).toEqual([]);
    expect(erros({ nome: 'A', cidade: 'x'.repeat(60) })).toEqual([]);
    expect(erros({ nome: 'A', cidade: 'x'.repeat(61) })[0].campo).toBe('cidade');
    expect(prest({}).cidade).toBe('');
  });

  it('especialidade nova é alerta, não erro — a lista é personalizável', () => {
    const r = validarPrestador(prest({ nome: 'A', especialidade: 'Soldador' }), LISTAS_PADRAO);
    expect(r.map((x) => x.sev)).toEqual(['alerta']);
  });
});

/* ============================================================ normalização */
describe('sugestão de normalização de nomes', () => {
  const esp = LISTAS_PADRAO.especialidades;
  const sug = (nome, extra = {}) => sugestaoNomePrestador(prest({ nome, ...extra }), esp);

  it('"WESLEY PINTOR" → Wesley, apelido Wesley Pintor, especialidade Pintor', () => {
    expect(sug('WESLEY PINTOR').depois).toEqual({
      nome: 'Wesley',
      apelido: 'Wesley Pintor',
      especialidade: 'Pintor',
    });
  });

  it('especialidade no começo do nome também', () => {
    expect(sug('PEDREIRO JOÃO').depois).toEqual({
      nome: 'João',
      apelido: 'Pedreiro João',
      especialidade: 'Pedreiro',
    });
  });

  it('especialidade de duas palavras', () => {
    expect(sug('CARLOS EMPREITEIRO GERAL').depois.especialidade).toBe('Empreiteiro geral');
  });

  it('só caixa alta: capitaliza, com partícula minúscula', () => {
    expect(sug('MARIA DAS DORES DE SOUZA').depois).toEqual({
      nome: 'Maria das Dores de Souza',
      apelido: '',
      especialidade: '',
    });
  });

  it('não sobrescreve apelido nem especialidade já preenchidos', () => {
    const s = sug('WESLEY PINTOR', { apelido: 'Galego', especialidade: 'Gesseiro' });
    expect(s.depois).toEqual({ nome: 'Wesley', apelido: 'Galego', especialidade: 'Gesseiro' });
  });

  it('nome já bem escrito não gera sugestão', () => {
    expect(sug('João Batista')).toBeNull();
    expect(sug('Pintor')).toBeNull(); // só a especialidade: não há nome para separar
  });
});
