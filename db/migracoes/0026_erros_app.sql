-- =====================================================================
--  0026 — Erros do app (set/2026).
--
--  POR QUÊ
--  Hoje, quando uma tela quebra no aparelho de alguém, ninguém fica
--  sabendo: o erro morre no console do navegador. Com clientes pagando,
--  o administrador precisa ver o que está quebrando antes da ligação.
--
--  O QUE MUDA
--  - Tabela public.erros_app: mensagem, origem (arquivo:linha), pilha,
--    tela, versão do app e navegador. SEM dado da obra: o app corta
--    e-mail, número longo e parâmetro de URL antes de mandar
--    (registroErroApp em src/dados/erros.js), e os CHECKs de tamanho
--    espelham validarErroApp (src/dominio/validacao.js).
--  - RLS: cada conta ativa grava só o próprio erro (usuario_id =
--    auth.uid(), eu_ativo()); só o administrador do sistema lê e apaga.
--    Ninguém altera.
--  - Gatilho trg_erros_app_limite: carimba conta e hora pelo servidor e
--    descarta em silêncio o que passar de 60 erros por conta por hora —
--    uma conta não enche a tabela, nem de propósito.
--
--  ORDEM: independe dos PRs. Sem ela, o app novo tenta gravar, recebe
--  erro e desiste calado; a tela do admin avisa que falta a 0026.
--  Pode rodar de novo: if not exists, drop ... if exists.
-- =====================================================================

create table if not exists public.erros_app (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  usuario_id uuid default auth.uid() references auth.users (id) on delete set null,
  mensagem text not null,
  origem text not null default '',
  pilha text not null default '',
  tela text not null default '',
  versao text not null default '',
  navegador text not null default ''
);

alter table public.erros_app drop constraint if exists chk_erros_app_mensagem;
alter table public.erros_app add constraint chk_erros_app_mensagem
  check (char_length(btrim(mensagem)) between 1 and 300);
alter table public.erros_app drop constraint if exists chk_erros_app_origem;
alter table public.erros_app add constraint chk_erros_app_origem
  check (char_length(origem) <= 200);
alter table public.erros_app drop constraint if exists chk_erros_app_pilha;
alter table public.erros_app add constraint chk_erros_app_pilha
  check (char_length(pilha) <= 1500);
alter table public.erros_app drop constraint if exists chk_erros_app_tela;
alter table public.erros_app add constraint chk_erros_app_tela
  check (tela ~ '^[a-z0-9-]{0,40}$');
alter table public.erros_app drop constraint if exists chk_erros_app_versao;
alter table public.erros_app add constraint chk_erros_app_versao
  check (char_length(versao) <= 40);
alter table public.erros_app drop constraint if exists chk_erros_app_navegador;
alter table public.erros_app add constraint chk_erros_app_navegador
  check (char_length(navegador) <= 200);

-- a lista do admin (mais recentes primeiro) e o limite por conta
create index if not exists erros_app_criado_em_idx on public.erros_app (criado_em desc);
create index if not exists erros_app_usuario_idx on public.erros_app (usuario_id, criado_em desc);

-- Gatilho: conta e hora vêm do servidor; passou de 60 na hora, descarta.
create or replace function public.erros_app_limite()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.usuario_id := auth.uid();
  new.criado_em := now();
  if (select count(*) from public.erros_app e
       where e.usuario_id = new.usuario_id
         and e.criado_em > now() - interval '1 hour') >= 60 then
    return null;
  end if;
  return new;
end;
$$;
revoke execute on function public.erros_app_limite() from public, anon, authenticated;

drop trigger if exists trg_erros_app_limite on public.erros_app;
create trigger trg_erros_app_limite before insert on public.erros_app
  for each row execute function public.erros_app_limite();

-- RLS: grava a própria conta ativa; lê e apaga só o admin; ninguém altera.
alter table public.erros_app enable row level security;
revoke all on public.erros_app from anon, authenticated;
grant insert, select, delete on public.erros_app to authenticated;

drop policy if exists erros_app_insert on public.erros_app;
create policy erros_app_insert on public.erros_app for insert to authenticated
  with check (usuario_id = (select auth.uid()) and (select public.eu_ativo()));

drop policy if exists erros_app_select on public.erros_app;
create policy erros_app_select on public.erros_app for select to authenticated
  using ((select public.pode_admin()));

drop policy if exists erros_app_delete on public.erros_app;
create policy erros_app_delete on public.erros_app for delete to authenticated
  using ((select public.pode_admin()));

-- Conferência (só leitura): esperado tabela=1, rls=true, politicas=3,
-- checks=6, gatilho=1.
select
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name = 'erros_app') as tabela,
  (select relrowsecurity from pg_class where oid = 'public.erros_app'::regclass) as rls,
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'erros_app') as politicas,
  (select count(*) from pg_constraint
    where conrelid = 'public.erros_app'::regclass and contype = 'c') as checks,
  (select count(*) from pg_trigger
    where tgrelid = 'public.erros_app'::regclass and tgname = 'trg_erros_app_limite') as gatilho;
