/**
 * Melhorias por tela da auditoria de 25/09/2026 — as de esforço baixo.
 * Cada bloco prova a regra que a tela passou a mostrar.
 */
import { describe, expect, it } from 'vitest';
import { fmtQuando, novaObra } from '../src/nucleo/base.js';
import { ocultarDocumento } from '../src/nucleo/contato.js';
import {
  alteracaoSensivel,
  ativacaoConta,
  coberturaPlanoMateriais,
  compararPrestadorAPagar,
  resumoPrestador,
  empreitadaPrincipal,
  fotosDaSemana,
  incoerenciasObra,
  situacaoObraCalculada,
  lancamentoNatureza,
  lancamentosDuplicados,
  materialCalc,
  resumoLancamentos,
  contratoSituacao,
  medicaoAPagar,
  medicaoPagamento,
  medicoesEmAberto,
  diasSemAtividade,
  listaProtegida,
  saudeCliente,
  saudeObra,
  unidadeSugeridaEtapa,
  usoItensLista,
} from '../src/dominio/calculos.js';
import { apenasErros, validarEmpresa } from '../src/dominio/validacao.js';
import { HOJE, casa14 } from './casa14.fixture.js';

describe('Clientes — CPF/CNPJ mascarado na lista (LGPD)', () => {
  it('CPF mostra só os 6 dígitos do meio', () => {
    expect(ocultarDocumento('123.456.789-09')).toBe('***.456.789-**');
    expect(ocultarDocumento('12345678909')).toBe('***.456.789-**');
  });

  it('CNPJ esconde a raiz e o dígito verificador', () => {
    expect(ocultarDocumento('12.345.678/0001-95')).toBe('**.345.678/0001-**');
  });

  it('documento fora do padrão nunca aparece cru', () => {
    expect(ocultarDocumento('RG 1234567')).toBe('•••67');
    expect(ocultarDocumento('')).toBe('');
    expect(ocultarDocumento(null)).toBe('');
  });
});

describe('Clientes — Situação é a saúde da obra do cliente', () => {
  it('cliente sem obra não tem saúde', () => {
    expect(saudeCliente([], HOJE)).toBeNull();
  });

  it('com mais de uma obra, vale a pior', () => {
    const ruim = casa14();
    const sem = novaObra('Terreno sem cronograma');
    const s = saudeCliente([sem, ruim], HOJE);
    expect(s.nivel).toBe(saudeObra(ruim, HOJE).nivel);
    expect(['critico', 'atencao']).toContain(s.nivel);
  });
});

describe('Trilha de auditoria — quando, em linguagem de gente', () => {
  const agora = new Date(2026, 8, 25, 18, 0);
  it('hoje e ontem com a hora', () => {
    expect(fmtQuando(new Date(2026, 8, 25, 17, 49).toISOString(), agora)).toBe('hoje, 17:49');
    expect(fmtQuando(new Date(2026, 8, 24, 9, 5).toISOString(), agora)).toBe('ontem, 09:05');
  });
  it('no mesmo ano, dia/mês; em outro, dia/mês/ano', () => {
    expect(fmtQuando(new Date(2026, 8, 2, 14, 3).toISOString(), agora)).toBe('02/09, 14:03');
    expect(fmtQuando(new Date(2025, 11, 30, 8, 0).toISOString(), agora)).toBe('30/12/25, 08:00');
  });
  it('instante inválido vira traço', () => {
    expect(fmtQuando('', agora)).toBe('—');
    expect(fmtQuando('lixo', agora)).toBe('—');
  });
});

describe('Trilha de auditoria — alteração sensível é o filtro padrão', () => {
  it('pago, recebido e aprovado são sensíveis', () => {
    expect(alteracaoSensivel({ operacao: 'UPDATE', campo: 'valor_pago' })).toBe(true);
    expect(alteracaoSensivel({ operacao: 'UPDATE', campo: 'valor_recebido' })).toBe(true);
    expect(alteracaoSensivel({ operacao: 'INSERT', campo: 'valor_aprovado' })).toBe(true);
  });
  it('exclusão de qualquer campo é sensível', () => {
    expect(alteracaoSensivel({ operacao: 'DELETE', campo: 'quantidade' })).toBe(true);
  });
  it('preço em digitação não é', () => {
    expect(alteracaoSensivel({ operacao: 'UPDATE', campo: 'preco_unitario' })).toBe(false);
    expect(alteracaoSensivel(null)).toBe(false);
  });
});

describe('Ajustes — lista do sistema não perde item em uso', () => {
  const estado = () => ({ obras: [casa14()], prestadores: [{ especialidade: 'Pintura' }] });

  it('conta quantos registros usam cada item', () => {
    const uso = usoItensLista(estado());
    const o = casa14();
    const etapa = o.cronograma[0].etapa;
    expect(uso.etapas.get(etapa)).toBeGreaterThan(0);
    expect(uso.especialidades.get('Pintura')).toBe(1);
  });

  it('item em uso volta para a lista; item sem uso sai', () => {
    const uso = new Map([['Pisos', 12]]);
    const r = listaProtegida(uso, ['Pisos', 'Telhado', 'Muro'], ['Telhado']);
    expect(r.lista).toEqual(['Telhado', 'Pisos']);
    expect(r.mantidos).toEqual([{ item: 'Pisos', registros: 12 }]);
  });

  it('acrescentar e reordenar não é afetado', () => {
    const r = listaProtegida(new Map([['A', 1]]), ['A', 'B'], ['C', 'A']);
    expect(r.lista).toEqual(['C', 'A']);
    expect(r.mantidos).toEqual([]);
  });
});

describe('Ajustes — RT e CREA faltando é alerta, não erro', () => {
  it('avisa o que falta sem bloquear', () => {
    const p = validarEmpresa({ nome: 'Souz', responsavel: '', creaCau: '' });
    expect(p.map((x) => x.campo)).toEqual(['responsavel', 'creaCau']);
    expect(apenasErros(p)).toEqual([]);
  });
  it('completo não avisa', () => {
    expect(validarEmpresa({ responsavel: 'Eng. Ana', creaCau: 'GO-12345/D' })).toEqual([]);
  });
});

describe('Contas e acessos — ativação e conta parada', () => {
  it('conta os passos dados e diz o que falta', () => {
    const a = ativacaoConta({ obras: 1, contratos: 2, medicoes: 0, lancamentos: 5, diario: 0, fotos: 0 });
    expect(a.feitos).toBe(3);
    expect(a.total).toBe(6);
    expect(a.faltam).toEqual(['mediu', 'usa o diário', 'tira foto']);
  });
  it('dias sem atividade; nunca = null', () => {
    const agora = new Date('2026-09-25T12:00:00Z');
    expect(diasSemAtividade('2026-09-10T12:00:00Z', agora)).toBe(15);
    expect(diasSemAtividade('2026-09-25T08:00:00Z', agora)).toBe(0);
    expect(diasSemAtividade(null, agora)).toBeNull();
  });
});

describe('Contratos — o atraso diz contra o quê é medido', () => {
  it('atrasado: vs. o fim vigente do contrato', () => {
    const s = contratoSituacao(casa14(), 'CT-001', HOJE);
    expect(s.chave).toBe('atrasado');
    expect(s.referencia).toEqual({ tipo: 'fim', data: '2026-08-26' });
  });
  it('não iniciado e atrasado: vs. o início', () => {
    const s = contratoSituacao(casa14(), 'CT-003', HOJE);
    expect(s.referencia.tipo).toBe('inicio');
  });
  it('em dia não tem referência de atraso', () => {
    expect(contratoSituacao(casa14(), 'CT-002', HOJE).referencia).toBeUndefined();
  });
});

describe('Medições — A pagar com a idade da conta mais antiga', () => {
  it('Casa 14: R$ 7.000 em 2 medições, a mais antiga há 108 dias', () => {
    const a = medicoesEmAberto(casa14(), HOJE);
    expect(a.total).toBe(7000);
    expect(a.itens).toHaveLength(2);
    expect(a.maisAntiga.dias).toBe(108);
    expect(a.maisAntiga.medicao.contratoBase).toBe('CT-002');
  });
  it('o KPI é a soma da coluna (já sem retenção)', () => {
    const o = casa14();
    const ct = o.contratos.find((c) => c.codigoBase === 'CT-001' && c.registro === 'Contrato');
    ct.retencaoPct = 0.05;
    const a = medicoesEmAberto(o, HOJE);
    const coluna = o.medicoes.reduce((s, m) => s + medicaoAPagar(o, m), 0);
    expect(a.total).toBeCloseTo(coluna, 2);
  });
  it('sem nada em aberto, sem mais antiga', () => {
    const o = casa14();
    o.medicoes = [];
    expect(medicoesEmAberto(o, HOJE)).toEqual({ itens: [], total: 0, maisAntiga: null });
  });
});

describe('Medições — pagamento parcial se destaca', () => {
  it('pagou parte: parcial; nada: aberta; tudo: quitada', () => {
    const o = casa14();
    const por = (base, n) => o.medicoes.find((m) => m.contratoBase === base && m.numero === n);
    expect(medicaoPagamento(o, por('CT-002', '2'))).toBe('parcial');
    expect(medicaoPagamento(o, por('CT-001', '4'))).toBe('aberta');
    expect(medicaoPagamento(o, por('CT-001', '1'))).toBe('quitada');
    expect(medicaoPagamento(o, { ...por('CT-001', '4'), status: 'Cancelado' })).toBe('cancelada');
  });
});

describe('Cronograma — unidade de produção pela etapa, não m² para tudo', () => {
  it.each([
    ['Fundação', 'm³'],
    ['Estrutura', 'm³'],
    ['Muro', 'm'],
    ['Calhas e rufos', 'm'],
    ['Louças e metais', 'un'],
    ['Esquadrias/janelas', 'un'],
    ['Instalações hidrossanitárias', 'un'],
    ['Fechamento/alvenaria', 'm²'],
    ['Pintura', 'm²'],
  ])('%s → %s', (etapa, un) => {
    expect(unidadeSugeridaEtapa(etapa)).toBe(un);
  });
  it('etapa sem nome não sugere', () => {
    expect(unidadeSugeridaEtapa('')).toBe('');
  });
});

describe('Lançamentos — natureza, duplicados e resumo', () => {
  it('comissão é venda, honorário é administração, material é obra', () => {
    expect(lancamentoNatureza({ tipo: 'Comissão imobiliária' })).toBe('Venda');
    expect(lancamentoNatureza({ tipo: 'Honorário técnico/gestão' })).toBe('Administração');
    expect(lancamentoNatureza({ tipo: 'Taxa/imposto' })).toBe('Taxas');
    expect(lancamentoNatureza({ tipo: 'Material' })).toBe('Obra');
  });
  it('Casa 14: R$ 31.742 lançados, R$ 8.262 fora da obra física, 5 sem etapa', () => {
    const r = resumoLancamentos(casa14());
    expect(r.total).toBe(31742);
    expect(r.material).toBe(23480);
    expect(r.naoObra).toEqual({ n: 4, valor: 8262 });
    expect(r.semEtapa.n).toBe(5);
  });
  it('mesma data, fornecedor e total formam um grupo de duplicados', () => {
    const o = casa14();
    const l = o.lancamentos.find((x) => x.tipo === 'Material');
    expect(lancamentosDuplicados(o)).toHaveLength(0);
    o.lancamentos.push({ ...l, id: 'copia' });
    const g = lancamentosDuplicados(o);
    expect(g).toHaveLength(1);
    expect(g[0].map((x) => x.id)).toContain('copia');
  });
});

describe('Materiais — cobertura do plano e ocorrência do diário', () => {
  it('Casa 14: só R$ 3.480 de R$ 23.480 em material estavam no plano', () => {
    const c = coberturaPlanoMateriais(casa14());
    expect(c.total).toBe(23480);
    expect(c.noPlano).toBe(3480);
    expect(c.fracao).toBeCloseTo(0.148, 3);
  });
  it('sem compra de material, cobertura é null', () => {
    const o = casa14();
    o.lancamentos = [];
    expect(coberturaPlanoMateriais(o).fracao).toBeNull();
  });
  it('ocorrência aberta no diário aparece no material; resolvida, não', () => {
    const o = casa14();
    const rejunte = o.materiais.find((m) => m.material === 'Rejunte');
    const d = o.diario[0];
    Object.assign(d, { ocorrencias: 'Piso parou: falta rejunte', ocorrenciaStatus: 'aberta', ocorrenciaMaterialId: rejunte.id });
    expect(materialCalc(o, rejunte).ocorrencias).toHaveLength(1);
    d.ocorrenciaStatus = 'resolvida';
    expect(materialCalc(o, rejunte).ocorrencias).toHaveLength(0);
  });
});

describe('Configuração — incoerências no topo e situação calculada', () => {
  it('Casa 14: cronograma termina depois da data contratual', () => {
    const inc = incoerenciasObra(casa14());
    expect(inc.map((x) => x.campo)).toEqual(['previsaoConclusao']);
  });
  it('teto abaixo da empreitada, fontes curtas e situação divergente', () => {
    const o = casa14();
    o.fin.custoFisicoMaxM2 = 600;
    o.fin.valorFinanciado = 10000;
    o.status = 'Planejada';
    const campos = incoerenciasObra(o).map((x) => x.campo);
    expect(campos).toContain('fin.custoFisicoMaxM2');
    expect(campos).toContain('fin.recursosProprios');
    expect(campos).toContain('status');
  });
  it('Paralisada é exceção manual: não acusa divergência', () => {
    const o = casa14();
    o.status = 'Paralisada';
    expect(incoerenciasObra(o).map((x) => x.campo)).not.toContain('status');
  });
  it('situação pelos dados', () => {
    expect(situacaoObraCalculada(casa14())).toBe('Em andamento');
    expect(situacaoObraCalculada(novaObra('Vazia'))).toBe('Planejada');
    const o = casa14();
    o.cronograma.forEach((e) => { e.progresso = 1; });
    expect(situacaoObraCalculada(o)).toBe('Concluída');
  });
  it('empreitada principal: 52 m² × R$ 720', () => {
    expect(empreitadaPrincipal(casa14())).toBe(37440);
  });
});

describe('Relatórios — fotos da semana no PDF do cliente', () => {
  const PNG = 'data:image/png;base64,iVBORw0KGgo=';
  it('só os últimos 7 dias, mais recentes primeiro, só PNG/JPEG', () => {
    const o = casa14();
    o.diario = [
      { data: '2026-09-25', etapa: 'Pisos', fotos: [{ dados: PNG }] },
      { data: '2026-09-19', etapa: 'Reboco', fotos: [{ dados: PNG }, { dados: 'data:image/webp;base64,AAAA' }] },
      { data: '2026-09-18', etapa: 'Antiga', fotos: [{ dados: PNG }] },
    ];
    const f = fotosDaSemana(o, HOJE);
    expect(f.map((x) => x.etapa)).toEqual(['Pisos', 'Reboco']);
  });
  it('limite de fotos', () => {
    const o = casa14();
    o.diario = [{ data: HOJE, fotos: Array.from({ length: 9 }, () => ({ dados: PNG })) }];
    expect(fotosDaSemana(o, HOJE, 6)).toHaveLength(6);
  });
});

describe('Prestadores — quem espera pagamento há mais tempo vem primeiro', () => {
  it('aPagarDesde é a medição em aberto mais antiga dos contratos dele', () => {
    const o = casa14();
    const ct = o.contratos.find((c) => c.codigoBase === 'CT-002');
    ct.prestador = 'Pedro Pisos';
    const est = { obras: [o], prestadores: [] };
    const r = resumoPrestador(est, { id: 'p1', nome: 'Pedro Pisos', apelido: '' });
    const aberta = o.medicoes.find((m) => m.contratoBase === 'CT-002' && m.numero === '2');
    expect(r.aPagarDesde).toBe(aberta.data);
  });
  it('ordem: mais antigo primeiro, sem conta no fim, empate pelo nome', () => {
    const d = (nome, desde) => ({ p: { nome }, r: { aPagarDesde: desde } });
    const lista = [d('Zé', ''), d('Ana', '2026-08-01'), d('Bia', '2026-06-01'), d('Caio', '')];
    expect(lista.sort(compararPrestadorAPagar).map((x) => x.p.nome)).toEqual(['Bia', 'Ana', 'Caio', 'Zé']);
  });
});
