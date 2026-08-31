-- =====================================================================
--  0002 — Camada de validação: restrições CHECK que espelham
--  src/dominio/validacao.js (nível 'erro').
--
--  COMO APLICAR (SQL Editor do Supabase, uma vez):
--
--    1. Rode o BLOCO 1 (diagnóstico). Ele NÃO altera nada — só lista as
--       linhas que violariam as novas regras.
--    2. Se a lista vier vazia, rode o BLOCO 2 e depois o BLOCO 3.
--    3. Se a lista trouxer linhas, corrija-as (pelo sistema ou por UPDATE)
--       e repita o passo 1. Só rode o BLOCO 3 quando o diagnóstico zerar.
--
--  O BLOCO 2 adiciona as restrições como NOT VALID: elas passam a valer
--  para toda gravação nova, mas não recusam as linhas já existentes. O
--  BLOCO 3 valida o histórico — e só termina se estiver tudo consistente.
--
--  Este arquivo pode ser rodado de novo sem quebrar. Uma vez validado,
--  não precisa reaplicar.
-- =====================================================================


-- =====================================================================
--  BLOCO 1 — DIAGNÓSTICO (somente leitura)
-- =====================================================================
with problemas as (
  select 'obras' as tabela, id, 'nome vazio' as problema
    from public.obras where nome is null or btrim(nome) = ''
  union all select 'obras', id, 'área ou valor financeiro negativo'
    from public.obras
    where least(coalesce(area_construida,0), coalesce(area_muro,0),
                coalesce(valor_terreno,0), coalesce(valor_financiado,0),
                coalesce(recursos_proprios,0), coalesce(preco_empreitada_m2,0),
                coalesce(custo_fisico_max_m2,0), coalesce(valor_venda,0)) < 0
  union all select 'obras', id, 'margem desejada fora de 0–1'
    from public.obras where margem_desejada < 0 or margem_desejada > 1
  union all select 'obras', id, 'previsão de conclusão antes do início'
    from public.obras
    where data_inicio is not null and previsao_conclusao is not null
      and previsao_conclusao < data_inicio

  union all select 'contratos', id, 'código vazio'
    from public.contratos where codigo is null or btrim(codigo) = ''
  union all select 'contratos', id, 'registro fora de Contrato/Aditivo'
    from public.contratos where registro is not null and registro not in ('Contrato','Aditivo')
  union all select 'contratos', id, 'quantidade, preço ou valor negativo'
    from public.contratos
    where least(coalesce(quantidade,0), coalesce(preco_unitario,0), coalesce(valor_informado,0)) < 0
  union all select 'contratos', id, 'fim previsto antes do início previsto'
    from public.contratos
    where inicio_previsto is not null and fim_previsto is not null and fim_previsto < inicio_previsto

  union all select 'medicoes', id, 'contrato-base não informado'
    from public.medicoes where contrato_base is null or btrim(contrato_base) = ''
  union all select 'medicoes', id, 'valor medido, desconto ou pago negativo'
    from public.medicoes
    where least(coalesce(valor_medido,0), coalesce(desconto,0), coalesce(valor_pago,0)) < 0
  union all select 'medicoes', id, 'progresso fora de 0–1'
    from public.medicoes where progresso < 0 or progresso > 1
  union all select 'medicoes', id, 'desconto maior que o valor medido'
    from public.medicoes where coalesce(desconto,0) > coalesce(valor_medido,0)

  union all select 'recebimentos', id, 'valor previsto/aprovado/desconto/recebido negativo'
    from public.recebimentos
    where least(coalesce(valor_previsto,0), coalesce(valor_aprovado,0),
                coalesce(descontos,0), coalesce(valor_recebido,0)) < 0
  union all select 'recebimentos', id, 'percentual de obra fora de 0–1'
    from public.recebimentos where percent_obra < 0 or percent_obra > 1

  union all select 'lancamentos', id, 'descrição vazia'
    from public.lancamentos where descricao is null or btrim(descricao) = ''
  union all select 'lancamentos', id, 'quantidade, preço, desconto ou frete negativo'
    from public.lancamentos
    where least(coalesce(quantidade,0), coalesce(preco_unitario,0),
                coalesce(desconto,0), coalesce(frete,0)) < 0

  union all select 'materiais', id, 'material ou etapa vazio'
    from public.materiais
    where material is null or btrim(material) = '' or etapa is null or btrim(etapa) = ''
  union all select 'materiais', id, 'quantidade necessária ou preço previsto negativo'
    from public.materiais
    where least(coalesce(quantidade_necessaria,0), coalesce(preco_previsto,0)) < 0

  union all select 'cronograma', id, 'etapa vazia'
    from public.cronograma where etapa is null or btrim(etapa) = ''
  union all select 'cronograma', id, 'progresso fora de 0–1'
    from public.cronograma where progresso < 0 or progresso > 1
  union all select 'cronograma', id, 'quantidade executada ou peso negativo'
    from public.cronograma
    where least(coalesce(quantidade_executada,0), coalesce(peso,0)) < 0
  union all select 'cronograma', id, 'fim previsto antes do início previsto'
    from public.cronograma
    where inicio_previsto is not null and fim_previsto is not null and fim_previsto < inicio_previsto
  union all select 'cronograma', id, 'fim real antes do início real'
    from public.cronograma
    where inicio_real is not null and fim_real is not null and fim_real < inicio_real

  union all select 'diario', id, 'sem data'
    from public.diario where data is null
  union all select 'diario', id, 'efetivo negativo'
    from public.diario where coalesce(efetivo,0) < 0

  union all select 'clientes', id, 'nome vazio'
    from public.clientes where nome is null or btrim(nome) = ''
  union all select 'prestadores', id, 'nome vazio'
    from public.prestadores where nome is null or btrim(nome) = ''
  union all select 'prestadores', id, 'avaliação fora de 0–5'
    from public.prestadores where avaliacao < 0 or avaliacao > 5
)
select tabela, count(*) as linhas, string_agg(distinct problema, ' · ') as problemas
from problemas group by tabela order by tabela;
-- Sem linhas neste resultado = pode seguir para o BLOCO 2.


-- =====================================================================
--  BLOCO 2 — cria as restrições como NOT VALID
--  (valem para gravações novas; não recusam o histórico)
-- =====================================================================
do $$
declare
  r text[];
  regras constant text[][] := array[
    ['obras', 'chk_obras_nome',        $q$nome is not null and btrim(nome) <> ''$q$],
    ['obras', 'chk_obras_nao_neg',     $q$coalesce(area_construida,0) >= 0 and coalesce(area_muro,0) >= 0
        and coalesce(valor_terreno,0) >= 0 and coalesce(valor_financiado,0) >= 0
        and coalesce(recursos_proprios,0) >= 0 and coalesce(preco_empreitada_m2,0) >= 0
        and coalesce(custo_fisico_max_m2,0) >= 0 and coalesce(valor_venda,0) >= 0$q$],
    ['obras', 'chk_obras_margem',      $q$margem_desejada is null or (margem_desejada >= 0 and margem_desejada <= 1)$q$],
    ['obras', 'chk_obras_prazo',       $q$data_inicio is null or previsao_conclusao is null or previsao_conclusao >= data_inicio$q$],

    ['contratos', 'chk_contratos_codigo',   $q$codigo is not null and btrim(codigo) <> ''$q$],
    ['contratos', 'chk_contratos_registro', $q$registro is null or registro in ('Contrato','Aditivo')$q$],
    ['contratos', 'chk_contratos_nao_neg',  $q$coalesce(quantidade,0) >= 0 and coalesce(preco_unitario,0) >= 0 and coalesce(valor_informado,0) >= 0$q$],
    ['contratos', 'chk_contratos_prazo',    $q$inicio_previsto is null or fim_previsto is null or fim_previsto >= inicio_previsto$q$],

    ['medicoes', 'chk_medicoes_contrato', $q$contrato_base is not null and btrim(contrato_base) <> ''$q$],
    ['medicoes', 'chk_medicoes_nao_neg',  $q$coalesce(valor_medido,0) >= 0 and coalesce(desconto,0) >= 0 and coalesce(valor_pago,0) >= 0$q$],
    ['medicoes', 'chk_medicoes_progresso',$q$progresso is null or (progresso >= 0 and progresso <= 1)$q$],
    ['medicoes', 'chk_medicoes_desconto', $q$coalesce(desconto,0) <= coalesce(valor_medido,0)$q$],

    ['recebimentos', 'chk_receb_nao_neg', $q$coalesce(valor_previsto,0) >= 0 and coalesce(valor_aprovado,0) >= 0
        and coalesce(descontos,0) >= 0 and coalesce(valor_recebido,0) >= 0$q$],
    ['recebimentos', 'chk_receb_percent', $q$percent_obra is null or (percent_obra >= 0 and percent_obra <= 1)$q$],

    ['lancamentos', 'chk_lanc_descricao', $q$descricao is not null and btrim(descricao) <> ''$q$],
    ['lancamentos', 'chk_lanc_nao_neg',   $q$coalesce(quantidade,0) >= 0 and coalesce(preco_unitario,0) >= 0
        and coalesce(desconto,0) >= 0 and coalesce(frete,0) >= 0$q$],

    ['materiais', 'chk_mat_preenchido', $q$material is not null and btrim(material) <> '' and etapa is not null and btrim(etapa) <> ''$q$],
    ['materiais', 'chk_mat_nao_neg',    $q$coalesce(quantidade_necessaria,0) >= 0 and coalesce(preco_previsto,0) >= 0$q$],

    ['cronograma', 'chk_crono_etapa',     $q$etapa is not null and btrim(etapa) <> ''$q$],
    ['cronograma', 'chk_crono_progresso', $q$progresso is null or (progresso >= 0 and progresso <= 1)$q$],
    ['cronograma', 'chk_crono_nao_neg',   $q$coalesce(quantidade_executada,0) >= 0 and coalesce(peso,0) >= 0$q$],
    ['cronograma', 'chk_crono_prazo_prev',$q$inicio_previsto is null or fim_previsto is null or fim_previsto >= inicio_previsto$q$],
    ['cronograma', 'chk_crono_prazo_real',$q$inicio_real is null or fim_real is null or fim_real >= inicio_real$q$],

    ['diario', 'chk_diario_data',    $q$data is not null$q$],
    ['diario', 'chk_diario_efetivo', $q$coalesce(efetivo,0) >= 0$q$],

    ['clientes', 'chk_clientes_nome',   $q$nome is not null and btrim(nome) <> ''$q$],
    ['prestadores', 'chk_prest_nome',   $q$nome is not null and btrim(nome) <> ''$q$],
    ['prestadores', 'chk_prest_avaliacao', $q$avaliacao is null or (avaliacao >= 0 and avaliacao <= 5)$q$]
  ];
begin
  foreach r slice 1 in array regras
  loop
    execute format('alter table public.%I drop constraint if exists %I', r[1], r[2]);
    execute format('alter table public.%I add constraint %I check (%s) not valid', r[1], r[2], r[3]);
  end loop;
end $$;


-- =====================================================================
--  BLOCO 3 — valida o histórico
--  (só termina se o BLOCO 1 estiver zerado; senão, aponta a primeira falha)
-- =====================================================================
do $$
declare
  c record;
begin
  for c in
    select conrelid::regclass::text as tabela, conname
    from pg_constraint
    where conname like 'chk_%' and not convalidated
    order by conrelid::regclass::text, conname
  loop
    execute format('alter table %s validate constraint %I', c.tabela, c.conname);
  end loop;
end $$;
