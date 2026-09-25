-- =====================================================================
--  0015 — Tratamento de alerta e ocorrência do diário como pendência.
--
--  POR QUÊ
--  A auditoria tela a tela (25/09/2026) achou dois buracos:
--  1. Os alertas são recalculados a cada mudança e não guardam estado:
--     não há como dizer "já estou tratando", "adiei até dia 10" ou "isso
--     está resolvido". Um alerta de cimento de fevereiro ficava para
--     sempre numa fundação concluída, e 14 alertas soltos pareciam 14
--     problemas.
--  2. Ocorrência grave no diário ("Piso parou: falta rejunte") era só
--     texto: não tinha responsável, prazo, nem ligação com o material que
--     falta — não virava pendência de ninguém.
--
--  O QUE MUDA
--  1. Tabela nova `alertas_tratamento` — uma linha por alerta tratado.
--     O alerta continua calculado pelo app (src/dominio/calculos.js);
--     aqui fica só a decisão sobre ele: status (em_tratamento | adiado |
--     resolvido), responsável, "adiar até", nota e a gravidade e o valor
--     no momento da marcação — o app reabre o alerta sozinho se ele
--     piorar (gravidade subiu ou valor subiu mais de 10%) ou se o
--     adiamento vencer. "Novo" é a ausência de linha.
--     `chave` identifica o alerta (tipo + registro, ex.: 'etapa-atrasada:
--     cr_x1'); o id da linha é determinístico (trat:<obra>:<chave>), então
--     uma obra tem no máximo um tratamento por alerta.
--  2. Colunas novas em `diario`: ocorrencia_status (aberta | resolvida;
--     nulo = só registro, não é pendência), ocorrencia_responsavel,
--     ocorrencia_prazo, ocorrencia_material_id (FK para materiais, ON
--     DELETE SET NULL) e ocorrencia_resolvida_em. Registro antigo nasce
--     nulo — não vira pendência de repente.
--  3. RLS de `alertas_tratamento` igual à das tabelas da obra (0004):
--     qualquer membro lê; dono e engenheiro escrevem.
--  4. CHECKs espelhando src/dominio/validacao.js (validarTratamento e
--     validarDiario).
--
--  COMO APLICAR (SQL Editor do Supabase), NESTA ORDEM:
--    BLOCO A — estrutura: tabela nova com RLS e colunas novas no diário.
--              Seguro: tabela nasce vazia, colunas nascem nulas.
--    BLOCO B — diagnóstico (somente leitura). Deve voltar vazio.
--    BLOCO C — restrições do diário como NOT VALID.
--    BLOCO D — valida o histórico. Só rode com o BLOCO B zerado.
--
--  O APP TOLERA A TABELA AINDA NÃO EXISTIR: se `alertas_tratamento` não
--  estiver no banco, o sistema abre normal e só esconde o botão "Tratar".
--  As colunas novas do diário, NÃO: o código que grava ocorrencia_* só
--  pode ir ao ar depois do BLOCO A — antes disso a sincronização do
--  diário falharia.
--
--  Rode 0001–0014 antes. Pode ser rodado de novo sem quebrar.
--
--  ESTA MIGRAÇÃO É UM RASCUNHO PARA REVISÃO — quem aplica no banco de
--  produção é o dono do projeto, não o agente (CLAUDE.md).
-- =====================================================================


-- =====================================================================
--  BLOCO A — estrutura
-- =====================================================================

-- ---------------------------------------------- 1. alertas_tratamento
-- Tabela nova e vazia: as restrições entram já validadas, na criação.
create table if not exists public.alertas_tratamento (
  id             text primary key default gen_random_uuid()::text,
  usuario_id     uuid not null default auth.uid() references auth.users on delete cascade,
  obra_id        text not null references public.obras on delete cascade,
  chave          text not null,
  status         text not null default 'em_tratamento',
  responsavel    text,
  adiar_ate      date,
  nota           text,
  sev_marcada    integer not null default 2,
  valor_marcado  numeric not null default 0,
  data_marcacao  date not null default current_date,
  criado_em      timestamptz default now(),
  atualizado_em  timestamptz default now(),
  constraint chk_trat_status  check (status in ('em_tratamento', 'adiado', 'resolvido')),
  constraint chk_trat_adiado  check (status <> 'adiado' or adiar_ate is not null),
  constraint chk_trat_chave   check (length(btrim(chave)) > 0 and length(chave) <= 200),
  constraint chk_trat_sev     check (sev_marcada between 1 and 3),
  constraint chk_trat_valor   check (valor_marcado >= 0),
  constraint chk_trat_resp    check (responsavel is null or length(responsavel) <= 120),
  constraint chk_trat_nota    check (nota is null or length(nota) <= 500)
);

create index if not exists idx_alertas_tratamento_obra on public.alertas_tratamento(obra_id);
-- um tratamento por alerta por obra (o app já grava com id determinístico)
create unique index if not exists uq_alertas_tratamento_chave
  on public.alertas_tratamento(obra_id, chave);

drop trigger if exists trg_alertas_tratamento_atualizacao on public.alertas_tratamento;
create trigger trg_alertas_tratamento_atualizacao before update on public.alertas_tratamento
  for each row execute function public.marcar_atualizacao();

-- RLS por comando, como as tabelas da obra na 0004
alter table public.alertas_tratamento enable row level security;
drop policy if exists ler     on public.alertas_tratamento;
drop policy if exists inserir on public.alertas_tratamento;
drop policy if exists alterar on public.alertas_tratamento;
drop policy if exists remover on public.alertas_tratamento;
create policy ler     on public.alertas_tratamento for select
  using (public.pode_ler_obra(obra_id));
create policy inserir on public.alertas_tratamento for insert
  with check (public.pode_escrever_obra(obra_id));
create policy alterar on public.alertas_tratamento for update
  using (public.pode_escrever_obra(obra_id)) with check (public.pode_escrever_obra(obra_id));
create policy remover on public.alertas_tratamento for delete
  using (public.pode_escrever_obra(obra_id));

-- TRUNCATE ignora RLS: fora (a 0010 já cobre tabela nova pelo default
-- privilege; aqui fica explícito para quem rodar esta sem a 0010)
revoke truncate on public.alertas_tratamento from anon, authenticated;

-- ------------------------------------------ 2. ocorrência no diário
alter table public.diario add column if not exists ocorrencia_status       text;
alter table public.diario add column if not exists ocorrencia_responsavel  text;
alter table public.diario add column if not exists ocorrencia_prazo        date;
alter table public.diario add column if not exists ocorrencia_material_id  text
  references public.materiais on delete set null;
alter table public.diario add column if not exists ocorrencia_resolvida_em date;


-- =====================================================================
--  BLOCO B — DIAGNÓSTICO (somente leitura). Colunas novas nascem nulas,
--  então deve voltar vazio. Se trouxer linhas, corrija antes do BLOCO D.
-- =====================================================================
with problemas as (
  select 'ocorrencia_status fora de aberta/resolvida' as problema, id, data
    from public.diario
   where ocorrencia_status is not null and ocorrencia_status not in ('aberta', 'resolvida')
  union all
  select 'ocorrência marcada sem texto', id, data
    from public.diario
   where ocorrencia_status is not null and length(btrim(coalesce(ocorrencias, ''))) = 0
  union all
  select 'prazo da ocorrência antes do registro', id, data
    from public.diario
   where ocorrencia_prazo is not null and data is not null and ocorrencia_prazo < data
  union all
  select 'resolvida antes do registro', id, data
    from public.diario
   where ocorrencia_resolvida_em is not null and data is not null and ocorrencia_resolvida_em < data
  union all
  select 'responsável com mais de 120 caracteres', id, data
    from public.diario
   where length(coalesce(ocorrencia_responsavel, '')) > 120
)
select * from problemas order by problema, data;


-- =====================================================================
--  BLOCO C — restrições do diário como NOT VALID (valem para gravações
--  novas sem recusar o histórico)
-- =====================================================================
do $$
declare r record;
begin
  for r in select * from (values
    ('chk_diario_ocorr_status',
     $q$ocorrencia_status is null or ocorrencia_status in ('aberta', 'resolvida')$q$),
    ('chk_diario_ocorr_texto',
     $q$ocorrencia_status is null or length(btrim(coalesce(ocorrencias, ''))) > 0$q$),
    ('chk_diario_ocorr_prazo',
     $q$ocorrencia_prazo is null or data is null or ocorrencia_prazo >= data$q$),
    ('chk_diario_ocorr_resolvida',
     $q$ocorrencia_resolvida_em is null or data is null or ocorrencia_resolvida_em >= data$q$),
    ('chk_diario_ocorr_resp',
     $q$ocorrencia_responsavel is null or length(ocorrencia_responsavel) <= 120$q$)
  ) as t(nome, regra)
  loop
    if not exists (select 1 from pg_constraint where conname = r.nome) then
      execute format('alter table public.diario add constraint %I check (%s) not valid', r.nome, r.regra);
    end if;
  end loop;
end $$;


-- =====================================================================
--  BLOCO D — valida o histórico. Só com o BLOCO B zerado.
-- =====================================================================
alter table public.diario validate constraint chk_diario_ocorr_status;
alter table public.diario validate constraint chk_diario_ocorr_texto;
alter table public.diario validate constraint chk_diario_ocorr_prazo;
alter table public.diario validate constraint chk_diario_ocorr_resolvida;
alter table public.diario validate constraint chk_diario_ocorr_resp;


-- =====================================================================
--  CONFERÊNCIA — a tabela nova tem RLS ligada e as quatro políticas
-- =====================================================================
select c.relname as tabela, c.relrowsecurity as rls_ligada,
       (select count(*) from pg_policies p
         where p.schemaname = 'public' and p.tablename = c.relname) as politicas
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname = 'alertas_tratamento';
