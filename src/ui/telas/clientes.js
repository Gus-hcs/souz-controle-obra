/**
 * telas/clientes.js — Clientes e interessados, na linguagem nova.
 *
 * Cadastro simples: soma o valor de venda das obras ligadas a cada cliente
 * (obra.fin.valorVenda) e mostra a saúde da obra dele em pior estado
 * (saudeCliente) — o que interessa numa conversa com o cliente é como
 * está a casa dele, não em que etapa do funil ele estava.
 *
 * CPF/CNPJ aparece mascarado na lista (LGPD); a busca acha pelo número
 * inteiro, e o formulário mostra o número inteiro.
 */
import { esc, fmtMoney, norm, num } from '../../nucleo/base.js';
import { ocultarDocumento } from '../../nucleo/contato.js';
import { pendenciasDoCliente, saudeCliente, ultimoStatusCliente } from '../../dominio/calculos.js';
import { Store } from '../../dados/store.js';
import { App, botao } from '../shell.js';
import { VIEWS } from '../telas-obra.js';
import {
  acoesRegistro,
  botaoNovo,
  buscaToolbar,
  dinheiro,
  faixaKpis,
  lista,
  vazioTela,
} from './componentes.js';

function kpisClientes(itens) {
  const emRisco = itens.filter((d) => d.saude && (d.saude.nivel === 'critico' || d.saude.nivel === 'atencao')).length;
  const valorTotal = itens.reduce((s, c) => s + c.valor, 0);
  return faixaKpis(
    [
      {
        rotulo: 'Clientes e interessados',
        valor: itens.length,
        contexto: `${itens.filter((c) => c.obras.length).length} com obra vinculada`,
      },
      {
        rotulo: 'Com obra em risco',
        valor: emRisco,
        contexto: emRisco
          ? 'atraso, custo ou caixa — ligue antes dele'
          : 'nenhum cliente com obra em risco',
        tom: emRisco ? 'tom-alerta' : '',
      },
      {
        rotulo: 'Valor contratado',
        valor: fmtMoney(valorTotal, { dec: 0 }),
        contexto: 'soma do valor de venda das obras',
      },
    ],
    { rotulo: 'Indicadores de clientes' },
  );
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
    return {
      c,
      obras,
      saude: saudeCliente(obras),
      /* 0018: último status enviado e o que o cliente deve à obra */
      status: ultimoStatusCliente(obras),
      devendo: obras.reduce((s, o) => {
        const pc = pendenciasDoCliente(o);
        return { abertas: s.abertas + pc.abertas.length, vencidas: s.vencidas + pc.vencidas.length };
      }, { abertas: 0, vencidas: 0 }),
      valor: obras.reduce((s, o) => s + num(o.fin.valorVenda), 0),
    };
  });
  const buscaDig = busca.replace(/\D/g, '');
  const itens = busca
    ? todos.filter(
        (d) =>
          norm(`${d.c.nome} ${d.c.contato} ${d.c.telefone} ${d.c.email} ${d.c.origem}`).includes(busca) ||
          (buscaDig.length >= 3 && String(d.c.documento || '').replace(/\D/g, '').includes(buscaDig)),
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
        `<div class="cel-obra"><b>${esc(d.c.nome)}</b>${d.c.documento ? `<span title="CPF/CNPJ completo no cadastro">${esc(ocultarDocumento(d.c.documento))}</span>` : ''}</div>`,
    },
    {
      k: 'situacao',
      rotulo: 'Situação',
      largura: '12%',
      celular: 'some',
      /* com obra: a saúde da pior obra (mesma célula da Carteira);
         sem obra: a situação do cadastro */
      valor: (d) => (d.saude ? d.saude.ordem : 10) + (d.c.situacao === 'Encerrado' ? 1 : 0),
      celula: (d) => {
        if (d.saude) {
          const s = d.saude;
          const todos = s.motivos.map((m) => m.texto).join(' · ');
          return `<span class="saude s-${s.nivel}" title="${esc(todos || s.texto)}"><i aria-hidden="true"></i>${esc(s.texto)}</span>`;
        }
        const tom = d.c.situacao === 'Prospecção' ? 'tom-alerta' : 'tinta3';
        return `<span class="situacao-ct ${tom}"><span class="pt"></span>${esc(d.c.situacao || 'Cliente')}</span>`;
      },
    },
    {
      k: 'ultimoStatus',
      rotulo: 'Último status',
      largura: '11%',
      celular: 'some',
      valor: (d) => (d.status.dias === null ? 9999 : d.status.dias),
      /* notícia para o cliente: há quanto tempo, e o que ele deve */
      celula: (d) => {
        if (!d.obras.length) return '<span class="tinta3">—</span>';
        const st = d.status.dias === null
          ? '<span class="tom-alerta">nunca enviado</span>'
          : `<span class="${d.status.dias > 14 ? 'tom-alerta' : 'tinta2'}">${d.status.dias === 0 ? 'hoje' : `há ${d.status.dias} d`}</span>`;
        const dev = d.devendo.abertas
          ? `<span class="${d.devendo.vencidas ? 'atraso' : 'tinta3'}">deve ${d.devendo.abertas} decis${d.devendo.abertas === 1 ? 'ão' : 'ões'}</span>`
          : '';
        return `<div class="cel-empilhada">${st}${dev}</div>`;
      },
    },
    {
      k: 'telefone',
      rotulo: 'Telefone',
      largura: '11%',
      celular: 'some',
      valor: (d) => d.c.telefone || '',
      celula: (d) => (d.c.telefone ? esc(d.c.telefone) : '<span class="tinta3">—</span>'),
    },
    {
      k: 'email',
      rotulo: 'E-mail',
      largura: '15%',
      celular: 'some',
      valor: (d) => d.c.email || '',
      celula: (d) => (d.c.email ? esc(d.c.email) : '<span class="tinta3">—</span>'),
    },
    {
      k: 'obras',
      rotulo: 'Obras',
      largura: '16%',
      valor: (d) => d.obras.length,
      /* nome longo corta com reticências; o nome inteiro fica no title */
      celula: (d) =>
        d.obras.length
          ? `<div class="obras-cliente">${d.obras
              .map(
                (o) =>
                  `<button class="btn sutil pequeno" data-acao="ir" data-view="painel" data-obra="${esc(o.id)}" title="${esc(o.nome)}">${esc(o.nome)}</button>`,
              )
              .join('')}</div>`
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
