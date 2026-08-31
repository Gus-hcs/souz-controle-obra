-- =====================================================================
--  0004 — Equipe da obra: mais de um usuário por obra, com papel.
--
--  Antes: cada obra pertencia a uma pessoa (usuario_id = auth.uid()).
--  Agora: a obra tem uma tabela de membros. O papel decide o acesso:
--
--    dono        — tudo, inclusive gerenciar a equipe e excluir a obra
--    engenheiro  — lança, mede, edita; não gerencia equipe nem exclui a obra
--    cliente     — só leitura
--
--  O usuario_id das linhas passa a significar "quem criou/alterou", não
--  "dono" — o controle de acesso é pela obra, via tabela de membros.
--
--  Toda obra existente ganha uma linha de membro 'dono' para o seu
--  usuario_id atual, então nada muda para quem já usa o sistema sozinho.
--
--  Pode ser rodado de novo sem quebrar.
--  APLICAR NO SUPABASE É MANUAL, feito pelo dono do projeto (SQL Editor).
--  Rode 0001, 0002 e 0003 antes deste.
-- =====================================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------- tabela de membros
create table if not exists public.obra_membros (
  id         uuid primary key default gen_random_uuid(),
  obra_id    text not null references public.obras on delete cascade,
  usuario_id uuid not null references auth.users on delete cascade,
  papel      text not null default 'engenheiro'
             check (papel in ('dono', 'engenheiro', 'cliente')),
  criado_em  timestamptz not null default now(),
  unique (obra_id, usuario_id)
);

create index if not exists idx_obra_membros_usuario on public.obra_membros(usuario_id);
create index if not exists idx_obra_membros_obra    on public.obra_membros(obra_id);

-- ------------------------------------------------ funções de autorização
-- security definer: consultam obra_membros por fora da RLS, o que evita a
-- recursão infinita de uma política que consulta a própria tabela.
create or replace function public.pode_ler_obra(p_obra text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.obra_membros m
    where m.obra_id = p_obra and m.usuario_id = auth.uid()
  );
$$;

create or replace function public.pode_escrever_obra(p_obra text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.obra_membros m
    where m.obra_id = p_obra and m.usuario_id = auth.uid()
      and m.papel in ('dono', 'engenheiro')
  );
$$;

create or replace function public.eh_dono_obra(p_obra text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.obra_membros m
    where m.obra_id = p_obra and m.usuario_id = auth.uid() and m.papel = 'dono'
  );
$$;

-- ---------------------------------- toda obra nova ganha o dono como membro
create or replace function public.obra_dono_membro()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.obra_membros (obra_id, usuario_id, papel)
  values (new.id, new.usuario_id, 'dono')
  on conflict (obra_id, usuario_id) do nothing;
  return new;
end $$;

drop trigger if exists trg_obra_dono_membro on public.obras;
create trigger trg_obra_dono_membro after insert on public.obras
  for each row execute function public.obra_dono_membro();

-- --------------------------------- uma obra nunca fica sem nenhum dono
create or replace function public.obra_protege_dono()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.papel = 'dono'
     and (tg_op = 'DELETE' or new.papel <> 'dono')
     and exists (select 1 from public.obras where id = old.obra_id)  -- ignora a cascata de exclusão da obra
     and not exists (
       select 1 from public.obra_membros
       where obra_id = old.obra_id and papel = 'dono' and id <> old.id
     )
  then
    raise exception 'Uma obra precisa de pelo menos um dono.';
  end if;
  return case tg_op when 'DELETE' then old else new end;
end $$;

drop trigger if exists trg_obra_protege_dono on public.obra_membros;
create trigger trg_obra_protege_dono before update or delete on public.obra_membros
  for each row execute function public.obra_protege_dono();

-- ---------------------------------- membro 'dono' para as obras já existentes
insert into public.obra_membros (obra_id, usuario_id, papel)
select id, usuario_id, 'dono' from public.obras
on conflict (obra_id, usuario_id) do nothing;

-- =====================================================================
--  SEGURANÇA — políticas apontando para obra_membros
-- =====================================================================

-- ---- obra_membros: cada um vê a equipe das obras de que participa;
--      só o dono monta a equipe.
alter table public.obra_membros enable row level security;

drop policy if exists membros_leitura on public.obra_membros;
create policy membros_leitura on public.obra_membros for select
  using (public.pode_ler_obra(obra_id));

drop policy if exists membros_gestao_ins on public.obra_membros;
create policy membros_gestao_ins on public.obra_membros for insert
  with check (public.eh_dono_obra(obra_id));

drop policy if exists membros_gestao_upd on public.obra_membros;
create policy membros_gestao_upd on public.obra_membros for update
  using (public.eh_dono_obra(obra_id)) with check (public.eh_dono_obra(obra_id));

drop policy if exists membros_gestao_del on public.obra_membros;
create policy membros_gestao_del on public.obra_membros for delete
  using (public.eh_dono_obra(obra_id));

-- ---- obras: membro lê; dono/engenheiro edita; só dono exclui.
--      O ramo usuario_id = auth.uid() garante que quem acabou de criar a
--      obra a enxergue no RETURNING, antes mesmo do gatilho rodar.
drop policy if exists dono_total   on public.obras;
drop policy if exists obras_ler    on public.obras;
drop policy if exists obras_criar  on public.obras;
drop policy if exists obras_alterar on public.obras;
drop policy if exists obras_remover on public.obras;

create policy obras_ler on public.obras for select
  using (usuario_id = auth.uid() or public.pode_ler_obra(id));
create policy obras_criar on public.obras for insert
  with check (usuario_id = auth.uid());
create policy obras_alterar on public.obras for update
  using (public.pode_escrever_obra(id)) with check (public.pode_escrever_obra(id));
create policy obras_remover on public.obras for delete
  using (public.eh_dono_obra(id));

-- ---- tabelas da obra: leitura para qualquer membro, escrita para
--      dono/engenheiro. O papel 'cliente' fica só com o SELECT.
do $$
declare t text;
begin
  foreach t in array array['contratos', 'medicoes', 'recebimentos', 'materiais',
                           'lancamentos', 'cronograma', 'diario']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists dono_total on public.%I', t);
    execute format('drop policy if exists ler on public.%I', t);
    execute format('drop policy if exists inserir on public.%I', t);
    execute format('drop policy if exists alterar on public.%I', t);
    execute format('drop policy if exists remover on public.%I', t);
    execute format('create policy ler on public.%I for select using (public.pode_ler_obra(obra_id))', t);
    execute format('create policy inserir on public.%I for insert with check (public.pode_escrever_obra(obra_id))', t);
    execute format('create policy alterar on public.%I for update using (public.pode_escrever_obra(obra_id)) with check (public.pode_escrever_obra(obra_id))', t);
    execute format('create policy remover on public.%I for delete using (public.pode_escrever_obra(obra_id))', t);
  end loop;
end $$;

-- ---- clientes e prestadores: continuam do dono (só ele cria e edita).
--      O membro convidado enxerga apenas os que a obra dele usa.
drop policy if exists dono_total on public.clientes;
drop policy if exists clientes_proprio on public.clientes;
drop policy if exists clientes_da_obra on public.clientes;
create policy clientes_proprio on public.clientes for all
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
create policy clientes_da_obra on public.clientes for select using (
  exists (
    select 1 from public.obras o
    where o.cliente_id = clientes.id and public.pode_ler_obra(o.id)
  )
);

drop policy if exists dono_total on public.prestadores;
drop policy if exists prestadores_proprio on public.prestadores;
drop policy if exists prestadores_da_obra on public.prestadores;
create policy prestadores_proprio on public.prestadores for all
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
create policy prestadores_da_obra on public.prestadores for select using (
  exists (
    select 1 from public.contratos c
    where c.prestador = prestadores.nome and public.pode_ler_obra(c.obra_id)
  )
  or exists (
    select 1 from public.lancamentos l
    where l.fornecedor = prestadores.nome and public.pode_ler_obra(l.obra_id)
  )
);

-- ---- auditoria: leitura por quem pode ler a obra (substitui a checagem
--      direta de usuario_id da obra, posta na 0003).
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'auditoria') then
    drop policy if exists auditoria_leitura on public.auditoria;
    create policy auditoria_leitura on public.auditoria for select
      using (usuario_id = auth.uid() or public.pode_ler_obra(obra_id));
  end if;
end $$;
