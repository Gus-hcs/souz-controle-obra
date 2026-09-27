// @vitest-environment jsdom
/**
 * Fotos do diário no Storage (auditoria A-06): com rede a foto sobe para
 * anexos/<obra>/diario/ e o registro guarda "storage:<caminho>"; sem rede
 * fica em data URI; a tela mostra as duas formas; PDF e WhatsApp recebem os
 * bytes; as fotos antigas (em base64 no registro) sobem quando a obra abre.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Store } from '../src/dados/store.js';
import { SUPA } from '../src/dados/supabase.js';
import { estadoInicial } from '../src/nucleo/base.js';
import { fotosDaSemana, fotosDoPeriodo } from '../src/dominio/calculos.js';
import {
  atribFoto,
  fotoComoDataUri,
  fotosProntas,
  guardarFotoDiario,
  hidratarFotos,
  migrarFotosDiario,
} from '../src/ui/anexos.js';

const FOTO = 'data:image/jpeg;base64,/9j/AAAA';
/* montado por partes: o lint barra o texto literal */
const URL_SCRIPT = 'java' + 'script:alert(1)';
const FOTO2 = 'data:image/jpeg;base64,/9j/BBBB';

/* Storage falso: guarda o que sobe, assina e baixa. */
function storageFalso() {
  const arquivos = new Map();
  const chamadas = { upload: 0, assinar: 0, baixar: 0 };
  return {
    arquivos,
    chamadas,
    storage: {
      from: () => ({
        upload: async (caminho, corpo) => {
          chamadas.upload++;
          arquivos.set(caminho, corpo);
          return { error: null };
        },
        createSignedUrls: async (caminhos) => {
          chamadas.assinar++;
          return {
            data: caminhos.map((p) => ({ path: p, signedUrl: `https://assinado.exemplo/${p}` })),
            error: null,
          };
        },
        download: async (caminho) => {
          chamadas.baixar++;
          return arquivos.has(caminho)
            ? { data: new Blob(['jpeg'], { type: 'image/jpeg' }), error: null }
            : { data: null, error: { message: 'não achou' } };
        },
      }),
    },
  };
}

const original = {
  sb: SUPA.sb,
  backend: Store.backend,
  podeEditarObra: SUPA.podeEditarObra,
  sincronizar: SUPA.sincronizar,
};
let banco;
beforeEach(() => {
  document.body.innerHTML = '<div id="toasts"></div>';
  banco = storageFalso();
  SUPA.sb = { storage: banco.storage };
  Store.backend = 'supabase';
  Store.estado = estadoInicial();
  SUPA.podeEditarObra = () => true;
  SUPA.sincronizar = async () => {};
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});
afterEach(() => {
  SUPA.sb = original.sb;
  Store.backend = original.backend;
  SUPA.podeEditarObra = original.podeEditarObra;
  SUPA.sincronizar = original.sincronizar;
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});

describe('fotos do diário: seleção para relatório', () => {
  it('aceita as duas formas e descarta o resto', () => {
    const hoje = '2026-09-27';
    const obra = {
      diario: [
        {
          data: hoje,
          etapa: 'Fundação',
          fotos: [
            { dados: FOTO },
            { dados: 'storage:o1/diario/f1.jpg' },
            { dados: URL_SCRIPT },
            { dados: 'storage:o1/diario/"><img>' },
          ],
        },
      ],
    };
    expect(fotosDaSemana(obra, hoje).map((f) => f.dados)).toEqual([
      FOTO,
      'storage:o1/diario/f1.jpg',
    ]);
    expect(fotosDoPeriodo(obra, '', '').map((f) => f.dados)).toEqual([
      FOTO,
      'storage:o1/diario/f1.jpg',
    ]);
  });
});

describe('fotos do diário no Storage', () => {
  it('com rede: sobe para <obra>/diario/<id>.jpg e a tela já mostra (sem baixar de novo)', async () => {
    const ref = await guardarFotoDiario(FOTO, 'o1', 'foto-1');
    expect(ref).toBe('storage:o1/diario/foto-1.jpg');
    expect(banco.arquivos.has('o1/diario/foto-1.jpg')).toBe(true);
    expect(atribFoto(ref)).toBe(`src="${FOTO}"`);
  });

  it('sem rede: a foto fica no registro e nada sobe', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    expect(await guardarFotoDiario(FOTO, 'o1', 'foto-2')).toBe(FOTO);
    expect(banco.chamadas.upload).toBe(0);
  });

  it('foto do Storage ainda não vista: pixel vazio e o link assinado entra depois', async () => {
    const ref = 'storage:o1/diario/antiga.jpg';
    const atrib = atribFoto(ref);
    expect(atrib).toContain('data-foto-ref="storage:o1/diario/antiga.jpg"');
    document.body.innerHTML = `<img ${atrib} alt="">`;
    await hidratarFotos(document);
    const img = document.querySelector('img');
    expect(img.getAttribute('src')).toBe('https://assinado.exemplo/o1/diario/antiga.jpg');
    expect(img.hasAttribute('data-foto-ref')).toBe(false);
    expect(banco.chamadas.assinar).toBe(1);
  });

  it('data URI continua como antes; texto estranho não vira src', () => {
    expect(atribFoto(FOTO)).toBe(`src="${FOTO}"`);
    expect(atribFoto(URL_SCRIPT)).toBe('src=""');
  });

  it('PDF e WhatsApp recebem os bytes; a que não baixa fica de fora', async () => {
    banco.arquivos.set('o1/diario/x.jpg', new Blob(['jpeg']));
    expect(await fotoComoDataUri('storage:o1/diario/x.jpg')).toMatch(/^data:image\/jpeg;base64,/);
    const prontas = await fotosProntas([
      { dados: 'storage:o1/diario/x.jpg', data: 'd1' },
      { dados: 'storage:o1/diario/sumiu.jpg', data: 'd2' },
      { dados: FOTO, data: 'd3' },
    ]);
    expect(prontas.map((f) => f.data)).toEqual(['d1', 'd3']);
    expect(prontas.every((f) => f.dados.startsWith('data:'))).toBe(true);
  });
});

describe('fotos antigas sobem quando a obra abre', () => {
  const obraCom = (id) => ({
    id,
    diario: [
      {
        id: 'd1',
        fotos: [{ id: 'f1', dados: FOTO }, FOTO2, { id: 'f3', dados: 'storage:x/diario/f3.jpg' }],
      },
    ],
  });

  it('troca as data URIs pela referência, nas duas formas; a do Storage fica', async () => {
    const o = obraCom('o-mig');
    Store.estado.obras = [o];
    expect(await migrarFotosDiario(o)).toBe(2);
    expect(o.diario[0].fotos[0].dados).toBe('storage:o-mig/diario/f1.jpg');
    expect(o.diario[0].fotos[1]).toBe('storage:o-mig/diario/d1-1.jpg');
    expect(o.diario[0].fotos[2].dados).toBe('storage:x/diario/f3.jpg');
    expect(Store.pendente).toBe(true);
    /* uma vez por obra na sessão */
    expect(await migrarFotosDiario(o)).toBe(0);
    expect(banco.chamadas.upload).toBe(2);
  });

  it('quem não edita a obra (cliente) não mexe em nada', async () => {
    SUPA.podeEditarObra = () => false;
    const o = obraCom('o-cli');
    expect(await migrarFotosDiario(o)).toBe(0);
    expect(o.diario[0].fotos[0].dados).toBe(FOTO);
    expect(banco.chamadas.upload).toBe(0);
  });

  it('sem rede não tenta, e tenta de novo quando voltar', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    const o = obraCom('o-off');
    Store.estado.obras = [o];
    expect(await migrarFotosDiario(o)).toBe(0);
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    expect(await migrarFotosDiario(o)).toBe(2);
  });
});
