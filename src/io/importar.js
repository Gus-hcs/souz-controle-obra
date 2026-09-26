/**
 * importar.js — Importação de planilha por modelo: obras, lançamentos,
 * prestadores e cronograma (a planilha MCMV continua em io/index.js).
 *
 * O fluxo é sempre o mesmo: baixar a planilha-modelo, preencher, escolher
 * o arquivo (.xlsx ou .csv), ver a prévia — cada linha com o que está
 * errado — e só então confirmar. Linha com erro não entra; o resto entra.
 *
 * A primeira metade deste arquivo não toca a tela (prepararImportacao,
 * lerValor): lê as linhas já extraídas da planilha, converte e valida com
 * as mesmas regras dos formulários (dominio/validacao.js). É o que os
 * testes conferem.
 */
import {
  esc,
  norm,
  normalizarPadrao,
  novaEtapaCronograma,
  novaObra,
  novoCliente,
  novoLancamento,
  novoPrestador,
  num,
} from '../nucleo/base.js';
import { normalizarTelefoneBR } from '../nucleo/contato.js';
import {
  apenasErros,
  validarEtapa,
  validarLancamento,
  validarObra,
  validarPrestador,
} from '../dominio/validacao.js';

/* ---------------------------------------------------------------- modelos
   colunas: [chave, cabeçalho, tipo, obrigatória]. A chave com "fin." vai
   para obra.fin. destino: 'conta' (cadastro) ou 'obra' (a obra aberta). */
const MODELOS = {
  obras: {
    rotulo: 'Obras',
    destino: 'conta',
    colunas: [
      ['nome', 'Nome da obra', 'texto', true],
      ['cliente', 'Cliente', 'texto'],
      ['cidade', 'Cidade/UF', 'texto'],
      ['endereco', 'Endereço', 'texto'],
      ['areaConstruida', 'Área construída (m²)', 'numero'],
      ['padrao', 'Padrão de acabamento', 'texto'],
      ['dataInicio', 'Data de início', 'data'],
      ['previsaoConclusao', 'Data de entrega', 'data'],
      ['fin.valorVenda', 'Valor de venda', 'numero'],
      ['fin.valorFinanciado', 'Valor financiado', 'numero'],
      ['fin.financiador', 'Financiador', 'texto'],
    ],
    exemplo: [
      'Casa 21 — Residencial Aurora',
      'Maria de Souza',
      'Goiânia/GO',
      'Rua das Acácias, Qd 8 Lt 21',
      62.5,
      'Econômico',
      '01/10/2026',
      '30/03/2027',
      230000,
      180000,
      'CAIXA',
    ],
  },
  lancamentos: {
    rotulo: 'Lançamentos',
    destino: 'obra',
    colunas: [
      ['data', 'Data', 'data', true],
      ['descricao', 'Descrição', 'texto', true],
      ['tipo', 'Tipo', 'texto'],
      ['etapa', 'Etapa', 'texto'],
      ['fornecedor', 'Fornecedor', 'texto'],
      ['documento', 'Documento', 'texto'],
      ['quantidade', 'Quantidade', 'numero'],
      ['unidade', 'Unidade', 'texto'],
      ['precoUnitario', 'Preço unitário', 'numero', true],
      ['frete', 'Frete', 'numero'],
      ['desconto', 'Desconto', 'numero'],
    ],
    exemplo: [
      '15/09/2026',
      'Cimento CP II 50 kg',
      'Material',
      'Fundação',
      'Depósito Central',
      'NF 1201',
      40,
      'saco',
      38,
      150,
      0,
    ],
  },
  prestadores: {
    rotulo: 'Prestadores',
    destino: 'conta',
    colunas: [
      ['nome', 'Nome', 'texto', true],
      ['tipo', 'Tipo (serviço ou fornecedor)', 'texto'],
      ['especialidade', 'Especialidade', 'texto'],
      ['telefone', 'Telefone', 'texto'],
      ['whatsapp', 'WhatsApp', 'texto'],
      ['documento', 'CPF/CNPJ', 'texto'],
      ['cidade', 'Cidade', 'texto'],
    ],
    exemplo: [
      'Antônio Ribeiro',
      'serviço',
      'Pedreiro',
      '(62) 98888-1111',
      '(62) 98888-1111',
      '',
      'Goiânia',
    ],
  },
  cronograma: {
    rotulo: 'Cronograma',
    destino: 'obra',
    colunas: [
      ['etapa', 'Etapa', 'texto', true],
      ['inicioPrevisto', 'Início previsto', 'data'],
      ['fimPrevisto', 'Fim previsto', 'data'],
      ['responsavel', 'Responsável', 'texto'],
      ['peso', 'Peso', 'numero'],
      ['progresso', 'Progresso (%)', 'pct'],
    ],
    exemplo: ['Fundação', '01/10/2026', '25/10/2026', 'Antônio Ribeiro', 12, 0],
  },
};

/* cabeçalho comparado sem acento, caixa nem pontuação */
const chaveCab = (s) =>
  norm(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');

/* Converte uma célula: data (Date, dd/mm/aaaa, AAAA-MM-DD ou número de
   série do Excel), número (aceita 1.234,56) e porcentagem (30 ou 0,3). */
function lerValor(v, tipo) {
  if (v === null || v === undefined) return tipo === 'texto' ? '' : tipo === 'data' ? '' : 0;
  if (tipo === 'data') {
    if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
    const s = String(v).trim();
    if (!s) return '';
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (br) {
      const iso = `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`;
      /* 31/13 ou 30/02 não existem: a data tem de voltar igual do Date */
      const d = new Date(`${iso}T12:00:00Z`);
      return !isNaN(d) && d.toISOString().slice(0, 10) === iso ? iso : 'inválida';
    }
    const serial = Number(s);
    if (isFinite(serial) && serial > 20000 && serial < 90000) {
      return new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString().slice(0, 10);
    }
    return 'inválida';
  }
  if (tipo === 'numero') return typeof v === 'number' ? v : num(v);
  if (tipo === 'pct') {
    const n = typeof v === 'number' ? v : num(String(v).replace('%', ''));
    return n > 1 ? n / 100 : n;
  }
  return String(v).trim();
}

/* Da planilha lida (linhas como objeto cabeçalho → valor) aos registros
   prontos, cada um com os erros dele. estado: para achar cliente e
   validar prestador com as listas. */
function prepararImportacao(modelo, linhasPlanilha, estado) {
  const m = MODELOS[modelo];
  if (!m) throw new Error('Modelo de importação desconhecido.');
  const cabs = linhasPlanilha.length ? Object.keys(linhasPlanilha[0]) : [];
  const achado = new Map(cabs.map((c) => [chaveCab(c), c]));
  const colunaDe = (cab) => achado.get(chaveCab(cab));
  const faltando = m.colunas
    .filter(([, cab, , obrig]) => obrig && !colunaDe(cab))
    .map(([, cab]) => cab);

  const linhas = linhasPlanilha
    .map((bruta, i) => {
      const d = {};
      m.colunas.forEach(([k, cab, tipo]) => {
        const col = colunaDe(cab);
        d[k] = lerValor(col === undefined ? '' : bruta[col], tipo);
      });
      return { n: i + 2, dados: d };
    })
    /* linha toda em branco é o fim da planilha, não um erro */
    .filter((x) => Object.values(x.dados).some((v) => v !== '' && v !== 0));

  return {
    modelo,
    faltando,
    linhas: linhas.map(({ n, dados }) => {
      const erros = [];
      m.colunas.forEach(([k, cab, tipo, obrig]) => {
        if (
          obrig &&
          (dados[k] === '' || (tipo === 'numero' && !(num(dados[k]) > 0) && k === 'precoUnitario'))
        ) {
          erros.push(`${cab} vazio`);
        }
        if (tipo === 'data' && dados[k] === 'inválida') {
          erros.push(`${cab}: data inválida (use dd/mm/aaaa)`);
          dados[k] = '';
        }
      });
      const registro = montarRegistro(modelo, dados, estado);
      const probs = apenasErros(validarRegistro(modelo, registro, estado));
      probs.forEach((p) => erros.push(p.mensagem));
      return { n, dados, registro, erros };
    }),
  };
}

function montarRegistro(modelo, d, estado) {
  if (modelo === 'obras') {
    const o = novaObra(d.nome || 'Obra');
    Object.keys(d).forEach((k) => {
      if (k.startsWith('fin.')) o.fin[k.slice(4)] = d[k];
      else if (k !== 'cliente') o[k] = d[k];
    });
    o.padrao = normalizarPadrao(d.padrao);
    const cli = d.cliente
      ? (estado.clientes || []).find((c) => norm(c.nome) === norm(d.cliente))
      : null;
    o.clienteId = cli ? cli.id : '';
    o.__clienteNovo = !cli && d.cliente ? d.cliente : '';
    return o;
  }
  if (modelo === 'lancamentos') {
    const l = Object.assign(novoLancamento(), d);
    if (!num(l.quantidade)) l.quantidade = 1;
    if (!l.tipo) l.tipo = 'Material';
    if (!l.unidade) l.unidade = 'un';
    return l;
  }
  if (modelo === 'prestadores') {
    const p = Object.assign(novoPrestador(), d);
    p.tipo = /fornec/i.test(d.tipo || '') ? 'fornecedor' : 'servico';
    p.telefone = normalizarTelefoneBR(d.telefone) || '';
    p.whatsapp = normalizarTelefoneBR(d.whatsapp || d.telefone) || '';
    return p;
  }
  const e = Object.assign(novaEtapaCronograma(d.etapa), d);
  return e;
}

function validarRegistro(modelo, r, estado) {
  if (modelo === 'obras') return validarObra(r);
  if (modelo === 'lancamentos') return validarLancamento(r);
  if (modelo === 'prestadores') return validarPrestador(r, estado.listas);
  return validarEtapa(r);
}

/* ============================================================== tela
   As dependências de tela chegam na chamada (telas/ajustes.js registra as
   ações): io/index.js é carregado cedo, pelo supabase.js, e este módulo
   não pode ler Store/App/ACOES enquanto o grafo de módulos ainda monta. */
let Store;
let mutar;
let App;
let abrirModal;
let fecharModal;
let toast;
let baixar;
let carregarXLSX;
const usar = (dep) => {
  ({ Store, mutar, App, abrirModal, fecharModal, toast, baixar, carregarXLSX } = dep);
};

async function baixarModelo(modelo, dep) {
  usar(dep);
  const m = MODELOS[modelo];
  const ok = await carregarXLSX();
  if (!ok) return toast('Não foi possível carregar o gerador de planilhas.', 'critico');
  const planilha = XLSX.utils.aoa_to_sheet([m.colunas.map((c) => c[1]), m.exemplo]);
  planilha['!cols'] = m.colunas.map((c) => ({ wch: Math.max(14, c[1].length + 2) }));
  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, planilha, m.rotulo);
  await baixar(`modelo-${modelo}.xlsx`, XLSX.write(livro, { bookType: 'xlsx', type: 'array' }));
}

let pendente = null;

async function escolherArquivo(modelo, dep) {
  usar(dep);
  const m = MODELOS[modelo];
  if (m.destino === 'obra' && !App.obra())
    return toast('Abra a obra que vai receber os dados primeiro.', 'aviso');
  const ok = await carregarXLSX();
  if (!ok) return toast('Não foi possível carregar o leitor de planilhas.', 'critico');
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = '.xlsx,.xls,.csv';
  inp.onchange = async () => {
    const f = inp.files && inp.files[0];
    if (!f) return;
    try {
      const livro = XLSX.read(await f.arrayBuffer(), { cellDates: true });
      const aba = livro.Sheets[livro.SheetNames[0]];
      const linhas = XLSX.utils.sheet_to_json(aba, { defval: '', raw: true });
      pendente = prepararImportacao(modelo, linhas, Store.estado);
      pendente.arquivo = f.name;
      pendente.obraId = m.destino === 'obra' ? App.obra().id : '';
      mostrarPrevia();
    } catch (e) {
      toast(`Não foi possível ler ${f.name}: ${e.message}`, 'critico', 6000);
    }
  };
  inp.click();
}

function mostrarPrevia() {
  const p = pendente;
  const m = MODELOS[p.modelo];
  const boas = p.linhas.filter((l) => !l.erros.length);
  const cols = m.colunas.slice(0, 3);
  const corpo = p.faltando.length
    ? `<p class="aviso-linha">A planilha não tem ${p.faltando.length === 1 ? 'a coluna' : 'as colunas'} ${p.faltando
        .map((c) => `<b>${esc(c)}</b>`)
        .join(', ')}. Use a planilha-modelo.</p>`
    : `<p style="margin:0 0 var(--e3)">${boas.length} linha${boas.length === 1 ? '' : 's'} pronta${boas.length === 1 ? '' : 's'}${
        p.linhas.length - boas.length
          ? ` · <span class="atraso">${p.linhas.length - boas.length} com erro (não entram)</span>`
          : ''
      }${m.destino === 'obra' ? ` · vão para a obra aberta` : ''}.</p>
      <div class="tab-rolagem" style="max-height:55vh"><table class="tab" style="width:100%">
        <thead><tr><th>Linha</th>${cols.map((c) => `<th>${esc(c[1])}</th>`).join('')}<th>Situação</th></tr></thead>
        <tbody>${p.linhas
          .slice(0, 200)
          .map(
            (l) =>
              `<tr><td class="tinta2">${l.n}</td>${cols
                .map((c) => `<td>${esc(String(l.dados[c[0]] ?? ''))}</td>`)
                .join(
                  '',
                )}<td>${l.erros.length ? `<span class="atraso">${esc(l.erros.join('; '))}</span>` : '<span class="tinta2">ok</span>'}</td></tr>`,
          )
          .join('')}</tbody></table></div>`;
  abrirModal({
    titulo: `Importar ${m.rotulo.toLowerCase()} — ${p.arquivo}`,
    largura: 'largo',
    corpo,
    rodape: `<button class="btn" data-acao="fechar-modal">Cancelar</button>
      <button class="btn primario" data-acao="importar-confirmar" ${boas.length && !p.faltando.length ? '' : 'disabled'}>Importar ${boas.length}</button>`,
  });
}

function confirmarImportacao(dep) {
  usar(dep);
  const p = pendente;
  if (!p) return;
  const boas = p.linhas.filter((l) => !l.erros.length).map((l) => l.registro);
  mutar((e) => {
    if (p.modelo === 'obras') {
      boas.forEach((o) => {
        if (o.__clienteNovo) {
          const cli = Object.assign(novoCliente(), { nome: o.__clienteNovo });
          e.clientes.push(cli);
          o.clienteId = cli.id;
        }
        delete o.__clienteNovo;
        e.obras.push(o);
      });
    } else if (p.modelo === 'prestadores') {
      e.prestadores.push(...boas);
    } else {
      const o = e.obras.find((x) => x.id === p.obraId);
      if (!o) return;
      if (p.modelo === 'lancamentos') o.lancamentos.push(...boas);
      else o.cronograma.push(...boas);
    }
  });
  fecharModal();
  toast(
    `${boas.length} ${MODELOS[p.modelo].rotulo.toLowerCase()} importado${boas.length === 1 ? '' : 's'}.`,
    'ok',
  );
  pendente = null;
}

export {
  MODELOS,
  baixarModelo,
  confirmarImportacao,
  escolherArquivo,
  lerValor,
  prepararImportacao,
};
