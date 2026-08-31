-- =====================================================================
--  0007 — Limite de obras por cliente.
--
--  perfis.limite_obras:
--    null      = sem limite
--    0, 1, 2…  = máximo de obras que a conta pode ter
--
--  A checagem é no banco (gatilho before insert em obras), então vale
--  para o app, para a importação de planilha e para qualquer inserção
--  direta. Só o admin define o limite (RPC admin_definir_perfil).
--
--  Pode ser rodado de novo sem quebrar. Rode 0001–0006 antes.
--  APLICAR NO SUPABASE É MANUAL.
-- =====================================================================

alter table public.perfis add column if not exists limite_obras integer;

alter table public.perfis drop constraint if exists chk_perfis_limite_obras;
alter table public.perfis add constraint chk_perfis_limite_obras
  check (limite_obras is null or limite_obras >= 0);

-- --------------------------------------------------------- trava do cliente
-- Acrescenta limite_obras à lista de colunas que o usuário não pode mexer.
create or replace function public.perfil_trava_controle()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not public.pode_admin() then
    new.admin        := old.admin;
    new.plano        := old.plano;
    new.bloqueado    := old.bloqueado;
    new.abas         := old.abas;
    new.limite_obras := old.limite_obras;
  end if;
  return new;
end $$;
-- o gatilho trg_perfil_trava (0006) já aponta para esta função

-- ---------------------------------------------- enforce: teto de obras
create or replace function public.obra_checa_limite()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_lim int;
  v_qtd int;
begin
  select p.limite_obras into v_lim from public.perfis p where p.id = new.usuario_id;
  if v_lim is null then
    return new;
  end if;
  select count(*) into v_qtd from public.obras o where o.usuario_id = new.usuario_id;
  if v_qtd >= v_lim then
    raise exception 'Limite de % obra(s) da conta atingido.', v_lim using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists trg_obra_checa_limite on public.obras;
create trigger trg_obra_checa_limite before insert on public.obras
  for each row execute function public.obra_checa_limite();

-- ----------------------------------------- RPC do admin (nova assinatura)
drop function if exists public.admin_definir_perfil(uuid, text, boolean, jsonb);

create or replace function public.admin_definir_perfil(
  p_id           uuid,
  p_plano        text    default null,
  p_bloqueado    boolean default null,
  p_abas         jsonb   default null,
  p_limite_obras integer default null   -- null = não mexe · -1 = remove o limite · >=0 = define
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.pode_admin() then
    raise exception 'Acesso restrito.' using errcode = '42501';
  end if;
  if p_plano is not null and p_plano not in ('trial', 'ativo', 'suspenso', 'cancelado') then
    raise exception 'Plano inválido: %', p_plano;
  end if;
  if p_abas is not null and jsonb_typeof(p_abas) <> 'object' then
    raise exception 'Configuração de abas inválida.';
  end if;
  update public.perfis set
    plano        = coalesce(p_plano, plano),
    bloqueado    = coalesce(p_bloqueado, bloqueado),
    abas         = coalesce(p_abas, abas),
    limite_obras = case
                     when p_limite_obras is null then limite_obras
                     when p_limite_obras < 0     then null
                     else p_limite_obras
                   end
  where id = p_id;
end $$;

revoke execute on function public.admin_definir_perfil(uuid, text, boolean, jsonb, integer) from public, anon;
grant  execute on function public.admin_definir_perfil(uuid, text, boolean, jsonb, integer) to authenticated;

-- --------------------------------------- consumo: inclui o limite e as obras
drop function if exists public.admin_consumo();

create or replace function public.admin_consumo()
returns table (
  usuario_id       uuid,
  email            text,
  empresa          text,
  plano            text,
  eh_admin         boolean,
  bloqueado        boolean,
  abas             jsonb,
  limite_obras     integer,
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
language sql stable security definer set search_path = '' as $$
  select
    p.id, p.email, p.empresa_nome, p.plano, p.admin, p.bloqueado, p.abas, p.limite_obras,
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
