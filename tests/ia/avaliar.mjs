// Avaliação da leitura de nota por IA (0027) contra 10 notas INVENTADAS
// (tests/ia/casos.js), com a API da Anthropic de verdade. Custa centavos:
// ~US$ 0,20 por modelo na rodada inteira.
//
// Não entra na CI. Na raiz, com a chave em supabase/.env (ANTHROPIC_API_KEY):
//   npm i --no-save @anthropic-ai/sdk@0.129.0
//   node tests/ia/avaliar.mjs                      (Sonnet 5, o da função)
//   node tests/ia/avaliar.mjs claude-haiku-4-5     (para comparar)
//
// Usa exatamente o pedido da função (montarPedidoNota, mesma instrução e
// mesmo esquema) e a mesma validação. Imprime o acerto por campo e por
// nota, o custo e o tempo. A chave nunca é impressa.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const RAIZ = process.cwd();
const imp = (p) => import(pathToFileURL(path.join(RAIZ, p)).href);
const nucleo = await imp('supabase/functions/ia/leitura.js');
const { CASOS, htmlDoCaso, gabarito } = await imp('tests/ia/casos.js');
const pw = (await imp('node_modules/playwright/index.js')).default;

const chave = (() => {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  const arq = path.join(RAIZ, 'supabase/.env');
  if (!fs.existsSync(arq)) return '';
  const m = fs.readFileSync(arq, 'utf8').match(/^ANTHROPIC_API_KEY=(.+)$/m);
  return m ? m[1].trim() : '';
})();
if (!chave) {
  console.error(
    'Sem chave: cole a ANTHROPIC_API_KEY em supabase/.env (esse arquivo não vai para o git).',
  );
  process.exit(1);
}
let Anthropic;
try {
  Anthropic = (await import('@anthropic-ai/sdk')).default;
} catch {
  console.error('Instale o SDK só para a avaliação: npm i --no-save @anthropic-ai/sdk@0.129.0');
  process.exit(1);
}
const cliente = new Anthropic({ apiKey: chave });
const modelo = process.argv[2] || nucleo.MODELOS.nota;
const PASTA = fs.mkdtempSync(path.join(os.tmpdir(), 'souz-ia-aval-'));

/* ------------------------------------------------ gerar os documentos */
const nav = await pw.chromium.launch();
async function gerar(c) {
  const p = await nav.newPage({ viewport: { width: 1500, height: 1100 }, deviceScaleFactor: 1 });
  await p.setContent(htmlDoCaso(c));
  if (c.formato === 'pdf') {
    const arq = path.join(PASTA, `${c.id}.pdf`);
    await p.pdf({ path: arq, width: '1500px', printBackground: true });
    await p.close();
    return arq;
  }
  if (c.distorcer) {
    await p.evaluate(() => {
      document.body.style.transform = 'rotate(-4deg) translate(30px, 40px)';
      document.body.style.filter = 'brightness(0.62) contrast(0.85) blur(0.6px)';
    });
  }
  const arq = path.join(PASTA, `${c.id}.jpg`);
  const alvo =
    c.formato === 'cupom'
      ? '.c'
      : c.formato === 'recibo'
        ? '.r'
        : c.formato === 'parede'
          ? '.p'
          : '.nf';
  const el = await p.$(alvo);
  const caixa = await el.boundingBox();
  const clip = c.cortar ? { ...caixa, height: caixa.height * 0.62 } : caixa;
  await p.screenshot({ path: arq, type: 'jpeg', quality: 78, clip });
  await p.close();
  return arq;
}

/* ------------------------------------------------------------ nota */
const txt = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
const igualNum = (a, b) =>
  (a == null && b == null) || (a != null && b != null && Math.abs(a - b) <= 0.011);

function comparar(g, l) {
  const r = [];
  const marca = (campo, ok) => r.push({ campo, ok });
  marca('legivel', l.legivel === g.legivel);
  if (!g.legivel) return r;
  marca('tipoDocumento', l.tipoDocumento === g.tipoDocumento);
  marca('fornecedor', !!l.fornecedor && txt(l.fornecedor).includes(txt(g.fornecedor).slice(0, 12)));
  marca('cnpj', (l.cnpj || null) === (g.cnpj || null));
  marca(
    'numero',
    (String(l.numero || '')
      .replace(/\D/g, '')
      .replace(/^0+/, '') || null) === g.numero,
  );
  marca('dataEmissao', l.dataEmissao === g.dataEmissao);
  marca('totalNota', igualNum(l.totalNota, g.totalNota));
  marca('desconto', igualNum(l.desconto || null, g.desconto || null));
  marca('frete', igualNum(l.frete || null, g.frete || null));
  marca('itens.qtd', (l.itens || []).length === g.itens.length);
  g.itens.forEach((gi, i) => {
    const li = (l.itens || [])[i] || {};
    marca('item.valorTotal', igualNum(li.valorTotal, gi.valorTotal));
    marca('item.quantidade', igualNum(li.quantidade, gi.quantidade));
    marca('item.descricao', txt(li.descricao).includes(txt(gi.descricao).slice(0, 10)));
    marca('item.servico', li.servico === gi.servico);
    if (gi.valorServico != null)
      marca('item.valorServico', igualNum(li.valorServico, gi.valorServico));
  });
  return r;
}

/* ------------------------------------------------------------ rodada */
console.log(`Modelo: ${modelo} · documentos em ${PASTA}\n`);
const porCampo = {};
let custo = 0;
let ms = 0;
let notasPerfeitas = 0;
const contexto = {
  etapas: ['Fundação', 'Estrutura', 'Fechamento/alvenaria', 'Cobertura', 'Pintura'],
  materiais: [],
  formasPagamento: ['PIX', 'Dinheiro', 'Cartão', 'Boleto', 'Transferência'],
};
for (const c of CASOS) {
  const arq = await gerar(c);
  const bytes = new Uint8Array(fs.readFileSync(arq));
  const tipo = nucleo.tipoDoArquivo(bytes, arq);
  const inicio = Date.now();
  let leitura;
  let erro = '';
  try {
    const resp = await cliente.messages.create(
      nucleo.montarPedidoNota(bytes, tipo, contexto, modelo),
    );
    custo += nucleo.custoUsd(modelo, resp.usage);
    const bloco = resp.content.find((b) => b.type === 'text');
    leitura = nucleo.normalizarLeitura(JSON.parse(bloco.text));
    const probs = nucleo.validarLeituraNota(leitura);
    if (probs.length) erro = `fora do esquema: ${probs.map((p) => p.campo).join(', ')}`;
  } catch (e) {
    erro = `${e.status || ''} ${e.message}`.trim();
  }
  ms += Date.now() - inicio;
  if (!leitura) {
    console.log(`✗ ${c.id}: ${erro}`);
    continue;
  }
  const r = comparar(gabarito(c), leitura);
  r.forEach(({ campo, ok }) => {
    porCampo[campo] = porCampo[campo] || { ok: 0, total: 0 };
    porCampo[campo].total++;
    if (ok) porCampo[campo].ok++;
  });
  const erros = r.filter((x) => !x.ok).map((x) => x.campo);
  if (!erros.length && !erro) notasPerfeitas++;
  console.log(
    `${erros.length || erro ? '✗' : '✓'} ${c.id}${erros.length ? ` — errou: ${[...new Set(erros)].join(', ')}` : ''}${erro ? ` — ${erro}` : ''}${leitura.incertos && leitura.incertos.length ? ` · incertos: ${leitura.incertos.join(', ')}` : ''}`,
  );
}
await nav.close();

console.log('\nAcerto por campo:');
for (const [campo, v] of Object.entries(porCampo)) {
  console.log(
    `  ${campo.padEnd(18)} ${String(v.ok).padStart(3)}/${v.total}  ${((100 * v.ok) / v.total).toFixed(0)}%`,
  );
}
console.log(`\nNotas 100% certas: ${notasPerfeitas} de ${CASOS.length}`);
console.log(
  `Custo da rodada: US$ ${custo.toFixed(4)} (≈ US$ ${(custo / CASOS.length).toFixed(4)} por nota)`,
);
console.log(`Tempo médio: ${(ms / CASOS.length / 1000).toFixed(1)} s por nota`);
console.log('Meta para ligar para clientes: total e data 100%; demais campos ≥ 95%.');
