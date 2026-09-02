-- =====================================================================
--  0010 — Revoga TRUNCATE de anon / authenticated.
--
--  Por quê
--  -------
--  O Supabase concede, por padrão, TODOS os privilégios de tabela a
--  `anon` e `authenticated` em `public` (inclusive TRUNCATE), e nunca
--  foram revogados. TRUNCATE **ignora a RLS** — uma política de linha
--  não protege contra ele.
--
--  Hoje não há caminho aberto: o PostgREST (a API que a chave publicável
--  usa) não expõe TRUNCATE, então a chave do navegador não consegue
--  disparar o comando. É risco teórico, não exploração — mas a correção
--  é uma linha e fecha o último resíduo de privilégio amplo.
--
--  REFERENCES e TRIGGER também vêm no grant padrão, mas são inertes: a
--  `0006` revogou CREATE em `public` de anon/authenticated, então não dá
--  para criar objeto (FK, trigger) que os use.
--
--  Reexecutável. Rode 0001–0009 antes.
--  APLICAR NO SUPABASE É MANUAL, no SQL Editor.
-- =====================================================================

-- Tabelas que já existem.
revoke truncate on all tables in schema public from anon, authenticated;

-- Tabelas que vierem a ser criadas (o grant padrão do Supabase reconcede
-- ALL a cada tabela nova; aqui tiramos TRUNCATE dessa reconcessão).
alter default privileges in schema public
  revoke truncate on tables from anon, authenticated;


-- =====================================================================
--  DIAGNÓSTICO — rode e confira o resultado
-- =====================================================================

-- (a) anon / authenticated NÃO devem ter TRUNCATE em nenhuma tabela de public:
select 'truncate remanescente' as verificacao, table_name, grantee
from information_schema.role_table_grants
where table_schema = 'public'
  and privilege_type = 'TRUNCATE'
  and grantee in ('anon', 'authenticated')
order by table_name, grantee;
-- Esperado: nenhuma linha.

-- (b) confirmação do default privilege (deve NÃO listar TRUNCATE para anon/authenticated):
select 'default privileges' as verificacao,
       pg_get_userbyid(d.defaclrole) as concedente,
       d.defaclacl
from pg_default_acl d
join pg_namespace n on n.oid = d.defaclnamespace
where n.nspname = 'public' and d.defaclobjtype = 'r';
-- Nas ACLs de anon/authenticated (a=anon, ...) não deve aparecer 'D' (TRUNCATE).
-- Referência de códigos: r=SELECT w=UPDATE a=INSERT d=DELETE D=TRUNCATE.
