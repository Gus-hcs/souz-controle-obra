-- =====================================================================
--  0028 — IA: "Perguntar" — perguntas sobre as obras (out/2026).
--
--  POR QUÊ
--  A equipe pergunta em português ("o que está atrasado na Casa 07?") e
--  o assistente responde com os números do próprio sistema. As contas
--  rodam no navegador, nas mesmas funções da tela (dominio/assistente.js);
--  a função `ia` só faz a ponte com a Anthropic. Cada pergunta é uma linha
--  em ia_uso, com as voltas de ferramenta somadas — nunca o texto.
--
--  O QUE MUDA
--  - ia_config.cota_perguntas: perguntas por mês (só o admin grava).
--  - ia_uso: tarefa 'pergunta' e a coluna voltas (0 a 10).
--  - ia_reservar_pergunta(): reserva sem obra — o titular é a construtora
--    de quem pergunta (gestor ou engenheiro) ou a própria conta avulsa.
--    Cliente final não pergunta nesta versão. Mesmas travas da nota:
--    eu_ativo, IA ligada, prazo, cota do mês, 30 por pessoa por hora.
--  - ia_continuar(id): cada volta seguinte confere que a pergunta é de
--    quem pede, está aberta, tem menos de 10 minutos e menos de 6 voltas.
--  - ia_somar(...): só a service_role; soma tokens, custo e tempo de cada
--    volta e, na última, fecha como 'ok' ou 'erro'.
--  - ia_situacao_perguntas(), admin_ia_perguntas(),
--    admin_definir_ia_perguntas(): a tela e o admin.
--  - ia_reservar, ia_situacao e admin_ia são recriadas IGUAIS às da 0027,
--    só tirando as perguntas da conta de "textos" (mesma assinatura e
--    mesmo retorno: create or replace, nenhum drop de função).
--
--  Nenhum drop de política. Pode rodar de novo. Mande em partes pequenas,
--  com lock_timeout (o conector expirou na 0027 inteira). Se um dia a 0027
--  for rodada de novo, rode a 0028 depois (a 0027 recria a regra de tarefa
--  sem 'pergunta' e as três funções acima com a conta antiga de textos).
-- =====================================================================

-- 1. Colunas e regras ---------------------------------------------------
alter table public.ia_config add column if not exists cota_perguntas integer not null default 0;
alter table public.ia_config drop constraint if exists chk_ia_config_perguntas;
alter table public.ia_config add constraint chk_ia_config_perguntas
  check (cota_perguntas between 0 and 100000);

alter table public.ia_uso add column if not exists voltas integer not null default 0;
alter table public.ia_uso drop constraint if exists chk_ia_uso_voltas;
alter table public.ia_uso add constraint chk_ia_uso_voltas check (voltas between 0 and 10);

alter table public.ia_uso drop constraint if exists chk_ia_uso_tarefa;
alter table public.ia_uso add constraint chk_ia_uso_tarefa
  check (tarefa in ('nota', 'diario', 'relatorio', 'planilha', 'pergunta'));

-- 2. Recriadas da 0027: perguntas fora da conta de "textos" -------------
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
     and (case when p_tarefa = 'nota' then u.tarefa = 'nota' else u.tarefa not in ('nota', 'pergunta') end)
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
             and u.tarefa not in ('nota', 'pergunta') and u.status = 'ok'
             and u.criado_em >= public.ia_inicio_mes()),
         v_cfg.valida_ate;
end $$;

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
             and u.tarefa not in ('nota', 'pergunta') and u.status = 'ok'
             and u.criado_em >= public.ia_inicio_mes()),
         (select coalesce(sum(u.custo_usd), 0) from public.ia_uso u
           where (u.empresa_id = c.empresa_id or u.titular_id = c.usuario_id)
             and u.criado_em >= public.ia_inicio_mes())
    from public.ia_config c
   where public.pode_admin();
$$;

-- 3. Perguntas ----------------------------------------------------------
-- titular de quem pergunta: a construtora (gestor ou engenheiro ativo) ou
-- a própria conta avulsa; cliente final de construtora não tem titular
create or replace function public.ia_titular_pergunta(out empresa uuid, out conta uuid)
language sql stable security definer set search_path = '' as $$
  select public.minha_empresa(),
         case when public.minha_empresa() is null
                   and exists (select 1 from public.perfis p
                                where p.id = auth.uid() and p.empresa_id is null)
              then auth.uid() end;
$$;

create or replace function public.ia_reservar_pergunta()
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_emp uuid;
  v_conta uuid;
  v_cfg public.ia_config;
  v_usado integer;
  v_id uuid;
begin
  if auth.uid() is null or not public.eu_ativo() then
    raise exception 'ia: sem acesso' using errcode = '42501';
  end if;
  select t.empresa, t.conta into v_emp, v_conta from public.ia_titular_pergunta() t;
  if v_emp is null and v_conta is null then
    raise exception 'ia: só a equipe pergunta' using errcode = '42501';
  end if;

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
  if (select count(*) from public.ia_uso u
       where u.usuario_id = auth.uid()
         and u.criado_em > now() - interval '1 hour') >= 30 then
    raise exception 'ia: limite por hora' using errcode = 'P0001';
  end if;

  select count(*) into v_usado from public.ia_uso u
   where ((v_emp is not null and u.empresa_id = v_emp)
          or (v_emp is null and u.titular_id = v_conta))
     and u.tarefa = 'pergunta'
     and u.criado_em >= public.ia_inicio_mes()
     and (u.status = 'ok'
          or (u.status = 'reservada' and u.criado_em > now() - interval '10 minutes'));
  if v_usado >= v_cfg.cota_perguntas then
    raise exception 'ia: cota esgotada' using errcode = 'P0001';
  end if;

  insert into public.ia_uso (empresa_id, titular_id, usuario_id, tarefa)
  values (v_emp, case when v_emp is null then v_conta end, auth.uid(), 'pergunta')
  returning id into v_id;
  return v_id;
end $$;

-- volta seguinte da mesma pergunta: só quem perguntou, aberta, recente
create or replace function public.ia_continuar(p_id uuid)
returns integer language plpgsql stable security definer set search_path = '' as $$
declare
  v_voltas integer;
begin
  select u.voltas into v_voltas from public.ia_uso u
   where u.id = p_id
     and u.usuario_id = auth.uid()
     and u.tarefa = 'pergunta'
     and u.status = 'reservada'
     and u.criado_em > now() - interval '10 minutes'
     and public.eu_ativo();
  if not found then
    raise exception 'ia: pergunta encerrada' using errcode = 'P0001';
  end if;
  if v_voltas >= 6 then
    raise exception 'ia: voltas esgotadas' using errcode = 'P0001';
  end if;
  return v_voltas;
end $$;

create or replace function public.ia_somar(p_id uuid, p_status text, p_modelo text,
  p_tokens_entrada integer, p_tokens_saida integer, p_custo_usd numeric,
  p_ms integer, p_erro text)
returns void language sql security definer set search_path = '' as $$
  update public.ia_uso
     set modelo = left(coalesce(p_modelo, ''), 60),
         tokens_entrada = tokens_entrada + greatest(coalesce(p_tokens_entrada, 0), 0),
         tokens_saida = tokens_saida + greatest(coalesce(p_tokens_saida, 0), 0),
         custo_usd = custo_usd + greatest(coalesce(p_custo_usd, 0), 0),
         ms = ms + greatest(coalesce(p_ms, 0), 0),
         voltas = least(voltas + 1, 10),
         status = case when p_status in ('ok', 'erro') then p_status else status end,
         erro = coalesce(left(p_erro, 300), erro)
   where id = p_id and tarefa = 'pergunta' and status = 'reservada';
$$;

create or replace function public.ia_situacao_perguntas()
returns table (ligada boolean, cota_perguntas integer, usado_perguntas integer, valida_ate date)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_emp uuid;
  v_conta uuid;
  v_cfg public.ia_config;
begin
  if auth.uid() is null or not public.eu_ativo() then
    return;
  end if;
  select t.empresa, t.conta into v_emp, v_conta from public.ia_titular_pergunta() t;
  if v_emp is null and v_conta is null then
    return;
  end if;
  select * into v_cfg from public.ia_config c
   where (v_emp is not null and c.empresa_id = v_emp)
      or (v_emp is null and c.usuario_id = v_conta);
  return query
  select coalesce(v_cfg.ligada, false)
           and (v_cfg.valida_ate is null
                or v_cfg.valida_ate >= (now() at time zone 'America/Sao_Paulo')::date),
         coalesce(v_cfg.cota_perguntas, 0),
         (select count(*)::integer from public.ia_uso u
           where ((v_emp is not null and u.empresa_id = v_emp)
                  or (v_emp is null and u.titular_id = v_conta))
             and u.tarefa = 'pergunta' and u.status = 'ok'
             and u.criado_em >= public.ia_inicio_mes()),
         v_cfg.valida_ate;
end $$;

create or replace function public.admin_ia_perguntas()
returns table (empresa_id uuid, usuario_id uuid, cota_perguntas integer, usado_perguntas integer)
language sql stable security definer set search_path = '' as $$
  select c.empresa_id, c.usuario_id, c.cota_perguntas,
         (select count(*)::integer from public.ia_uso u
           where (u.empresa_id = c.empresa_id or u.titular_id = c.usuario_id)
             and u.tarefa = 'pergunta' and u.status = 'ok'
             and u.criado_em >= public.ia_inicio_mes())
    from public.ia_config c
   where public.pode_admin();
$$;

create or replace function public.admin_definir_ia_perguntas(p_empresa uuid, p_usuario uuid,
  p_cota integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.pode_admin() then
    raise exception 'Só o administrador do sistema define a IA.' using errcode = '42501';
  end if;
  if num_nonnulls(p_empresa, p_usuario) <> 1 then
    raise exception 'Informe a construtora ou a conta, não as duas.' using errcode = '22023';
  end if;
  update public.ia_config c
     set cota_perguntas = coalesce(p_cota, 0), atualizado_em = now()
   where (p_empresa is not null and c.empresa_id = p_empresa)
      or (p_usuario is not null and c.usuario_id = p_usuario);
  if not found then
    raise exception 'Ligue a IA antes de definir as perguntas.' using errcode = 'P0001';
  end if;
end $$;

-- 4. Execução -----------------------------------------------------------
revoke execute on function public.ia_titular_pergunta() from public, anon, authenticated;
revoke execute on function public.ia_somar(uuid, text, text, integer, integer, numeric, integer, text)
  from public, anon, authenticated;
grant execute on function public.ia_somar(uuid, text, text, integer, integer, numeric, integer, text)
  to service_role;
revoke execute on function public.ia_reservar_pergunta() from public, anon;
revoke execute on function public.ia_continuar(uuid) from public, anon;
revoke execute on function public.ia_situacao_perguntas() from public, anon;
revoke execute on function public.admin_ia_perguntas() from public, anon;
revoke execute on function public.admin_definir_ia_perguntas(uuid, uuid, integer) from public, anon;
grant execute on function public.ia_reservar_pergunta() to authenticated;
grant execute on function public.ia_continuar(uuid) to authenticated;
grant execute on function public.ia_situacao_perguntas() to authenticated;
grant execute on function public.admin_ia_perguntas() to authenticated;
grant execute on function public.admin_definir_ia_perguntas(uuid, uuid, integer) to authenticated;

-- Conferência (só leitura): esperado colunas=2, checks=3, funcoes=7.
select
  (select count(*) from information_schema.columns
    where table_schema = 'public'
      and ((table_name = 'ia_config' and column_name = 'cota_perguntas')
        or (table_name = 'ia_uso' and column_name = 'voltas'))) as colunas,
  (select count(*) from pg_constraint
    where conname in ('chk_ia_config_perguntas', 'chk_ia_uso_voltas', 'chk_ia_uso_tarefa')) as checks,
  (select count(*) from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname in ('ia_titular_pergunta', 'ia_reservar_pergunta', 'ia_continuar', 'ia_somar',
                      'ia_situacao_perguntas', 'admin_ia_perguntas',
                      'admin_definir_ia_perguntas')) as funcoes;
