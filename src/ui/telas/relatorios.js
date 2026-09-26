/**
 * telas/relatorios.js — Relatórios: escolher, ajustar, ver e gerar.
 *
 * À esquerda, a lista dos relatórios (um selecionado por vez) com as
 * opções dele — período, fotos do diário, valores e uma observação livre
 * para o cliente — e o histórico do que já foi gerado. À direita, a prévia
 * numa folha A4 que muda com o relatório e as opções: é o mesmo conteúdo
 * do PDF (io/gerarRelatorio), resumido. Abaixo de 1200px, lista em cima e
 * prévia embaixo.
 *
 * O responsável técnico é o da obra (Configuração); só falta o da empresa
 * quando a obra não tem (rtDoRelatorio). O aviso aparece só quando nenhum
 * dos dois existe.
 */
import {
  esc,
  fmtData,
  fmtDataCurta,
  fmtMoney,
  fmtPct,
  fonteImagem,
  hojeISO,
  addDias,
  inicioDoMes,
  competencia,
  novoRelatorioGerado,
  num,
} from '../../nucleo/base.js';
import {
  andamentoParcela,
  etapaCalc,
  fotosDaSemana,
  fotosDoPeriodo,
  kpisObra,
  memoriaMedicao,
  pendenciasDoCliente,
  pendenciasObra,
  prestacaoContas,
  rtDoRelatorio,
  valorAgregadoObra,
  lancamentoTotal,
} from '../../dominio/calculos.js';
import { apenasErros, validarRelatorioGerado } from '../../dominio/validacao.js';
import { Store, mutar } from '../../dados/store.js';
import { SUPA } from '../../dados/supabase.js';
import {
  compartilharPdfWhatsApp,
  enviarPdfEmail,
  gerarRelatorio,
  imprimirPdf,
  marcarStatusEnviado,
  salvarPDF,
} from '../../io/index.js';
import { ACOES } from '../acoes.js';
import { enviarArquivo, urlAnexo } from '../anexos.js';
import { App, ICO, ehClienteDaObra, nomeCliente, svg, toast } from '../shell.js';
import { VIEWS } from '../telas-obra.js';
import { abrirMenu } from './componentes.js';

/* ------------------------------------------------------------ catálogo */
const RELATORIOS = [
  {
    tipo: 'status',
    titulo: 'Relatório de status',
    para: 'para o cliente',
    texto:
      'Avanço, data de entrega, etapas, parcelas e o que aguarda a decisão dele. Sem caixa, custo nem margem.',
    opcoes: ['periodo', 'fotos', 'valores', 'observacao'],
  },
  {
    tipo: 'interno',
    titulo: 'Relatório interno',
    para: 'da construtora',
    texto: 'Caixa, custo, contratos com valores e pendências. Não enviar ao cliente.',
    opcoes: ['periodo', 'fotos', 'observacao'],
  },
  {
    tipo: 'prestacao',
    titulo: 'Prestação de contas',
    para: 'entradas e saídas',
    texto:
      'Tudo o que entrou e saiu no período, medição a medição e nota a nota, com saldo anterior e final.',
    opcoes: ['periodo', 'observacao'],
  },
  {
    tipo: 'medicao',
    titulo: 'Memória de medição',
    para: 'para o financiador',
    texto:
      'Percentual executado por item e o valor a solicitar, no formato que o financiador espera.',
    opcoes: ['observacao'],
  },
];
const TITULO = Object.fromEntries(RELATORIOS.map((r) => [r.tipo, r.titulo]));

/* Estado só de tela: o relatório escolhido e as opções de cada um. */
const Rel = { tipo: 'status', op: {} };
const opcoesDe = (tipo) => {
  if (!Rel.op[tipo]) {
    Rel.op[tipo] = { de: '', ate: '', fotos: tipo !== 'interno', valores: false, observacao: '' };
  }
  return Rel.op[tipo];
};

/* ------------------------------------------------------ prévia (folha) */
const MAX_LINHAS = 8;
const mais = (n) =>
  n > MAX_LINHAS ? `<p class="folha-mais">+ ${n - MAX_LINHAS} no documento completo</p>` : '';
const situacao = (s) => {
  const t = s ? s.charAt(0) + s.slice(1).toLowerCase() : '—';
  const tom = /ATRASADO/.test(s)
    ? 'atraso'
    : /CONCLU/.test(s)
      ? 'feito'
      : /ANDAMENTO/.test(s)
        ? 'andamento'
        : '';
  return `<span class="folha-sit ${tom}"><i></i>${esc(t)}</span>`;
};
const tabela = (titulo, cab, linhas, alinhaDir = []) =>
  linhas.length
    ? `<h3>${esc(titulo)}</h3><table class="folha-tab"><thead><tr>${cab
        .map((c, i) => `<th${alinhaDir.includes(i) ? ' class="num"' : ''}>${esc(c)}</th>`)
        .join('')}</tr></thead><tbody>${linhas
        .slice(0, MAX_LINHAS)
        .map(
          (l) =>
            `<tr>${l.map((c, i) => `<td${alinhaDir.includes(i) ? ' class="num"' : ''}>${c}</td>`).join('')}</tr>`,
        )
        .join('')}</tbody></table>${mais(linhas.length)}`
    : '';
const numeros = (itens) =>
  `<div class="folha-kpis">${itens
    .map(
      ([r, v, c]) =>
        `<div><span>${esc(r)}</span><b>${esc(v)}</b>${c ? `<small>${esc(c)}</small>` : ''}</div>`,
    )
    .join('')}</div>`;
const observacao = (t) =>
  String(t || '').trim()
    ? `<div class="folha-obs"><span>Observação</span><p>${esc(t).replace(/\n/g, '<br>')}</p></div>`
    : '';
const fotos = (lista) =>
  lista.length
    ? `<h3>Fotos do diário</h3><div class="folha-fotos">${lista
        .slice(0, 6)
        .map(
          (f) =>
            `<figure><img src="${fonteImagem(f.dados)}" alt=""><figcaption>${esc(fmtDataCurta(f.data))}${f.etapa ? ` · ${esc(f.etapa)}` : ''}</figcaption></figure>`,
        )
        .join(
          '',
        )}</div>${lista.length > 6 ? `<p class="folha-mais">+ ${lista.length - 6} fotos no documento</p>` : ''}`
    : '';
const assinatura = (o, comCliente = false) => {
  const rt = rtDoRelatorio(o, Store.estado.empresa);
  return `<div class="folha-assina">
    <div><i></i><b>${esc(rt.nome || 'Responsável técnico')}</b><span>${rt.registro ? `CREA/CAU ${esc(rt.registro)}` : 'CREA/CAU'}</span></div>
    ${comCliente ? `<div><i></i><b>${esc(nomeCliente(o.clienteId) || 'Cliente')}</b></div>` : ''}
  </div>`;
};
const textoPeriodo = (op) =>
  op.de || op.ate
    ? `${op.de ? fmtDataCurta(op.de) : 'início'} a ${op.ate ? fmtDataCurta(op.ate) : 'hoje'}`
    : '';

function previa(o, tipo, op) {
  const k = kpisObra(o);
  const emp = Store.estado.empresa;
  const cliente = Store.estado.clientes.find((c) => c.id === o.clienteId);
  const logos = [emp.logo, cliente && cliente.logo]
    .map((l) => (l && fonteImagem(l) ? `<img src="${fonteImagem(l)}" alt="">` : ''))
    .join('');
  const per = textoPeriodo(op);
  const cab = `<header class="folha-cab">
      ${logos ? `<div class="folha-logos">${logos}</div>` : ''}
      <div class="folha-tit">
        <div><h2>${esc(o.nome)}</h2><span>${esc([nomeCliente(o.clienteId), o.cidade, o.endereco].filter(Boolean).join(' · '))}</span></div>
        <div class="dir"><b>${esc(emp.nome || 'Souz Controle de Obra')}</b><span>${esc(TITULO[tipo])}${per ? ` · ${esc(per)}` : ''} · ${esc(fmtData(hojeISO()))}</span></div>
      </div>
    </header>`;
  const liberado = k.liberadoFinanciamento === null ? '—' : fmtPct(k.liberadoFinanciamento, 0);
  let corpo = '';

  if (tipo === 'status' || tipo === 'interno') {
    const interno = tipo === 'interno';
    const va = valorAgregadoObra(o);
    corpo += numeros(
      interno
        ? [
            [
              'Avanço físico',
              fmtPct(k.progressoFisico, 0),
              `${k.etapasConcluidas}/${k.etapasTotal} etapas`,
            ],
            ['Financiamento liberado', liberado, `de ${fmtMoney(k.financiado, { dec: 0 })}`],
            ['Pago', fmtMoney(k.totalPago, { dec: 0 }), ''],
            [
              'Caixa hoje',
              fmtMoney(k.saldoCaixa, { dec: 0 }),
              `previsto ${fmtMoney(k.custoPrevisto, { dec: 0 })}`,
            ],
          ]
        : [
            [
              'Obra concluída',
              fmtPct(k.progressoFisico, 0),
              `${k.etapasConcluidas} de ${k.etapasTotal} etapas`,
            ],
            ['Data contratual', fmtData(o.previsaoConclusao), ''],
            ['Entrega projetada', va.termino ? fmtData(va.termino) : '—', 'no ritmo atual'],
            ['Financiamento liberado', liberado, ''],
          ],
    );
    corpo += observacao(op.observacao);
    corpo += tabela(
      'Cronograma e progresso',
      ['Etapa', 'Previsto', 'Progresso', 'Situação'],
      o.cronograma.map((e) => {
        const c = etapaCalc(e);
        return [
          esc(e.etapa),
          `${fmtDataCurta(e.inicioPrevisto)} → ${fmtDataCurta(e.fimPrevisto)}`,
          fmtPct(c.progresso, 0),
          situacao(c.situacao),
        ];
      }),
      [2],
    );
    const parcelas = o.recebimentos.filter((r) => r.status !== 'Cancelado');
    if (!interno) {
      corpo += tabela(
        'Parcelas',
        op.valores
          ? ['Origem', 'Etapa', 'Previsto p/', 'Valor', 'Situação']
          : ['Origem', 'Etapa', 'Previsto p/', 'Situação'],
        parcelas.map((r) => {
          const et = esc(r.etapaPci || (r.numeroMedicao ? `Medição ${r.numeroMedicao}` : ''));
          const sit = esc(andamentoParcela(r).texto);
          return op.valores
            ? [
                esc(r.origem),
                et,
                fmtDataCurta(r.dataPrevista),
                fmtMoney(num(r.valorPrevisto), { dec: 0 }),
                sit,
              ]
            : [esc(r.origem), et, fmtDataCurta(r.dataPrevista), sit];
        }),
        op.valores ? [3] : [],
      );
      corpo += tabela(
        'Aguardando sua decisão',
        ['O quê', 'Até'],
        pendenciasDoCliente(o).abertas.map((p) => [
          esc(p.descricao),
          p.prazo ? fmtData(p.prazo) : '—',
        ]),
      );
    } else {
      corpo += tabela(
        'Pendências',
        ['Nível', 'Situação', 'Ação'],
        pendenciasObra(o).itens.map((a) => [
          a.sev === 3 ? 'Crítico' : 'Atenção',
          esc(a.titulo),
          esc(a.acao),
        ]),
      );
    }
    if (op.fotos)
      corpo += fotos(
        per
          ? fotosDoPeriodo(o, op.de, op.ate, 12)
          : interno
            ? fotosDoPeriodo(o, '', '', 12)
            : fotosDaSemana(o),
      );
    corpo += assinatura(o);
  } else if (tipo === 'prestacao') {
    const pc = prestacaoContas(o, op.de, op.ate);
    corpo += numeros([
      [per ? 'Saldo anterior' : 'Saldo inicial', fmtMoney(pc.saldoAnterior, { dec: 0 }), ''],
      ['Entradas', fmtMoney(pc.totEntradas, { dec: 0 }), ''],
      ['Saídas', fmtMoney(pc.totSaidas, { dec: 0 }), 'medições e compras'],
      ['Saldo final', fmtMoney(pc.saldoFinal, { dec: 0 }), ''],
    ]);
    corpo += observacao(op.observacao);
    corpo += tabela(
      'Entradas',
      ['Data', 'Origem', 'Descrição', 'Recebido'],
      pc.entradas.map((r) => [
        fmtData(r.dataRecebimento),
        esc(r.origem),
        esc(r.etapaPci || `Medição ${r.numeroMedicao}`),
        fmtMoney(num(r.valorRecebido)),
      ]),
      [3],
    );
    corpo += tabela(
      'Pagamentos de medições',
      ['Data', 'Contrato', 'Descrição', 'Pago'],
      pc.medicoes.map((m) => [
        fmtData(m.dataPagamento || m.data),
        esc(m.contratoBase),
        esc(m.descricao),
        fmtMoney(num(m.valorPago)),
      ]),
      [3],
    );
    corpo += tabela(
      'Compras, taxas e demais saídas',
      ['Data', 'Tipo', 'Descrição', 'Total'],
      pc.lancamentos.map((l) => [
        fmtData(l.data),
        esc(l.tipo),
        esc(l.descricao),
        fmtMoney(lancamentoTotal(l)),
      ]),
      [3],
    );
    corpo += assinatura(o);
  } else {
    const mm = memoriaMedicao(o);
    corpo += numeros([
      [
        'Avanço físico',
        fmtPct(mm.fisico, 1),
        mm.porPlanilha ? 'pela planilha do financiador' : 'pelas etapas',
      ],
      [
        `Contrato ${mm.financiador}`,
        o.fin.contratoCaixa || '—',
        fmtMoney(mm.financiado, { dec: 0 }),
      ],
      ['Já liberado', fmtMoney(mm.liberado, { dec: 0 }), liberado],
      ['A solicitar', fmtMoney(mm.aSolicitar, { dec: 0 }), 'pelo avanço apurado'],
    ]);
    corpo += observacao(op.observacao);
    corpo += tabela(
      'Percentual executado por item',
      ['Serviço', 'Peso', 'Executado', 'Situação'],
      mm.linhas.map((l) => [
        esc(l.etapa),
        fmtPct(l.peso, 2),
        fmtPct(l.executado, 0),
        situacao(l.situacao),
      ]),
      [1, 2],
    );
    corpo +=
      '<p class="folha-decl">Declaro que a obra apresenta o percentual de execução acima na data indicada, apurado pelo cronograma físico e pelas medições registradas no controle da obra.</p>';
    corpo += assinatura(o, true);
  }
  return `<article class="folha" aria-label="Prévia: ${esc(TITULO[tipo])}">${cab}${corpo}
    <footer class="folha-rodape">${esc(emp.nome || 'Souz Controle de Obra')} · prévia — o PDF traz tudo</footer></article>`;
}

/* ------------------------------------------------------------ opções */
function opcoesHTML(rel, op) {
  const tem = (x) => rel.opcoes.includes(x);
  const hoje = hojeISO();
  const atalho = (rot, de, ate) => {
    const ligado = op.de === de && op.ate === ate;
    return `<button type="button" class="pilula${ligado ? ' ativa' : ''}" data-acao="rel-periodo" data-de="${de}" data-ate="${ate}" aria-pressed="${ligado}">${esc(rot)}</button>`;
  };
  return `<div class="rel-opcoes" data-tipo="${rel.tipo}">
    ${
      tem('periodo')
        ? `<fieldset class="rel-campo"><legend>Período</legend>
            <div class="rel-atalhos">
              ${atalho('Toda a obra', '', '')}
              ${atalho('Últimos 7 dias', addDias(hoje, -6), hoje)}
              ${atalho('Este mês', inicioDoMes(competencia(hoje)), hoje)}
            </div>
            <div class="rel-datas">
              <label>De <input type="date" data-rel-op="de" value="${esc(op.de)}"></label>
              <label>Até <input type="date" data-rel-op="ate" value="${esc(op.ate)}"></label>
            </div>
          </fieldset>`
        : ''
    }
    ${tem('fotos') ? `<label class="check-linha"><input type="checkbox" data-rel-op="fotos" ${op.fotos ? 'checked' : ''}> Incluir fotos do diário</label>` : ''}
    ${tem('valores') ? `<label class="check-linha"><input type="checkbox" data-rel-op="valores" ${op.valores ? 'checked' : ''}> Mostrar os valores das parcelas</label>` : ''}
    ${
      tem('observacao')
        ? `<div class="campo"><label for="rel-obs">Observação para o cliente</label>
            <textarea id="rel-obs" data-rel-op="observacao" rows="3" maxlength="600" placeholder="Sai num quadro logo abaixo dos números">${esc(op.observacao)}</textarea></div>`
        : ''
    }
  </div>`;
}

/* ------------------------------------------------------------ histórico */
function historicoHTML(o) {
  const lista = (o.relatoriosGerados || [])
    .slice()
    .sort((a, b) => String(b.geradoEm).localeCompare(String(a.geradoEm)))
    .slice(0, 8);
  if (!lista.length) return '<p class="linha-cinza">Nenhum relatório gerado ainda.</p>';
  return `<ul class="rel-hist">${lista
    .map((r) => {
      let quando = '';
      try {
        quando = new Date(r.geradoEm).toLocaleString('pt-BR', {
          dateStyle: 'short',
          timeStyle: 'short',
        });
      } catch (e) {
        quando = String(r.geradoEm || '');
      }
      return `<li>
        <span><b>${esc(TITULO[r.tipo] || r.tipo)}</b><small class="tinta2">${esc(quando)}${r.geradoPor ? ` · ${esc(r.geradoPor)}` : ''}</small></span>
        <button class="btn sutil pequeno" data-acao="rel-baixar-de-novo" data-id="${esc(r.id)}"
          title="${r.arquivo ? 'Baixar o PDF que foi gerado' : 'Gerar de novo com as mesmas opções (dados de hoje)'}">${svg(ICO.baixar, 12)}Baixar</button>
      </li>`;
    })
    .join('')}</ul>`;
}

/* ---------------------------------------------------------------- tela */
VIEWS.relatorio = () => {
  const o = App.obra();
  const cliente = ehClienteDaObra(o.id);
  const catalogo = cliente ? RELATORIOS.filter((r) => r.tipo === 'status') : RELATORIOS;
  if (!catalogo.some((r) => r.tipo === Rel.tipo)) Rel.tipo = catalogo[0].tipo;
  const rel = catalogo.find((r) => r.tipo === Rel.tipo);
  const op = opcoesDe(rel.tipo);
  const rt = rtDoRelatorio(o, Store.estado.empresa);

  const aviso =
    rt.falta.length && !cliente
      ? `<div class="aviso-linha nao-imprime" role="status">Sem ${rt.falta.join(' nem ')}: o relatório sai sem a assinatura técnica.
          <button class="btn-link" data-acao="ir" data-view="obra-config">Preencher na Configuração da obra</button>
          <span class="tinta2">ou</span>
          <button class="btn-link" data-acao="ir" data-view="ajustes">em Ajustes, para todas as obras</button></div>`
      : '';

  const cartoes = catalogo
    .map((r) => {
      const sel = r.tipo === rel.tipo;
      return `<button type="button" class="rel-cartao${sel ? ' ativo' : ''}" data-acao="rel-escolher" data-tipo="${r.tipo}" aria-pressed="${sel}">
        <span class="rel-cartao-tit"><b>${esc(r.titulo)}</b><small>${esc(r.para)}</small></span>
        <span class="rel-cartao-txt">${esc(r.texto)}</span>
      </button>`;
    })
    .join('');

  return `<div class="tela-relatorios">
    ${aviso}
    <div class="rel-grade">
      <div class="rel-esq nao-imprime">
        <section class="analise-bloco" aria-label="Relatórios">
          <div class="rel-lista" role="group" aria-label="Escolha o relatório">${cartoes}</div>
          ${opcoesHTML(rel, op)}
          <div class="rel-acoes">
            <button class="btn primario" data-acao="rel-gerar">${svg(ICO.baixar, 13)}Gerar PDF</button>
            ${cliente ? '' : `<button class="btn" data-acao="rel-whatsapp">${svg(ICO.whatsapp, 13)}WhatsApp</button>`}
            ${cliente ? '' : '<button class="btn" data-acao="rel-email">E-mail</button>'}
            <button class="btn sutil" data-acao="rel-imprimir">Imprimir</button>
          </div>
        </section>
        ${
          cliente
            ? ''
            : `<section class="analise-bloco" aria-label="Relatórios gerados">
                <div class="analise-cab"><h2>Gerados</h2><span class="tinta3">data, tipo e quem gerou</span></div>
                ${historicoHTML(o)}
              </section>`
        }
      </div>
      <div class="rel-previa" id="rel-previa">${previa(o, rel.tipo, op)}</div>
    </div>
  </div>`;
};

/* "Exportar dados" na toolbar: CSV ou .xlsx dos registros da obra */
VIEWS.relatorio.toolbar = () => {
  const o = App.obra();
  if (!o || ehClienteDaObra(o.id)) return '';
  return `<button class="btn" data-acao="rel-exportar" aria-haspopup="menu">${svg(ICO.baixar, 13)}<span class="rotulo-btn">Exportar dados</span> ${svg(ICO.seta, 10)}</button>`;
};

/* -------------------------------------------------------------- ações */
ACOES['rel-escolher'] = (el, d) => {
  Rel.tipo = d.tipo;
  App.renderConteudo();
};

ACOES['rel-periodo'] = (el, d) => {
  const op = opcoesDe(Rel.tipo);
  op.de = d.de || '';
  op.ate = d.ate || '';
  App.renderConteudo();
};

/* opções: redesenha só a prévia, para não tirar o foco do campo */
let timerPrevia = null;
function atualizarPrevia() {
  const alvo = document.getElementById('rel-previa');
  const o = App.obra();
  if (alvo && o) alvo.innerHTML = previa(o, Rel.tipo, opcoesDe(Rel.tipo));
}
if (typeof document !== 'undefined') {
  const aoMudar = (ev) => {
    const el = ev.target;
    if (!el || !el.dataset || !el.dataset.relOp || App.rota.view !== 'relatorio') return;
    const op = opcoesDe(Rel.tipo);
    const k = el.dataset.relOp;
    op[k] = el.type === 'checkbox' ? el.checked : el.value;
    clearTimeout(timerPrevia);
    timerPrevia = setTimeout(atualizarPrevia, k === 'observacao' ? 250 : 0);
    if (k === 'de' || k === 'ate') {
      document.querySelectorAll('[data-acao="rel-periodo"]').forEach((b) => {
        const ligado = b.dataset.de === op.de && b.dataset.ate === op.ate;
        b.classList.toggle('ativa', ligado);
        b.setAttribute('aria-pressed', String(ligado));
      });
    }
  };
  document.addEventListener('input', aoMudar);
  document.addEventListener('change', aoMudar);
}

const quemGerou = () =>
  Store.backend === 'supabase' && SUPA.usuario
    ? String(SUPA.usuario.email || 'você').split('@')[0]
    : 'este navegador';

/* guarda no histórico — e o PDF no Storage, quando dá — sem travar a ação */
async function registrar(o, tipo, op, doc) {
  const reg = Object.assign(novoRelatorioGerado(), {
    tipo,
    opcoes: { ...op },
    geradoPor: quemGerou(),
  });
  try {
    reg.arquivo = await enviarArquivo(
      doc.output('blob'),
      `${o.id}/relatorios/${reg.id}.pdf`,
      'application/pdf',
    );
  } catch (e) {
    reg.arquivo = '';
  }
  if (apenasErros(validarRelatorioGerado(reg)).length) reg.arquivo = '';
  if (apenasErros(validarRelatorioGerado(reg)).length) return;
  mutar(() => {
    o.relatoriosGerados.push(reg);
  });
}

async function montar() {
  const o = App.obra();
  const op = { ...opcoesDe(Rel.tipo) };
  toast('Montando o PDF…');
  const r = await gerarRelatorio(o, Rel.tipo, op);
  return r ? { ...r, o, op } : null;
}

ACOES['rel-gerar'] = async () => {
  const r = await montar();
  if (!r) return;
  await salvarPDF(r.doc, r.nome);
  if (Rel.tipo === 'status') marcarStatusEnviado(r.o);
  registrar(r.o, Rel.tipo, r.op, r.doc);
};
ACOES['rel-whatsapp'] = async () => {
  const r = await montar();
  if (!r) return;
  const ok = await compartilharPdfWhatsApp(
    r.o,
    r.doc,
    r.nome,
    `${TITULO[Rel.tipo]} da obra ${r.o.nome} — ${fmtData(hojeISO())}.`,
  );
  if (!ok) return;
  if (Rel.tipo === 'status') marcarStatusEnviado(r.o);
  registrar(r.o, Rel.tipo, r.op, r.doc);
};
ACOES['rel-email'] = async () => {
  const r = await montar();
  if (!r) return;
  await enviarPdfEmail(r.o, r.doc, r.nome, TITULO[Rel.tipo]);
  if (Rel.tipo === 'status') marcarStatusEnviado(r.o);
  registrar(r.o, Rel.tipo, r.op, r.doc);
};
ACOES['rel-imprimir'] = async () => {
  const r = await montar();
  if (!r) return;
  imprimirPdf(r.doc);
  registrar(r.o, Rel.tipo, r.op, r.doc);
};

/* Baixar de novo: o PDF guardado; sem ele, gera de novo com as mesmas
   opções — e diz que os números são os de hoje. */
ACOES['rel-baixar-de-novo'] = async (el, d) => {
  const o = App.obra();
  const reg = (o.relatoriosGerados || []).find((x) => x.id === d.id);
  if (!reg) return;
  if (reg.arquivo) {
    try {
      window.open(await urlAnexo(reg.arquivo), '_blank', 'noopener');
      return;
    } catch (e) {
      /* sem acesso ao arquivo: gera de novo */
    }
  }
  const r = await gerarRelatorio(o, reg.tipo, reg.opcoes || {});
  if (!r) return;
  await salvarPDF(r.doc, r.nome);
  toast('Gerado de novo com as mesmas opções — os números são os de hoje.', 'aviso', 6000);
};

ACOES['rel-exportar'] = (el) => {
  const item = (tipo, rotulo) =>
    `<button role="menuitem" data-acao="exportar-dados" data-tipo="${tipo}" data-formato="csv">${esc(rotulo)} · CSV</button>
     <button role="menuitem" data-acao="exportar-dados" data-tipo="${tipo}" data-formato="xlsx">${esc(rotulo)} · Excel (.xlsx)</button>`;
  abrirMenu(
    el,
    `<div class="menu-grupo" role="presentation">Exportar dados da obra</div>
     ${item('lancamentos', 'Lançamentos')}<hr>${item('medicoes', 'Medições')}<hr>${item('recebimentos', 'Recebimentos')}`,
    'menu-filtros',
  );
};
