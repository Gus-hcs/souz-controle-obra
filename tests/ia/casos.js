/**
 * Conjunto de avaliação da leitura de nota (IA, 0027): 10 documentos
 * INVENTADOS — empresas, CNPJs e valores de mentira, nenhum dado real —
 * desenhados em HTML e fotografados/impressos pelo avaliar.mjs. Cada caso
 * traz o gabarito do que a leitura precisa devolver.
 */

/* CNPJ inventado com dígitos verificadores certos (a leitura confere o DV) */
export function cnpjFicticio(base12) {
  const dv = (b, pesos) => {
    const s = b.split('').reduce((a, n, i) => a + Number(n) * pesos[i], 0) % 11;
    return s < 2 ? 0 : 11 - s;
  };
  const d1 = dv(base12, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = dv(base12 + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return base12 + d1 + d2;
}
const fmtCnpj = (c) =>
  `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
const brl = (v) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const brData = (iso) => iso.split('-').reverse().join('/');

const it = (descricao, quantidade, unidade, valorUnitario, extra = {}) => ({
  descricao,
  quantidade,
  unidade,
  valorUnitario,
  valorTotal: Math.round(quantidade * valorUnitario * 100) / 100,
  servico: false,
  valorServico: null,
  ...extra,
});

function nota(o) {
  const soma = o.itens.reduce((s, x) => s + x.valorTotal, 0);
  const total = Math.round((soma - (o.desconto || 0) + (o.frete || 0)) * 100) / 100;
  return {
    tipoDocumento: 'nfe',
    desconto: null,
    frete: null,
    formaPagamento: null,
    ...o,
    totalNota: total,
  };
}

export const CASOS = [
  {
    id: '01-nfe-simples',
    formato: 'jpg',
    doc: nota({
      fornecedor: 'Depósito Pedra Branca Materiais Ltda',
      cnpj: cnpjFicticio('481527390001'),
      numero: '000.014.233',
      dataEmissao: '2026-09-02',
      formaPagamento: 'PIX',
      desconto: 12.5,
      itens: [
        it('CIMENTO CP II-E-32 SACO 50KG', 20, 'SC', 36.9),
        it('AREIA MEDIA LAVADA', 3, 'M3', 145),
        it('BRITA 1', 2, 'M3', 160),
      ],
    }),
  },
  {
    id: '02-nfe-frete',
    formato: 'jpg',
    doc: nota({
      fornecedor: 'Casa do Construtor Vale Verde Ltda',
      cnpj: cnpjFicticio('730915260001'),
      numero: '88412',
      dataEmissao: '2026-08-21',
      formaPagamento: 'Boleto',
      frete: 180,
      itens: [
        it('BLOCO CERAMICO 9X19X39', 3, 'MIL', 980),
        it('ACO CA-50 10MM BARRA 12M', 40, 'BR', 48.5),
        it('ACO CA-60 5MM BARRA 12M', 25, 'BR', 19.9),
        it('ARAME RECOZIDO 18', 5, 'KG', 18),
        it('PREGO 17X27 COM CABECA', 5, 'KG', 16.4),
        it('TABUA PINUS 30CM', 30, 'M', 12.5),
        it('CAL HIDRATADA 20KG', 15, 'SC', 17.8),
        it('ARGAMASSA AC-I 20KG', 25, 'SC', 14.9),
      ],
    }),
  },
  {
    id: '03-fornecimento-instalacao',
    formato: 'jpg',
    doc: nota({
      fornecedor: 'Marmoraria Rocha Fina ME',
      cnpj: cnpjFicticio('162038550001'),
      numero: '1207',
      dataEmissao: '2026-09-10',
      formaPagamento: 'PIX',
      itens: [
        it('BANCADA GRANITO SAO GABRIEL 2,00M C/ CUBA - FORNECIMENTO E INSTALACAO', 1, 'UN', 3200, {
          servico: true,
          valorServico: 700,
        }),
        it('SOLEIRA GRANITO 0,80M', 4, 'UN', 85),
      ],
      adicional: 'Do valor da bancada, R$ 700,00 referem-se à mão de obra de instalação.',
    }),
  },
  {
    id: '04-nfse-servico',
    formato: 'jpg',
    doc: nota({
      tipoDocumento: 'nfse',
      fornecedor: 'Pinturas Horizonte Serviços Ltda',
      cnpj: cnpjFicticio('905561420001'),
      numero: '312',
      dataEmissao: '2026-09-15',
      formaPagamento: 'Transferência',
      itens: [
        it('SERVICO DE PINTURA INTERNA E EXTERNA - CASA 12', 1, 'SV', 4200, { servico: true }),
      ],
    }),
  },
  {
    id: '05-nfce-cupom',
    formato: 'cupom',
    doc: nota({
      tipoDocumento: 'nfce',
      fornecedor: 'Ferragens Bom Preço Eireli',
      cnpj: cnpjFicticio('337204810001'),
      numero: '55120',
      dataEmissao: '2026-09-18',
      formaPagamento: 'Cartão',
      itens: [
        it('DISJUNTOR BIPOLAR 32A', 2, 'UN', 42.9),
        it('FIO FLEXIVEL 2,5MM ROLO 100M', 1, 'UN', 239),
        it('CAIXA 4X2 AMARELA', 20, 'UN', 1.9),
        it('FITA ISOLANTE 20M', 3, 'UN', 7.5),
      ],
    }),
  },
  {
    id: '06-torta-escura',
    formato: 'jpg',
    distorcer: true,
    doc: nota({
      fornecedor: 'Hidráulica Fonte Clara Ltda',
      cnpj: cnpjFicticio('218840630001'),
      numero: '7781',
      dataEmissao: '2026-07-30',
      formaPagamento: 'Dinheiro',
      itens: [
        it('TUBO PVC SOLDAVEL 25MM BARRA 6M', 12, 'BR', 21.5),
        it('JOELHO 90 SOLDAVEL 25MM', 30, 'UN', 1.35),
        it('REGISTRO GAVETA 3/4', 4, 'UN', 58),
        it('CAIXA D AGUA 1000L', 1, 'UN', 489),
      ],
    }),
  },
  {
    id: '07-pdf-12-itens',
    formato: 'pdf',
    doc: nota({
      fornecedor: 'Distribuidora de Revestimentos Serra Azul S.A.',
      cnpj: cnpjFicticio('604177020001'),
      numero: '000.221.904',
      dataEmissao: '2026-09-05',
      formaPagamento: 'Boleto',
      desconto: 150,
      frete: 250,
      itens: [
        it('PISO PORCELANATO 60X60 ACETINADO', 85, 'M2', 49.9),
        it('REVESTIMENTO 32X57 BRANCO', 40, 'M2', 34.5),
        it('ARGAMASSA AC-III 20KG', 30, 'SC', 29.9),
        it('REJUNTE FLEXIVEL CINZA 1KG', 20, 'UN', 9.8),
        it('ESPACADOR 2MM PCT 100', 10, 'UN', 6.5),
        it('RODAPE PORCELANATO 10X60', 60, 'M', 11.9),
        it('SOLEIRA PORCELANATO 15X90', 6, 'UN', 38),
        it('NIVELADOR DE PISO PCT 50', 4, 'UN', 29),
        it('IMPERMEABILIZANTE 18KG', 3, 'UN', 189),
        it('MANTA LIQUIDA 18L', 2, 'UN', 229),
        it('LIMPA PISO 5L', 2, 'UN', 39.9),
        it('CANTONEIRA ALUMINIO 2,5M', 12, 'UN', 24.5),
      ],
    }),
  },
  {
    id: '08-recibo-mao',
    formato: 'recibo',
    doc: nota({
      tipoDocumento: 'recibo',
      fornecedor: 'José Aparecido Tavares',
      cnpj: null,
      numero: null,
      dataEmissao: '2026-09-12',
      formaPagamento: 'Dinheiro',
      itens: [it('Diárias de ajudante (5 dias)', 5, 'DIA', 150, { servico: true })],
    }),
  },
  {
    id: '09-cortada',
    formato: 'jpg',
    cortar: true,
    doc: nota({
      fornecedor: 'Madeireira Tronco Forte Ltda',
      cnpj: cnpjFicticio('889013570001'),
      numero: '4410',
      dataEmissao: '2026-08-02',
      formaPagamento: 'PIX',
      itens: [
        it('CAIBRO 5X6 EUCALIPTO 3M', 40, 'UN', 18.9),
        it('RIPA 1,5X5 3M', 60, 'UN', 5.9),
        it('TELHA CERAMICA PORTUGUESA', 1500, 'UN', 1.85),
      ],
    }),
    /* a foto corta o rodapé: o total não aparece */
    esperado: { totalNota: null },
  },
  {
    id: '10-nao-e-nota',
    formato: 'parede',
    doc: null,
  },
];

/* ------------------------------------------------------------ desenho */
const ESTILO = `
  body { margin: 0; background: #fff; font-family: 'Courier New', monospace; color: #111; }
  .nf { width: 1500px; padding: 40px; box-sizing: border-box; font-size: 20px; }
  .cab { border: 2px solid #000; padding: 16px; display: flex; justify-content: space-between; }
  .cab h1 { font-size: 30px; margin: 0 0 8px; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  th, td { border: 1px solid #000; padding: 6px 8px; text-align: left; }
  .tot { margin-top: 16px; border: 2px solid #000; padding: 12px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .dest { margin-top: 12px; border: 1px dashed #555; padding: 8px; font-size: 18px; }
  .adic { margin-top: 12px; font-size: 18px; }
`;

function htmlDanfe(d, rotulo = 'DANFE — Documento Auxiliar da Nota Fiscal Eletrônica') {
  return `<!doctype html><meta charset="utf-8"><style>${ESTILO}</style><div class="nf">
    <div class="cab"><div><h1>${d.fornecedor}</h1>
      CNPJ: ${d.cnpj ? fmtCnpj(d.cnpj) : ''} &nbsp; IE: 123.456.789.000<br>Rua das Obras, 100 — Centro — Cidade Exemplo/UF</div>
      <div><b>${rotulo}</b><br>Nº ${d.numero} &nbsp; Série 1<br>Emissão: ${brData(d.dataEmissao)}</div></div>
    <div class="dest">DESTINATÁRIO: CONSTRUTORA EXEMPLO LTDA — CNPJ 00.000.000/0001-91 — Av. Fictícia, 50</div>
    <table><thead><tr><th>Cód</th><th>Descrição</th><th>Un</th><th>Qtd</th><th>V. unit</th><th>V. total</th></tr></thead><tbody>
    ${d.itens.map((x, i) => `<tr><td>${1000 + i}</td><td>${x.descricao}</td><td>${x.unidade}</td><td>${brl(x.quantidade)}</td><td>${brl(x.valorUnitario)}</td><td>${brl(x.valorTotal)}</td></tr>`).join('')}
    </tbody></table>
    <div class="tot"><div>Valor dos produtos<br><b>${brl(d.itens.reduce((s, x) => s + x.valorTotal, 0))}</b></div>
      <div>Desconto<br><b>${brl(d.desconto || 0)}</b></div><div>Frete<br><b>${brl(d.frete || 0)}</b></div>
      <div>VALOR TOTAL DA NOTA<br><b>${brl(d.totalNota)}</b></div></div>
    <div class="adic">Forma de pagamento: ${d.formaPagamento || '—'}${d.adicional ? `<br>Informações complementares: ${d.adicional}` : ''}</div>
  </div>`;
}

function htmlCupom(d) {
  return `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#fff;font-family:monospace;font-size:22px}
    .c{width:560px;padding:24px;box-sizing:border-box}</style><div class="c">
    <b>${d.fornecedor}</b><br>CNPJ ${fmtCnpj(d.cnpj)}<br>Rua do Comércio, 9<br>----------------------------<br>
    NFC-e nº ${d.numero} Série 1<br>${brData(d.dataEmissao)} 10:42<br>----------------------------<br>
    ${d.itens.map((x) => `${x.descricao}<br>${brl(x.quantidade)} ${x.unidade} x ${brl(x.valorUnitario)} = ${brl(x.valorTotal)}<br>`).join('')}
    ----------------------------<br>QTD. TOTAL DE ITENS ${d.itens.length}<br><b>VALOR A PAGAR R$ ${brl(d.totalNota)}</b><br>
    FORMA PAGAMENTO: ${d.formaPagamento}<br>CONSUMIDOR NÃO IDENTIFICADO</div>`;
}

function htmlRecibo(d) {
  const x = d.itens[0];
  return `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#fdfbf2;font-family:'Segoe Script','Comic Sans MS',cursive;font-size:30px}
    .r{width:1300px;padding:50px;box-sizing:border-box;line-height:1.7}</style><div class="r">
    <b>RECIBO</b> &nbsp;&nbsp; R$ ${brl(x.valorTotal)}<br>
    Recebi da Construtora Exemplo a importância de ${brl(x.valorTotal)} reais referente a ${x.descricao.toLowerCase()},
    a R$ ${brl(x.valorUnitario)} por dia. Pago em dinheiro.<br><br>
    Cidade Exemplo, ${brData(d.dataEmissao)}<br><br>${d.fornecedor}</div>`;
}

const HTML_PAREDE = `<!doctype html><meta charset="utf-8"><style>body{margin:0}
  .p{width:1400px;height:1000px;background:repeating-linear-gradient(0deg,#b9a58c 0 38px,#8f7c66 38px 42px),#b9a58c}
  .p span{position:absolute;left:520px;top:420px;font:bold 60px sans-serif;color:#403020;transform:rotate(-6deg)}</style>
  <div class="p"><span>OBRA — ENTRADA</span></div>`;

export function htmlDoCaso(c) {
  if (c.formato === 'parede') return HTML_PAREDE;
  if (c.formato === 'cupom') return htmlCupom(c.doc);
  if (c.formato === 'recibo') return htmlRecibo(c.doc);
  return htmlDanfe(
    c.doc,
    c.doc.tipoDocumento === 'nfse' ? 'NFS-e — Nota Fiscal de Serviço Eletrônica' : undefined,
  );
}

/* O que a leitura precisa devolver: o documento, com os ajustes do caso. */
export function gabarito(c) {
  if (!c.doc) return { legivel: false };
  const d = c.doc;
  return {
    legivel: true,
    tipoDocumento: d.tipoDocumento,
    fornecedor: d.fornecedor,
    cnpj: d.cnpj,
    numero: d.numero ? d.numero.replace(/\D/g, '').replace(/^0+/, '') : null,
    dataEmissao: d.dataEmissao,
    totalNota: d.totalNota,
    desconto: d.desconto,
    frete: d.frete,
    itens: d.itens,
    ...(c.esperado || {}),
  };
}
