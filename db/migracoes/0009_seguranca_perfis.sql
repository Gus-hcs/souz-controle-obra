-- =====================================================================
--  0009 — Fecha a escalada de privilégio em `perfis` e endurece o
--         restante das funções de segurança.
--
--  FALHA CORRIGIDA (residual da 0006)
--  ---------------------------------
--  A 0006 tirou o UPDATE das colunas de controle (admin / plano /
--  bloqueado / abas) e pôs um gatilho BEFORE UPDATE que reverte a
--  alteração de quem não é admin. Mas INSERT e DELETE em `perfis`
--  continuaram liberados para o usuário logado — a política "for all"
--  da 0001 mais o grant padrão do Supabase. Um usuário comum podia:
--
--      delete from public.perfis where id = auth.uid();
--      insert into public.perfis (id, admin) values (auth.uid(), true);
--
--  e virar admin — ou simplesmente escapar de um `bloqueado = true`
--  apagando a própria linha. O gatilho da 0006 não pega INSERT.
--
--  Esta migração:
--    1. REVOGA insert e delete de `perfis` para anon / authenticated;
--    2. troca a política "for all" por leitura + update do próprio dono
--       (sem insert, sem delete pela API);
--    3. estende o gatilho para BEFORE INSERT OR UPDATE, forçando as
--       colunas de controle a valores seguros no INSERT de quem não é
--       admin (rede de segurança, caso algum grant volte);
--    4. trava `search_path = ''` nas funções que ainda estavam em
--       `public` (criar_perfil, marcar_atualizacao, obra_dono_membro,
--       obra_protege_dono, registrar_auditoria).
--
--  A criação do perfil continua pelo gatilho `criar_perfil()`
--  (security definer, dono = postgres), que não depende do grant do
--  usuário nem da RLS.
--
--  Pode ser rodado de novo sem quebrar. Rode 0001–0008 antes.
--  APLICAR NO SUPABASE É MANUAL, feito pelo dono do projeto (SQL Editor).
-- =====================================================================

-- ---------------------------------------------- 1. privilégios de perfis
revoke insert, delete on public.perfis from anon, authenticated;

-- ---------------------------------------------- 2. políticas de perfis
-- Substitui a política "for all" (0001) por leitura + update do dono.
-- Sem política de INSERT nem DELETE: ninguém cria/apaga perfil pela API.
drop policy if exists perfil_proprio         on public.perfis;
drop policy if exists perfil_proprio_ler     on public.perfis;
drop policy if exists perfil_proprio_alterar on public.perfis;

create policy perfil_proprio_ler on public.perfis for select
  using (id = auth.uid());

create policy perfil_proprio_alterar on public.perfis for update
  using (id = auth.uid()) with check (id = auth.uid());

-- perfil_admin_ler / perfil_admin_alterar (0005) continuam valendo.

-- ---------------------------------------------- 3. gatilho cobre INSERT
create or replace function public.perfil_trava_controle()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not public.pode_admin() then
    if tg_op = 'INSERT' then
      new.admin        := false;
      new.plano        := 'ativo';
      new.bloqueado    := false;
      new.abas         := '{}'::jsonb;
      new.limite_obras := null;
    else
      new.admin        := old.admin;
      new.plano        := old.plano;
      new.bloqueado    := old.bloqueado;
      new.abas         := old.abas;
      new.limite_obras := old.limite_obras;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_perfil_trava on public.perfis;
create trigger trg_perfil_trava before insert or update on public.perfis
  for each row execute function public.perfil_trava_controle();

-- ---------------------------------------------- 4. search_path travado
-- Funções que a 0006 não alcançou. Todas já qualificam os nomes; o
-- search_path vazio só remove o vetor de sequestro por objeto homônimo.

create or replace function public.criar_perfil()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.perfis (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end $$;

create or replace function public.marcar_atualizacao()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.atualizado_em = now();
  return new;
end $$;

create or replace function public.obra_dono_membro()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.obra_membros (obra_id, usuario_id, papel)
  values (new.id, new.usuario_id, 'dono')
  on conflict (obra_id, usuario_id) do nothing;
  return new;
end $$;

create or replace function public.obra_protege_dono()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.papel = 'dono'
     and (tg_op = 'DELETE' or new.papel <> 'dono')
     and exists (select 1 from public.obras where id = old.obra_id)
     and not exists (
       select 1 from public.obra_membros
       where obra_id = old.obra_id and papel = 'dono' and id <> old.id
     )
  then
    raise exception 'Uma obra precisa de pelo menos um dono.';
  end if;
  return case tg_op when 'DELETE' then old else new end;
end $$;

-- registrar_auditoria() só existe se a 0003 foi aplicada.
do $$
begin
  if to_regprocedure('public.registrar_auditoria()') is not null then
    execute $fn$
      create or replace function public.registrar_auditoria()
      returns trigger language plpgsql security definer set search_path = '' as $body$
      declare
        campo    text;
        j_old    jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) else '{}'::jsonb end;
        j_new    jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) else '{}'::jsonb end;
        v_antes  text;
        v_depois text;
        v_obra   text := coalesce(j_new ->> 'obra_id', j_old ->> 'obra_id');
        v_id     text := coalesce(j_new ->> 'id', j_old ->> 'id');
      begin
        foreach campo in array tg_argv
        loop
          v_antes  := j_old ->> campo;
          v_depois := j_new ->> campo;
          if tg_op = 'UPDATE' then
            if v_antes is not distinct from v_depois then
              continue;
            end if;
            begin
              if v_antes::numeric = v_depois::numeric then
                continue;
              end if;
            exception when others then
              null;
            end;
          elsif tg_op = 'INSERT' and coalesce(nullif(v_depois, '')::numeric, 0) = 0 then
            continue;
          elsif tg_op = 'DELETE' and coalesce(nullif(v_antes, '')::numeric, 0) = 0 then
            continue;
          end if;
          insert into public.auditoria
            (usuario_id, obra_id, tabela, registro_id, operacao, campo, valor_antes, valor_depois)
          values
            (auth.uid(), v_obra, tg_table_name, v_id, tg_op, campo, v_antes, v_depois);
        end loop;
        return null;
      end $body$;
    $fn$;
  end if;
end $$;


-- =====================================================================
--  DIAGNÓSTICO — rode e confira o resultado
-- =====================================================================

-- (a) authenticated / anon NÃO devem ter INSERT ou DELETE em perfis:
select 'grants perfis' as verificacao, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'perfis'
  and grantee in ('anon', 'authenticated')
order by grantee, privilege_type;
-- Esperado: nenhuma linha INSERT nem DELETE (só SELECT e as colunas de UPDATE).

-- (b) políticas de perfis: só SELECT e UPDATE:
select 'policies perfis' as verificacao, policyname, cmd
from pg_policies
where schemaname = 'public' and tablename = 'perfis'
order by policyname;
-- Esperado: perfil_admin_ler (SELECT), perfil_admin_alterar (UPDATE),
--           perfil_proprio_ler (SELECT), perfil_proprio_alterar (UPDATE).

-- (c) funções de segurança — todas com search_path vazio:
select 'search_path' as verificacao, p.proname, p.proconfig
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('criar_perfil', 'marcar_atualizacao', 'obra_dono_membro',
                    'obra_protege_dono', 'registrar_auditoria', 'perfil_trava_controle',
                    'pode_admin', 'pode_ler_obra', 'pode_escrever_obra', 'eh_dono_obra',
                    'admin_consumo', 'admin_definir_perfil', 'obra_checa_limite')
order by p.proname;
-- Esperado: proconfig = {search_path=""} em todas.
