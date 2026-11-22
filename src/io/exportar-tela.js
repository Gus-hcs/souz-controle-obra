/**
 * exportar-tela.js — O botão "Exportar" do topo: cada aba que a equipe
 * preenche sai como relatório em PDF, planilha Excel (.xlsx) ou CSV.
 *
 * O conteúdo de cada aba vem de io/modelos-exportacao.js (os números são
 * os de dominio/calculos.js); aqui só se desenha:
 *   - PDF: o mesmo cabeçalho dos relatórios (logo, obra, cliente, empresa),
 *     a faixa de indicadores, os dados da obra e as tabelas, com total e
 *     paginação. Colunas marcadas como só-Excel ficam fora, para caber em A4.
 *   - Excel: aba "Resumo" (indicadores e dados) e uma aba por tabela, com
 *     número, moeda, % e data de verdade, filtro no cabeçalho e largura.
 *   - CSV: a tabela principal, no formato brasileiro (;).
 *
 * O botão só aparece na aba que tem algo preenchido (podeExportar).
 */
import { fmtData, hojeISO, isISO, num, slug } from '../nucleo/base.js';
import { Store } from '../dados/store.js';
import { ACOES } from '../ui/acoes.js';
import { App, ICO, nomeCliente, svg, toast } from '../ui/shell.js';
import { abrirMenu } from '../ui/telas/componentes.js';
import { CINZA, baixar, carregarXLSX, novoPDF, paraCSV, pdfRodape, salvarPDF } from './index.js';
import { MODELOS, formatarValor, montarModelo, podeExportar } from './modelos-exportacao.js';

/* ---------------------------------------------------------- contexto */
function contexto() {
  const view = App.rota.view;
  const def = MODELOS[view];
  if (!def) return null;
  const obra = def.escopo === 'obra' ? App.obra() : null;
  if (!podeExportar(view, Store.estado, obra)) return null;
  return { view, def, obra };
}

function nomeArquivo(modelo, obra, ext) {
  const partes = [modelo.arquivo, obra ? slug(obra.nome) : '', hojeISO()].filter(Boolean);
  return `${partes.join('-')}.${ext}`;
}

/* ============================================================== PDF
   Helvetica do jsPDF só tem o alfabeto WinAnsi: o "−" tipográfico e a
   seta viram lixo. Troca pelo equivalente que existe. */
const paraPdf = (s) =>
  String(s ?? '')
    .replace(/\u2212/g, '-')
    .replace(/\u2192/g, '->')
    .replace(/\u00b2/g, '2')
    .replace(/\u00b3/g, '3')
    .replace(/[\u2009\u202f]/g, ' ');

const ALINHA_DIREITA = new Set(['moeda', 'num', 'int', 'pct']);
const Y_MAX = 278;

function pdfTitulo(doc, y, titulo) {
  if (y > Y_MAX - 24) {
    doc.addPage();
    y = 20;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(20, 24, 26);
  doc.text(paraPdf(titulo), 14, y);
  return y + 2.5;
}

/* faixa de indicadores: até 4 cards, contexto em até duas linhas
   (o pdfKPIs dos relatórios corta em uma) */
function pdfIndicadores(doc, y, kpis) {
  const itens = kpis.slice(0, 4);
  const vao = 4;
  const largura = (182 - vao * (itens.length - 1)) / itens.length;
  const alt = 20;
  itens.forEach((k, i) => {
    const x = 14 + i * (largura + vao);
    doc.setDrawColor(215, 213, 206);
    doc.setFillColor(248, 247, 244);
    doc.roundedRect(x, y, largura, alt, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(...CINZA);
    doc.text(paraPdf(k.rotulo).toUpperCase(), x + 3, y + 5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(20, 24, 26);
    doc.text(doc.splitTextToSize(paraPdf(k.valor), largura - 6)[0], x + 3, y + 11);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(...CINZA);
    const ctx = doc.splitTextToSize(paraPdf(k.contexto), largura - 6).slice(0, 2);
    doc.text(ctx, x + 3, y + 14.6);
  });
  doc.setTextColor(20, 24, 26);
  return y + alt + 7;
}

/* situação que pede ação ganha cor no PDF, como na tela */
const TOM_TEXTO = [
  [
    /^(Crítico|Atrasad|Vencido|Travando|Parou|Início atrasado|Não iniciado · atrasado|Rescindido)/,
    [176, 32, 32],
  ],
  [/^(Atenção|Paga em parte|Medido 100%|Paralisado|Comprado \+)/, [161, 98, 7]],
];

const ESTILO_TABELA = {
  theme: 'grid',
  styles: {
    font: 'helvetica',
    fontSize: 7.6,
    cellPadding: 1.6,
    lineColor: [220, 218, 211],
    textColor: [30, 34, 36],
    overflow: 'linebreak',
  },
  headStyles: { fillColor: [16, 90, 102], textColor: 255, fontSize: 7.6, fontStyle: 'bold' },
  alternateRowStyles: { fillColor: [249, 248, 245] },
  footStyles: {
    fillColor: [240, 239, 234],
    textColor: [20, 24, 26],
    fontStyle: 'bold',
    fontSize: 7.6,
  },
  margin: { left: 14, right: 14 },
};

/* dados da obra (Configuração): duas colunas de campo · valor */
function pdfCampos(doc, y, grupo) {
  const itens = grupo.itens.filter((i) => String(i.valor ?? '').trim() !== '' && i.valor !== 0);
  if (!itens.length) return y;
  y = pdfTitulo(doc, y, grupo.titulo);
  const larga = grupo.itens.length === 1;
  const corpo = [];
  const cel = (i) => [
    { content: paraPdf(i.rotulo), styles: { textColor: CINZA } },
    paraPdf(formatarValor(i.valor, i.tipo)),
  ];
  if (larga) itens.forEach((i) => corpo.push([paraPdf(formatarValor(i.valor, i.tipo))]));
  else
    for (let k = 0; k < itens.length; k += 2) {
      corpo.push([...cel(itens[k]), ...(itens[k + 1] ? cel(itens[k + 1]) : ['', ''])]);
    }
  doc.autoTable({
    ...ESTILO_TABELA,
    theme: 'plain',
    startY: y,
    body: corpo,
    styles: {
      ...ESTILO_TABELA.styles,
      fontSize: 8.4,
      cellPadding: { top: 1.4, bottom: 1.4, left: 0, right: 3 },
    },
    columnStyles: larga ? {} : { 0: { cellWidth: 44 }, 1: { cellWidth: 47 }, 2: { cellWidth: 44 } },
  });
  return doc.lastAutoTable.finalY + 7;
}

function pdfSecao(doc, y, secao) {
  const idx = secao.colunas.map((c, i) => (c.pdf ? i : -1)).filter((i) => i >= 0);
  const colunas = idx.map((i) => secao.colunas[i]);
  y = pdfTitulo(doc, y, secao.titulo);
  if (!secao.linhas.length) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...CINZA);
    doc.text('Nada registrado.', 14, y + 4);
    doc.setTextColor(20, 24, 26);
    return y + 12;
  }
  const fmt = (linha) => idx.map((i) => paraPdf(formatarValor(linha[i], secao.colunas[i].tipo)));
  const columnStyles = {};
  /* número e data numa linha só ("R$ 82.700,00" quebrado em dois não se
     lê): a coluna tem no mínimo a largura do maior valor, total incluído */
  const corpo = secao.linhas.map(fmt);
  const rodape = secao.total ? fmt(secao.total) : null;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(ESTILO_TABELA.styles.fontSize);
  colunas.forEach((c, j) => {
    if (!ALINHA_DIREITA.has(c.tipo) && c.tipo !== 'data') return;
    const textos = [...corpo.map((l) => l[j]), ...(rodape && j > 0 ? [rodape[j]] : [])];
    const largura = Math.max(...textos.map((t) => doc.getTextWidth(String(t || ''))), 0) + 4.2;
    columnStyles[j] = { minCellWidth: largura, ...(c.tipo === 'data' ? {} : { halign: 'right' }) };
  });
  doc.autoTable({
    ...ESTILO_TABELA,
    startY: y,
    head: [colunas.map((c) => paraPdf(c.rotulo))],
    body: corpo,
    foot: rodape ? [rodape] : undefined,
    showFoot: 'lastPage',
    columnStyles,
    didParseCell: (h) => {
      if (h.section !== 'body' || typeof h.cell.raw !== 'string') return;
      const tom = TOM_TEXTO.find(([re]) => re.test(h.cell.raw));
      if (tom) h.cell.styles.textColor = tom[1];
    },
  });
  return doc.lastAutoTable.finalY + 8;
}

async function gerarPdf(modelo, obra) {
  /* aba da carteira: o cabeçalho leva o nome do relatório no lugar da obra */
  const cabecalho = obra || { nome: modelo.titulo, clienteId: '', cidade: '', endereco: '' };
  const doc = await novoPDF(cabecalho, obra ? modelo.titulo : 'Carteira');
  if (!doc) return;
  let y = doc.__startY;
  if (modelo.kpis && modelo.kpis.length) {
    y = pdfIndicadores(doc, y, modelo.kpis);
  }
  (modelo.campos || []).forEach((g) => {
    y = pdfCampos(doc, y, g);
  });
  modelo.secoes.forEach((s) => {
    y = pdfSecao(doc, y, s);
  });
  pdfRodape(doc);
  await salvarPDF(doc, nomeArquivo(modelo, obra, 'pdf'));
}

/* ============================================================ EXCEL */
const FORMATO_XLSX = {
  moeda: '"R$" #,##0.00;[Red]-"R$" #,##0.00',
  num: '#,##0.##',
  int: '0',
  pct: '0%',
  data: 'dd/mm/yyyy',
};

/* data AAAA-MM-DD → Date ao meio-dia local (não escorrega de dia pelo fuso) */
const paraData = (iso) => {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d, 12);
};

function valorXlsx(v, tipo) {
  if (v === '' || v === null || v === undefined) return null;
  if (tipo === 'data') return isISO(v) ? paraData(v) : String(v);
  if (FORMATO_XLSX[tipo]) return typeof v === 'number' ? v : num(v);
  return String(v);
}

/* nome de aba: até 31 caracteres, sem : \ / ? * [ ], único no livro */
function nomeAba(livro, titulo) {
  const base =
    String(titulo)
      .replace(/[:\\/?*[\]]/g, ' ')
      .trim()
      .slice(0, 31) || 'Dados';
  let nome = base;
  for (let i = 2; livro.SheetNames.includes(nome); i++) nome = `${base.slice(0, 28)} ${i}`;
  return nome;
}

function larguras(linhas) {
  const n = Math.max(...linhas.map((l) => l.length));
  return Array.from({ length: n }, (_, j) => {
    const max = linhas.reduce((m, l) => {
      const v = l[j];
      const t = v instanceof Date ? 10 : typeof v === 'number' ? 14 : String(v ?? '').length;
      return Math.max(m, t);
    }, 6);
    return { wch: Math.min(60, max + 2) };
  });
}

/* aplica o formato de número coluna a coluna, a partir da linha `de` */
function formatarColunas(XLSX, aba, colunas, de, ate) {
  colunas.forEach((c, j) => {
    const z = FORMATO_XLSX[c.tipo];
    if (!z) return;
    for (let r = de; r <= ate; r++) {
      const cel = aba[XLSX.utils.encode_cell({ r, c: j })];
      if (cel && (cel.t === 'n' || cel.t === 'd')) cel.z = z;
    }
  });
}

function abaResumo(XLSX, modelo, obra) {
  const emp = Store.estado.empresa || {};
  const linhas = [[modelo.titulo], [obra ? obra.nome : 'Carteira de obras']];
  if (obra) {
    const extra = [nomeCliente(obra.clienteId), obra.cidade, obra.endereco]
      .filter(Boolean)
      .join(' · ');
    if (extra) linhas.push([extra]);
  }
  linhas.push([emp.nome || 'Souz Controle de Obra'], ['Gerado em', paraData(hojeISO())], []);
  const formatos = []; // [linha, coluna, tipo]
  formatos.push([linhas.length - 2, 1, 'data']);
  if (modelo.kpis && modelo.kpis.length) {
    linhas.push(['Indicador', 'Valor', 'Contexto']);
    modelo.kpis.forEach((k) => linhas.push([k.rotulo, k.valor, k.contexto]));
    linhas.push([]);
  }
  (modelo.campos || []).forEach((g) => {
    linhas.push([g.titulo]);
    g.itens.forEach((i) => {
      if (i.tipo) formatos.push([linhas.length, 1, i.tipo]);
      linhas.push([i.rotulo, valorXlsx(i.valor, i.tipo)]);
    });
    linhas.push([]);
  });
  const aba = XLSX.utils.aoa_to_sheet(linhas, { cellDates: true });
  formatos.forEach(([r, c, tipo]) => {
    const cel = aba[XLSX.utils.encode_cell({ r, c })];
    if (cel && FORMATO_XLSX[tipo] && (cel.t === 'n' || cel.t === 'd')) cel.z = FORMATO_XLSX[tipo];
  });
  aba['!cols'] = [{ wch: 32 }, { wch: 22 }, { wch: 60 }];
  return aba;
}

function abaSecao(XLSX, secao) {
  const cab = secao.colunas.map((c) => c.rotulo);
  const corpo = secao.linhas.map((l) => l.map((v, j) => valorXlsx(v, secao.colunas[j].tipo)));
  const linhas = [cab, ...corpo];
  if (secao.total) linhas.push(secao.total.map((v, j) => valorXlsx(v, secao.colunas[j].tipo)));
  const aba = XLSX.utils.aoa_to_sheet(linhas, { cellDates: true });
  formatarColunas(XLSX, aba, secao.colunas, 1, linhas.length - 1);
  aba['!cols'] = larguras(linhas);
  if (corpo.length) {
    aba['!autofilter'] = {
      ref: XLSX.utils.encode_range({
        s: { r: 0, c: 0 },
        e: { r: corpo.length, c: cab.length - 1 },
      }),
    };
  }
  return aba;
}

async function gerarXlsx(modelo, obra) {
  toast('Montando a planilha…');
  const ok = await carregarXLSX();
  if (!ok) return toast('Não foi possível carregar o gerador de planilhas.', 'critico');
  const XLSX = window.XLSX;
  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, abaResumo(XLSX, modelo, obra), 'Resumo');
  modelo.secoes.forEach((s) => {
    XLSX.utils.book_append_sheet(livro, abaSecao(XLSX, s), nomeAba(livro, s.titulo));
  });
  livro.Props = {
    Title: `${modelo.titulo}${obra ? ' — ' + obra.nome : ''}`,
    Author: 'Souz Controle de Obra',
  };
  const buf = XLSX.write(livro, { bookType: 'xlsx', type: 'array', cellDates: true });
  await baixar(nomeArquivo(modelo, obra, 'xlsx'), buf);
}

/* ============================================================== CSV
   Só a tabela principal (a primeira), números no formato brasileiro. */
function valorCsv(v, tipo) {
  if (v === '' || v === null || v === undefined) return '';
  if (tipo === 'data') return isISO(v) ? fmtData(v) : String(v);
  if (tipo === 'pct') return formatarValor(v, 'pct');
  if (tipo === 'moeda' || tipo === 'num') return formatarValor(v, 'num').replace(/^R\$\s?/, '');
  return String(v);
}

async function gerarCsv(modelo, obra) {
  const s = modelo.secoes[0];
  if (!s) return toast('Esta aba não tem tabela para CSV — use PDF ou Excel.', 'aviso');
  const linhas = s.linhas.map((l) => l.map((v, j) => valorCsv(v, s.colunas[j].tipo)));
  await baixar(
    nomeArquivo(modelo, obra, 'csv'),
    paraCSV(
      s.colunas.map((c) => c.rotulo),
      linhas,
    ),
  );
}

/* ============================================================ ações */
const GERADORES = { pdf: gerarPdf, xlsx: gerarXlsx, csv: gerarCsv };

ACOES['exportar-tela'] = (el) => {
  const ctx = contexto();
  if (!ctx) return;
  const temTabela = MODELOS[ctx.view] && ctx.view !== 'obra-config';
  abrirMenu(
    el,
    `<div class="menu-grupo" role="presentation">Exportar esta aba</div>
     <button role="menuitem" data-acao="exportar-tela-gerar" data-formato="pdf" data-testid="exportar-pdf">PDF · relatório para enviar ou imprimir</button>
     <button role="menuitem" data-acao="exportar-tela-gerar" data-formato="xlsx" data-testid="exportar-xlsx">Excel (.xlsx) · números para somar e filtrar</button>
     ${temTabela ? '<button role="menuitem" data-acao="exportar-tela-gerar" data-formato="csv" data-testid="exportar-csv">CSV · tabela principal</button>' : ''}`,
    'menu-filtros',
  );
};

ACOES['exportar-tela-gerar'] = async (el, d) => {
  const ctx = contexto();
  const gerar = GERADORES[d.formato];
  if (!ctx || !gerar) return;
  try {
    const modelo = montarModelo(ctx.view, Store.estado, ctx.obra);
    await gerar(modelo, ctx.obra);
  } catch (e) {
    console.error(e);
    toast('Não foi possível gerar o arquivo desta aba.', 'critico');
  }
};

/* gancho do topo (shell.renderTopo): aparece só onde há o que exportar */
App.botaoExportar = () => {
  if (!contexto()) return '';
  return `<button class="btn sutil exportar-topo" data-acao="exportar-tela" aria-haspopup="menu" aria-expanded="false"
    title="Exportar esta aba em PDF, Excel ou CSV" data-testid="exportar-tela">${svg(ICO.baixar, 14)}<span class="rotulo-btn">Exportar</span></button>`;
};

export { gerarPdf, gerarXlsx, gerarCsv, abaSecao, abaResumo, valorXlsx, nomeAba };
