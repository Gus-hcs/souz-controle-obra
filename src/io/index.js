/**
 * index.js — Entrada e saída: importação de planilha MCMV, exportação CSV e PDF.
 */
import { addDias, competencia, fmtData, fmtDataCurta, fmtMoney, fmtNum, fmtPct, hojeISO, migrar, norm, novaEtapaCronograma, novaMedicao, novaObra, novoCliente, novoContrato, novoDiario, novoLancamento, novoMaterial, novoPrestador, novoRecebimento, num, slug } from '../nucleo/base.js';
import { alertasObra, basesContratuais, etapaCalc, kpisObra, lancamentoTotal, medicaoAlerta, medicaoLiquido, pesosCronograma, recebimentoDiferenca, recebimentoLiquido } from '../dominio/calculos.js';
import { apenasErros, validarObraCompleta } from '../dominio/validacao.js';
import { Store, mutar } from '../dados/store.js';
import { App, confirmar, nomeCliente, toast } from '../ui/shell.js';
import { ACOES } from '../ui/acoes.js';

/* ------------------------------------------------ carregador de libs */
function carregarScript(urls, testar) {
  if (testar()) return Promise.resolve(true);
  return new Promise((resolve) => {
    let i = 0;
    const tentar = () => {
      if (i >= urls.length) return resolve(false);
      const s = document.createElement('script');
      s.src = urls[i++];
      s.onload = () => resolve(testar() ? true : tentar());
      s.onerror = () => tentar();
      document.head.appendChild(s);
    };
    tentar();
  });
}

const carregarPDF = () => carregarScript([
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js'
], () => !!(window.jspdf && window.jspdf.jsPDF)).then((ok) => ok && carregarScript([
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js',
  'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js'
], () => !!(window.jspdf && window.jspdf.jsPDF && window.jspdf.jsPDF.API.autoTable)));

const carregarXLSX = () => carregarScript([
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'
], () => !!window.XLSX);

/* --------------------------------------------------------- download */
const TIPO_MIME = {
  pdf: 'application/pdf',
  csv: 'text/csv;charset=utf-8',
  json: 'application/json;charset=utf-8'
};

function baixarNoNavegador(nomeArquivo, dados) {
  const ext = (nomeArquivo.split('.').pop() || '').toLowerCase();
  const tipo = TIPO_MIME[ext] || (typeof dados === 'string' ? 'text/plain;charset=utf-8' : 'application/octet-stream');
  const blob = dados instanceof Blob ? dados : new Blob([dados], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

async function baixar(nomeArquivo, dados) {
  /* 1) runtime do artefato Claude, quando o sistema roda embarcado */
  try {
    const dl = typeof claude === 'undefined' ? null : await claude.use('downloads');
    if (dl) {
      try {
        await dl.save({ filename: nomeArquivo, data: dados });
        toast('Arquivo gerado: ' + nomeArquivo, 'ok');
        return true;
      } catch (err) {
        if (err && err.code === 'declined') return false;
        /* qualquer outra falha: tenta o método do navegador */
      }
    }
  } catch (e) { /* sem runtime: segue para o navegador */ }

  /* 2) navegador comum: Blob + link temporário */
  try {
    baixarNoNavegador(nomeArquivo, dados);
    toast('Arquivo gerado: ' + nomeArquivo, 'ok');
    return true;
  } catch (err) {
    toast('Não foi possível salvar o arquivo.', 'critico');
    return false;
  }
}

/* -------------------------------------------------------------- CSV */
function paraCSV(cabecalho, linhas) {
  const cel = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return '﻿' + [cabecalho, ...linhas].map((l) => l.map(cel).join(';')).join('\r\n');
}
const csvNum = (v) => fmtNum(v, 2);

ACOES['csv-lancamentos'] = async () => {
  const o = App.obra();
  const csv = paraCSV(
    ['Data', 'Competência', 'Tipo', 'Etapa', 'Categoria', 'Descrição', 'Fornecedor', 'Documento',
      'Quantidade', 'Unidade', 'Preço unitário', 'Desconto', 'Frete', 'Total', 'Pagamento'],
    o.lancamentos.map((l) => [fmtData(l.data), competencia(l.data), l.tipo, l.etapa, l.categoria,
      l.descricao, l.fornecedor, l.documento, csvNum(l.quantidade), l.unidade, csvNum(l.precoUnitario),
      csvNum(l.desconto), csvNum(l.frete), csvNum(lancamentoTotal(l)), l.formaPagamento]));
  await baixar(`lancamentos-${slug(o.nome)}.csv`, csv);
};

ACOES['csv-medicoes'] = async () => {
  const o = App.obra();
  const csv = paraCSV(
    ['Nº', 'Contrato', 'Data', 'Descrição', 'Progresso', 'Valor medido', 'Desconto', 'Líquido',
      'Data pagamento', 'Valor pago', 'A pagar', 'Status', 'Documento', 'Alerta'],
    o.medicoes.map((m) => [m.numero, m.contratoBase, fmtData(m.data), m.descricao, fmtPct(m.progresso, 0),
      csvNum(m.valorMedido), csvNum(m.desconto), csvNum(medicaoLiquido(m)), fmtData(m.dataPagamento),
      csvNum(m.valorPago), csvNum(medicaoLiquido(m) - num(m.valorPago)), m.status, m.documento, medicaoAlerta(o, m)]));
  await baixar(`medicoes-${slug(o.nome)}.csv`, csv);
};

ACOES['csv-recebimentos'] = async () => {
  const o = App.obra();
  const csv = paraCSV(
    ['Origem', 'Nº', 'Etapa PCI', 'Data prevista', 'Valor previsto', 'Data solicitação', '% obra',
      'Aprovado', 'Descontos', 'Líquido esperado', 'Data recebimento', 'Valor recebido', 'Diferença', 'Status'],
    o.recebimentos.map((r) => [r.origem, r.numeroMedicao, r.etapaPci, fmtData(r.dataPrevista),
      csvNum(r.valorPrevisto), fmtData(r.dataSolicitacao), fmtPct(r.percentObra, 0), csvNum(r.valorAprovado),
      csvNum(r.descontos), csvNum(recebimentoLiquido(r)), fmtData(r.dataRecebimento), csvNum(r.valorRecebido),
      csvNum(recebimentoDiferenca(r)), r.status]));
  await baixar(`recebimentos-${slug(o.nome)}.csv`, csv);
};

/* -------------------------------------------------------- BACKUP JSON */
ACOES['backup-json'] = async () => {
  const json = JSON.stringify(Store.estado, null, 1);
  await baixar(`souz-backup-${hojeISO()}.json`, json);
};

ACOES['restaurar-json'] = () => {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = 'application/json,.json';
  inp.onchange = async () => {
    const f = inp.files[0];
    if (!f) return;
    try {
      const texto = await f.text();
      const dados = JSON.parse(texto);
      if (!dados || !Array.isArray(dados.obras)) throw new Error('arquivo sem obras');
      confirmar('Restaurar backup', `Substituir a base atual (${Store.estado.obras.length} obra(s)) pelo backup com ${dados.obras.length} obra(s)?`, () => {
        mutar((e) => {
          const novo = migrar(dados);
          e.obras = novo.obras; e.clientes = novo.clientes; e.prestadores = novo.prestadores;
          e.listas = novo.listas; e.empresa = novo.empresa;
        }, { imediato: true });
        App.rota.obraId = '';
        App.ir('carteira');
        toast('Backup restaurado.', 'ok');
      }, 'Restaurar');
    } catch (err) {
      toast('Arquivo inválido: ' + err.message, 'critico');
    }
  };
  inp.click();
};

/* ============================================ IMPORTAR PLANILHA MCMV */
ACOES['importar-xlsx'] = async () => {
  toast('Carregando leitor de planilhas…');
  const ok = await carregarXLSX();
  if (!ok) return toast('Não foi possível carregar o leitor de planilhas.', 'critico');
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = '.xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  inp.multiple = true;
  inp.onchange = async () => {
    const arquivos = [...inp.files];
    let importadas = 0;
    let comProblema = 0;
    for (const f of arquivos) {
      try {
        const buf = await f.arrayBuffer();
        const wb = XLSX.read(buf, { cellDates: true });
        const obra = planilhaParaObra(wb, f.name.replace(/\.xls[xm]$/i, ''));
        mutar((e) => { e.obras.push(obra); }, { render: false });
        importadas++;
        const erros = apenasErros(validarObraCompleta(obra));
        if (erros.length) {
          comProblema++;
          console.warn(`Planilha ${f.name}: ${erros.length} problema(s) de integridade`, erros);
        }
      } catch (err) {
        console.error(err);
        toast(`Falha ao importar ${f.name}: ${err.message}`, 'critico', 6000);
      }
    }
    if (importadas) {
      App.ir('carteira');
      toast(`${importadas} obra(s) importada(s) da planilha.`, 'ok', 5000);
      if (comProblema) {
        toast(`${comProblema} obra(s) com dados fora do padrão — revise antes de gravar; o banco vai recusar valores inválidos.`, 'aviso', 8000);
      }
    }
  };
  inp.click();
};

function planilhaParaObra(wb, nomeArquivo) {
  const aba = (n) => {
    const chave = wb.SheetNames.find((s) => norm(s) === norm(n));
    return chave ? wb.Sheets[chave] : null;
  };
  const grade = (nome) => {
    const s = aba(nome);
    return s ? XLSX.utils.sheet_to_json(s, { header: 1, raw: false, dateNF: 'yyyy-mm-dd', defval: '' }) : [];
  };
  const dataDe = (v) => {
    if (!v) return '';
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    const s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (br) return `${br[3]}-${br[2]}-${br[1]}`;
    const serial = Number(s);
    if (isFinite(serial) && serial > 20000 && serial < 90000) {
      return new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString().slice(0, 10);
    }
    return '';
  };
  const pct = (v) => {
    const s = String(v ?? '').trim();
    if (!s) return 0;
    if (s.includes('%')) return num(s.replace('%', '')) / 100;
    const n = num(s);
    return n > 1.5 ? n / 100 : n;
  };

  const obra = novaObra(nomeArquivo || 'Obra importada');

  /* CONFIGURAÇÃO */
  const cfg = grade('CONFIGURAÇÃO');
  const cel = (linha, col) => (cfg[linha] && cfg[linha][col] !== undefined ? cfg[linha][col] : '');
  if (cfg.length) {
    obra.nome = String(cel(4, 1) || nomeArquivo || 'Obra importada').trim() || nomeArquivo;
    const clienteNome = String(cel(5, 1) || '').trim();
    if (clienteNome) {
      let cli = Store.estado.clientes.find((c) => norm(c.nome) === norm(clienteNome));
      if (!cli) { cli = novoCliente(); cli.nome = clienteNome; Store.estado.clientes.push(cli); }
      obra.clienteId = cli.id;
    }
    obra.cidade = String(cel(6, 1) || '').trim();
    obra.endereco = String(cel(7, 1) || '').trim();
    obra.areaConstruida = num(cel(8, 1));
    obra.areaMuro = num(cel(9, 1));
    obra.sistema = String(cel(10, 1) || '').trim();
    obra.padrao = String(cel(11, 1) || 'MCMV').trim();
    obra.dataInicio = dataDe(cel(12, 1));
    obra.previsaoConclusao = dataDe(cel(13, 1));
    obra.responsavel = String(cel(14, 1) || '').trim();
    obra.observacoes = String(cel(15, 1) || '').trim();
    obra.fin.saldoInicial = num(cel(4, 4));
    obra.fin.valorTerreno = num(cel(5, 4));
    obra.fin.valorFinanciado = num(cel(6, 4));
    obra.fin.recursosProprios = num(cel(7, 4));
    obra.fin.precoEmpreitadaM2 = num(cel(8, 4));
    obra.fin.custoFisicoMaxM2 = num(cel(10, 4));
    obra.fin.valorVenda = num(cel(11, 4));
    obra.fin.margemDesejada = pct(cel(12, 4));
    obra.fin.contratoCaixa = String(cel(13, 4) || '').trim();
    obra.fin.dataAssinatura = dataDe(cel(14, 4));
    obra.status = 'Em andamento';
  }

  /* linhas de dados começam na 5ª linha (índice 4) */
  const linhas = (nome) => grade(nome).slice(4).filter((l) => l.some((c) => String(c ?? '').trim() !== ''));

  linhas('CONTRATOS E ADITIVOS').forEach((l) => {
    if (!String(l[0] ?? '').trim()) return;
    const c = novoContrato();
    Object.assign(c, {
      codigo: String(l[0]).trim(),
      codigoBase: String(l[1] || l[0]).trim(),
      registro: String(l[2] || 'Contrato').trim(),
      prestador: String(l[3] || '').trim(),
      escopo: String(l[4] || '').trim(),
      regime: String(l[5] || 'Preço fechado').trim(),
      quantidade: num(l[6]), unidade: String(l[7] || 'vb').trim(),
      precoUnitario: num(l[8]), valorInformado: num(l[9]),
      incluiMaterial: String(l[11] || 'Não').trim(),
      inicioPrevisto: dataDe(l[12]), fimPrevisto: dataDe(l[13]),
      status: String(l[14] || 'Em andamento').trim()
    });
    /* A empreitada principal do modelo referencia a aba CONFIGURAÇÃO por fórmula.
       Se o arquivo vier sem os valores calculados, reconstitui a partir da obra. */
    if (norm(c.regime) === norm('R$/m²')) {
      if (!c.quantidade) c.quantidade = num(obra.areaConstruida);
      if (!c.precoUnitario) c.precoUnitario = num(obra.fin.precoEmpreitadaM2);
    }
    if (!c.quantidade && !c.precoUnitario && !c.valorInformado) c.valorInformado = num(l[10]);
    obra.contratos.push(c);
  });

  linhas('MEDIÇÕES').forEach((l) => {
    if (!String(l[1] ?? '').trim()) return;
    const m = novaMedicao();
    Object.assign(m, {
      contratoBase: String(l[1]).trim(), numero: String(l[2] || '').trim(),
      data: dataDe(l[3]), descricao: String(l[4] || '').trim(), progresso: pct(l[5]),
      valorMedido: num(l[6]), desconto: num(l[7]), dataPagamento: dataDe(l[9]),
      valorPago: num(l[10]), status: String(l[11] || 'Em aberto').trim(),
      documento: String(l[12] || '').trim()
    });
    obra.medicoes.push(m);
  });

  linhas('RECEBIMENTOS CAIXA').forEach((l) => {
    if (!String(l[1] ?? '').trim()) return;
    const r = novoRecebimento();
    Object.assign(r, {
      origem: String(l[1]).trim(), numeroMedicao: String(l[2] || '').trim(),
      etapaPci: String(l[3] || '').trim(), dataPrevista: dataDe(l[4]), valorPrevisto: num(l[5]),
      dataSolicitacao: dataDe(l[6]), percentObra: pct(l[7]), valorAprovado: num(l[8]),
      descontos: num(l[9]), dataRecebimento: dataDe(l[11]), valorRecebido: num(l[12]),
      status: String(l[13] || 'Previsto').trim()
    });
    obra.recebimentos.push(r);
  });

  linhas('LANÇAMENTOS').forEach((l) => {
    if (!dataDe(l[1])) return;
    const x = novoLancamento();
    Object.assign(x, {
      data: dataDe(l[1]), tipo: String(l[3] || 'Material').trim(), etapa: String(l[4] || '').trim(),
      categoria: String(l[5] || '').trim(), descricao: String(l[6] || '').trim(),
      fornecedor: String(l[7] || '').trim(), documento: String(l[8] || '').trim(),
      quantidade: num(l[9]), unidade: String(l[10] || 'un').trim(), precoUnitario: num(l[11]),
      desconto: num(l[12]), frete: num(l[13]), formaPagamento: String(l[15] || 'PIX').trim(),
      observacoes: String(l[16] || '').trim()
    });
    obra.lancamentos.push(x);
  });

  linhas('PLANO DE MATERIAIS').forEach((l) => {
    if (!String(l[2] ?? '').trim()) return;
    const m = novoMaterial();
    Object.assign(m, {
      etapa: String(l[1] || '').trim(), material: String(l[2]).trim(),
      quantidadeNecessaria: num(l[3]), unidade: String(l[4] || 'un').trim(),
      dataNecessaria: dataDe(l[5]), prioridade: String(l[6] || 'Média').trim(),
      precoPrevisto: num(l[9]), status: String(l[12] || 'Planejar').trim(),
      observacoes: String(l[13] || '').trim()
    });
    obra.materiais.push(m);
  });

  linhas('CRONOGRAMA OBRA').forEach((l) => {
    const nome = String(l[0] ?? '').trim();
    if (!nome) return;
    const e = novaEtapaCronograma(nome);
    Object.assign(e, {
      inicioPrevisto: dataDe(l[1]), fimPrevisto: dataDe(l[2]),
      inicioReal: dataDe(l[3]), fimReal: dataDe(l[4]), progresso: pct(l[5]),
      quantidadeExecutada: num(l[9]), unidadeProducao: String(l[10] || '').trim(),
      responsavel: String(l[12] || '').trim()
    });
    obra.cronograma.push(e);
  });

  const total = obra.contratos.length + obra.medicoes.length + obra.recebimentos.length +
    obra.lancamentos.length + obra.materiais.length;
  if (!total && !obra.cronograma.length) {
    throw new Error('a planilha não tem as abas do modelo MCMV');
  }
  return obra;
}

/* ================================================== RELATÓRIOS EM PDF */
const CINZA = [90, 96, 98];

async function novoPDF(obra, subtitulo) {
  const ok = await carregarPDF();
  if (!ok) { toast('Não foi possível carregar o gerador de PDF.', 'critico'); return null; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const emp = Store.estado.empresa;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
  doc.text(obra.nome || 'Obra', 14, 18);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...CINZA);
  const linha1 = [nomeCliente(obra.clienteId), obra.cidade, obra.endereco].filter(Boolean).join(' · ');
  doc.text(linha1.slice(0, 95), 14, 23.5);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(20, 24, 26);
  doc.text(emp.nome || 'Souz Controle de Obra', 196, 18, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...CINZA);
  doc.text(subtitulo + ' · ' + fmtData(hojeISO()), 196, 23.5, { align: 'right' });
  doc.setDrawColor(180, 180, 175); doc.line(14, 27, 196, 27);
  doc.setTextColor(20, 24, 26);
  return doc;
}

function pdfKPIs(doc, y, itens) {
  const largura = (196 - 14 - 3 * 4) / 4;
  itens.slice(0, 4).forEach((it, i) => {
    const x = 14 + i * (largura + 4);
    doc.setDrawColor(215, 213, 206); doc.setFillColor(248, 247, 244);
    doc.roundedRect(x, y, largura, 17, 1.5, 1.5, 'FD');
    doc.setFontSize(7.5); doc.setTextColor(...CINZA);
    doc.text(String(it[0]).toUpperCase(), x + 3, y + 5.5);
    doc.setFontSize(12); doc.setTextColor(20, 24, 26); doc.setFont('helvetica', 'bold');
    doc.text(String(it[1]), x + 3, y + 11.5);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...CINZA);
    if (it[2]) doc.text(String(it[2]).slice(0, 34), x + 3, y + 15.2);
    doc.setTextColor(20, 24, 26);
  });
  return y + 23;
}

function pdfTabela(doc, y, titulo, cabecalho, corpo, opcoes = {}) {
  if (!corpo.length) return y;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5);
  doc.text(titulo, 14, y);
  doc.autoTable({
    startY: y + 2.5,
    head: [cabecalho],
    body: corpo,
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 7.6, cellPadding: 1.6, lineColor: [220, 218, 211], textColor: [30, 34, 36] },
    headStyles: { fillColor: [16, 90, 102], textColor: 255, fontSize: 7.6, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [249, 248, 245] },
    columnStyles: opcoes.colunas || {},
    margin: { left: 14, right: 14 },
    foot: opcoes.rodape ? [opcoes.rodape] : undefined,
    footStyles: { fillColor: [240, 239, 234], textColor: [20, 24, 26], fontStyle: 'bold', fontSize: 7.6 }
  });
  return doc.lastAutoTable.finalY + 8;
}

function pdfRodape(doc) {
  const total = doc.internal.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5); doc.setTextColor(...CINZA);
    doc.text(`${Store.estado.empresa.nome || 'Souz Controle de Obra'} · gerado em ${fmtData(hojeISO())}`, 14, 289);
    doc.text(`página ${i} de ${total}`, 196, 289, { align: 'right' });
  }
}

async function salvarPDF(doc, nome) {
  const buf = doc.output('arraybuffer');
  await baixar(nome, buf);
}

/* ------------------------------------------- 1. status da obra */
ACOES['pdf-status'] = async () => {
  const o = App.obra();
  const doc = await novoPDF(o, 'Relatório de status');
  if (!doc) return;
  const k = kpisObra(o);
  let y = 34;
  y = pdfKPIs(doc, y, [
    ['Avanço físico', fmtPct(k.progressoFisico, 0), `${k.etapasConcluidas}/${k.etapasTotal} etapas`],
    ['Recebido', fmtMoney(k.recebido, { dec: 0 }), `de ${fmtMoney(k.financiado, { dec: 0 })}`],
    ['Pago', fmtMoney(k.totalPago, { dec: 0 }), k.area ? `${fmtMoney(k.custoM2, { dec: 0 })}/m²` : ''],
    ['Saldo em caixa', fmtMoney(k.saldoCaixa, { dec: 0 }), `previsto ${fmtMoney(k.custoPrevisto, { dec: 0 })}`]
  ]);

  y = pdfTabela(doc, y, 'Cronograma e progresso',
    ['Etapa', 'Previsto', 'Real', 'Progresso', 'Situação'],
    o.cronograma.map((e) => {
      const c = etapaCalc(e);
      return [e.etapa, `${fmtDataCurta(e.inicioPrevisto)} a ${fmtDataCurta(e.fimPrevisto)}`,
        `${fmtDataCurta(e.inicioReal)} a ${fmtDataCurta(e.fimReal)}`, fmtPct(c.progresso, 0), c.situacao];
    }), { colunas: { 3: { halign: 'right' } } });

  const bases = basesContratuais(o);
  y = pdfTabela(doc, y, 'Contratos e aditivos',
    ['Contrato', 'Prestador', 'Autorizado', 'Pago', 'Saldo'],
    bases.map((b) => [b.base, b.prestador, fmtMoney(b.autorizado), fmtMoney(b.pago), fmtMoney(b.saldo)]),
    {
      colunas: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
      rodape: ['Total', '', fmtMoney(bases.reduce((s, b) => s + b.autorizado, 0)),
        fmtMoney(bases.reduce((s, b) => s + b.pago, 0)), fmtMoney(bases.reduce((s, b) => s + b.saldo, 0))]
    });

  y = pdfTabela(doc, y, 'Recebimentos',
    ['Origem', 'Nº', 'Previsto p/', 'Valor previsto', 'Recebido em', 'Valor recebido', 'Status'],
    o.recebimentos.map((r) => [r.origem, r.numeroMedicao, fmtDataCurta(r.dataPrevista),
      fmtMoney(r.valorPrevisto), fmtDataCurta(r.dataRecebimento), fmtMoney(r.valorRecebido), r.status]),
    { colunas: { 3: { halign: 'right' }, 5: { halign: 'right' } } });

  const al = alertasObra(o);
  if (al.length) {
    pdfTabela(doc, y, 'Pendências',
      ['Nível', 'Módulo', 'Situação', 'Ação recomendada'],
      al.slice(0, 18).map((a) => [a.sev === 3 ? 'Crítico' : a.sev === 2 ? 'Atenção' : 'Info',
        a.modulo, a.titulo, a.acao]), { colunas: { 0: { cellWidth: 16 }, 1: { cellWidth: 24 } } });
  }
  pdfRodape(doc);
  await salvarPDF(doc, `status-${slug(o.nome)}-${hojeISO()}.pdf`);
};

/* ------------------------------------- 2. prestação de contas */
ACOES['pdf-prestacao'] = async () => {
  const o = App.obra();
  const doc = await novoPDF(o, 'Prestação de contas');
  if (!doc) return;
  const k = kpisObra(o);
  let y = 34;
  y = pdfKPIs(doc, y, [
    ['Saldo inicial', fmtMoney(k.saldoInicial, { dec: 0 }), ''],
    ['Entradas', fmtMoney(k.recebido, { dec: 0 }), 'CAIXA, cliente e aportes'],
    ['Saídas', fmtMoney(k.totalPago, { dec: 0 }), 'medições e compras'],
    ['Saldo final', fmtMoney(k.saldoCaixa, { dec: 0 }), '']
  ]);

  y = pdfTabela(doc, y, 'Entradas',
    ['Data', 'Origem', 'Descrição', 'Aprovado', 'Descontos', 'Recebido'],
    o.recebimentos.filter((r) => num(r.valorRecebido) > 0)
      .sort((a, b) => String(a.dataRecebimento).localeCompare(String(b.dataRecebimento)))
      .map((r) => [fmtData(r.dataRecebimento), r.origem, r.etapaPci || ('Medição ' + r.numeroMedicao),
        fmtMoney(r.valorAprovado), fmtMoney(r.descontos), fmtMoney(r.valorRecebido)]),
    {
      colunas: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
      rodape: ['', '', 'Total recebido', '', '', fmtMoney(k.recebido)]
    });

  y = pdfTabela(doc, y, 'Pagamentos de medições',
    ['Data', 'Contrato', 'Nº', 'Descrição', 'Medido', 'Pago'],
    o.medicoes.filter((m) => m.status !== 'Cancelado' && num(m.valorPago) > 0)
      .sort((a, b) => String(a.dataPagamento).localeCompare(String(b.dataPagamento)))
      .map((m) => [fmtData(m.dataPagamento), m.contratoBase, String(m.numero || ''), m.descricao,
        fmtMoney(m.valorMedido), fmtMoney(m.valorPago)]),
    {
      colunas: { 4: { halign: 'right' }, 5: { halign: 'right' } },
      rodape: ['', '', '', 'Total em medições', '', fmtMoney(k.pagoMedicoes)]
    });

  pdfTabela(doc, y, 'Compras, taxas e demais saídas',
    ['Data', 'Tipo', 'Descrição', 'Fornecedor', 'Doc.', 'Total'],
    o.lancamentos.slice().sort((a, b) => String(a.data).localeCompare(String(b.data)))
      .map((l) => [fmtData(l.data), l.tipo, l.descricao, l.fornecedor, l.documento, fmtMoney(lancamentoTotal(l))]),
    {
      colunas: { 5: { halign: 'right' } },
      rodape: ['', '', '', '', 'Total', fmtMoney(k.pagoLancamentos)]
    });

  pdfRodape(doc);
  await salvarPDF(doc, `prestacao-contas-${slug(o.nome)}-${hojeISO()}.pdf`);
};

/* --------------------------------- 3. memória de medição CAIXA */
ACOES['pdf-medicao'] = async () => {
  const o = App.obra();
  const doc = await novoPDF(o, 'Memória de medição');
  if (!doc) return;
  const k = kpisObra(o);
  const pesos = pesosCronograma(o);
  const aSolicitar = Math.max(0, k.progressoFisico * k.financiado - k.recebido);
  let y = 34;
  y = pdfKPIs(doc, y, [
    ['Avanço físico', fmtPct(k.progressoFisico, 1), 'ponderado pelas etapas'],
    ['Contrato CAIXA', o.fin.contratoCaixa || '—', fmtMoney(k.financiado, { dec: 0 })],
    ['Já recebido', fmtMoney(k.recebido, { dec: 0 }), fmtPct(k.financiado ? k.recebido / k.financiado : 0, 0)],
    ['A solicitar', fmtMoney(aSolicitar, { dec: 0 }), 'pelo avanço apurado']
  ]);

  y = pdfTabela(doc, y, 'Percentual executado por etapa',
    ['Etapa', 'Peso', 'Executado', 'Contribuição', 'Situação'],
    o.cronograma.map((e) => {
      const c = etapaCalc(e);
      const p = pesos.get(e.id) || 0;
      return [e.etapa, fmtPct(p, 1), fmtPct(c.progresso, 0), fmtPct(p * c.progresso, 1), c.situacao];
    }),
    {
      colunas: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
      rodape: ['Total', '100,0%', '', fmtPct(k.progressoFisico, 1), '']
    });

  doc.setFontSize(9);
  doc.text('Declaro que a obra apresenta o percentual de execução acima na data indicada, apurado pelo', 14, y);
  doc.text('cronograma físico e pelas medições dos prestadores registradas no controle da obra.', 14, y + 4.5);
  y += 22;
  doc.setDrawColor(120, 120, 118);
  doc.line(20, y, 90, y); doc.line(115, y, 190, y);
  doc.setFontSize(8); doc.setTextColor(...CINZA);
  doc.text(Store.estado.empresa.responsavel || 'Responsável técnico', 20, y + 4.5);
  doc.text(Store.estado.empresa.creaCau ? 'CREA/CAU ' + Store.estado.empresa.creaCau : 'CREA/CAU', 20, y + 9);
  doc.text(nomeCliente(o.clienteId) || 'Cliente', 115, y + 4.5);

  pdfRodape(doc);
  await salvarPDF(doc, `medicao-${slug(o.nome)}-${hojeISO()}.pdf`);
};

/* ==================================================== DADOS DE EXEMPLO */
ACOES.exemplo = () => {
  confirmar('Carregar dados de exemplo',
    'Cria uma obra completa de demonstração (contratos, medições, recebimentos, compras, cronograma e diário) para você conhecer o sistema. Suas obras atuais são mantidas.',
    () => {
      mutar((e) => {
        const cli = novoCliente();
        Object.assign(cli, { nome: 'Maria de Souza', telefone: '(62) 99999-0000', situacao: 'Cliente', origem: 'Indicação' });
        e.clientes.push(cli);
        const p1 = novoPrestador();
        Object.assign(p1, { nome: 'Marcos Empreitada', especialidade: 'Empreiteiro geral', telefone: '(62) 98888-1111', avaliacao: 4 });
        const p2 = novoPrestador();
        Object.assign(p2, { nome: 'Pintura Silva', especialidade: 'Pintura', telefone: '(62) 97777-2222', avaliacao: 5 });
        e.prestadores.push(p1, p2);

        const o = novaObra('Casa 12 — Residencial Aurora');
        Object.assign(o, {
          clienteId: cli.id, cidade: 'Goiânia/GO', endereco: 'Rua das Acácias, Qd 8 Lt 12',
          areaConstruida: 62.5, areaMuro: 28, sistema: 'Alvenaria convencional', padrao: 'MCMV',
          dataInicio: addDias(hojeISO(), -179), previsaoConclusao: addDias(hojeISO(), 33),
          responsavel: 'Júlio César Gomes de Andrade', status: 'Em andamento'
        });
        Object.assign(o.fin, {
          saldoInicial: 5000, valorTerreno: 45000, valorFinanciado: 180000, recursosProprios: 20000,
          precoEmpreitadaM2: 700, custoFisicoMaxM2: 1200, valorVenda: 260000, margemDesejada: 0.15,
          contratoCaixa: '8.1234.5678901-2', dataAssinatura: addDias(hojeISO(), -190)
        });
        const d = (n) => addDias(hojeISO(), n);

        const ct = novoContrato();
        Object.assign(ct, {
          codigo: 'CT-001', codigoBase: 'CT-001', registro: 'Contrato', prestador: 'Marcos Empreitada',
          escopo: 'Empreitada principal', regime: 'R$/m²', quantidade: 62.5, unidade: 'm²',
          precoUnitario: 700, incluiMaterial: 'Sim', inicioPrevisto: d(-179), fimPrevisto: d(2), status: 'Em andamento'
        });
        const ad = novoContrato();
        Object.assign(ad, {
          codigo: 'CT-001-A1', codigoBase: 'CT-001', registro: 'Aditivo', prestador: 'Marcos Empreitada',
          escopo: 'Muro frontal e calçada', regime: 'Preço fechado', valorInformado: 6500,
          inicioPrevisto: d(-58), fimPrevisto: d(-39), status: 'Em andamento'
        });
        const ct2 = novoContrato();
        Object.assign(ct2, {
          codigo: 'CT-002', codigoBase: 'CT-002', registro: 'Contrato', prestador: 'Pintura Silva',
          escopo: 'Pintura geral', regime: 'Preço fechado', valorInformado: 4200,
          inicioPrevisto: d(-8), fimPrevisto: d(17), status: 'Planejado'
        });
        o.contratos.push(ct, ad, ct2);

        [[1, -161, 'Fundação e baldrame', 0.20, 12000, 500, -159, 11500, 'Pago'],
         [2, -125, 'Alvenaria e estrutura', 0.45, 15000, 0, -122, 15000, 'Pago'],
         [3, -90, 'Cobertura e reboco', 0.70, 20000, 0, -87, 20000, 'Pago'],
         [4, -20, 'Acabamento inicial', 0.85, 8000, 0, 0, 0, 'Em aberto']
        ].forEach(([n, dd, desc, pr, med, desc2, dp, pago, st]) => {
          const m = novaMedicao();
          Object.assign(m, {
            contratoBase: 'CT-001', numero: n, data: d(dd), descricao: desc, progresso: pr,
            valorMedido: med, desconto: desc2, dataPagamento: dp ? d(dp) : '', valorPago: pago,
            status: st, documento: 'REC-' + String(n).padStart(2, '0')
          });
          o.medicoes.push(m);
        });

        [['CAIXA', 1, 'Fundação', -166, 30000, -165, 0.20, 30000, 250, -161, 29750, 'Recebido'],
         ['CAIXA', 2, 'Alvenaria e cobertura', -136, 40000, -135, 0.45, 38000, 300, -129, 37700, 'Recebido'],
         ['CAIXA', 3, 'Reboco e instalações', -105, 45000, -104, 0.70, 45000, 320, -98, 44680, 'Recebido'],
         ['CAIXA', 4, 'Acabamento', -14, 40000, -13, 0.85, 0, 0, 0, 0, 'Solicitado'],
         ['Cliente', '', 'Aporte para muro', -30, 6500, 0, 0, 0, 0, -28, 6500, 'Recebido']
        ].forEach(([or, n, et, dp, vp, ds, po, va, de, dr, vr, st]) => {
          const r = novoRecebimento();
          Object.assign(r, {
            origem: or, numeroMedicao: n, etapaPci: et, dataPrevista: d(dp), valorPrevisto: vp,
            dataSolicitacao: ds ? d(ds) : '', percentObra: po, valorAprovado: va, descontos: de,
            dataRecebimento: dr ? d(dr) : '', valorRecebido: vr, status: st
          });
          o.recebimentos.push(r);
        });

        [[-176, 'Material', 'Fundação', 'Cimento', 'Cimento CP II 50kg', 'Depósito Central', 'NF 1201', 40, 'saco', 38, 20, 150],
         [-175, 'Material', 'Fundação', 'Aço', 'Aço CA-50 8mm', 'Ferro & Cia', 'NF 88', 30, 'barra', 42, 0, 0],
         [-140, 'Material', 'Fechamento/alvenaria', 'Bloco', 'Bloco cerâmico 9x19x39', 'Cerâmica Boa Vista', 'NF 455', 3, 'milheiro', 950, 0, 300],
         [-118, 'Taxa/imposto', 'Serviços preliminares', 'Taxas', 'ART de execução', 'CREA-GO', 'GRU 77', 1, 'serviço', 250, 0, 0],
         [-74, 'Material', 'Fundação', 'Cimento', 'Cimento CP II 50kg', 'Depósito Central', 'NF 1399', 20, 'saco', 39, 0, 0],
         [-51, 'Fornecimento + instalação', 'Calhas e rufos', 'Calhas', 'Calhas e rufos galvanizados', 'Metal Sul', 'NF 12', 1, 'serviço', 2800, 100, 0],
         [-30, 'Material', 'Pisos e revestimentos', 'Piso', 'Porcelanato 60x60', 'Casa do Piso', 'NF 903', 70, 'm²', 46, 0, 180],
         [-12, 'Honorário técnico/gestão', 'Extras', 'Gestão', 'Acompanhamento técnico mensal', 'Souz Engenharia', '', 1, 'mês', 900, 0, 0]
        ].forEach(([dd, tipo, etapa, cat, desc, forn, doc2, q, un, pu, des, fr]) => {
          const l = novoLancamento();
          Object.assign(l, {
            data: d(dd), tipo, etapa, categoria: cat, descricao: desc, fornecedor: forn,
            documento: doc2, quantidade: q, unidade: un, precoUnitario: pu, desconto: des, frete: fr
          });
          o.lancamentos.push(l);
        });

        [['Fundação', 'Cimento CP II 50kg', 80, 'saco', -178, 'Alta', 38, 'Comprado parcial'],
         ['Fechamento/alvenaria', 'Bloco cerâmico 9x19x39', 5, 'milheiro', -143, 'Alta', 950, 'Comprado parcial'],
         ['Pisos e revestimentos', 'Porcelanato 60x60', 75, 'm²', -35, 'Alta', 46, 'Comprado parcial'],
         ['Pintura', 'Tinta acrílica 18L', 12, 'lata', 18, 'Média', 210, 'Planejar'],
         ['Louças e metais', 'Kit louças e metais', 1, 'un', 25, 'Média', 1800, 'Planejar']
        ].forEach(([etapa, mat, q, un, dd, pr, pp, st]) => {
          const m = novoMaterial();
          Object.assign(m, {
            etapa, material: mat, quantidadeNecessaria: q, unidade: un, dataNecessaria: d(dd),
            prioridade: pr, precoPrevisto: pp, status: st
          });
          o.materiais.push(m);
        });

        [['Serviços preliminares', -179, -171, -179, -169, 1, 62.5],
         ['Fundação', -170, -145, -168, -143, 1, 62.5],
         ['Estrutura', -144, -115, -142, -110, 1, 62.5],
         ['Fechamento/alvenaria', -114, -79, -109, -71, 1, 180],
         ['Cobertura', -78, -54, -70, -50, 1, 70],
         ['Reboco e requadros', -53, -23, -49, -18, 1, 120],
         ['Instalações hidrossanitárias', -50, -30, -48, -25, 1, 62.5],
         ['Eletrodutos e caixas', -50, -30, -48, -24, 1, 62.5],
         ['Pisos e revestimentos', -22, 3, -17, 0, 0.6, 45],
         ['Forro/gesso', -10, 8, -6, 0, 0.4, 30],
         ['Instalação elétrica final', 0, 14, 0, 0, 0, 0],
         ['Pintura', 5, 24, 0, 0, 0, 0],
         ['Louças e metais', 18, 28, 0, 0, 0, 0],
         ['Calçada', 20, 30, 0, 0, 0, 0],
         ['Muro', -58, -39, -55, -36, 1, 28]
        ].forEach(([etapa, ip, fp, ir, fr, pg, qtd]) => {
          const e2 = novaEtapaCronograma(etapa);
          Object.assign(e2, {
            inicioPrevisto: d(ip), fimPrevisto: d(fp),
            inicioReal: ir ? d(ir) : '', fimReal: fr ? d(fr) : '',
            progresso: pg, quantidadeExecutada: qtd, unidadeProducao: 'm²'
          });
          o.cronograma.push(e2);
        });

        [[-7, 'Bom', 5, 'Pisos e revestimentos', 'Assentamento de porcelanato nas áreas sociais e quartos.', 'Falta rejunte — material chega quinta.'],
         [-2, 'Chuva fraca', 3, 'Forro/gesso', 'Montagem do forro de gesso na sala e circulação.', 'Chuva atrasou o início em duas horas.']
        ].forEach(([dd, clima, ef, etapa, at, oc]) => {
          const r = novoDiario();
          Object.assign(r, { data: d(dd), clima, efetivo: ef, etapa, atividades: at, ocorrencias: oc, autor: 'Júlio César' });
          o.diario.push(r);
        });

        e.obras.push(o);
        App.rota.obraId = o.id;
      });
      App.ir('painel', Store.estado.obras[Store.estado.obras.length - 1].id);
      toast('Obra de exemplo criada.', 'ok');
    }, 'Carregar');
};

export {
  carregarScript,
  carregarPDF,
  carregarXLSX,
  baixar,
  paraCSV,
  csvNum,
  planilhaParaObra,
  CINZA,
  novoPDF,
  pdfKPIs,
  pdfTabela,
  pdfRodape,
  salvarPDF
};
