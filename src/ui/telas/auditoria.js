/**
 * telas/auditoria.js — Trilha de auditoria, na linguagem nova.
 *
 * Somente leitura. Não entra no ciclo do Store: a trilha vive no banco e só
 * o gatilho a escreve (migração 0003). O estado da carga (Auditoria,
 * carregarAuditoria) mora em telas-obra.js — acoes.js também usa
 * carregarAuditoria, e este módulo não pode, porque importa componentes.js,
 * que importa acoes.js, fechando um ciclo.
 */
import { esc, fmtMoney, fmtNum, norm, num } from '../../nucleo/base.js';
import { Store } from '../../dados/store.js';
import { SUPA } from '../../dados/supabase.js';
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

function audDataHora(iso) {
  try {
    return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  } catch (e) {
    return esc(String(iso || ''));
  }
}

const OP_TOM = { INSERT: '', UPDATE: '', DELETE: 'atraso' };
const OP_TEXTO = { INSERT: 'criado', UPDATE: 'alterado', DELETE: 'excluído' };

function kpisAuditoria(linhas, recentes, ultima) {
  const agora = Date.now();
  const item = (rotulo, valor, contexto) => `<div class="kpi-item">
    <span class="kpi-rot">${esc(rotulo)}</span>
    <span class="kpi-val">${valor}</span>
    <span class="kpi-ctx">${contexto}</span>
  </div>`;

  return `<div class="kpis" role="group" aria-label="Indicadores da trilha de auditoria">
    ${item('Alterações registradas', linhas.length, linhas.length >= 500 ? 'as 500 mais recentes' : 'nesta obra')}
    ${item('Nos últimos 7 dias', recentes, recentes ? 'movimentação recente' : 'sem alterações na semana')}
    ${item(
      'Última alteração',
      ultima
        ? `há ${Math.max(0, Math.floor((agora - new Date(ultima.criado_em).getTime()) / 86400000))}d`
        : '—',
      ultima ? `${audQuem(ultima.usuario_id)} · ${audDataHora(ultima.criado_em)}` : 'nenhuma',
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

  const busca = norm(f.busca || '');
  let itens = linhas;
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
      celula: (l) => `<span class="tinta2">${esc(audDataHora(l.criado_em))}</span>`,
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
        `<div class="cel-obra"><b>${audRegistro(o, l.tabela, l.registro_id)}</b><span>${esc(audDataHora(l.criado_em))}</span></div>`,
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
    total: linhas.length,
  });

  return `<div class="tela-lista">
    ${kpisAuditoria(linhas, recentes, ultima)}
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
