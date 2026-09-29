-- =====================================================================
--  0022 — Fecha o bucket "site" do Storage (set/2026).
--
--  POR QUÊ
--  O bucket "site" foi criado à mão no painel em 30/08/2026, fora de
--  qualquer migração, com três políticas em storage.objects —
--  site_tmp_ins, site_tmp_sel e site_tmp_del — para os papéis anon e
--  authenticated, que só conferem bucket_id = 'site'. O bucket é público
--  e não tem limite de tamanho nem de tipo. Qualquer pessoa com a chave
--  publicável (que está no código) podia enviar, listar e apagar
--  arquivos nele, sem login. Nada no sistema usa esse bucket.
--
--  O QUE MUDA
--  - as três políticas saem; sem política, a RLS de storage.objects
--    nega tudo nesse bucket para anon e authenticated.
--  - o bucket em si é apagado no painel (Storage → site → Delete
--    bucket): a Supabase não deixa apagar linhas das tabelas do Storage
--    por SQL.
--
--  Pode rodar de novo: drop policy if exists.
-- =====================================================================

drop policy if exists site_tmp_ins on storage.objects;
drop policy if exists site_tmp_sel on storage.objects;
drop policy if exists site_tmp_del on storage.objects;

-- ---------------------------------------------------------------------
--  Conferência — rode depois. Esperado:
--    politicas_site = 0
--    arquivos_no_site = 0 (se for maior, alguém usou o bucket aberto:
--                          veja os nomes antes de apagar o bucket)
--    bucket_existe = true até você apagar no painel; depois, false
-- ---------------------------------------------------------------------
select
  (select count(*) from pg_policy p
     join pg_class c on c.oid = p.polrelid
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'storage' and c.relname = 'objects'
      and p.polname like 'site%') as politicas_site,
  (select count(*) from storage.objects where bucket_id = 'site') as arquivos_no_site,
  exists (select 1 from storage.buckets where id = 'site') as bucket_existe;
