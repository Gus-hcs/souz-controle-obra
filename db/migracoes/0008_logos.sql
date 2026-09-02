-- =====================================================================
--  0008 — Logo no cabeçalho do relatório.
--
--  Duas colunas de imagem (data URI PNG/JPG), opcionais:
--    perfis.logo    — logo da empresa que emite o relatório
--    clientes.logo  — logo do cliente da obra
--
--  O relatório em PDF desenha as duas no topo, quando existem. O sistema
--  funciona sem esta migração: a logo fica só no navegador e no backup até
--  a coluna existir no banco.
--
--  Pode ser rodado de novo sem quebrar. Rode 0001–0007 antes.
--  APLICAR NO SUPABASE É MANUAL.
-- =====================================================================

alter table public.perfis   add column if not exists logo text;
alter table public.clientes add column if not exists logo text;

-- --------------------------------------------------------------- CHECK
-- Espelha validarLogo() em src/dominio/validacao.js: ou nulo, ou um data
-- URI de imagem com menos de 500 KB.
alter table public.perfis   drop constraint if exists chk_perfis_logo;
alter table public.perfis   add  constraint chk_perfis_logo
  check (logo is null or (logo like 'data:image/%' and length(logo) <= 500000)) not valid;

alter table public.clientes drop constraint if exists chk_clientes_logo;
alter table public.clientes add  constraint chk_clientes_logo
  check (logo is null or (logo like 'data:image/%' and length(logo) <= 500000)) not valid;

-- Diagnóstico: linhas que violam o CHECK (deve vir vazio).
select 'perfis'   as tabela, id from public.perfis
  where logo is not null and not (logo like 'data:image/%' and length(logo) <= 500000)
union all
select 'clientes' as tabela, id from public.clientes
  where logo is not null and not (logo like 'data:image/%' and length(logo) <= 500000);

-- Depois de conferir que o diagnóstico veio vazio:
--   alter table public.perfis   validate constraint chk_perfis_logo;
--   alter table public.clientes validate constraint chk_clientes_logo;

-- --------------------------------------------------------- privilégios
-- clientes: o dono já tem UPDATE amplo (política de 0001), nada a fazer.
-- perfis: a 0006 restringiu o UPDATE a colunas específicas — libera logo.
grant update (logo) on public.perfis to authenticated;
