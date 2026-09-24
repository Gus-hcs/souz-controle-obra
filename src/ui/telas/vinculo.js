/**
 * telas/vinculo.js — Vincular ao cadastro de prestadores.
 *
 * Contrato (ou lançamento) antigo guarda o prestador como nome digitado,
 * sem prestadorId — e aí a ficha do prestador fica "sem contrato". Esta
 * janela lê a prévia do domínio (previaVinculoPrestadores) e deixa o
 * usuário decidir, linha a linha: ligar ao prestador que casou, escolher
 * entre os parecidos, escolher outro ou cadastrar o nome como prestador
 * novo. Nada é ligado sem confirmação.
 *
 * Lançamento sem cadastro fica de fora: em geral é loja de material
 * ("Depósito Central"), não prestador.
 *
 * Aberta pela linha do contrato (Contratos) e pela faixa "pagamentos sem
 * contrato" (Prestadores).
 */
import { esc, nomeExibicao, norm, novoPrestador } from '../../nucleo/base.js';
import { previaVinculoPrestadores } from '../../dominio/calculos.js';
import { Store, mutar } from '../../dados/store.js';
import { ACOES } from '../acoes.js';
import { abrirModal, fecharModal, toast } from '../shell.js';

const NOVO = '__novo__';

function itensPendentes() {
  const pv = previaVinculoPrestadores(Store.estado);
  return [
    ...pv.casaram.map((x) => ({ ...x, resultado: 'casou', candidatos: [] })),
    ...pv.ambiguos.map((x) => ({ ...x, resultado: 'ambiguo' })),
    ...pv.semCadastro
      .filter((x) => x.tipo === 'contrato')
      .map((x) => ({ ...x, resultado: 'sem-cadastro', candidatos: [] })),
  ];
}

function opcoes(item, ativos) {
  /* só o que casou vem marcado; o resto espera a escolha do usuário */
  const escolhido = item.resultado === 'casou' ? item.prestadorId : '';
  const op = (id, nome) =>
    `<option value="${esc(id)}" ${id === escolhido ? 'selected' : ''}>${esc(nome)}</option>`;
  const parecidos = item.candidatos || [];
  return [
    `<option value="">Deixar para depois</option>`,
    parecidos.length
      ? `<optgroup label="Mesmo nome">${parecidos.map((p) => op(p.id, nomeExibicao(p.nome))).join('')}</optgroup>`
      : '',
    `<optgroup label="Prestadores cadastrados">${ativos.map((p) => op(p.id, nomeExibicao(p.nome))).join('')}</optgroup>`,
    `<option value="${NOVO}">+ Cadastrar “${esc(nomeExibicao(item.textoDigitado))}” como prestador</option>`,
  ].join('');
}

const ROTULO = {
  casou: 'mesmo nome no cadastro',
  ambiguo: 'mais de um com esse nome',
  'sem-cadastro': 'não está no cadastro',
};

function abrirVinculo(foco = '') {
  const itens = itensPendentes();
  if (!itens.length) {
    toast('Nada para vincular: todo contrato já tem prestador do cadastro.', 'aviso');
    return;
  }
  /* o contrato de onde se veio aparece primeiro */
  itens.sort((a, b) => (b.id === foco) - (a.id === foco));
  const ativos = Store.estado.prestadores
    .filter((p) => !p.arquivado)
    .sort((a, b) => nomeExibicao(a.nome).localeCompare(nomeExibicao(b.nome), 'pt-BR'));

  const linhas = itens
    .map(
      (it) => `<li class="vinc-item${it.id === foco ? ' foco' : ''}">
      <div class="vinc-ref">
        <b>${esc(it.tipo === 'contrato' ? `Contrato ${it.referencia}` : it.referencia || 'Lançamento')}</b>
        <span>${esc(it.obraNome)}</span>
        <span>digitado: “${esc(it.textoDigitado)}” · <span class="vinc-${it.resultado}">${ROTULO[it.resultado]}</span></span>
      </div>
      <select data-vinc="${esc(it.id)}" data-vinc-tipo="${it.tipo}" data-vinc-obra="${esc(it.obraId)}"
        data-vinc-texto="${esc(it.textoDigitado)}" aria-label="Prestador para ${esc(it.referencia)}">
        ${opcoes(it, ativos)}
      </select>
    </li>`,
    )
    .join('');

  abrirModal({
    titulo: 'Vincular ao cadastro de prestadores',
    largura: 'largo',
    corpo: `<p class="tinta2" style="margin:0 0 12px">Estes registros têm o prestador só como nome digitado.
      Escolha a quem cada um pertence — a ficha do prestador passa a mostrar o contratado e o pago.</p>
      <ul class="vinc-lista">${linhas}</ul>`,
    rodape: `<span class="esq tinta3">${itens.length} pendente${itens.length === 1 ? '' : 's'}</span>
      <button class="btn" data-acao="fechar-modal">Cancelar</button>
      <button class="btn primario" data-acao="vincular-salvar">Vincular</button>`,
  });
  const sel = document.querySelector('.vinc-item.foco select');
  if (sel) setTimeout(() => sel.focus(), 40);
}

ACOES['vincular-prestadores'] = (el, d) => abrirVinculo(d.contrato || '');

ACOES['vincular-salvar'] = () => {
  const escolhas = [...document.querySelectorAll('select[data-vinc]')]
    .filter((s) => s.value)
    .map((s) => ({
      id: s.dataset.vinc,
      tipo: s.dataset.vincTipo,
      obraId: s.dataset.vincObra,
      texto: s.dataset.vincTexto,
      valor: s.value,
    }));
  if (!escolhas.length) {
    fecharModal();
    return;
  }
  let ligados = 0;
  let criados = 0;
  const ok = mutar((e) => {
    const novos = new Map(); // mesmo nome digitado → um prestador só
    escolhas.forEach((x) => {
      let pid = x.valor;
      if (pid === NOVO) {
        const chave = norm(x.texto);
        if (!novos.has(chave)) {
          const p = Object.assign(novoPrestador(), { nome: nomeExibicao(x.texto) });
          e.prestadores.push(p);
          novos.set(chave, p.id);
          criados++;
        }
        pid = novos.get(chave);
      }
      const obra = e.obras.find((o) => o.id === x.obraId);
      if (!obra) return;
      const reg = (x.tipo === 'contrato' ? obra.contratos : obra.lancamentos).find(
        (r) => r.id === x.id,
      );
      if (!reg) return;
      reg.prestadorId = pid;
      ligados++;
      /* aditivo sem prestador próprio segue o contrato principal */
      if (x.tipo === 'contrato') {
        const base = reg.codigoBase || reg.codigo;
        obra.contratos.forEach((c) => {
          if ((c.codigoBase || c.codigo) === base && !c.prestadorId && c.registro === 'Aditivo') {
            c.prestadorId = pid;
          }
        });
      }
    });
  });
  if (!ok) return;
  fecharModal();
  toast(
    `${ligados} registro${ligados === 1 ? '' : 's'} vinculado${ligados === 1 ? '' : 's'}` +
      (criados
        ? ` · ${criados} prestador${criados === 1 ? '' : 'es'} cadastrado${criados === 1 ? '' : 's'}`
        : '') +
      '.',
  );
};

export { abrirVinculo, itensPendentes };
