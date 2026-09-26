-- =====================================================================
--  0020 — Padronização das telas (set/2026): padrão de acabamento,
--  anexos no Storage e comprovante da parcela.
--
--  POR QUÊ
--  1. "Padrão de acabamento" aceitava qualquer texto e nascia 'MCMV' —
--     mas MCMV é programa de financiamento, não padrão. Passa a ser
--     econômico, médio ou alto (ou vazio).
--  2. A nota fiscal do lançamento pode ser foto ou PDF, e o arquivo vai
--     para o Storage (bucket "anexos", pasta da obra), não para dentro da
--     linha. A coluna guarda "storage:<obra>/<pasta>/<arquivo>". Sem rede
--     o app ainda grava a foto ou o PDF pequeno no próprio registro (data
--     URI até 1,5 MB), como antes.
--  3. A parcela ganha o comprovante do crédito, no mesmo formato.
--  4. O relatório usa o responsável técnico DA OBRA (nome e CREA/CAU),
--     não só o da empresa; e guarda o histórico do que foi gerado (tipo,
--     opções, quem, quando e o PDF no Storage, para baixar de novo).
--
--  O QUE MUDA
--  - obras.padrao: default deixa de ser 'MCMV'; CHECK chk_obra_padrao
--  - lancamentos.anexo_nf: CHECK chk_lanc_anexo_nf aceita PDF e Storage
--  - recebimentos.comprovante text + CHECK chk_receb_comprovante
--  - obras.crea_cau text + CHECK chk_obra_crea (até 40 caracteres)
--  - perfis.cnpj text + CHECK chk_perfis_cnpj (formato; os dígitos
--    verificadores ficam em validarEmpresa)
--  - tabela relatorios_gerados, com RLS por obra (pode_ler_obra /
--    pode_escrever_obra), como pendencias_cliente (0018)
--  - bucket privado "anexos" (10 MB, foto e PDF) com RLS por obra:
--    ler = pode_ler_obra, gravar/trocar/apagar = pode_escrever_obra,
--    sobre a primeira pasta do caminho (o id da obra)
--
--  COMO APLICAR (SQL Editor do Supabase), NESTA ORDEM:
--    BLOCO A — estrutura, bucket e políticas. Seguro.
--    BLOCO B — diagnóstico (somente leitura).
--    BLOCO C — correção sugerida do padrão (traduz MCMV/popular/normal…).
--              Confira o BLOCO B antes; rode só se concordar.
--    BLOCO D — restrições como NOT VALID.
--    BLOCO E — valida o histórico. Só com o BLOCO B vazio.
--
--  Rode 0001–0019 antes. Pode ser rodado de novo sem quebrar.
-- =====================================================================


-- =====================================================================
--  BLOCO A — estrutura, bucket e políticas
-- =====================================================================
alter table public.obras alter column padrao drop default;
alter table public.obras add column if not exists crea_cau text;
alter table public.perfis add column if not exists cnpj text;
alter table public.recebimentos add column if not exists comprovante text;

create table if not exists public.relatorios_gerados (
  id             text primary key default gen_random_uuid()::text,
  usuario_id     uuid not null default auth.uid() references auth.users on delete cascade,
  obra_id        text not null references public.obras on delete cascade,
  tipo           text not null,
  opcoes         jsonb not null default '{}'::jsonb,
  gerado_por     text,
  gerado_em      timestamptz not null default now(),
  arquivo        text,
  criado_em      timestamptz default now(),
  atualizado_em  timestamptz default now(),
  constraint chk_rel_tipo    check (tipo in ('status', 'interno', 'prestacao', 'medicao')),
  constraint chk_rel_opcoes  check (jsonb_typeof(opcoes) = 'object'),
  constraint chk_rel_obs     check (length(coalesce(opcoes->>'observacao', '')) <= 600),
  constraint chk_rel_arquivo check (arquivo is null or arquivo = ''
    or (arquivo ~ '^storage:[A-Za-z0-9_-]+/(lancamentos|recebimentos|relatorios)/[A-Za-z0-9._-]+$' and length(arquivo) <= 300))
);

create index if not exists idx_relatorios_gerados_obra on public.relatorios_gerados(obra_id);

drop trigger if exists trg_relatorios_gerados_atualizacao on public.relatorios_gerados;
create trigger trg_relatorios_gerados_atualizacao before update on public.relatorios_gerados
  for each row execute function public.marcar_atualizacao();

alter table public.relatorios_gerados enable row level security;
drop policy if exists ler     on public.relatorios_gerados;
drop policy if exists inserir on public.relatorios_gerados;
drop policy if exists alterar on public.relatorios_gerados;
drop policy if exists remover on public.relatorios_gerados;
create policy ler     on public.relatorios_gerados for select
  using (public.pode_ler_obra(obra_id));
create policy inserir on public.relatorios_gerados for insert
  with check (public.pode_escrever_obra(obra_id));
create policy alterar on public.relatorios_gerados for update
  using (public.pode_escrever_obra(obra_id)) with check (public.pode_escrever_obra(obra_id));
create policy remover on public.relatorios_gerados for delete
  using (public.pode_escrever_obra(obra_id));

revoke truncate on public.relatorios_gerados from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('anexos', 'anexos', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
   set public = false,
       file_size_limit = excluded.file_size_limit,
       allowed_mime_types = excluded.allowed_mime_types;

-- o caminho é <obra_id>/<pasta>/<arquivo>: a primeira pasta decide o acesso
drop policy if exists anexos_ler on storage.objects;
create policy anexos_ler on storage.objects for select to authenticated
  using (bucket_id = 'anexos' and public.pode_ler_obra((storage.foldername(name))[1]));

drop policy if exists anexos_incluir on storage.objects;
create policy anexos_incluir on storage.objects for insert to authenticated
  with check (bucket_id = 'anexos' and public.pode_escrever_obra((storage.foldername(name))[1]));

drop policy if exists anexos_alterar on storage.objects;
create policy anexos_alterar on storage.objects for update to authenticated
  using (bucket_id = 'anexos' and public.pode_escrever_obra((storage.foldername(name))[1]))
  with check (bucket_id = 'anexos' and public.pode_escrever_obra((storage.foldername(name))[1]));

drop policy if exists anexos_excluir on storage.objects;
create policy anexos_excluir on storage.objects for delete to authenticated
  using (bucket_id = 'anexos' and public.pode_escrever_obra((storage.foldername(name))[1]));


-- =====================================================================
--  BLOCO B — DIAGNÓSTICO (somente leitura). Deve voltar vazio antes do E.
-- =====================================================================
select id, padrao, 'padrão de acabamento fora de Econômico/Médio/Alto' as problema
  from public.obras
 where coalesce(padrao, '') not in ('', 'Econômico', 'Médio', 'Alto')
union all
select id, left(crea_cau, 40), 'CREA/CAU da obra com mais de 40 caracteres'
  from public.obras
 where length(coalesce(crea_cau, '')) > 40
union all
select id::text, cnpj, 'CNPJ da empresa fora do formato'
  from public.perfis
 where coalesce(cnpj, '') <> ''
   and not (cnpj ~ '^[0-9./-]{14,18}$' and length(regexp_replace(cnpj, '\D', '', 'g')) = 14)
union all
select id, left(anexo_nf, 40), 'nota fiscal que não é foto, PDF ou Storage'
  from public.lancamentos
 where coalesce(anexo_nf, '') <> ''
   and not ((anexo_nf ~ '^data:(image/|application/pdf)' and length(anexo_nf) <= 1500000)
         or (anexo_nf ~ '^storage:[A-Za-z0-9_-]+/(lancamentos|recebimentos|relatorios)/[A-Za-z0-9._-]+$' and length(anexo_nf) <= 300))
union all
select id, left(comprovante, 40), 'comprovante que não é foto, PDF ou Storage'
  from public.recebimentos
 where coalesce(comprovante, '') <> ''
   and not ((comprovante ~ '^data:(image/|application/pdf)' and length(comprovante) <= 1500000)
         or (comprovante ~ '^storage:[A-Za-z0-9_-]+/(lancamentos|recebimentos|relatorios)/[A-Za-z0-9._-]+$' and length(comprovante) <= 300));


-- =====================================================================
--  BLOCO C — correção sugerida do padrão (a mesma tradução do app,
--  normalizarPadrao em src/nucleo/base.js). O que não se reconhece fica
--  vazio. Rode só depois de conferir o BLOCO B.
-- =====================================================================
update public.obras set padrao = case
    when padrao ~* '(mcmv|popular|baix|econ|simples)' then 'Econômico'
    when padrao ~* '(alto|lux)'                         then 'Alto'
    when padrao ~* '(normal|m[eé]di|padr[aã]o)'        then 'Médio'
    else '' end
 where coalesce(padrao, '') not in ('', 'Econômico', 'Médio', 'Alto');


-- =====================================================================
--  BLOCO D — restrições NOT VALID
-- =====================================================================
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chk_perfis_cnpj') then
    alter table public.perfis add constraint chk_perfis_cnpj
      check (cnpj is null or cnpj = ''
          or (cnpj ~ '^[0-9./-]{14,18}$' and length(regexp_replace(cnpj, '\D', '', 'g')) = 14)) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'chk_obra_crea') then
    alter table public.obras add constraint chk_obra_crea
      check (crea_cau is null or length(crea_cau) <= 40) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'chk_obra_padrao') then
    alter table public.obras add constraint chk_obra_padrao
      check (padrao is null or padrao in ('', 'Econômico', 'Médio', 'Alto')) not valid;
  end if;

  -- a da 0019 só aceitava foto: troca pela que aceita PDF e Storage
  alter table public.lancamentos drop constraint if exists chk_lanc_anexo_nf;
  alter table public.lancamentos add constraint chk_lanc_anexo_nf
    check (anexo_nf is null or anexo_nf = ''
        or (anexo_nf ~ '^data:(image/|application/pdf)' and length(anexo_nf) <= 1500000)
        or (anexo_nf ~ '^storage:[A-Za-z0-9_-]+/(lancamentos|recebimentos|relatorios)/[A-Za-z0-9._-]+$' and length(anexo_nf) <= 300)) not valid;

  if not exists (select 1 from pg_constraint where conname = 'chk_receb_comprovante') then
    alter table public.recebimentos add constraint chk_receb_comprovante
      check (comprovante is null or comprovante = ''
          or (comprovante ~ '^data:(image/|application/pdf)' and length(comprovante) <= 1500000)
          or (comprovante ~ '^storage:[A-Za-z0-9_-]+/(lancamentos|recebimentos|relatorios)/[A-Za-z0-9._-]+$' and length(comprovante) <= 300)) not valid;
  end if;
end $$;


-- =====================================================================
--  BLOCO E — valida o histórico. Só com o BLOCO B vazio.
-- =====================================================================
alter table public.obras        validate constraint chk_obra_padrao;
alter table public.obras        validate constraint chk_obra_crea;
alter table public.perfis       validate constraint chk_perfis_cnpj;
alter table public.lancamentos  validate constraint chk_lanc_anexo_nf;
alter table public.recebimentos validate constraint chk_receb_comprovante;
