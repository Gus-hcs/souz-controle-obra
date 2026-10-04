// Avaliação do "Perguntar" (IA, 0028) com a API da Anthropic de verdade:
// 26 perguntas sobre obras INVENTADAS (tests/ia/perguntas.js). Usa a mesma
// ponte da função (processarPergunta) e as mesmas ferramentas do app
// (conversarComIa / executarFerramenta). Custa centavos por rodada.
//
// Fora da CI. Na raiz, com a chave em supabase/.env:
//   npm i --no-save @anthropic-ai/sdk@0.129.0
//   node tests/ia/avaliar-perguntas.mjs                  (Sonnet 5)
//   node tests/ia/avaliar-perguntas.mjs claude-haiku-4-5
//
// Nota por pergunta: a ferramenta certa foi usada, o número/nome esperado
// aparece, nenhum número sem origem (a conferência da função) e, nas
// armadilhas, recusa honesta sem número inventado. A chave nunca é impressa.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const RAIZ = process.cwd();
const imp = (p) => import(pathToFileURL(path.join(RAIZ, p)).href);
const ponte = await imp('supabase/functions/ia/perguntas.js');
const { conversarComIa } = await imp('src/dominio/assistente.js');
const { numerosSemOrigem } = await imp('src/dominio/validacao.js');
const { HOJE, carteira, casos, RECUSA } = await imp('tests/ia/perguntas.js');

const chave = (() => {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  const arq = path.join(RAIZ, 'supabase/.env');
  const m = fs.existsSync(arq) && fs.readFileSync(arq, 'utf8').match(/^ANTHROPIC_API_KEY=(.+)$/m);
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
  Anthropic = (await imp('node_modules/@anthropic-ai/sdk/index.mjs')).default;
} catch {
  console.error('Instale o SDK só para a avaliação: npm i --no-save @anthropic-ai/sdk@0.129.0');
  process.exit(1);
}
const cliente = new Anthropic({ apiKey: chave });
const modelo = process.argv[2] || ponte.MODELO_PERGUNTA;
const so = process.argv[3] ? new Set(process.argv[3].split(',')) : null;

let custo = 0;
let ms = 0;
let certas = 0;
let inventados = 0;
const linhas = [];
/* a MESMA carteira para os casos e para as respostas: os ids das obras
   são gerados na hora, e a obra aberta precisa casar */
const estado = carteira();
const lista = casos(estado).filter((c) => !so || so.has(c.id));
for (const c of lista) {
  const usadas = [];
  const fontes = [];
  const dep = {
    agora: () => Date.now(),
    anthropic: cliente,
    reservar: async () => '11111111-1111-1111-1111-111111111111',
    continuar: async () => 0,
    somar: async (id, st, mod, ent, sai, cst, t) => {
      custo += cst;
      ms += t;
    },
  };
  let r;
  let erro = '';
  const inicio = Date.now();
  try {
    r = await conversarComIa(c.pergunta, {
      estado,
      contexto: { ...c.ctx, hoje: HOJE },
      enviar: async (corpo) => {
        if (!corpo.id) fontes.push(ponte.lerPedidoPergunta(corpo).mensagens[0].content[0].text);
        if (corpo.mensagens) {
          corpo.mensagens.at(-1).content.forEach((b) => fontes.push(b.content));
        }
        const resp = await ponte.processarPergunta(corpo, dep, modelo);
        (resp.pedidos || []).forEach((p) => usadas.push(p.nome));
        return resp;
      },
    });
  } catch (e) {
    erro = `${e.status || ''} ${e.message}`.trim();
  }
  const t = ((Date.now() - inicio) / 1000).toFixed(1);
  if (!r) {
    linhas.push(`✗ ${c.id} ${c.pergunta} — ERRO ${erro}`);
    continue;
  }
  const resp = r.resposta;
  const semOrigem = r.seguro ? numerosSemOrigem(resp, [c.pergunta, ...fontes]) : [];
  if (semOrigem.length) inventados++;
  const falhas = [];
  if (c.ferramentas && !c.ferramentas.some((n) => usadas.includes(n)))
    falhas.push(`ferramenta (usou: ${usadas.join(',') || 'nenhuma'})`);
  (c.espera || []).forEach((x) => {
    const txt = String(x);
    const ok = /\d/.test(txt)
      ? numerosSemOrigem(txt, [resp]).length === 0
      : resp.toLowerCase().includes(txt.toLowerCase());
    if (!ok) falhas.push(`faltou "${txt}"`);
  });
  if (c.recusa && !RECUSA.test(resp)) falhas.push('não recusou');
  (c.proibido || []).forEach((x) => resp.includes(x) && falhas.push(`disse "${x}"`));
  if (semOrigem.length) falhas.push(`número sem origem: ${semOrigem.join(', ')}`);
  if (!r.seguro && !c.armadilha) falhas.push('conferência barrou a resposta');
  if (!falhas.length) certas++;
  linhas.push(
    `${falhas.length ? '✗' : '✓'} ${c.id} (${t}s, ${usadas.length} consultas) ${c.pergunta}\n    → ${resp.replace(/\n/g, ' ').slice(0, 220)}${falhas.length ? `\n    ✗ ${falhas.join('; ')}` : ''}`,
  );
}

console.log(`Modelo: ${modelo}\n`);
console.log(linhas.join('\n'));
console.log(`\nCertas: ${certas} de ${lista.length}`);
console.log(`Respostas com número sem origem que passaram: ${inventados}`);
console.log(
  `Custo da rodada: US$ ${custo.toFixed(4)} (≈ US$ ${(custo / lista.length).toFixed(4)} por pergunta)`,
);
console.log(`Tempo de IA médio: ${(ms / lista.length / 1000).toFixed(1)} s por pergunta`);
console.log('Meta: zero número inventado e pelo menos 24 de 26.');
