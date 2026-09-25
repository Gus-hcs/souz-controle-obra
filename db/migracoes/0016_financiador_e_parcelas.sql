-- =====================================================================
--  0016 — Financiador genérico: parcelas por marco físico, planilha do
--  financiador e etapas do contrato.
--
--  POR QUÊ
--  O sistema nasceu da planilha MCMV da CAIXA, mas atende qualquer
--  construtora e qualquer financiador — CAIXA, outro banco, consórcio ou
--  o próprio cliente pagando por marco. Em todos, o dinheiro sai em
--  parcelas que exigem um % de obra executada, conferido numa planilha do
--  financiador (PLS/PCI na CAIXA, cronograma físico-financeiro nos
--  outros). Faltava ligar a parcela ao avanço físico:
--  1. quanto a parcela exige e em que passo do processo ela está
--     (solicitada → vistoriada → aprovada → creditada);
--  2. o item e o peso de cada etapa na planilha do financiador;
--  3. quais etapas cada contrato executa — sem isso, "medido × físico"
--     do contrato não tinha com o que comparar.
--
--  O QUE MUDA (só colunas novas, todas nascem nulas)
--  - obras.financiador          text   (nome: "CAIXA", "Banco do Brasil"…)
--  - recebimentos.percent_exigido numeric 0–1 (% de obra para liberar)
--  - recebimentos.data_vistoria  date
--  - recebimentos.data_aprovacao date
--  - cronograma.item_financiador text   (ex.: "3.2" da PLS)
--  - cronograma.peso_financiador numeric 0–1 (peso do item na planilha)
--  - contratos.etapas           jsonb  (lista de nomes de etapa)
--  Nenhuma tabela nova: a RLS das tabelas existentes (0004) já cobre.
--
--  CHECKs espelhando src/dominio/validacao.js (validarObra,
--  validarRecebimento, validarEtapa, validarEtapasContrato). O que
--  depende do conjunto (pesos somando 100%, etapa fora do cronograma,
--  crédito antes da aprovação) é alerta no app, não CHECK.
--
--  COMO APLICAR (SQL Editor do Supabase), NESTA ORDEM:
--    BLOCO A — colunas novas. Seguro: nascem nulas.
--    BLOCO B — diagnóstico (somente leitura). Deve voltar vazio.
--    BLOCO C — restrições como NOT VALID.
--    BLOCO D — valida o histórico. Só rode com o BLOCO B zerado.
--
--  O código que grava estas colunas só pode ir ao ar depois do BLOCO A —
--  antes disso a sincronização de obras, recebimentos, cronograma e
--  contratos falharia. Rode 0001–0015 antes. Pode ser rodado de novo.
--
--  ESTA MIGRAÇÃO É UM RASCUNHO PARA REVISÃO — quem aplica no banco de
--  produção é o dono do projeto, não o agente (CLAUDE.md).
-- =====================================================================


-- =====================================================================
--  BLOCO A — estrutura
-- =====================================================================
alter table public.obras        add column if not exists financiador      text;
alter table public.recebimentos add column if not exists percent_exigido  numeric;
alter table public.recebimentos add column if not exists data_vistoria    date;
alter table public.recebimentos add column if not exists data_aprovacao   date;
alter table public.cronograma   add column if not exists item_financiador text;
alter table public.cronograma   add column if not exists peso_financiador numeric;
alter table public.contratos    add column if not exists etapas           jsonb;


-- =====================================================================
--  BLOCO B — DIAGNÓSTICO (somente leitura). Colunas novas nascem nulas,
--  então deve voltar vazio. Se trouxer linhas, corrija antes do BLOCO D.
-- =====================================================================
with problemas as (
  select 'obras' as tabela, id, 'financiador com mais de 80 caracteres' as problema
    from public.obras where length(coalesce(financiador, '')) > 80
  union all
  select 'recebimentos', id, 'percentual exigido fora de 0–1'
    from public.recebimentos where percent_exigido < 0 or percent_exigido > 1
  union all
  select 'recebimentos', id, 'vistoria antes da solicitação'
    from public.recebimentos
   where data_vistoria is not null and data_solicitacao is not null and data_vistoria < data_solicitacao
  union all
  select 'recebimentos', id, 'aprovação antes da vistoria'
    from public.recebimentos
   where data_aprovacao is not null and data_vistoria is not null and data_aprovacao < data_vistoria
  union all
  select 'cronograma', id, 'peso do financiador fora de 0–1'
    from public.cronograma where peso_financiador < 0 or peso_financiador > 1
  union all
  select 'cronograma', id, 'item do financiador com mais de 40 caracteres'
    from public.cronograma where length(coalesce(item_financiador, '')) > 40
  union all
  select 'contratos', id, 'etapas não é uma lista'
    from public.contratos where etapas is not null and jsonb_typeof(etapas) <> 'array'
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
    ('obras',        'chk_obra_financiador',   $q$financiador is null or length(financiador) <= 80$q$),
    ('recebimentos', 'chk_receb_exigido',      $q$percent_exigido is null or (percent_exigido >= 0 and percent_exigido <= 1)$q$),
    ('recebimentos', 'chk_receb_vistoria',     $q$data_vistoria is null or data_solicitacao is null or data_vistoria >= data_solicitacao$q$),
    ('recebimentos', 'chk_receb_aprovacao',    $q$data_aprovacao is null or data_vistoria is null or data_aprovacao >= data_vistoria$q$),
    ('cronograma',   'chk_crono_peso_fin',     $q$peso_financiador is null or (peso_financiador >= 0 and peso_financiador <= 1)$q$),
    ('cronograma',   'chk_crono_item_fin',     $q$item_financiador is null or length(item_financiador) <= 40$q$),
    ('contratos',    'chk_contrato_etapas',    $q$etapas is null or jsonb_typeof(etapas) = 'array'$q$)
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
alter table public.obras        validate constraint chk_obra_financiador;
alter table public.recebimentos validate constraint chk_receb_exigido;
alter table public.recebimentos validate constraint chk_receb_vistoria;
alter table public.recebimentos validate constraint chk_receb_aprovacao;
alter table public.cronograma   validate constraint chk_crono_peso_fin;
alter table public.cronograma   validate constraint chk_crono_item_fin;
alter table public.contratos    validate constraint chk_contrato_etapas;
