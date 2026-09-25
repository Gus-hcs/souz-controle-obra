-- =====================================================================
--  0018 — Pendências do cliente, último status enviado e tipo de
--  prestador (serviço × fornecedor).
--
--  POR QUÊ
--  A auditoria da tela Clientes pediu o que a conversa com o cliente
--  precisa: o que ELE deve à obra (aprovação de projeto, escolha de
--  revestimento, documento para o financiador) e há quanto tempo ele não
--  recebe notícia. E a de Prestadores pediu separar quem vende material
--  de quem presta serviço — o fornecedor não tem contrato, medição nem
--  prazo de entrega de etapa.
--
--  O QUE MUDA
--  1. Tabela nova `pendencias_cliente` — uma linha por decisão/entrega
--     que o cliente deve: descrição, prazo, status (aberta | resolvida),
--     data de resolução. Vencida, vira pendência da obra no app.
--     RLS igual à das tabelas da obra (0004): membro lê; dono e
--     engenheiro escrevem.
--  2. obras.status_enviado_em (date) — o app carimba ao enviar o
--     relatório de status ao cliente (PDF ou WhatsApp).
--  3. prestadores.tipo (servico | fornecedor). Nulo = serviço.
--
--  COMO APLICAR (SQL Editor do Supabase), NESTA ORDEM:
--    BLOCO A — estrutura: tabela nova com RLS e colunas novas.
--    BLOCO B — diagnóstico (somente leitura). Deve voltar vazio.
--    BLOCO C — restrições das colunas novas como NOT VALID.
--    BLOCO D — valida o histórico. Só rode com o BLOCO B zerado.
--
--  O APP TOLERA A TABELA AINDA NÃO EXISTIR: sem `pendencias_cliente` no
--  banco, o sistema abre normal e só esconde o recurso. As colunas novas
--  de obras e prestadores, NÃO: o código que grava status_enviado_em e
--  tipo só pode ir ao ar depois do BLOCO A.
--
--  Rode 0001–0017 antes. Pode ser rodado de novo sem quebrar.
--
--  ESTA MIGRAÇÃO É UM RASCUNHO PARA REVISÃO — quem aplica no banco de
--  produção é o dono do projeto, não o agente (CLAUDE.md).
-- =====================================================================


-- =====================================================================
--  BLOCO A — estrutura
-- =====================================================================

-- ------------------------------------------- 1. pendencias_cliente
-- Tabela nova e vazia: as restrições entram já validadas, na criação.
create table if not exists public.pendencias_cliente (
  id             text primary key default gen_random_uuid()::text,
  usuario_id     uuid not null default auth.uid() references auth.users on delete cascade,
  obra_id        text not null references public.obras on delete cascade,
  ordem          integer,
  descricao      text not null,
  prazo          date,
  status         text not null default 'aberta',
  resolvida_em   date,
  data_criacao   date not null default current_date,
  criado_em      timestamptz default now(),
  atualizado_em  timestamptz default now(),
  constraint chk_pcli_descricao check (length(btrim(descricao)) > 0 and length(descricao) <= 200),
  constraint chk_pcli_status    check (status in ('aberta', 'resolvida')),
  constraint chk_pcli_resolvida check (status <> 'resolvida' or resolvida_em is not null)
);

create index if not exists idx_pendencias_cliente_obra on public.pendencias_cliente(obra_id);

drop trigger if exists trg_pendencias_cliente_atualizacao on public.pendencias_cliente;
create trigger trg_pendencias_cliente_atualizacao before update on public.pendencias_cliente
  for each row execute function public.marcar_atualizacao();

alter table public.pendencias_cliente enable row level security;
drop policy if exists ler     on public.pendencias_cliente;
drop policy if exists inserir on public.pendencias_cliente;
drop policy if exists alterar on public.pendencias_cliente;
drop policy if exists remover on public.pendencias_cliente;
create policy ler     on public.pendencias_cliente for select
  using (public.pode_ler_obra(obra_id));
create policy inserir on public.pendencias_cliente for insert
  with check (public.pode_escrever_obra(obra_id));
create policy alterar on public.pendencias_cliente for update
  using (public.pode_escrever_obra(obra_id)) with check (public.pode_escrever_obra(obra_id));
create policy remover on public.pendencias_cliente for delete
  using (public.pode_escrever_obra(obra_id));

revoke truncate on public.pendencias_cliente from anon, authenticated;

-- ------------------------------------------------ 2 e 3. colunas novas
alter table public.obras       add column if not exists status_enviado_em date;
alter table public.prestadores add column if not exists tipo              text;


-- =====================================================================
--  BLOCO B — DIAGNÓSTICO (somente leitura). Deve voltar vazio.
-- =====================================================================
select 'prestadores' as tabela, id::text, 'tipo fora de servico/fornecedor' as problema
  from public.prestadores
 where tipo is not null and tipo not in ('servico', 'fornecedor');


-- =====================================================================
--  BLOCO C — restrições NOT VALID
-- =====================================================================
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chk_prestador_tipo') then
    alter table public.prestadores add constraint chk_prestador_tipo
      check (tipo is null or tipo in ('servico', 'fornecedor')) not valid;
  end if;
end $$;


-- =====================================================================
--  BLOCO D — valida o histórico. Só com o BLOCO B vazio.
-- =====================================================================
alter table public.prestadores validate constraint chk_prestador_tipo;


-- =====================================================================
--  CONFERÊNCIA — a tabela nova tem RLS ligada e as quatro políticas
-- =====================================================================
select c.relname as tabela, c.relrowsecurity as rls_ligada,
       (select count(*) from pg_policies p
         where p.schemaname = 'public' and p.tablename = c.relname) as politicas
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname = 'pendencias_cliente';
