-- =====================================================================
--  0017 — Dependências do cronograma e diário de campo.
--
--  POR QUÊ
--  1. O término projetado dividia a duração pelo ritmo da obra como se
--     todas as etapas corressem soltas. Na obra, reboco espera alvenaria,
--     piso espera reboco: sem dependência fim→início não há caminho
--     crítico, e o "quando acaba" sai otimista.
--  2. O diário era um parágrafo com um efetivo total. O canteiro precisa
--     registrar clima de manhã e de tarde, efetivo por função,
--     equipamentos, o % da etapa ao fim do dia e se o dia empurra o
--     prazo — e é o diário que diz quando a etapa começou de verdade.
--
--  O QUE MUDA (só colunas novas, nascem nulas)
--  - cronograma.predecessoras  jsonb   (ids das etapas que precisam
--                                       terminar antes; fim→início)
--  - diario.clima_manha        text
--  - diario.clima_tarde        text
--  - diario.efetivo_funcoes    jsonb   ([{"funcao": "Pedreiro", "qtd": 3}, …])
--  - diario.equipamentos       text
--  - diario.progresso_etapa    numeric 0–1 (% da etapa ao fim do dia)
--  - diario.impacta_prazo      boolean
--  - diario.dias_impacto       integer 0–365
--  Nenhuma tabela nova: a RLS das tabelas da obra (0004) já cobre.
--
--  CHECKs espelhando src/dominio/validacao.js (validarDiarioCampo e
--  validarDependencias). Ciclo e predecessora inexistente dependem do
--  conjunto de etapas: são alerta no app, não CHECK. O clima é lista
--  personalizável: só o tamanho vira CHECK.
--
--  COMO APLICAR (SQL Editor do Supabase), NESTA ORDEM:
--    BLOCO A — colunas novas. Seguro: nascem nulas.
--    BLOCO B — diagnóstico (somente leitura). Deve voltar vazio.
--    BLOCO C — restrições como NOT VALID.
--    BLOCO D — valida o histórico. Só rode com o BLOCO B zerado.
--
--  O código que grava estas colunas só pode ir ao ar depois do BLOCO A —
--  antes disso a sincronização de cronograma e diário falharia.
--  Rode 0001–0016 antes. Pode ser rodado de novo sem quebrar.
--
--  ESTA MIGRAÇÃO É UM RASCUNHO PARA REVISÃO — quem aplica no banco de
--  produção é o dono do projeto, não o agente (CLAUDE.md).
-- =====================================================================


-- =====================================================================
--  BLOCO A — estrutura
-- =====================================================================
alter table public.cronograma add column if not exists predecessoras   jsonb;
alter table public.diario     add column if not exists clima_manha     text;
alter table public.diario     add column if not exists clima_tarde     text;
alter table public.diario     add column if not exists efetivo_funcoes jsonb;
alter table public.diario     add column if not exists equipamentos    text;
alter table public.diario     add column if not exists progresso_etapa numeric;
alter table public.diario     add column if not exists impacta_prazo   boolean;
alter table public.diario     add column if not exists dias_impacto    integer;


-- =====================================================================
--  BLOCO B — DIAGNÓSTICO (somente leitura). Colunas novas nascem nulas,
--  então deve voltar vazio. Se trouxer linhas, corrija antes do BLOCO D.
-- =====================================================================
with problemas as (
  select 'cronograma' as tabela, id, 'predecessoras não é uma lista' as problema
    from public.cronograma where predecessoras is not null and jsonb_typeof(predecessoras) <> 'array'
  union all
  select 'diario', id, 'efetivo por função não é uma lista'
    from public.diario where efetivo_funcoes is not null and jsonb_typeof(efetivo_funcoes) <> 'array'
  union all
  select 'diario', id, '% da etapa fora de 0–1'
    from public.diario where progresso_etapa < 0 or progresso_etapa > 1
  union all
  select 'diario', id, 'dias de impacto fora de 0–365'
    from public.diario where dias_impacto < 0 or dias_impacto > 365
  union all
  select 'diario', id, 'dias de impacto sem "impacta o prazo"'
    from public.diario where coalesce(dias_impacto, 0) > 0 and impacta_prazo is not true
  union all
  select 'diario', id, 'equipamentos com mais de 500 caracteres'
    from public.diario where length(coalesce(equipamentos, '')) > 500
  union all
  select 'diario', id, 'clima com mais de 40 caracteres'
    from public.diario where length(coalesce(clima_manha, '')) > 40 or length(coalesce(clima_tarde, '')) > 40
)
select * from problemas order by tabela, problema;


-- =====================================================================
--  BLOCO C — restrições NOT VALID (valem para o que entra daqui em diante)
-- =====================================================================
do $$
declare
  r record;
begin
  for r in select * from (values
    ('cronograma', 'chk_crono_predecessoras',       $q$predecessoras is null or jsonb_typeof(predecessoras) = 'array'$q$),
    ('diario',     'chk_diario_campo_funcoes',      $q$efetivo_funcoes is null or jsonb_typeof(efetivo_funcoes) = 'array'$q$),
    ('diario',     'chk_diario_campo_progresso',    $q$progresso_etapa is null or (progresso_etapa >= 0 and progresso_etapa <= 1)$q$),
    ('diario',     'chk_diario_campo_dias',         $q$dias_impacto is null or (dias_impacto >= 0 and dias_impacto <= 365)$q$),
    ('diario',     'chk_diario_campo_impacto',      $q$coalesce(dias_impacto, 0) = 0 or impacta_prazo is true$q$),
    ('diario',     'chk_diario_campo_equipamentos', $q$equipamentos is null or length(equipamentos) <= 500$q$),
    ('diario',     'chk_diario_campo_clima',        $q$(clima_manha is null or length(clima_manha) <= 40) and (clima_tarde is null or length(clima_tarde) <= 40)$q$)
  ) as t(tabela, nome, regra)
  loop
    if not exists (select 1 from pg_constraint where conname = r.nome) then
      execute format('alter table public.%I add constraint %I check (%s) not valid',
                     r.tabela, r.nome, r.regra);
    end if;
  end loop;
end $$;


-- =====================================================================
--  BLOCO D — valida o histórico. Só com o BLOCO B vazio.
-- =====================================================================
alter table public.cronograma validate constraint chk_crono_predecessoras;
alter table public.diario     validate constraint chk_diario_campo_funcoes;
alter table public.diario     validate constraint chk_diario_campo_progresso;
alter table public.diario     validate constraint chk_diario_campo_dias;
alter table public.diario     validate constraint chk_diario_campo_impacto;
alter table public.diario     validate constraint chk_diario_campo_equipamentos;
alter table public.diario     validate constraint chk_diario_campo_clima;
