/**
 * assistente.js — "Perguntar" (IA, 0028): as ferramentas que a IA chama
 * para responder sobre as obras. Rodam NO NAVEGADOR, sobre o estado já
 * carregado (o mesmo da tela, já filtrado pela RLS), e só chamam funções
 * de calculos.js: a IA nunca faz conta — ela lê o que estas funções
 * devolvem e redige. Nada aqui grava.
 *
 * Cada resultado é curto (no máximo 20 linhas), com os números já
 * formatados como na tela e a `tela` de onde saíram (vira o botão
 * "Abrir"). Texto que veio de gente (atividade, ocorrência, descrição) vai
 * limpo de e-mail, telefone, CPF/CNPJ e consulta de URL, e cortado.
 *
 * conversarComIa é o laço da conversa: manda a pergunta, roda as
 * ferramentas que a IA pedir e devolve a resposta final. `enviar` é quem
 * fala com a função `ia` (SUPA no app, a função direto na avaliação).
 */
import { fmtData, fmtMoney, fmtNum, fmtPct, hojeISO, isISO, norm, num } from '../nucleo/base.js';
import {
  basesContratuais,
  agendaObra,
  diarioIndicadores,
  efetivoDiario,
  etapaCalc,
  fluxoProjetado,
  kpisObra,
  lancamentoTotal,
  materialCalc,
  medicoesEmAberto,
  pendenciasObra,
  proximaParcelaFinanciador,
  resumoMateriais,
  resumoObra,
  resumoRecebimentos,
  saudeObra,
} from './calculos.js';

const MAX_LINHAS = 20;
const r$ = (v) => fmtMoney(num(v), { dec: 2 });
const pct = (v) => fmtPct(num(v), 0);
const data = (iso) => (isISO(iso) ? fmtData(iso) : '');

/* texto de gente: sem contato nem documento, e curto */
function limparTexto(s, max = 300) {
  const t = String(s || '')
    .replace(/[^\s@<>()'"]+@[^\s@<>()'"]+\.[a-z]{2,}/gi, '[e-mail]')
    .replace(/\b(https?:\/\/[^\s?#]+)[?#]\S*/g, '$1')
    .replace(/\(?\d{2}\)?\s?9?\d{4}-?\d{4}\b/g, '[telefone]')
    .replace(/\d(?:[.\-/ ]?\d){10,13}/g, '[documento]')
    .replace(/\s+/g, ' ')
    .trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

/* --------------------------------------------------------- achar obra */
function acharObras(estado, texto) {
  const obras = estado.obras || [];
  const t = norm(texto);
  if (!t) return [];
  const porId = obras.find((o) => o.id === texto);
  if (porId) return [porId];
  const nomeDe = (o) => norm([o.nome, o.cidade].filter(Boolean).join(' '));
  const exatas = obras.filter((o) => norm(o.nome) === t);
  if (exatas.length) return exatas;
  const palavras = t.split(/\s+/).filter((p) => p.length > 1);
  return obras.filter((o) => palavras.every((p) => nomeDe(o).includes(p)));
}

/* a obra do argumento: id ou nome; sem argumento, a obra aberta na tela */
function obraDe(estado, args, contexto) {
  const pedido = String((args && args.obra) || '').trim();
  if (!pedido) {
    const aberta =
      contexto && contexto.obraId && (estado.obras || []).find((o) => o.id === contexto.obraId);
    return aberta ? { obra: aberta } : { erro: 'Diga de qual obra.', opcoes: listaObras(estado) };
  }
  const achadas = acharObras(estado, pedido);
  if (achadas.length === 1) return { obra: achadas[0] };
  if (!achadas.length)
    return { erro: `Nenhuma obra com "${limparTexto(pedido, 60)}".`, opcoes: listaObras(estado) };
  return {
    erro: 'Mais de uma obra com esse nome.',
    opcoes: achadas.slice(0, 8).map((o) => o.nome),
  };
}
const listaObras = (estado) => (estado.obras || []).slice(0, 12).map((o) => o.nome);
const ref = (o, tela) => ({ obra: o.nome, obraId: o.id, tela });

/* ------------------------------------------------------- ferramentas */
const FERRAMENTAS = {
  achar_obra(estado, args) {
    const achadas = args && args.texto ? acharObras(estado, args.texto) : estado.obras || [];
    return {
      total: achadas.length,
      obras: achadas.slice(0, MAX_LINHAS).map((o) => ({
        obra: o.nome,
        obraId: o.id,
        cidade: o.cidade || '',
        situacao: o.status || '',
      })),
      tela: 'carteira',
    };
  },

  situacao_obra(estado, args, ctx) {
    const { obra: o, erro, opcoes } = obraDe(estado, args, ctx);
    if (erro) return { erro, opcoes };
    const r = resumoObra(o, ctx.hoje);
    const s = saudeObra(o, ctx.hoje);
    return {
      ...ref(o, 'painel'),
      situacao: o.status || '',
      saude: s.texto,
      fisicoRealizado: pct(r.fisico),
      fisicoPrevistoHoje: pct(r.fisicoPrevisto),
      atrasoDias: r.atrasoDias,
      fimContratual: data(o.previsaoConclusao),
      terminoProjetado: data(r.termino),
      caixaHoje: r$(r.caixaHoje),
      pendencias: r.pendencias.total,
      pendenciasCriticas: r.pendencias.criticas,
      proximaParcela: r.proximaParcela
        ? {
            valor: r$(r.proximaParcela.valor),
            data: data(r.proximaParcela.data),
            vencida: r.proximaParcela.vencida,
          }
        : null,
    };
  },

  pendencias(estado, args, ctx) {
    const obras = args && args.obra ? [obraDe(estado, args, ctx)] : null;
    if (obras && obras[0].erro) return obras[0];
    const lista = obras ? [obras[0].obra] : estado.obras || [];
    const itens = [];
    let total = 0;
    let criticas = 0;
    lista.forEach((o) => {
      const p = pendenciasObra(o);
      total += p.total;
      criticas += p.criticas;
      p.itens.forEach((a) =>
        itens.push({
          obra: o.nome,
          gravidade: a.sev >= 3 ? 'crítica' : 'atenção',
          titulo: limparTexto(a.titulo, 120),
          detalhe: limparTexto(a.detalhe, 160),
          tela: (a.ref && a.ref.view) || 'alertas',
        }),
      );
    });
    itens.sort((a, b) => (a.gravidade === b.gravidade ? 0 : a.gravidade === 'crítica' ? -1 : 1));
    return {
      total,
      criticas,
      itens: itens.slice(0, MAX_LINHAS),
      tela: 'alertas',
      ...(obras ? { obra: lista[0].nome, obraId: lista[0].id } : {}),
    };
  },

  cronograma(estado, args, ctx) {
    const { obra: o, erro, opcoes } = obraDe(estado, args, ctx);
    if (erro) return { erro, opcoes };
    const filtro = (args && args.filtro) || 'atrasadas';
    const etapas = (o.cronograma || []).map((e) => ({ e, c: etapaCalc(e, ctx.hoje) }));
    let lista = etapas;
    if (filtro === 'atrasadas')
      lista = etapas.filter(({ c }) => num(c.atraso) > 0 || num(c.atrasoInicio) > 0);
    if (filtro === 'em_andamento')
      lista = etapas.filter(({ c }) => num(c.progresso) > 0 && num(c.progresso) < 1);
    const proximos = filtro === 'proximas' ? agendaObra(o, ctx.hoje, 30) : [];
    return {
      ...ref(o, 'cronograma'),
      filtro,
      totalEtapas: etapas.length,
      quantidade: filtro === 'proximas' ? proximos.length : lista.length,
      etapas:
        filtro === 'proximas'
          ? proximos
              .slice(0, MAX_LINHAS)
              .map((a) => ({ data: data(a.data), oQue: limparTexto(a.texto, 120) }))
          : lista.slice(0, MAX_LINHAS).map(({ e, c }) => ({
              etapa: e.etapa,
              progresso: pct(c.progresso),
              inicioPrevisto: data(e.inicioPrevisto),
              fimPrevisto: data(e.fimPrevisto),
              diasDeAtraso: Math.max(num(c.atraso), num(c.atrasoInicio)),
              situacao: c.situacao,
            })),
    };
  },

  gastos(estado, args, ctx) {
    const a = args || {};
    let obras = estado.obras || [];
    let alvo = null;
    if (a.obra) {
      const r = obraDe(estado, a, ctx);
      if (r.erro) return r;
      alvo = r.obra;
      obras = [alvo];
    }
    const de = isISO(a.de) ? a.de : '';
    const ate = isISO(a.ate) ? a.ate : '';
    const busca = norm(a.busca || '');
    const linhas = [];
    obras.forEach((o) =>
      (o.lancamentos || []).forEach((l) => {
        if (de && (!l.data || l.data < de)) return;
        if (ate && (!l.data || l.data > ate)) return;
        if (busca && !norm([l.descricao, l.categoria, l.fornecedor].join(' ')).includes(busca))
          return;
        linhas.push({ o, l, v: lancamentoTotal(l) });
      }),
    );
    const agrupar = a.agrupar || 'categoria';
    const chave = ({ o, l }) =>
      agrupar === 'etapa'
        ? l.etapa || 'sem etapa'
        : agrupar === 'fornecedor'
          ? l.fornecedor || 'sem fornecedor'
          : agrupar === 'mes'
            ? (l.data || '').slice(0, 7) || 'sem data'
            : agrupar === 'obra'
              ? o.nome
              : l.categoria || l.tipo || 'sem categoria';
    const grupos = new Map();
    linhas.forEach((x) => {
      const k = chave(x);
      const g = grupos.get(k) || { total: 0, n: 0 };
      g.total += x.v;
      g.n += 1;
      grupos.set(k, g);
    });
    const total = linhas.reduce((s, x) => s + x.v, 0);
    return {
      ...(alvo ? ref(alvo, 'lancamentos') : { tela: 'lancamentos', obras: obras.length }),
      periodo: de || ate ? `${data(de) || 'início'} a ${data(ate) || 'hoje'}` : 'tudo',
      busca: a.busca ? limparTexto(a.busca, 60) : '',
      lancamentos: linhas.length,
      total: r$(total),
      agrupadoPor: agrupar,
      grupos: [...grupos.entries()]
        .sort((x, y) => y[1].total - x[1].total)
        .slice(0, MAX_LINHAS)
        .map(([nome, g]) => ({
          nome:
            agrupar === 'mes' && /^\d{4}-\d{2}$/.test(nome)
              ? `${nome.slice(5)}/${nome.slice(0, 4)}`
              : limparTexto(nome, 80),
          total: r$(g.total),
          lancamentos: g.n,
        })),
    };
  },

  materiais(estado, args, ctx) {
    const { obra: o, erro, opcoes } = obraDe(estado, args, ctx);
    if (erro) return { erro, opcoes };
    const r = resumoMateriais(o, ctx.hoje);
    const itens = (o.materiais || [])
      .map((m) => ({ m, c: materialCalc(o, m) }))
      .filter(({ c }) => num(c.saldo) > 0)
      .sort(
        (x, y) =>
          Number(y.c.travaFrente) - Number(x.c.travaFrente) ||
          num(y.c.saldoValor) - num(x.c.saldoValor),
      );
    return {
      ...ref(o, 'materiais'),
      faltaComprar: r$(r.faltaComprar),
      itensComSaldo: r.itensComSaldo,
      vencidos: r.vencidos,
      travandoEtapa: r.travando,
      itens: itens.slice(0, MAX_LINHAS).map(({ m, c }) => ({
        material: limparTexto(m.material, 80),
        etapa: m.etapa || '',
        falta: `${fmtNum(c.saldo, 2)} ${m.unidade || ''}`.trim(),
        valor: r$(c.saldoValor),
        precisaEm: data(m.dataNecessaria),
        travaEtapa: !!c.travaFrente,
        atrasado: !!c.vencido,
      })),
    };
  },

  contratos(estado, args, ctx) {
    const { obra: o, erro, opcoes } = obraDe(estado, args, ctx);
    if (erro) return { erro, opcoes };
    const busca = norm((args && args.prestador) || '');
    const bases = basesContratuais(o).filter(
      (b) => !busca || norm([b.prestador, b.escopo, b.base].join(' ')).includes(busca),
    );
    const abertas = medicoesEmAberto(o, ctx.hoje);
    return {
      ...ref(o, 'contratos'),
      contratos: bases.length,
      itens: bases.slice(0, MAX_LINHAS).map((b) => ({
        contrato: b.base,
        prestador: limparTexto(b.prestador, 80),
        escopo: limparTexto(b.escopo, 80),
        autorizado: r$(b.autorizado),
        medido: r$(b.medido),
        pago: r$(b.pago),
        saldo: r$(b.saldo),
        situacao: b.status,
      })),
      medicoesEmAberto: abertas.itens.length,
      valorEmAberto: r$(abertas.total),
      maisAntigaHaDias: abertas.maisAntiga ? abertas.maisAntiga.dias : 0,
    };
  },

  recebimentos(estado, args, ctx) {
    const obras = args && args.obra ? [obraDe(estado, args, ctx)] : null;
    if (obras && obras[0].erro) return obras[0];
    const lista = obras ? [obras[0].obra] : estado.obras || [];
    const linhas = [];
    let atrasado = 0;
    lista.forEach((o) => {
      const r = resumoRecebimentos(o, ctx.hoje);
      atrasado += num(r.totAtrasado);
      const prox = proximaParcelaFinanciador(o, ctx.hoje);
      r.pendentes.forEach((p) =>
        linhas.push({
          obra: o.nome,
          parcela: limparTexto([p.origem, p.etapaPci].filter(Boolean).join(' — '), 80),
          valor: r$(p.valorPrevisto),
          previstaPara: data(p.dataPrevista),
          atrasada: r.atrasadas.some((x) => x.id === p.id),
          situacao: p.status,
          proximaDoFinanciador: !!(prox && prox.r && prox.r.id === p.id),
        }),
      );
    });
    linhas.sort((a, b) =>
      String(a.previstaPara.split('/').reverse().join('')).localeCompare(
        b.previstaPara.split('/').reverse().join(''),
      ),
    );
    return {
      ...(obras ? ref(lista[0], 'recebimentos') : { tela: 'recebimentos', obras: lista.length }),
      aReceber: linhas.length,
      valorAtrasado: r$(atrasado),
      parcelas: linhas.slice(0, MAX_LINHAS),
    };
  },

  caixa(estado, args, ctx) {
    const obras = args && args.obra ? [obraDe(estado, args, ctx)] : null;
    if (obras && obras[0].erro) return obras[0];
    const lista = obras ? [obras[0].obra] : estado.obras || [];
    const porObra = lista.map((o) => {
      const f = fluxoProjetado(o, ctx.hoje);
      return {
        obra: o.nome,
        obraId: o.id,
        caixaHoje: r$(kpisObra(o).saldoCaixa),
        piorMomento: f.vale ? { data: data(f.vale.data), saldo: r$(f.vale.saldo) } : null,
        noFimDaObra: r$(f.saldoFinal),
        _caixa: kpisObra(o).saldoCaixa,
      };
    });
    const total = porObra.reduce((s, x) => s + num(x._caixa), 0);
    porObra.sort((a, b) => a._caixa - b._caixa);
    return {
      tela: 'fluxo',
      ...(obras
        ? { obra: lista[0].nome, obraId: lista[0].id }
        : { obras: lista.length, caixaHojeSomado: r$(total) }),
      porObra: porObra.slice(0, MAX_LINHAS).map(({ _caixa, ...x }) => x),
    };
  },

  diario(estado, args, ctx) {
    const { obra: o, erro, opcoes } = obraDe(estado, args, ctx);
    if (erro) return { erro, opcoes };
    const ate = isISO(args && args.ate) ? args.ate : ctx.hoje;
    const de = isISO(args && args.de) ? args.de : diasAntes(ate, 7);
    let regs = (o.diario || []).filter((d) => d.data >= de && d.data <= ate);
    const noPeriodo = regs.length;
    if (!regs.length)
      regs = [...(o.diario || [])].sort((a, b) => (a.data < b.data ? 1 : -1)).slice(0, 5);
    const ind = diarioIndicadores(o, ctx.hoje);
    return {
      ...ref(o, 'diario'),
      periodo: `${data(de)} a ${data(ate)}`,
      registrosNoPeriodo: noPeriodo,
      ultimoRegistro: data(ind.ultimo),
      diasSemRegistro: ind.semRegistroHa,
      ocorrenciasAbertas: ind.ocorrenciasAbertas,
      registros: regs
        .sort((a, b) => (a.data < b.data ? 1 : -1))
        .slice(0, 10)
        .map((d) => ({
          data: data(d.data),
          clima: d.clima || '',
          pessoas: efetivoDiario(d),
          etapa: d.etapa || '',
          atividades: limparTexto(d.atividades),
          ocorrencia: limparTexto(d.ocorrencias),
          ocorrenciaAberta: d.ocorrenciaStatus === 'aberta',
        })),
      aviso: noPeriodo ? '' : 'Nenhum registro no período; seguem os últimos registros.',
    };
  },

  comparar_obras(estado, args, ctx) {
    const criterio = (args && args.criterio) || 'risco';
    const linhas = (estado.obras || []).map((o) => {
      const r = resumoObra(o, ctx.hoje);
      const s = saudeObra(o, ctx.hoje);
      return {
        obra: o.nome,
        obraId: o.id,
        saude: s.texto,
        _ordem: s.ordem,
        atrasoDias: r.atrasoDias,
        fisicoRealizado: pct(r.fisico),
        _fisico: r.fisico,
        caixaHoje: r$(r.caixaHoje),
        _caixa: r.caixaHoje,
        pendenciasCriticas: r.pendencias.criticas,
      };
    });
    const ordem =
      {
        risco: (a, b) => a._ordem - b._ordem || b.atrasoDias - a.atrasoDias,
        atraso: (a, b) => b.atrasoDias - a.atrasoDias,
        caixa: (a, b) => a._caixa - b._caixa,
        avanco: (a, b) => b._fisico - a._fisico,
      }[criterio] || ((a, b) => a._ordem - b._ordem);
    return {
      tela: 'carteira',
      criterio,
      obras: linhas.length,
      ranking: linhas
        .sort(ordem)
        .slice(0, MAX_LINHAS)
        .map(({ _ordem, _fisico, _caixa, ...x }) => x),
    };
  },
};

function diasAntes(iso, n) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/* Roda uma ferramenta pedida pela IA. Nunca lança: ferramenta
   desconhecida ou erro vira { erro } para a IA dizer que não achou. */
function executarFerramenta(nome, args, estado, contexto = {}) {
  const fn = Object.prototype.hasOwnProperty.call(FERRAMENTAS, nome) ? FERRAMENTAS[nome] : null;
  if (!fn) return { erro: `Ferramenta desconhecida: ${String(nome).slice(0, 40)}.` };
  try {
    return fn(estado, args && typeof args === 'object' ? args : {}, {
      hoje: hojeISO(),
      ...contexto,
    });
  } catch (e) {
    return { erro: 'Não consegui ler esses dados agora.' };
  }
}
const NOMES_FERRAMENTAS = Object.keys(FERRAMENTAS);

/* --------------------------------------------------------- conversa */
/* A conversa inteira de uma pergunta. enviar(corpo) → resposta da função
   `ia`: { id, estado: 'ferramentas', mensagens, pedidos } ou
   { id, estado: 'resposta', resposta, seguro }. Devolve a resposta final
   e as telas das ferramentas usadas (para os botões "Abrir"). */
async function conversarComIa(pergunta, { enviar, estado, contexto = {}, maxVoltas = 6 }) {
  const telas = new Map();
  let r = await enviar({
    tarefa: 'pergunta',
    pergunta,
    contexto: resumoContexto(estado, contexto),
  });
  for (let i = 0; i < maxVoltas && r && r.estado === 'ferramentas'; i++) {
    const resultados = (r.pedidos || []).map((p) => {
      const saida = executarFerramenta(p.nome, p.args, estado, contexto);
      if (saida && saida.tela) {
        const chave = `${saida.tela}|${saida.obraId || ''}`;
        if (!telas.has(chave))
          telas.set(chave, {
            tela: saida.tela,
            obraId: saida.obraId || '',
            obra: saida.obra || '',
          });
      }
      return {
        type: 'tool_result',
        tool_use_id: p.id,
        content: JSON.stringify(saida).slice(0, 8000),
      };
    });
    r = await enviar({
      tarefa: 'pergunta',
      id: r.id,
      mensagens: [...r.mensagens, { role: 'user', content: resultados }],
    });
  }
  if (!r || r.estado !== 'resposta') {
    return {
      resposta: 'Não consegui terminar essa resposta. Tente perguntar de outro jeito.',
      seguro: false,
      telas: [],
    };
  }
  return { resposta: r.resposta, seguro: r.seguro !== false, telas: [...telas.values()], id: r.id };
}

/* o que vai junto da pergunta: a tela e a obra abertas (só nome e id) */
function resumoContexto(estado, contexto) {
  const o = contexto.obraId && (estado.obras || []).find((x) => x.id === contexto.obraId);
  return {
    tela: String(contexto.tela || '').slice(0, 40),
    obraId: o ? o.id : '',
    obraNome: o ? o.nome : '',
    hoje: contexto.hoje || hojeISO(),
    obras: (estado.obras || []).length,
  };
}

export { executarFerramenta, conversarComIa, resumoContexto, limparTexto, NOMES_FERRAMENTAS };
