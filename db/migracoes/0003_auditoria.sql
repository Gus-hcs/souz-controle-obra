-- =====================================================================
--  0003 — Trilha de auditoria dos valores financeiros.
--
--  Registra, por gatilho, toda mudança de valor financeiro em contratos,
--  medições, recebimentos e lançamentos: quem alterou, qual campo, de
--  quanto para quanto e quando.
--
--  Pode ser rodado de novo sem quebrar.
--
--  APLICAR NO SUPABASE É MANUAL, feito pelo dono do projeto (SQL Editor).
-- =====================================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------- tabela
create table if not exists public.auditoria (
  id           uuid primary key default gen_random_uuid(),
  usuario_id   uuid,                       -- quem fez a alteração (auth.uid no momento)
  obra_id      text,                       -- sem FK: a trilha sobrevive à exclusão da obra
  tabela       text not null,
  registro_id  text,
  operacao     text not null check (operacao in ('INSERT', 'UPDATE', 'DELETE')),
  campo        text not null,
  valor_antes  text,
  valor_depois text,
  criado_em    timestamptz not null default now()
);

create index if not exists idx_auditoria_obra on public.auditoria(obra_id, criado_em desc);

-- ---------------------------------------------------- função do gatilho
-- Recebe, via TG_ARGV, a lista de colunas financeiras a vigiar naquela tabela.
create or replace function public.registrar_auditoria()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
      -- ignora diferença que seja só de escala (1000 vs 1000.00)
      begin
        if v_antes::numeric = v_depois::numeric then
          continue;
        end if;
      exception when others then
        null;
      end;
    elsif tg_op = 'INSERT' and coalesce(nullif(v_depois, '')::numeric, 0) = 0 then
      continue;   -- não registra campo que nasceu zerado
    elsif tg_op = 'DELETE' and coalesce(nullif(v_antes, '')::numeric, 0) = 0 then
      continue;   -- não registra campo que já era zero
    end if;

    insert into public.auditoria
      (usuario_id, obra_id, tabela, registro_id, operacao, campo, valor_antes, valor_depois)
    values
      (auth.uid(), v_obra, tg_table_name, v_id, tg_op, campo, v_antes, v_depois);
  end loop;

  return null;   -- gatilho AFTER: o valor de retorno é ignorado
end $$;

-- ---------------------------------------------------------- gatilhos
do $$
declare
  alvo record;
  campos_por_tabela constant jsonb := jsonb_build_object(
    'contratos',    jsonb_build_array('quantidade', 'preco_unitario', 'valor_informado'),
    'medicoes',     jsonb_build_array('valor_medido', 'desconto', 'valor_pago'),
    'recebimentos', jsonb_build_array('valor_previsto', 'valor_aprovado', 'descontos', 'valor_recebido'),
    'lancamentos',  jsonb_build_array('quantidade', 'preco_unitario', 'desconto', 'frete')
  );
begin
  for alvo in select key as tabela, value as campos from jsonb_each(campos_por_tabela)
  loop
    execute format('drop trigger if exists trg_auditoria on public.%I', alvo.tabela);
    execute format(
      'create trigger trg_auditoria after insert or update or delete on public.%I
       for each row execute function public.registrar_auditoria(%s)',
      alvo.tabela,
      (select string_agg(quote_literal(v), ', ') from jsonb_array_elements_text(alvo.campos) v)
    );
  end loop;
end $$;

-- ===================================================== SEGURANÇA (RLS)
-- Leitura: o dono da obra vê a trilha inteira dela. Escrita direta: ninguém —
-- só o gatilho (security definer) grava.
--
-- Quando a tabela de membros entrar (migração 0004), a condição de leitura
-- passa a apontar para ela em vez de comparar só o usuario_id da obra.
alter table public.auditoria enable row level security;

drop policy if exists auditoria_leitura on public.auditoria;
create policy auditoria_leitura on public.auditoria for select
  using (
    usuario_id = auth.uid()
    or exists (
      select 1 from public.obras o
      where o.id = auditoria.obra_id and o.usuario_id = auth.uid()
    )
  );
-- Sem política de INSERT/UPDATE/DELETE: com RLS ligado, o cliente não escreve.
-- O gatilho registrar_auditoria() é security definer e grava por fora da RLS.
