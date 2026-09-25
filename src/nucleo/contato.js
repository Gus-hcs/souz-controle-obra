/**
 * contato.js — Telefone brasileiro, WhatsApp e ligação.
 *
 * O telefone chega do jeito que a pessoa digita no celular, na obra:
 * "(62) 9 9999-8888", "62999998888", "+55 62 99999 8888", "062 99999-8888".
 * Aqui ele vira UMA forma só, guardada em dígitos: 55 + DDD + número.
 * É essa forma que o wa.me e o tel: entendem, e é ela que o banco valida.
 *
 * E o CPF/CNPJ na lista: dado pessoal que não precisa aparecer inteiro
 * numa tabela que qualquer pessoa da equipe vê (LGPD).
 */

/* DDDs em uso no Brasil (Anatel). Um DDD fora da lista é erro de digitação. */
const DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43,
  44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77,
  79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

/**
 * Diz o que há de errado com o telefone, ou '' se ele é válido.
 * Separado de normalizarTelefoneBR para o formulário mostrar o motivo.
 */
function motivoTelefoneInvalido(entrada) {
  let d = String(entrada ?? '').replace(/\D/g, '');
  if (!d) return 'Informe o número.';
  /* prefixo de país; e o zero de discagem interurbana ("062…") */
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
  d = d.replace(/^0+/, '');
  if (d.length < 10) return 'Número incompleto: falta o DDD ou algum dígito.';
  if (d.length > 11) return 'Número com dígitos a mais.';
  const ddd = Number(d.slice(0, 2));
  if (!DDDS.has(ddd)) return `DDD ${d.slice(0, 2)} não existe.`;
  const numero = d.slice(2);
  if (numero.length === 9 && numero[0] !== '9') return 'Celular com 9 dígitos começa com 9.';
  if (numero.length === 8 && !/^[2-5]/.test(numero)) return 'Número fixo começa com 2, 3, 4 ou 5.';
  return '';
}

/**
 * "(62) 9 9999-8888" → "5562999998888". Devolve null se não for um
 * telefone brasileiro válido — nunca um número pela metade.
 */
function normalizarTelefoneBR(entrada) {
  if (motivoTelefoneInvalido(entrada)) return null;
  let d = String(entrada).replace(/\D/g, '');
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
  d = d.replace(/^0+/, '');
  return '55' + d;
}

/** Celular (9 dígitos depois do DDD) ou fixo (8). Só celular tem WhatsApp, em geral. */
function tipoTelefone(numero) {
  const d = String(numero ?? '').replace(/\D/g, '');
  if (d.length === 13) return 'celular';
  if (d.length === 12) return 'fixo';
  return '';
}

/** "5562999998888" → "(62) 99999-8888", para exibir. */
function formatarTelefoneBR(numero) {
  const d = String(numero ?? '')
    .replace(/\D/g, '')
    .replace(/^55(?=\d{10,11}$)/, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return String(numero ?? '');
}

/**
 * Máscara enquanto se digita: "629999" → "(62) 9999", "62999998888" →
 * "(62) 99999-8888". Não valida — só organiza o que já foi digitado.
 */
function mascaraTelefone(entrada) {
  const d = String(entrada ?? '')
    .replace(/\D/g, '')
    .slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Conversa no WhatsApp, já com o texto escrito. O envio continua manual. */
function linkWhatsApp(numero, mensagem = '') {
  const d = String(numero ?? '').replace(/\D/g, '');
  const texto = String(mensagem ?? '').trim();
  return `https://wa.me/${d}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`;
}

/** Ligação: tel:+5562999998888. */
function linkTelefone(numero) {
  return `tel:+${String(numero ?? '').replace(/\D/g, '')}`;
}

/**
 * Mensagens prontas. Cada item da lista (editável em Ajustes) é uma linha
 * "Título | texto com {nome}, {obra}, {valor} e {data}".
 */
function lerModelosMensagem(linhas) {
  return (linhas || [])
    .map((l) => String(l))
    .map((l) => {
      const i = l.indexOf('|');
      if (i < 0) return { titulo: l.trim().slice(0, 40), texto: l.trim() };
      return { titulo: l.slice(0, i).trim(), texto: l.slice(i + 1).trim() };
    })
    .filter((m) => m.titulo && m.texto);
}

/** Troca {nome}, {obra}, {valor} e {data}; variável sem valor some sem deixar chave. */
function preencherMensagem(texto, vars = {}) {
  return String(texto || '')
    .replace(/\{(nome|obra|valor|data)\}/g, (_, k) => (vars[k] == null ? '' : String(vars[k])))
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.!?])/g, '$1')
    .trim();
}

/**
 * CPF/CNPJ para lista: "123.456.789-09" → "***.456.789-**",
 * "12.345.678/0001-95" → "**.345.678/0001-**". O cadastro guarda e o
 * formulário mostra o número inteiro; a lista só o suficiente para
 * distinguir duas pessoas. Documento fora do padrão vira "•••" + os 2
 * últimos dígitos — nunca o texto cru.
 */
function ocultarDocumento(doc) {
  const d = String(doc ?? '').replace(/\D/g, '');
  if (!d) return '';
  if (d.length === 11) return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
  if (d.length === 14) return `**.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-**`;
  return `•••${d.slice(-2)}`;
}

export {
  ocultarDocumento,
  lerModelosMensagem,
  preencherMensagem,
  DDDS,
  motivoTelefoneInvalido,
  normalizarTelefoneBR,
  tipoTelefone,
  formatarTelefoneBR,
  mascaraTelefone,
  linkWhatsApp,
  linkTelefone,
};
