/**
 * Testes da camada de validação de domínio.
 *
 * Cada regra que bloqueia gravação ('erro') tem um CHECK equivalente em
 * db/migracoes/0002_validacao.sql. Aqui se prova o comportamento; lá o banco
 * é a última linha de defesa.
 */
import { describe, it, expect } from 'vitest';
import {
  novaObra, novoContrato, novaMedicao, novoRecebimento, novoLancamento,
  novoMaterial, novaEtapaCronograma, novoDiario, novoCliente, novoPrestador, novoMembro,
} from '../src/nucleo/base.js';
import {
  validarObra, validarContrato, validarMedicao, validarRecebimento,
  validarLancamento, validarMaterial, validarEtapa, validarDiario,
  validarCliente, validarPrestador, validarMembro, validarObraCompleta, validarEstado,
  apenasErros, apenasAlertas,
} from '../src/dominio/validacao.js';

const temErroNoCampo = (lista, campo) =>
  apenasErros(lista).some((x) => x.campo === campo);

describe('obra', () => {
  it('obra bem preenchida não acusa nada', () => {
    const o = novaObra('Casa 12');
    o.areaConstruida = 64;
    expect(validarObra(o)).toEqual([]);
  });

  it('exige nome', () => {
    expect(temErroNoCampo(validarObra(novaObra('')), 'nome')).toBe(true);
  });

  it('recusa área e valores financeiros negativos', () => {
    const o = novaObra('X');
    o.areaConstruida = -1;
    o.fin.valorFinanciado = -1000;
    expect(temErroNoCampo(validarObra(o), 'areaConstruida')).toBe(true);
    expect(temErroNoCampo(validarObra(o), 'valorFinanciado')).toBe(true);
  });

  it('aceita saldo inicial negativo — a obra pode começar no vermelho', () => {
    const o = novaObra('X');
    o.fin.saldoInicial = -5000;
    expect(validarObra(o)).toEqual([]);
  });

  it('recusa margem desejada fora de 0–100%', () => {
    const o = novaObra('X');
    o.fin.margemDesejada = 1.4;
    expect(temErroNoCampo(validarObra(o), 'margemDesejada')).toBe(true);
  });

  it('recusa previsão de conclusão anterior ao início', () => {
    const o = novaObra('X');
    o.dataInicio = '2026-05-01';
    o.previsaoConclusao = '2026-04-01';
    expect(temErroNoCampo(validarObra(o), 'previsaoConclusao')).toBe(true);
  });

  it('lê os campos financeiros também no formato plano do formulário', () => {
    const plano = { nome: 'Nova', 'fin.valorVenda': -1, 'fin.margemDesejada': 0.2 };
    expect(temErroNoCampo(validarObra(plano), 'valorVenda')).toBe(true);
  });
});

describe('contrato', () => {
  it('contrato simples é válido', () => {
    const c = novoContrato();
    c.codigo = 'CT-001';
    expect(validarContrato(c)).toEqual([]);
  });

  it('exige código', () => {
    expect(temErroNoCampo(validarContrato(novoContrato()), 'codigo')).toBe(true);
  });

  it('recusa tipo de registro fora de Contrato/Aditivo', () => {
    const c = novoContrato();
    c.codigo = 'CT-001';
    c.registro = 'Rascunho';
    expect(temErroNoCampo(validarContrato(c), 'registro')).toBe(true);
  });

  it('recusa quantidade e preço negativos', () => {
    const c = novoContrato();
    c.codigo = 'CT-001';
    c.quantidade = -2;
    c.precoUnitario = -50;
    expect(temErroNoCampo(validarContrato(c), 'quantidade')).toBe(true);
    expect(temErroNoCampo(validarContrato(c), 'precoUnitario')).toBe(true);
  });

  it('recusa fim previsto antes do início previsto', () => {
    const c = novoContrato();
    c.codigo = 'CT-001';
    c.inicioPrevisto = '2026-03-10';
    c.fimPrevisto = '2026-03-01';
    expect(temErroNoCampo(validarContrato(c), 'fimPrevisto')).toBe(true);
  });
});

describe('medição', () => {
  it('medição consistente é válida', () => {
    const m = novaMedicao();
    m.contratoBase = 'CT-001';
    m.valorMedido = 10000;
    m.desconto = 500;
    m.valorPago = 9500;
    expect(validarMedicao(m)).toEqual([]);
  });

  it('exige contrato', () => {
    expect(temErroNoCampo(validarMedicao(novaMedicao()), 'contratoBase')).toBe(true);
  });

  it('recusa desconto maior que o valor medido', () => {
    const m = novaMedicao();
    m.contratoBase = 'CT-001';
    m.valorMedido = 1000;
    m.desconto = 1500;
    expect(temErroNoCampo(validarMedicao(m), 'desconto')).toBe(true);
  });

  it('recusa progresso acima de 100%', () => {
    const m = novaMedicao();
    m.contratoBase = 'CT-001';
    m.progresso = 1.5;
    expect(temErroNoCampo(validarMedicao(m), 'progresso')).toBe(true);
  });

  it('pagamento acima do líquido medido é alerta, não erro — pode ser adiantamento', () => {
    const m = novaMedicao();
    m.contratoBase = 'CT-001';
    m.valorMedido = 1000;
    m.desconto = 0;
    m.valorPago = 1500;
    const r = validarMedicao(m);
    expect(apenasErros(r)).toEqual([]);
    expect(apenasAlertas(r).some((x) => x.campo === 'valorPago')).toBe(true);
  });
});

describe('recebimento', () => {
  it('recusa valores negativos', () => {
    const r = novoRecebimento();
    r.valorRecebido = -1;
    expect(temErroNoCampo(validarRecebimento(r), 'valorRecebido')).toBe(true);
  });

  it('recusa percentual de obra acima de 100%', () => {
    const r = novoRecebimento();
    r.percentObra = 1.2;
    expect(temErroNoCampo(validarRecebimento(r), 'percentObra')).toBe(true);
  });

  it('desconto acima do aprovado é alerta', () => {
    const r = novoRecebimento();
    r.valorAprovado = 1000;
    r.descontos = 1200;
    expect(apenasErros(validarRecebimento(r))).toEqual([]);
    expect(apenasAlertas(validarRecebimento(r)).length).toBeGreaterThan(0);
  });
});

describe('lançamento', () => {
  it('exige descrição', () => {
    expect(temErroNoCampo(validarLancamento(novoLancamento()), 'descricao')).toBe(true);
  });

  it('recusa desconto e frete negativos', () => {
    const l = novoLancamento();
    l.descricao = 'Cimento';
    l.desconto = -10;
    l.frete = -5;
    expect(temErroNoCampo(validarLancamento(l), 'desconto')).toBe(true);
    expect(temErroNoCampo(validarLancamento(l), 'frete')).toBe(true);
  });
});

describe('material', () => {
  it('exige material e etapa', () => {
    const r = validarMaterial(novoMaterial());
    expect(temErroNoCampo(r, 'material')).toBe(true);
    expect(temErroNoCampo(r, 'etapa')).toBe(true);
  });

  it('recusa quantidade necessária negativa', () => {
    const m = novoMaterial();
    m.material = 'Areia';
    m.etapa = 'Fundação';
    m.quantidadeNecessaria = -3;
    expect(temErroNoCampo(validarMaterial(m), 'quantidadeNecessaria')).toBe(true);
  });
});

describe('etapa do cronograma', () => {
  it('exige nome', () => {
    expect(temErroNoCampo(validarEtapa(novaEtapaCronograma('')), 'etapa')).toBe(true);
  });

  it('recusa progresso fora de 0–100% e peso negativo', () => {
    const e = novaEtapaCronograma('Estrutura');
    e.progresso = -0.1;
    e.peso = -1;
    expect(temErroNoCampo(validarEtapa(e), 'progresso')).toBe(true);
    expect(temErroNoCampo(validarEtapa(e), 'peso')).toBe(true);
  });

  it('recusa fim real antes do início real', () => {
    const e = novaEtapaCronograma('Estrutura');
    e.inicioReal = '2026-06-10';
    e.fimReal = '2026-06-01';
    expect(temErroNoCampo(validarEtapa(e), 'fimReal')).toBe(true);
  });
});

describe('diário', () => {
  it('registro novo é válido — já nasce com data de hoje', () => {
    expect(validarDiario(novoDiario())).toEqual([]);
  });

  it('recusa efetivo negativo', () => {
    const d = novoDiario();
    d.efetivo = -2;
    expect(temErroNoCampo(validarDiario(d), 'efetivo')).toBe(true);
  });
});

describe('cliente e prestador', () => {
  it('cliente exige nome', () => {
    expect(temErroNoCampo(validarCliente(novoCliente()), 'nome')).toBe(true);
  });

  it('prestador exige nome e avaliação entre 0 e 5', () => {
    const p = novoPrestador();
    p.avaliacao = 7;
    expect(temErroNoCampo(validarPrestador(p), 'nome')).toBe(true);
    expect(temErroNoCampo(validarPrestador(p), 'avaliacao')).toBe(true);
  });
});

describe('membro da obra', () => {
  it('membro completo é válido', () => {
    const m = novoMembro('engenheiro');
    m.obraId = 'obra_1';
    m.usuarioId = 'uuid-1';
    expect(validarMembro(m)).toEqual([]);
  });

  it('recusa papel fora de dono/engenheiro/cliente', () => {
    const m = novoMembro('visitante');
    m.obraId = 'obra_1';
    m.usuarioId = 'uuid-1';
    expect(temErroNoCampo(validarMembro(m), 'papel')).toBe(true);
  });

  it('exige obra e usuário', () => {
    const m = novoMembro('cliente');
    expect(temErroNoCampo(validarMembro(m), 'obraId')).toBe(true);
    expect(temErroNoCampo(validarMembro(m), 'usuarioId')).toBe(true);
  });
});

describe('validação em conjunto', () => {
  it('uma obra limpa não gera problema nenhum', () => {
    const o = novaObra('Limpa');
    o.areaConstruida = 50;
    const c = novoContrato();
    c.codigo = 'CT-001';
    o.contratos.push(c);
    expect(validarObraCompleta(o)).toEqual([]);
  });

  it('carrega o contexto de onde veio cada problema', () => {
    const o = novaObra('Casa');
    const m = novaMedicao();
    m.valorMedido = -1;
    o.medicoes.push(m);
    const problemas = validarObraCompleta(o);
    expect(problemas.some((x) => /Medição/.test(x.contexto) && x.campo === 'valorMedido')).toBe(true);
  });

  it('validarEstado varre clientes, prestadores e obras', () => {
    const estado = { clientes: [novoCliente()], prestadores: [], obras: [novaObra('')] };
    const problemas = validarEstado(estado);
    expect(problemas.some((x) => /Cliente/.test(x.contexto))).toBe(true);
    expect(problemas.some((x) => /Obra/.test(x.contexto))).toBe(true);
  });
});
