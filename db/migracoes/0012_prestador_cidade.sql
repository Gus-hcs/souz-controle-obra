-- =====================================================================
--  0012 — Prestadores: cidade.
--
--  POR QUÊ
--  O mesmo empreiteiro pode atender obras em cidades diferentes; saber de
--  onde ele é ajuda a escolher quem chamar para cada obra.
--
--  O QUE MUDA
--  1. Coluna prestadores.cidade (texto livre, opcional — ex.: "Anápolis/GO").
--  2. CHECK espelhando src/dominio/validacao.js (validarPrestador):
--     no máximo 60 caracteres.
--
--  A tabela já tem RLS (0001/0004/0011); coluna nova herda as políticas.
--
--  COMO APLICAR (SQL Editor do Supabase), NESTA ORDEM:
--    BLOCO A — estrutura (coluna). Seguro.
--    BLOCO B — diagnóstico (somente leitura). Coluna nova começa vazia,
--              então deve voltar zerado.
--    BLOCO C — restrição como NOT VALID.
--    BLOCO D — valida o histórico. Só rode com o BLOCO B zerado.
--
--  O CÓDIGO DO SISTEMA QUE USA ESTA COLUNA SÓ PODE IR AO AR DEPOIS DO
--  BLOCO A. Antes disso, o sistema tentaria gravar uma coluna que não existe.
--
--  Pode ser rodado de novo sem quebrar.
-- =====================================================================


-- =====================================================================
--  BLOCO A — estrutura
-- =====================================================================
alter table public.prestadores add column if not exists cidade text;


-- =====================================================================
--  BLOCO B — diagnóstico (somente leitura)
-- =====================================================================
select id, nome, cidade, char_length(cidade) as caracteres
  from public.prestadores
 where char_length(btrim(coalesce(cidade, ''))) > 60;


-- =====================================================================
--  BLOCO C — restrição (NOT VALID: vale para o que for gravado daqui em diante)
-- =====================================================================
alter table public.prestadores drop constraint if exists chk_prest_cidade;
alter table public.prestadores add constraint chk_prest_cidade
  check (char_length(btrim(coalesce(cidade, ''))) <= 60) not valid;


-- =====================================================================
--  BLOCO D — valida o histórico (só termina se o BLOCO B estiver zerado)
-- =====================================================================
alter table public.prestadores validate constraint chk_prest_cidade;
