-- =====================================================================
--  0024 — Desempenho da RLS e índices (set/2026).
--
--  POR QUÊ (auditoria de 27/09/2026, avisos do get_advisors "performance")
--  1. Políticas que chamam auth.uid() — e as funções de acesso sem
--     argumento, eu_ativo() e minha_empresa() — direto na expressão são
--     reavaliadas linha a linha. Dentro de (select …) o PostgreSQL calcula
--     uma vez por consulta (initplan). Irrelevante com 10 obras; pesa com
--     milhares de lançamentos.
--  2. clientes, prestadores e perfis tinham duas políticas permissivas
--     para o mesmo comando (a do dono do cadastro e a da obra, ou a do
--     próprio perfil e a do admin): o banco avalia as duas em toda linha.
--     Viram uma política por comando, com as condições unidas por "or" —
--     a mesma regra de acesso.
--  3. 15 chaves estrangeiras sem índice (usuario_id em quase todas as
--     tabelas, material, cliente): a exclusão de conta (on delete set
--     null) e os joins varriam a tabela inteira.
--
--  NÃO MUDA QUEM LÊ O QUÊ. Prova: db/bancada/acesso.mjs e
--  db/bancada/construtoras.mjs com as mesmas conferências de antes.
--  Pode rodar de novo: drop policy if exists, create index if not exists.
--  Rodar a 0021 ou a 0023 de novo DEPOIS desta recria as políticas
--  antigas (clientes_proprio, prestadores_proprio…) ao lado das novas: o
--  acesso não muda, mas volta o aviso de desempenho — rode esta de novo.
-- =====================================================================

-- ---------------------------------------------------------------------
--  1. obras: auth.uid() e funções de acesso uma vez por consulta
-- ---------------------------------------------------------------------
drop policy if exists obras_ler on public.obras;
create policy obras_ler on public.obras for select using (
  (usuario_id = (select auth.uid()) and (select public.eu_ativo())
   and (empresa_id is null or empresa_id = (select public.minha_empresa())))
  or public.pode_ler_obra(id)
);

drop policy if exists obras_criar on public.obras;
create policy obras_criar on public.obras for insert
  with check (usuario_id = (select auth.uid()) and (select public.eu_ativo()));

-- ---------------------------------------------------------------------
--  2. perfis: uma política por comando (o próprio perfil ou o admin)
-- ---------------------------------------------------------------------
drop policy if exists perfil_proprio_ler on public.perfis;
drop policy if exists perfil_admin_ler on public.perfis;
drop policy if exists perfil_ler on public.perfis;
create policy perfil_ler on public.perfis for select
  using (id = (select auth.uid()) or (select public.pode_admin()));

drop policy if exists perfil_proprio_alterar on public.perfis;
drop policy if exists perfil_admin_alterar on public.perfis;
drop policy if exists perfil_alterar on public.perfis;
create policy perfil_alterar on public.perfis for update
  using (id = (select auth.uid()) or (select public.pode_admin()))
  with check (id = (select auth.uid()) or (select public.pode_admin()));

-- ---------------------------------------------------------------------
--  3. clientes: leitura = do cadastro OU da obra; escrita = do cadastro
-- ---------------------------------------------------------------------
drop policy if exists clientes_proprio on public.clientes;
drop policy if exists clientes_da_obra on public.clientes;
drop policy if exists clientes_ler on public.clientes;
drop policy if exists clientes_inserir on public.clientes;
drop policy if exists clientes_alterar on public.clientes;
drop policy if exists clientes_remover on public.clientes;

create policy clientes_ler on public.clientes for select using (
  (empresa_id is null and usuario_id = (select auth.uid()) and (select public.eu_ativo()))
  or (empresa_id is not null and empresa_id = (select public.minha_empresa()))
  or exists (select 1 from public.obras o where o.cliente_id = clientes.id and public.pode_ler_obra(o.id))
);
create policy clientes_inserir on public.clientes for insert with check (
  (empresa_id is null and usuario_id = (select auth.uid()) and (select public.eu_ativo()))
  or (empresa_id is not null and empresa_id = (select public.minha_empresa()))
);
create policy clientes_alterar on public.clientes for update
  using ((empresa_id is null and usuario_id = (select auth.uid()) and (select public.eu_ativo()))
         or (empresa_id is not null and empresa_id = (select public.minha_empresa())))
  with check ((empresa_id is null and usuario_id = (select auth.uid()) and (select public.eu_ativo()))
              or (empresa_id is not null and empresa_id = (select public.minha_empresa())));
create policy clientes_remover on public.clientes for delete using (
  (empresa_id is null and usuario_id = (select auth.uid()) and (select public.eu_ativo()))
  or (empresa_id is not null and empresa_id = (select public.minha_empresa()))
);

-- ---------------------------------------------------------------------
--  4. prestadores: leitura = do cadastro OU usado nas obras (interna);
--     escrita = do cadastro
-- ---------------------------------------------------------------------
drop policy if exists prestadores_proprio on public.prestadores;
drop policy if exists prestadores_da_obra on public.prestadores;
drop policy if exists prestadores_ler on public.prestadores;
drop policy if exists prestadores_inserir on public.prestadores;
drop policy if exists prestadores_alterar on public.prestadores;
drop policy if exists prestadores_remover on public.prestadores;

create policy prestadores_ler on public.prestadores for select using (
  (empresa_id is null and usuario_id = (select auth.uid()) and (select public.eu_ativo()))
  or (empresa_id is not null and empresa_id = (select public.minha_empresa()))
  or exists (select 1 from public.contratos c
              where (c.prestador_id = prestadores.id
                     or (c.prestador_id is null and c.prestador = prestadores.nome))
                and public.pode_ler_obra_interna(c.obra_id))
  or exists (select 1 from public.lancamentos l
              where (l.prestador_id = prestadores.id
                     or (l.prestador_id is null and l.fornecedor = prestadores.nome))
                and public.pode_ler_obra_interna(l.obra_id))
);
create policy prestadores_inserir on public.prestadores for insert with check (
  (empresa_id is null and usuario_id = (select auth.uid()) and (select public.eu_ativo()))
  or (empresa_id is not null and empresa_id = (select public.minha_empresa()))
);
create policy prestadores_alterar on public.prestadores for update
  using ((empresa_id is null and usuario_id = (select auth.uid()) and (select public.eu_ativo()))
         or (empresa_id is not null and empresa_id = (select public.minha_empresa())))
  with check ((empresa_id is null and usuario_id = (select auth.uid()) and (select public.eu_ativo()))
              or (empresa_id is not null and empresa_id = (select public.minha_empresa())));
create policy prestadores_remover on public.prestadores for delete using (
  (empresa_id is null and usuario_id = (select auth.uid()) and (select public.eu_ativo()))
  or (empresa_id is not null and empresa_id = (select public.minha_empresa()))
);

-- ---------------------------------------------------------------------
--  5. Índices das chaves estrangeiras
-- ---------------------------------------------------------------------
create index if not exists idx_alertas_tratamento_usuario on public.alertas_tratamento (usuario_id);
create index if not exists idx_clientes_usuario           on public.clientes (usuario_id);
create index if not exists idx_contratos_usuario          on public.contratos (usuario_id);
create index if not exists idx_cronograma_usuario         on public.cronograma (usuario_id);
create index if not exists idx_diario_ocorrencia_material on public.diario (ocorrencia_material_id);
create index if not exists idx_diario_usuario             on public.diario (usuario_id);
create index if not exists idx_lancamentos_material       on public.lancamentos (material_id);
create index if not exists idx_lancamentos_usuario        on public.lancamentos (usuario_id);
create index if not exists idx_materiais_usuario          on public.materiais (usuario_id);
create index if not exists idx_medicoes_usuario           on public.medicoes (usuario_id);
create index if not exists idx_obras_cliente              on public.obras (cliente_id);
create index if not exists idx_pendencias_cliente_usuario on public.pendencias_cliente (usuario_id);
create index if not exists idx_prestadores_usuario        on public.prestadores (usuario_id);
create index if not exists idx_recebimentos_usuario       on public.recebimentos (usuario_id);
create index if not exists idx_relatorios_gerados_usuario on public.relatorios_gerados (usuario_id);

-- ---------------------------------------------------------------------
--  Conferência — rode depois. Esperado: politicas_duplicadas = 0,
--  indices_novos = 15, politicas_por_linha = 0.
-- ---------------------------------------------------------------------
select
  (select count(*) from (
     select c.relname, p.polcmd
       from pg_policy p join pg_class c on c.oid = p.polrelid
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname in ('clientes', 'prestadores', 'perfis')
        and p.polpermissive
      group by c.relname, p.polcmd
     having count(*) > 1) d) as politicas_duplicadas,
  (select count(*) from pg_indexes
    where schemaname = 'public' and indexname in (
      'idx_alertas_tratamento_usuario', 'idx_clientes_usuario', 'idx_contratos_usuario',
      'idx_cronograma_usuario', 'idx_diario_ocorrencia_material', 'idx_diario_usuario',
      'idx_lancamentos_material', 'idx_lancamentos_usuario', 'idx_materiais_usuario',
      'idx_medicoes_usuario', 'idx_obras_cliente', 'idx_pendencias_cliente_usuario',
      'idx_prestadores_usuario', 'idx_recebimentos_usuario', 'idx_relatorios_gerados_usuario')
  ) as indices_novos,
  (select count(*) from pg_policy p join pg_class c on c.oid = p.polrelid
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and position('auth.uid()' in replace(
            coalesce(pg_get_expr(p.polqual, p.polrelid), '') || ' ' ||
            coalesce(pg_get_expr(p.polwithcheck, p.polrelid), ''),
            'SELECT auth.uid()', '')) > 0
  ) as politicas_por_linha;
