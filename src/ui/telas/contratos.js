/**
 * telas/contratos.js — Contratos e aditivos, na linguagem nova.
 *
 * A versão antiga tinha três KPIs gigantes, uma faixa de filtros, e cada
 * contrato num cartão próprio com barra de progresso de ponta a ponta. Com
 * um contrato só, a tela era 80% moldura e 20% dado.
 *
 * Agora é uma lista com hierarquia, como uma pasta no Finder: cada
 * código-base é uma linha que abre e mostra, recuados, o contrato principal
 * e os aditivos. Os números que importam — autorizado, pago, saldo — ficam
 * em coluna, alinhados, e o total no rodapé.
 *
 * Nada aqui calcula: autorizado, pago, saldo e valor vêm de dominio/calculos.js.
 */
import { esc, fmtMoney, fmtNum, fmtPct, norm, num } from '../../nucleo/base.js';
import { basesContratuais, contratoValor } from '../../dominio/calculos.js';
import { Store } from '../../dados/store.js';
import { App, ICO, botao, opcoesLista, svg } from '../shell.js';
import { VIEWS, contratosAbertos, prazoRegistro } from '../telas-obra.js';

const COLS = 8;

/* Vermelho só quando o número é negativo: é o único caso em que a cor diz
   algo que o próprio número não diz de imediato. */
const dinheiro = (v) => {
  const t = fmtMoney(v, { dec: 0 });
  return v < 0 ? `<span class="atraso">${t}</span>` : t;
};

/* ------------------------------------------------------------- filtros */
function filtrar(todas) {
  const f = App.filtros;
  const busca = norm(f.busca || '');
  return todas.filter((b) => {
    if (f.prestador && b.prestador !== f.prestador) return false;
    if (f.status && !b.registros.some((c) => c.status === f.status)) return false;
    if (f.regime && !b.registros.some((c) => c.regime === f.regime)) return false;
    if (f.situacao === 'saldo-baixo' && !(b.saldo < 0 || b.execFinanceira > 0.9)) return false;
    if (f.situacao === 'ultrapassado' && b.saldo >= 0) return false;
    if (busca) {
      const alvo = norm(
        `${b.base} ${b.prestador} ${b.registros.map((c) => c.codigo + ' ' + c.escopo).join(' ')}`,
      );
      if (!alvo.includes(busca)) return false;
    }
    return true;
  });
}

/* Um select de filtro compacto. Largura pelo conteúdo, não 100%. */
function seletor(chave, opcoes, rotuloTodos) {
  const v = App.filtros[chave] || '';
  return `<select data-filtro="${chave}" aria-label="${esc(rotuloTodos)}">
    <option value="">${esc(rotuloTodos)}</option>
    ${opcoes
      .map((o) => {
        const [val, txt] = Array.isArray(o) ? o : [o, o];
        return `<option value="${esc(val)}" ${val === v ? 'selected' : ''}>${esc(txt)}</option>`;
      })
      .join('')}
  </select>`;
}

/* ------------------------------------------------------------- linhas */

/* Linha do código-base: abre e fecha. Os botões de ação dentro dela têm
   data-acao próprio, então clicar neles não abre nem fecha a linha. */
function linhaBase(b, aberto, podeFechar) {
  const prazo = prazoRegistro(b.principal);
  return `<tr class="lista-grupo${aberto ? ' aberto' : ''}" data-base="${esc(b.base)}"
      ${podeFechar ? `data-acao="ct-toggle" role="button" tabindex="0" aria-expanded="${aberto}"` : ''}>
    <td class="principal-celular">
      <div class="cel-arvore">
        ${podeFechar ? `<span class="disclosure" aria-hidden="true">${svg(ICO.seta, 11)}</span>` : '<span class="disclosure vazio-disc"></span>'}
        <div class="cel-dupla"><b>${esc(b.base)}</b><span>${esc(b.prestador || 'prestador não informado')}</span></div>
      </div>
    </td>
    <td class="some-no-celular ${prazo.atrasado ? 'atraso' : 'tinta2'}">${prazo.texto || '<span class="tinta3">—</span>'}</td>
    <td class="num" data-rotulo="Autorizado">${dinheiro(b.autorizado)}</td>
    <td class="num some-no-celular">${dinheiro(b.pago)}</td>
    <td class="num" data-rotulo="Saldo">${dinheiro(b.saldo)}</td>
    <td class="num some-no-celular">
      <span class="barra-fina${b.saldo < 0 ? ' atrasada' : ''}"><i style="width:${(Math.max(0, Math.min(1, b.execFinanceira)) * 100).toFixed(1)}%"></i></span>${fmtPct(b.execFinanceira, 0)}
    </td>
    <td class="some-no-celular tinta2">${esc(b.status || '—')}</td>
    <td class="acoes-linha">
      <button class="btn sutil icone pequeno" data-acao="novo-aditivo" data-base="${esc(b.base)}"
        title="Novo aditivo em ${esc(b.base)}" aria-label="Novo aditivo em ${esc(b.base)}">${svg(ICO.mais, 13)}</button>
      ${botao('Medir', 'nova-medicao', { base: b.base }, 'btn sutil pequeno')}
    </td>
  </tr>`;
}

/* Registro dentro do código-base: o contrato principal ou um aditivo. */
function linhaRegistro(c, somenteLeitura) {
  const valor = contratoValor(c);
  const pr = prazoRegistro(c);
  const detalhe = [
    c.regime,
    num(c.quantidade)
      ? `${fmtNum(c.quantidade, 2)} ${c.unidade || ''} × ${fmtMoney(c.precoUnitario)}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');
  /* Valor zerado quase sempre é quantidade ou preço faltando — dizer isso
     vale mais que mostrar R$ 0,00 sem explicação. */
  const aviso =
    valor === 0 && c.status !== 'Cancelado' ? 'valor zerado — confira quantidade e preço' : '';

  return `<tr class="lista-filho">
    <td class="principal-celular">
      <div class="cel-dupla cel-registro">
        <b>${esc(c.escopo || c.codigo || '—')}</b>
        <span>${esc(c.registro)}${c.codigo ? ' · ' + esc(c.codigo) : ''}</span>
      </div>
      ${aviso ? `<div class="cel-aviso cel-aviso-alerta">${aviso}</div>` : detalhe ? `<div class="cel-aviso tinta3">${esc(detalhe)}</div>` : ''}
    </td>
    <td class="some-no-celular ${pr.atrasado ? 'atraso' : 'tinta2'}">${pr.texto || '<span class="tinta3">—</span>'}</td>
    <td class="num" data-rotulo="Valor">${valor === 0 ? '<span class="tinta3">R$ 0</span>' : dinheiro(valor)}</td>
    <td class="num some-no-celular"></td>
    <td class="num some-no-celular"></td>
    <td class="num some-no-celular"></td>
    <td class="some-no-celular tinta2">${esc(c.status || '—')}</td>
    <td class="acoes-linha">
      ${
        somenteLeitura
          ? ''
          : `<button class="btn sutil icone pequeno" data-acao="editar-contrato" data-id="${esc(c.id)}" title="Editar" aria-label="Editar ${esc(c.codigo || c.escopo || 'registro')}">${svg(ICO.lapis, 13)}</button>
             <button class="btn sutil icone pequeno" data-acao="excluir-contrato" data-id="${esc(c.id)}" title="Excluir" aria-label="Excluir ${esc(c.codigo || c.escopo || 'registro')}">${svg(ICO.lixo, 13)}</button>`
      }
    </td>
  </tr>`;
}

/* ---------------------------------------------------------------- tela */

VIEWS.contratos = () => {
  const o = App.obra();

  if (!o.contratos.length) {
    return `<div class="vazio" data-testid="contratos-vazio">
      <h4>Nenhum contrato nesta obra</h4>
      <p>Comece pela empreitada principal — normalmente R$/m² sobre a área construída.
         Depois vêm os aditivos de muro, calçada e fossa, sempre com o mesmo código-base.</p>
      <div class="acoes">${botao('Cadastrar contrato principal', 'novo-contrato', {}, 'btn primario', 'mais')}</div>
    </div>`;
  }

  const todas = basesContratuais(o);
  const bases = filtrar(todas);
  const totalAut = todas.reduce((s, b) => s + b.autorizado, 0);
  const totalPago = todas.reduce((s, b) => s + b.pago, 0);
  const totalAdit = todas.reduce((s, b) => s + b.valorAditivos, 0);
  const saldo = totalAut - totalPago;
  const leitura = Store.somenteLeitura();

  /* Com um código-base só não há o que recolher: ele fica aberto. */
  const soUm = bases.length === 1;
  const prestadores = [...new Set(o.contratos.map((c) => c.prestador).filter(Boolean))].sort();

  /* ---------------------------------------------------------- resumo */
  const resumo = `<div class="resumo">
    <div class="resumo-item principal">
      <span class="resumo-rot">Total autorizado</span>
      <span class="resumo-val">${fmtMoney(totalAut, { dec: 0 })}</span>
      <span class="resumo-nota">${todas.length} contrato${todas.length === 1 ? '' : 's'}${
        totalAdit ? ` · ${fmtMoney(totalAdit, { dec: 0 })} em aditivos` : ''
      }</span>
    </div>
    <div class="resumo-item">
      <span class="resumo-rot">Pago em medições</span>
      <span class="resumo-val">${fmtMoney(totalPago, { dec: 0 })}</span>
      <span class="resumo-nota">${fmtPct(totalAut ? totalPago / totalAut : 0, 0)} do autorizado</span>
    </div>
    <div class="resumo-item">
      <span class="resumo-rot">Saldo a pagar</span>
      <span class="resumo-val${saldo < 0 ? ' atraso' : ''}">${fmtMoney(saldo, { dec: 0 })}</span>
      <span class="resumo-nota">${saldo < 0 ? 'pago acima do contratado' : 'a medir e pagar'}</span>
    </div>
  </div>`;

  /* ----------------------------------------------------------- filtros
     Só aparecem quando há o que filtrar. Com um contrato, quatro selects
     de filtro eram só moldura. */
  const filtrando = ['prestador', 'status', 'regime', 'situacao', 'busca'].some(
    (k) => App.filtros[k],
  );
  const barraFiltros =
    todas.length > 1 || filtrando
      ? `<div class="filtro-barra nao-imprime">
          ${seletor('prestador', prestadores, 'Todos os prestadores')}
          ${seletor('status', opcoesLista('statusContrato'), 'Todos os status')}
          ${seletor('regime', opcoesLista('regimes'), 'Todos os regimes')}
          ${seletor(
            'situacao',
            [
              ['saldo-baixo', 'Saldo baixo'],
              ['ultrapassado', 'Ultrapassado'],
            ],
            'Qualquer situação',
          )}
          ${filtrando ? `<span class="tinta2 filtro-conta">${bases.length} de ${todas.length}</span>` : ''}
          ${
            bases.length > 1
              ? `<span class="filtro-dir">${botao(
                  bases.every((b) => contratosAbertos.has(b.base))
                    ? 'Recolher todos'
                    : 'Expandir todos',
                  'ct-todos',
                  { abrir: bases.every((b) => contratosAbertos.has(b.base)) ? '0' : '1' },
                  'btn sutil pequeno',
                )}</span>`
              : ''
          }
        </div>`
      : '';

  /* ------------------------------------------------------------- lista */
  const corpo = bases.length
    ? bases
        .map((b) => {
          const aberto = soUm || contratosAbertos.has(b.base);
          return (
            linhaBase(b, aberto, !soUm) +
            (aberto ? b.registros.map((c) => linhaRegistro(c, leitura)).join('') : '')
          );
        })
        .join('')
    : `<tr><td colspan="${COLS}" class="tinta2" style="text-align:center;height:56px">
         Nenhum contrato com esse filtro.</td></tr>`;

  const rodape =
    bases.length > 1
      ? `<tfoot><tr>
          <td>${bases.length} contratos</td><td></td>
          <td class="num">${dinheiro(bases.reduce((s, b) => s + b.autorizado, 0))}</td>
          <td class="num">${dinheiro(bases.reduce((s, b) => s + b.pago, 0))}</td>
          <td class="num">${dinheiro(bases.reduce((s, b) => s + b.saldo, 0))}</td>
          <td></td><td></td><td></td>
        </tr></tfoot>`
      : '';

  return `<div class="tela-lista">
    ${resumo}
    ${barraFiltros}
    <div class="lista-cx">
      <div class="lista-rolagem">
        <table class="lista lista-arvore" data-testid="lista-contratos">
          <colgroup>
            <col style="width:27%"><col style="width:10%"><col style="width:12%"><col style="width:11%">
            <col style="width:11%"><col style="width:10%"><col style="width:11%"><col style="width:8%">
          </colgroup>
          <thead><tr>
            <th scope="col">Contrato</th>
            <th scope="col">Prazo</th>
            <th scope="col" class="num">Autorizado</th>
            <th scope="col" class="num">Pago</th>
            <th scope="col" class="num">Saldo</th>
            <th scope="col" class="num">Executado</th>
            <th scope="col">Situação</th>
            <th scope="col"><span class="sr">Ações</span></th>
          </tr></thead>
          <tbody>${corpo}</tbody>
          ${rodape}
        </table>
      </div>
    </div>
  </div>`;
};

/* --------------------------------------------------------- toolbar */
VIEWS.contratos.toolbar = () => {
  const o = App.obra();
  if (!o || !o.contratos.length) return '';
  return `<span class="busca">${svg(ICO.busca, 13)}
      <input type="search" id="flt_busca" data-filtro="busca" data-testid="busca-contratos"
        value="${esc(App.filtros.busca || '')}" placeholder="Buscar contrato" aria-label="Buscar contrato">
      <kbd>⌘K</kbd>
    </span>
    ${Store.somenteLeitura() ? '' : botao('<span class="rotulo-btn">Aditivo</span>', 'novo-aditivo', {}, 'btn so-largo', 'mais')}
    ${Store.somenteLeitura() ? '' : botao('<span class="rotulo-btn">Novo contrato</span>', 'novo-contrato', {}, 'btn primario', 'mais')}`;
};
