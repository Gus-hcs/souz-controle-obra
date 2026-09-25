/**
 * telas/diario.js — Diário de obra, na linguagem nova.
 *
 * Os cartões (data, clima, atividades, fotos) já eram bons. Os números do
 * topo saem de diarioIndicadores (dominio/calculos.js): cobertura — dias
 * úteis com registro sobre dias úteis de obra — e dias impraticáveis, o
 * argumento concreto para aditivo de prazo.
 */
import {
  competencia,
  dataUriParaArquivo,
  esc,
  fmtCompetencia,
  fmtData,
  fmtDataCurta,
  fmtNum,
  fmtPct,
  hojeISO,
  isISO,
  norm,
  num,
} from '../../nucleo/base.js';
import { linkWhatsApp, normalizarTelefoneBR } from '../../nucleo/contato.js';
import { diaImpraticavel, diarioIndicadores, efetivoDiario } from '../../dominio/calculos.js';
import { Store } from '../../dados/store.js';
import { ACOES } from '../acoes.js';
import { App, botao, ICO, svg, toast } from '../shell.js';
import { VIEWS } from '../telas-obra.js';
import {
  acoesRegistro,
  barraFiltros,
  botaoNovo,
  buscaToolbar,
  faixaKpis,
  vazioTela,
} from './componentes.js';

function kpisDiario(ind, totFotos) {
  const cob = ind.cobertura;
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  return faixaKpis(
    [
      {
        chave: 'cobertura',
        rotulo: 'Cobertura do diário',
        valor: cob === null ? '—' : fmtPct(cob, 0),
        contexto: `${ind.diasComRegistro} de ${ind.diasUteis} dias úteis`,
        tom: cob === null ? '' : cob < 0.5 ? 'atraso' : cob < 0.8 ? 'tom-alerta' : '',
        filtra: false,
      },
      {
        chave: 'inativo',
        rotulo: 'Sem registro há',
        valor: ind.semRegistroHa === null ? '—' : plural(ind.semRegistroHa, 'dia', 'dias'),
        contexto:
          ind.semRegistroHa === null
            ? 'nenhuma visita registrada'
            : `último em ${fmtDataCurta(ind.ultimo)}`,
        tom:
          ind.semRegistroHa === null
            ? ''
            : ind.semRegistroHa > 7
              ? 'atraso'
              : ind.semRegistroHa > 2
                ? 'tom-alerta'
                : '',
        filtra: false,
      },
      {
        chave: 'impraticavel',
        rotulo: 'Dias impraticáveis',
        valor: ind.diasImpraticaveis,
        contexto: [
          ind.diasImpraticaveis ? 'base para aditivo de prazo' : 'nenhum registrado',
          ind.diasImpactoPrazo
            ? `${plural(ind.diasImpactoPrazo, 'dia', 'dias')} de impacto declarado${ind.diasImpactoPrazo === 1 ? '' : 's'}`
            : '',
        ]
          .filter(Boolean)
          .join(' · '),
      },
      {
        chave: 'foto',
        rotulo: 'Com foto',
        valor: totFotos,
        contexto: `${ind.comFoto} de ${plural(ind.registros, 'registro', 'registros')}`,
      },
      {
        chave: 'ocorrencia',
        rotulo: 'Ocorrências abertas',
        valor: ind.ocorrenciasAbertas,
        contexto: ind.ocorrenciasVencidas
          ? `${ind.ocorrenciasVencidas} com prazo vencido`
          : ind.ocorrenciasAbertas
            ? 'dentro do prazo'
            : ind.ocorrenciasResolvidas
              ? plural(ind.ocorrenciasResolvidas, 'resolvida', 'resolvidas')
              : 'nenhuma pendência',
        tom: ind.ocorrenciasVencidas ? 'atraso' : ind.ocorrenciasAbertas ? 'tom-alerta' : '',
      },
    ],
    { rotulo: 'Indicadores do diário', acao: 'diario-kpi', ativo: App.filtros.kpiDiario },
  );
}

ACOES['diario-kpi'] = (el, d) => {
  App.filtros.kpiDiario = App.filtros.kpiDiario === d.kpi ? '' : d.kpi;
  App.renderConteudo();
};

/* ------------------------------------------------- compartilhar (WhatsApp)
   Web Share API com as fotos anexadas quando o navegador suporta (celular,
   normalmente); sem suporte, abre a conversa só com o texto — wa.me não
   aceita anexo por link, então as fotos ficam de fora nesse caminho. */
ACOES['whatsapp-diario'] = async (el, d) => {
  const o = App.obra();
  const reg = o.diario.find((x) => x.id === d.id);
  if (!reg) return;
  const cliente = Store.estado.clientes.find((c) => c.id === o.clienteId);
  const numero = cliente ? normalizarTelefoneBR(cliente.telefone) : null;

  const texto = [
    `Diário de obra — ${o.nome}`,
    `${fmtData(reg.data)}${reg.clima ? ' · ' + reg.clima : ''}`,
    reg.atividades ? `Atividades: ${reg.atividades}` : '',
    reg.ocorrencias ? `Ocorrências: ${reg.ocorrencias}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const arquivos = (reg.fotos || [])
    .slice(0, 8)
    .map((foto, i) => dataUriParaArquivo(foto.dados, foto.nome || `foto-${i + 1}.jpg`))
    .filter(Boolean);

  if (arquivos.length && navigator.canShare && navigator.canShare({ files: arquivos })) {
    try {
      await navigator.share({ files: arquivos, title: `Diário ${fmtData(reg.data)}`, text: texto });
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return;
    }
  } else if (!arquivos.length && navigator.share) {
    try {
      await navigator.share({ title: `Diário ${fmtData(reg.data)}`, text: texto });
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return;
    }
  }

  const aviso = arquivos.length ? '\n\n(fotos: abra o registro no app para enviar as imagens)' : '';
  window.open(linkWhatsApp(numero || '', texto + aviso), '_blank', 'noopener');
  if (!numero) {
    toast(
      'Abra o WhatsApp e escolha o contato — não achei um telefone válido para o cliente.',
      'aviso',
    );
  }
};

/* --------------------------------------------------------------- cartão */
/* Ocorrência como pendência (0015): quem, até quando, e o botão de
   resolver sem abrir o formulário. */
function linhaPendencia(d) {
  if (d.ocorrenciaStatus === 'resolvida') {
    return `<span class="pendencia-diario feito">Resolvida${isISO(d.ocorrenciaResolvidaEm) ? ` em ${esc(fmtData(d.ocorrenciaResolvidaEm))}` : ''}</span>`;
  }
  if (d.ocorrenciaStatus !== 'aberta') return '';
  const vencida = isISO(d.ocorrenciaPrazo) && d.ocorrenciaPrazo < hojeISO();
  const partes = [
    'Pendência aberta',
    d.ocorrenciaResponsavel ? `com ${esc(d.ocorrenciaResponsavel)}` : 'sem responsável',
    isISO(d.ocorrenciaPrazo) ? `prazo ${esc(fmtData(d.ocorrenciaPrazo))}${vencida ? ' — vencido' : ''}` : '',
  ].filter(Boolean);
  return `<span class="pendencia-diario ${vencida ? 'atraso' : 'tom-alerta'}">${partes.join(' · ')}
    ${Store.somenteLeitura() ? '' : botao('Marcar resolvida', 'resolver-ocorrencia', { id: d.id }, 'btn sutil pequeno')}</span>`;
}

function cartaoRegistro(d) {
  /* clima por turno (0017), quando informado; senão, o do dia */
  const clima = d.climaManha || d.climaTarde
    ? `manhã ${d.climaManha || '—'} · tarde ${d.climaTarde || '—'}`
    : d.clima;
  const efetivo = efetivoDiario(d);
  const meta = [clima, d.etapa || null, efetivo ? `${fmtNum(efetivo, 0)} na obra` : null]
    .filter(Boolean)
    .join(' · ');
  const funcoes = (d.efetivoFuncoes || []).map((f) => `${f.funcao} ${f.qtd}`).join(', ');
  const campo = [
    funcoes ? `<b>Efetivo</b> — ${esc(funcoes)}` : '',
    d.equipamentos ? `<b>Equipamentos</b> — ${esc(d.equipamentos)}` : '',
    num(d.progressoEtapa) > 0 ? `<b>${esc(d.etapa || 'Etapa')}</b> em ${fmtPct(d.progressoEtapa, 0)} ao fim do dia` : '',
  ].filter(Boolean);
  const fotos =
    d.fotos && d.fotos.length
      ? `<div class="fotos-diario">${d.fotos
          .map(
            (foto, i) =>
              `<img src="${foto.dados}" alt="${esc(foto.nome || 'Foto da obra')}" loading="lazy" data-acao="ver-foto" data-id="${esc(d.id)}" data-idx="${i}">`,
          )
          .join('')}</div>`
      : '';
  return `<article class="registro-diario">
    <header>
      <div class="cel-obra"><b>${esc(fmtData(d.data))}</b><span>${esc(meta || 'sem detalhes de clima/efetivo')}</span></div>
      <span class="acoes-diario">
        <button class="btn sutil icone pequeno" data-acao="whatsapp-diario" data-id="${esc(d.id)}"
          title="Compartilhar por WhatsApp" aria-label="Compartilhar registro de ${esc(fmtData(d.data))} por WhatsApp">${svg(ICO.whatsapp, 13)}</button>
        ${acoesRegistro('diario', d.id, 'registro de ' + fmtData(d.data))}
      </span>
    </header>
    <div class="corpo-diario">
      ${d.atividades ? `<p style="margin:0"><b>Atividades</b> — ${esc(d.atividades)}</p>` : ''}
      ${campo.length ? `<p class="tinta2" style="margin:0;font-size:var(--t-peq)">${campo.join(' · ')}</p>` : ''}
      ${d.impactaPrazo ? `<p class="atraso" style="margin:0;font-size:var(--t-peq)"><b>Impacta o prazo</b>${num(d.diasImpacto) ? ` — ${num(d.diasImpacto)} dia${num(d.diasImpacto) === 1 ? '' : 's'}` : ''}</p>` : ''}
      ${d.ocorrencias ? `<p class="tom-alerta" style="margin:0"><b>Ocorrências</b> — ${esc(d.ocorrencias)}</p>` : ''}
      ${linhaPendencia(d)}
      ${fotos}
      ${d.autor ? `<span class="tinta3" style="font-size:var(--t-peq)">registrado por ${esc(d.autor)}</span>` : ''}
    </div>
  </article>`;
}

/* ---------------------------------------------------------------- tela */
VIEWS.diario = () => {
  const o = App.obra();

  if (!o.diario.length) {
    return vazioTela({
      titulo: 'Sem registros',
      texto:
        'Documente cada visita: clima, efetivo, o que foi executado, ocorrências e fotos. Serve como prova documental e memória da obra.',
      acao: botao('Novo registro', 'novo-diario', {}, 'btn primario', 'mais'),
    });
  }

  const f = App.filtros;
  const todos = o.diario;
  const ordenados = todos.slice().sort((a, b) => String(b.data).localeCompare(String(a.data)));
  const ind = diarioIndicadores(o);
  const totFotos = todos.reduce((s, d) => s + (d.fotos ? d.fotos.length : 0), 0);
  const etapasUsadas = [...new Set(todos.map((d) => d.etapa).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'pt'),
  );
  const meses = [...new Set(todos.map((d) => competencia(d.data)).filter(Boolean))]
    .sort()
    .reverse();

  const busca = norm(f.busca || '');
  let itens = ordenados;
  if (f.etapa) itens = itens.filter((d) => d.etapa === f.etapa);
  if (f.mes) itens = itens.filter((d) => competencia(d.data) === f.mes);
  if (f.situacao === 'chuva') itens = itens.filter((d) => d.clima && d.clima.includes('Chuva'));
  if (f.kpiDiario === 'foto') itens = itens.filter((d) => d.fotos && d.fotos.length);
  if (f.kpiDiario === 'impraticavel') itens = itens.filter(diaImpraticavel);
  if (f.kpiDiario === 'ocorrencia') itens = itens.filter((d) => d.ocorrenciaStatus === 'aberta');
  if (busca)
    itens = itens.filter((d) =>
      norm(`${d.atividades} ${d.ocorrencias} ${d.autor} ${d.etapa}`).includes(busca),
    );

  /* dia de chuva em pílula; etapa e mês no "Mais filtros" */
  const barra =
    todos.length > 1
      ? barraFiltros({
          pilulas: {
            chave: 'situacao',
            todos: 'Todos os registros',
            total: todos.length,
            opcoes: [
              {
                valor: 'chuva',
                rotulo: 'Dia de chuva',
                n: todos.filter((d) => d.clima && d.clima.includes('Chuva')).length,
              },
            ],
          },
          mais: [
            {
              chave: 'etapa',
              rotulo: 'Etapa',
              todos: 'Todas as etapas',
              opcoes: etapasUsadas.map((e) => [e, e, todos.filter((d) => d.etapa === e).length]),
            },
            {
              chave: 'mes',
              rotulo: 'Mês',
              todos: 'Todos os meses',
              opcoes: meses.map((ym) => [
                ym,
                fmtCompetencia(ym),
                todos.filter((d) => competencia(d.data) === ym).length,
              ]),
            },
          ],
          filtrados: itens.length,
          total: todos.length,
        })
      : '';

  /* Registrar hoje em destaque enquanto o dia não tem registro — é a ação
     que o mestre de obra abre a tela para fazer. */
  const semHoje = ind.ultimo !== hojeISO();
  return `<div class="tela-lista">
    ${
      semHoje
        ? `<div class="registrar-hoje">${botao('Registrar hoje', 'novo-diario', {}, 'btn primario', 'mais')}
            <span class="tinta2">${ind.semRegistroHa === null ? 'Nenhum registro ainda.' : `Último registro há ${ind.semRegistroHa} dia${ind.semRegistroHa === 1 ? '' : 's'}.`}</span></div>`
        : ''
    }
    ${kpisDiario(ind, totFotos)}
    ${barra}
    ${
      itens.length
        ? `<div class="feed-diario">${itens.map(cartaoRegistro).join('')}</div>`
        : `<p class="tinta2" style="text-align:center;padding:var(--e10) 0">Nada com esse filtro.</p>`
    }
  </div>`;
};

VIEWS.diario.toolbar = () => {
  const o = App.obra();
  if (!o || !o.diario.length) return '';
  return `${buscaToolbar('Buscar atividade, ocorrência, autor…', 'busca-diario')}
    ${botaoNovo('Novo registro', 'novo-diario')}`;
};
