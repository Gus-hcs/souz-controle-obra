-- =====================================================================
--  0014 — Convidar engenheiro/cliente por e-mail.
--
--  POR QUÊ
--  A 0004 criou obra_membros e as políticas de acesso por papel, mas só
--  aceita o UUID de quem já tem conta — não dá pra convidar por e-mail
--  porque auth.users não é legível pelo cliente (correto: ninguém deveria
--  listar todos os e-mails cadastrados). Esta migração resolve com duas
--  funções security definer, que rodam com privilégio elevado só para o
--  que pedem, sem abrir auth.users de verdade:
--
--    convidar_membro(obra, email, papel) — só o dono da obra chama; acha
--    o usuário pelo e-mail (exato, sem listar nada) e grava/atualiza o
--    papel em obra_membros. Erro claro se a pessoa ainda não tem conta —
--    ela precisa criar uma primeiro (não há e-mail de convite; é a mesma
--    limitação de sempre: sistema sem servidor próprio, só Supabase).
--
--    membros_da_obra(obra) — devolve os membros da obra JUNTO com o
--    e-mail (join com auth.users, que exige security definer). Sem ela a
--    tela só teria o UUID, ilegível para gente.
--
--  Nenhuma tabela nova, nenhum RLS novo — as duas funções fazem a própria
--  checagem de permissão por dentro (pode_ler_obra / eh_dono_obra), e é
--  esse texto: 'security definer' + 'search_path = public' que evita SQL
--  injection via search_path malicioso, o mesmo padrão das funções da 0004.
--
--  Pode ser rodado de novo sem quebrar.
--  APLICAR NO SUPABASE É MANUAL, feito pelo dono do projeto (SQL Editor).
--  Rode 0001 a 0004 antes deste (obra_membros precisa existir).
-- =====================================================================

create or replace function public.convidar_membro(p_obra text, p_email text, p_papel text)
returns table (usuario_id uuid, email text, papel text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
begin
  if not public.eh_dono_obra(p_obra) then
    raise exception 'Só o dono da obra pode convidar.';
  end if;
  if p_papel not in ('engenheiro', 'cliente') then
    raise exception 'Papel inválido: use engenheiro ou cliente.';
  end if;

  select u.id into v_uid from auth.users u where lower(u.email) = lower(trim(p_email)) limit 1;
  if v_uid is null then
    raise exception 'Não existe conta com o e-mail %. A pessoa precisa criar uma conta no sistema antes de ser convidada.', p_email;
  end if;
  if v_uid = auth.uid() then
    raise exception 'Você já é o dono desta obra.';
  end if;

  insert into public.obra_membros (obra_id, usuario_id, papel)
  values (p_obra, v_uid, p_papel)
  on conflict (obra_id, usuario_id) do update set papel = excluded.papel;

  return query select v_uid, p_email, p_papel;
end;
$$;

grant execute on function public.convidar_membro(text, text, text) to authenticated;

create or replace function public.membros_da_obra(p_obra text)
returns table (id uuid, usuario_id uuid, email text, papel text, criado_em timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, m.usuario_id, u.email, m.papel, m.criado_em
  from public.obra_membros m
  join auth.users u on u.id = m.usuario_id
  where public.pode_ler_obra(p_obra) and m.obra_id = p_obra
  order by (m.papel = 'dono') desc, m.criado_em;
$$;

grant execute on function public.membros_da_obra(text) to authenticated;
