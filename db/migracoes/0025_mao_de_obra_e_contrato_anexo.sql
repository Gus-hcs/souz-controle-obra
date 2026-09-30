-- =====================================================================
--  0025 — Parte de mão de obra no lançamento e contrato anexado (set/2026).
--
--  POR QUÊ (pedido de quem usa o sistema na obra)
--  1. "Fornecimento + instalação" — bancada de mármore instalada, calhas
--     e rufos, esquadria com instalação — é uma nota só com material e
--     serviço juntos, e contava 100% como material nos indicadores, no
--     fluxo e nos relatórios. Agora o lançamento pode dizer quanto do
--     total é instalação / mão de obra; o resto continua material
--     (valorPorCategoria em src/dominio/calculos.js).
--  2. "Anexar contrato" só aceitava um link, e sem conferir o esquema — um
--     "javascript:" virava link que executa código. Agora o contrato
--     assinado vai como foto ou PDF para o Storage (bucket "anexos", pasta
--     <obra>/contratos/, que o cliente final não lê — 0023), como a nota
--     fiscal do lançamento; o link continua aceito, só https.
--
--  O QUE MUDA
--  - lancamentos.valor_mao_de_obra numeric not null default 0
--    + CHECK chk_lanc_mao_de_obra: de 0 ao total do lançamento
--    (quantidade × preço − desconto + frete), espelha validarLancamento.
--  - contratos.anexo text + CHECK chk_contratos_anexo: foto/PDF em data URI
--    até 1,5 MB ou "storage:<obra>/contratos/<arquivo>", espelha
--    validarContrato (ANEXO_CONTRATO).
--  - CHECK chk_contratos_documento_url: vazio ou https — NOT VALID (pode
--    haver link antigo fora do padrão; veja o diagnóstico no fim).
--
--  ORDEM: aplique ESTA migração ANTES de juntar o PR lancamento-e-contrato
--  (o app novo grava as colunas novas). Ela não quebra a versão no ar: as
--  colunas novas têm valor padrão e ninguém as grava ainda.
--  Pode rodar de novo: if not exists, drop constraint if exists.
-- =====================================================================

-- 1. Parte de mão de obra no lançamento --------------------------------
alter table public.lancamentos
  add column if not exists valor_mao_de_obra numeric not null default 0;

alter table public.lancamentos drop constraint if exists chk_lanc_mao_de_obra;
alter table public.lancamentos add constraint chk_lanc_mao_de_obra check (
  valor_mao_de_obra >= 0
  and valor_mao_de_obra <= greatest(0,
        coalesce(quantidade, 0) * coalesce(preco_unitario, 0)
        - coalesce(desconto, 0) + coalesce(frete, 0)) + 0.01
) not valid;
-- coluna nova, toda em 0: já dá para validar
alter table public.lancamentos validate constraint chk_lanc_mao_de_obra;

-- 2. Contrato assinado --------------------------------------------------
alter table public.contratos add column if not exists anexo text;

alter table public.contratos drop constraint if exists chk_contratos_anexo;
alter table public.contratos add constraint chk_contratos_anexo check (
  coalesce(anexo, '') = ''
  or (anexo ~ '^data:(image/|application/pdf)' and length(anexo) <= 1500000)
  or (anexo ~ '^storage:[A-Za-z0-9_-]+/contratos/[A-Za-z0-9._-]+$' and length(anexo) <= 300)
) not valid;
-- coluna nova, vazia: já dá para validar
alter table public.contratos validate constraint chk_contratos_anexo;

-- 3. Link do documento: só https ---------------------------------------
alter table public.contratos drop constraint if exists chk_contratos_documento_url;
alter table public.contratos add constraint chk_contratos_documento_url check (
  coalesce(documento_url, '') = ''
  or documento_url ~ '^https://[^[:space:]"''<>]+$'
) not valid;

-- ---------------------------------------------------------------------
--  Conferência e diagnóstico — rode depois.
--  Esperado: colunas_novas = 2, checks = 3,
--  links_fora_do_padrao = 0 (se for maior, abra o contrato na tela
--  "Contratos → ⋯ → Anexar contrato", corrija o link para https ou
--  anexe o arquivo, e depois rode:
--    alter table public.contratos validate constraint chk_contratos_documento_url;)
-- ---------------------------------------------------------------------
select
  (select count(*) from information_schema.columns
    where table_schema = 'public'
      and ((table_name = 'lancamentos' and column_name = 'valor_mao_de_obra')
        or (table_name = 'contratos' and column_name = 'anexo'))) as colunas_novas,
  (select count(*) from pg_constraint
    where conname in ('chk_lanc_mao_de_obra', 'chk_contratos_anexo', 'chk_contratos_documento_url')) as checks,
  (select count(*) from public.contratos
    where coalesce(documento_url, '') <> ''
      and documento_url !~ '^https://[^[:space:]"''<>]+$') as links_fora_do_padrao;
