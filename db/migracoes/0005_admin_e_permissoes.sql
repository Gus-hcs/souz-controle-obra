-- =====================================================================
--  0005 — Painel de administração: consumo por cliente e liberação de
--  acesso por aba.
--
--  Acrescenta ao perfil de cada usuário:
--    admin      — quem pode abrir o painel de administração
--    plano      — trial | ativo | suspenso | cancelado (informativo)
--    bloqueado  — trava total do acesso à aplicação
--    abas       — jsonb { "<aba>": false } lista as abas BLOQUEADAS.
--                 vazio = tudo liberado. Novo usuário nasce com tudo liberado.
--
--  Quem controla é só o admin: a função pode_admin() e as políticas abaixo.
--
--  DEPOIS DE APLICAR, marque a sua conta como admin (uma vez):
--    update public.perfis set admin = true where id = auth.uid();
--
--  Pode ser rodado de novo sem quebrar.
--  APLICAR NO SUPABASE É MANUAL. Rode 0001–0004 antes.
-- =====================================================================

alter table public.perfis add column if not exists admin     boolean not null default false;
alter table public.perfis add column if not exists plano     text    not null default 'ativo';
alter table public.perfis add column if not exists bloqueado boolean not null default false;
alter table public.perfis add column if not exists abas      jsonb   not null default '{}'::jsonb;

alter table public.perfis drop constraint if exists chk_perfis_plano;
alter table public.perfis add constraint chk_perfis_plano
  check (plano in ('trial', 'ativo', 'suspenso', 'cancelado'));

-- ------------------------------------------------ função de autorização
create or replace function public.pode_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select admin from public.perfis where id = auth.uid()), false);
$$;

-- ------------------------------------------------------------- políticas
-- O usuário continua vendo e editando o próprio perfil (política de 0001).
-- O admin passa a ler todos e alterar plano/bloqueado/abas de todos.
drop policy if exists perfil_admin_ler on public.perfis;
create policy perfil_admin_ler on public.perfis for select
  using (public.pode_admin());

drop policy if exists perfil_admin_alterar on public.perfis;
create policy perfil_admin_alterar on public.perfis for update
  using (public.pode_admin()) with check (public.pode_admin());

-- --------------------------------------------------- consumo por cliente
-- security definer: agrega os dados de todos os usuários por fora da RLS.
-- Devolve vazio para quem não é admin.
create or replace function public.admin_consumo()
returns table (
  usuario_id       uuid,
  email            text,
  empresa          text,
  plano            text,
  eh_admin         boolean,
  bloqueado        boolean,
  abas             jsonb,
  criado_em        timestamptz,
  ultima_atividade timestamptz,
  obras            bigint,
  contratos        bigint,
  medicoes         bigint,
  recebimentos     bigint,
  lancamentos      bigint,
  materiais        bigint,
  diario           bigint,
  fotos            bigint
)
language sql stable security definer set search_path = public as $$
  select
    p.id,
    p.email,
    p.empresa_nome,
    p.plano,
    p.admin,
    p.bloqueado,
    p.abas,
    p.criado_em,
    greatest(
      coalesce(p.atualizado_em, p.criado_em),
      coalesce((select max(o.atualizado_em) from public.obras o where o.usuario_id = p.id), p.criado_em)
    ) as ultima_atividade,
    (select count(*) from public.obras o where o.usuario_id = p.id),
    (select count(*) from public.contratos c    join public.obras o on o.id = c.obra_id  where o.usuario_id = p.id),
    (select count(*) from public.medicoes m     join public.obras o on o.id = m.obra_id  where o.usuario_id = p.id),
    (select count(*) from public.recebimentos r join public.obras o on o.id = r.obra_id  where o.usuario_id = p.id),
    (select count(*) from public.lancamentos l  join public.obras o on o.id = l.obra_id  where o.usuario_id = p.id),
    (select count(*) from public.materiais mt   join public.obras o on o.id = mt.obra_id where o.usuario_id = p.id),
    (select count(*) from public.diario d       join public.obras o on o.id = d.obra_id  where o.usuario_id = p.id),
    coalesce((
      select sum(case when jsonb_typeof(d.fotos) = 'array' then jsonb_array_length(d.fotos) else 0 end)
      from public.diario d join public.obras o on o.id = d.obra_id where o.usuario_id = p.id
    ), 0)
  from public.perfis p
  where public.pode_admin()
  order by ultima_atividade desc;
$$;

grant execute on function public.admin_consumo() to authenticated;
grant execute on function public.pode_admin() to authenticated;
