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
import { diaImpraticavel, diarioIndicadores } from '../../dominio/calculos.js';
import { Store } from '../../dados/store.js';
import { ACOES } from '../acoes.js';
import { App, botao, ICO, svg, toast } from '../shell.js';
import { VIEWS } from '../telas-obra.js';
import {
  acoesRegistro,
  barraFiltros,
  botaoNovo,
  buscaToolbar,
  seletor,
  vazioTela,
} from './componentes.js';

function kpisDiario(ind, totFotos) {
  const item = (chave, rotulo, valor, contexto, tom = '', filtravel = false) => {
    const ativo = filtravel && App.filtros.kpiDiario === chave;
    return `<div class="kpi-item${ativo ? ' ativo' : ''}"${filtravel ? ` data-acao="diario-kpi" data-kpi="${chave}" role="button" tabindex="0" aria-pressed="${ativo}" title="Filtrar a lista"` : ''}>
      <span class="kpi-rot">${esc(rotulo)}</span>
      <span class="kpi-val${tom ? ' ' + tom : ''}">${valor}</span>
      <span class="kpi-ctx">${contexto}</span>
    </div>`;
  };
  const cob = ind.cobertura;

  return `<div class="kpis" role="group" aria-label="Indicadores do diário">
    ${item(
      'cobertura',
      'Cobertura do diário',
      cob === null ? '—' : fmtPct(cob, 0),
      `${ind.diasComRegistro} de ${ind.diasUteis} dias úteis`,
      cob === null ? '' : cob < 0.5 ? 'atraso' : cob < 0.8 ? 'tom-alerta' : '',
    )}
    ${item(
      'inativo',
      'Sem registro há',
      ind.semRegistroHa === null ? '—' : `${ind.semRegistroHa} dia${ind.semRegistroHa === 1 ? '' : 's'}`,
      ind.semRegistroHa === null ? 'nenhuma visita registrada' : `último em ${fmtDataCurta(ind.ultimo)}`,
      ind.semRegistroHa === null ? '' : ind.semRegistroHa > 7 ? 'atraso' : ind.semRegistroHa > 2 ? 'tom-alerta' : '',
    )}
    ${item(
      'impraticavel',
      'Dias impraticáveis',
      ind.diasImpraticaveis,
      ind.diasImpraticaveis ? 'base para aditivo de prazo' : 'nenhum registrado',
      '',
      true,
    )}
    ${item('foto', 'Com foto', totFotos, `${ind.comFoto} de ${ind.registros} registro${ind.registros === 1 ? '' : 's'}`, '', true)}
    ${item(
      'ocorrencia',
      'Ocorrências abertas',
      ind.ocorrenciasAbertas,
      ind.ocorrenciasVencidas
        ? `${ind.ocorrenciasVencidas} com prazo vencido`
        : ind.ocorrenciasResolvidas
          ? `${ind.ocorrenciasResolvidas} resolvida${ind.ocorrenciasResolvidas === 1 ? '' : 's'}`
          : 'nenhuma pendência',
      ind.ocorrenciasVencidas ? 'atraso' : ind.ocorrenciasAbertas ? 'tom-alerta' : '',
      true,
    )}
  </div>`;
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
  const meta = [d.clima, d.etapa || null, num(d.efetivo) ? `${fmtNum(d.efetivo, 0)} na obra` : null]
    .filter(Boolean)
    .join(' · ');
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

  const barra = barraFiltros({
    mostrar: todos.length > 1,
    controles: [
      etapasUsadas.length > 1 ? seletor('etapa', etapasUsadas, 'Todas as etapas') : '',
      meses.length > 1
        ? seletor(
            'mes',
            meses.map((ym) => [ym, fmtCompetencia(ym)]),
            'Todos os meses',
          )
        : '',
      seletor('situacao', [['chuva', 'Dia de chuva']], 'Todos os registros'),
    ],
    filtrados: itens.length,
    total: todos.length,
  });

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
