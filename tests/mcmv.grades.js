/**
 * mcmv.grades.js — a obra da planilha (planilha.fixture.js) escrita de volta
 * no layout do modelo Modelo_Controle_Obra_MCMV.xlsx, aba por aba, como
 * grades de células: 4 linhas de título e os dados a partir da 5ª; na
 * CONFIGURAÇÃO, rótulo na coluna A/D e valor na B/E. As colunas que a
 * planilha calcula (valor do contrato, líquido, total, saldo...) vêm
 * preenchidas, como num arquivo recalculado — o importador as ignora.
 *
 * formato 'iso': datas AAAA-MM-DD e números crus (o que o SheetJS devolve de
 * célula sem formato). 'br': dd/mm/aaaa, 1.234,56 e 20% (célula formatada).
 * Usado por tests/importacao-mcmv.test.js e pelo percurso no navegador.
 */
import {
  contratoValor,
  lancamentoTotal,
  materialCalc,
  medicaoLiquido,
  recebimentoLiquido,
} from '../src/dominio/calculos.js';

const TITULO = (aba) => [[`CONTROLE DE OBRA MCMV — ${aba}`], [], [], []];

export function gradesMCMV(obra, { cliente = '', formato = 'iso' } = {}) {
  const br = formato === 'br';
  const d = (iso) => (!iso ? '' : br ? iso.split('-').reverse().join('/') : iso);
  const n = (v) => {
    if (v === '' || v == null) return '';
    if (!br) return v;
    const [int, dec] = Math.abs(Number(v)).toFixed(2).split('.');
    return `${Number(v) < 0 ? '-' : ''}${int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec}`;
  };
  const p = (v) =>
    v === '' || v == null ? '' : br ? `${Math.round(Number(v) * 10000) / 100}%` : v;
  const f = obra.fin;

  const cfg = [
    ...TITULO('CONFIGURAÇÃO'),
    ['Obra', obra.nome, '', 'Saldo inicial', n(f.saldoInicial)],
    ['Cliente', cliente, '', 'Valor do terreno', n(f.valorTerreno)],
    ['Cidade', obra.cidade, '', 'Valor financiado', n(f.valorFinanciado)],
    ['Endereço', obra.endereco || '', '', 'Recursos próprios', n(f.recursosProprios)],
    [
      'Área construída (m²)',
      n(obra.areaConstruida),
      '',
      'Empreitada R$/m²',
      n(f.precoEmpreitadaM2),
    ],
    [
      'Área de muro (m)',
      n(obra.areaMuro),
      '',
      'Empreitada total',
      n(obra.areaConstruida * f.precoEmpreitadaM2),
    ],
    [
      'Sistema construtivo',
      obra.sistema || '',
      '',
      'Custo físico máx. R$/m²',
      n(f.custoFisicoMaxM2),
    ],
    ['Padrão', obra.padrao || '', '', 'Valor de venda', n(f.valorVenda)],
    ['Início', d(obra.dataInicio), '', 'Margem desejada', p(f.margemDesejada)],
    [
      'Previsão de conclusão',
      d(obra.previsaoConclusao),
      '',
      'Contrato CAIXA',
      f.contratoCaixa || '',
    ],
    ['Responsável', obra.responsavel || '', '', 'Assinatura', d(f.dataAssinatura)],
    ['Observações', obra.observacoes || ''],
  ];

  const contratos = [
    ...TITULO('CONTRATOS E ADITIVOS'),
    ...obra.contratos.map((c) => [
      c.codigo,
      c.codigoBase,
      c.registro,
      c.prestador,
      c.escopo,
      c.regime,
      n(c.quantidade || ''),
      c.unidade,
      n(c.precoUnitario || ''),
      n(c.valorInformado || ''),
      n(contratoValor(c)),
      c.incluiMaterial,
      d(c.inicioPrevisto),
      d(c.fimPrevisto),
      c.status,
    ]),
  ];
  const medicoes = [
    ...TITULO('MEDIÇÕES'),
    ...obra.medicoes.map((m, i) => [
      i + 1,
      m.contratoBase,
      m.numero,
      d(m.data),
      m.descricao,
      p(m.progresso),
      n(m.valorMedido),
      n(m.desconto || ''),
      n(medicaoLiquido(m)),
      d(m.dataPagamento),
      n(m.valorPago || ''),
      m.status,
      m.documento || '',
    ]),
  ];
  const recebimentos = [
    ...TITULO('RECEBIMENTOS CAIXA'),
    ...obra.recebimentos.map((r, i) => [
      i + 1,
      r.origem,
      r.numeroMedicao ?? '',
      r.etapaPci,
      d(r.dataPrevista),
      n(r.valorPrevisto),
      d(r.dataSolicitacao),
      p(r.percentObra || ''),
      n(r.valorAprovado || ''),
      n(r.descontos || ''),
      n(recebimentoLiquido(r)),
      d(r.dataRecebimento),
      n(r.valorRecebido || ''),
      r.status,
    ]),
  ];
  const lancamentos = [
    ...TITULO('LANÇAMENTOS'),
    ...obra.lancamentos.map((l, i) => [
      i + 1,
      d(l.data),
      l.data.slice(0, 7),
      l.tipo,
      l.etapa,
      l.categoria,
      l.descricao,
      l.fornecedor,
      l.documento,
      n(l.quantidade),
      l.unidade,
      n(l.precoUnitario),
      n(l.desconto || ''),
      n(l.frete || ''),
      n(lancamentoTotal(l)),
      l.formaPagamento,
      l.observacoes || '',
    ]),
  ];
  const materiais = [
    ...TITULO('PLANO DE MATERIAIS'),
    ...obra.materiais.map((m, i) => {
      const c = materialCalc(obra, m);
      return [
        i + 1,
        m.etapa,
        m.material,
        n(m.quantidadeNecessaria),
        m.unidade,
        d(m.dataNecessaria),
        m.prioridade,
        n(c.comprada),
        n(c.saldo),
        n(m.precoPrevisto),
        n(c.orcamento),
        n(c.valorComprado),
        m.status,
        m.observacoes || '',
      ];
    }),
  ];
  const cronograma = [
    ...TITULO('CRONOGRAMA OBRA'),
    ...obra.cronograma.map((e) => [
      e.etapa,
      d(e.inicioPrevisto),
      d(e.fimPrevisto),
      d(e.inicioReal),
      d(e.fimReal),
      p(e.progresso),
      '',
      '',
      '',
      n(e.quantidadeExecutada),
      e.unidadeProducao,
      '',
      e.responsavel || '',
    ]),
  ];
  return {
    CONFIGURAÇÃO: cfg,
    'CONTRATOS E ADITIVOS': contratos,
    MEDIÇÕES: medicoes,
    'RECEBIMENTOS CAIXA': recebimentos,
    LANÇAMENTOS: lancamentos,
    'PLANO DE MATERIAIS': materiais,
    'CRONOGRAMA OBRA': cronograma,
  };
}
