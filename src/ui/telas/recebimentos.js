/**
 * telas/recebimentos.js — Recebimentos (CAIXA, cliente, recursos próprios).
 *
 * Em ordem de data prevista, porque é assim que se cobra: o que vence
 * primeiro vem primeiro. Parcela atrasada é a única coisa vermelha da
 * tela — e diz há quantos dias.
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
  round2,
} from '../../nucleo/base.js';
import { kpisObra, recebimentoDiferenca } from '../../dominio/calculos.js';
import { graficoBarras } from '../../graficos/index.js';
import { App, botao, opcoesLista } from '../shell.js';
import { VIEWS } from '../telas-obra.js';
import {
  acoesRegistro,
  barraFiltros,
  botaoNovo,
  buscaToolbar,
  dinheiro,
  filtrando,
  lista,
  resumo,
  secao,
  seletor,
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

  const atrasadas = o.recebimentos.filter(atrasada);
  const totAtrasado = atrasadas.reduce((s, r) => s + num(r.valorPrevisto), 0);
  const pendentes = o.recebimentos.filter(naoRecebido);
  const tDescontos = o.recebimentos.reduce((s, r) => s + num(r.descontos), 0);

  /* ------------------------------------------------------- filtros */
  const meses = [
    ...new Set(o.recebimentos.map((r) => competencia(r.dataPrevista)).filter(Boolean)),
  ].sort();
  const busca = norm(f.busca || '');
  let itens = o.recebimentos.map((r) => ({ r, dif: recebimentoDiferenca(r), atr: atrasada(r) }));
  if (f.origem) itens = itens.filter((d) => d.r.origem === f.origem);
  if (f.status) itens = itens.filter((d) => d.r.status === f.status);
  if (f.mes) itens = itens.filter((d) => competencia(d.r.dataPrevista) === f.mes);
  if (f.situacao === 'receber') itens = itens.filter((d) => naoRecebido(d.r));
  if (f.situacao === 'recebidas')
    itens = itens.filter((d) => d.r.status === 'Recebido' || d.r.status === 'Recebido parcial');
  if (f.situacao === 'atrasadas') itens = itens.filter((d) => d.atr);
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
        if (d.atr) {
          const dias = diasEntre(d.r.dataPrevista, hoje);
          return `<span class="atraso">${dias} dia${dias === 1 ? '' : 's'} de atraso</span>`;
        }
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

  const porMes = meses
    .map((ym) => ({
      rotulo: fmtCompetencia(ym),
      valor: round2(
        o.recebimentos
          .filter((r) => naoRecebido(r) && competencia(r.dataPrevista) === ym)
          .reduce((s, r) => s + num(r.valorPrevisto), 0),
      ),
    }))
    .filter((x) => x.valor > 0.005);

  return `<div class="tela-lista">
    ${resumo([
      {
        rotulo: 'Recebido',
        valor: fmtMoney(k.recebido, { dec: 0 }),
        /* O % é só do financiador: dinheiro do cliente entra no caixa, mas
           não é liberação do financiamento. */
        nota:
          k.liberadoFinanciamento !== null
            ? `financiamento: ${fmtPct(k.liberadoFinanciamento, 1)} de ${fmtMoney(k.financiado, { dec: 0 })} liberados${k.recebidoProprio > 0.005 ? ` · próprios ${fmtMoney(k.recebidoProprio, { dec: 0 })}` : ''}`
            : 'financiamento, cliente e próprios',
      },
      {
        rotulo: 'A receber',
        valor: fmtMoney(k.previstoNaoRecebido, { dec: 0 }),
        nota: `${pendentes.length} parcela${pendentes.length === 1 ? '' : 's'} pendente${pendentes.length === 1 ? '' : 's'}`,
      },
      {
        rotulo: 'Atrasadas',
        valor: atrasadas.length ? `${atrasadas.length}` : 'nenhuma',
        tom: atrasadas.length ? 'atraso' : '',
        nota: atrasadas.length
          ? `${fmtMoney(totAtrasado, { dec: 0 })} previstos sem crédito`
          : 'nada vencido',
      },
      tDescontos > 0.005
        ? {
            rotulo: 'Descontos e tarifas',
            valor: fmtMoney(tDescontos, { dec: 0 }),
            nota: 'retidos na liberação',
          }
        : null,
    ])}
    ${barraFiltros({
      mostrar:
        o.recebimentos.length > 1 || filtrando(['origem', 'status', 'mes', 'situacao', 'busca']),
      filtrados: itens.length,
      total: o.recebimentos.length,
      controles: [
        seletor('origem', opcoesLista('origensRecebimento'), 'Todas as origens'),
        seletor('status', opcoesLista('statusRecebimento'), 'Todos os status'),
        seletor(
          'situacao',
          [
            ['receber', 'A receber'],
            ['recebidas', 'Recebidas'],
            ['atrasadas', 'Atrasadas'],
          ],
          'Qualquer situação',
        ),
        meses.length > 1
          ? seletor(
              'mes',
              meses.map((ym) => [ym, fmtCompetencia(ym)]),
              'Todos os meses',
            )
          : '',
      ],
    })}
    ${lista({
      id: 'recebimentos',
      testid: 'lista-recebimentos',
      colunas,
      itens,
      ordemPadrao: { col: 'data', dir: 1 },
      rodapeRotulo: (n) => `${n} parcelas`,
    })}
    ${porMes.length > 1 ? secao('A receber por mês', graficoBarras(porMes, { formata: (v) => fmtMoneyCurto(v), cor: 'var(--serie1)' })) : ''}
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
