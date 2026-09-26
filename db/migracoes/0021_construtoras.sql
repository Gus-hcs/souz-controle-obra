-- =====================================================================
--  0021 — Construtoras (set/2026): a conta de empresa, com limite de
--  acessos, que o administrador do sistema vende e controla.
--
--  POR QUÊ
--  Até aqui cada login era uma ilha: obras compartilhadas por convite,
--  uma a uma, e clientes, prestadores, listas e dados da empresa de cada
--  usuário. Para vender o sistema a uma construtora com N acessos, a
--  construtora vira o dono dos dados: todos os usuários da equipe dela
--  (gestor e engenheiros) veem e editam tudo o que é dela, e o plano, o
--  limite de acessos e o limite de obras são dela, não de cada conta.
--
--  O QUE MUDA
--  - tabela empresas (a construtora): nome, CNPJ, logo, responsável,
--    CREA/CAU, telefone, e-mail, listas; plano, limite_usuarios,
--    limite_obras e bloqueada — estes quatro só o admin muda (gatilho)
--  - perfis.empresa_id + perfis.papel_empresa: gestor | engenheiro |
--    cliente (o cliente final da construtora: não ocupa vaga e não vê a
--    construtora — acompanha só a obra para a qual foi convidado)
--  - obras, clientes e prestadores ganham empresa_id, preenchido pelo
--    banco com a construtora de quem cria (gatilho; ninguém escolhe)
--  - pode_ler_obra / pode_escrever_obra / eh_dono_obra: além do convite
--    (obra_membros), a equipe ativa da construtora dona da obra; o gestor
--    é dono de todas as obras da construtora
--  - clientes e prestadores: a equipe da construtora compartilha
--  - vaga: gestor + engenheiros ativos (não bloqueados) ≤ limite_usuarios,
--    conferido no banco a cada ligação/troca de papel/desbloqueio
--  - limite de obras por construtora; conta sem construtora não cria obra
--    (BLOCO D, depois de todas as contas terem construtora)
--  - convite para a obra de uma construtora: só como cliente — a equipe
--    entra pela construtora, com vaga
--  - usuario_id (quem criou a linha) deixa de apagar em cascata: excluir
--    a conta de um engenheiro NÃO apaga mais as medições e lançamentos que
--    ele fez nas obras da construtora — a coluna fica vazia e o registro fica
--  - quem sai de uma construtora perde os convites de equipe nas obras dela
--  - funções do admin: admin_empresas, admin_salvar_empresa,
--    admin_excluir_empresa, admin_definir_usuario_empresa; admin_consumo
--    passa a trazer a construtora e o papel de cada conta
--  - minha_construtora(): a construtora de quem está logado, com as vagas
--    e as obras em uso (o app carrega por ela)
--  - corrige: perfis.logo e perfis.cnpj sem permissão de gravação (a
--    gravação do perfil inteira falhava — ver 0020f no db/README.md)
--  - corrige: convidar_membro (0014) falhava sempre ("usuario_id is
--    ambiguous") — o convite por e-mail da Configuração nunca funcionou
--
--  COMO APLICAR (SQL Editor do Supabase), NESTA ORDEM:
--    BLOCO A — estrutura, funções e políticas. Seguro: enquanto nenhuma
--              conta tem construtora, tudo funciona como antes.
--    BLOCO B — diagnóstico (somente leitura): como as contas vão ficar.
--    BLOCO C — cria as construtoras e liga contas, obras e cadastros.
--    BLOCO D — regras que dependem de todas as contas terem construtora.
--    BLOCO E — valida a restrição do papel e confere o resultado.
--
--  Rode 0001–0020 antes. Pode ser rodado de novo sem quebrar.
-- =====================================================================


-- =====================================================================
--  BLOCO A — estrutura, funções e políticas
-- =====================================================================

-- a correção de 0020: a gravação do perfil manda logo e cnpj
grant update (logo, cnpj) on public.perfis to authenticated;

create table if not exists public.empresas (
  id               uuid primary key default gen_random_uuid(),
  nome             text not null,
  cnpj             text,
  logo             text,
  responsavel      text,
  crea_cau         text,
  telefone         text,
  email            text,
  listas           jsonb not null default '{}'::jsonb,
  plano            text not null default 'ativo',
  limite_usuarios  integer,
  limite_obras     integer,
  bloqueada        boolean not null default false,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  constraint chk_emp_nome            check (length(trim(nome)) between 1 and 120),
  constraint chk_emp_plano           check (plano in ('trial', 'ativo', 'suspenso', 'cancelado')),
  constraint chk_emp_limite_usuarios check (limite_usuarios is null or limite_usuarios >= 1),
  constraint chk_emp_limite_obras    check (limite_obras is null or limite_obras >= 0),
  constraint chk_emp_cnpj            check (cnpj is null or cnpj = ''
    or (cnpj ~ '^[0-9./-]{14,18}$' and length(regexp_replace(cnpj, '\D', '', 'g')) = 14)),
  constraint chk_emp_crea            check (crea_cau is null or length(crea_cau) <= 40),
  constraint chk_emp_listas          check (jsonb_typeof(listas) = 'object'),
  constraint chk_emp_logo            check (logo is null or logo = ''
    or (logo ~ '^data:image/' and length(logo) <= 500000))
);

drop trigger if exists trg_empresas_atualizacao on public.empresas;
create trigger trg_empresas_atualizacao before update on public.empresas
  for each row execute function public.marcar_atualizacao();

alter table public.perfis      add column if not exists empresa_id uuid references public.empresas on delete set null;
alter table public.perfis      add column if not exists papel_empresa text;
alter table public.obras       add column if not exists empresa_id uuid references public.empresas on delete restrict;
alter table public.clientes    add column if not exists empresa_id uuid references public.empresas on delete restrict;
alter table public.prestadores add column if not exists empresa_id uuid references public.empresas on delete restrict;

create index if not exists idx_perfis_empresa      on public.perfis(empresa_id);
create index if not exists idx_obras_empresa       on public.obras(empresa_id);
create index if not exists idx_clientes_empresa    on public.clientes(empresa_id);
create index if not exists idx_prestadores_empresa on public.prestadores(empresa_id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chk_perfis_papel_empresa') then
    alter table public.perfis add constraint chk_perfis_papel_empresa
      check (papel_empresa is null or papel_empresa in ('gestor', 'engenheiro', 'cliente')) not valid;
  end if;
end $$;

-- usuario_id é QUEM CRIOU a linha, não o dono: excluir a conta não apaga
-- mais o registro — a coluna fica vazia. (obra_membros continua em cascata:
-- é o acesso da pessoa, que sai com ela.)
do $$
declare t text;
begin
  foreach t in array array['clientes', 'prestadores', 'obras', 'contratos', 'medicoes',
    'recebimentos', 'materiais', 'lancamentos', 'cronograma', 'diario',
    'alertas_tratamento', 'pendencias_cliente', 'relatorios_gerados']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I alter column usuario_id drop not null', t);
      execute format('alter table public.%I drop constraint if exists %I', t, t || '_usuario_id_fkey');
      execute format('alter table public.%I add constraint %I foreign key (usuario_id)
                        references auth.users(id) on delete set null', t, t || '_usuario_id_fkey');
    end if;
  end loop;
end $$;

-- ------------------------------------------------ quem é da construtora
-- A construtora de quem está logado — só para a equipe ativa (gestor ou
-- engenheiro, conta e construtora sem bloqueio). Cliente final: null.
create or replace function public.minha_empresa()
returns uuid language sql stable security definer set search_path = '' as $$
  select p.empresa_id
    from public.perfis p
    join public.empresas e on e.id = p.empresa_id
   where p.id = auth.uid()
     and p.papel_empresa in ('gestor', 'engenheiro')
     and not p.bloqueado
     and not e.bloqueada;
$$;

create or replace function public.eh_gestor_da_empresa(p_empresa uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_empresa is not null and exists (
    select 1
      from public.perfis p
      join public.empresas e on e.id = p.empresa_id
     where p.id = auth.uid()
       and p.empresa_id = p_empresa
       and p.papel_empresa = 'gestor'
       and not p.bloqueado
       and not e.bloqueada
  );
$$;

create or replace function public.obra_da_minha_empresa(p_obra text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.obras o
     where o.id = p_obra
       and o.empresa_id is not null
       and o.empresa_id = public.minha_empresa()
  );
$$;

-- As três de 0004/0006, agora também pela construtora.
create or replace function public.pode_ler_obra(p_obra text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
           select 1 from public.obra_membros m
            where m.obra_id = p_obra and m.usuario_id = auth.uid()
         )
      or public.obra_da_minha_empresa(p_obra);
$$;

create or replace function public.pode_escrever_obra(p_obra text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
           select 1 from public.obra_membros m
            where m.obra_id = p_obra and m.usuario_id = auth.uid()
              and m.papel in ('dono', 'engenheiro')
         )
      or public.obra_da_minha_empresa(p_obra);
$$;

create or replace function public.eh_dono_obra(p_obra text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
           select 1 from public.obra_membros m
            where m.obra_id = p_obra and m.usuario_id = auth.uid() and m.papel = 'dono'
         )
      or exists (
           select 1 from public.obras o
            where o.id = p_obra and public.eh_gestor_da_empresa(o.empresa_id)
         );
$$;

-- ------------------------------------------------------------ gatilhos
-- A construtora do registro é a de quem cria — o app não escolhe. Mudar
-- de construtora depois, só o admin (ou o próprio banco, sem sessão).
create or replace function public.registro_define_empresa()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.empresa_id := (
      select p.empresa_id from public.perfis p
       where p.id = coalesce(new.usuario_id, auth.uid())
         and p.papel_empresa in ('gestor', 'engenheiro')
    );
  elsif auth.uid() is not null and not public.pode_admin() then
    new.empresa_id := old.empresa_id;
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['obras', 'clientes', 'prestadores']
  loop
    execute format('drop trigger if exists trg_%s_empresa on public.%I', t, t);
    execute format('create trigger trg_%s_empresa before insert or update on public.%I
                      for each row execute function public.registro_define_empresa()', t, t);
  end loop;
end $$;

-- Colunas de controle de perfis e de empresas: só o admin muda. Sem
-- sessão (SQL Editor, service_role) o banco pode — é assim que o BLOCO C
-- e a função admin-usuario gravam. (anon não tem UPDATE nas tabelas.)
create or replace function public.perfil_trava_controle()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not public.pode_admin() then
    if tg_op = 'INSERT' then
      new.admin         := false;
      new.plano         := 'ativo';
      new.bloqueado     := false;
      new.abas          := '{}'::jsonb;
      new.limite_obras  := null;
      new.empresa_id    := null;
      new.papel_empresa := null;
    else
      new.admin         := old.admin;
      new.plano         := old.plano;
      new.bloqueado     := old.bloqueado;
      new.abas          := old.abas;
      new.limite_obras  := old.limite_obras;
      new.empresa_id    := old.empresa_id;
      new.papel_empresa := old.papel_empresa;
    end if;
  end if;
  return new;
end $$;

create or replace function public.empresa_trava_controle()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not public.pode_admin() then
    new.plano           := old.plano;
    new.limite_usuarios := old.limite_usuarios;
    new.limite_obras    := old.limite_obras;
    new.bloqueada       := old.bloqueada;
  end if;
  return new;
end $$;

drop trigger if exists trg_empresa_trava on public.empresas;
create trigger trg_empresa_trava before update on public.empresas
  for each row execute function public.empresa_trava_controle();

-- A vaga: gestor + engenheiros ativos ≤ limite_usuarios. Confere quando a
-- conta entra na equipe, muda de papel para a equipe ou é desbloqueada.
create or replace function public.perfil_checa_vaga()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_lim int;
  v_qtd int;
begin
  if new.empresa_id is null or new.papel_empresa is null
     or new.papel_empresa not in ('gestor', 'engenheiro') or new.bloqueado then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and old.empresa_id is not distinct from new.empresa_id
     and old.papel_empresa in ('gestor', 'engenheiro')
     and not old.bloqueado then
    return new;                          -- já ocupava a vaga
  end if;
  select e.limite_usuarios into v_lim from public.empresas e where e.id = new.empresa_id;
  if v_lim is null then
    return new;
  end if;
  select count(*) into v_qtd
    from public.perfis p
   where p.empresa_id = new.empresa_id
     and p.papel_empresa in ('gestor', 'engenheiro')
     and not p.bloqueado
     and p.id <> new.id;
  if v_qtd >= v_lim then
    raise exception 'A construtora já usa os % acesso(s) contratados. Aumente o limite ou libere uma vaga.', v_lim
      using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists trg_perfil_checa_vaga on public.perfis;
create trigger trg_perfil_checa_vaga before insert or update of empresa_id, papel_empresa, bloqueado on public.perfis
  for each row execute function public.perfil_checa_vaga();

-- ------------------------------------------------------------ políticas
alter table public.empresas enable row level security;
drop policy if exists empresa_ler           on public.empresas;
drop policy if exists empresa_alterar       on public.empresas;
drop policy if exists empresa_admin_criar   on public.empresas;
drop policy if exists empresa_admin_remover on public.empresas;
create policy empresa_ler on public.empresas for select
  using (id = public.minha_empresa() or public.pode_admin());
create policy empresa_alterar on public.empresas for update
  using (id = public.minha_empresa() or public.pode_admin())
  with check (id = public.minha_empresa() or public.pode_admin());
create policy empresa_admin_criar on public.empresas for insert
  with check (public.pode_admin());
create policy empresa_admin_remover on public.empresas for delete
  using (public.pode_admin());
revoke truncate on public.empresas from anon, authenticated;

-- clientes e prestadores: de quem criou OU da equipe da mesma construtora
drop policy if exists clientes_proprio on public.clientes;
create policy clientes_proprio on public.clientes for all
  using (usuario_id = auth.uid() or (empresa_id is not null and empresa_id = public.minha_empresa()))
  with check (usuario_id = auth.uid() or (empresa_id is not null and empresa_id = public.minha_empresa()));
drop policy if exists prestadores_proprio on public.prestadores;
create policy prestadores_proprio on public.prestadores for all
  using (usuario_id = auth.uid() or (empresa_id is not null and empresa_id = public.minha_empresa()))
  with check (usuario_id = auth.uid() or (empresa_id is not null and empresa_id = public.minha_empresa()));

-- --------------------------------------------- a construtora de quem entra
create or replace function public.minha_construtora()
returns table (
  id uuid, nome text, cnpj text, logo text, responsavel text, crea_cau text,
  telefone text, email text, listas jsonb, plano text, limite_usuarios integer,
  limite_obras integer, bloqueada boolean, papel text, usuarios bigint, obras bigint
)
language sql stable security definer set search_path = '' as $$
  select e.id, e.nome, e.cnpj, e.logo, e.responsavel, e.crea_cau, e.telefone, e.email,
         e.listas, e.plano, e.limite_usuarios, e.limite_obras, e.bloqueada, p.papel_empresa,
         (select count(*) from public.perfis x
           where x.empresa_id = e.id and x.papel_empresa in ('gestor', 'engenheiro') and not x.bloqueado),
         (select count(*) from public.obras o where o.empresa_id = e.id)
    from public.perfis p
    join public.empresas e on e.id = p.empresa_id
   where p.id = auth.uid()
     and p.papel_empresa in ('gestor', 'engenheiro');
$$;

-- ------------------------------------------------------ funções do admin
create or replace function public.admin_empresas()
returns table (
  id uuid, nome text, cnpj text, plano text, limite_usuarios integer, limite_obras integer,
  bloqueada boolean, criado_em timestamptz, usuarios bigint, usuarios_bloqueados bigint,
  clientes_finais bigint, obras bigint, ultima_atividade timestamptz
)
language sql stable security definer set search_path = '' as $$
  select e.id, e.nome, e.cnpj, e.plano, e.limite_usuarios, e.limite_obras, e.bloqueada, e.criado_em,
         (select count(*) from public.perfis p
           where p.empresa_id = e.id and p.papel_empresa in ('gestor', 'engenheiro') and not p.bloqueado),
         (select count(*) from public.perfis p
           where p.empresa_id = e.id and p.papel_empresa in ('gestor', 'engenheiro') and p.bloqueado),
         (select count(*) from public.perfis p where p.empresa_id = e.id and p.papel_empresa = 'cliente'),
         (select count(*) from public.obras o where o.empresa_id = e.id),
         greatest(e.atualizado_em, (select max(o.atualizado_em) from public.obras o where o.empresa_id = e.id))
    from public.empresas e
   where public.pode_admin()
   order by e.nome;
$$;

-- Cria (p_id nulo) ou altera a construtora. Não deixa o limite abaixo do
-- que já está em uso: o admin libera a vaga antes (bloqueia ou move).
create or replace function public.admin_salvar_empresa(
  p_id              uuid,
  p_nome            text,
  p_cnpj            text,
  p_plano           text,
  p_limite_usuarios integer,
  p_limite_obras    integer,
  p_bloqueada       boolean
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id    uuid := p_id;
  v_uso   int;
  v_obras int;
begin
  if not public.pode_admin() then
    raise exception 'Acesso restrito.' using errcode = '42501';
  end if;
  if coalesce(trim(p_nome), '') = '' then
    raise exception 'Informe o nome da construtora.';
  end if;
  if v_id is not null then
    select count(*) into v_uso from public.perfis p
     where p.empresa_id = v_id and p.papel_empresa in ('gestor', 'engenheiro') and not p.bloqueado;
    select count(*) into v_obras from public.obras o where o.empresa_id = v_id;
    if p_limite_usuarios is not null and p_limite_usuarios < v_uso then
      raise exception 'A construtora já tem % acesso(s) em uso. Bloqueie ou mova alguém antes de baixar o limite para %.', v_uso, p_limite_usuarios;
    end if;
    if p_limite_obras is not null and p_limite_obras < v_obras then
      raise exception 'A construtora já tem % obra(s). O limite não pode ficar abaixo disso.', v_obras;
    end if;
    update public.empresas set
      nome            = trim(p_nome),
      cnpj            = nullif(trim(coalesce(p_cnpj, '')), ''),
      plano           = coalesce(p_plano, plano),
      limite_usuarios = p_limite_usuarios,
      limite_obras    = p_limite_obras,
      bloqueada       = coalesce(p_bloqueada, bloqueada)
     where id = v_id;
    if not found then
      raise exception 'Construtora não encontrada.';
    end if;
  else
    insert into public.empresas (nome, cnpj, plano, limite_usuarios, limite_obras, bloqueada)
    values (trim(p_nome), nullif(trim(coalesce(p_cnpj, '')), ''), coalesce(p_plano, 'ativo'),
            p_limite_usuarios, p_limite_obras, coalesce(p_bloqueada, false))
    returning id into v_id;
  end if;
  return v_id;
end $$;

create or replace function public.admin_excluir_empresa(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.pode_admin() then
    raise exception 'Acesso restrito.' using errcode = '42501';
  end if;
  if exists (select 1 from public.perfis p where p.empresa_id = p_id)
     or exists (select 1 from public.obras o where o.empresa_id = p_id)
     or exists (select 1 from public.clientes c where c.empresa_id = p_id)
     or exists (select 1 from public.prestadores x where x.empresa_id = p_id) then
    raise exception 'A construtora ainda tem usuários, obras ou cadastros. Mova ou exclua antes.';
  end if;
  delete from public.empresas where id = p_id;
end $$;

-- Liga a conta a uma construtora com um papel (ou desliga: p_empresa nulo).
-- A vaga é conferida pelo gatilho. Quem sai da construtora perde os
-- convites de equipe (dono/engenheiro) nas obras dela — senão continuaria
-- entrando nas obras que criou.
create or replace function public.admin_definir_usuario_empresa(
  p_usuario uuid,
  p_empresa uuid,
  p_papel   text
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_antes uuid;
begin
  if not public.pode_admin() then
    raise exception 'Acesso restrito.' using errcode = '42501';
  end if;
  if p_empresa is not null and (p_papel is null or p_papel not in ('gestor', 'engenheiro', 'cliente')) then
    raise exception 'Papel inválido: use gestor, engenheiro ou cliente.';
  end if;
  select empresa_id into v_antes from public.perfis where id = p_usuario;
  if not found then
    raise exception 'Conta não encontrada.';
  end if;
  update public.perfis set
    empresa_id    = p_empresa,
    papel_empresa = case when p_empresa is null then null else p_papel end
   where id = p_usuario;
  if v_antes is not null and (v_antes is distinct from p_empresa or p_papel = 'cliente') then
    delete from public.obra_membros m
     using public.obras o
     where o.id = m.obra_id
       and o.empresa_id = v_antes
       and m.usuario_id = p_usuario
       and m.papel in ('dono', 'engenheiro');
  end if;
end $$;

-- admin_consumo: a mesma de 0007, mais a construtora e o papel da conta.
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
  fotos            bigint,
  empresa_id       uuid,
  papel_empresa    text
)
language sql stable security definer set search_path = '' as $$
  select
    p.id, p.email, coalesce(e.nome, p.empresa_nome), p.plano, p.admin, p.bloqueado, p.abas, p.limite_obras,
    p.criado_em,
    greatest(
      coalesce(p.atualizado_em, p.criado_em),
      coalesce((select max(o.atualizado_em) from public.obras o where o.usuario_id = p.id), p.criado_em)
    ) as ultima_atividade,
    (select count(*) from public.obras o where o.usuario_id = p.id),
    (select count(*) from public.contratos c    where c.usuario_id  = p.id),
    (select count(*) from public.medicoes m     where m.usuario_id  = p.id),
    (select count(*) from public.recebimentos r where r.usuario_id  = p.id),
    (select count(*) from public.lancamentos l  where l.usuario_id  = p.id),
    (select count(*) from public.materiais mt   where mt.usuario_id = p.id),
    (select count(*) from public.diario d       where d.usuario_id  = p.id),
    coalesce((
      select sum(case when jsonb_typeof(d.fotos) = 'array' then jsonb_array_length(d.fotos) else 0 end)
        from public.diario d where d.usuario_id = p.id
    ), 0),
    p.empresa_id,
    p.papel_empresa
  from public.perfis p
  left join public.empresas e on e.id = p.empresa_id
  where public.pode_admin()
  order by ultima_atividade desc;
$$;

-- funções chamadas pelo app: só quem está logado; as de gatilho, ninguém
revoke execute on function public.minha_empresa()                               from public, anon;
revoke execute on function public.eh_gestor_da_empresa(uuid)                    from public, anon;
revoke execute on function public.obra_da_minha_empresa(text)                   from public, anon;
revoke execute on function public.pode_ler_obra(text)                           from public, anon;
revoke execute on function public.pode_escrever_obra(text)                      from public, anon;
revoke execute on function public.eh_dono_obra(text)                            from public, anon;
revoke execute on function public.minha_construtora()                           from public, anon;
revoke execute on function public.admin_empresas()                              from public, anon;
revoke execute on function public.admin_salvar_empresa(uuid, text, text, text, integer, integer, boolean) from public, anon;
revoke execute on function public.admin_excluir_empresa(uuid)                   from public, anon;
revoke execute on function public.admin_definir_usuario_empresa(uuid, uuid, text) from public, anon;
revoke execute on function public.admin_consumo()                               from public, anon;
grant  execute on function public.minha_empresa()                               to authenticated;
grant  execute on function public.eh_gestor_da_empresa(uuid)                    to authenticated;
grant  execute on function public.obra_da_minha_empresa(text)                   to authenticated;
grant  execute on function public.pode_ler_obra(text)                           to authenticated;
grant  execute on function public.pode_escrever_obra(text)                      to authenticated;
grant  execute on function public.eh_dono_obra(text)                            to authenticated;
grant  execute on function public.minha_construtora()                           to authenticated;
grant  execute on function public.admin_empresas()                              to authenticated;
grant  execute on function public.admin_salvar_empresa(uuid, text, text, text, integer, integer, boolean) to authenticated;
grant  execute on function public.admin_excluir_empresa(uuid)                   to authenticated;
grant  execute on function public.admin_definir_usuario_empresa(uuid, uuid, text) to authenticated;
grant  execute on function public.admin_consumo()                               to authenticated;
revoke execute on function public.registro_define_empresa() from public, anon, authenticated;
revoke execute on function public.perfil_trava_controle()   from public, anon, authenticated;
revoke execute on function public.empresa_trava_controle()  from public, anon, authenticated;
revoke execute on function public.perfil_checa_vaga()       from public, anon, authenticated;


-- =====================================================================
--  BLOCO B — DIAGNÓSTICO (somente leitura): como cada conta vai ficar.
--  Uma construtora por nome de empresa (sem diferença de caixa e espaço);
--  conta sem nome de empresa vira construtora própria. Quem é dono de obra
--  ou não tem convite nenhum entra como gestor. Quem só tem convites entra
--  na construtora do dono da obra: como cliente, se todos os convites são
--  de cliente; senão, como engenheiro.
-- =====================================================================
select p.email,
       coalesce(nullif(trim(p.empresa_nome), ''), p.email) as construtora,
       case
         when exists (select 1 from public.obras o where o.usuario_id = p.id)
           or not exists (select 1 from public.obra_membros m where m.usuario_id = p.id) then 'gestor'
         when not exists (select 1 from public.obra_membros m
                           where m.usuario_id = p.id and m.papel <> 'cliente') then 'cliente (do dono da obra)'
         else 'engenheiro (do dono da obra)'
       end as papel,
       (select count(*) from public.obras o where o.usuario_id = p.id) as obras_proprias,
       p.plano, p.limite_obras,
       p.empresa_id is not null as ja_ligada
  from public.perfis p
 order by 2, 1;


-- =====================================================================
--  BLOCO C — cria as construtoras e liga contas, obras e cadastros
--  Os dados da construtora (nome, CNPJ, logo, responsável, listas…),
--  o plano e o limite de obras vêm da conta mais antiga do grupo.
--  Limite de acessos: nenhum (o admin define depois, na tela).
--  A conversão das contas só roda na PRIMEIRA vez (enquanto não existe
--  construtora nenhuma): rodada de novo, ela transformaria em gestor de
--  uma construtora nova a conta que o admin desligou de propósito.
-- =====================================================================
do $$
declare
  r     record;
  v_emp uuid;
begin
  if exists (select 1 from public.empresas) then
    raise notice '0021 bloco C: construtoras já existem — conversão das contas pulada.';
    return;
  end if;

  for r in
    select distinct on (g.chave) g.*
      from (
        select p.*, coalesce(nullif(lower(trim(p.empresa_nome)), ''), 'conta:' || p.id::text) as chave
          from public.perfis p
         where p.empresa_id is null
           and (exists (select 1 from public.obras o where o.usuario_id = p.id)
                or not exists (select 1 from public.obra_membros m where m.usuario_id = p.id))
      ) g
     order by g.chave, g.criado_em
  loop
    insert into public.empresas (nome, cnpj, logo, responsavel, crea_cau, telefone, email, listas, plano, limite_obras)
    values (
      left(coalesce(nullif(trim(r.empresa_nome), ''), r.email, 'Construtora'), 120),
      case when r.cnpj ~ '^[0-9./-]{14,18}$' and length(regexp_replace(r.cnpj, '\D', '', 'g')) = 14
           then r.cnpj end,
      case when r.logo ~ '^data:image/' and length(r.logo) <= 500000 then r.logo end,
      r.responsavel,
      left(r.crea_cau, 40),
      r.telefone,
      r.email,
      case when jsonb_typeof(r.listas) = 'object' then r.listas else '{}'::jsonb end,
      r.plano,
      r.limite_obras
    )
    returning id into v_emp;

    update public.perfis p
       set empresa_id = v_emp, papel_empresa = 'gestor'
     where p.empresa_id is null
       and coalesce(nullif(lower(trim(p.empresa_nome)), ''), 'conta:' || p.id::text) = r.chave
       and (exists (select 1 from public.obras o where o.usuario_id = p.id)
            or not exists (select 1 from public.obra_membros m where m.usuario_id = p.id));
  end loop;

  -- quem só tem convites: na construtora do dono da (primeira) obra
  update public.perfis p
     set empresa_id    = x.empresa_id,
         papel_empresa = case when x.so_cliente then 'cliente' else 'engenheiro' end
    from (
      select distinct on (m.usuario_id)
             m.usuario_id,
             d.empresa_id,
             not exists (select 1 from public.obra_membros m2
                          where m2.usuario_id = m.usuario_id and m2.papel <> 'cliente') as so_cliente
        from public.obra_membros m
        join public.obras o  on o.id = m.obra_id
        join public.perfis d on d.id = o.usuario_id
       where d.empresa_id is not null
       order by m.usuario_id, m.criado_em
    ) x
   where p.id = x.usuario_id
     and p.empresa_id is null;
end $$;

-- obras, clientes e prestadores ainda sem construtora: a de quem criou
-- (repetir não muda nada — só preenche o que está vazio)

update public.obras o set empresa_id = p.empresa_id
  from public.perfis p
 where p.id = o.usuario_id and o.empresa_id is null
   and p.empresa_id is not null and p.papel_empresa in ('gestor', 'engenheiro');
update public.clientes c set empresa_id = p.empresa_id
  from public.perfis p
 where p.id = c.usuario_id and c.empresa_id is null
   and p.empresa_id is not null and p.papel_empresa in ('gestor', 'engenheiro');
update public.prestadores x set empresa_id = p.empresa_id
  from public.perfis p
 where p.id = x.usuario_id and x.empresa_id is null
   and p.empresa_id is not null and p.papel_empresa in ('gestor', 'engenheiro');


-- =====================================================================
--  BLOCO D — regras que dependem de todas as contas terem construtora
-- =====================================================================

-- Limite de obras: da construtora (soma da equipe). Conta sem construtora
-- (ou cliente final) não cria obra — só o admin, pelo limite da conta.
create or replace function public.obra_checa_limite()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_emp uuid;
  v_lim int;
  v_qtd int;
begin
  select p.empresa_id into v_emp
    from public.perfis p
   where p.id = new.usuario_id and p.papel_empresa in ('gestor', 'engenheiro');
  if v_emp is null then
    if exists (select 1 from public.perfis p where p.id = new.usuario_id and p.admin) then
      return new;
    end if;
    raise exception 'Conta sem construtora: peça ao administrador para liberar o acesso.'
      using errcode = '42501';
  end if;
  select e.limite_obras into v_lim from public.empresas e where e.id = v_emp;
  if v_lim is null then
    return new;
  end if;
  select count(*) into v_qtd from public.obras o where o.empresa_id = v_emp;
  if v_qtd >= v_lim then
    raise exception 'Limite de % obra(s) da construtora atingido.', v_lim using errcode = '23514';
  end if;
  return new;
end $$;
revoke execute on function public.obra_checa_limite() from public, anon, authenticated;

-- Convite para a obra de uma construtora: só como cliente. A equipe entra
-- pela construtora, ocupando vaga; obra sem construtora segue como antes.
-- Corrige também a de 0014, que falhava SEMPRE: a coluna de retorno
-- "usuario_id" tem o mesmo nome da coluna do "on conflict" — "column
-- reference usuario_id is ambiguous". #variable_conflict use_column manda
-- o nome valer como coluna.
create or replace function public.convidar_membro(p_obra text, p_email text, p_papel text)
returns table (usuario_id uuid, email text, papel text)
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
    raise exception 'Não existe conta com o e-mail %. A pessoa precisa de uma conta no sistema antes de ser convidada.', p_email;
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
revoke execute on function public.convidar_membro(text, text, text) from public, anon;
grant  execute on function public.convidar_membro(text, text, text) to authenticated;


-- =====================================================================
--  BLOCO E — valida a restrição do papel e confere o resultado
-- =====================================================================
alter table public.perfis validate constraint chk_perfis_papel_empresa;

select e.nome as construtora, p.email, p.papel_empresa,
       (select count(*) from public.obras o where o.empresa_id = e.id) as obras_da_construtora
  from public.empresas e
  join public.perfis p on p.empresa_id = e.id
 order by e.nome, p.papel_empresa, p.email;

-- deve voltar vazio: conta sem construtora, obra/cadastro de equipe sem construtora
select 'conta sem construtora' as problema, p.email as registro
  from public.perfis p where p.empresa_id is null
union all
select 'obra sem construtora', o.nome
  from public.obras o
  join public.perfis p on p.id = o.usuario_id
 where o.empresa_id is null and p.papel_empresa in ('gestor', 'engenheiro');
