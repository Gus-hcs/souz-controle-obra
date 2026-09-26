/**
 * telas/obra-config.js — Configuração da obra, na linguagem nova.
 *
 * O formulário longo (20+ campos numa página só) vira três seções
 * recolhíveis — Identificação, Prazo, Financeiro e contrato — com
 * <details>/<summary> nativos, o mesmo recurso já usado no escopo MCMV
 * desta tela. Sem JS novo, sem estado de aba pra guardar. Prazo e
 * Financeiro vêm abertos: são o que mais se confere.
 *
 * No topo, as incoerências (incoerenciasObra): teto abaixo da
 * empreitada, entrega antes do fim do cronograma, fontes que não cobrem
 * o custo, situação marcada diferente da calculada.
 */
import {
  esc,
  fmtMoney,
  fmtNum,
  fmtPct,
  num,
  PADROES_ACABAMENTO,
  SISTEMAS_CONSTRUTIVOS,
} from '../../nucleo/base.js';
import {
  empreitadaPrincipal,
  incoerenciasObra,
  kpisObra,
  situacaoObraCalculada,
} from '../../dominio/calculos.js';
import {
  App,
  abrirForm,
  botao,
  campoHTML,
  confirmar,
  fecharModal,
  ICO,
  lerForm,
  opcoesLista,
  svg,
  toast,
} from '../shell.js';
import { Store, mutar } from '../../dados/store.js';
import { apenasErros, validarObra } from '../../dominio/validacao.js';
import { SUPA } from '../../dados/supabase.js';
import { ACOES } from '../acoes.js';
import { VIEWS } from '../telas-obra.js';
import { faixaKpis } from './componentes.js';

function kpisConfig(o, k) {
  const alvo = num(o.fin.margemDesejada);
  return faixaKpis(
    [
      {
        rotulo: 'Empreitada principal',
        valor: fmtMoney(empreitadaPrincipal(o), { dec: 0 }),
        contexto: num(o.areaConstruida)
          ? `${fmtNum(o.areaConstruida, 2)} m² × ${fmtMoney(o.fin.precoEmpreitadaM2, { dec: 0 })}/m²`
          : 'informe a área construída',
      },
      {
        rotulo: 'Custo previsto total',
        valor: fmtMoney(k.custoPrevisto, { dec: 0 }),
        contexto: `obra física ${fmtMoney(k.custoFisicoPrevisto, { dec: 0 })} · terreno, taxas e comissão ${fmtMoney(k.custoNaoFisico, { dec: 0 })}`,
      },
      {
        rotulo: 'Resultado projetado',
        valor: k.resultado === null ? '—' : fmtMoney(k.resultado, { dec: 0 }),
        contexto:
          k.margem === null
            ? 'informe o valor de venda'
            : `margem de ${fmtPct(k.margem)}${alvo ? ` · alvo ${fmtPct(alvo)}` : ''}`,
        tom: k.margem === null ? '' : k.margem < alvo ? 'tom-alerta' : '',
      },
    ],
    { rotulo: 'Indicadores da configuração' },
  );
}

/* Seções do formulário. Grade da página (padrao.css): 4 colunas a partir
   de 1440px, 2 de 768 a 1439px, 1 no celular — todo campo ocupa 1 coluna
   (c3); só o Endereço é largo (2 colunas; a linha toda na grade de 2) e as
   Observações ocupam a linha inteira. As contas fecham sem buraco:
   Identificação = 12 colunas + Observações; Valores = 8. "Prazo" (2) e
   "Financiamento" (3) são curtas: ficam lado a lado (par: true), na
   proporção 2:3, com a mesma altura. */
const SECOES = [
  {
    titulo: 'Identificação',
    aberta: true,
    campos: (clientes) => [
      { k: 'nome', label: 'Nome da obra', tipo: 'texto', col: 3, obrigatorio: true },
      {
        k: 'clienteId',
        label: 'Cliente',
        tipo: 'select',
        opcoes: clientes,
        col: 3,
        placeholder: 'sem cliente',
      },
      {
        k: 'status',
        label: 'Situação',
        tipo: 'select',
        opcoes: opcoesLista('statusObra'),
        col: 3,
        vazio: false,
        dica: `pelos dados: ${situacaoObraCalculada(App.obra())} — marque à mão só "Paralisada"`,
      },
      { k: 'cidade', label: 'Cidade/UF', tipo: 'texto', col: 3 },
      { k: 'endereco', label: 'Endereço', tipo: 'texto', col: 6, largo: true },
      { k: 'areaConstruida', label: 'Área construída (m²)', tipo: 'numero', col: 3 },
      { k: 'areaMuro', label: 'Área de muro (m²)', tipo: 'numero', col: 3 },
      { k: 'sistema', label: 'Sistema construtivo', tipo: 'lista', opcoes: SISTEMAS_CONSTRUTIVOS, col: 3 },
      {
        k: 'padrao',
        label: 'Padrão de acabamento',
        tipo: 'select',
        opcoes: PADROES_ACABAMENTO,
        placeholder: 'não informado',
        col: 3,
      },
      { k: 'responsavel', label: 'Responsável técnico', tipo: 'texto', col: 3,
        dica: 'sai nos relatórios desta obra; vazio, vale o da empresa' },
      { k: 'creaCau', label: 'CREA/CAU do responsável', tipo: 'texto', col: 3 },
      { k: 'observacoes', label: 'Observações', tipo: 'area', col: 12 },
    ],
  },
  {
    titulo: 'Prazo',
    aberta: true,
    par: true,
    campos: () => [
      { k: 'dataInicio', label: 'Data de início', tipo: 'data', col: 6 },
      { k: 'previsaoConclusao', label: 'Data contratual de entrega', tipo: 'data', col: 6 },
    ],
  },
  {
    titulo: 'Financiamento',
    aberta: true,
    par: true,
    campos: () => [
      /* qualquer financiador (0016) — as telas usam este nome */
      { k: 'fin.financiador', label: 'Financiador', tipo: 'lista', col: 4,
        opcoes: ['CAIXA', 'Banco do Brasil', 'Itaú', 'Bradesco', 'Santander', 'Consórcio', 'Cliente (por marco)'],
        dica: 'quem libera o dinheiro por avanço de obra' },
      { k: 'fin.dataAssinatura', label: 'Data da assinatura', tipo: 'data', col: 4 },
      /* largo: na grade de 2 colunas fica sozinho na linha, e a seção fecha sem buraco */
      { k: 'fin.contratoCaixa', label: 'Nº do contrato de financiamento', tipo: 'texto', col: 4, largo: true },
    ],
  },
  {
    titulo: 'Valores',
    aberta: true,
    campos: () => [
      { k: 'fin.saldoInicial', label: 'Saldo inicial da obra', tipo: 'dinheiro', col: 3 },
      { k: 'fin.valorTerreno', label: 'Valor do terreno', tipo: 'dinheiro', col: 3 },
      { k: 'fin.valorFinanciado', label: 'Financiado para obra', tipo: 'dinheiro', col: 3 },
      { k: 'fin.recursosProprios', label: 'Recursos próprios previstos', tipo: 'dinheiro', col: 3 },
      { k: 'fin.precoEmpreitadaM2', label: 'Preço empreitada/m²', tipo: 'dinheiro', col: 3 },
      {
        k: 'fin.custoFisicoMaxM2',
        label: 'Custo físico máximo/m²',
        tipo: 'dinheiro',
        col: 3,
        dica: 'só obra física: sem terreno, taxas, honorário e comissão. Referência: CUB do Sinduscon da região',
      },
      { k: 'fin.valorVenda', label: 'Valor de venda/contrato', tipo: 'dinheiro', col: 3 },
      { k: 'fin.margemDesejada', label: 'Margem desejada (%)', tipo: 'pct', col: 3 },
    ],
  },
];

/* ---------------------------------------------------------- equipe (0014)
   Só o dono vê e mexe (a função convidar_membro confere de novo no
   banco). membros_da_obra() traz o e-mail — sem ela só daria pra ver o
   UUID, ilegível na tela. */
const Equipe = { obraId: '', linhas: null, erro: '', carregando: false };

function carregarEquipe(obraId, forcar = false) {
  if (Equipe.carregando) return;
  if (!forcar && Equipe.obraId === obraId && (Equipe.linhas || Equipe.erro)) return;
  Equipe.obraId = obraId;
  Equipe.linhas = null;
  Equipe.erro = '';
  Equipe.carregando = true;
  SUPA.lerMembros(obraId)
    .then((linhas) => {
      Equipe.linhas = linhas;
    })
    .catch((e) => {
      Equipe.erro = String((e && e.message) || e);
    })
    .finally(() => {
      Equipe.carregando = false;
      if (App.rota.view === 'obra-config' && App.obra() && App.obra().id === obraId) {
        App.renderConteudo();
      }
    });
}

function equipeHTML(o) {
  carregarEquipe(o.id);
  if (Equipe.carregando && !Equipe.linhas) {
    return '<p class="linha-cinza">Carregando…</p>';
  }
  if (Equipe.erro) {
    const faltaFuncao = /convidar_membro|membros_da_obra|does not exist|schema cache/i.test(
      Equipe.erro,
    );
    return `<p class="linha-cinza">${
      faltaFuncao
        ? 'Convite por e-mail ainda não ativado. Aplique db/migracoes/0014_convite_por_email.sql no Supabase.'
        : esc(Equipe.erro)
    }</p>
      ${botao('Tentar de novo', 'equipe-recarregar', { obra: o.id }, 'btn sutil pequeno')}`;
  }
  const linhas = Equipe.linhas || [];
  if (!linhas.length) return '<p class="linha-cinza">Só você por enquanto.</p>';
  return `<table class="mini-tab"><thead><tr><th>Pessoa</th><th>Papel</th><th></th></tr></thead>
    <tbody>${linhas
      .map(
        (m) => `<tr>
      <td>${esc(m.email)}${m.papel === 'dono' ? ' <span class="tinta3">(você)</span>' : ''}</td>
      <td>${
        m.papel === 'dono'
          ? 'Dono'
          : `<select data-acao="equipe-papel" data-id="${esc(m.id)}" aria-label="Papel de ${esc(m.email)}">
            <option value="engenheiro" ${m.papel === 'engenheiro' ? 'selected' : ''}>Engenheiro</option>
            <option value="cliente" ${m.papel === 'cliente' ? 'selected' : ''}>Cliente</option>
          </select>`
      }</td>
      <td>${
        m.papel === 'dono'
          ? ''
          : `<button class="btn sutil icone pequeno" data-acao="equipe-remover" data-id="${esc(m.id)}"
          title="Remover" aria-label="Remover ${esc(m.email)}">${svg(ICO.lixo, 13)}</button>`
      }</td>
    </tr>`,
      )
      .join('')}</tbody></table>`;
}

ACOES['equipe-convidar'] = (el, d) => {
  abrirForm({
    titulo: 'Convidar para a obra',
    campos: [
      {
        k: 'email',
        label: 'E-mail',
        tipo: 'texto',
        col: 12,
        obrigatorio: true,
        dica: 'a pessoa precisa já ter uma conta no sistema — não há e-mail de convite',
      },
      {
        k: 'papel',
        label: 'Papel',
        tipo: 'select',
        vazio: false,
        opcoes: [
          { v: 'engenheiro', t: 'Engenheiro — lança, mede, edita' },
          { v: 'cliente', t: 'Cliente — só acompanha (leitura)' },
        ],
        col: 12,
      },
    ],
    valores: { papel: 'engenheiro' },
    aoSalvar: async (dados) => {
      try {
        await SUPA.convidarMembro(d.obra, dados.email, dados.papel);
        fecharModal();
        toast('Convite gravado — a pessoa vê a obra no próximo login.', 'ok');
        carregarEquipe(d.obra, true);
      } catch (e) {
        toast(String((e && e.message) || e), 'critico');
      }
    },
  });
};

ACOES['equipe-papel'] = async (el, d) => {
  const o = App.obra();
  try {
    await SUPA.alterarPapelMembro(d.id, el.value);
    toast('Papel atualizado.', 'ok');
    carregarEquipe(o.id, true);
  } catch (e) {
    toast(String((e && e.message) || e), 'critico');
  }
};

ACOES['equipe-remover'] = (el, d) => {
  const o = App.obra();
  confirmar(
    'Remover da equipe',
    'Remover esta pessoa da obra? Ela perde o acesso no próximo login.',
    async () => {
      try {
        await SUPA.removerMembro(d.id);
        toast('Removido da equipe.', 'ok');
        carregarEquipe(o.id, true);
      } catch (e) {
        toast(String((e && e.message) || e), 'critico');
      }
    },
    'Remover',
  );
};

ACOES['equipe-recarregar'] = (el, d) => carregarEquipe(d.obra, true);

/* "Confira:" — as incoerências da configuração (incoerenciasObra) */
function avisosConfig(o) {
  const incoerencias = incoerenciasObra(o);
  return incoerencias.length
    ? `<div class="aviso-linha" role="status" style="margin-bottom:var(--e3)"><b>Confira:</b>
        <ul style="margin:var(--e1) 0 0;padding-left:var(--e5)">${incoerencias.map((x) => `<li>${esc(x.texto)}</li>`).join('')}</ul></div>`
    : '';
}

/* ---------------------------------------------------------------- tela */
VIEWS['obra-config'] = () => {
  const o = App.obra();
  const clientes = Store.estado.clientes.map((c) => ({ v: c.id, t: c.nome }));
  const k = kpisObra(o);
  /* MCMV é programa de financiamento, não padrão de acabamento: o quadro
     do escopo aparece quando a obra é financiada */
  const mcmv = o.fin.contratoCaixa || num(o.fin.valorFinanciado) > 0;

  const ehDono = Store.backend !== 'supabase' || SUPA.papelNaObra(o.id) === 'dono';

  const valores = {};
  SECOES.forEach((s) =>
    s.campos(clientes).forEach((c) => {
      valores[c.k] = c.k.startsWith('fin.') ? o.fin[c.k.slice(4)] : o[c.k];
    }),
  );

  const secaoHtml = (s) => `<details class="caixa cfg-secao"${s.aberta ? ' open' : ''}>
      <summary>${esc(s.titulo)}</summary>
      <div class="form-grade">${s
        .campos(clientes)
        .map((c) => campoHTML(c, valores))
        .join('')}</div>
    </details>`;
  /* seções curtas consecutivas (par: true) vão lado a lado */
  const blocos = [];
  SECOES.forEach((s) => {
    const ultimo = blocos[blocos.length - 1];
    if (s.par && Array.isArray(ultimo)) ultimo.push(s);
    else blocos.push(s.par ? [s] : s);
  });
  const secoesHtml = blocos
    .map((b) =>
      Array.isArray(b)
        ? `<div class="cfg-par" style="--cfg-par:${b.map((s) => `${s.campos(clientes).length}fr`).join(' ')}">${b.map(secaoHtml).join('')}</div>`
        : secaoHtml(b),
    )
    .join('');

  return `<div class="tela-lista tela-config">
    <div id="cfg-kpis">${kpisConfig(o, k)}</div>
    <div id="cfg-avisos">${avisosConfig(o)}</div>
    <form data-form="1" onsubmit="return false">
      ${secoesHtml}
    </form>

    ${
      mcmv
        ? `<details class="caixa cfg-secao">
      <summary>Escopo típico da empreitada financiada (MCMV)</summary>
      <table class="tab"><tbody>
        <tr><td style="width:190px"><b>Incluído</b></td><td>Parte cinza, hidráulica e sanitário sem fossa, eletrodutos e caixas, assentamento de piso e revestimento</td></tr>
        <tr><td><b>Separado</b></td><td>Pintura, elétrica final, gesso/forro e demais prestadores específicos</td></tr>
        <tr><td><b>Aditivos comuns</b></td><td>Fossa, calçada e muro</td></tr>
        <tr><td><b>Fornecimento + instalação</b></td><td>Calhas, rufos, mármores e portas quando o preço já inclui material e instalação</td></tr>
        <tr><td><b>Regra</b></td><td>Medições nunca devem ultrapassar contrato + aditivos aprovados</td></tr>
      </tbody></table>
    </details>`
        : ''
    }

    ${
      ehDono && Store.backend === 'supabase'
        ? `<div class="caixa">
      <div class="caixa-cab">
        <h3>Equipe</h3>
        <div class="dir">${botao('Convidar', 'equipe-convidar', { obra: o.id }, 'btn sutil pequeno', 'mais')}</div>
      </div>
      ${equipeHTML(o)}
      <p class="tinta3" style="font-size:var(--t-peq);margin:var(--e3) 0 0">
        Engenheiro lança, mede e edita, mas não gerencia equipe nem exclui a obra. Cliente só acompanha.
      </p>
    </div>`
        : ''
    }

    ${
      ehDono
        ? `<div class="caixa">
      <div class="caixa-cab"><h3>Ações da obra</h3></div>
      <div style="display:flex;gap:var(--e2);flex-wrap:wrap">
        ${botao('Duplicar esta obra', 'duplicar-obra', {}, 'btn')}
        ${botao('Excluir obra', 'excluir-obra', {}, 'btn perigo', 'lixo')}
      </div>
      <p class="tinta3" style="font-size:var(--t-peq);margin:var(--e2) 0 0">
        Excluir apaga a obra e tudo que está ligado a ela — contratos, medições, recebimentos, lançamentos,
        materiais, cronograma e diário. Não dá para desfazer. Só o dono da obra vê estas ações.
      </p>
    </div>`
        : ''
    }
  </div>`;
};

/* Um modelo só de salvamento: automático. Ao sair de um campo alterado,
   grava — se a configuração estiver válida — sem redesenhar o formulário,
   para não tirar o foco do próximo campo; só a faixa de KPIs e o
   "Confira:" são redesenhados. O estado da gravação aparece no topo
   ("salvando…", "salvo"). Com erro, não grava, marca o campo e diz. */
let timerAutoConfig = null;
document.addEventListener('change', (ev) => {
  if (App.rota.view !== 'obra-config' || Store.somenteLeitura()) return;
  if (!ev.target.closest || !ev.target.closest('.tela-lista form[data-form]')) return;
  if (document.querySelector('#modal-camada [data-form]')) return;
  clearTimeout(timerAutoConfig);
  timerAutoConfig = setTimeout(() => {
    const d = lerForm();
    const o = App.obra();
    if (!o) return;
    const erros = apenasErros(validarObra(d));
    document.querySelectorAll('.tela-config .campo.invalido').forEach((c) => c.classList.remove('invalido'));
    if (erros.length) {
      erros.forEach((e) => {
        const campo = document.querySelector(`.tela-config [id="f_${e.campo}"], .tela-config [id="f_fin.${e.campo}"]`);
        if (campo && campo.closest('.campo')) campo.closest('.campo').classList.add('invalido');
      });
      toast(`Não salvou: ${erros[0].mensagem}`, 'aviso', 4500);
      return;
    }
    mutar(() => {
      Object.keys(d).forEach((k) => {
        if (k.startsWith('fin.')) o.fin[k.slice(4)] = d[k];
        else o[k] = d[k];
      });
    }, { render: false });
    const kpis = document.getElementById('cfg-kpis');
    const avisos = document.getElementById('cfg-avisos');
    if (kpis) kpis.innerHTML = kpisConfig(o, kpisObra(o));
    if (avisos) avisos.innerHTML = avisosConfig(o);
  }, 350);
});
