-- =====================================================================
--  0027 — IA: leitura de nota fiscal, cota e registro de uso (set/2026).
--
--  POR QUÊ
--  A pessoa fotografa a nota fiscal e ainda digita os 17 campos do
--  lançamento. Com a IA, a foto vira o lançamento preenchido — a pessoa
--  confere e grava. A IA custa por uso (API da Anthropic), então cada
--  construtora (ou conta avulsa) tem a IA ligada ou não, uma cota mensal
--  e o registro do que gastou.
--
--  O QUE MUDA
--  - ia_config: uma linha por titular — a construtora (empresa_id) ou a
--    conta avulsa (usuario_id). Ligada, cota de notas e de textos por mês,
--    leituras a mais no mês corrente e prazo (teste). Só o admin grava;
--    o titular lê a sua.
--  - ia_uso: uma linha por chamada — quem, qual obra, tarefa, modelo,
--    tokens, custo, tempo e quantos campos a pessoa corrigiu. Sem o
--    conteúdo da nota. Ninguém grava direto: só as funções abaixo.
--  - ia_reservar(obra, tarefa): a função `ia` (Edge Function) chama com o
--    token de quem pediu. Confere acesso de escrita na obra, IA ligada,
--    prazo, cota do mês e limite de 30 chamadas por pessoa por hora, e
--    reserva a vaga — tudo sob trava da linha de ia_config, sem corrida.
--  - ia_concluir(...): só a service_role (a função, depois da resposta).
--    Chamada que falhou não conta na cota.
--  - ia_marcar_correcoes(id, n): quem pediu anota quantos campos corrigiu.
--  - ia_situacao(obra): ligada, cota, usado e prazo — para a tela avisar.
--  - admin_ia() e admin_definir_ia(...): a tela Contas e acessos.
--
--  Titular da obra: a construtora dela; obra sem construtora, a conta do
--  dono (obra_membros, papel 'dono').
--
--  ORDEM: aplique antes de publicar a função `ia` e de juntar o PR da IA.
--  Não mexe em tabela existente. Pode rodar de novo.
-- =====================================================================

-- 1. Configuração por titular ----------------------------------------
create table if not exists public.ia_config (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid unique references public.empresas (id) on delete cascade,
  usuario_id    uuid unique references auth.users (id) on delete cascade,
  ligada        boolean not null default false,
  cota_notas    integer not null default 0,
  cota_textos   integer not null default 0,
  extra_notas   integer not null default 0,
  extra_mes     text,
  valida_ate    date,
  atualizado_em timestamptz not null default now()
);

alter table public.ia_config drop constraint if exists chk_ia_config_titular;
alter table public.ia_config add constraint chk_ia_config_titular
  check (num_nonnulls(empresa_id, usuario_id) = 1);
alter table public.ia_config drop constraint if exists chk_ia_config_cotas;
alter table public.ia_config add constraint chk_ia_config_cotas
  check (cota_notas between 0 and 100000 and cota_textos between 0 and 100000
         and extra_notas between 0 and 100000);
alter table public.ia_config drop constraint if exists chk_ia_config_extra_mes;
alter table public.ia_config add constraint chk_ia_config_extra_mes
  check (extra_mes is null or extra_mes ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');

-- 2. Registro de uso --------------------------------------------------
create table if not exists public.ia_uso (
  id                uuid primary key default gen_random_uuid(),
  criado_em         timestamptz not null default now(),
  empresa_id        uuid references public.empresas (id) on delete cascade,
  titular_id        uuid references auth.users (id) on delete cascade,
  usuario_id        uuid references auth.users (id) on delete set null,
  obra_id           text references public.obras (id) on delete set null,
  tarefa            text not null,
  status            text not null default 'reservada',
  modelo            text not null default '',
  tokens_entrada    integer not null default 0,
  tokens_saida      integer not null default 0,
  custo_usd         numeric(12, 6) not null default 0,
  ms                integer not null default 0,
  campos_corrigidos integer,
  erro              text
);

alter table public.ia_uso drop constraint if exists chk_ia_uso_titular;
alter table public.ia_uso add constraint chk_ia_uso_titular
  check (num_nonnulls(empresa_id, titular_id) = 1);
alter table public.ia_uso drop constraint if exists chk_ia_uso_tarefa;
alter table public.ia_uso add constraint chk_ia_uso_tarefa
  check (tarefa in ('nota', 'diario', 'relatorio', 'planilha'));
alter table public.ia_uso drop constraint if exists chk_ia_uso_status;
alter table public.ia_uso add constraint chk_ia_uso_status
  check (status in ('reservada', 'ok', 'erro'));
alter table public.ia_uso drop constraint if exists chk_ia_uso_numeros;
alter table public.ia_uso add constraint chk_ia_uso_numeros
  check (tokens_entrada >= 0 and tokens_saida >= 0 and custo_usd >= 0 and ms >= 0
         and (campos_corrigidos is null or campos_corrigidos between 0 and 500));
alter table public.ia_uso drop constraint if exists chk_ia_uso_textos;
alter table public.ia_uso add constraint chk_ia_uso_textos
  check (char_length(modelo) <= 60 and (erro is null or char_length(erro) <= 300));

create index if not exists ia_uso_empresa_idx on public.ia_uso (empresa_id, criado_em desc);
create index if not exists ia_uso_titular_idx on public.ia_uso (titular_id, criado_em desc);
create index if not exists ia_uso_usuario_idx on public.ia_uso (usuario_id, criado_em desc);
create index if not exists ia_uso_obra_idx on public.ia_uso (obra_id);

-- 3. RLS ---------------------------------------------------------------
alter table public.ia_config enable row level security;
alter table public.ia_uso enable row level security;
revoke all on public.ia_config, public.ia_uso from anon, authenticated;
grant select on public.ia_config, public.ia_uso to authenticated;

-- lê: o admin; o gestor ou engenheiro da construtora; a própria conta avulsa
drop policy if exists ia_config_select on public.ia_config;
create policy ia_config_select on public.ia_config for select to authenticated
  using ((select public.pode_admin())
         or (empresa_id is not null and empresa_id = (select public.minha_empresa()))
         or (usuario_id = (select auth.uid()) and (select public.eu_ativo())));

-- uso: o admin; o gestor da construtora; o titular da conta avulsa
drop policy if exists ia_uso_select on public.ia_uso;
create policy ia_uso_select on public.ia_uso for select to authenticated
  using ((select public.pode_admin())
         or (empresa_id is not null and (select public.eh_gestor_da_empresa(empresa_id)))
         or (titular_id = (select auth.uid()) and (select public.eu_ativo())));
-- sem política de insert/update/delete: só as funções (security definer)

-- 4. Funções -----------------------------------------------------------
-- titular de uma obra: (empresa, conta avulsa) — um dos dois é nulo
create or replace function public.ia_titular(p_obra text,
  out empresa uuid, out conta uuid)
language sql stable security definer set search_path = '' as $$
  select o.empresa_id,
         case when o.empresa_id is null then
           (select m.usuario_id from public.obra_membros m
             where m.obra_id = o.id and m.papel = 'dono'
             order by m.usuario_id limit 1)
         end
    from public.obras o
   where o.id = p_obra;
$$;

-- início do mês corrente no horário de Brasília
create or replace function public.ia_inicio_mes()
returns timestamptz language sql stable set search_path = '' as $$
  select (date_trunc('month', now() at time zone 'America/Sao_Paulo'))
           at time zone 'America/Sao_Paulo';
$$;

create or replace function public.ia_reservar(p_obra text, p_tarefa text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_emp uuid;
  v_conta uuid;
  v_cfg public.ia_config;
  v_cota integer;
  v_usado integer;
  v_id uuid;
  v_mes text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM');
begin
  if p_tarefa not in ('nota', 'diario', 'relatorio', 'planilha') then
    raise exception 'ia: tarefa desconhecida' using errcode = '22023';
  end if;
  if auth.uid() is null or not public.pode_escrever_obra(p_obra) then
    raise exception 'ia: sem acesso à obra' using errcode = '42501';
  end if;
  select t.empresa, t.conta into v_emp, v_conta from public.ia_titular(p_obra) t;
  if v_emp is null and v_conta is null then
    raise exception 'ia: obra sem titular' using errcode = '42501';
  end if;

  -- trava a configuração: duas reservas ao mesmo tempo não passam da cota
  select * into v_cfg from public.ia_config c
   where (v_emp is not null and c.empresa_id = v_emp)
      or (v_emp is null and c.usuario_id = v_conta)
   for update;
  if not found or not v_cfg.ligada then
    raise exception 'ia: desligada' using errcode = 'P0001';
  end if;
  if v_cfg.valida_ate is not null
     and v_cfg.valida_ate < (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'ia: prazo encerrado' using errcode = 'P0001';
  end if;

  -- limite por pessoa: 30 chamadas por hora (reservas presas contam)
  if (select count(*) from public.ia_uso u
       where u.usuario_id = auth.uid()
         and u.criado_em > now() - interval '1 hour') >= 30 then
    raise exception 'ia: limite por hora' using errcode = 'P0001';
  end if;

  v_cota := case when p_tarefa = 'nota'
                 then v_cfg.cota_notas
                      + case when v_cfg.extra_mes = v_mes then v_cfg.extra_notas else 0 end
                 else v_cfg.cota_textos end;
  -- contam: as que deram certo e as reservas dos últimos 10 minutos
  select count(*) into v_usado from public.ia_uso u
   where ((v_emp is not null and u.empresa_id = v_emp)
          or (v_emp is null and u.titular_id = v_conta))
     and (case when p_tarefa = 'nota' then u.tarefa = 'nota' else u.tarefa <> 'nota' end)
     and u.criado_em >= public.ia_inicio_mes()
     and (u.status = 'ok'
          or (u.status = 'reservada' and u.criado_em > now() - interval '10 minutes'));
  if v_usado >= v_cota then
    raise exception 'ia: cota esgotada' using errcode = 'P0001';
  end if;

  insert into public.ia_uso (empresa_id, titular_id, usuario_id, obra_id, tarefa)
  values (v_emp, case when v_emp is null then v_conta end, auth.uid(), p_obra, p_tarefa)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.ia_concluir(p_id uuid, p_status text, p_modelo text,
  p_tokens_entrada integer, p_tokens_saida integer, p_custo_usd numeric,
  p_ms integer, p_erro text)
returns void language sql security definer set search_path = '' as $$
  update public.ia_uso
     set status = p_status, modelo = left(coalesce(p_modelo, ''), 60),
         tokens_entrada = greatest(coalesce(p_tokens_entrada, 0), 0),
         tokens_saida = greatest(coalesce(p_tokens_saida, 0), 0),
         custo_usd = greatest(coalesce(p_custo_usd, 0), 0),
         ms = greatest(coalesce(p_ms, 0), 0),
         erro = left(p_erro, 300)
   where id = p_id and status = 'reservada' and p_status in ('ok', 'erro');
$$;

create or replace function public.ia_marcar_correcoes(p_id uuid, p_n integer)
returns void language sql security definer set search_path = '' as $$
  update public.ia_uso
     set campos_corrigidos = least(greatest(coalesce(p_n, 0), 0), 500)
   where id = p_id and usuario_id = auth.uid() and status = 'ok'
     and public.eu_ativo();
$$;

create or replace function public.ia_situacao(p_obra text)
returns table (ligada boolean, cota_notas integer, usado_notas integer,
               cota_textos integer, usado_textos integer, valida_ate date)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_emp uuid;
  v_conta uuid;
  v_cfg public.ia_config;
  v_mes text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM');
begin
  if auth.uid() is null or not public.pode_escrever_obra(p_obra) then
    return;
  end if;
  select t.empresa, t.conta into v_emp, v_conta from public.ia_titular(p_obra) t;
  select * into v_cfg from public.ia_config c
   where (v_emp is not null and c.empresa_id = v_emp)
      or (v_emp is null and c.usuario_id = v_conta);
  return query
  select coalesce(v_cfg.ligada, false)
           and (v_cfg.valida_ate is null
                or v_cfg.valida_ate >= (now() at time zone 'America/Sao_Paulo')::date),
         coalesce(v_cfg.cota_notas, 0)
           + case when v_cfg.extra_mes = v_mes then coalesce(v_cfg.extra_notas, 0) else 0 end,
         (select count(*)::integer from public.ia_uso u
           where ((v_emp is not null and u.empresa_id = v_emp)
                  or (v_emp is null and u.titular_id = v_conta))
             and u.tarefa = 'nota' and u.status = 'ok'
             and u.criado_em >= public.ia_inicio_mes()),
         coalesce(v_cfg.cota_textos, 0),
         (select count(*)::integer from public.ia_uso u
           where ((v_emp is not null and u.empresa_id = v_emp)
                  or (v_emp is null and u.titular_id = v_conta))
             and u.tarefa <> 'nota' and u.status = 'ok'
             and u.criado_em >= public.ia_inicio_mes()),
         v_cfg.valida_ate;
end $$;

-- admin: a IA de cada construtora e de cada conta avulsa, com o uso do mês
create or replace function public.admin_ia()
returns table (empresa_id uuid, usuario_id uuid, ligada boolean, cota_notas integer,
               cota_textos integer, extra_notas integer, extra_mes text, valida_ate date,
               usado_notas integer, usado_textos integer, custo_usd_mes numeric)
language sql stable security definer set search_path = '' as $$
  select c.empresa_id, c.usuario_id, c.ligada, c.cota_notas, c.cota_textos,
         c.extra_notas, c.extra_mes, c.valida_ate,
         (select count(*)::integer from public.ia_uso u
           where (u.empresa_id = c.empresa_id or u.titular_id = c.usuario_id)
             and u.tarefa = 'nota' and u.status = 'ok'
             and u.criado_em >= public.ia_inicio_mes()),
         (select count(*)::integer from public.ia_uso u
           where (u.empresa_id = c.empresa_id or u.titular_id = c.usuario_id)
             and u.tarefa <> 'nota' and u.status = 'ok'
             and u.criado_em >= public.ia_inicio_mes()),
         (select coalesce(sum(u.custo_usd), 0) from public.ia_uso u
           where (u.empresa_id = c.empresa_id or u.titular_id = c.usuario_id)
             and u.criado_em >= public.ia_inicio_mes())
    from public.ia_config c
   where public.pode_admin();
$$;

create or replace function public.admin_definir_ia(p_empresa uuid, p_usuario uuid,
  p_ligada boolean, p_cota_notas integer, p_cota_textos integer,
  p_extra_notas integer, p_valida_ate date)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_mes text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM');
begin
  if not public.pode_admin() then
    raise exception 'Só o administrador do sistema define a IA.' using errcode = '42501';
  end if;
  if num_nonnulls(p_empresa, p_usuario) <> 1 then
    raise exception 'Informe a construtora ou a conta, não as duas.' using errcode = '22023';
  end if;
  update public.ia_config c
     set ligada = coalesce(p_ligada, false),
         cota_notas = coalesce(p_cota_notas, 0),
         cota_textos = coalesce(p_cota_textos, 0),
         extra_notas = coalesce(p_extra_notas, 0),
         extra_mes = case when coalesce(p_extra_notas, 0) > 0 then v_mes end,
         valida_ate = p_valida_ate,
         atualizado_em = now()
   where (p_empresa is not null and c.empresa_id = p_empresa)
      or (p_usuario is not null and c.usuario_id = p_usuario);
  if not found then
    insert into public.ia_config (empresa_id, usuario_id, ligada, cota_notas,
      cota_textos, extra_notas, extra_mes, valida_ate)
    values (p_empresa, p_usuario, coalesce(p_ligada, false), coalesce(p_cota_notas, 0),
      coalesce(p_cota_textos, 0), coalesce(p_extra_notas, 0),
      case when coalesce(p_extra_notas, 0) > 0 then v_mes end, p_valida_ate);
  end if;
end $$;

-- execução: o que é da função `ia` e da tela, para quem está logado; o
-- resto, fechado (o padrão da 0019)
revoke execute on function public.ia_titular(text) from public, anon, authenticated;
revoke execute on function public.ia_inicio_mes() from public, anon;
revoke execute on function public.ia_concluir(uuid, text, text, integer, integer, numeric, integer, text)
  from public, anon, authenticated;
grant execute on function public.ia_concluir(uuid, text, text, integer, integer, numeric, integer, text)
  to service_role;
revoke execute on function public.ia_reservar(text, text) from public, anon;
revoke execute on function public.ia_marcar_correcoes(uuid, integer) from public, anon;
revoke execute on function public.ia_situacao(text) from public, anon;
revoke execute on function public.admin_ia() from public, anon;
revoke execute on function public.admin_definir_ia(uuid, uuid, boolean, integer, integer, integer, date)
  from public, anon;
grant execute on function public.ia_reservar(text, text) to authenticated;
grant execute on function public.ia_marcar_correcoes(uuid, integer) to authenticated;
grant execute on function public.ia_situacao(text) to authenticated;
grant execute on function public.admin_ia() to authenticated;
grant execute on function public.admin_definir_ia(uuid, uuid, boolean, integer, integer, integer, date)
  to authenticated;

-- Conferência (só leitura): esperado tabelas=2, rls=2, politicas=2,
-- checks=8, funcoes=8.
select
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name in ('ia_config', 'ia_uso')) as tabelas,
  (select count(*) from pg_class
    where oid in ('public.ia_config'::regclass, 'public.ia_uso'::regclass)
      and relrowsecurity) as rls,
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename in ('ia_config', 'ia_uso')) as politicas,
  (select count(*) from pg_constraint
    where conrelid in ('public.ia_config'::regclass, 'public.ia_uso'::regclass)
      and contype = 'c') as checks,
  (select count(*) from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname in ('ia_titular', 'ia_inicio_mes', 'ia_reservar', 'ia_concluir',
                      'ia_marcar_correcoes', 'ia_situacao', 'admin_ia',
                      'admin_definir_ia')) as funcoes;
