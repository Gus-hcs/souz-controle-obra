-- =====================================================================
--  0019 — Foto da nota fiscal no lançamento; funções fechadas para quem
--  não está logado.
--
--  POR QUÊ
--  1. Lançamento sem o comprovante é conversa de "confia em mim". A foto
--     da NF (ou do recibo), tirada na hora da compra, fica presa ao
--     lançamento. Sem leitura automática: só o anexo.
--  2. O verificador de segurança do Supabase apontou 12 funções SECURITY
--     DEFINER executáveis pelo papel `anon` via /rest/v1/rpc/, e as
--     funções de GATILHO executáveis por qualquer usuário logado. Nenhuma
--     delas precisa disso:
--     - o app só chama por RPC, logado: admin_consumo,
--       admin_definir_perfil, membros_da_obra, convidar_membro;
--     - as políticas de RLS usam pode_ler_obra, pode_escrever_obra,
--       eh_dono_obra e pode_admin — avaliadas com o papel de quem
--       consulta, então `authenticated` continua precisando delas;
--     - função de gatilho não precisa de EXECUTE de ninguém: o Postgres
--       só confere a permissão ao CRIAR o gatilho, não quando ele dispara.
--
--  O QUE MUDA
--  - lancamentos.anexo_nf  text  (imagem em data URI, reduzida pelo app)
--  - EXECUTE revogado de PUBLIC e anon em todas as SECURITY DEFINER;
--    das funções de gatilho, revogado também de authenticated; as demais
--    ficam concedidas explicitamente a authenticated.
--
--  COMO APLICAR (SQL Editor do Supabase), NESTA ORDEM:
--    BLOCO A — coluna nova e permissões. Seguro: coluna nasce nula.
--    BLOCO B — diagnóstico (somente leitura). Deve voltar vazio.
--    BLOCO C — restrição da coluna nova como NOT VALID.
--    BLOCO D — valida o histórico. Só rode com o BLOCO B zerado.
--    CONFERÊNCIA — quem pode executar o quê.
--
--  O código que grava anexo_nf só pode ir ao ar depois do BLOCO A.
--  Rode 0001–0018 antes. Pode ser rodado de novo sem quebrar.
-- =====================================================================


-- =====================================================================
--  BLOCO A — estrutura e permissões
-- =====================================================================
alter table public.lancamentos add column if not exists anexo_nf text;

-- funções chamadas pelo app ou pela RLS: só para quem está logado
revoke execute on function public.admin_consumo()                                    from public, anon;
revoke execute on function public.admin_definir_perfil(uuid, text, boolean, jsonb, integer) from public, anon;
revoke execute on function public.convidar_membro(text, text, text)                  from public, anon;
revoke execute on function public.membros_da_obra(text)                              from public, anon;
revoke execute on function public.eh_dono_obra(text)                                 from public, anon;
revoke execute on function public.pode_admin()                                       from public, anon;
revoke execute on function public.pode_ler_obra(text)                                from public, anon;
revoke execute on function public.pode_escrever_obra(text)                           from public, anon;
grant  execute on function public.admin_consumo()                                    to authenticated;
grant  execute on function public.admin_definir_perfil(uuid, text, boolean, jsonb, integer) to authenticated;
grant  execute on function public.convidar_membro(text, text, text)                  to authenticated;
grant  execute on function public.membros_da_obra(text)                              to authenticated;
grant  execute on function public.eh_dono_obra(text)                                 to authenticated;
grant  execute on function public.pode_admin()                                       to authenticated;
grant  execute on function public.pode_ler_obra(text)                                to authenticated;
grant  execute on function public.pode_escrever_obra(text)                           to authenticated;

-- funções de gatilho: ninguém chama direto
revoke execute on function public.criar_perfil()          from public, anon, authenticated;
revoke execute on function public.obra_checa_limite()     from public, anon, authenticated;
revoke execute on function public.obra_dono_membro()      from public, anon, authenticated;
revoke execute on function public.perfil_trava_controle() from public, anon, authenticated;
revoke execute on function public.registrar_auditoria()   from public, anon, authenticated;


-- =====================================================================
--  BLOCO B — DIAGNÓSTICO (somente leitura). Coluna nova nasce nula.
-- =====================================================================
select id, 'anexo da NF que não é imagem ou passa de 1,5 MB' as problema
  from public.lancamentos
 where anexo_nf is not null
   and (anexo_nf not like 'data:image/%' or length(anexo_nf) > 1500000);


-- =====================================================================
--  BLOCO C — restrição NOT VALID
-- =====================================================================
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chk_lanc_anexo_nf') then
    alter table public.lancamentos add constraint chk_lanc_anexo_nf
      check (anexo_nf is null or (anexo_nf like 'data:image/%' and length(anexo_nf) <= 1500000)) not valid;
  end if;
end $$;


-- =====================================================================
--  BLOCO D — valida o histórico. Só com o BLOCO B vazio.
-- =====================================================================
alter table public.lancamentos validate constraint chk_lanc_anexo_nf;


-- =====================================================================
--  CONFERÊNCIA — anon não executa nada; gatilho, ninguém
-- =====================================================================
select p.proname,
       has_function_privilege('anon', p.oid, 'execute')          as anon,
       has_function_privilege('authenticated', p.oid, 'execute') as autenticado
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.prosecdef
 order by 1;
