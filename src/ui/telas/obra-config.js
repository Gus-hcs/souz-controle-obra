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

const SECOES = [
  {
    titulo: 'Identificação',
    aberta: true,
    campos: (clientes) => [
      { k: 'nome', label: 'Nome da obra', tipo: 'texto', col: 6, obrigatorio: true },
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
      { k: 'cidade', label: 'Cidade/UF', tipo: 'texto', col: 4 },
      { k: 'endereco', label: 'Endereço', tipo: 'texto', col: 8 },
      { k: 'areaConstruida', label: 'Área construída (m²)', tipo: 'numero', col: 3 },
      { k: 'areaMuro', label: 'Área de muro (m²)', tipo: 'numero', col: 3 },
      { k: 'sistema', label: 'Sistema construtivo', tipo: 'lista', opcoes: SISTEMAS_CONSTRUTIVOS, col: 3 },
      { k: 'padrao', label: 'Padrão de acabamento', tipo: 'lista', opcoes: PADROES_ACABAMENTO, col: 3 },
      { k: 'responsavel', label: 'Responsável técnico', tipo: 'texto', col: 6 },
      { k: 'observacoes', label: 'Observações', tipo: 'area', col: 12 },
    ],
  },
  {
    titulo: 'Prazo',
    aberta: true,
    campos: () => [
      { k: 'dataInicio', label: 'Data de início', tipo: 'data', col: 3 },
      { k: 'previsaoConclusao', label: 'Data contratual de entrega', tipo: 'data', col: 3 },
    ],
  },
  {
    titulo: 'Financeiro e contrato',
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
      /* qualquer financiador (0016) — as telas usam este nome */
      { k: 'fin.financiador', label: 'Financiador', tipo: 'lista', col: 4,
        opcoes: ['CAIXA', 'Banco do Brasil', 'Itaú', 'Bradesco', 'Santander', 'Consórcio', 'Cliente (por marco)'],
        dica: 'quem libera o dinheiro por avanço de obra' },
      { k: 'fin.contratoCaixa', label: 'Nº do contrato de financiamento', tipo: 'texto', col: 4 },
      { k: 'fin.dataAssinatura', label: 'Data da assinatura', tipo: 'data', col: 4 },
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

/* ---------------------------------------------------------------- tela */
VIEWS['obra-config'] = () => {
  const o = App.obra();
  const clientes = Store.estado.clientes.map((c) => ({ v: c.id, t: c.nome }));
  const k = kpisObra(o);
  const mcmv =
    /MCMV/i.test(o.padrao || '') || o.fin.contratoCaixa || num(o.fin.valorFinanciado) > 0;

  const ehDono = Store.backend !== 'supabase' || SUPA.papelNaObra(o.id) === 'dono';

  const valores = {};
  SECOES.forEach((s) =>
    s.campos(clientes).forEach((c) => {
      valores[c.k] = c.k.startsWith('fin.') ? o.fin[c.k.slice(4)] : o[c.k];
    }),
  );

  const secoesHtml = SECOES.map(
    (s) => `<details class="caixa"${s.aberta ? ' open' : ''}>
      <summary style="cursor:pointer;font-weight:var(--p-semi);font-size:var(--t-medio)">${esc(s.titulo)}</summary>
      <div class="form-grade" style="margin-top:var(--e3)">${s
        .campos(clientes)
        .map((c) => campoHTML(c, valores))
        .join('')}</div>
    </details>`,
  ).join('');

  const incoerencias = incoerenciasObra(o);

  return `<div class="tela-lista">
    ${kpisConfig(o, k)}
    ${
      incoerencias.length
        ? `<div class="aviso-linha" role="status" style="margin-bottom:var(--e3)"><b>Confira:</b>
            <ul style="margin:var(--e1) 0 0;padding-left:var(--e5)">${incoerencias.map((x) => `<li>${esc(x.texto)}</li>`).join('')}</ul></div>`
        : ''
    }
    <form data-form="1" onsubmit="return false" style="display:flex;flex-direction:column;gap:var(--e3)">
      ${secoesHtml}
    </form>

    ${
      mcmv
        ? `<details class="caixa">
      <summary class="secao-form-toggle">Escopo típico da empreitada financiada (MCMV)</summary>
      <table class="tab" style="margin-top:10px"><tbody>
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
      <span class="tinta2" style="font-size:var(--t-peq);font-weight:var(--p-semi)">Ações da obra</span>
      <div style="display:flex;gap:var(--e2);flex-wrap:wrap;margin-top:var(--e3)">
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

/* Salvamento automático (auditoria): ao sair de um campo alterado, grava
   — se a configuração estiver válida — sem redesenhar a tela, para não
   tirar o foco do próximo campo. O botão "Salvar alterações" continua:
   ele redesenha os KPIs e as incoerências. Com erro, não grava e diz. */
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
    if (erros.length) {
      toast(`Não salvou: ${erros[0].mensagem}`, 'aviso', 4500);
      return;
    }
    mutar(() => {
      Object.keys(d).forEach((k) => {
        if (k.startsWith('fin.')) o.fin[k.slice(4)] = d[k];
        else o[k] = d[k];
      });
    }, { render: false });
  }, 350);
});

VIEWS['obra-config'].toolbar = () => {
  const o = App.obra();
  if (!o || Store.somenteLeitura()) return '';
  return botao('Salvar alterações', 'salvar-obra-config', {}, 'btn primario');
};
