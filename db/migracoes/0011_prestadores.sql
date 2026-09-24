-- =====================================================================
--  0011 — Prestadores: vínculo por id, cadastro completo, arquivamento.
--
--  POR QUÊ
--  Contratos e lançamentos se ligavam ao prestador pelo NOME digitado
--  (contratos.prestador, lancamentos.fornecedor). Contrato cadastrado sem
--  nome, ou com o nome escrito diferente, deixava o prestador com
--  Contratado e Pago zerados. E nada impedia apagar um prestador que já
--  recebeu dinheiro.
--
--  O QUE MUDA
--  1. contratos.prestador_id e lancamentos.prestador_id (opcionais), com
--     ON DELETE RESTRICT: prestador com contrato ou lançamento ligado não
--     pode ser apagado — só arquivado (prestadores.arquivado).
--  2. Colunas novas em prestadores: apelido, whatsapp (só dígitos,
--     55DDDNÚMERO), tem_whatsapp, chave_pix, tipo_pix, forma_contratacao,
--     valor_referencia, arquivado. `telefone` passa a ser o telefone
--     alternativo; `documento` é o CPF/CNPJ.
--  3. CHECKs espelhando src/dominio/validacao.js (validarPrestador).
--     Especialidade NÃO vira CHECK: a lista é personalizável (é alerta).
--  4. Liga os registros antigos ao prestador pelo nome, quando o nome
--     aponta para exatamente UM prestador do dono da obra.
--  5. A política de leitura para membros da obra passa a considerar o id.
--
--  COMO APLICAR (SQL Editor do Supabase), NESTA ORDEM:
--    BLOCO A — estrutura (colunas, chaves, índices, política). Seguro.
--    BLOCO B — normaliza telefones já gravados e liga registros antigos.
--    BLOCO C — diagnóstico (somente leitura). Mostra o que viola as regras
--              e o que ficou sem vínculo.
--    BLOCO D — restrições como NOT VALID: valem para gravações novas.
--    BLOCO E — valida o histórico. Só rode com o BLOCO C zerado na parte
--              "viola regra".
--
--  O CÓDIGO DO SISTEMA QUE USA ESTAS COLUNAS SÓ PODE IR AO AR DEPOIS DO
--  BLOCO A. Antes disso, o sistema tentaria gravar colunas que não existem.
--
--  Pode ser rodado de novo sem quebrar.
-- =====================================================================


-- =====================================================================
--  BLOCO A — estrutura
-- =====================================================================
alter table public.prestadores add column if not exists apelido           text;
alter table public.prestadores add column if not exists whatsapp          text;
alter table public.prestadores add column if not exists tem_whatsapp      boolean not null default true;
alter table public.prestadores add column if not exists chave_pix         text;
alter table public.prestadores add column if not exists tipo_pix          text;
alter table public.prestadores add column if not exists forma_contratacao text;
alter table public.prestadores add column if not exists valor_referencia  numeric default 0;
alter table public.prestadores add column if not exists arquivado         boolean not null default false;

alter table public.contratos   add column if not exists prestador_id text;
alter table public.lancamentos add column if not exists prestador_id text;

-- ON DELETE RESTRICT: é o banco que garante "quem tem vínculo não some".
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fk_contratos_prestador') then
    alter table public.contratos add constraint fk_contratos_prestador
      foreign key (prestador_id) references public.prestadores (id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fk_lancamentos_prestador') then
    alter table public.lancamentos add constraint fk_lancamentos_prestador
      foreign key (prestador_id) references public.prestadores (id) on delete restrict;
  end if;
end $$;

create index if not exists idx_contratos_prestador   on public.contratos   (prestador_id);
create index if not exists idx_lancamentos_prestador on public.lancamentos (prestador_id);

-- O membro convidado para uma obra enxerga os prestadores que ela usa —
-- agora pelo id, e ainda pelo nome para os registros antigos.
drop policy if exists prestadores_da_obra on public.prestadores;
create policy prestadores_da_obra on public.prestadores for select using (
  exists (
    select 1 from public.contratos c
    where (c.prestador_id = prestadores.id
           or (c.prestador_id is null and c.prestador = prestadores.nome))
      and public.pode_ler_obra(c.obra_id)
  )
  or exists (
    select 1 from public.lancamentos l
    where (l.prestador_id = prestadores.id
           or (l.prestador_id is null and l.fornecedor = prestadores.nome))
      and public.pode_ler_obra(l.obra_id)
  )
);


-- =====================================================================
--  BLOCO B — dados existentes
-- =====================================================================

-- Telefone gravado com máscara vira só dígitos com 55 na frente.
-- O que não tiver 10 ou 11 dígitos fica como está e aparece no BLOCO C.
update public.prestadores
   set telefone = case
     when regexp_replace(telefone, '\D', '', 'g') ~ '^55[0-9]{10,11}$' then regexp_replace(telefone, '\D', '', 'g')
     when length(regexp_replace(telefone, '\D', '', 'g')) in (10, 11) then '55' || regexp_replace(telefone, '\D', '', 'g')
     else telefone end
 where telefone is not null and btrim(telefone) <> '';

-- Liga contrato antigo ao prestador pelo nome — só quando o nome aponta
-- para exatamente UM prestador do dono da obra. Nome ambíguo ou sem
-- cadastro fica sem vínculo e aparece no BLOCO C.
update public.contratos c
   set prestador_id = p.id
  from public.obras o, public.prestadores p
 where c.prestador_id is null
   and o.id = c.obra_id
   and p.usuario_id = o.usuario_id
   and lower(btrim(p.nome)) = lower(btrim(c.prestador))
   and (select count(*) from public.prestadores p2
         where p2.usuario_id = o.usuario_id
           and lower(btrim(p2.nome)) = lower(btrim(c.prestador))) = 1;

update public.lancamentos l
   set prestador_id = p.id
  from public.obras o, public.prestadores p
 where l.prestador_id is null
   and o.id = l.obra_id
   and p.usuario_id = o.usuario_id
   and lower(btrim(p.nome)) = lower(btrim(l.fornecedor))
   and (select count(*) from public.prestadores p2
         where p2.usuario_id = o.usuario_id
           and lower(btrim(p2.nome)) = lower(btrim(l.fornecedor))) = 1;


-- =====================================================================
--  BLOCO C — DIAGNÓSTICO (somente leitura)
--  Duas partes: o que viola as regras novas (precisa corrigir antes do
--  BLOCO E) e o que ficou sem vínculo (informativo: dá para ligar depois,
--  pela tela).
-- =====================================================================
with problemas as (
  select 'viola regra' as tipo, 'prestadores' as tabela, id, nome as registro,
         'whatsapp fora do formato 55DDDNÚMERO: ' || whatsapp as problema
    from public.prestadores
   where coalesce(btrim(whatsapp), '') <> ''
     and whatsapp !~ '^55[1-9][1-9](9[0-9]{8}|[2-5][0-9]{7})$'
  union all
  select 'viola regra', 'prestadores', id, nome,
         'telefone fora do formato 55DDDNÚMERO: ' || telefone
    from public.prestadores
   where coalesce(btrim(telefone), '') <> ''
     and telefone !~ '^55[1-9][1-9](9[0-9]{8}|[2-5][0-9]{7})$'
  union all
  select 'viola regra', 'prestadores', id, nome, 'CPF/CNPJ sem 11 nem 14 dígitos: ' || documento
    from public.prestadores
   where coalesce(btrim(documento), '') <> ''
     and length(regexp_replace(documento, '\D', '', 'g')) not in (11, 14)
  union all
  select 'viola regra', 'prestadores', id, nome, 'chave PIX sem tipo, ou tipo desconhecido'
    from public.prestadores
   where (coalesce(btrim(chave_pix), '') <> '' and coalesce(tipo_pix, '') = '')
      or (coalesce(tipo_pix, '') <> '' and tipo_pix not in ('cpf_cnpj', 'telefone', 'email', 'aleatoria'))
  union all
  select 'viola regra', 'prestadores', id, nome, 'forma de contratação desconhecida: ' || forma_contratacao
    from public.prestadores
   where coalesce(forma_contratacao, '') <> ''
     and forma_contratacao not in ('empreitada', 'diaria', 'm2', 'etapa')
  union all
  select 'viola regra', 'prestadores', id, nome, 'valor de referência negativo'
    from public.prestadores where coalesce(valor_referencia, 0) < 0
  union all
  select 'sem vínculo', 'contratos', c.id, c.codigo,
         'prestador digitado "' || c.prestador || '" não bate com um único cadastro'
    from public.contratos c
   where c.prestador_id is null and coalesce(btrim(c.prestador), '') <> ''
  union all
  select 'sem vínculo', 'contratos', c.id, c.codigo, 'contrato sem prestador informado'
    from public.contratos c
   where c.prestador_id is null and coalesce(btrim(c.prestador), '') = ''
)
select * from problemas order by tipo desc, tabela, registro;


-- =====================================================================
--  BLOCO D — restrições (NOT VALID: valem para o que for gravado daqui em diante)
-- =====================================================================
do $$
declare
  r text[];
  regras text[][] := array[
    ['prestadores', 'chk_prest_whatsapp',
      $q$coalesce(btrim(whatsapp), '') = '' or whatsapp ~ '^55[1-9][1-9](9[0-9]{8}|[2-5][0-9]{7})$'$q$],
    ['prestadores', 'chk_prest_telefone',
      $q$coalesce(btrim(telefone), '') = '' or telefone ~ '^55[1-9][1-9](9[0-9]{8}|[2-5][0-9]{7})$'$q$],
    ['prestadores', 'chk_prest_documento',
      $q$coalesce(btrim(documento), '') = '' or length(regexp_replace(documento, '\D', '', 'g')) in (11, 14)$q$],
    ['prestadores', 'chk_prest_pix_tipo',
      $q$coalesce(tipo_pix, '') = '' or tipo_pix in ('cpf_cnpj', 'telefone', 'email', 'aleatoria')$q$],
    ['prestadores', 'chk_prest_pix_par',
      $q$coalesce(btrim(chave_pix), '') = '' or coalesce(tipo_pix, '') <> ''$q$],
    ['prestadores', 'chk_prest_forma',
      $q$coalesce(forma_contratacao, '') = '' or forma_contratacao in ('empreitada', 'diaria', 'm2', 'etapa')$q$],
    ['prestadores', 'chk_prest_valor_ref',
      $q$coalesce(valor_referencia, 0) >= 0$q$]
  ];
begin
  foreach r slice 1 in array regras
  loop
    execute format('alter table public.%I drop constraint if exists %I', r[1], r[2]);
    execute format('alter table public.%I add constraint %I check (%s) not valid', r[1], r[2], r[3]);
  end loop;
end $$;


-- =====================================================================
--  BLOCO E — valida o histórico
--  (só termina se a parte "viola regra" do BLOCO C estiver zerada)
-- =====================================================================
do $$
declare
  c record;
begin
  for c in
    select conrelid::regclass::text as tabela, conname
      from pg_constraint
     where conname like 'chk_prest_%' and not convalidated
     order by conname
  loop
    execute format('alter table %s validate constraint %I', c.tabela, c.conname);
  end loop;
end $$;
