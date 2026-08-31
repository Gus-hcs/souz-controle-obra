/**
 * Estado de demonstração usado pelos testes: uma obra MCMV com contratos,
 * aditivos, medições, recebimentos, materiais, lançamentos e cronograma.
 */
import {
  estadoInicial, novaObra, novoContrato, novaMedicao, novoRecebimento,
  novoLancamento, novoMaterial, novaEtapaCronograma, novoCliente, migrar,
} from '../src/nucleo/base.js';

export function estadoDemo() {
  const e = estadoInicial();

  const cliente = Object.assign(novoCliente(), {
    nome: 'Maria de Souza', telefone: '(62) 99999-0000', situacao: 'Cliente',
  });
  e.clientes.push(cliente);

  const obra = Object.assign(novaObra(), {
    nome: 'Casa 42 — Residencial Aurora', clienteId: cliente.id, cidade: 'Goiânia',
    areaConstruida: 58.5, sistema: 'Alvenaria', padrao: 'MCMV',
    dataInicio: '2026-02-02', previsaoConclusao: '2026-09-30', status: 'Em andamento',
    valorFinanciado: 180000, recursosProprios: 20000, precoEmpreitadaM2: 1200,
    valorVenda: 245000, responsavel: 'Gustavo Souza',
  });

  const c = (o) => Object.assign(novoContrato(), o);
  obra.contratos.push(
    c({ codigo: 'CT-001', codigoBase: 'CT-001', registro: 'Contrato', prestador: 'Construtora Alfa',
        escopo: 'Empreitada global', regime: 'R$/m²', quantidade: 58.5, unidade: 'm²',
        precoUnitario: 1200, status: 'Em andamento', inicioPrevisto: '2026-02-02', fimPrevisto: '2026-09-15' }),
    c({ codigo: 'CT-001-A1', codigoBase: 'CT-001', registro: 'Aditivo', prestador: 'Construtora Alfa',
        escopo: 'Muro de arrimo', regime: 'Valor fechado', valorInformado: 12500, status: 'Em andamento' }),
    c({ codigo: 'CT-002', codigoBase: 'CT-002', registro: 'Contrato', prestador: 'Elétrica Beta',
        escopo: 'Instalações elétricas', regime: 'Valor fechado', valorInformado: 18400, status: 'Planejado' }),
    c({ codigo: 'CT-003', codigoBase: 'CT-003', registro: 'Contrato', prestador: 'Pintura Gama',
        escopo: 'Pintura interna', regime: 'Valor fechado', valorInformado: 3800, status: 'Cancelado' }),
  );

  const m = (o) => Object.assign(novaMedicao(), o);
  obra.medicoes.push(
    m({ contratoBase: 'CT-001', numero: '1', data: '2026-03-02', descricao: 'Fundação',
        progresso: 0.15, valorMedido: 10530, dataPagamento: '2026-03-06', valorPago: 10530, status: 'Pago' }),
    m({ contratoBase: 'CT-001', numero: '2', data: '2026-04-02', descricao: 'Alvenaria',
        progresso: 0.35, valorMedido: 14040, desconto: 500, dataPagamento: '2026-04-08',
        valorPago: 13540, status: 'Pago' }),
    m({ contratoBase: 'CT-001', numero: '3', data: '2026-05-04', descricao: 'Cobertura',
        progresso: 0.25, valorMedido: 17550, status: 'Em aberto' }),
    m({ contratoBase: 'CT-001-A1', numero: '1', data: '2026-04-20', descricao: 'Muro — 60%',
        progresso: 0.6, valorMedido: 7500, dataPagamento: '2026-04-25', valorPago: 7500, status: 'Pago' }),
  );

  const r = (o) => Object.assign(novoRecebimento(), o);
  obra.recebimentos.push(
    r({ origem: 'CAIXA', numeroMedicao: '1', etapaPci: 'Fundação', dataPrevista: '2026-03-10',
        valorPrevisto: 27000, dataSolicitacao: '2026-03-03', percentObra: 0.15, valorAprovado: 27000,
        dataRecebimento: '2026-03-12', valorRecebido: 27000, status: 'Recebido' }),
    r({ origem: 'CAIXA', numeroMedicao: '2', etapaPci: 'Alvenaria', dataPrevista: '2026-04-12',
        valorPrevisto: 36000, dataSolicitacao: '2026-04-03', percentObra: 0.35, valorAprovado: 35200,
        descontos: 800, dataRecebimento: '2026-04-16', valorRecebido: 35200, status: 'Recebido' }),
    r({ origem: 'Cliente', etapaPci: 'Aporte próprio', dataPrevista: '2026-05-05',
        valorPrevisto: 20000, status: 'Previsto' }),
  );

  const l = (o) => Object.assign(novoLancamento(), o);
  obra.lancamentos.push(
    l({ data: '2026-02-10', tipo: 'Material', etapa: 'Fundação', descricao: 'Cimento CP-II',
        fornecedor: 'Depósito Central', quantidade: 120, unidade: 'saco', precoUnitario: 38, frete: 250 }),
    l({ data: '2026-03-14', tipo: 'Material', etapa: 'Alvenaria', descricao: 'Bloco cerâmico',
        fornecedor: 'Cerâmica Sul', quantidade: 4200, unidade: 'un', precoUnitario: 1.85, desconto: 300 }),
    l({ data: '2026-04-02', tipo: 'Taxa', etapa: 'Administração', descricao: 'ART e taxas',
        fornecedor: 'CREA-GO', quantidade: 1, unidade: 'un', precoUnitario: 480 }),
  );

  const mat = (o) => Object.assign(novoMaterial(), o);
  obra.materiais.push(
    mat({ etapa: 'Cobertura', material: 'Telha cerâmica', quantidadeNecessaria: 1800, unidade: 'un',
          dataNecessaria: '2026-06-01', prioridade: 'Alta', precoPrevisto: 3.4, status: 'Cotar' }),
    mat({ etapa: 'Pintura', material: 'Tinta acrílica', quantidadeNecessaria: 12, unidade: 'lata',
          dataNecessaria: '2026-08-01', prioridade: 'Média', precoPrevisto: 210, status: 'Planejar' }),
  );

  const et = (nome, ini, fim, prog, peso) =>
    Object.assign(novaEtapaCronograma(), { etapa: nome, inicioPrevisto: ini, fimPrevisto: fim,
      progresso: prog, peso, responsavel: 'Construtora Alfa' });
  obra.cronograma.push(
    et('Fundação', '2026-02-02', '2026-03-01', 1, 15),
    et('Alvenaria', '2026-03-02', '2026-04-15', 1, 25),
    et('Cobertura', '2026-04-16', '2026-05-30', 0.4, 20),
    et('Instalações', '2026-05-15', '2026-07-15', 0, 20),
    et('Acabamento', '2026-07-16', '2026-09-15', 0, 20),
  );

  obra.diario.push({
    id: 'd1', data: '2026-04-10', clima: 'Bom', efetivo: 6, etapa: 'Alvenaria',
    atividades: 'Elevação das paredes do pavimento térreo.',
    ocorrencias: '', autor: 'Gustavo Souza', fotos: [],
  });

  e.obras.push(obra);
  e.empresa.nome = 'Souz Engenharia';
  return migrar(e);
}
