-- =====================================================================
--  DEMO 5/5 — Loja 2 — Reforma Comercial Setor Bueno (Goiânia/GO)
--  História: reforma de loja para um café, PARALISADA. O Corpo de
--  Bombeiros embargou até a aprovação do projeto de incêndio: a
--  empreitada está Paralisada (situação manual, com motivo). O eletricista
--  abandonou o serviço: contrato Rescindido, com supressão do saldo não
--  executado, e o saldo recontratado com outro prestador. Parcela do
--  cliente atrasada, materiais vencidos sem compra, hidráulica atrasada.
--  Obra sem CAIXA: quem paga é o cliente (valor do contrato da reforma).
--
--  COMO USAR: troque o e-mail em v_email, cole tudo no SQL Editor do
--  Supabase e clique em Run. Pode rodar de novo. Requer migrações até a 0013.
-- =====================================================================

create or replace function pg_temp.demo_prestador(
  p_uid uuid, p_nome text, p_apelido text, p_esp text, p_cidade text, p_whats text,
  p_tel text, p_doc text, p_pix text, p_tipo_pix text, p_forma text, p_ref numeric)
returns text language plpgsql as $f$
declare v text;
begin
  select id into v from public.prestadores where usuario_id = p_uid and nome = p_nome;
  if v is null then
    insert into public.prestadores (usuario_id, nome, apelido, especialidade, cidade, whatsapp,
        tem_whatsapp, telefone, documento, chave_pix, tipo_pix, forma_contratacao, valor_referencia)
    values (p_uid, p_nome, p_apelido, p_esp, p_cidade, p_whats, p_whats is not null, p_tel, p_doc,
        p_pix, p_tipo_pix, p_forma, p_ref)
    returning id into v;
  end if;
  return v;
end $f$;

create or replace function pg_temp.demo_cliente(
  p_uid uuid, p_nome text, p_contato text, p_tel text, p_email text, p_doc text, p_origem text, p_obs text)
returns text language plpgsql as $f$
declare v text;
begin
  select id into v from public.clientes where usuario_id = p_uid and nome = p_nome;
  if v is null then
    insert into public.clientes (usuario_id, nome, contato, telefone, email, documento, origem, situacao, observacoes)
    values (p_uid, p_nome, p_contato, p_tel, p_email, p_doc, p_origem, 'Cliente', p_obs)
    returning id into v;
  end if;
  return v;
end $f$;

do $$
declare
  v_email text := 'SEU-EMAIL@AQUI.com';   -- <<< troque pelo e-mail da conta de demonstração
  v_nome  text := 'Loja 2 — Reforma Comercial Setor Bueno';
  v_uid   uuid;
  v_obra  text := gen_random_uuid()::text;
  h       date := current_date;
  v_cli text; p_ant text; p_ele text; p_hor text; p_hid text; p_ges text;
  m1 text := gen_random_uuid()::text; m2 text := gen_random_uuid()::text;
  m3 text := gen_random_uuid()::text; m4 text := gen_random_uuid()::text;
  m5 text := gen_random_uuid()::text; m6 text := gen_random_uuid()::text;
  v_lim int; v_qtd int;
begin
  select id into v_uid from auth.users where lower(email) = lower(v_email);
  if v_uid is null then
    raise exception 'Nenhum usuário com o e-mail %. Confira em Authentication > Users.', v_email;
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'contratos' and column_name = 'tipo_aditivo') then
    raise exception 'Aplique antes a migração 0013 (contratos e aditivos).';
  end if;

  delete from public.obras where usuario_id = v_uid and nome = v_nome;

  select limite_obras into v_lim from public.perfis where id = v_uid;
  select count(*) into v_qtd from public.obras where usuario_id = v_uid;
  if v_lim is not null and v_qtd >= v_lim then
    raise exception 'A conta está no limite de % obra(s). Aumente o limite em Administração antes de criar a demo.', v_lim;
  end if;

  -- ------------------------------------------------ cadastro (reaproveita)
  v_cli := pg_temp.demo_cliente(v_uid, 'Café Bueno Ltda', 'Renata (sócia)', '(62) 90000-0205',
    'renata@cafebueno.exemplo.com', '37.215.901/0001-00', 'Indicação',
    'Inauguração prevista depende da liberação do Corpo de Bombeiros.');
  p_ant := pg_temp.demo_prestador(v_uid, 'Antônio Ribeiro', 'Toninho', 'Empreiteiro geral', 'Anápolis/GO',
    '5562900000102', null, '526.018.159-06', '526.018.159-06', 'cpf_cnpj', 'empreitada', 720);
  p_ele := pg_temp.demo_prestador(v_uid, 'Elétrica Luz Forte', null, 'Eletricista', 'Goiânia/GO',
    '5562900000103', null, '65.632.122/0001-46', 'pix@luzforte.exemplo.com', 'email', 'etapa', 0);
  p_hor := pg_temp.demo_prestador(v_uid, 'Construtora Horizonte', 'Horizonte', 'Empreiteiro geral', 'Goiânia/GO',
    '5562900000101', null, '76.842.684/0001-30', 'financeiro@horizonte.exemplo.com', 'email', 'empreitada', 760);
  p_hid := pg_temp.demo_prestador(v_uid, 'Hidráulica Santos', 'Seu Santos', 'Encanador', 'Aparecida de Goiânia/GO',
    '5562900000104', null, '083.016.613-05', '083.016.613-05', 'cpf_cnpj', 'etapa', 0);
  p_ges := pg_temp.demo_prestador(v_uid, 'Gesso Arte', null, 'Gesseiro', 'Goiânia/GO',
    '5562900000106', null, '33.079.244/0001-60', 'gessoarte@exemplo.com', 'email', 'm2', 45);

  -- ---------------------------------------------------------------- obra
  insert into public.obras (id, usuario_id, nome, cliente_id, cidade, endereco, area_construida, area_muro,
      sistema, padrao, data_inicio, previsao_conclusao, responsavel, status, observacoes,
      saldo_inicial, valor_terreno, valor_financiado, recursos_proprios, preco_empreitada_m2,
      custo_fisico_max_m2, valor_venda, margem_desejada, contrato_caixa, data_assinatura)
  values (v_obra, v_uid, v_nome, v_cli, 'Goiânia/GO', 'Av. T-10, 1450 — Setor Bueno', 120, 0,
      'Reforma: drywall e alvenaria', 'Comercial', h - 100, h + 20, 'Eng. Júlio Andrade', 'Paralisada',
      'Embargo do CBMGO até a aprovação do projeto de prevenção contra incêndio. Protocolo 2026/004512.',
      0, 0, 0, 0, 0, 1400, 198000, 0.12, null, null);

  -- ----------------------------------------------------------- contratos
  insert into public.contratos (usuario_id, obra_id, ordem, codigo, codigo_base, registro, prestador, prestador_id,
      escopo, regime, forma_preco, quantidade, unidade, preco_unitario, valor_informado, inclui_material,
      inicio_previsto, fim_previsto, status, condicao_pagamento, retencao_pct,
      tipo_aditivo, status_aditivo, motivo_aditivo, data_aprovacao_aditivo,
      situacao_manual, motivo_situacao_manual, observacoes)
  values
    (v_uid, v_obra, 0, 'CT-001', 'CT-001', 'Contrato', 'Antônio Ribeiro', p_ant,
      'Demolição, alvenaria e contrapiso', 'Preço fechado', 'preco_fechado', 0, 'vb', 0, 28500, 'Não',
      h - 98, h - 20, 'Suspenso', 'por_medicao', 0, null, 'aprovado', null, null,
      'Paralisado', 'Obra embargada pelo Corpo de Bombeiros até a aprovação do projeto de incêndio (protocolo 2026/004512).', null),
    (v_uid, v_obra, 1, 'CT-002', 'CT-002', 'Contrato', 'Elétrica Luz Forte', p_ele,
      'Instalações elétricas e cabeamento de rede', 'Preço fechado', 'preco_fechado', 0, 'vb', 0, 16500, 'Não',
      h - 80, h - 30, 'Em andamento', 'por_medicao', 0, null, 'aprovado', null, null,
      'Rescindido', 'Prestador abandonou o serviço depois da 1ª medição. Saldo recontratado (CT-003).', null),
    (v_uid, v_obra, 2, 'CT-002-A1', 'CT-002', 'Aditivo', 'Elétrica Luz Forte', p_ele,
      'Rescisão: saldo não executado', 'Preço fechado', 'preco_fechado', 0, 'vb', 0, 11550, 'Não',
      null, null, 'Em andamento', 'por_medicao', 0, 'supressao', 'aprovado',
      'Rescisão do contrato: o saldo não executado sai do autorizado.', h - 28, null, null, null),
    (v_uid, v_obra, 3, 'CT-003', 'CT-003', 'Contrato', 'Construtora Horizonte', p_hor,
      'Instalações elétricas — recontratação do saldo', 'Preço fechado', 'preco_fechado', 0, 'vb', 0, 12900, 'Não',
      h + 5, h + 35, 'Planejado', 'por_medicao', 0, null, 'aprovado', null, null, null, null,
      'Começa assim que o embargo cair.'),
    (v_uid, v_obra, 4, 'CT-004', 'CT-004', 'Contrato', 'Hidráulica Santos', p_hid,
      'Hidráulica da copa e sanitários acessíveis', 'Preço fechado', 'preco_fechado', 0, 'vb', 0, 9800, 'Não',
      h - 60, h - 25, 'Em andamento', 'por_medicao', 0, null, 'aprovado', null, null, null, null, null),
    (v_uid, v_obra, 5, 'CT-005', 'CT-005', 'Contrato', 'Gesso Arte', p_ges,
      'Forro e divisórias em drywall', 'Preço unitário', 'preco_unitario', 120, 'm²', 95, 0, 'Sim',
      h - 40, h + 10, 'Planejado', 'por_medicao', 0, null, 'aprovado', null, null, null, null,
      'Não pôde começar: área embargada.');

  -- ------------------------------------------------------------ medições
  insert into public.medicoes (usuario_id, obra_id, ordem, contrato_base, numero, data, descricao,
      progresso, valor_medido, desconto, data_pagamento, valor_pago, status, documento)
  values
    (v_uid, v_obra, 0, 'CT-001', '1', h - 80, 'Demolição e retirada de entulho', 0.30, 8550, 0,   h - 77, 8550, 'Pago',    'REC-01'),
    (v_uid, v_obra, 1, 'CT-001', '2', h - 45, 'Alvenaria nova e contrapiso',     0.60, 8550, 400, h - 40, 8150, 'Pago',    'REC-02'),
    (v_uid, v_obra, 2, 'CT-002', '1', h - 55, 'Infraestrutura e quadro',         0.30, 4950, 0,   h - 52, 4950, 'Pago',    'REC-03'),
    (v_uid, v_obra, 3, 'CT-004', '1', h - 35, 'Rede de água e esgoto da copa',   0.50, 4900, 0,   h - 31, 4900, 'Pago',    'REC-04');

  -- -------------------------------------------------------- recebimentos
  insert into public.recebimentos (usuario_id, obra_id, ordem, origem, numero_medicao, etapa_pci,
      data_prevista, valor_previsto, data_solicitacao, percent_obra, valor_aprovado, descontos,
      data_recebimento, valor_recebido, status, observacoes)
  values
    (v_uid, v_obra, 0, 'Cliente', '1', 'Sinal — 30% do contrato', h - 100, 59400, null, 0.30, 59400, 0, h -  99, 59400, 'Recebido', null),
    (v_uid, v_obra, 1, 'Cliente', '2', '2ª parcela',              h -  50, 49500, null, 0.55, 49500, 0, h -  48, 49500, 'Recebido', null),
    (v_uid, v_obra, 2, 'Cliente', '3', '3ª parcela',              h -  20, 49500, null, 0.80,     0, 0, null,        0, 'Previsto', 'Cliente segurou o pagamento até o embargo cair.'),
    (v_uid, v_obra, 3, 'Cliente', '4', 'Entrega da loja',         h +  25, 39600, null, 1.00,     0, 0, null,        0, 'Previsto', null);

  -- ----------------------------------------------------------- materiais
  insert into public.materiais (id, usuario_id, obra_id, ordem, etapa, material, quantidade_necessaria,
      unidade, data_necessaria, prioridade, preco_previsto, status, observacoes)
  values
    (m1, v_uid, v_obra, 0, 'Fechamento/alvenaria',  'Bloco cerâmico 14x19x39',        2, 'milheiro', h - 85, 'Alta',  1380, 'Comprado', null),
    (m2, v_uid, v_obra, 1, 'Pisos e revestimentos', 'Porcelanato 90x90 retificado', 130, 'm²',       h - 12, 'Alta',   119, 'Comprar', 'Fornecedor segura o preço até o fim do mês.'),
    (m3, v_uid, v_obra, 2, 'Forro/gesso',           'Placas de drywall e perfis',    60, 'un',       h -  5, 'Alta',    72, 'Comprar', null),
    (m4, v_uid, v_obra, 3, 'Instalação elétrica final','Luminárias LED embutidas',   36, 'un',       h + 10, 'Média',  89, 'Planejar', null),
    (m5, v_uid, v_obra, 4, 'Louças e metais',       'Louças acessíveis (NBR 9050)',   1, 'vb',       h + 12, 'Média',3400, 'Planejar', null),
    (m6, v_uid, v_obra, 5, 'Extras',                'Portas corta-fogo P-90',         2, 'un',       h + 15, 'Alta', 2900, 'Planejar', 'Exigência do projeto de incêndio.');

  -- --------------------------------------------------------- lançamentos
  insert into public.lancamentos (usuario_id, obra_id, ordem, data, tipo, etapa, categoria, descricao,
      fornecedor, prestador_id, documento, quantidade, unidade, preco_unitario, desconto, frete,
      forma_pagamento, material_id)
  values
    (v_uid, v_obra, 0, h - 98, 'Taxa/imposto', 'Serviços preliminares', 'Taxas',    'ART de execução',                   'CREA-GO',               null, 'GRU 3310', 1, 'serviço',  262, 0,   0, 'PIX',    null),
    (v_uid, v_obra, 1, h - 96, 'Serviço avulso','Serviços preliminares','Entulho',  'Caçambas de entulho',               'Disk Caçamba Goiânia',  null, 'NF 901',   4, 'un',       380, 0,   0, 'PIX',    null),
    (v_uid, v_obra, 2, h - 86, 'Material',     'Fechamento/alvenaria',  'Bloco',    'Bloco cerâmico 14x19x39',           'Cerâmica Boa Vista',    null, 'NF 3410',  2, 'milheiro',1380, 0, 250, 'Boleto', m1),
    (v_uid, v_obra, 3, h - 84, 'Material',     'Fechamento/alvenaria',  'Argamassa','Cimento, areia e argamassa',        'Depósito Central',      null, 'NF 2233',  1, 'vb',      2150, 0,  90, 'PIX',    null),
    (v_uid, v_obra, 4, h - 58, 'Material',     'Eletrodutos e caixas',  'Elétrica', 'Eletrodutos, cabos e quadro',       'Eletro Norte',          null, 'NF 701',   1, 'vb',      3980, 0,   0, 'Cartão', null),
    (v_uid, v_obra, 5, h - 50, 'Material',     'Instalações hidrossanitárias','Hidráulica','Tubos, conexões e caixa de gordura','Casa do Encanador', null, 'NF 1511', 1, 'vb',    1860, 0,   0, 'Cartão', null),
    (v_uid, v_obra, 6, h - 34, 'Honorário técnico/gestão','Extras',     'Projetos', 'Projeto de prevenção contra incêndio (PPCI)','Seg Fogo Engenharia', null, 'NF 88', 1, 'serviço', 4800, 0, 0, 'Transferência', null),
    (v_uid, v_obra, 7, h - 30, 'Taxa/imposto', 'Extras',                'Taxas',    'Taxa de análise do CBMGO',          'Corpo de Bombeiros GO', null, 'DARE 5521',1, 'serviço',  620, 0,   0, 'Boleto', null),
    (v_uid, v_obra, 8, h - 25, 'Honorário técnico/gestão','Extras',     'Gestão',   'Acompanhamento técnico — mês 3',    'Souz Engenharia',       null, '',         1, 'mês',     1500, 0,   0, 'PIX',    null);

  -- ---------------------------------------------------------- cronograma
  insert into public.cronograma (usuario_id, obra_id, ordem, etapa, inicio_previsto, fim_previsto,
      inicio_real, fim_real, progresso, quantidade_executada, unidade_producao, responsavel, peso)
  values
    (v_uid, v_obra, 0, 'Serviços preliminares',        h - 100, h - 85, h - 100, h - 82, 1.00, 120, 'm²', 'Antônio Ribeiro',     8),
    (v_uid, v_obra, 1, 'Fechamento/alvenaria',         h -  85, h - 40, h -  82, null,   0.60,  45, 'm²', 'Antônio Ribeiro',    18),
    (v_uid, v_obra, 2, 'Eletrodutos e caixas',         h -  75, h - 30, h -  70, null,   0.30,  36, 'm²', 'Elétrica Luz Forte', 14),
    (v_uid, v_obra, 3, 'Instalações hidrossanitárias', h -  60, h - 25, h -  55, null,   0.50,  60, 'm²', 'Hidráulica Santos',  10),
    (v_uid, v_obra, 4, 'Forro/gesso',                  h -  40, h + 10, null,    null,   0.00,   0, 'm²', 'Gesso Arte',         12),
    (v_uid, v_obra, 5, 'Pisos e revestimentos',        h -  15, h + 12, null,    null,   0.00,   0, 'm²', null,                 16),
    (v_uid, v_obra, 6, 'Instalação elétrica final',    h +   5, h + 18, null,    null,   0.00,   0, 'm²', 'Construtora Horizonte', 8),
    (v_uid, v_obra, 7, 'Pintura',                      h +   8, h + 18, null,    null,   0.00,   0, 'm²', null,                  8),
    (v_uid, v_obra, 8, 'Louças e metais',              h +  12, h + 20, null,    null,   0.00,   0, 'vb', 'Hidráulica Santos',   6);

  -- -------------------------------------------------------------- diário
  insert into public.diario (usuario_id, obra_id, ordem, data, clima, efetivo, etapa, atividades, ocorrencias, autor)
  values
    (v_uid, v_obra, 0, h - 95, 'Bom',     6, 'Serviços preliminares',
      'Demolição das paredes internas e retirada do piso antigo. 2 caçambas.', 'Nenhuma.', 'Eng. Júlio Andrade'),
    (v_uid, v_obra, 1, h - 55, 'Bom',     5, 'Eletrodutos e caixas',
      'Infraestrutura elétrica e montagem do quadro. Medição 1 do eletricista.', 'Nenhuma.', 'Eng. Júlio Andrade'),
    (v_uid, v_obra, 2, h - 38, 'Nublado', 2, 'Eletrodutos e caixas',
      'Eletricista não apareceu pela terceira vez na semana.', 'Tentativas de contato sem resposta. Avaliar rescisão.', 'Eng. Júlio Andrade'),
    (v_uid, v_obra, 3, h - 32, 'Bom',     4, 'Fechamento/alvenaria',
      'Vistoria do Corpo de Bombeiros.', 'Obra EMBARGADA: exigido projeto de prevenção contra incêndio antes de continuar.', 'Eng. Júlio Andrade'),
    (v_uid, v_obra, 4, h - 28, 'Bom',     0, 'Extras',
      'Rescisão do contrato elétrico assinada; saldo será recontratado.', 'Obra parada por causa do embargo.', 'Eng. Júlio Andrade'),
    (v_uid, v_obra, 5, h -  6, 'Bom',     0, 'Extras',
      'Projeto de incêndio protocolado no CBMGO. Aguardando análise.', 'Cliente pediu previsão de reabertura.', 'Eng. Júlio Andrade');

  raise notice 'Demo 5/5 criada: % (obra_id %)', v_nome, v_obra;
end $$;

select o.nome,
       (select count(*) from public.contratos    x where x.obra_id = o.id) as contratos,
       (select count(*) from public.medicoes     x where x.obra_id = o.id) as medicoes,
       (select count(*) from public.recebimentos x where x.obra_id = o.id) as recebimentos,
       (select count(*) from public.lancamentos  x where x.obra_id = o.id) as lancamentos,
       (select count(*) from public.materiais    x where x.obra_id = o.id) as materiais,
       (select count(*) from public.cronograma   x where x.obra_id = o.id) as etapas,
       (select count(*) from public.diario       x where x.obra_id = o.id) as diario
  from public.obras o
 where o.nome = 'Loja 2 — Reforma Comercial Setor Bueno';
