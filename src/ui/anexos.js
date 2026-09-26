/**
 * anexos.js — Anexo de documento: foto ou PDF (nota fiscal do lançamento,
 * comprovante da parcela).
 *
 * Com banco e rede, o arquivo vai para o Storage do Supabase (bucket
 * "anexos", pasta da obra — a RLS do Storage usa pode_ler_obra e
 * pode_escrever_obra, migração 0020) e o registro guarda só a referência
 * "storage:<caminho>". Sem banco, sem rede ou com o bucket ainda não
 * criado, o anexo fica no próprio registro em data URI — a foto reduzida,
 * ou o PDF de até 1 MB —, como antes da 0020. Os dois formatos convivem:
 * urlAnexo resolve qualquer um.
 */
import { esc, fonteImagem } from '../nucleo/base.js';
import { Store } from '../dados/store.js';
import { SUPA } from '../dados/supabase.js';

const BUCKET = 'anexos';
/* PDF guardado no registro: 1 MB vira ~1,4 MB em base64 — abaixo do
   limite de 1,5 MB dos CHECKs de anexo. */
const PDF_LOCAL_MAX = 1024 * 1024;
const ARQUIVO_MAX = 10 * 1024 * 1024;

const ehPdf = (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name || '');

function tipoAnexo(ref) {
  const s = String(ref || '');
  if (!s) return '';
  if (/^data:application\/pdf/i.test(s) || /\.pdf$/i.test(s)) return 'pdf';
  return 'imagem';
}

function lerDataUri(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = rej;
    fr.readAsDataURL(file);
  });
}

async function comprimirImagem(file, maxLado = 1280, qualidade = 0.66) {
  const dataUrl = await lerDataUri(file);
  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = dataUrl;
  });
  const escala = Math.min(1, maxLado / Math.max(img.width, img.height));
  const cv = document.createElement('canvas');
  cv.width = Math.round(img.width * escala);
  cv.height = Math.round(img.height * escala);
  cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
  return cv.toDataURL('image/jpeg', qualidade);
}

function dataUriParaBlob(uri) {
  const [meta, base64] = uri.split(',');
  const mime = (/^data:([^;]+)/.exec(meta) || [])[1] || 'application/octet-stream';
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

const podeUsarStorage = () =>
  Store.backend === 'supabase' &&
  !!(SUPA.sb && SUPA.sb.storage) &&
  !(typeof navigator !== 'undefined' && navigator.onLine === false);

/* Recebe o File escolhido e devolve a referência a gravar no registro.
   destino: { obraId, pasta: 'lancamentos'|'recebimentos', id } */
async function prepararAnexo(file, { obraId, pasta, id }) {
  const pdf = ehPdf(file);
  if (!pdf && !/^image\//.test(file.type || '')) throw new Error('Anexe uma foto ou um PDF.');
  if (file.size > ARQUIVO_MAX) throw new Error('O arquivo passa de 10 MB.');
  if (podeUsarStorage()) {
    const corpo = pdf ? file : dataUriParaBlob(await comprimirImagem(file, 2000, 0.78));
    const caminho = `${obraId}/${pasta}/${id}-${Date.now()}.${pdf ? 'pdf' : 'jpg'}`;
    const { error } = await SUPA.sb.storage
      .from(BUCKET)
      .upload(caminho, corpo, {
        contentType: pdf ? 'application/pdf' : 'image/jpeg',
        upsert: true,
      });
    if (!error) return `storage:${caminho}`;
    /* bucket ainda não criado (0020 não aplicada) ou falha de rede: o
       anexo não se perde — vai no próprio registro */
    console.warn('Storage indisponível; o anexo fica no registro:', error.message || error);
  }
  if (pdf) {
    if (file.size > PDF_LOCAL_MAX) {
      throw new Error(
        'Sem o armazenamento de arquivos, o PDF precisa ter até 1 MB. Anexe uma foto da nota.',
      );
    }
    return lerDataUri(file);
  }
  return comprimirImagem(file, 1600, 0.7);
}

/* Guarda um arquivo pronto (o PDF do relatório) no Storage. Devolve a
   referência "storage:<caminho>", ou '' se não deu (sem banco, sem rede,
   bucket ainda não criado) — quem chama segue sem o arquivo. */
async function enviarArquivo(blob, caminho, contentType) {
  if (!podeUsarStorage()) return '';
  const { error } = await SUPA.sb.storage
    .from(BUCKET)
    .upload(caminho, blob, { contentType, upsert: true });
  return error ? '' : `storage:${caminho}`;
}

/* URL para mostrar o anexo: a data URI como está, o do Storage por link
   assinado de 10 minutos. */
async function urlAnexo(ref) {
  const s = String(ref || '');
  if (!s) return '';
  if (s.startsWith('storage:')) {
    if (!SUPA.sb) throw new Error('Entre com a sua conta para ver este anexo.');
    const { data, error } = await SUPA.sb.storage.from(BUCKET).createSignedUrl(s.slice(8), 600);
    if (error) throw error;
    return data.signedUrl;
  }
  if (tipoAnexo(s) === 'pdf') return URL.createObjectURL(dataUriParaBlob(s));
  return fonteImagem(s);
}

/* Conteúdo do modal que mostra o anexo (imagem ou PDF). */
async function htmlAnexo(ref, rotulo) {
  const url = await urlAnexo(ref);
  if (!url) return '<p class="tinta2">Anexo indisponível.</p>';
  if (tipoAnexo(ref) === 'pdf') {
    return `<iframe src="${esc(url)}" title="${esc(rotulo)}" class="anexo-pdf"></iframe>
      <p style="margin:var(--e2) 0 0"><a href="${esc(url)}" target="_blank" rel="noopener" data-acao="abrir-externo">Abrir o PDF em outra aba</a></p>`;
  }
  return `<img src="${esc(url)}" alt="${esc(rotulo)}" style="width:100%;border-radius:4px">`;
}

/* Bloco de formulário: escolher foto (câmera ou galeria) ou PDF, ver o
   que está anexado e tirar. estado: { ref } — o formulário lê estado.ref
   ao salvar. */
function campoAnexo(form, estado, { rotulo, destino, dica }) {
  const bloco = document.createElement('div');
  bloco.className = 'campo c12';
  const desenhar = (msg = '') => {
    const tipo = tipoAnexo(estado.ref);
    bloco.innerHTML = `<label>${esc(rotulo)}</label>
      ${
        estado.ref
          ? `<div class="nf-anexo">${
              tipo === 'imagem' && fonteImagem(estado.ref)
                ? `<img src="${fonteImagem(estado.ref)}" alt="${esc(rotulo)}">`
                : `<span class="anexo-chip">${tipo === 'pdf' ? 'PDF anexado' : 'Foto anexada'}</span>`
            }<button type="button" class="btn sutil pequeno" data-anexo-remover="1">Remover</button></div>`
          : `<div class="fotos-botoes">
              <label class="btn pequeno">Fotografar<input type="file" accept="image/*" capture="environment" data-anexo="1" hidden></label>
              <label class="btn sutil pequeno">Foto ou PDF<input type="file" accept="image/*,application/pdf" data-anexo="1" hidden></label>
            </div>
            <span class="dica">${esc(msg || dica || 'foto ou PDF, até 10 MB')}</span>`
      }`;
    bloco.querySelectorAll('[data-anexo]').forEach((inp) =>
      inp.addEventListener('change', async (ev) => {
        const f = ev.target.files && ev.target.files[0];
        if (!f) return;
        desenhar('enviando…');
        try {
          estado.ref = await prepararAnexo(f, destino);
          desenhar();
        } catch (e) {
          estado.ref = '';
          desenhar(String((e && e.message) || e));
        }
      }),
    );
    const rm = bloco.querySelector('[data-anexo-remover]');
    if (rm)
      rm.addEventListener('click', () => {
        estado.ref = '';
        desenhar();
      });
  };
  desenhar();
  form.appendChild(bloco);
}

export {
  campoAnexo,
  comprimirImagem,
  enviarArquivo,
  htmlAnexo,
  prepararAnexo,
  tipoAnexo,
  urlAnexo,
};
