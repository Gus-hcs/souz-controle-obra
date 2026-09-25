/**
 * telas/auditoria.js — Trilha de auditoria, na linguagem nova.
 *
 * Somente leitura. Não entra no ciclo do Store: a trilha vive no banco e só
 * o gatilho a escreve (migração 0003). O estado da carga (Auditoria,
 * carregarAuditoria) mora em telas-obra.js — acoes.js também usa
 * carregarAuditoria, e este módulo não pode, porque importa componentes.js,
 * que importa acoes.js, fechando um ciclo.
 *
 * Abre nas alterações sensíveis (alteracaoSensivel: pago, recebido,
 * aprovado, exclusão); "Todas as alterações" mostra o resto. Clicar no
 * registro mostra só o histórico dele.
 */
import { esc, fmtMoney, fmtNum, fmtQuando, norm, num } from '../../nucleo/base.js';
import { alteracaoSensivel } from '../../dominio/calculos.js';
import { Store } from '../../dados/store.js';
import { SUPA } from '../../dados/supabase.js';
import { ACOES } from '../acoes.js';
import { App, botao } from '../shell.js';
import { Auditoria, carregarAuditoria, VIEWS } from '../telas-obra.js';
import { barraFiltros, buscaToolbar, lista, seletor, vazioTela } from './componentes.js';

const AUD_TABELAS = {
  contratos: 'Contrato',
  medicoes: 'Medição',
  recebimentos: 'Recebimento',
  lancamentos: 'Lançamento',
};
const AUD_CAMPOS = {
  quantidade: ['Quantidade', 'numero'],
  preco_unitario: ['Preço unitário', 'dinheiro'],
  valor_informado: ['Valor fechado', 'dinheiro'],
  valor_medido: ['Valor medido', 'dinheiro'],
  desconto: ['Desconto', 'dinheiro'],
  valor_pago: ['Valor pago', 'dinheiro'],
  valor_previsto: ['Valor previsto', 'dinheiro'],
  valor_aprovado: ['Valor aprovado', 'dinheiro'],
  descontos: ['Descontos', 'dinheiro'],
  valor_recebido: ['Valor recebido', 'dinheiro'],
  frete: ['Frete', 'dinheiro'],
};

const audValor = (v, tipo) => {
  if (v === null || v === undefined || v === '') return '—';
  return tipo === 'dinheiro' ? fmtMoney(num(v)) : fmtNum(num(v), 2);
};

function audQuem(usuarioId) {
  if (SUPA.usuario && usuarioId === SUPA.usuario.id) {
    return esc((SUPA.usuario.email || 'você').split('@')[0]);
  }
  return usuarioId ? 'outro usuário' : 'sistema';
}

function audRegistro(o, tabela, id) {
  const item = (o[tabela] || []).find((x) => x.id === id);
  if (!item) return `${AUD_TABELAS[tabela] || tabela} (excluído)`;
  if (tabela === 'contratos') return `Contrato ${esc(item.codigo || item.codigoBase || '')}`.trim();
  if (tabela === 'medicoes')
    return `Medição ${esc(item.numero || '')}${item.contratoBase ? ' · ' + esc(item.contratoBase) : ''}`.trim();
  if (tabela === 'recebimentos')
    return `Recebimento ${esc(item.numeroMedicao || item.etapaPci || '')}`.trim();
  if (tabela === 'lancamentos') return esc(item.descricao || 'Lançamento');
  return AUD_TABELAS[tabela] || tabela;
}

/* "hoje, 17:49" na tela; a data e hora completas ficam no title. */
function audDataHora(iso) {
  let completa = String(iso || '');
  try {
    completa = new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  } catch (e) {
    /* data inválida: fica o texto cru no title */
  }
  return `<span title="${esc(completa)}">${esc(fmtQuando(iso))}</span>`;
}

const chaveRegistro = (l) => `${l.tabela}:${l.registro_id}`;

ACOES['aud-registro'] = (el, d) => {
  App.filtros.audRegistro = App.filtros.audRegistro === d.chave ? '' : d.chave;
  App.renderConteudo();
};

const OP_TOM = { INSERT: '', UPDATE: '', DELETE: 'atraso' };
const OP_TEXTO = { INSERT: 'criado', UPDATE: 'alterado', DELETE: 'excluído' };

function kpisAuditoria(linhas, recentes, ultima, sensiveis) {
  const item = (rotulo, valor, contexto) => `<div class="kpi-item">
    <span class="kpi-rot">${esc(rotulo)}</span>
    <span class="kpi-val">${valor}</span>
    <span class="kpi-ctx">${contexto}</span>
  </div>`;

  return `<div class="kpis" role="group" aria-label="Indicadores da trilha de auditoria">
    ${item(
      'Alterações registradas',
      linhas.length,
      `${sensiveis} sensíve${sensiveis === 1 ? 'l' : 'is'}${linhas.length >= 500 ? ' · as 500 mais recentes' : ''}`,
    )}
    ${item('Nos últimos 7 dias', recentes, recentes ? 'movimentação recente' : 'sem alterações na semana')}
    ${item(
      'Última alteração',
      ultima ? esc(fmtQuando(ultima.criado_em)) : '—',
      ultima ? `${audQuem(ultima.usuario_id)} · ${audRegistro(App.obra(), ultima.tabela, ultima.registro_id)}` : 'nenhuma',
    )}
  </div>`;
}

/* ---------------------------------------------------------------- tela */
VIEWS.auditoria = () => {
  const o = App.obra();

  if (!o) {
    return vazioTela({
      titulo: 'Selecione uma obra',
      texto: 'A trilha de auditoria é registrada por obra.',
    });
  }

  if (Store.backend !== 'supabase') {
    return vazioTela({
      titulo: 'Disponível com login',
      texto:
        'A trilha registra quem alterou cada valor financeiro — contrato, medição, recebimento e lançamento — e de quanto para quanto. Ela vive no banco de dados e aparece quando você entra com a sua conta.',
    });
  }

  carregarAuditoria(o.id);

  if (Auditoria.carregando && !Auditoria.linhas) {
    return vazioTela({
      titulo: 'Carregando…',
      texto: 'Buscando o histórico de alterações desta obra.',
    });
  }

  if (Auditoria.erro) {
    const faltaTabela =
      /relation .*auditoria.* does not exist|Could not find the table|schema cache/i.test(
        Auditoria.erro,
      );
    return vazioTela({
      titulo: faltaTabela ? 'Trilha ainda não ativada' : 'Não foi possível carregar',
      texto: faltaTabela
        ? 'O sistema funciona sem ela, mas a trilha só guarda o histórico depois que a migração 0003 é aplicada no banco. Quem aplica é o responsável pelo projeto, no SQL Editor do Supabase.'
        : Auditoria.erro,
      acao: botao('Tentar de novo', 'recarregar-auditoria', {}, 'btn'),
    });
  }

  const linhas = Auditoria.linhas || [];
  if (!linhas.length) {
    return vazioTela({
      titulo: 'Nenhuma alteração ainda',
      texto:
        'Assim que um valor financeiro for criado ou alterado, o registro aparece aqui: quem mudou, de quanto para quanto e quando.',
      acao: botao('Atualizar', 'recarregar-auditoria', {}, 'btn sutil pequeno'),
    });
  }

  const f = App.filtros;
  const agora = Date.now();
  const recentes = linhas.filter(
    (l) => (agora - new Date(l.criado_em).getTime()) / 86400000 <= 7,
  ).length;
  const ultima = linhas[0];

  /* Escopo padrão: só o sensível. Sem nenhuma alteração sensível, o
     seletor some e a lista mostra tudo. */
  const sensiveis = linhas.filter(alteracaoSensivel);
  const soSensiveis = sensiveis.length > 0 && f.escopo !== 'todas' && !f.audRegistro;
  const base = soSensiveis ? sensiveis : linhas;

  const busca = norm(f.busca || '');
  let itens = base;
  if (f.audRegistro) itens = itens.filter((l) => chaveRegistro(l) === f.audRegistro);
  if (f.operacao) itens = itens.filter((l) => l.operacao === f.operacao);
  if (f.modulo) itens = itens.filter((l) => l.tabela === f.modulo);
  if (f.campo) itens = itens.filter((l) => l.campo === f.campo);
  if (busca)
    itens = itens.filter((l) =>
      norm(`${audRegistro(o, l.tabela, l.registro_id)} ${audQuem(l.usuario_id)}`).includes(busca),
    );

  const tabelas = [...new Set(linhas.map((l) => l.tabela))];
  const campos = [...new Set(linhas.map((l) => l.campo))];

  const colunas = [
    {
      k: 'quando',
      rotulo: 'Quando',
      largura: '16%',
      celular: 'some',
      valor: (l) => l.criado_em,
      celula: (l) => `<span class="tinta2">${audDataHora(l.criado_em)}</span>`,
    },
    {
      k: 'quem',
      rotulo: 'Quem',
      largura: '14%',
      celular: 'some',
      valor: (l) => audQuem(l.usuario_id),
      celula: (l) => audQuem(l.usuario_id),
    },
    {
      k: 'registro',
      rotulo: 'Registro',
      largura: '24%',
      celular: 'principal',
      valor: (l) => audRegistro(o, l.tabela, l.registro_id),
      celula: (l) =>
        `<div class="cel-obra"><button class="btn-link" data-acao="aud-registro" data-chave="${esc(chaveRegistro(l))}"
          title="${f.audRegistro ? 'Voltar à lista' : 'Ver só o histórico deste registro'}"><b>${audRegistro(o, l.tabela, l.registro_id)}</b></button><span>${audDataHora(l.criado_em)}</span></div>`,
    },
    {
      k: 'alteracao',
      rotulo: 'Alteração',
      largura: '22%',
      valor: (l) => (AUD_CAMPOS[l.campo] || [l.campo])[0],
      celula: (l) => {
        const [rotulo] = AUD_CAMPOS[l.campo] || [l.campo];
        const tom = OP_TOM[l.operacao] || '';
        return `<span class="${tom}">${OP_TEXTO[l.operacao] || l.operacao}</span> ${esc(rotulo)}`;
      },
    },
    {
      k: 'transicao',
      rotulo: 'Antes → depois',
      largura: '24%',
      num: true,
      celula: (l) => {
        const [, tipo] = AUD_CAMPOS[l.campo] || [l.campo, 'numero'];
        const antes = audValor(l.valor_antes, tipo);
        const depois = audValor(l.valor_depois, tipo);
        if (l.operacao === 'INSERT') return `<b>${depois}</b>`;
        if (l.operacao === 'DELETE') return `<span class="tinta3">${antes}</span>`;
        return `<span class="tinta3">${antes}</span> → <b>${depois}</b>`;
      },
    },
  ];

  const barra = barraFiltros({
    mostrar: linhas.length > 1,
    controles: [
      sensiveis.length && !f.audRegistro
        ? seletor('escopo', [['todas', 'Todas as alterações']], 'Alterações sensíveis')
        : '',
      f.audRegistro
        ? `<span class="tinta2">Histórico de <b>${audRegistro(o, ...f.audRegistro.split(':'))}</b></span>
           <button class="btn sutil pequeno" data-acao="aud-registro" data-chave="${esc(f.audRegistro)}">Ver todos</button>`
        : '',
      seletor(
        'operacao',
        [
          ['INSERT', 'Criados'],
          ['UPDATE', 'Alterados'],
          ['DELETE', 'Excluídos'],
        ],
        'Toda operação',
      ),
      tabelas.length > 1
        ? seletor(
            'modulo',
            tabelas.map((t) => [t, AUD_TABELAS[t] || t]),
            'Todos os registros',
          )
        : '',
      campos.length > 1
        ? seletor(
            'campo',
            campos.map((c) => [c, (AUD_CAMPOS[c] || [c])[0]]),
            'Todos os campos',
          )
        : '',
    ],
    filtrados: itens.length,
    total: f.audRegistro ? linhas.length : base.length,
  });

  return `<div class="tela-lista">
    ${kpisAuditoria(linhas, recentes, ultima, sensiveis.length)}
    ${barra}
    ${lista({
      id: 'auditoria',
      testid: 'lista-auditoria',
      colunas,
      itens,
      ordemPadrao: { col: 'quando', dir: -1 },
      rodapeRotulo: (n) => `${n} alterações`,
    })}
  </div>`;
};

VIEWS.auditoria.toolbar = () => {
  const o = App.obra();
  if (!o || Store.backend !== 'supabase' || !(Auditoria.linhas || []).length) return '';
  return `${buscaToolbar('Buscar registro ou pessoa…', 'busca-auditoria')}
    ${botao('Atualizar', 'recarregar-auditoria', {}, 'btn sutil pequeno')}`;
};
