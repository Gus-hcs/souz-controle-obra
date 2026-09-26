/**
 * Bancada da 0021 (construtoras): PostgreSQL em memória (PGlite) com um
 * esqueleto do Supabase (auth.uid(), papéis anon/authenticated, Storage),
 * as migrações 0001–0021 em ordem sobre o cenário de produção de set/2026 e
 * as regras testadas logado como cada usuário — acesso, vaga, limite de
 * obras, convite, bloqueio, exclusão de conta e reexecução da migração.
 *
 *   npm i --no-save @electric-sql/pglite@0.2
 *   node db/bancada/construtoras.mjs db/migracoes
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
const escreve = (t) => process.stdout.write(`${t}\n`);
const confere = (nome, ok, detalhe = '') => {
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
  create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name, '/') $$;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;
  alter default privileges in schema public grant execute on functions to anon, authenticated;
`);

const rodar = async (arq) => {
  let sql = fs.readFileSync(path.join(MIG, arq), 'utf8');
  sql = sql.replace(/create extension if not exists pgcrypto;/g, '');
  try {
    await db.exec(sql);
    return true;
  } catch (e) {
    escreve(`ERRO em ${arq}: ${e.message}`);
    falhas++;
    return false;
  }
};

const arquivos = fs
  .readdirSync(MIG)
  .filter((f) => /^\d{4}_.*\.sql$/.test(f))
  .sort();
for (const f of arquivos.filter((f) => f < '0021')) await rodar(f);

/* ---------------------------------------- cenário de produção + convites */
const U = {
  admin: '11111111-1111-1111-1111-111111111111',
  souz2: '22222222-2222-2222-2222-222222222222',
  sonho: '33333333-3333-3333-3333-333333333333',
  cliFinal: '44444444-4444-4444-4444-444444444444',
  eng: '55555555-5555-5555-5555-555555555555',
};
await db.exec(`
  insert into auth.users (id, email) values
    ('${U.admin}', 'gustavohcs1@hotmail.com'), ('${U.souz2}', 'gustavohcs12@gmail.com'),
    ('${U.sonho}', 'cesarndrade@hotmail.com'), ('${U.cliFinal}', 'dono.casa@x.com'), ('${U.eng}', 'eng@x.com');
  alter table public.perfis disable trigger trg_perfil_trava;
  update public.perfis set empresa_nome = 'Souz Engenharia', admin = true, cnpj = '11.222.333/0001-81',
         listas = '{"etapas":["Fundação","Estrutura"]}' where id = '${U.admin}';
  update public.perfis set empresa_nome = 'Souz Engenharia' where id = '${U.souz2}';
  update public.perfis set empresa_nome = 'Construtora Sonho Real', limite_obras = 5 where id = '${U.sonho}';
  alter table public.perfis enable trigger trg_perfil_trava;
  insert into public.obras (id, nome, usuario_id) values
    ('o-souz-1', 'Casa 14', '${U.admin}'), ('o-souz-2', 'Casa 07', '${U.admin}'),
    ('o-souz-3', 'Teste', '${U.souz2}'), ('o-sonho', 'Residencial Sonho', '${U.sonho}');
  insert into public.obra_membros (obra_id, usuario_id, papel) values
    ('o-sonho', '${U.cliFinal}', 'cliente'), ('o-sonho', '${U.eng}', 'engenheiro');
  insert into public.clientes (id, nome, usuario_id) values ('c-souz', 'Maria', '${U.admin}');
  insert into public.prestadores (id, nome, usuario_id) values ('p-souz', 'João Pedreiro', '${U.admin}');
  insert into public.contratos (id, obra_id, codigo, usuario_id) values ('ct-eng', 'o-sonho', 'CT-001', '${U.eng}');
`);

const ok21 = await rodar('0021_construtoras.sql');
confere('0021 aplica inteira (blocos A a E)', ok21);

const q = async (sql) => (await db.query(sql)).rows;
/* roda como um usuário logado: papel authenticated + sub do JWT */
async function como(uid, sql) {
  await db.exec(
    `select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`,
  );
  try {
    return (await db.query(sql)).rows;
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}
async function erroComo(uid, sql) {
  try {
    await como(uid, sql);
    return null;
  } catch (e) {
    return e.message;
  }
}

/* ---------------------------------------------------- conversão (C) */
const emp = await q(`select nome, cnpj, listas from public.empresas order by nome`);
confere(
  'duas construtoras: Sonho Real e Souz',
  emp.length === 2 && emp[0].nome === 'Construtora Sonho Real' && emp[1].nome === 'Souz Engenharia',
  emp.map((e) => e.nome).join(', '),
);
confere(
  'dados da conta mais antiga vão para a construtora (CNPJ, listas)',
  emp[1].cnpj === '11.222.333/0001-81' && emp[1].listas.etapas?.length === 2,
);
const pap = Object.fromEntries(
  (
    await q(
      `select p.id, p.papel_empresa, e.nome from public.perfis p left join public.empresas e on e.id = p.empresa_id`,
    )
  ).map((r) => [r.id, `${r.nome}/${r.papel_empresa}`]),
);
confere(
  'admin e a 2ª conta Souz: gestores da Souz',
  pap[U.admin] === 'Souz Engenharia/gestor' && pap[U.souz2] === 'Souz Engenharia/gestor',
);
confere(
  'Sonho Real: gestor; convidado cliente vira cliente final; convidado engenheiro vira engenheiro',
  pap[U.sonho] === 'Construtora Sonho Real/gestor' &&
    pap[U.cliFinal] === 'Construtora Sonho Real/cliente' &&
    pap[U.eng] === 'Construtora Sonho Real/engenheiro',
  JSON.stringify(pap),
);
confere(
  'limite de obras da conta vai para a construtora',
  (await q(`select limite_obras from public.empresas where nome like 'Construtora%'`))[0]
    .limite_obras === 5,
);
confere(
  'todas as obras e cadastros ligados',
  (await q(`select count(*)::int n from public.obras where empresa_id is null`))[0].n === 0 &&
    (await q(`select count(*)::int n from public.clientes where empresa_id is null`))[0].n === 0,
);

/* ------------------------------------------------------- acesso (RLS) */
const obrasDe = async (u) =>
  (await como(u, `select id from public.obras order by id`)).map((r) => r.id).join(',');
confere(
  '2ª conta Souz vê as obras do admin (compartilha a construtora)',
  (await obrasDe(U.souz2)) === 'o-souz-1,o-souz-2,o-souz-3',
);
confere('Sonho Real não vê nada da Souz', (await obrasDe(U.sonho)) === 'o-sonho');
confere('engenheiro da Sonho Real vê a obra dela', (await obrasDe(U.eng)) === 'o-sonho');
confere('cliente final vê só a obra dele', (await obrasDe(U.cliFinal)) === 'o-sonho');
confere(
  '2ª conta Souz vê clientes e prestadores do admin',
  (await como(U.souz2, `select id from public.clientes`)).length === 1 &&
    (await como(U.souz2, `select id from public.prestadores`)).length === 1,
);
confere(
  'cliente final não vê os cadastros da construtora',
  (await como(U.cliFinal, `select id from public.clientes`)).length === 0,
);
confere(
  'cliente final não lê a construtora',
  (await como(U.cliFinal, `select id from public.empresas`)).length === 0,
);
confere(
  'engenheiro edita a obra da construtora',
  (
    await como(
      U.eng,
      `update public.obras set nome = 'Residencial Sonho Real' where id = 'o-sonho' returning id`,
    )
  ).length === 1,
);
confere(
  'cliente final não edita a obra',
  (await como(U.cliFinal, `update public.obras set nome = 'x' where id = 'o-sonho' returning id`))
    .length === 0,
);
confere(
  'engenheiro não exclui a obra criada pelo gestor',
  (await como(U.eng, `delete from public.obras where id = 'o-sonho' returning id`)).length === 0,
);
confere(
  'gestor da Souz exclui obra criada pela outra conta da Souz',
  (await como(U.souz2, `select public.eh_dono_obra('o-souz-1') as d`))[0].d === true,
);
const mc = await como(
  U.sonho,
  `select nome, papel, usuarios::int, obras::int from public.minha_construtora()`,
);
confere(
  'minha_construtora() traz construtora, papel, vagas e obras em uso',
  mc.length === 1 && mc[0].papel === 'gestor' && mc[0].usuarios === 2 && mc[0].obras === 1,
  JSON.stringify(mc),
);

/* ----------------------------------------------- controle só do admin */
await como(
  U.sonho,
  `update public.empresas set limite_usuarios = 99, bloqueada = true, telefone = '62 3333-4444' where nome like 'Construtora%'`,
);
const e1 = (
  await q(
    `select limite_usuarios, bloqueada, telefone from public.empresas where nome like 'Construtora%'`,
  )
)[0];
confere(
  'gestor muda os dados da construtora, mas não limite nem bloqueio',
  e1.limite_usuarios === null && e1.bloqueada === false && e1.telefone === '62 3333-4444',
  JSON.stringify(e1),
);
confere(
  'gestor não se muda de construtora nem de papel',
  !!(await erroComo(
    U.sonho,
    `update public.perfis set papel_empresa = 'gestor', empresa_id = null where id = '${U.eng}'`,
  )) ||
    (await q(`select papel_empresa from public.perfis where id = '${U.eng}'`))[0].papel_empresa ===
      'engenheiro',
);
confere(
  'só o admin chama as funções de admin',
  /Acesso restrito/.test(
    (await erroComo(
      U.sonho,
      `select public.admin_salvar_empresa(null, 'X', null, 'ativo', null, null, false)`,
    )) || '',
  ),
);

/* ------------------------------------------------------------- vagas */
const sr = (await q(`select id from public.empresas where nome like 'Construtora%'`))[0].id;
let err = await erroComo(
  U.admin,
  `select public.admin_salvar_empresa('${sr}', 'Construtora Sonho Real', null, 'ativo', 1, null, false)`,
);
confere(
  'não baixa o limite abaixo do que está em uso (2 em uso, limite 1)',
  /2 acesso/.test(err || ''),
  err,
);
err = await erroComo(
  U.admin,
  `select public.admin_salvar_empresa('${sr}', 'Construtora Sonho Real', null, 'ativo', 2, 2, false)`,
);
confere('limite de 2 acessos e 2 obras', err === null, err);
await db.exec(
  `insert into auth.users (id, email) values ('66666666-6666-6666-6666-666666666666', 'novo@x.com'), ('77777777-7777-7777-7777-777777777777', 'avulso@x.com')`,
);
err = await erroComo(
  U.admin,
  `select public.admin_definir_usuario_empresa('66666666-6666-6666-6666-666666666666', '${sr}', 'engenheiro')`,
);
confere(
  '3º engenheiro com 2 vagas: recusado pelo banco',
  /acesso\(s\) contratados/.test(err || ''),
  err,
);
err = await erroComo(
  U.admin,
  `select public.admin_definir_usuario_empresa('66666666-6666-6666-6666-666666666666', '${sr}', 'cliente')`,
);
confere('cliente final não ocupa vaga: entra', err === null, err);
await como(U.admin, `select public.admin_definir_perfil('${U.eng}', null, true, null, null)`);
err = await erroComo(
  U.admin,
  `select public.admin_definir_usuario_empresa('66666666-6666-6666-6666-666666666666', '${sr}', 'engenheiro')`,
);
confere('bloquear um engenheiro libera a vaga', err === null, err);
err = await erroComo(
  U.admin,
  `select public.admin_definir_perfil('${U.eng}', null, false, null, null)`,
);
confere(
  'desbloquear com a construtora cheia: recusado',
  /acesso\(s\) contratados/.test(err || ''),
  err,
);

/* ------------------------------------------------------------- obras */
await como(U.sonho, `insert into public.obras (id, nome) values ('o-sonho-2', 'Segunda')`);
err = await erroComo(
  U.sonho,
  `insert into public.obras (id, nome) values ('o-sonho-3', 'Terceira')`,
);
confere('limite de obras da construtora (2) recusa a 3ª', /Limite de 2 obra/.test(err || ''), err);
confere(
  'obra nova nasce na construtora de quem cria',
  (await q(`select empresa_id from public.obras where id = 'o-sonho-2'`))[0].empresa_id === sr,
);
err = await erroComo(
  '77777777-7777-7777-7777-777777777777',
  `insert into public.obras (id, nome) values ('o-avulsa', 'Avulsa')`,
);
confere('conta sem construtora não cria obra', /sem construtora/.test(err || ''), err);
await como(
  U.admin,
  `select public.admin_salvar_empresa('${sr}', 'Construtora Sonho Real', null, 'ativo', 2, 5, false)`,
);
err = await erroComo(
  U.sonho,
  `insert into public.obras (id, nome, empresa_id) values ('o-x', 'Forçada', (select id from public.empresas where nome like 'Souz%'))`,
);
confere(
  'obra com empresa_id de outra construtora nasce na de quem cria (o banco escolhe)',
  err === null &&
    (await q(`select empresa_id from public.obras where id = 'o-x'`))[0].empresa_id === sr,
  err,
);
await como(
  U.sonho,
  `update public.obras set empresa_id = (select id from public.empresas where nome like 'Souz%') where id = 'o-x'`,
);
confere(
  'gestor não muda a obra de construtora',
  (await q(`select empresa_id from public.obras where id = 'o-x'`))[0].empresa_id === sr,
);

/* ----------------------------------------------------------- convite */
err = await erroComo(
  U.sonho,
  `select * from public.convidar_membro('o-sonho', 'gustavohcs12@gmail.com', 'engenheiro')`,
);
confere(
  'convite de engenheiro para obra da construtora: recusado',
  /Convide aqui só o cliente/.test(err || ''),
  err,
);
err = await erroComo(
  U.sonho,
  `select * from public.convidar_membro('o-sonho', 'avulso@x.com', 'cliente')`,
);
confere('convite de cliente: aceito', err === null, err);

/* ---------------------------------------------- saída e exclusão */
await db.exec(
  `insert into public.obra_membros (obra_id, usuario_id, papel) values ('o-sonho-2', '66666666-6666-6666-6666-666666666666', 'dono') on conflict do nothing`,
);
await como(
  U.admin,
  `select public.admin_definir_usuario_empresa('66666666-6666-6666-6666-666666666666', null, null)`,
);
confere(
  'quem sai da construtora perde o acesso às obras dela',
  (await obrasDe('66666666-6666-6666-6666-666666666666')) === '',
);
await db.exec(`delete from auth.users where id = '${U.eng}'`);
const ct = await q(`select usuario_id from public.contratos where id = 'ct-eng'`);
confere(
  'excluir a conta do engenheiro NÃO apaga o contrato que ele fez',
  ct.length === 1 && ct[0].usuario_id === null,
);

/* --------------------------------------------------------- bloqueio */
await como(
  U.admin,
  `select public.admin_salvar_empresa('${sr}', 'Construtora Sonho Real', null, 'ativo', 2, 5, true)`,
);
const mcB = await como(U.sonho, `select bloqueada from public.minha_construtora()`);
confere(
  'construtora bloqueada: minha_construtora() avisa o app',
  mcB.length === 1 && mcB[0].bloqueada === true,
);
confere(
  'construtora bloqueada: a equipe perde o acesso da construtora',
  (await como(U.sonho, `select public.minha_empresa() as e`))[0].e === null,
);

const antes = (await q(`select count(*)::int n from public.empresas`))[0].n;
confere('0021 roda de novo sem quebrar', await rodar('0021_construtoras.sql'));
confere(
  'rodar de novo não duplica construtoras',
  (await q(`select count(*)::int n from public.empresas`))[0].n === antes,
);
escreve(`\n${falhas ? falhas + ' FALHA(S)' : 'tudo certo'}`);
process.exit(falhas ? 1 : 0);
