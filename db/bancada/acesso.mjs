/**
 * Bancada de acesso (0023): PostgreSQL em memória (PGlite) com um esqueleto
 * do Supabase (auth.uid(), papéis anon/authenticated, Storage), as migrações
 * em ordem e duas construtoras (A e B). Cada papel tenta o que não devia —
 * ler, alterar ou apagar dado da outra construtora, escalar privilégio,
 * burlar limite pago — e o que devia continuar podendo (o cliente lê o
 * cronograma, o diário e as parcelas; a equipe trabalha). Depois bloqueia,
 * desliga e exclui contas e confere que o acesso acabou e a obra ficou.
 *
 *   npm i --no-save @electric-sql/pglite@0.2
 *   node db/bancada/acesso.mjs db/migracoes
 *
 * Não entra na CI nem no package.json (zero dependência nova): roda antes
 * de aplicar uma migração que mexe em acesso. Sai com código 1 se algo falha.
 */
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

const MIG = process.argv[2];
const db = new PGlite();
let falhas = 0;
let total = 0;
const escreve = (t) => process.stdout.write(`${t}\n`);
const confere = (nome, ok, detalhe = '') => {
  total++;
  if (!ok) falhas++;
  escreve(`${ok ? 'ok  ' : 'FALHOU'} ${nome}${detalhe ? ' — ' + detalhe : ''}`);
};

await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text, owner uuid);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name, '/') $$;
  grant usage on schema storage to anon, authenticated;
  grant all on storage.objects to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;
  alter default privileges in schema public grant execute on functions to anon, authenticated;
`);
for (const f of fs
  .readdirSync(MIG)
  .filter((f) => /^\d{4}_.*\.sql$/.test(f))
  .sort()) {
  const sql = fs
    .readFileSync(path.join(MIG, f), 'utf8')
    .replace(/create extension if not exists pgcrypto;/g, '');
  try {
    await db.exec(sql);
  } catch (e) {
    escreve(`ERRO em ${f}: ${e.message}`);
    process.exit(1);
  }
}

const q = async (sql) => (await db.query(sql)).rows;
/* roda como um usuário (ou anônimo): papel + sub do JWT; várias instruções */
async function como(uid, sql) {
  const sub = uid === 'anon' ? '' : uid;
  await db.exec(
    `select set_config('request.jwt.claim.sub', '${sub}', false); set role ${uid === 'anon' ? 'anon' : 'authenticated'};`,
  );
  try {
    const r = await db.exec(sql);
    return r.length ? r[r.length - 1].rows : [];
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}
async function tenta(uid, sql) {
  try {
    return { ok: true, rows: await como(uid, sql) };
  } catch (e) {
    return { ok: false, erro: e.message };
  }
}
const quantas = async (uid, sql) => {
  const r = await tenta(uid, sql);
  return r.ok ? r.rows.length : `erro: ${r.erro}`;
};
const conta = async (uid, tabela, filtro) => {
  const r = await tenta(uid, `select count(*)::int c from ${tabela} where ${filtro}`);
  return r.ok ? r.rows[0].c : `erro: ${r.erro.slice(0, 60)}`;
};

/* ------------------------------------------------------------- cenário */
const U = {
  admin: 'a0000000-0000-0000-0000-000000000000',
  gestorA: 'a1000000-0000-0000-0000-000000000000',
  engA: 'a2000000-0000-0000-0000-000000000000',
  cliA: 'a3000000-0000-0000-0000-000000000000',
  gestorB: 'b1000000-0000-0000-0000-000000000000',
  engB: 'b2000000-0000-0000-0000-000000000000',
  solto: 'c0000000-0000-0000-0000-000000000000',
};
await db.exec(
  `insert into auth.users (id, email) values ${Object.entries(U)
    .map(([k, v]) => `('${v}', '${k}@exemplo.com')`)
    .join(',')};`,
);
await db.exec(`alter table public.perfis disable trigger trg_perfil_trava;
  update public.perfis set admin = true where id = '${U.admin}';
  alter table public.perfis enable trigger trg_perfil_trava;`);
const [{ admin_salvar_empresa: empA }] = await como(
  U.admin,
  `select public.admin_salvar_empresa(null, 'Construtora A', null, 'ativo', 3, 3, false)`,
);
const [{ admin_salvar_empresa: empB }] = await como(
  U.admin,
  `select public.admin_salvar_empresa(null, 'Construtora B', null, 'ativo', 3, 3, false)`,
);
for (const [u, e, p] of [
  [U.gestorA, empA, 'gestor'],
  [U.engA, empA, 'engenheiro'],
  [U.gestorB, empB, 'gestor'],
  [U.engB, empB, 'engenheiro'],
]) {
  await como(U.admin, `select public.admin_definir_usuario_empresa('${u}', '${e}', '${p}')`);
}
/* oA1 criada pelo engenheiro da A; oA2 pelo gestor da A; oB1 pelo gestor da B */
await como(
  U.engA,
  `insert into public.obras (id, nome, usuario_id) values ('oA1', 'Obra A1', '${U.engA}')`,
);
await como(
  U.gestorA,
  `insert into public.obras (id, nome, usuario_id) values ('oA2', 'Obra A2', '${U.gestorA}')`,
);
await como(
  U.gestorB,
  `insert into public.obras (id, nome, usuario_id) values ('oB1', 'Obra B1', '${U.gestorB}')`,
);
await como(U.gestorA, `select * from public.convidar_membro('oA1', 'cliA@exemplo.com', 'cliente')`);
for (const [u, o, s] of [
  [U.engA, 'oA1', 'a1'],
  [U.gestorA, 'oA2', 'a2'],
  [U.gestorB, 'oB1', 'b1'],
]) {
  await como(
    u,
    `
    insert into public.contratos (id, obra_id, codigo, usuario_id) values ('ct-${s}', '${o}', 'CT-${s}', '${u}');
    insert into public.lancamentos (id, obra_id, usuario_id, descricao) values ('l-${s}', '${o}', '${u}', 'Cimento');
    insert into public.recebimentos (id, obra_id, usuario_id) values ('r-${s}', '${o}', '${u}');
    insert into public.diario (id, obra_id, usuario_id, data) values ('d-${s}', '${o}', '${u}', current_date);
    insert into public.cronograma (id, obra_id, usuario_id, etapa) values ('e-${s}', '${o}', '${u}', 'Fundação');`,
  );
  await db.exec(
    `insert into storage.objects (bucket_id, name) values ('anexos', '${o}/nf/nf-${s}.pdf'), ('anexos', '${o}/diario/foto-${s}.jpg')`,
  );
}
await como(
  U.gestorA,
  `insert into public.clientes (id, nome) values ('cli-a', 'Cliente da A');
  insert into public.prestadores (id, nome) values ('pr-a', 'Prestador da A');`,
);

const donos =
  await q(`select m.obra_id from public.obra_membros m join public.obras o on o.id = m.obra_id
  where o.empresa_id is not null and m.papel in ('dono', 'engenheiro')`);
confere(
  'obra de construtora não ganha dono individual',
  donos.length === 0,
  `${donos.length} vínculo(s)`,
);

/* ------------------------------------------- 1. isolamento entre construtoras */
const TABELAS_OBRA = [
  'obras',
  'contratos',
  'lancamentos',
  'recebimentos',
  'diario',
  'obra_membros',
  'auditoria',
  'medicoes',
  'materiais',
  'cronograma',
  'pendencias_cliente',
  'alertas_tratamento',
  'relatorios_gerados',
];
for (const t of TABELAS_OBRA) {
  const c = await conta(
    U.gestorB,
    `public.${t}`,
    `${t === 'obras' ? 'id' : 'obra_id'} in ('oA1','oA2')`,
  );
  confere(`gestor da B não lê ${t} da A`, c === 0, `vê ${c}`);
}
for (const [t, f] of [
  ['clientes', "id = 'cli-a'"],
  ['prestadores', "id = 'pr-a'"],
  ['empresas', `id = '${empA}'`],
  ['perfis', `id in ('${U.gestorA}','${U.engA}')`],
]) {
  const c = await conta(U.gestorB, `public.${t}`, f);
  confere(`gestor da B não lê ${t} da A`, c === 0, `vê ${c}`);
}
for (const v of [
  'vw_contratos',
  'vw_lancamentos',
  'vw_resumo_obra',
  'vw_fluxo_mensal',
  'vw_posicao_contratual',
]) {
  const c = await conta(U.gestorB, `public.${v}`, `obra_id in ('oA1','oA2')`);
  confere(
    `gestor da B não lê a view ${v} da A`,
    c === 0 || String(c).startsWith('erro'),
    `resultado ${c}`,
  );
}
confere(
  'gestor da B não altera lançamento da A',
  (await quantas(
    U.gestorB,
    `update public.lancamentos set descricao = 'x' where obra_id = 'oA1' returning id`,
  )) === 0,
);
confere(
  'gestor da B não apaga obra da A',
  (await quantas(U.gestorB, `delete from public.obras where id = 'oA1' returning id`)) === 0,
);
confere(
  'gestor da B não insere lançamento na obra da A',
  !(
    await tenta(
      U.gestorB,
      `insert into public.lancamentos (id, obra_id, descricao) values ('l-inj', 'oA1', 'x')`,
    )
  ).ok,
);
confere(
  'gestor da B não se põe como membro da obra da A',
  !(
    await tenta(
      U.gestorB,
      `insert into public.obra_membros (obra_id, usuario_id, papel) values ('oA1', '${U.gestorB}', 'cliente')`,
    )
  ).ok,
);
confere(
  'gestor da B não lista membros da obra da A',
  (await quantas(U.gestorB, `select * from public.membros_da_obra('oA1')`)) === 0,
);
confere(
  'gestor da B não convida para a obra da A',
  !(
    await tenta(
      U.gestorB,
      `select * from public.convidar_membro('oA1', 'solto@exemplo.com', 'cliente')`,
    )
  ).ok,
);
confere(
  'gestor da B não lê anexo da A',
  (await conta(U.gestorB, 'storage.objects', "name like 'oA%'")) === 0,
);
confere(
  'gestor da B não grava anexo na pasta da A',
  !(
    await tenta(
      U.gestorB,
      `insert into storage.objects (bucket_id, name) values ('anexos', 'oA1/nf/falso.pdf')`,
    )
  ).ok,
);
confere(
  'gestor da B não apaga anexo da A',
  (await quantas(
    U.gestorB,
    `delete from storage.objects where name like 'oA1/%' returning name`,
  )) === 0,
);

/* ------------------------------------------------------------ 2. anônimo */
const vazou = [];
for (const t of [...TABELAS_OBRA, 'clientes', 'prestadores', 'empresas', 'perfis']) {
  const c = await conta('anon', `public.${t}`, 'true');
  if (c !== 0 && !String(c).startsWith('erro')) vazou.push(`${t}:${c}`);
}
confere('anônimo não lê nenhuma tabela', vazou.length === 0, vazou.join(' '));
confere(
  'anônimo não cria obra',
  !(await tenta('anon', `insert into public.obras (id, nome) values ('oN', 'x')`)).ok,
);
confere(
  'anônimo não chama RPC de admin',
  !(await tenta('anon', `select * from public.admin_empresas()`)).ok,
);
confere('anônimo não lê anexos', (await conta('anon', 'storage.objects', 'true')) === 0);

/* -------------------------------------------------------- 3. equipe trabalha */
confere(
  'engenheiro da A lê e grava na obra que outro criou',
  (await conta(U.engA, 'public.lancamentos', "obra_id = 'oA2'")) === 1 &&
    (
      await tenta(
        U.engA,
        `insert into public.lancamentos (id, obra_id, usuario_id, descricao) values ('l-eng', 'oA2', '${U.engA}', 'Areia')`,
      )
    ).ok,
);
confere(
  'engenheiro da A não apaga obra (só o gestor)',
  (await quantas(U.engA, `delete from public.obras where id = 'oA1' returning id`)) === 0,
);
confere(
  'engenheiro da A lê a NF da obra',
  (await conta(U.engA, 'storage.objects', "name = 'oA2/nf/nf-a2.pdf'")) === 1,
);

/* ---------------------------------------------------------- 4. cliente final */
for (const t of [
  'lancamentos',
  'contratos',
  'medicoes',
  'materiais',
  'auditoria',
  'alertas_tratamento',
  'relatorios_gerados',
]) {
  const c = await conta(U.cliA, `public.${t}`, "obra_id = 'oA1'");
  confere(`cliente final não lê ${t}`, c === 0, `vê ${c}`);
}
confere(
  'cliente final não lê prestadores da obra',
  (await conta(U.cliA, 'public.prestadores', 'true')) === 0,
);
confere(
  'cliente final não lê a NF',
  (await conta(U.cliA, 'storage.objects', "name = 'oA1/nf/nf-a1.pdf'")) === 0,
);
for (const t of ['obras', 'cronograma', 'diario', 'recebimentos']) {
  const c = await conta(U.cliA, `public.${t}`, `${t === 'obras' ? 'id' : 'obra_id'} = 'oA1'`);
  confere(`cliente final continua lendo ${t} (tela e relatório de status)`, c === 1, `vê ${c}`);
}
confere(
  'cliente final continua vendo a foto do diário',
  (await conta(U.cliA, 'storage.objects', "name = 'oA1/diario/foto-a1.jpg'")) === 1,
);
confere(
  'cliente final não escreve lançamento',
  !(
    await tenta(
      U.cliA,
      `insert into public.lancamentos (id, obra_id, descricao) values ('l-cli', 'oA1', 'x')`,
    )
  ).ok,
);
confere(
  'cliente final não altera a obra',
  (await quantas(U.cliA, `update public.obras set nome = 'x' where id = 'oA1' returning id`)) === 0,
);
confere(
  'cliente final não lê outra obra da construtora',
  (await conta(U.cliA, 'public.obras', "id = 'oA2'")) === 0,
);
const emails = await como(
  U.cliA,
  `select email from public.membros_da_obra('oA1') where email is not null`,
);
confere(
  'cliente final não vê e-mail de ninguém em membros_da_obra',
  emails.length === 0,
  `${emails.length} e-mail(s)`,
);
const equipe = await como(
  U.gestorA,
  `select usuario_id, email, papel, origem from public.membros_da_obra('oA1')`,
);
confere(
  'a equipe continua vendo o e-mail do cliente convidado',
  equipe.some(
    (m) => m.usuario_id === U.cliA && m.email === 'cliA@exemplo.com' && m.origem === 'obra',
  ),
);
confere(
  'membros_da_obra traz a equipe da construtora (trilha de auditoria com nome)',
  equipe.some((m) => m.usuario_id === U.gestorA && m.origem === 'construtora:gestor') &&
    equipe.some(
      (m) =>
        m.usuario_id === U.engA &&
        m.origem === 'construtora:engenheiro' &&
        m.email === 'engA@exemplo.com',
    ),
);
const equipeCli = await como(U.cliA, `select origem from public.membros_da_obra('oA1')`);
confere(
  'o cliente não recebe a lista da equipe da construtora',
  equipeCli.every((m) => m.origem === 'obra'),
);

/* ------------------------------------------------- 5. conta sem construtora */
confere(
  'conta sem construtora não cria obra',
  !(
    await tenta(
      U.solto,
      `insert into public.obras (id, nome, usuario_id) values ('oS', 'x', '${U.solto}')`,
    )
  ).ok,
);
confere('conta sem construtora não lê nada', (await conta(U.solto, 'public.obras', 'true')) === 0);

/* ---------------------------------------------------- 6. escalada e limites */
await tenta(
  U.engA,
  `update public.perfis set admin = true, empresa_id = '${empB}', papel_empresa = 'gestor' where id = '${U.engA}'`,
);
const pe = (
  await q(`select admin, papel_empresa, empresa_id from public.perfis where id = '${U.engA}'`)
)[0];
confere(
  'engenheiro não se promove pelo próprio perfil',
  !pe.admin && pe.papel_empresa === 'engenheiro' && pe.empresa_id === empA,
);
await tenta(
  U.gestorA,
  `update public.empresas set limite_obras = 999, limite_usuarios = 999 where id = '${empA}'`,
);
const ea = (
  await q(`select limite_obras, limite_usuarios from public.empresas where id = '${empA}'`)
)[0];
confere(
  'gestor não aumenta os próprios limites',
  ea.limite_obras === 3 && ea.limite_usuarios === 3,
);
confere(
  'gestor não cria construtora',
  !(await tenta(U.gestorA, `insert into public.empresas (nome) values ('Pirata')`)).ok,
);
await tenta(U.engA, `update public.obras set empresa_id = '${empB}' where id = 'oA1'`);
confere(
  'ninguém muda a construtora de uma obra',
  (await q(`select empresa_id from public.obras where id = 'oA1'`))[0].empresa_id === empA,
);
await como(
  U.gestorA,
  `insert into public.obras (id, nome, usuario_id) values ('oA3', 'Obra A3', '${U.gestorA}')`,
);
confere(
  'limite de obras vale na API',
  !(
    await tenta(
      U.gestorA,
      `insert into public.obras (id, nome, usuario_id) values ('oA4', 'x', '${U.gestorA}')`,
    )
  ).ok,
);
confere(
  'gestor não dá acesso de engenheiro a alguém de fora (vaga)',
  !(
    await tenta(
      U.gestorA,
      `insert into public.obra_membros (obra_id, usuario_id, papel) values ('oA2', '${U.solto}', 'engenheiro')`,
    )
  ).ok,
);
confere(
  'gestor não põe gente de fora como dona',
  !(
    await tenta(
      U.gestorA,
      `insert into public.obra_membros (obra_id, usuario_id, papel) values ('oA2', '${U.gestorB}', 'dono')`,
    )
  ).ok,
);
confere(
  'gestor não promove o cliente a engenheiro',
  (await quantas(
    U.gestorA,
    `update public.obra_membros set papel = 'engenheiro' where usuario_id = '${U.cliA}' returning id`,
  )) === 'erro: new row violates row-level security policy for table "obra_membros"' ||
    (await q(`select papel from public.obra_membros where usuario_id = '${U.cliA}'`))[0].papel ===
      'cliente',
);
const conv = await tenta(
  U.gestorA,
  `select * from public.convidar_membro('oA2', 'naoexiste@exemplo.com', 'cliente')`,
);
confere(
  'convite não diz se o e-mail tem conta',
  !conv.ok && !/Não existe conta/.test(conv.erro),
  conv.ok ? '' : conv.erro.slice(0, 50),
);

/* -------------------------------------------- 7. bloqueio, desligamento, exclusão */
await como(
  U.admin,
  `select public.admin_definir_perfil('${U.engA}', 'ativo', true, '{}'::jsonb, null)`,
);
confere(
  'engenheiro BLOQUEADO não lê a obra que criou',
  (await conta(U.engA, 'public.lancamentos', "obra_id = 'oA1'")) === 0 &&
    (await conta(U.engA, 'public.obras', "id = 'oA1'")) === 0,
);
confere(
  'engenheiro BLOQUEADO não grava',
  !(
    await tenta(
      U.engA,
      `insert into public.lancamentos (id, obra_id, usuario_id, descricao) values ('l-bl', 'oA1', '${U.engA}', 'x')`,
    )
  ).ok,
);
confere(
  'engenheiro BLOQUEADO não apaga a obra',
  (await quantas(U.engA, `delete from public.obras where id = 'oA1' returning id`)) === 0,
);
confere(
  'engenheiro BLOQUEADO não cria obra',
  !(
    await tenta(
      U.engA,
      `insert into public.obras (id, nome, usuario_id) values ('oBl', 'x', '${U.engA}')`,
    )
  ).ok,
);
confere(
  'engenheiro BLOQUEADO não lê o cliente que criou',
  (await conta(U.engA, 'public.clientes', 'true')) === 0,
);
confere(
  'a obra dele continua lá para a construtora',
  (await conta(U.gestorA, 'public.lancamentos', "obra_id = 'oA1'")) === 1,
);

await como(
  U.admin,
  `select public.admin_salvar_empresa('${empA}', 'Construtora A', null, 'ativo', 3, 3, true)`,
);
confere(
  'construtora BLOQUEADA: gestor não lê nem grava',
  (await conta(U.gestorA, 'public.lancamentos', "obra_id = 'oA2'")) === 0 &&
    !(
      await tenta(
        U.gestorA,
        `insert into public.lancamentos (id, obra_id, usuario_id, descricao) values ('l-eb', 'oA2', '${U.gestorA}', 'x')`,
      )
    ).ok,
);
confere(
  'construtora BLOQUEADA: gestor não baixa anexo',
  (await conta(U.gestorA, 'storage.objects', "name like 'oA2/%'")) === 0,
);
confere(
  'construtora BLOQUEADA: o cliente dela também para',
  (await conta(U.cliA, 'public.obras', "id = 'oA1'")) === 0,
);
await como(
  U.admin,
  `select public.admin_salvar_empresa('${empA}', 'Construtora A', null, 'ativo', 3, 3, false)`,
);
confere(
  'construtora desbloqueada: gestor volta',
  (await conta(U.gestorA, 'public.lancamentos', "obra_id = 'oA2'")) >= 1,
);

const dsl = await tenta(
  U.admin,
  `select public.admin_definir_usuario_empresa('${U.gestorA}', null, null)`,
);
confere('admin desliga da construtora quem criou obras', dsl.ok, dsl.ok ? '' : dsl.erro);
confere(
  'desligado não acessa mais as obras que criou',
  (await conta(U.gestorA, 'public.obras', "id in ('oA2','oA3')")) === 0 &&
    (await conta(U.gestorA, 'public.lancamentos', "obra_id = 'oA2'")) === 0,
);
confere(
  'as obras continuam da construtora',
  (await q(`select count(*)::int c from public.obras where empresa_id = '${empA}'`))[0].c === 3,
);

let exc = null;
try {
  await db.exec(`delete from auth.users where id = '${U.gestorB}'`);
} catch (e) {
  exc = e.message;
}
confere('excluir a conta de quem criou uma obra funciona', !exc, exc || '');
confere(
  'a obra continua existindo, sem autor',
  (await q(`select usuario_id from public.obras where id = 'oB1'`))[0]?.usuario_id === null,
);

/* --------------------------------------------------------- 8. obra avulsa */
await db.exec(`alter table public.perfis disable trigger trg_perfil_trava;
  update public.perfis set limite_obras = null where id = '${U.admin}';
  alter table public.perfis enable trigger trg_perfil_trava;`);
await como(U.admin, `select public.admin_definir_usuario_empresa('${U.admin}', null, null)`).catch(
  () => {},
);
const av = await tenta(
  U.admin,
  `insert into public.obras (id, nome, usuario_id) values ('oAv', 'Avulsa', '${U.admin}')`,
);
if (av.ok) {
  const dono = await q(`select papel from public.obra_membros where obra_id = 'oAv'`);
  confere(
    'obra avulsa continua com dono individual',
    dono.length === 1 && dono[0].papel === 'dono',
  );
  confere(
    'dono da obra avulsa lê e grava',
    (
      await tenta(
        U.admin,
        `insert into public.lancamentos (id, obra_id, usuario_id, descricao) values ('l-av', 'oAv', '${U.admin}', 'x')`,
      )
    ).ok && (await conta(U.admin, 'public.lancamentos', "obra_id = 'oAv'")) === 1,
  );
  confere(
    'obra avulsa não fica sem dono',
    !(
      await tenta(
        U.admin,
        `delete from public.obra_membros where obra_id = 'oAv' and papel = 'dono'`,
      )
    ).ok,
  );
}

/* ------------------------------------------------------ 9. roda de novo */
let de_novo = null;
try {
  await db.exec(fs.readFileSync(path.join(MIG, '0023_acesso_pela_construtora.sql'), 'utf8'));
} catch (e) {
  de_novo = e.message;
}
confere('0023 roda de novo sem quebrar', !de_novo, de_novo || '');
confere(
  'depois de rodar de novo, o acesso continua o mesmo',
  (await conta(U.engB, 'public.obras', "id = 'oB1'")) === 1 &&
    (await conta(U.cliA, 'public.lancamentos', 'true')) === 0,
);

/* ----------------------------------------- 10. contrato anexado e mão de obra (0025) */
if (fs.existsSync(path.join(MIG, '0025_mao_de_obra_e_contrato_anexo.sql'))) {
  await db.exec(`insert into storage.objects (bucket_id, name) values ('anexos', 'oB1/contratos/ct-b1.pdf')`);
  confere('equipe lê o contrato anexado da obra', (await conta(U.engB, 'storage.objects', "name = 'oB1/contratos/ct-b1.pdf'")) === 1);
  confere('equipe grava contrato na pasta da obra', (await tenta(U.engB, `insert into storage.objects (bucket_id, name) values ('anexos', 'oB1/contratos/novo.pdf')`)).ok);
  await como(U.admin, `select public.admin_definir_usuario_empresa('${U.cliA}', null, null)`).catch(() => {});
  await db.exec(`insert into public.obra_membros (obra_id, usuario_id, papel) values ('oB1', '${U.cliA}', 'cliente') on conflict do nothing`);
  confere('cliente final não lê o contrato anexado', (await conta(U.cliA, 'storage.objects', "name like 'oB1/contratos/%'")) === 0);
  confere('cliente final continua vendo a obra', (await conta(U.cliA, 'public.obras', "id = 'oB1'")) === 1);
  const lanc = (mo) =>
    tenta(U.engB, `insert into public.lancamentos (id, obra_id, usuario_id, descricao, tipo, quantidade, preco_unitario, valor_mao_de_obra)
      values ('l-mo-${String(mo).replace('.', '_')}', 'oB1', '${U.engB}', 'Bancada de mármore instalada', 'Fornecimento + instalação', 1, 3000, ${mo})`);
  confere('lançamento com parte de instalação dentro do total grava', (await lanc(800)).ok);
  confere('parte de instalação maior que o total é recusada (CHECK)', !(await lanc(3500)).ok);
  confere('parte de instalação negativa é recusada (CHECK)', !(await lanc(-1)).ok);
  const ct = (campo, valor) =>
    tenta(U.engB, `update public.contratos set ${campo} = '${valor}' where id = 'ct-b1'`);
  confere('contrato aceita anexo na pasta contratos/', (await ct('anexo', 'storage:oB1/contratos/ct-b1.pdf')).ok);
  confere('contrato recusa anexo em outra pasta (CHECK)', !(await ct('anexo', 'storage:oB1/lancamentos/x.pdf')).ok);
  confere('contrato aceita link https', (await ct('documento_url', 'https://drive.exemplo.com/contrato.pdf')).ok);
  confere('contrato recusa link javascript: (CHECK)', !(await ct('documento_url', 'java' + 'script:alert(1)')).ok);
  let de_novo25 = null;
  try {
    await db.exec(fs.readFileSync(path.join(MIG, '0025_mao_de_obra_e_contrato_anexo.sql'), 'utf8'));
  } catch (e) {
    de_novo25 = e.message;
  }
  confere('0025 roda de novo sem quebrar', !de_novo25, de_novo25 || '');
}

escreve(`\n${total - falhas} de ${total} conferências ok`);
if (falhas) {
  escreve(`${falhas} FALHA(S)`);
  process.exit(1);
}
