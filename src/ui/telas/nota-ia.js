/**
 * nota-ia.js — "Lançar pela nota" (IA, 0027).
 *
 * A pessoa tira a foto (ou escolhe o PDF) da nota; a nota sobe para o
 * Storage como sempre; a função `ia` lê e devolve a leitura; a tela
 * "Conferir a nota" mostra o que foi lido, com os alertas do domínio
 * (soma × total, CNPJ, nota repetida, campo incerto), e só grava quando a
 * pessoa confirma. Toda conta sai de dominio/calculos.js; toda regra, de
 * dominio/validacao.js. Nada é gravado pela IA.
 *
 * O botão aparece para quem edita a obra com a IA ligada; com a IA
 * desligada, só o gestor vê o botão com cadeado (convite ao plano com IA).
 */
import { esc, fmtMoney, fmtNum, hojeISO, novoLancamento, num } from '../../nucleo/base.js';
import {
  camposCorrigidosNota,
  fornecedorPorCnpj,
  lancamentosDaLeitura,
  situacaoCotaIa,
  somaLeituraNota,
} from '../../dominio/calculos.js';
import { alertasLeituraNota, apenasErros, validarLancamento } from '../../dominio/validacao.js';
import { Store, mutar } from '../../dados/store.js';
import { SUPA } from '../../dados/supabase.js';
import { ACOES } from '../acoes.js';
import { prepararAnexo } from '../anexos.js';
import { App, abrirModal, botao, fecharModal, opcoesEtapas, opcoesLista, toast } from '../shell.js';

/* situacao: obraId → linha de ia_situacao (ou { ligada: false });
   leitura em conferência: a original (para contar correções) e a atual */
const Ia = {
  situacao: {},
  carregando: new Set(),
  conf: null,
  pedidoAtual: 0,
};

function carregarSituacao(obraId) {
  if (Ia.carregando.has(obraId)) return;
  Ia.carregando.add(obraId);
  SUPA.situacaoIa(obraId)
    .then((s) => {
      Ia.situacao[obraId] = s || { ligada: false };
    })
    .catch(() => {
      Ia.situacao[obraId] = { ligada: false };
    })
    .finally(() => {
      Ia.carregando.delete(obraId);
      if (App.rota.view === 'lancamentos' && App.obra() && App.obra().id === obraId) App.render();
    });
}

const ehGestor = (obraId) =>
  SUPA.construtora ? SUPA.construtora.papel === 'gestor' : SUPA.papelNaObra(obraId) === 'dono';

/* O botão da tela Lançamentos (barra do topo e tela vazia). */
function botaoNotaIa(obra, classe = 'btn') {
  if (!obra || Store.backend !== 'supabase' || !SUPA.usuario || Store.somenteLeitura()) return '';
  if (!SUPA.podeEditarObra(obra.id)) return '';
  const s = Ia.situacao[obra.id];
  if (s === undefined) {
    carregarSituacao(obra.id);
    return '';
  }
  if (situacaoCotaIa(s).ligada) {
    return botao(
      '<span class="rotulo-btn">Lançar pela nota</span>',
      'nota-ia',
      {},
      classe,
      'camera',
    );
  }
  return ehGestor(obra.id)
    ? botao(
        '<span class="rotulo-btn">Lançar pela nota</span>',
        'nota-ia-plano',
        {},
        'btn sutil',
        'cadeado',
      )
    : '';
}

ACOES['nota-ia-plano'] = () =>
  abrirModal({
    titulo: 'Lançar pela nota',
    largura: 'estreito',
    corpo: `<p style="margin:0 0 var(--e3)">Tire a foto da nota fiscal e o lançamento se preenche sozinho: fornecedor, itens, valores, etapa. Você confere e grava.</p>
      <p class="aviso-discreto" style="margin:0">Disponível no plano com IA. Fale com a Souz para ligar na sua construtora.</p>`,
    rodape: '<button class="btn" data-acao="fechar-modal">Entendi</button>',
  });

/* ------------------------------------------------------------ entrada */
ACOES['nota-ia'] = () => {
  const o = App.obra();
  if (!o) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return toast(
      'A leitura da nota precisa de internet. Lance à mão ou tente quando a rede voltar.',
      'aviso',
    );
  }
  const s = situacaoCotaIa(Ia.situacao[o.id]);
  if (s.esgotada) {
    return toast(
      'As leituras de nota deste mês acabaram. Lance à mão ou fale com o gestor.',
      'aviso',
      6000,
    );
  }
  abrirModal({
    titulo: 'Lançar pela nota',
    largura: 'estreito',
    corpo: `<div class="nota-ia-escolha">
        <p style="margin:0">Fotografe a nota inteira, reta e com boa luz — ou escolha o PDF.</p>
        <div class="fotos-botoes">
          <label class="btn primario">Tirar foto<input type="file" accept="image/*" capture="environment" data-nota-arquivo hidden></label>
          <label class="btn">Escolher arquivo<input type="file" accept="image/*,application/pdf" data-nota-arquivo hidden></label>
        </div>
        ${s.aviso ? `<p class="aviso-discreto tom-alerta" style="margin:0">${s.usado} de ${s.cota} leituras usadas este mês.</p>` : ''}
      </div>`,
  });
  document.querySelectorAll('#modal-camada [data-nota-arquivo]').forEach((inp) =>
    inp.addEventListener('change', (ev) => {
      const f = ev.target.files && ev.target.files[0];
      if (f) lerNota(f);
    }),
  );
};

async function lerNota(arquivo) {
  const o = App.obra();
  const pedido = ++Ia.pedidoAtual;
  abrirModal({
    titulo: 'Lendo a nota…',
    largura: 'estreito',
    corpo: `<p style="margin:0" data-testid="nota-ia-lendo">Lendo a nota. Leva de 5 a 15 segundos.</p>`,
    rodape: '<button class="btn" data-acao="nota-ia-cancelar">Cancelar</button>',
  });
  const lanc = novoLancamento();
  try {
    const ref = await prepararAnexo(arquivo, { obraId: o.id, pasta: 'lancamentos', id: lanc.id });
    if (!String(ref).startsWith('storage:')) {
      throw new Error('Sem o armazenamento de arquivos a nota não pode ser lida. Lance à mão.');
    }
    const r = await SUPA.lerNotaComIa(o.id, ref, contextoObra(o));
    if (pedido !== Ia.pedidoAtual) return; // cancelou enquanto lia
    const s = Ia.situacao[o.id];
    if (s) s.usado_notas = num(s.usado_notas) + 1;
    if (!r.leitura.legivel) {
      return abrirModal({
        titulo: 'Não consegui ler esta nota',
        largura: 'estreito',
        corpo: `<p style="margin:0">${esc(r.leitura.motivo || 'A foto não mostra uma nota legível.')} Tire outra foto, com a nota inteira e plana, ou lance à mão.</p>`,
        rodape: `<button class="btn" data-acao="fechar-modal">Fechar</button>
          <button class="btn primario" data-acao="novo-lancamento">Lançar à mão</button>`,
      });
    }
    Ia.conf = {
      id: r.id,
      obraId: o.id,
      ref,
      lancId: lanc.id,
      modo: 'itens',
      incluir: r.leitura.itens.map(() => true),
      original: JSON.parse(JSON.stringify(r.leitura)),
      leitura: r.leitura,
    };
    abrirConferencia();
  } catch (e) {
    if (pedido !== Ia.pedidoAtual) return;
    fecharModal();
    toast((e && e.message) || 'Não foi possível ler a nota.', 'critico', 7000);
  }
}

ACOES['nota-ia-cancelar'] = () => {
  Ia.pedidoAtual++;
  fecharModal();
};

/* só nomes (etapas, itens do plano, formas de pagamento): nada de valor,
   cliente ou endereço vai para a IA */
function contextoObra(o) {
  return {
    etapas: opcoesEtapas(),
    materiais: (o.materiais || []).map((m) => ({ id: m.id, nome: m.material })),
    formasPagamento: opcoesLista('formasPagamento'),
  };
}

/* --------------------------------------------------------- conferência */
function leituraIncluida() {
  const c = Ia.conf;
  return { ...c.leitura, itens: c.leitura.itens.filter((_, i) => c.incluir[i]) };
}

function camposGerados() {
  const c = Ia.conf;
  return lancamentosDaLeitura(leituraIncluida(), App.obra(), {
    modo: c.modo,
    listas: Store.estado.listas,
    prestadores: Store.estado.prestadores,
    anexoNf: c.ref,
  });
}

const incerto = (campo) => (Ia.conf.leitura.incertos || []).includes(campo);

function htmlDinamico() {
  const o = App.obra();
  const l = leituraIncluida();
  const soma = somaLeituraNota(l);
  const alertas = alertasLeituraNota(l, o, hojeISO(), Store.estado.prestadores);
  const cad = fornecedorPorCnpj(Store.estado.prestadores, l.cnpj);
  return `
    <p class="nota-ia-resumo">Itens ${fmtMoney(soma.itens)}${num(l.desconto) ? ` − desconto ${fmtMoney(l.desconto)}` : ''}${
      num(l.frete) ? ` + frete ${fmtMoney(l.frete)}` : ''
    } = <b>${fmtMoney(soma.calculado)}</b>${l.totalNota != null ? ` · total da nota ${fmtMoney(l.totalNota)}` : ''}${
      cad ? ` · fornecedor do cadastro: <b>${esc(cad.nome)}</b>` : ''
    }</p>
    ${
      alertas.length
        ? `<ul class="nota-ia-alertas" data-testid="nota-ia-alertas">${alertas
            .map((a) => `<li>${esc(a.mensagem)}</li>`)
            .join('')}</ul>`
        : ''
    }`;
}

function abrirConferencia() {
  const c = Ia.conf;
  const l = c.leitura;
  const etapas = opcoesEtapas();
  const pagamentos = opcoesLista('formasPagamento');
  const campo = (k, rotulo, valor, tipo = 'text', col = 'c3') =>
    `<div class="campo ${col}${incerto(k) ? ' incerto' : ''}">
      <label for="nia_${k}">${rotulo}${incerto(k) ? ' <span class="tom-alerta">· confira</span>' : ''}</label>
      <input id="nia_${k}" type="${tipo}" data-nota="${k}" value="${esc(valor == null ? '' : valor)}">
    </div>`;
  const linha = (it, i) => `<tr>
      <td><input type="checkbox" data-nota-incluir="${i}" ${c.incluir[i] ? 'checked' : ''} aria-label="Incluir o item ${i + 1}"></td>
      <td data-rotulo="Item"><input type="text" data-nota-item="${i}" data-k="descricao" value="${esc(it.descricao)}" aria-label="Descrição do item ${i + 1}">
        <span class="tinta2">${it.quantidade != null ? `${fmtNum(it.quantidade, 2)} ${esc(it.unidade || '')}` : ''}${
          it.valorUnitario != null ? ` × ${fmtMoney(it.valorUnitario)}` : ''
        }${it.servico ? ' · serviço' : ''}${num(it.valorServico) > 0 ? ` (instalação ${fmtMoney(it.valorServico)})` : ''}</span></td>
      <td data-rotulo="Total"><input type="text" inputmode="decimal" class="num" data-nota-item="${i}" data-k="valorTotal" value="${
        it.valorTotal == null ? '' : fmtNum(it.valorTotal, 2)
      }" aria-label="Total do item ${i + 1}"></td>
      <td data-rotulo="Etapa"><select data-nota-item="${i}" data-k="etapa" aria-label="Etapa do item ${i + 1}">
        <option value="">sem etapa</option>
        ${etapas.map((e) => `<option ${e === it.etapa ? 'selected' : ''}>${esc(e)}</option>`).join('')}
      </select></td>
    </tr>`;
  abrirModal({
    titulo: 'Conferir a nota',
    largura: 'largo',
    corpo: `<div class="nota-ia" data-testid="nota-ia-conferencia">
      <div class="form-grade">
        ${campo('fornecedor', 'Fornecedor', l.fornecedor, 'text', 'c6')}
        ${campo('cnpj', 'CNPJ', l.cnpj)}
        ${campo('numero', 'Número da nota', l.numero)}
        ${campo('dataEmissao', 'Data', l.dataEmissao, 'date')}
        <div class="campo c3${incerto('formaPagamento') ? ' incerto' : ''}">
          <label for="nia_pag">Pagamento</label>
          <select id="nia_pag" data-nota="formaPagamento">
            <option value="">—</option>
            ${pagamentos.map((p) => `<option ${p === l.formaPagamento ? 'selected' : ''}>${esc(p)}</option>`).join('')}
            ${l.formaPagamento && !pagamentos.includes(l.formaPagamento) ? `<option selected>${esc(l.formaPagamento)}</option>` : ''}
          </select>
        </div>
      </div>
      <fieldset class="nota-ia-modo">
        <legend>Como lançar</legend>
        <label><input type="radio" name="nia_modo" value="itens" ${c.modo === 'itens' ? 'checked' : ''}> Um lançamento por item</label>
        <label><input type="radio" name="nia_modo" value="total" ${c.modo === 'total' ? 'checked' : ''}> Um só, com o total da nota</label>
      </fieldset>
      <div class="tab-rolagem"><table class="tab nota-ia-itens">
        <thead><tr><th></th><th>Item</th><th>Total</th><th>Etapa</th></tr></thead>
        <tbody>${l.itens.map(linha).join('')}</tbody>
      </table></div>
      <div class="nota-ia-dinamico">${htmlDinamico()}</div>
    </div>`,
    rodape: `<button class="btn" data-acao="nota-ia-cancelar">Cancelar</button>
      <button class="btn primario" data-acao="nota-ia-criar" data-testid="nota-ia-criar">${rotuloCriar()}</button>`,
  });
}

function rotuloCriar() {
  const n = camposGerados().length;
  return n === 1 ? 'Criar 1 lançamento' : `Criar ${n} lançamentos`;
}

function atualizarDinamico() {
  const cx = document.querySelector('#modal-camada .nota-ia-dinamico');
  if (cx) cx.innerHTML = htmlDinamico();
  const b = document.querySelector('#modal-camada [data-acao="nota-ia-criar"]');
  if (b) b.textContent = rotuloCriar();
}

/* edição na conferência: muda a leitura, recalcula alertas e contagem sem
   redesenhar os campos (o foco fica onde está) */
function aoEditar(ev) {
  const el = ev.target;
  if (!Ia.conf || !el.closest || !el.closest('#modal-camada .nota-ia')) return;
  const l = Ia.conf.leitura;
  if (el.dataset.nota) {
    const v = el.value.trim();
    l[el.dataset.nota] = v === '' ? null : el.dataset.nota === 'cnpj' ? v.replace(/\D/g, '') : v;
  } else if (el.dataset.notaItem !== undefined) {
    const it = l.itens[Number(el.dataset.notaItem)];
    const k = el.dataset.k;
    if (k === 'valorTotal') it.valorTotal = el.value.trim() === '' ? null : num(el.value);
    else it[k] = el.value || (k === 'etapa' ? null : '');
  } else if (el.dataset.notaIncluir !== undefined) {
    Ia.conf.incluir[Number(el.dataset.notaIncluir)] = el.checked;
  } else if (el.name === 'nia_modo') {
    Ia.conf.modo = el.value;
  } else return;
  atualizarDinamico();
}
document.addEventListener('input', aoEditar);
document.addEventListener('change', aoEditar);

ACOES['nota-ia-criar'] = () => {
  const c = Ia.conf;
  const o = App.obra();
  if (!c || !o || o.id !== c.obraId) return;
  const campos = camposGerados();
  if (!campos.length) return toast('Marque ao menos um item da nota.', 'aviso');
  const novos = campos.map((cp, i) =>
    Object.assign(novoLancamento(), i === 0 ? { id: c.lancId } : {}, cp),
  );
  const erros = novos.flatMap((l) => apenasErros(validarLancamento(l)));
  if (erros.length) return toast(erros[0].mensagem, 'aviso', 6000);
  mutar(() => {
    o.lancamentos.push(...novos);
  });
  const excluidos = c.incluir.filter((x) => !x).length;
  SUPA.marcarCorrecoesIa(c.id, camposCorrigidosNota(c.original, c.leitura, excluidos)).catch(
    () => {},
  );
  Ia.conf = null;
  fecharModal();
  toast(
    novos.length === 1
      ? 'Lançamento criado pela nota. A foto ficou anexada.'
      : `${novos.length} lançamentos criados pela nota. A foto ficou anexada em cada um.`,
    'ok',
    5000,
  );
};

export { botaoNotaIa, Ia };
