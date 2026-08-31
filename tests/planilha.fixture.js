/**
 * planilha.fixture.js — a mesma obra da planilha MCMV de origem.
 *
 * Os números aqui são idênticos aos do arquivo Modelo_Controle_Obra_MCMV.xlsx
 * recalculado pelo LibreOffice; `esperado.json` guarda o resultado de cada
 * fórmula da planilha, célula por célula.
 */
import {
  novaObra, novoContrato, novaMedicao, novoRecebimento,
  novoLancamento, novoMaterial, novaEtapaCronograma,
} from '../src/nucleo/base.js';

export function obraDaPlanilha() {
  const obra = novaObra('Casa 12 - Residencial Aurora');
  Object.assign(obra, {
    cidade: 'Goiânia/GO', areaConstruida: 62.5, areaMuro: 28,
    dataInicio: '2026-03-02', previsaoConclusao: '2026-09-30'
  });
  Object.assign(obra.fin, {
    saldoInicial: 5000, valorTerreno: 45000, valorFinanciado: 180000, recursosProprios: 20000,
    precoEmpreitadaM2: 700, custoFisicoMaxM2: 1200, valorVenda: 260000, margemDesejada: 0.15
  });
  
  const C = (o) => Object.assign(novoContrato(), o);
  obra.contratos = [
    C({ codigo: 'CT-001', codigoBase: 'CT-001', registro: 'Contrato', prestador: 'Marcos Empreitada', escopo: 'Empreitada principal', regime: 'R$/m²', quantidade: 62.5, unidade: 'm²', precoUnitario: 700, valorInformado: 0, incluiMaterial: 'Sim', inicioPrevisto: '2026-03-02', fimPrevisto: '2026-08-30', status: 'Em andamento' }),
    C({ codigo: 'CT-001-A1', codigoBase: 'CT-001', registro: 'Aditivo', prestador: 'Marcos Empreitada', escopo: 'Muro frontal', regime: 'Preço fechado', valorInformado: 6500, inicioPrevisto: '2026-07-01', fimPrevisto: '2026-07-20', status: 'Em andamento' }),
    C({ codigo: 'CT-002', codigoBase: 'CT-002', registro: 'Contrato', prestador: 'Pintura Silva', escopo: 'Pintura geral', regime: 'Preço fechado', valorInformado: 4200, inicioPrevisto: '2026-08-01', fimPrevisto: '2026-08-25', status: 'Planejado' }),
    C({ codigo: 'CT-003', codigoBase: 'CT-003', registro: 'Contrato', prestador: 'Elétrica Luz', escopo: 'Elétrica final', regime: 'Preço unitário', quantidade: 1, unidade: 'serviço', precoUnitario: 3800, status: 'Cancelado' })
  ];
  
  const M = (o) => Object.assign(novaMedicao(), o);
  obra.medicoes = [
    M({ contratoBase: 'CT-001', numero: 1, data: '2026-03-20', descricao: 'Fundação e baldrame', progresso: 0.20, valorMedido: 12000, desconto: 500, dataPagamento: '2026-03-22', valorPago: 11500, status: 'Pago', documento: 'REC-01' }),
    M({ contratoBase: 'CT-001', numero: 2, data: '2026-04-25', descricao: 'Alvenaria e estrutura', progresso: 0.45, valorMedido: 15000, dataPagamento: '2026-04-28', valorPago: 14000, status: 'Pago', documento: 'REC-02' }),
    M({ contratoBase: 'CT-001', numero: 3, data: '2026-05-30', descricao: 'Cobertura e reboco', progresso: 0.70, valorMedido: 20000, dataPagamento: '2026-06-02', valorPago: 21000, status: 'Pago', documento: 'REC-03' }),
    M({ contratoBase: 'CT-002', numero: 1, data: '2026-06-10', descricao: 'Pintura interna', progresso: 0.30, valorMedido: 4200, valorPago: 0, status: 'Em aberto' }),
    M({ contratoBase: 'CT-001', numero: 4, data: '2026-06-20', descricao: 'Medição cancelada', valorMedido: 5000, dataPagamento: '2026-06-25', valorPago: 5000, status: 'Cancelado' })
  ];
  
  const R = (o) => Object.assign(novoRecebimento(), o);
  obra.recebimentos = [
    R({ origem: 'CAIXA', numeroMedicao: 1, etapaPci: 'Fundação', dataPrevista: '2026-03-15', valorPrevisto: 30000, dataSolicitacao: '2026-03-16', percentObra: 0.20, valorAprovado: 30000, descontos: 250, dataRecebimento: '2026-03-20', valorRecebido: 29750, status: 'Recebido' }),
    R({ origem: 'CAIXA', numeroMedicao: 2, etapaPci: 'Alvenaria', dataPrevista: '2026-04-15', valorPrevisto: 40000, dataSolicitacao: '2026-04-16', percentObra: 0.45, valorAprovado: 38000, descontos: 300, dataRecebimento: '2026-04-22', valorRecebido: 37700, status: 'Recebido' }),
    R({ origem: 'CAIXA', numeroMedicao: 3, etapaPci: 'Cobertura', dataPrevista: '2026-05-15', valorPrevisto: 45000, dataSolicitacao: '2026-05-16', percentObra: 0.70, status: 'Solicitado' }),
    R({ origem: 'Cliente', etapaPci: 'Aporte cliente', dataPrevista: '2026-06-01', valorPrevisto: 10000, status: 'Previsto' })
  ];
  
  const L = (o) => Object.assign(novoLancamento(), o);
  obra.lancamentos = [
    L({ data: '2026-03-05', tipo: 'Material', etapa: 'Fundação', categoria: 'Cimento', descricao: 'Cimento CP II', fornecedor: 'Depósito Central', documento: 'NF 1201', quantidade: 40, unidade: 'saco', precoUnitario: 38, desconto: 20, frete: 150, formaPagamento: 'PIX' }),
    L({ data: '2026-03-06', tipo: 'Material', etapa: 'Fundação', categoria: 'Aço', descricao: 'Aço CA-50 8mm', fornecedor: 'Ferro & Cia', documento: 'NF 88', quantidade: 30, unidade: 'barra', precoUnitario: 42, formaPagamento: 'Boleto' }),
    L({ data: '2026-04-10', tipo: 'Material', etapa: 'Fechamento/alvenaria', categoria: 'Bloco', descricao: 'Bloco cerâmico 9x19x39', fornecedor: 'Cerâmica Boa Vista', documento: 'NF 455', quantidade: 3, unidade: 'milheiro', precoUnitario: 950, frete: 300, formaPagamento: 'PIX' }),
    L({ data: '2026-05-02', tipo: 'Taxa/imposto', etapa: 'Serviços preliminares', categoria: 'Taxas', descricao: 'ART CREA', fornecedor: 'CREA-GO', documento: 'GRU 77', quantidade: 1, unidade: 'serviço', precoUnitario: 250, formaPagamento: 'Boleto' }),
    L({ data: '2026-06-15', tipo: 'Material', etapa: 'Fundação', categoria: 'Cimento', descricao: 'Cimento CP II', fornecedor: 'Depósito Central', documento: 'NF 1399', quantidade: 20, unidade: 'saco', precoUnitario: 39, formaPagamento: 'PIX' }),
    L({ data: '2026-07-08', tipo: 'Fornecimento + instalação', etapa: 'Calhas e rufos', categoria: 'Calhas', descricao: 'Calhas e rufos galvanizados', fornecedor: 'Metal Sul', documento: 'NF 12', quantidade: 1, unidade: 'serviço', precoUnitario: 2800, desconto: 100, formaPagamento: 'PIX' })
  ];
  
  const MT = (o) => Object.assign(novoMaterial(), o);
  obra.materiais = [
    MT({ etapa: 'Fundação', material: 'Cimento CP II', quantidadeNecessaria: 80, unidade: 'saco', dataNecessaria: '2026-03-01', prioridade: 'Alta', precoPrevisto: 38, status: 'Comprado parcial' }),
    MT({ etapa: 'Fechamento/alvenaria', material: 'Bloco cerâmico 9x19x39', quantidadeNecessaria: 5, unidade: 'milheiro', dataNecessaria: '2026-04-05', prioridade: 'Alta', precoPrevisto: 950, status: 'Comprado parcial' }),
    MT({ etapa: 'Pintura', material: 'Tinta acrílica 18L', quantidadeNecessaria: 12, unidade: 'lata', dataNecessaria: '2026-09-15', prioridade: 'Média', precoPrevisto: 210, status: 'Planejar' })
  ];
  
  const E = (etapa, o) => Object.assign(novaEtapaCronograma(etapa), o);
  obra.cronograma = [
    E('Serviços preliminares', { inicioPrevisto: '2026-03-02', fimPrevisto: '2026-03-10', inicioReal: '2026-03-02', fimReal: '2026-03-12', progresso: 1, quantidadeExecutada: 62.5, unidadeProducao: 'm²' }),
    E('Fundação', { inicioPrevisto: '2026-03-11', fimPrevisto: '2026-04-05', inicioReal: '2026-03-13', fimReal: '2026-04-08', progresso: 1, quantidadeExecutada: 62.5, unidadeProducao: 'm²' }),
    E('Estrutura', { inicioPrevisto: '2026-04-06', fimPrevisto: '2026-05-05', inicioReal: '2026-04-09', fimReal: '2026-05-10', progresso: 1, quantidadeExecutada: 62.5, unidadeProducao: 'm²' }),
    E('Fechamento/alvenaria', { inicioPrevisto: '2026-05-06', fimPrevisto: '2026-06-10', inicioReal: '2026-05-11', fimReal: '2026-06-18', progresso: 1, quantidadeExecutada: 180, unidadeProducao: 'm²' }),
    E('Cobertura', { inicioPrevisto: '2026-06-11', fimPrevisto: '2026-07-05', inicioReal: '2026-06-19', progresso: 0.8, quantidadeExecutada: 70, unidadeProducao: 'm²' }),
    E('Reboco e requadros', { inicioPrevisto: '2026-07-06', fimPrevisto: '2026-08-05', inicioReal: '2026-07-10', progresso: 0.5, quantidadeExecutada: 120, unidadeProducao: 'm²' }),
    E('Pintura', { inicioPrevisto: '2026-08-20', fimPrevisto: '2026-09-15', progresso: 0, quantidadeExecutada: 0, unidadeProducao: 'm²' })
  ];
  return obra;
}
