/**
 * telas/recebimentos.js — Recebimentos (financiador, cliente, recursos próprios).
 *
 * Em ordem de data prevista, porque é assim que se cobra: o que vence
 * primeiro vem primeiro. A faixa de cima responde as quatro perguntas —
 * quanto entrou, quanto falta, quanto atrasou e quanto dá para pedir ao
 * financiador hoje (indicadoresRecebimentos, podeSolicitar).
 *
 * A situação de cada parcela é o passo dela (andamentoParcela): do
 * financiador, Prevista → Solicitada → Em vistoria → Aprovada → Creditada;
 * do cliente, Prevista → Cobrada → Recebida. A diferença (tarifa,
 * desconto) só existe na parcela recebida — na que não caiu, "Aguardando",
 * nunca um −R$ 37.500 que parece prejuízo. Clicar na linha abre o
 * histórico da parcela no inspetor; o "⋯" tem as ações do dia a dia.
 */
import {
  competencia,
  esc,
  fmtCompetencia,
  fmtDataCurta,
  fmtMoney,
  fmtMoneyCurto,
  fmtPct,
  hojeISO,
  isISO,
  norm,
  num,
} from '../../nucleo/base.js';
import { linkWhatsApp } from '../../nucleo/contato.js';
import {
  andamentoParcela,
  condicaoParcela,
  curvaRecebimentos,
  historicoParcela,
  indicadoresRecebimentos,
  recebimentoDiferenca,
  recebimentoDoFinanciamento,
  resumoRecebimentos,
} from '../../dominio/calculos.js';
import { apenasErros, validarRecebimento } from '../../dominio/validacao.js';
import { graficoAuto, graficoColunas, graficoLinhas } from '../../graficos/index.js';
import { Store, mutar } from '../../dados/store.js';
import { ACOES } from '../acoes.js';
import { campoAnexo, htmlAnexo } from '../anexos.js';
import { App, ICO, abrirForm, abrirModal, botao, fecharModal, svg, toast } from '../shell.js';
import { VIEWS } from '../telas-obra.js';
import {
  abrirMenu,
  barraFiltros,
  botaoNovo,
  buscaToolbar,
  dinheiro,
  faixaKpis,
  lista,
  painelAnalise,
  vazioTela,
} from './componentes.js';

/* Estado só de tela: a parcela com o inspetor aberto. */
const tela = { selecao: '' };
const acharParcela = (id) => (App.obra() ? App.obra().recebimentos.find((r) => r.id === id) : null);
const nomeParcela = (r) =>
  r.etapaPci || (r.numeroMedicao ? `Parcela ${r.numeroMedicao}` : r.origem || 'Parcela');
const dias = (n) => `${n} dia${n === 1 ? '' : 's'}`;

/* ---------------------------------------------------------------- KPIs */
function kpisRecebimentos(k) {
  const ps = k.podeSolicitar;
  const origem = [
    k.recebidoFinanciamento > 0.005
      ? `financiamento ${fmtMoneyCurto(k.recebidoFinanciamento)}`
      : '',
    k.recebidoProprio > 0.005 ? `próprios ${fmtMoneyCurto(k.recebidoProprio)}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  return faixaKpis(
    [
      {
        rotulo: 'Recebido',
        valor: fmtMoney(k.recebido, { dec: 0 }),
        contexto: `${k.pctRecebido === null ? 'nada previsto' : `${fmtPct(k.pctRecebido, 0)} do previsto`}${
          k.tarifas > 0.005 ? ` · tarifas ${fmtMoneyCurto(k.tarifas)}` : ''
        }${origem ? `<br>${origem}` : ''}`,
      },
      {
        rotulo: 'A receber',
        valor: fmtMoney(k.aReceber, { dec: 0 }),
        contexto: k.proxima
          ? `próxima: ${fmtMoney(k.proxima.valor, { dec: 0 })} em ${fmtDataCurta(k.proxima.data)}`
          : k.aReceber > 0.005
            ? 'só parcelas vencidas'
            : 'nada a receber',
      },
      {
        rotulo: 'Atrasado',
        valor: fmtMoney(k.atrasado, { dec: 0 }),
        tom: k.nAtrasadas ? 'atraso' : '',
        contexto: k.maisAntiga
          ? `${k.nAtrasadas > 1 ? `${k.nAtrasadas} parcelas · a mais antiga` : k.maisAntiga.numero ? `parcela ${esc(k.maisAntiga.numero)}` : esc(k.maisAntiga.etapa || 'parcela')} · ${dias(k.maisAntiga.dias)}`
          : 'nada vencido',
      },
      ps
        ? {
            rotulo: 'Pode solicitar',
            valor: fmtMoney(ps.valor, { dec: 0 }),
            tom: ps.valor > 0.5 ? 'tom-alerta' : '',
            contexto: `executado ${fmtPct(ps.executado, 0)} × liberado ${fmtPct(ps.liberado, 0)}${
              ps.emAndamento > 0.5 ? ` · ${fmtMoneyCurto(ps.emAndamento)} já pedidos` : ''
            }`,
            dica: `Executado ${fmtPct(ps.executado, 0)} × liberado ${fmtPct(ps.liberado, 0)} de ${fmtMoney(ps.financiado, { dec: 0 })} → até ${fmtMoney(ps.valor, { dec: 0 })} a solicitar ao ${ps.financiador}${ps.emAndamento > 0.5 ? ` (descontados ${fmtMoney(ps.emAndamento, { dec: 0 })} já pedidos e ainda não creditados)` : ''}.`,
          }
        : {
            rotulo: 'Pode solicitar',
            valor: '—',
            contexto: 'sem valor financiado na obra',
          },
    ],
    { rotulo: 'Indicadores de recebimentos' },
  );
}

/* ------------------------------------------------------------ situação
   Mini indicador de passos + o texto do passo ("Solicitada há 46 dias"). */
function passosHTML(a) {
  if (a.cancelada) return '<span class="tinta3">Cancelada</span>';
  const pontos = a.passos
    .map(
      (p, i) =>
        `<i class="${i < a.passo ? 'feito' : i === a.passo ? 'atual' : ''}" title="${esc(p)}"></i>`,
    )
    .join('');
  const tom = a.final ? 'tinta2' : a.vencida ? 'atraso' : a.passo > 0 ? 'tom-alerta' : 'tinta2';
  return `<div class="passos${a.vencida ? ' vencida' : ''}" aria-label="${esc(a.passos[a.passo])}">
    <span class="passos-pontos" aria-hidden="true">${pontos}</span>
    <span class="${tom}">${esc(a.texto)}${a.vencida && a.passo > 0 ? ` · atrasada ${dias(a.diasAtraso)}` : ''}</span>
  </div>`;
}

/* ------------------------------------------------------------ inspetor */
function inspetorParcela(o, r) {
  const a = andamentoParcela(r);
  const cond = condicaoParcela(o, r);
  const hist = historicoParcela(r);
  const leitura = Store.somenteLeitura();
  return `<aside class="inspetor" tabindex="-1" data-testid="inspetor-parcela" aria-label="${esc(nomeParcela(r))}">
    <div class="inspetor-cab">
      <h2>${esc(nomeParcela(r))}<span class="sub">${esc([r.origem, r.numeroMedicao ? `nº ${r.numeroMedicao}` : ''].filter(Boolean).join(' · '))}</span></h2>
      ${
        leitura
          ? ''
          : `<button class="btn sutil icone" data-acao="rec-menu" data-id="${esc(r.id)}" title="Mais ações"
          aria-label="Mais ações para ${esc(nomeParcela(r))}" aria-haspopup="menu">${svg(ICO.maisH, 15)}</button>`
      }
      <button class="btn sutil icone" data-acao="rec-fechar" title="Fechar" aria-label="Fechar">${svg(ICO.x, 13)}</button>
    </div>
    <div class="inspetor-corpo">
      <div class="inspetor-secao">${passosHTML(a)}
        ${cond ? `<p class="linha-cinza ${cond.cumprida ? '' : 'tom-alerta'}">${esc(cond.texto)}</p>` : ''}
      </div>
      <div class="inspetor-secao"><h3>Histórico</h3>
        <table class="mini-tab"><thead><tr><th>Passo</th><th>Data</th><th class="num">Valor</th></tr></thead>
        <tbody>${hist
          .map(
            (
              h,
            ) => `<tr><td>${esc(h.passo)}</td><td class="tinta2">${isISO(h.data) ? fmtDataCurta(h.data) : '—'}</td>
            <td class="num">${h.valor === null ? '' : fmtMoney(h.valor)}${h.descontos ? `<br><span class="tinta3">−${fmtMoney(h.descontos)} tarifas</span>` : ''}</td></tr>`,
          )
          .join('')}</tbody></table>
      </div>
      <div class="inspetor-secao"><h3>Valores</h3><dl class="pares">
        <dt>Previsto</dt><dd>${fmtMoney(num(r.valorPrevisto))}</dd>
        ${num(r.valorAprovado) ? `<dt>Aprovado</dt><dd>${fmtMoney(num(r.valorAprovado))}</dd>` : ''}
        <dt>Recebido</dt><dd>${a.final ? fmtMoney(num(r.valorRecebido)) : '<span class="tinta3">aguardando</span>'}</dd>
        ${a.final ? `<dt>Diferença</dt><dd>${dinheiro(recebimentoDiferenca(r), { cinzaNoZero: true })}</dd>` : ''}
      </dl></div>
      <div class="inspetor-secao"><h3>Comprovante</h3>${
        r.comprovante
          ? `<button class="btn pequeno" data-acao="rec-ver-comprovante" data-id="${esc(r.id)}">${svg(ICO.clipe, 13)}Ver comprovante</button>`
          : `<p class="linha-cinza">Nenhum anexado.</p>${leitura ? '' : botao('Anexar comprovante', 'rec-anexar', { id: r.id }, 'btn sutil pequeno')}`
      }</div>
      ${r.observacoes ? `<div class="inspetor-secao"><h3>Observações</h3><p class="obs">${esc(r.observacoes)}</p></div>` : ''}
    </div>
  </aside>`;
}

/* ---------------------------------------------------------------- tela */
VIEWS.recebimentos = () => {
  const o = App.obra();
  const f = App.filtros;

  if (!o.recebimentos.length) {
    return vazioTela({
      titulo: 'Nenhuma parcela cadastrada',
      texto:
        'Cadastre as parcelas previstas do financiamento e do cliente. Depois é só marcar o que foi creditado — a tela avisa o que atrasou.',
      acao: botao('Cadastrar parcela', 'novo-recebimento', {}, 'btn primario', 'mais'),
    });
  }

  const hoje = hojeISO();
  const k = indicadoresRecebimentos(o, hoje);
  const rr = resumoRecebimentos(o, hoje);

  /* ------------------------------------------------------- filtros */
  const meses = [
    ...new Set(o.recebimentos.map((r) => competencia(r.dataPrevista)).filter(Boolean)),
  ].sort();
  const busca = norm(f.busca || '');
  const todosItens = o.recebimentos.map((r) => {
    const a = andamentoParcela(r, hoje);
    return { r, a, cond: condicaoParcela(o, r), dif: a.final ? recebimentoDiferenca(r) : null };
  });
  /* situação em pílula: atrasadas primeiro, que é o que se cobra */
  const SITUACOES = [
    { valor: 'atrasadas', rotulo: 'Atrasadas', pertence: (d) => d.a.vencida },
    {
      valor: 'andamento',
      rotulo: 'Pedidas',
      pertence: (d) => !d.a.final && !d.a.cancelada && d.a.passo > 0,
    },
    { valor: 'receber', rotulo: 'A receber', pertence: (d) => !d.a.final && !d.a.cancelada },
    { valor: 'recebidas', rotulo: 'Recebidas', pertence: (d) => d.a.final },
  ];
  let itens = todosItens;
  if (f.origem) itens = itens.filter((d) => d.r.origem === f.origem);
  if (f.mes) itens = itens.filter((d) => competencia(d.r.dataPrevista) === f.mes);
  const situacao = SITUACOES.find((x) => x.valor === f.situacao);
  if (situacao) itens = itens.filter(situacao.pertence);
  if (busca) {
    itens = itens.filter((d) =>
      norm(`${d.r.origem} ${d.r.etapaPci} ${d.r.numeroMedicao} ${d.r.observacoes}`).includes(busca),
    );
  }

  /* -------------------------------------------------------- colunas */
  const colunas = [
    {
      k: 'data',
      rotulo: 'Previsto para',
      largura: '10%',
      celular: 'some',
      valor: (d) => d.r.dataPrevista || d.r.dataRecebimento || '',
      celula: (d) =>
        `<span class="${d.a.vencida ? 'atraso' : 'tinta2'}">${fmtDataCurta(d.r.dataPrevista)}</span>`,
    },
    {
      k: 'origem',
      rotulo: 'Origem',
      largura: '10%',
      celular: 'some',
      valor: (d) => d.r.origem || '',
      celula: (d) => esc(d.r.origem || '—'),
    },
    {
      k: 'etapa',
      rotulo: 'Parcela',
      largura: '24%',
      celular: 'principal',
      valor: (d) => d.r.etapaPci || '',
      celula: (d) => {
        const sub = [
          d.r.numeroMedicao ? `nº ${d.r.numeroMedicao}` : null,
          d.r.comprovante ? 'com comprovante' : null,
        ]
          .filter(Boolean)
          .join(' · ');
        /* a condição de liberação: "exige Acabamento 100% · hoje 30%" */
        const cond = d.cond
          ? `<span class="${d.cond.cumprida ? 'tinta2' : 'tom-alerta'}">${esc(d.cond.texto)}</span>`
          : '';
        const aReceber = !d.a.final
          ? `<span class="so-celular">previsto ${esc(fmtMoney(num(d.r.valorPrevisto), { dec: 0 }))}${isISO(d.r.dataPrevista) ? ` para ${esc(fmtDataCurta(d.r.dataPrevista))}` : ''}</span>`
          : '';
        return `<div class="cel-obra"><b>${esc(nomeParcela(d.r))}</b>${sub ? `<span>${esc(sub)}</span>` : ''}${cond}${aReceber}</div>`;
      },
    },
    {
      k: 'previsto',
      rotulo: 'Previsto',
      largura: '11%',
      num: true,
      celular: 'some',
      valor: (d) => num(d.r.valorPrevisto),
      celula: (d) => dinheiro(num(d.r.valorPrevisto)),
      total: (ds) => dinheiro(ds.reduce((s, d) => s + num(d.r.valorPrevisto), 0)),
    },
    {
      k: 'recebido',
      rotulo: 'Recebido',
      largura: '11%',
      num: true,
      valor: (d) => num(d.r.valorRecebido),
      celula: (d) => dinheiro(num(d.r.valorRecebido), { cinzaNoZero: true }),
      total: (ds) => dinheiro(ds.reduce((s, d) => s + num(d.r.valorRecebido), 0)),
    },
    {
      k: 'dif',
      rotulo: 'Diferença',
      largura: '10%',
      num: true,
      celular: 'some',
      valor: (d) => (d.dif === null ? -Infinity : d.dif),
      /* só na parcela recebida: tarifa, desconto ou crédito a mais */
      /* tarifa e desconto em cinza: é custo do crédito, não prejuízo */
      celula: (d) =>
        d.dif === null
          ? '<span class="tinta3">Aguardando</span>'
          : Math.abs(d.dif) < 0.005
            ? '<span class="tinta3">—</span>'
            : `<span class="tinta2" title="${d.dif < 0 ? 'tarifa ou desconto na liberação' : 'caiu a mais que o previsto'}">${d.dif < 0 ? '−' : '+'}${fmtMoney(Math.abs(d.dif))}</span>`,
      total: (ds) => {
        const t = ds.filter((d) => d.dif !== null).reduce((s, d) => s + d.dif, 0);
        return Math.abs(t) < 0.005
          ? ''
          : `<span class="tinta2">${t < 0 ? '−' : '+'}${fmtMoney(Math.abs(t))}</span>`;
      },
    },
    {
      k: 'situacao',
      rotulo: 'Situação',
      largura: '19%',
      valor: (d) => `${d.a.vencida ? 0 : d.a.final ? 2 : 1}${d.r.dataPrevista || ''}`,
      celula: (d) => passosHTML(d.a),
    },
    {
      k: 'acoes',
      rotulo: '',
      largura: '5%',
      celula: (d) =>
        Store.somenteLeitura()
          ? ''
          : `<button class="btn sutil icone pequeno" data-acao="rec-menu" data-id="${esc(d.r.id)}"
              title="Ações" aria-label="Ações da ${esc(nomeParcela(d.r))}" aria-haspopup="menu">${svg(ICO.maisH, 14)}</button>`,
    },
  ];

  /* ------------------------------------------------ painel de análise */
  const curva = curvaRecebimentos(o, hoje);
  const porMes = [
    ...(rr.vencido > 0.005
      ? [
          {
            rotulo: 'Vencido',
            valor: rr.vencido,
            cor: 'var(--atraso)',
            dica: 'parcelas que passaram da data sem crédito',
          },
        ]
      : []),
    ...rr.porMes.map((x) => ({ rotulo: fmtCompetencia(x.ym), valor: x.valor })),
  ];

  const sel = tela.selecao && acharParcela(tela.selecao);

  return `<div class="tela-contratos">
    <div class="tela-principal">
      <div class="tela-lista">
        ${kpisRecebimentos(k)}
        ${barraFiltros({
          pilulas: {
            chave: 'situacao',
            todos: 'Todas',
            total: todosItens.length,
            opcoes: SITUACOES.map((x) => ({
              valor: x.valor,
              rotulo: x.rotulo,
              n: todosItens.filter(x.pertence).length,
            })),
          },
          mais: [
            {
              chave: 'origem',
              rotulo: 'Origem',
              todos: 'Todas as origens',
              opcoes: [...new Set(o.recebimentos.map((r) => r.origem).filter(Boolean))].map(
                (or) => [or, or, todosItens.filter((d) => d.r.origem === or).length],
              ),
            },
            {
              chave: 'mes',
              rotulo: 'Mês',
              todos: 'Todos os meses',
              opcoes: meses.map((ym) => [
                ym,
                fmtCompetencia(ym),
                todosItens.filter((d) => competencia(d.r.dataPrevista) === ym).length,
              ]),
            },
          ],
          filtrados: itens.length,
          total: o.recebimentos.length,
        })}
        ${lista({
          id: 'recebimentos',
          testid: 'lista-recebimentos',
          colunas,
          itens,
          ordemPadrao: { col: 'data', dir: 1 },
          rodapeRotulo: (n) => `${n} parcelas`,
          linhaAttrs: (d) =>
            `data-acao="rec-selecionar" data-id="${esc(d.r.id)}"${d.r.id === tela.selecao ? ' aria-selected="true"' : ''}`,
          linhaClasse: () => 'clicavel',
        })}
        ${painelAnalise([
          {
            titulo: 'Previsto × recebido acumulado',
            conteudo:
              curva.length > 1
                ? graficoAuto((w) =>
                    graficoLinhas({
                      rotulos: curva.map((c) => c.ym),
                      series: [
                        {
                          nome: 'Previsto',
                          cor: 'var(--serie6)',
                          valores: curva.map((c) => c.previsto),
                          tracejada: true,
                        },
                        {
                          nome: 'Recebido',
                          cor: 'var(--serie1)',
                          valores: curva.map((c) => c.recebido),
                        },
                      ],
                      hoje,
                      largura: w,
                      rotulo: 'Previsto e recebido acumulados por mês',
                    }),
                  )
                : '<p class="tinta2 painel-vazio">Poucos meses para desenhar a linha.</p>',
          },
          {
            titulo: 'A receber por mês',
            nota: rr.vencido > 0.005 ? 'vencido separado' : '',
            conteudo: porMes.length
              ? graficoAuto((w) =>
                  graficoColunas(porMes, {
                    cor: 'var(--serie1)',
                    largura: w,
                    rotulo: 'A receber por mês',
                  }),
                )
              : '<p class="tinta2 painel-vazio">Nada a receber.</p>',
          },
        ])}
      </div>
    </div>
    ${sel ? inspetorParcela(o, sel) : ''}
  </div>`;
};
VIEWS.recebimentos.paineis = true;

VIEWS.recebimentos.toolbar = () => {
  const o = App.obra();
  if (!o || !o.recebimentos.length) return '';
  return (
    buscaToolbar('Buscar parcela', 'busca-recebimentos') +
    botaoNovo('Nova parcela', 'novo-recebimento')
  );
};

/* -------------------------------------------------------------- ações */
ACOES['rec-selecionar'] = (el, d) => {
  tela.selecao = tela.selecao === d.id ? '' : d.id;
  App.renderConteudo();
};
ACOES['rec-fechar'] = () => {
  tela.selecao = '';
  App.renderConteudo();
};

/* menu "⋯": registrar crédito, marcar como solicitada/cobrada, cobrar o
   cliente, anexar comprovante, editar e excluir */
ACOES['rec-menu'] = (el, d) => {
  const r = acharParcela(d.id);
  if (!r) return;
  const a = andamentoParcela(r);
  const cliente = a.tipo === 'cliente';
  const item = (acao, icone, texto) =>
    `<button role="menuitem" data-acao="${acao}" data-id="${esc(r.id)}">${icone ? svg(ICO[icone], 13) : ''}${esc(texto)}</button>`;
  abrirMenu(
    el,
    [
      a.final || a.cancelada
        ? ''
        : item('rec-credito', 'mais', cliente ? 'Registrar recebimento' : 'Registrar crédito'),
      a.final || a.cancelada || a.passo >= 1
        ? ''
        : item('rec-solicitar', '', cliente ? 'Marcar como cobrada' : 'Marcar como solicitada'),
      cliente && !a.final && !a.cancelada
        ? item('rec-cobrar', 'whatsapp', 'Cobrar o cliente…')
        : '',
      item('rec-anexar', 'clipe', r.comprovante ? 'Trocar comprovante' : 'Anexar comprovante'),
      '<hr>',
      item('editar-recebimento', 'lapis', 'Editar'),
      item('excluir-recebimento', 'lixo', 'Excluir'),
    ].join(''),
  );
};

ACOES['rec-credito'] = (el, d) => {
  const r = acharParcela(d.id);
  if (!r) return;
  const cliente = !recebimentoDoFinanciamento(r);
  const valorBase = num(r.valorAprovado) - num(r.descontos) || num(r.valorPrevisto);
  abrirForm({
    titulo: `${cliente ? 'Recebimento' : 'Crédito'} — ${nomeParcela(r)}`,
    campos: [
      {
        k: 'dataRecebimento',
        label: cliente ? 'Recebido em' : 'Creditado em',
        tipo: 'data',
        col: 4,
        obrigatorio: true,
      },
      {
        k: 'valorRecebido',
        label: 'Valor que caiu na conta',
        tipo: 'dinheiro',
        col: 4,
        obrigatorio: true,
      },
      {
        k: 'descontos',
        label: 'Tarifas e descontos',
        tipo: 'dinheiro',
        col: 4,
        dica: 'o que o banco reteve',
      },
    ],
    valores: {
      dataRecebimento: hojeISO(),
      valorRecebido: valorBase > 0 ? valorBase : 0,
      descontos: num(r.descontos),
    },
    validar: (dados) => {
      const probs = validarRecebimento({ ...r, ...dados });
      if (!(num(dados.valorRecebido) > 0))
        probs.push({ campo: 'valorRecebido', mensagem: 'Informe o valor que caiu.', sev: 'erro' });
      if (!isISO(dados.dataRecebimento))
        probs.push({ campo: 'dataRecebimento', mensagem: 'Informe a data.', sev: 'erro' });
      return probs;
    },
    aoSalvar: (dados) => {
      mutar(() => {
        Object.assign(r, dados, { status: 'Recebido' });
      });
      fecharModal();
      toast(cliente ? 'Recebimento registrado.' : 'Crédito registrado.', 'ok');
    },
  });
};

ACOES['rec-solicitar'] = (el, d) => {
  const r = acharParcela(d.id);
  if (!r) return;
  const cliente = !recebimentoDoFinanciamento(r);
  mutar(() => {
    r.dataSolicitacao = hojeISO();
    if (!cliente) r.status = 'Solicitado';
  });
  toast(
    cliente ? 'Parcela marcada como cobrada hoje.' : 'Parcela marcada como solicitada hoje.',
    'ok',
  );
};

/* Cobrar: mensagem pronta para o cliente, por WhatsApp ou e-mail. */
ACOES['rec-cobrar'] = (el, d) => {
  const o = App.obra();
  const r = acharParcela(d.id);
  if (!r) return;
  const cli = Store.estado.clientes.find((c) => c.id === o.clienteId);
  const valor = fmtMoney(num(r.valorPrevisto), { dec: 2 });
  const quando = isISO(r.dataPrevista) ? fmtDataCurta(r.dataPrevista) : '';
  const texto = `Olá${cli && cli.nome ? `, ${cli.nome.split(' ')[0]}` : ''}! Passando para lembrar da parcela ${nomeParcela(r)} da obra ${o.nome}, de ${valor}${
    quando ? `, prevista para ${quando}` : ''
  }. Qualquer dúvida, estou à disposição.`;
  const fone = cli && (cli.whatsapp || cli.telefone);
  const email = cli && cli.email;
  if (!fone && !email) {
    toast('O cliente desta obra não tem telefone nem e-mail no cadastro.', 'aviso');
    return;
  }
  const alvo =
    document.querySelector(`[data-acao="rec-menu"][data-id="${CSS.escape(r.id)}"]`) || el;
  setTimeout(() =>
    abrirMenu(
      alvo,
      [
        fone
          ? `<a role="menuitem" href="${esc(linkWhatsApp(fone, texto))}" target="_blank" rel="noopener" data-acao="abrir-externo" title="${esc(texto)}">${svg(ICO.whatsapp, 13)}WhatsApp</a>`
          : '',
        email
          ? `<a role="menuitem" href="mailto:${esc(email)}?subject=${encodeURIComponent(`Parcela ${nomeParcela(r)} — ${o.nome}`)}&body=${encodeURIComponent(texto)}" data-acao="abrir-externo">E-mail</a>`
          : '',
      ].join(''),
    ),
  );
};

const comprovanteEmEdicao = { ref: '' };
ACOES['rec-anexar'] = (el, d) => {
  const o = App.obra();
  const r = acharParcela(d.id);
  if (!r) return;
  comprovanteEmEdicao.ref = r.comprovante || '';
  abrirModal({
    titulo: `Comprovante — ${nomeParcela(r)}`,
    largura: 'estreito',
    corpo: '<form class="form-grade" data-form="1" onsubmit="return false"></form>',
    rodape: `<button class="btn" data-acao="fechar-modal">Cancelar</button>
      <button class="btn primario" data-acao="rec-anexar-salvar" data-id="${esc(r.id)}">Salvar</button>`,
  });
  const form = document.querySelector('#modal-camada [data-form]');
  campoAnexo(form, comprovanteEmEdicao, {
    rotulo: 'Comprovante do crédito',
    destino: { obraId: o.id, pasta: 'recebimentos', id: r.id },
    dica: 'extrato, TED ou recibo — foto ou PDF',
  });
};
ACOES['rec-anexar-salvar'] = (el, d) => {
  const r = acharParcela(d.id);
  if (!r) return;
  const erros = apenasErros(validarRecebimento({ ...r, comprovante: comprovanteEmEdicao.ref }));
  if (erros.length) {
    toast(erros[0].mensagem, 'critico');
    return;
  }
  mutar(() => {
    r.comprovante = comprovanteEmEdicao.ref;
  });
  fecharModal();
  toast(r.comprovante ? 'Comprovante anexado.' : 'Comprovante removido.', 'ok');
};

ACOES['rec-ver-comprovante'] = async (el, d) => {
  const r = acharParcela(d.id);
  if (!r || !r.comprovante) return;
  try {
    abrirModal({
      titulo: `Comprovante — ${nomeParcela(r)}`,
      largura: 'largo',
      corpo: await htmlAnexo(r.comprovante, `Comprovante de ${nomeParcela(r)}`),
    });
  } catch (e) {
    toast('Não foi possível abrir o comprovante: ' + ((e && e.message) || e), 'critico');
  }
};
