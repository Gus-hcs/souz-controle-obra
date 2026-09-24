-- =====================================================================
--  0013 — Contratos e aditivos: aditivo com tipo/status/motivo, condição de
--  pagamento, retenção, forma de preço, encerramento e situação calculada.
--
--  POR QUÊ
--  A tela "Contratos e aditivos" tratava aditivo como só mais uma linha de
--  valor e a situação do contrato era um campo digitado, que podia
--  contradizer as datas (contrato com o fim já passado marcado como "Em
--  andamento"). Este é o Fase 1 (Dados) do redesenho da tela: dar ao
--  aditivo um tipo e uma aprovação, e deixar a situação para o domínio
--  calcular (src/dominio/calculos.js, contratoSituacao) — o campo do banco
--  vira só o override manual de Paralisado/Rescindido, com motivo.
--
--  O QUE MUDA (tudo em `contratos` — aditivo é uma linha da mesma tabela)
--  1. Aditivo: tipo_aditivo (acrescimo | supressao | prazo), status_aditivo
--     (proposto | aprovado | recusado, nasce 'aprovado' para não mudar o
--     autorizado do histórico), motivo_aditivo, data_aprovacao_aditivo e
--     novo_prazo_aditivo (só faz sentido com tipo_aditivo = 'prazo').
--  2. Contrato: condicao_pagamento (por_medicao | parcelas |
--     sinal_mais_medicoes), retencao_pct (0 a 1), forma_preco (preco_fechado
--     | por_m2 | preco_unitario | diaria — convive com `regime`, que
--     continua livre/exibido; forma_preco é a versão com código fixo),
--     data_encerramento e documento_url (caminho no Storage — nunca base64).
--  3. Situação manual: situacao_manual (só Paralisado ou Rescindido) e
--     motivo_situacao_manual. Qualquer outra situação é calculada pelo
--     app a partir das datas, do medido e do pago — não fica no banco.
--  4. CHECKs espelhando src/dominio/validacao.js (validarContrato).
--
--  Não mexe em `prestador_id` (já existe desde a 0011) nem cria tabela
--  nova — por isso não precisa de RLS nova: a coluna herda a política de
--  `contratos`.
--
--  COMO APLICAR (SQL Editor do Supabase), NESTA ORDEM:
--    BLOCO A — estrutura (colunas). Seguro, coluna nasce com o padrão que o
--              app já usa hoje (statusAditivo = 'aprovado' etc).
--    BLOCO B — diagnóstico (somente leitura). Coluna nova começa vazia ou
--              no padrão, então deve voltar zerado.
--    BLOCO C — restrições como NOT VALID: valem para gravações novas.
--    BLOCO D — valida o histórico. Só rode com o BLOCO B zerado.
--
--  O CÓDIGO DO SISTEMA QUE GRAVA ESTAS COLUNAS SÓ PODE IR AO AR DEPOIS DO
--  BLOCO A — antes disso a sincronização tentaria gravar colunas inexistentes.
--
--  Pode ser rodado de novo sem quebrar.
--
--  ESTA MIGRAÇÃO É UM RASCUNHO PARA REVISÃO — quem aplica no banco de
--  produção é o dono do projeto, não o agente (CLAUDE.md).
-- =====================================================================


-- =====================================================================
--  BLOCO A — estrutura
-- =====================================================================
alter table public.contratos add column if not exists tipo_aditivo            text;
alter table public.contratos add column if not exists status_aditivo          text not null default 'aprovado';
alter table public.contratos add column if not exists motivo_aditivo          text;
alter table public.contratos add column if not exists data_aprovacao_aditivo  date;
alter table public.contratos add column if not exists novo_prazo_aditivo      date;

alter table public.contratos add column if not exists condicao_pagamento      text not null default 'por_medicao';
alter table public.contratos add column if not exists retencao_pct            numeric not null default 0;
alter table public.contratos add column if not exists forma_preco             text;
alter table public.contratos add column if not exists data_encerramento       date;
alter table public.contratos add column if not exists documento_url           text;

alter table public.contratos add column if not exists situacao_manual         text;
alter table public.contratos add column if not exists motivo_situacao_manual  text;


-- =====================================================================
--  BLOCO B — DIAGNÓSTICO (somente leitura)
-- =====================================================================
with problemas as (
  select 'tipo_aditivo fora de acrescimo/supressao/prazo' as problema, id, codigo
    from public.contratos
   where coalesce(tipo_aditivo, '') <> '' and tipo_aditivo not in ('acrescimo', 'supressao', 'prazo')
  union all
  select 'status_aditivo fora de proposto/aprovado/recusado', id, codigo
    from public.contratos
   where coalesce(status_aditivo, '') <> '' and status_aditivo not in ('proposto', 'aprovado', 'recusado')
  union all
  select 'aditivo de prazo sem novo_prazo_aditivo', id, codigo
    from public.contratos
   where registro = 'Aditivo' and tipo_aditivo = 'prazo' and novo_prazo_aditivo is null
  union all
  select 'condicao_pagamento desconhecida', id, codigo
    from public.contratos
   where coalesce(condicao_pagamento, '') <> ''
     and condicao_pagamento not in ('por_medicao', 'parcelas', 'sinal_mais_medicoes')
  union all
  select 'forma_preco desconhecida', id, codigo
    from public.contratos
   where coalesce(forma_preco, '') <> ''
     and forma_preco not in ('preco_fechado', 'por_m2', 'preco_unitario', 'diaria')
  union all
  select 'retencao_pct fora de 0-1', id, codigo
    from public.contratos where coalesce(retencao_pct, 0) < 0 or coalesce(retencao_pct, 0) > 1
  union all
  select 'situacao_manual fora de Paralisado/Rescindido', id, codigo
    from public.contratos
   where coalesce(situacao_manual, '') <> '' and situacao_manual not in ('Paralisado', 'Rescindido')
  union all
  select 'data_encerramento antes do fim previsto', id, codigo
    from public.contratos
   where fim_previsto is not null and data_encerramento is not null and data_encerramento < fim_previsto
)
select * from problemas order by problema, codigo;
-- Sem linhas neste resultado = pode seguir para o BLOCO C.


-- =====================================================================
--  BLOCO C — restrições (NOT VALID: valem para o que for gravado daqui em diante)
-- =====================================================================
do $$
declare
  r text[];
  regras text[][] := array[
    ['contratos', 'chk_contratos_tipo_aditivo',
      $q$coalesce(tipo_aditivo, '') = '' or tipo_aditivo in ('acrescimo', 'supressao', 'prazo')$q$],
    ['contratos', 'chk_contratos_status_aditivo',
      $q$coalesce(status_aditivo, '') = '' or status_aditivo in ('proposto', 'aprovado', 'recusado')$q$],
    ['contratos', 'chk_contratos_prazo_aditivo',
      $q$registro <> 'Aditivo' or tipo_aditivo <> 'prazo' or novo_prazo_aditivo is not null$q$],
    ['contratos', 'chk_contratos_condicao_pagamento',
      $q$coalesce(condicao_pagamento, '') = '' or condicao_pagamento in ('por_medicao', 'parcelas', 'sinal_mais_medicoes')$q$],
    ['contratos', 'chk_contratos_forma_preco',
      $q$coalesce(forma_preco, '') = '' or forma_preco in ('preco_fechado', 'por_m2', 'preco_unitario', 'diaria')$q$],
    ['contratos', 'chk_contratos_retencao',
      $q$coalesce(retencao_pct, 0) >= 0 and coalesce(retencao_pct, 0) <= 1$q$],
    ['contratos', 'chk_contratos_situacao_manual',
      $q$coalesce(situacao_manual, '') = '' or situacao_manual in ('Paralisado', 'Rescindido')$q$],
    ['contratos', 'chk_contratos_encerramento',
      $q$fim_previsto is null or data_encerramento is null or data_encerramento >= fim_previsto$q$]
  ];
begin
  foreach r slice 1 in array regras
  loop
    execute format('alter table public.%I drop constraint if exists %I', r[1], r[2]);
    execute format('alter table public.%I add constraint %I check (%s) not valid', r[1], r[2], r[3]);
  end loop;
end $$;


-- =====================================================================
--  BLOCO D — valida o histórico
--  (só termina se a parte do BLOCO B estiver zerada)
-- =====================================================================
do $$
declare
  c record;
begin
  for c in
    select conrelid::regclass::text as tabela, conname
      from pg_constraint
     where conname like 'chk_contratos_%' and not convalidated
     order by conname
  loop
    execute format('alter table %s validate constraint %I', c.tabela, c.conname);
  end loop;
end $$;
