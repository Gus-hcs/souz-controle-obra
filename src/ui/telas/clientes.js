/**
 * telas/clientes.js — Clientes e interessados, na linguagem nova.
 *
 * Cadastro simples, sem cálculo de domínio: só soma o valor de venda das
 * obras ligadas a cada cliente (já vem pronto de obra.fin.valorVenda).
 */
import { esc, fmtMoney, norm, num } from '../../nucleo/base.js';
import { Store } from '../../dados/store.js';
import { App, botao } from '../shell.js';
import { VIEWS } from '../telas-obra.js';
import {
  acoesRegistro,
  botaoNovo,
  buscaToolbar,
  dinheiro,
  lista,
  vazioTela,
} from './componentes.js';

function kpisClientes(itens) {
  const emProspeccao = itens.filter((c) => c.situacao === 'Prospecção').length;
  const valorTotal = itens.reduce((s, c) => s + c.valor, 0);
  const item = (rotulo, valor, contexto, tom = '') => `<div class="kpi-item">
    <span class="kpi-rot">${esc(rotulo)}</span>
    <span class="kpi-val${tom ? ' ' + tom : ''}">${valor}</span>
    <span class="kpi-ctx">${contexto}</span>
  </div>`;

  return `<div class="kpis" role="group" aria-label="Indicadores de clientes">
    ${item('Clientes e interessados', itens.length, `${itens.filter((c) => c.obras.length).length} com obra vinculada`)}
    ${item('Em prospecção', emProspeccao, emProspeccao ? 'ainda sem contrato fechado' : 'nenhum em prospecção', emProspeccao ? 'tom-alerta' : '')}
    ${item('Valor contratado', fmtMoney(valorTotal, { dec: 0 }), 'soma do valor de venda das obras')}
  </div>`;
}

/* ---------------------------------------------------------------- tela */
VIEWS.clientes = () => {
  const e = Store.estado;

  if (!e.clientes.length) {
    return vazioTela({
      titulo: 'Nenhum cliente',
      texto: 'Cadastre compradores e interessados para vincular às obras e acompanhar a carteira.',
      acao: botao('Novo cliente', 'novo-cliente', {}, 'btn primario', 'mais'),
    });
  }

  const f = App.filtros;
  const busca = norm(f.busca || '');
  const todos = e.clientes.map((c) => {
    const obras = e.obras.filter((o) => o.clienteId === c.id);
    return { c, obras, valor: obras.reduce((s, o) => s + num(o.fin.valorVenda), 0) };
  });
  const itens = busca
    ? todos.filter((d) =>
        norm(`${d.c.nome} ${d.c.contato} ${d.c.telefone} ${d.c.email} ${d.c.origem}`).includes(
          busca,
        ),
      )
    : todos;

  const colunas = [
    {
      k: 'nome',
      rotulo: 'Nome',
      largura: '22%',
      celular: 'principal',
      valor: (d) => (d.c.nome || '').toLowerCase(),
      celula: (d) =>
        `<div class="cel-obra"><b>${esc(d.c.nome)}</b>${d.c.documento ? `<span>${esc(d.c.documento)}</span>` : ''}</div>`,
    },
    {
      k: 'situacao',
      rotulo: 'Situação',
      largura: '12%',
      celular: 'some',
      valor: (d) => d.c.situacao || 'Cliente',
      celula: (d) => {
        const tom = d.c.situacao === 'Prospecção' ? 'tom-alerta' : 'tinta3';
        return `<span class="situacao-ct ${tom}"><span class="pt"></span>${esc(d.c.situacao || 'Cliente')}</span>`;
      },
    },
    {
      k: 'telefone',
      rotulo: 'Telefone',
      largura: '13%',
      celular: 'some',
      valor: (d) => d.c.telefone || '',
      celula: (d) => (d.c.telefone ? esc(d.c.telefone) : '<span class="tinta3">—</span>'),
    },
    {
      k: 'email',
      rotulo: 'E-mail',
      largura: '17%',
      celular: 'some',
      valor: (d) => d.c.email || '',
      celula: (d) => (d.c.email ? esc(d.c.email) : '<span class="tinta3">—</span>'),
    },
    {
      k: 'obras',
      rotulo: 'Obras',
      largura: '18%',
      valor: (d) => d.obras.length,
      celula: (d) =>
        d.obras.length
          ? d.obras
              .map(
                (o) =>
                  `<button class="btn sutil pequeno" data-acao="ir" data-view="painel" data-obra="${esc(o.id)}">${esc(o.nome)}</button>`,
              )
              .join(' ')
          : '<span class="tinta3">—</span>',
    },
    {
      k: 'valor',
      rotulo: 'Valor contratado',
      largura: '12%',
      num: true,
      celula: (d) => dinheiro(d.valor, { cinzaNoZero: true, dec: 0 }),
      total: (ds) =>
        dinheiro(
          ds.reduce((s, d) => s + d.valor, 0),
          { dec: 0 },
        ),
    },
    {
      k: 'acoes',
      rotulo: '',
      largura: '6%',
      celula: (d) => acoesRegistro('cliente', d.c.id, d.c.nome),
    },
  ];

  return `<div class="tela-lista">
    ${kpisClientes(todos)}
    ${lista({
      id: 'clientes',
      testid: 'lista-clientes',
      colunas,
      itens,
      ordemPadrao: { col: 'nome', dir: 1 },
      rodapeRotulo: (n) => `${n} clientes`,
    })}
  </div>`;
};

VIEWS.clientes.toolbar = () => {
  const e = Store.estado;
  if (!e.clientes.length) return '';
  return `${buscaToolbar('Buscar cliente…', 'busca-clientes')}
    ${botaoNovo('Novo cliente', 'novo-cliente')}`;
};
