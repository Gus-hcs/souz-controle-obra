-- =====================================================================
--  0006 — Endurecimento de segurança.
--
--  Corrige a falha crítica introduzida na 0005: a política do perfil
--  era "for all", então o próprio usuário conseguia dar
--  `update perfis set admin = true` na própria linha e virar admin,
--  desbloquear a conta e liberar todas as abas — anulando a 0005.
--
--  Também: search_path travado nas funções de segurança, CREATE em
--  public bloqueado para o cliente, e um canal de admin (RPC) para
--  alterar plano/bloqueio/abas.
--
--  Pode ser rodado de novo sem quebrar. Rode 0001–0005 antes.
--  APLICAR NO SUPABASE É MANUAL.
-- =====================================================================

-- =====================================================================
--  1. perfis — o cliente não controla mais admin / plano / bloqueado / abas
-- =====================================================================

-- 1a. Retira o UPDATE amplo do cliente e devolve só as colunas dele.
revoke update on public.perfis from anon, authenticated;
grant  update (empresa_nome, responsavel, crea_cau, telefone, email, listas)
  on public.perfis to authenticated;

-- 1b. Rede de segurança no banco: se quem edita não é admin, qualquer
--     mudança nas colunas de controle é revertida antes de gravar.
create or replace function public.perfil_trava_controle()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not public.pode_admin() then
    new.admin     := old.admin;
    new.plano     := old.plano;
    new.bloqueado := old.bloqueado;
    new.abas      := old.abas;
  end if;
  return new;
end $$;

drop trigger if exists trg_perfil_trava on public.perfis;
create trigger trg_perfil_trava before update on public.perfis
  for each row execute function public.perfil_trava_controle();

-- 1c. Canal do admin para plano / bloqueio / abas de um cliente.
--     A coluna `admin` fica de fora — só muda pelo SQL Editor, para não
--     existir caminho de promoção a admin pela API.
create or replace function public.admin_definir_perfil(
  p_id        uuid,
  p_plano     text    default null,
  p_bloqueado boolean default null,
  p_abas      jsonb   default null
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
    plano     = coalesce(p_plano, plano),
    bloqueado = coalesce(p_bloqueado, bloqueado),
    abas      = coalesce(p_abas, abas)
  where id = p_id;
end $$;

revoke execute on function public.admin_definir_perfil(uuid, text, boolean, jsonb) from public, anon;
grant  execute on function public.admin_definir_perfil(uuid, text, boolean, jsonb) to authenticated;


-- =====================================================================
--  2. Funções de segurança — search_path travado e CREATE bloqueado
-- =====================================================================

-- Impede o cliente de criar objetos em `public` para sequestrar as
-- funções `security definer` por confusão de search_path.
revoke create on schema public from anon, authenticated;

-- Redefine as funções de autorização com search_path vazio; tudo qualificado.
create or replace function public.pode_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select p.admin from public.perfis p where p.id = auth.uid()), false);
$$;

create or replace function public.pode_ler_obra(p_obra text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.obra_membros m
    where m.obra_id = p_obra and m.usuario_id = auth.uid()
  );
$$;

create or replace function public.pode_escrever_obra(p_obra text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.obra_membros m
    where m.obra_id = p_obra and m.usuario_id = auth.uid()
      and m.papel in ('dono', 'engenheiro')
  );
$$;

create or replace function public.eh_dono_obra(p_obra text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.obra_membros m
    where m.obra_id = p_obra and m.usuario_id = auth.uid() and m.papel = 'dono'
  );
$$;


-- =====================================================================
--  3. Garante RLS ligada em todas as tabelas (idempotente)
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array['perfis', 'clientes', 'prestadores', 'obras', 'obra_membros',
    'contratos', 'medicoes', 'recebimentos', 'materiais', 'lancamentos', 'cronograma',
    'diario', 'auditoria']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
    end if;
  end loop;
end $$;


-- =====================================================================
--  4. Diagnóstico — rode e confira o resultado
-- =====================================================================
-- Deve listar TODAS as tabelas de public com rowsecurity = true.
select tablename, rowsecurity as rls_ligada
from pg_tables
where schemaname = 'public'
order by rowsecurity, tablename;
