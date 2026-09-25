/**
 * telas/recebimentos.js — Recebimentos (financiador, cliente, recursos próprios).
 *
 * Em ordem de data prevista, porque é assim que se cobra: o que vence
 * primeiro vem primeiro. Parcela atrasada é a única coisa vermelha da
 * tela — e diz há quantos dias.
 *
 * Qualquer financiador (0016): o passo da parcela (solicitada →
 * vistoriada → aprovada → creditada, processoParcela) aparece na
 * Situação; "Liberado × executado" diz quanto a construtora está
 * bancando; o que venceu vai para o balde "Vencido" (resumoRecebimentos).
 */
import {
  competencia,
  diasEntre,
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
import {
  kpisObra,
  liberadoExecutado,
  processoParcela,
  recebimentoDiferenca,
  recebimentoDoFinanciamento,
  resumoRecebimentos,
} from '../../dominio/calculos.js';
import { graficoBarras } from '../../graficos/index.js';
import { App, botao } from '../shell.js';
import { VIEWS } from '../telas-obra.js';
import {
  acoesRegistro,
  barraFiltros,
  botaoNovo,
  buscaToolbar,
  dinheiro,
  faixaKpis,
  lista,
  painelAnalise,
  vazioTela,
} from './componentes.js';

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

  const k = kpisObra(o);
  const hoje = hojeISO();
  const naoRecebido = (r) => r.status !== 'Recebido' && r.status !== 'Cancelado';
  const atrasada = (r) => naoRecebido(r) && isISO(r.dataPrevista) && r.dataPrevista < hoje;

  const rr = resumoRecebimentos(o, hoje);
  const { atrasadas, totAtrasado, pendentes } = rr;
  const tDescontos = rr.descontos;
  const le = liberadoExecutado(o);

  /* ------------------------------------------------------- filtros */
  const meses = [
    ...new Set(o.recebimentos.map((r) => competencia(r.dataPrevista)).filter(Boolean)),
  ].sort();
  const busca = norm(f.busca || '');
  const todosItens = o.recebimentos.map((r) => ({
    r,
    dif: recebimentoDiferenca(r),
    atr: atrasada(r),
  }));
  /* situação em pílula: atrasadas primeiro, que é o que se cobra */
  const SITUACOES = [
    { valor: 'atrasadas', rotulo: 'Atrasadas', pertence: (d) => d.atr },
    { valor: 'receber', rotulo: 'A receber', pertence: (d) => naoRecebido(d.r) },
    {
      valor: 'recebidas',
      rotulo: 'Recebidas',
      pertence: (d) => d.r.status === 'Recebido' || d.r.status === 'Recebido parcial',
    },
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
        `<span class="${d.atr ? 'atraso' : 'tinta2'}">${fmtDataCurta(d.r.dataPrevista)}</span>`,
    },
    {
      k: 'origem',
      rotulo: 'Origem',
      largura: '11%',
      celular: 'some',
      valor: (d) => d.r.origem || '',
      celula: (d) => esc(d.r.origem || '—'),
    },
    {
      k: 'etapa',
      rotulo: 'Parcela',
      largura: '23%',
      celular: 'principal',
      valor: (d) => d.r.etapaPci || '',
      celula: (d) => {
        const sub = [
          d.r.numeroMedicao ? `nº ${d.r.numeroMedicao}` : null,
          isISO(d.r.dataSolicitacao) ? `solicitado ${fmtDataCurta(d.r.dataSolicitacao)}` : null,
        ]
          .filter(Boolean)
          .join(' · ');
        /* no cartão do celular, parcela não recebida mostra o previsto e a
           data — "Recebido —" sozinho não dizia quanto nem quando */
        const aReceber =
          num(d.r.valorRecebido) <= 0.005 && num(d.r.valorPrevisto) > 0.005
            ? `<span class="so-celular">previsto ${esc(fmtMoney(num(d.r.valorPrevisto), { dec: 0 }))}${isISO(d.r.dataPrevista) ? ` para ${esc(fmtDataCurta(d.r.dataPrevista))}` : ''}</span>`
            : '';
        return `<div class="cel-dupla"><b>${esc(d.r.etapaPci || d.r.origem || '—')}</b>${sub ? `<span>${esc(sub)}</span>` : ''}${aReceber}</div>`;
      },
    },
    {
      k: 'previsto',
      rotulo: 'Previsto',
      largura: '12%',
      num: true,
      celular: 'some',
      valor: (d) => num(d.r.valorPrevisto),
      celula: (d) => dinheiro(num(d.r.valorPrevisto)),
      total: (ds) => dinheiro(ds.reduce((s, d) => s + num(d.r.valorPrevisto), 0)),
    },
    {
      k: 'recebido',
      rotulo: 'Recebido',
      largura: '12%',
      num: true,
      valor: (d) => num(d.r.valorRecebido),
      celula: (d) => dinheiro(num(d.r.valorRecebido), { cinzaNoZero: true }),
      total: (ds) => dinheiro(ds.reduce((s, d) => s + num(d.r.valorRecebido), 0)),
    },
    {
      k: 'dif',
      rotulo: 'Diferença',
      largura: '11%',
      num: true,
      celular: 'some',
      valor: (d) => d.dif,
      /* Positivo não é verde: receber a mais é informação, não festa. */
      celula: (d) => dinheiro(d.dif, { cinzaNoZero: true }),
      total: (ds) => dinheiro(ds.reduce((s, d) => s + d.dif, 0)),
    },
    {
      k: 'situacao',
      rotulo: 'Situação',
      largura: '15%',
      valor: (d) => (d.atr ? '0' : '1') + (d.r.status || ''),
      celula: (d) => {
        /* passo do financiador por baixo: "solicitada há 45 d" */
        const passo = processoParcela(d.r);
        const sub =
          recebimentoDoFinanciamento(d.r) && ['solicitada', 'vistoriada', 'aprovada'].includes(passo)
            ? `${passo}${passo === 'solicitada' && isISO(d.r.dataSolicitacao) ? ` há ${diasEntre(d.r.dataSolicitacao, hoje)} d` : ''}`
            : '';
        if (d.atr) {
          const dias = diasEntre(d.r.dataPrevista, hoje);
          return `<div class="cel-empilhada"><span class="atraso">${dias} dia${dias === 1 ? '' : 's'} de atraso</span>${sub ? `<span class="tinta3">${esc(sub)}</span>` : ''}</div>`;
        }
        if (sub) return `<span class="tom-alerta">${esc(sub.charAt(0).toUpperCase() + sub.slice(1))}</span>`;
        if (d.r.status === 'Recebido' && isISO(d.r.dataRecebimento)) {
          return `<span class="tinta2">Recebido ${fmtDataCurta(d.r.dataRecebimento)}</span>`;
        }
        return `<span class="tinta2">${esc(d.r.status || '—')}</span>`;
      },
    },
    {
      k: 'acoes',
      rotulo: '',
      largura: '6%',
      celula: (d) =>
        acoesRegistro('recebimento', d.r.id, d.r.etapaPci || `parcela ${d.r.numeroMedicao || ''}`),
    },
  ];

  /* vencido primeiro, num balde próprio — não no mês que já passou */
  const porMes = [
    ...(rr.vencido > 0.005 ? [{ rotulo: 'Vencido', valor: rr.vencido, cor: 'var(--atraso)' }] : []),
    ...rr.porMes.map((x) => ({ rotulo: fmtCompetencia(x.ym), valor: x.valor })),
  ].filter((x) => x.valor > 0.005);

  return `<div class="tela-lista">
    ${faixaKpis(
      [
        {
          rotulo: 'Recebido',
          valor: fmtMoney(k.recebido, { dec: 0 }),
          /* O % é só do financiador: dinheiro do cliente entra no caixa, mas
             não é liberação do financiamento. */
          contexto:
            k.liberadoFinanciamento !== null
              ? `financiamento: ${fmtPct(k.liberadoFinanciamento, 1)} de ${fmtMoney(k.financiado, { dec: 0 })} liberados${k.recebidoProprio > 0.005 ? ` · próprios ${fmtMoney(k.recebidoProprio, { dec: 0 })}` : ''}${tDescontos > 0.005 ? ` · tarifas ${fmtMoney(tDescontos, { dec: 0 })}` : ''}`
              : `financiamento, cliente e próprios${tDescontos > 0.005 ? ` · tarifas ${fmtMoney(tDescontos, { dec: 0 })}` : ''}`,
        },
        {
          rotulo: 'A receber',
          valor: fmtMoney(k.previstoNaoRecebido, { dec: 0 }),
          contexto: `${pendentes.length} parcela${pendentes.length === 1 ? '' : 's'} pendente${pendentes.length === 1 ? '' : 's'}`,
        },
        {
          rotulo: 'Atrasadas',
          valor: atrasadas.length ? `${atrasadas.length}` : 'nenhuma',
          tom: atrasadas.length ? 'atraso' : '',
          contexto: atrasadas.length
            ? `${fmtMoney(totAtrasado, { dec: 0 })} previstos sem crédito`
            : 'nada vencido',
        },
        /* liberado × executado (0016): o que a construtora está bancando */
        le
          ? {
              rotulo: 'Liberado × executado',
              valor: `${fmtPct(le.liberado, 0)} × ${fmtPct(le.executado, 0)}`,
              tom: le.bancando > 0.5 ? 'tom-alerta' : '',
              contexto:
                le.bancando > 0.5
                  ? `a construtora banca ${fmtMoney(le.bancando, { dec: 0 })}`
                  : le.adiantado > 0.5
                    ? `${fmtMoney(le.adiantado, { dec: 0 })} liberados à frente da obra`
                    : `${esc(le.financiador)} em dia com a obra`,
            }
          : null,
      ],
      { rotulo: 'Indicadores de recebimentos' },
    )}
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
          opcoes: [...new Set(o.recebimentos.map((r) => r.origem).filter(Boolean))].map((or) => [
            or,
            or,
            todosItens.filter((d) => d.r.origem === or).length,
          ]),
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
    })}
    ${painelAnalise([
      {
        titulo: 'A receber por mês',
        conteudo:
          porMes.length > 1
            ? graficoBarras(porMes, {
                formata: (v) => fmtMoneyCurto(v),
                cor: 'var(--serie1)',
                manterOrdem: true,
              })
            : '',
      },
    ])}
  </div>`;
};

VIEWS.recebimentos.toolbar = () => {
  const o = App.obra();
  if (!o || !o.recebimentos.length) return '';
  return (
    buscaToolbar('Buscar parcela', 'busca-recebimentos') +
    botaoNovo('Nova parcela', 'novo-recebimento')
  );
};
