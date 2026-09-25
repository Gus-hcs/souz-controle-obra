/**
 * Casa 14 — Vila Nova Esperança: a obra-problema da demonstração
 * (db/demo/02_casa14_vila_nova.sql), usada como referência pela auditoria
 * tela a tela de 25/09/2026. Datas relativas a HOJE, como no seed.
 */
import {
  novaObra,
  novoContrato,
  novaMedicao,
  novoRecebimento,
  novoLancamento,
  novoMaterial,
  novaEtapaCronograma,
  novoDiario,
} from '../src/nucleo/base.js';

export const HOJE = '2026-09-25';

export const h = (n) => {
  const d = new Date(`${HOJE}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export function casa14() {
  const o = novaObra('Casa 14 — Vila Nova Esperança');
  Object.assign(o, {
    areaConstruida: 52,
    dataInicio: h(-240),
    previsaoConclusao: h(-10),
    status: 'Em andamento',
  });
  Object.assign(o.fin, {
    saldoInicial: 3000,
    valorTerreno: 42000,
    valorFinanciado: 150000,
    recursosProprios: 18000,
    precoEmpreitadaM2: 720,
    custoFisicoMaxM2: 1200,
    valorVenda: 205000,
    margemDesejada: 0.15,
  });

  const c = (x) => Object.assign(novoContrato(), x);
  o.contratos.push(
    c({ codigo: 'CT-001', codigoBase: 'CT-001', registro: 'Contrato', quantidade: 52, precoUnitario: 720,
        valorInformado: 0, inicioPrevisto: h(-236), fimPrevisto: h(-30), status: 'Em andamento' }),
    c({ codigo: 'CT-001-A1', codigoBase: 'CT-001', registro: 'Aditivo', tipoAditivo: 'prazo',
        statusAditivo: 'proposto', valorInformado: 0, novoPrazoAditivo: h(25), status: 'Em andamento' }),
    c({ codigo: 'CT-001-A2', codigoBase: 'CT-001', registro: 'Aditivo', tipoAditivo: 'acrescimo',
        statusAditivo: 'proposto', valorInformado: 3200, status: 'Em andamento' }),
    c({ codigo: 'CT-001-A3', codigoBase: 'CT-001', registro: 'Aditivo', tipoAditivo: 'supressao',
        statusAditivo: 'aprovado', valorInformado: 1500, status: 'Em andamento' }),
    c({ codigo: 'CT-002', codigoBase: 'CT-002', registro: 'Contrato', valorInformado: 7800,
        inicioPrevisto: h(-150), fimPrevisto: h(-110), status: 'Concluído' }),
    c({ codigo: 'CT-003', codigoBase: 'CT-003', registro: 'Contrato', quantidade: 52, precoUnitario: 45,
        valorInformado: 0, inicioPrevisto: h(-20), fimPrevisto: h(10), status: 'Planejado' }),
  );

  const m = (x) => Object.assign(novaMedicao(), x);
  o.medicoes.push(
    m({ contratoBase: 'CT-001', numero: '1', data: h(-205), valorMedido: 7900, dataPagamento: h(-202), valorPago: 7900, status: 'Pago' }),
    m({ contratoBase: 'CT-001', numero: '2', data: h(-160), valorMedido: 9350, dataPagamento: h(-157), valorPago: 9350, status: 'Pago' }),
    m({ contratoBase: 'CT-001', numero: '3', data: h(-100), valorMedido: 7900, dataPagamento: h(-96), valorPago: 7900, status: 'Pago' }),
    m({ contratoBase: 'CT-001', numero: '4', data: h(-45), valorMedido: 5400, valorPago: 0, status: 'Em aberto' }),
    m({ contratoBase: 'CT-002', numero: '1', data: h(-128), valorMedido: 3900, dataPagamento: h(-125), valorPago: 3900, status: 'Pago' }),
    m({ contratoBase: 'CT-002', numero: '2', data: h(-108), valorMedido: 3900, dataPagamento: h(-100), valorPago: 2300, status: 'Parcial' }),
  );

  const r = (x) => Object.assign(novoRecebimento(), x);
  o.recebimentos.push(
    r({ origem: 'Cliente', etapaPci: 'Entrada do cliente', dataPrevista: h(-240), valorPrevisto: 18000,
        dataRecebimento: h(-238), valorRecebido: 18000, status: 'Recebido' }),
    r({ origem: 'CAIXA', numeroMedicao: '1', dataPrevista: h(-210), valorPrevisto: 30000, valorAprovado: 30000,
        descontos: 210, dataRecebimento: h(-204), valorRecebido: 29790, status: 'Recebido' }),
    r({ origem: 'CAIXA', numeroMedicao: '2', dataPrevista: h(-165), valorPrevisto: 37500, valorAprovado: 37500,
        descontos: 262.5, dataRecebimento: h(-158), valorRecebido: 37237.5, status: 'Recebido' }),
    r({ origem: 'CAIXA', numeroMedicao: '3', dataPrevista: h(-40), valorPrevisto: 37500, dataSolicitacao: h(-45),
        status: 'Solicitado' }),
    r({ origem: 'CAIXA', numeroMedicao: '4', dataPrevista: h(30), valorPrevisto: 45000, status: 'Previsto' }),
  );

  const mat = (x) => Object.assign(novoMaterial(), x);
  const cimento = mat({ etapa: 'Fundação', material: 'Cimento CP II 50 kg', quantidadeNecessaria: 100, unidade: 'saco', dataNecessaria: h(-230), precoPrevisto: 37 });
  const rejunte = mat({ etapa: 'Pisos e revestimentos', material: 'Rejunte', quantidadeNecessaria: 40, unidade: 'saco', dataNecessaria: h(-6), precoPrevisto: 31 });
  const tinta = mat({ etapa: 'Pintura', material: 'Tinta acrílica 18 L', quantidadeNecessaria: 9, unidade: 'lata', dataNecessaria: h(8), precoPrevisto: 235 });
  o.materiais.push(cimento, rejunte, tinta);

  const l = (x) => Object.assign(novoLancamento(), x);
  o.lancamentos.push(
    l({ data: h(-232), tipo: 'Taxa/imposto', descricao: 'ART', quantidade: 1, precoUnitario: 262 }),
    l({ data: h(-230), tipo: 'Taxa/imposto', descricao: 'Alvará', quantidade: 1, precoUnitario: 650 }),
    l({ data: h(-228), tipo: 'Material', etapa: 'Fundação', descricao: 'Cimento CP II 50 kg', quantidade: 90,
        precoUnitario: 37, frete: 150, materialId: cimento.id }),
    l({ data: h(-120), tipo: 'Material', descricao: 'Material de obra', quantidade: 1, precoUnitario: 20000 }),
    l({ data: h(-40), tipo: 'Honorário técnico/gestão', descricao: 'Acompanhamento', quantidade: 1, precoUnitario: 1200 }),
    l({ data: h(-20), tipo: 'Comissão imobiliária', descricao: 'Comissão do corretor', quantidade: 1, precoUnitario: 6150 }),
  );

  /* cronograma e diário do seed, com responsáveis — é o que alimenta
     término projetado, causas-raiz e cobertura do diário */
  const e = (x) => Object.assign(novaEtapaCronograma(), x);
  const AR = 'Antônio Ribeiro';
  o.cronograma.push(
    e({ etapa: 'Serviços preliminares', inicioPrevisto: h(-240), fimPrevisto: h(-232), inicioReal: h(-238), fimReal: h(-229), progresso: 1, peso: 3, responsavel: AR }),
    e({ etapa: 'Fundação', inicioPrevisto: h(-232), fimPrevisto: h(-210), inicioReal: h(-229), fimReal: h(-200), progresso: 1, peso: 12, responsavel: AR }),
    e({ etapa: 'Estrutura', inicioPrevisto: h(-210), fimPrevisto: h(-185), inicioReal: h(-200), fimReal: h(-170), progresso: 1, peso: 12, responsavel: AR }),
    e({ etapa: 'Fechamento/alvenaria', inicioPrevisto: h(-185), fimPrevisto: h(-160), inicioReal: h(-170), fimReal: h(-140), progresso: 1, peso: 14, responsavel: AR }),
    e({ etapa: 'Cobertura', inicioPrevisto: h(-150), fimPrevisto: h(-110), inicioReal: h(-130), fimReal: h(-105), progresso: 1, peso: 10, responsavel: 'Telhados Cardoso' }),
    e({ etapa: 'Reboco e requadros', inicioPrevisto: h(-110), fimPrevisto: h(-40), inicioReal: h(-100), progresso: 0.9, peso: 9, responsavel: AR }),
    e({ etapa: 'Instalações hidrossanitárias', inicioPrevisto: h(-95), fimPrevisto: h(-35), inicioReal: h(-92), progresso: 0.8, peso: 7, responsavel: AR }),
    e({ etapa: 'Eletrodutos e caixas', inicioPrevisto: h(-95), fimPrevisto: h(-35), inicioReal: h(-90), progresso: 0.75, peso: 6, responsavel: AR }),
    e({ etapa: 'Pisos e revestimentos', inicioPrevisto: h(-45), fimPrevisto: h(-10), inicioReal: h(-30), progresso: 0.3, peso: 9, responsavel: AR }),
    e({ etapa: 'Forro/gesso', inicioPrevisto: h(-20), fimPrevisto: h(10), progresso: 0, peso: 4, responsavel: 'Gesso Arte' }),
    e({ etapa: 'Pintura', inicioPrevisto: h(5), fimPrevisto: h(25), progresso: 0, peso: 6 }),
    e({ etapa: 'Louças e metais', inicioPrevisto: h(15), fimPrevisto: h(25), progresso: 0, peso: 3 }),
    e({ etapa: 'Muro', inicioPrevisto: h(-50), fimPrevisto: h(-35), inicioReal: h(-48), fimReal: h(-33), progresso: 1, peso: 3, responsavel: AR }),
  );

  const d = (x) => Object.assign(novoDiario(), x);
  o.diario.push(
    d({ data: h(-190), clima: 'Chuva forte', efetivo: 0, atividades: 'Obra parada.' }),
    d({ data: h(-186), clima: 'Impraticável', efetivo: 0, atividades: 'Obra parada.' }),
    d({ data: h(-72), clima: 'Bom', efetivo: 4, atividades: 'Início do contrapiso da sala.' }),
    d({ data: h(-45), clima: 'Nublado', efetivo: 3, atividades: 'Medição 4.' }),
    d({ data: h(-12), clima: 'Bom', efetivo: 2, atividades: 'Assentamento do piso.', ocorrencias: 'Piso parou: falta rejunte.' }),
    d({ data: h(-2), clima: 'Bom', efetivo: 3, atividades: 'Retoques de reboco.' }),
  );
  return o;
}
