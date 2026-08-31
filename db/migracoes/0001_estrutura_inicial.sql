-- =====================================================================
--  SOUZ CONTROLE DE OBRA — estrutura do banco (PostgreSQL / Supabase)
--  Cole este arquivo inteiro no SQL Editor do Supabase e clique em Run.
--  Pode ser executado mais de uma vez sem quebrar nada.
-- =====================================================================

create extension if not exists pgcrypto;

-- --------------------------------------------------------------- perfil
create table if not exists public.perfis (
  id            uuid primary key references auth.users on delete cascade,
  empresa_nome  text default 'Souz Engenharia',
  responsavel   text,
  crea_cau      text,
  telefone      text,
  email         text,
  listas        jsonb default '{}'::jsonb,
  criado_em     timestamptz default now(),
  atualizado_em timestamptz default now()
);

-- ------------------------------------------------------------ clientes
create table if not exists public.clientes (
  id            text primary key default gen_random_uuid()::text,
  usuario_id    uuid not null default auth.uid() references auth.users on delete cascade,
  nome          text not null,
  contato       text,
  telefone      text,
  email         text,
  documento     text,
  origem        text,
  situacao      text default 'Cliente',
  observacoes   text,
  criado_em     timestamptz default now(),
  atualizado_em timestamptz default now()
);

-- --------------------------------------------------------- prestadores
create table if not exists public.prestadores (
  id            text primary key default gen_random_uuid()::text,
  usuario_id    uuid not null default auth.uid() references auth.users on delete cascade,
  nome          text not null,
  especialidade text,
  telefone      text,
  documento     text,
  avaliacao     numeric default 0,
  observacoes   text,
  criado_em     timestamptz default now(),
  atualizado_em timestamptz default now()
);

-- ---------------------------------------------------------------- obras
create table if not exists public.obras (
  id                  text primary key default gen_random_uuid()::text,
  usuario_id          uuid not null default auth.uid() references auth.users on delete cascade,
  nome                text not null,
  cliente_id          text references public.clientes on delete set null,
  cidade              text,
  endereco            text,
  area_construida     numeric default 0,
  area_muro           numeric default 0,
  sistema             text,
  padrao              text default 'MCMV',
  data_inicio         date,
  previsao_conclusao  date,
  responsavel         text,
  status              text default 'Planejada',
  observacoes         text,
  -- financeiro e contrato
  saldo_inicial       numeric default 0,
  valor_terreno       numeric default 0,
  valor_financiado    numeric default 0,
  recursos_proprios   numeric default 0,
  preco_empreitada_m2 numeric default 0,
  custo_fisico_max_m2 numeric default 0,
  valor_venda         numeric default 0,
  margem_desejada     numeric default 0.15,
  contrato_caixa      text,
  data_assinatura     date,
  criado_em           timestamptz default now(),
  atualizado_em       timestamptz default now()
);

-- ----------------------------------------------------------- contratos
create table if not exists public.contratos (
  id              text primary key default gen_random_uuid()::text,
  usuario_id      uuid not null default auth.uid() references auth.users on delete cascade,
  obra_id         text not null references public.obras on delete cascade,
  ordem           integer default 0,
  codigo          text,
  codigo_base     text,
  registro        text default 'Contrato',
  prestador       text,
  escopo          text,
  regime          text,
  quantidade      numeric default 0,
  unidade         text,
  preco_unitario  numeric default 0,
  valor_informado numeric default 0,
  inclui_material text default 'Não',
  inicio_previsto date,
  fim_previsto    date,
  status          text default 'Planejado',
  observacoes     text,
  criado_em       timestamptz default now(),
  atualizado_em   timestamptz default now()
);

-- ------------------------------------------------------------ medições
create table if not exists public.medicoes (
  id             text primary key default gen_random_uuid()::text,
  usuario_id     uuid not null default auth.uid() references auth.users on delete cascade,
  obra_id        text not null references public.obras on delete cascade,
  ordem           integer default 0,
  contrato_base  text,
  numero         text,
  data           date,
  descricao      text,
  progresso      numeric default 0,
  valor_medido   numeric default 0,
  desconto       numeric default 0,
  data_pagamento date,
  valor_pago     numeric default 0,
  status         text default 'Em aberto',
  documento      text,
  criado_em      timestamptz default now(),
  atualizado_em  timestamptz default now()
);

-- ------------------------------------------------------- recebimentos
create table if not exists public.recebimentos (
  id               text primary key default gen_random_uuid()::text,
  usuario_id       uuid not null default auth.uid() references auth.users on delete cascade,
  obra_id          text not null references public.obras on delete cascade,
  ordem           integer default 0,
  origem           text default 'CAIXA',
  numero_medicao   text,
  etapa_pci        text,
  data_prevista    date,
  valor_previsto   numeric default 0,
  data_solicitacao date,
  percent_obra     numeric default 0,
  valor_aprovado   numeric default 0,
  descontos        numeric default 0,
  data_recebimento date,
  valor_recebido   numeric default 0,
  status           text default 'Previsto',
  observacoes      text,
  criado_em        timestamptz default now(),
  atualizado_em    timestamptz default now()
);

-- ---------------------------------------------------- plano de materiais
create table if not exists public.materiais (
  id                    text primary key default gen_random_uuid()::text,
  usuario_id            uuid not null default auth.uid() references auth.users on delete cascade,
  obra_id               text not null references public.obras on delete cascade,
  ordem           integer default 0,
  etapa                 text,
  material              text,
  quantidade_necessaria numeric default 0,
  unidade               text,
  data_necessaria       date,
  prioridade            text default 'Média',
  preco_previsto        numeric default 0,
  status                text default 'Planejar',
  observacoes           text,
  criado_em             timestamptz default now(),
  atualizado_em         timestamptz default now()
);

-- ---------------------------------------------------------- lançamentos
create table if not exists public.lancamentos (
  id              text primary key default gen_random_uuid()::text,
  usuario_id      uuid not null default auth.uid() references auth.users on delete cascade,
  obra_id         text not null references public.obras on delete cascade,
  ordem           integer default 0,
  material_id     text references public.materiais on delete set null,
  data            date,
  tipo            text default 'Material',
  etapa           text,
  categoria       text,
  descricao       text,
  fornecedor      text,
  documento       text,
  quantidade      numeric default 0,
  unidade         text,
  preco_unitario  numeric default 0,
  desconto        numeric default 0,
  frete           numeric default 0,
  forma_pagamento text,
  observacoes     text,
  criado_em       timestamptz default now(),
  atualizado_em   timestamptz default now()
);

-- ----------------------------------------------------------- cronograma
create table if not exists public.cronograma (
  id                   text primary key default gen_random_uuid()::text,
  usuario_id           uuid not null default auth.uid() references auth.users on delete cascade,
  obra_id              text not null references public.obras on delete cascade,
  ordem                integer default 0,
  etapa                text,
  inicio_previsto      date,
  fim_previsto         date,
  inicio_real          date,
  fim_real             date,
  progresso            numeric default 0,
  quantidade_executada numeric default 0,
  unidade_producao     text,
  responsavel          text,
  peso                 numeric default 0,
  criado_em            timestamptz default now(),
  atualizado_em        timestamptz default now()
);

-- --------------------------------------------------------------- diário
create table if not exists public.diario (
  id            text primary key default gen_random_uuid()::text,
  usuario_id    uuid not null default auth.uid() references auth.users on delete cascade,
  obra_id       text not null references public.obras on delete cascade,
  ordem           integer default 0,
  data          date,
  clima         text,
  efetivo       numeric default 0,
  etapa         text,
  atividades    text,
  ocorrencias   text,
  autor         text,
  fotos         jsonb default '[]'::jsonb,
  criado_em     timestamptz default now(),
  atualizado_em timestamptz default now()
);

-- ------------------- coluna de ordem (bancos criados antes desta versão)
do $$
declare t text;
begin
  foreach t in array array['contratos','medicoes','recebimentos','materiais','lancamentos','diario']
  loop
    execute format('alter table public.%I add column if not exists ordem integer default 0', t);
  end loop;
end $$;

-- ------------------------------------------------------------- índices
create index if not exists idx_obras_usuario        on public.obras(usuario_id);
create index if not exists idx_contratos_obra       on public.contratos(obra_id);
create index if not exists idx_medicoes_obra        on public.medicoes(obra_id);
create index if not exists idx_medicoes_base        on public.medicoes(obra_id, contrato_base);
create index if not exists idx_recebimentos_obra    on public.recebimentos(obra_id);
create index if not exists idx_lancamentos_obra     on public.lancamentos(obra_id);
create index if not exists idx_lancamentos_data     on public.lancamentos(obra_id, data);
create index if not exists idx_materiais_obra       on public.materiais(obra_id);
create index if not exists idx_cronograma_obra      on public.cronograma(obra_id, ordem);
create index if not exists idx_diario_obra          on public.diario(obra_id, data);

-- ------------------------------------------ atualização de carimbo de hora
create or replace function public.marcar_atualizacao()
returns trigger language plpgsql as $$
begin
  new.atualizado_em = now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['perfis','clientes','prestadores','obras','contratos','medicoes',
                           'recebimentos','materiais','lancamentos','cronograma','diario']
  loop
    execute format('drop trigger if exists trg_%1$s_atualizacao on public.%1$s', t);
    execute format('create trigger trg_%1$s_atualizacao before update on public.%1$s
                    for each row execute function public.marcar_atualizacao()', t);
  end loop;
end $$;

-- ------------------------------- cria o perfil assim que o usuário se cadastra
create or replace function public.criar_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfis (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists trg_novo_usuario on auth.users;
create trigger trg_novo_usuario after insert on auth.users
  for each row execute function public.criar_perfil();

-- ====================================================================
--  SEGURANÇA: cada usuário enxerga e altera apenas os próprios dados
-- ====================================================================
do $$
declare t text;
begin
  foreach t in array array['clientes','prestadores','obras','contratos','medicoes',
                           'recebimentos','materiais','lancamentos','cronograma','diario']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists dono_total on public.%I', t);
    execute format('create policy dono_total on public.%I for all
                    using (usuario_id = auth.uid())
                    with check (usuario_id = auth.uid())', t);
  end loop;
end $$;

alter table public.perfis enable row level security;
drop policy if exists perfil_proprio on public.perfis;
create policy perfil_proprio on public.perfis for all
  using (id = auth.uid()) with check (id = auth.uid());

-- ====================================================================
--  VISÕES DE ANÁLISE (úteis para Power BI e para conferência em SQL)
-- ====================================================================

-- recria as visões do zero (permite acrescentar colunas nas tabelas)
drop view if exists public.vw_fluxo_mensal cascade;
drop view if exists public.vw_resumo_obra cascade;
drop view if exists public.vw_posicao_contratual cascade;
drop view if exists public.vw_lancamentos cascade;
drop view if exists public.vw_contratos cascade;

-- valor de cada registro contratual (contrato ou aditivo)
create or replace view public.vw_contratos as
select c.*,
       case when coalesce(c.valor_informado,0) > 0
            then c.valor_informado
            else coalesce(c.quantidade,0) * coalesce(c.preco_unitario,0)
       end as valor_registro
from public.contratos c;

-- posição por contrato-base: autorizado, medido, pago e saldo
create or replace view public.vw_posicao_contratual as
select v.usuario_id,
       v.obra_id,
       v.codigo_base,
       max(v.prestador)                          as prestador,
       coalesce(sum(v.valor_registro) filter (where v.status <> 'Cancelado'), 0) as autorizado,
       coalesce((select sum(greatest(m.valor_medido - m.desconto, 0))
                 from public.medicoes m
                 where m.obra_id = v.obra_id and m.contrato_base = v.codigo_base
                   and m.status <> 'Cancelado'), 0)                 as medido,
       coalesce((select sum(m.valor_pago)
                 from public.medicoes m
                 where m.obra_id = v.obra_id and m.contrato_base = v.codigo_base
                   and m.status <> 'Cancelado'), 0)                 as pago
from public.vw_contratos v
group by v.usuario_id, v.obra_id, v.codigo_base;

-- total de cada lançamento
create or replace view public.vw_lancamentos as
select l.*,
       greatest(coalesce(l.quantidade,0) * coalesce(l.preco_unitario,0)
                - coalesce(l.desconto,0) + coalesce(l.frete,0), 0) as valor_total
from public.lancamentos l;

-- resumo financeiro por obra
create or replace view public.vw_resumo_obra as
select o.id as obra_id,
       o.usuario_id,
       o.nome,
       o.status,
       o.area_construida,
       o.saldo_inicial,
       o.valor_financiado,
       o.valor_venda,
       coalesce((select sum(r.valor_recebido) from public.recebimentos r
                 where r.obra_id = o.id and r.status <> 'Cancelado'), 0)  as recebido,
       coalesce((select sum(m.valor_pago) from public.medicoes m
                 where m.obra_id = o.id and m.status <> 'Cancelado'), 0)  as pago_medicoes,
       coalesce((select sum(vl.valor_total) from public.vw_lancamentos vl
                 where vl.obra_id = o.id), 0)                             as pago_lancamentos,
       coalesce((select sum(vc.valor_registro) from public.vw_contratos vc
                 where vc.obra_id = o.id and vc.status <> 'Cancelado'), 0) as contratado,
       coalesce((select avg(c.progresso) from public.cronograma c
                 where c.obra_id = o.id), 0)                              as progresso_medio
from public.obras o;

-- fluxo de caixa mensal por obra
create or replace view public.vw_fluxo_mensal as
with mov as (
  select r.obra_id, r.usuario_id, date_trunc('month', r.data_recebimento)::date as mes,
         r.valor_recebido as entrada, 0::numeric as medicao, 0::numeric as outra
  from public.recebimentos r
  where r.data_recebimento is not null and r.status <> 'Cancelado'
  union all
  select m.obra_id, m.usuario_id, date_trunc('month', m.data_pagamento)::date,
         0, m.valor_pago, 0
  from public.medicoes m
  where m.data_pagamento is not null and m.status <> 'Cancelado'
  union all
  select l.obra_id, l.usuario_id, date_trunc('month', l.data)::date,
         0, 0, l.valor_total
  from public.vw_lancamentos l
  where l.data is not null
)
select obra_id, usuario_id, mes,
       sum(entrada) as entradas,
       sum(medicao) as medicoes_pagas,
       sum(outra)   as outras_saidas,
       sum(medicao) + sum(outra) as total_saidas,
       sum(entrada) - sum(medicao) - sum(outra) as saldo_mes
from mov
group by obra_id, usuario_id, mes
order by obra_id, mes;

-- as visões herdam a segurança das tabelas de origem
alter view public.vw_contratos            set (security_invoker = on);
alter view public.vw_posicao_contratual   set (security_invoker = on);
alter view public.vw_lancamentos          set (security_invoker = on);
alter view public.vw_resumo_obra          set (security_invoker = on);
alter view public.vw_fluxo_mensal         set (security_invoker = on);
