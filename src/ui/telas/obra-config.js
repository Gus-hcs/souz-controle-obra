/**
 * telas/obra-config.js — Configuração da obra, na linguagem nova.
 *
 * O formulário longo (20+ campos numa página só) vira três seções
 * recolhíveis — Identificação, Prazo, Financeiro e contrato — com
 * <details>/<summary> nativos, o mesmo recurso já usado no escopo MCMV
 * desta tela. Sem JS novo, sem estado de aba pra guardar.
 */
import { esc, fmtMoney, fmtNum, fmtPct, num } from '../../nucleo/base.js';
import { kpisObra } from '../../dominio/calculos.js';
import { App, botao, campoHTML, opcoesLista } from '../shell.js';
import { Store } from '../../dados/store.js';
import { VIEWS } from '../telas-obra.js';

function kpisConfig(o, k) {
  const alvo = num(o.fin.margemDesejada);
  const item = (rotulo, valor, contexto, tom = '') => `<div class="kpi-item">
    <span class="kpi-rot">${esc(rotulo)}</span>
    <span class="kpi-val${tom ? ' ' + tom : ''}">${valor}</span>
    <span class="kpi-ctx">${contexto}</span>
  </div>`;

  return `<div class="kpis" role="group" aria-label="Indicadores da configuração">
    ${item(
      'Empreitada principal',
      fmtMoney(num(o.areaConstruida) * num(o.fin.precoEmpreitadaM2), { dec: 0 }),
      num(o.areaConstruida)
        ? `${fmtNum(o.areaConstruida, 2)} m² × ${fmtMoney(o.fin.precoEmpreitadaM2, { dec: 0 })}/m²`
        : 'informe a área construída',
    )}
    ${item('Custo previsto total', fmtMoney(k.custoPrevisto, { dec: 0 }), 'contratos + materiais + saídas')}
    ${item(
      'Resultado projetado',
      k.resultado === null ? '—' : fmtMoney(k.resultado, { dec: 0 }),
      k.margem === null
        ? 'informe o valor de venda'
        : `margem de ${fmtPct(k.margem)}${alvo ? ` · alvo ${fmtPct(alvo)}` : ''}`,
      k.margem === null ? '' : k.margem < alvo ? 'tom-alerta' : '',
    )}
  </div>`;
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
      },
      { k: 'cidade', label: 'Cidade/UF', tipo: 'texto', col: 4 },
      { k: 'endereco', label: 'Endereço', tipo: 'texto', col: 8 },
      { k: 'areaConstruida', label: 'Área construída (m²)', tipo: 'numero', col: 3 },
      { k: 'areaMuro', label: 'Área de muro (m²)', tipo: 'numero', col: 3 },
      { k: 'sistema', label: 'Sistema construtivo', tipo: 'texto', col: 3 },
      { k: 'padrao', label: 'Padrão de acabamento', tipo: 'texto', col: 3 },
      { k: 'responsavel', label: 'Responsável técnico', tipo: 'texto', col: 6 },
      { k: 'observacoes', label: 'Observações', tipo: 'area', col: 12 },
    ],
  },
  {
    titulo: 'Prazo',
    campos: () => [
      { k: 'dataInicio', label: 'Data de início', tipo: 'data', col: 3 },
      { k: 'previsaoConclusao', label: 'Previsão de conclusão', tipo: 'data', col: 3 },
    ],
  },
  {
    titulo: 'Financeiro e contrato',
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
        dica: 'gera alerta se ultrapassar',
      },
      { k: 'fin.valorVenda', label: 'Valor de venda/contrato', tipo: 'dinheiro', col: 3 },
      { k: 'fin.margemDesejada', label: 'Margem desejada (%)', tipo: 'pct', col: 3 },
      { k: 'fin.contratoCaixa', label: 'Nº do contrato de financiamento', tipo: 'texto', col: 4 },
      { k: 'fin.dataAssinatura', label: 'Data da assinatura', tipo: 'data', col: 4 },
    ],
  },
];

/* ---------------------------------------------------------------- tela */
VIEWS['obra-config'] = () => {
  const o = App.obra();
  const clientes = Store.estado.clientes.map((c) => ({ v: c.id, t: c.nome }));
  const k = kpisObra(o);
  const mcmv =
    /MCMV/i.test(o.padrao || '') || o.fin.contratoCaixa || num(o.fin.valorFinanciado) > 0;

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

  return `<div class="tela-lista">
    ${kpisConfig(o, k)}
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

    <div class="caixa">
      <span class="tinta2" style="font-size:var(--t-peq);font-weight:var(--p-semi)">Ações da obra</span>
      <div style="display:flex;gap:var(--e2);flex-wrap:wrap;margin-top:var(--e3)">
        ${botao('Duplicar esta obra', 'duplicar-obra', {}, 'btn')}
        ${botao('Excluir obra', 'excluir-obra', {}, 'btn perigo', 'lixo')}
      </div>
      <p class="tinta3" style="font-size:var(--t-peq);margin:var(--e2) 0 0">
        Excluir apaga a obra e tudo que está ligado a ela — contratos, medições, recebimentos, lançamentos,
        materiais, cronograma e diário. Não dá para desfazer.
      </p>
    </div>
  </div>`;
};

VIEWS['obra-config'].toolbar = () => {
  const o = App.obra();
  if (!o) return '';
  return botao('Salvar alterações', 'salvar-obra-config', {}, 'btn primario');
};
