-- =====================================================================
--  0023 — Obra de construtora é acessada pela construtora (set/2026).
--
--  POR QUÊ (auditoria de 27/09/2026, provado em bancada)
--  1. Bloquear não cortava o acesso. Quem cria uma obra vira 'dono' em
--     obra_membros, e pode_ler_obra / pode_escrever_obra / eh_dono_obra
--     aceitavam esse vínculo sem olhar perfis.bloqueado nem
--     empresas.bloqueada: o engenheiro bloqueado continuava lendo,
--     gravando e até apagando a obra; a construtora bloqueada (não
--     pagou) continuava usando. O mesmo valia para obras.usuario_id e
--     para clientes/prestadores criados pela pessoa.
--  2. Desligar da construtora ou excluir a conta de quem era o único
--     dono de uma obra falhava ("Uma obra precisa de pelo menos um
--     dono"), e todo criador é o único dono.
--  3. O cliente final lia pela API os custos da obra (lançamentos,
--     contratos, medições, materiais, auditoria, anexos), que a tela
--     esconde.
--  4. O dono da obra punha qualquer conta como 'engenheiro' ou 'dono'
--     direto em obra_membros — acesso de escrita sem ocupar vaga.
--  5. membros_da_obra entregava ao cliente o e-mail da equipe; o convite
--     dizia se um e-mail tinha conta no sistema.
--
--  O QUE MUDA
--  - eu_ativo(): a conta de quem chama não está bloqueada e a construtora
--    dela (se tiver) não está bloqueada.
--  - Obra de construtora (obras.empresa_id não nulo): a equipe entra por
--    obra_da_minha_empresa(), que já confere bloqueio de pessoa e de
--    construtora; obra_membros vale só para o papel 'cliente' (leitura),
--    e só enquanto a construtora não estiver bloqueada. Obra avulsa
--    (empresa_id nulo) continua como antes, agora com eu_ativo().
--  - pode_ler_obra_interna(): como pode_ler_obra, sem o cliente. Passa a
--    ser a leitura de lancamentos, contratos, medicoes, materiais,
--    auditoria, alertas_tratamento, relatorios_gerados, dos prestadores
--    da obra e dos anexos do Storage (menos a pasta <obra>/diario/, das
--    fotos do diário). O cliente continua lendo obras, cronograma,
--    diario, recebimentos (as parcelas do relatório de status),
--    pendencias_cliente, o próprio cadastro de cliente e os membros.
--  - eh_dono_obra: em obra de construtora, só o gestor dela.
--  - obra_dono_membro só cria o 'dono' em obra avulsa;
--    obra_protege_dono não se aplica a obra de construtora.
--  - obra_membros: em obra de construtora, só entra papel 'cliente'.
--  - obras_ler / obras_criar / clientes_proprio / prestadores_proprio:
--    o caminho por usuario_id vale só com a conta ativa e fora de
--    construtora; o de construtora, por minha_empresa().
--  - Dados: saem os vínculos 'dono' e 'engenheiro' das obras de
--    construtora (a equipe já vê tudo pela construtora).
--  - membros_da_obra: e-mail só para quem não é cliente;
--    search_path ''. convidar_membro: mensagem neutra.
--
--  COMPATÍVEL COM A VERSÃO NO AR: o app lê o papel por
--  SUPA.papelNaObra(), que sem vínculo cai no papel da construtora
--  (gestor → dono, engenheiro → engenheiro). Nenhuma tela lê o que o
--  cliente deixa de ler (VIEWS_CLIENTE: cronograma, diário, relatório
--  de status).
--
--  Pode rodar de novo: create or replace, drop policy if exists; o
--  passo de dados apaga só o que ainda existir.
-- =====================================================================

-- ---------------------------------------------------------------------
--  Diagnóstico — rode antes e guarde o resultado. Esperado hoje:
--  vinculos_a_remover = 10 (todos 'dono'), clientes_mantidos = 0.
-- ---------------------------------------------------------------------
select
  (select count(*) from public.obra_membros m join public.obras o on o.id = m.obra_id
    where o.empresa_id is not null and m.papel in ('dono', 'engenheiro')) as vinculos_a_remover,
  (select count(*) from public.obra_membros m join public.obras o on o.id = m.obra_id
    where o.empresa_id is not null and m.papel = 'cliente') as clientes_mantidos,
  (select count(*) from public.obra_membros m join public.obras o on o.id = m.obra_id
    where o.empresa_id is null) as vinculos_obra_avulsa;

-- ---------------------------------------------------------------------
--  1. Funções de acesso
-- ---------------------------------------------------------------------
create or replace function public.eu_ativo()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select not p.bloqueado
           and not exists (select 1 from public.empresas e
                            where e.id = p.empresa_id and e.bloqueada)
      from public.perfis p
     where p.id = auth.uid()
  ), false);
$$;

create or replace function public.pode_ler_obra(p_obra text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.eu_ativo() and (
    public.obra_da_minha_empresa(p_obra)
    or exists (
      select 1
        from public.obra_membros m
        join public.obras o on o.id = m.obra_id
       where m.obra_id = p_obra
         and m.usuario_id = auth.uid()
         and (o.empresa_id is null
              or (m.papel = 'cliente'
                  and not exists (select 1 from public.empresas e
                                   where e.id = o.empresa_id and e.bloqueada)))
    )
  );
$$;

create or replace function public.pode_ler_obra_interna(p_obra text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.eu_ativo() and (
    public.obra_da_minha_empresa(p_obra)
    or exists (
      select 1
        from public.obra_membros m
        join public.obras o on o.id = m.obra_id
       where m.obra_id = p_obra
         and m.usuario_id = auth.uid()
         and o.empresa_id is null
         and m.papel in ('dono', 'engenheiro')
    )
  );
$$;

create or replace function public.pode_escrever_obra(p_obra text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.eu_ativo() and (
    public.obra_da_minha_empresa(p_obra)
    or exists (
      select 1
        from public.obra_membros m
        join public.obras o on o.id = m.obra_id
       where m.obra_id = p_obra
         and m.usuario_id = auth.uid()
         and o.empresa_id is null
         and m.papel in ('dono', 'engenheiro')
    )
  );
$$;

create or replace function public.eh_dono_obra(p_obra text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.eu_ativo() and (
    exists (
      select 1
        from public.obra_membros m
        join public.obras o on o.id = m.obra_id
       where m.obra_id = p_obra
         and m.usuario_id = auth.uid()
         and m.papel = 'dono'
         and o.empresa_id is null
    )
    or exists (
      select 1 from public.obras o
       where o.id = p_obra and public.eh_gestor_da_empresa(o.empresa_id)
    )
  );
$$;

revoke execute on function public.eu_ativo()                   from public, anon;
revoke execute on function public.pode_ler_obra_interna(text)  from public, anon;
grant  execute on function public.eu_ativo()                   to authenticated;
grant  execute on function public.pode_ler_obra_interna(text)  to authenticated;
revoke execute on function public.pode_ler_obra(text)          from public, anon;
revoke execute on function public.pode_escrever_obra(text)     from public, anon;
revoke execute on function public.eh_dono_obra(text)           from public, anon;
grant  execute on function public.pode_ler_obra(text)          to authenticated;
grant  execute on function public.pode_escrever_obra(text)     to authenticated;
grant  execute on function public.eh_dono_obra(text)           to authenticated;

-- ---------------------------------------------------------------------
--  2. Gatilhos de dono: só em obra avulsa
-- ---------------------------------------------------------------------
create or replace function public.obra_dono_membro()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.empresa_id is null then
    insert into public.obra_membros (obra_id, usuario_id, papel)
    values (new.id, new.usuario_id, 'dono')
    on conflict (obra_id, usuario_id) do nothing;
  end if;
  return new;
end $$;

create or replace function public.obra_protege_dono()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.papel = 'dono'
     and (tg_op = 'DELETE' or new.papel <> 'dono')
     and exists (select 1 from public.obras where id = old.obra_id and empresa_id is null)
     and not exists (
       select 1 from public.obra_membros
       where obra_id = old.obra_id and papel = 'dono' and id <> old.id
     )
  then
    raise exception 'Uma obra precisa de pelo menos um dono.';
  end if;
  return case tg_op when 'DELETE' then old else new end;
end $$;

-- ---------------------------------------------------------------------
--  3. obra_membros: em obra de construtora, só o cliente
-- ---------------------------------------------------------------------
drop policy if exists membros_gestao_ins on public.obra_membros;
create policy membros_gestao_ins on public.obra_membros for insert
  with check (
    public.eh_dono_obra(obra_id)
    and (papel = 'cliente'
         or exists (select 1 from public.obras o where o.id = obra_id and o.empresa_id is null))
  );

drop policy if exists membros_gestao_upd on public.obra_membros;
create policy membros_gestao_upd on public.obra_membros for update
  using (public.eh_dono_obra(obra_id))
  with check (
    public.eh_dono_obra(obra_id)
    and (papel = 'cliente'
         or exists (select 1 from public.obras o where o.id = obra_id and o.empresa_id is null))
  );

-- ---------------------------------------------------------------------
--  4. Leitura interna (sem o cliente) nas tabelas de custo
-- ---------------------------------------------------------------------
drop policy if exists ler on public.lancamentos;
create policy ler on public.lancamentos for select using (public.pode_ler_obra_interna(obra_id));
drop policy if exists ler on public.contratos;
create policy ler on public.contratos for select using (public.pode_ler_obra_interna(obra_id));
drop policy if exists ler on public.medicoes;
create policy ler on public.medicoes for select using (public.pode_ler_obra_interna(obra_id));
drop policy if exists ler on public.materiais;
create policy ler on public.materiais for select using (public.pode_ler_obra_interna(obra_id));
drop policy if exists ler on public.alertas_tratamento;
create policy ler on public.alertas_tratamento for select using (public.pode_ler_obra_interna(obra_id));
drop policy if exists ler on public.relatorios_gerados;
create policy ler on public.relatorios_gerados for select using (public.pode_ler_obra_interna(obra_id));
drop policy if exists auditoria_leitura on public.auditoria;
create policy auditoria_leitura on public.auditoria for select using (public.pode_ler_obra_interna(obra_id));

drop policy if exists prestadores_da_obra on public.prestadores;
create policy prestadores_da_obra on public.prestadores for select using (
  exists (select 1 from public.contratos c
           where (c.prestador_id = prestadores.id
                  or (c.prestador_id is null and c.prestador = prestadores.nome))
             and public.pode_ler_obra_interna(c.obra_id))
  or exists (select 1 from public.lancamentos l
              where (l.prestador_id = prestadores.id
                     or (l.prestador_id is null and l.fornecedor = prestadores.nome))
                and public.pode_ler_obra_interna(l.obra_id))
);

-- anexos: NF, comprovante e PDFs guardados só para a equipe; a pasta
-- <obra>/diario/ (fotos do diário) também para o cliente da obra
drop policy if exists anexos_ler on storage.objects;
create policy anexos_ler on storage.objects for select to authenticated
  using (
    bucket_id = 'anexos'
    and (public.pode_ler_obra_interna((storage.foldername(name))[1])
         or ((storage.foldername(name))[2] = 'diario'
             and public.pode_ler_obra((storage.foldername(name))[1])))
  );

-- ---------------------------------------------------------------------
--  5. Caminho por usuario_id: só com a conta ativa e fora de construtora
-- ---------------------------------------------------------------------
drop policy if exists obras_ler on public.obras;
create policy obras_ler on public.obras for select using (
  (usuario_id = auth.uid() and public.eu_ativo()
   and (empresa_id is null or empresa_id = public.minha_empresa()))
  or public.pode_ler_obra(id)
);

drop policy if exists obras_criar on public.obras;
create policy obras_criar on public.obras for insert
  with check (usuario_id = auth.uid() and public.eu_ativo());

drop policy if exists clientes_proprio on public.clientes;
create policy clientes_proprio on public.clientes for all
  using ((empresa_id is null and usuario_id = auth.uid() and public.eu_ativo())
         or (empresa_id is not null and empresa_id = public.minha_empresa()))
  with check ((empresa_id is null and usuario_id = auth.uid() and public.eu_ativo())
              or (empresa_id is not null and empresa_id = public.minha_empresa()));

drop policy if exists prestadores_proprio on public.prestadores;
create policy prestadores_proprio on public.prestadores for all
  using ((empresa_id is null and usuario_id = auth.uid() and public.eu_ativo())
         or (empresa_id is not null and empresa_id = public.minha_empresa()))
  with check ((empresa_id is null and usuario_id = auth.uid() and public.eu_ativo())
              or (empresa_id is not null and empresa_id = public.minha_empresa()));

-- ---------------------------------------------------------------------
--  6. Membros: e-mail só para a equipe; convite com mensagem neutra
-- ---------------------------------------------------------------------
-- Em obra de construtora a equipe não está mais em obra_membros: a função
-- devolve também a equipe da construtora (origem 'construtora:gestor' ou
-- 'construtora:engenheiro'), para a trilha de auditoria continuar dizendo
-- quem mexeu. Nessas linhas papel = 'dono', o que a tela de equipe da
-- versão anterior mostra sem controle de trocar papel ou remover.
-- A coluna nova muda o tipo de retorno: por isso drop + create.
drop function if exists public.membros_da_obra(text);
create function public.membros_da_obra(p_obra text)
returns table(id uuid, usuario_id uuid, email text, papel text, criado_em timestamptz, origem text)
language sql stable security definer set search_path = '' as $$
  select x.id, x.usuario_id, x.email, x.papel, x.criado_em, x.origem
    from (
      select m.id, m.usuario_id,
             case when public.pode_ler_obra_interna(p_obra) then u.email::text end as email,
             m.papel, m.criado_em, 'obra'::text as origem
        from public.obra_membros m
        join auth.users u on u.id = m.usuario_id
       where public.pode_ler_obra(p_obra) and m.obra_id = p_obra
      union all
      select p.id, p.id, u.email::text, 'dono'::text, p.criado_em,
             'construtora:' || p.papel_empresa
        from public.obras o
        join public.perfis p on p.empresa_id = o.empresa_id
        join auth.users u on u.id = p.id
       where o.id = p_obra
         and p.papel_empresa in ('gestor', 'engenheiro')
         and public.pode_ler_obra_interna(p_obra)
    ) x
   order by (x.origem <> 'obra') desc, (x.papel = 'dono') desc, x.criado_em;
$$;
revoke execute on function public.membros_da_obra(text) from public, anon;
grant  execute on function public.membros_da_obra(text) to authenticated;

create or replace function public.convidar_membro(p_obra text, p_email text, p_papel text)
returns table(usuario_id uuid, email text, papel text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid;
  v_emp uuid;
begin
  if not public.eh_dono_obra(p_obra) then
    raise exception 'Só o dono da obra pode convidar.';
  end if;
  select o.empresa_id into v_emp from public.obras o where o.id = p_obra;
  if v_emp is not null and p_papel <> 'cliente' then
    raise exception 'A equipe da construtora já vê todas as obras. Convide aqui só o cliente; engenheiro novo é um acesso da construtora, liberado pelo administrador.';
  end if;
  if p_papel not in ('engenheiro', 'cliente') then
    raise exception 'Papel inválido: use engenheiro ou cliente.';
  end if;
  select u.id into v_uid from auth.users u where lower(u.email) = lower(trim(p_email)) limit 1;
  if v_uid is null then
    raise exception 'Não foi possível convidar. Confira o e-mail; se a pessoa ainda não tem acesso, peça ao administrador para criar a conta.';
  end if;
  if v_uid = auth.uid() then
    raise exception 'Você já participa desta obra.';
  end if;
  insert into public.obra_membros (obra_id, usuario_id, papel)
  values (p_obra, v_uid, p_papel)
  on conflict (obra_id, usuario_id) do update set papel = excluded.papel;
  return query select v_uid, p_email, p_papel;
end $$;
revoke execute on function public.convidar_membro(text, text, text) from public, anon;
grant  execute on function public.convidar_membro(text, text, text) to authenticated;

-- ---------------------------------------------------------------------
--  7. Dados: sai o dono/engenheiro individual das obras de construtora
--     (depois das funções: obra_protege_dono já não barra)
-- ---------------------------------------------------------------------
delete from public.obra_membros m
 using public.obras o
 where o.id = m.obra_id
   and o.empresa_id is not null
   and m.papel in ('dono', 'engenheiro');

-- ---------------------------------------------------------------------
--  Conferência — rode depois. Esperado: vinculos_a_remover = 0 e
--  clientes_mantidos igual ao diagnóstico do começo.
-- ---------------------------------------------------------------------
select
  (select count(*) from public.obra_membros m join public.obras o on o.id = m.obra_id
    where o.empresa_id is not null and m.papel in ('dono', 'engenheiro')) as vinculos_a_remover,
  (select count(*) from public.obra_membros m join public.obras o on o.id = m.obra_id
    where o.empresa_id is not null and m.papel = 'cliente') as clientes_mantidos;
