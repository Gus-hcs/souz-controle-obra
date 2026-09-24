-- =====================================================================
--  DEMO 1/5 — Casa 07 — Residencial Jardim Aurora (Goiânia/GO)
--  História: casa MCMV financiada pela CAIXA, EM DIA. ~70% executada,
--  caixa positivo, 3 parcelas da CAIXA recebidas e a 4ª solicitada.
--  Mostra: empreitada por m² com aditivo aprovado, medição a pagar,
--  contrato ainda não iniciado, plano de materiais com compra chegando,
--  cronograma ponderado, diário de obra.
--
--  COMO USAR: troque o e-mail em v_email, cole tudo no SQL Editor do
--  Supabase e clique em Run. Pode rodar de novo: apaga esta obra de
--  demonstração e recria. Prestadores e cliente são reaproveitados pelo
--  nome (não duplicam). Datas são relativas a hoje.
--  Requer as migrações até a 0013 aplicadas.
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
  v_nome  text := 'Casa 07 — Residencial Jardim Aurora';
  v_uid   uuid;
  v_obra  text := gen_random_uuid()::text;
  h       date := current_date;
  v_cli text; p_hor text; p_ele text; p_hid text; p_pin text; p_ped text; p_ser text;
  m1 text := gen_random_uuid()::text; m2 text := gen_random_uuid()::text;
  m3 text := gen_random_uuid()::text; m4 text := gen_random_uuid()::text;
  m5 text := gen_random_uuid()::text; m6 text := gen_random_uuid()::text;
  m7 text := gen_random_uuid()::text; m8 text := gen_random_uuid()::text;
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
  v_cli := pg_temp.demo_cliente(v_uid, 'Mariana Costa Lima', 'Mariana', '(62) 90000-0201',
    'mariana.lima@exemplo.com', '937.865.797-41', 'Indicação', 'Primeiro imóvel. Prefere contato por WhatsApp à noite.');
  p_hor := pg_temp.demo_prestador(v_uid, 'Construtora Horizonte', 'Horizonte', 'Empreiteiro geral', 'Goiânia/GO',
    '5562900000101', null, '76.842.684/0001-30', 'financeiro@horizonte.exemplo.com', 'email', 'empreitada', 760);
  p_ele := pg_temp.demo_prestador(v_uid, 'Elétrica Luz Forte', null, 'Eletricista', 'Goiânia/GO',
    '5562900000103', null, '65.632.122/0001-46', 'pix@luzforte.exemplo.com', 'email', 'etapa', 0);
  p_hid := pg_temp.demo_prestador(v_uid, 'Hidráulica Santos', 'Seu Santos', 'Encanador', 'Aparecida de Goiânia/GO',
    '5562900000104', null, '083.016.613-05', '083.016.613-05', 'cpf_cnpj', 'etapa', 0);
  p_pin := pg_temp.demo_prestador(v_uid, 'Pinturas Oliveira', null, 'Pintor', 'Goiânia/GO',
    '5562900000105', null, '186.091.390-34', 'oliveira.pinturas@exemplo.com', 'email', 'm2', 28);
  p_ped := pg_temp.demo_prestador(v_uid, 'José Carlos Pereira', 'Zé Carlos', 'Pedreiro', 'Goiânia/GO',
    '5562900000108', null, '996.030.824-30', '996.030.824-30', 'cpf_cnpj', 'diaria', 220);
  p_ser := pg_temp.demo_prestador(v_uid, 'Marcos Vinícius Souza', 'Marquinhos', 'Servente', 'Goiânia/GO',
    '5562900000109', null, '628.194.821-12', '628.194.821-12', 'cpf_cnpj', 'diaria', 150);

  -- ---------------------------------------------------------------- obra
  insert into public.obras (id, usuario_id, nome, cliente_id, cidade, endereco, area_construida, area_muro,
      sistema, padrao, data_inicio, previsao_conclusao, responsavel, status, observacoes,
      saldo_inicial, valor_terreno, valor_financiado, recursos_proprios, preco_empreitada_m2,
      custo_fisico_max_m2, valor_venda, margem_desejada, contrato_caixa, data_assinatura)
  values (v_obra, v_uid, v_nome, v_cli, 'Goiânia/GO', 'Rua JA-12, Qd 4 Lt 7 — Jardim Aurora', 58, 30,
      'Alvenaria convencional', 'MCMV', h - 150, h + 60, 'Eng. Júlio Andrade', 'Em andamento',
      'Casa 2 quartos, sala/cozinha integradas. Cliente pediu muro frontal (aditivo aprovado).',
      8000, 55000, 175000, 25000, 760, 2100, 245000, 0.15, '8.4455.0012345-6', h - 160);

  -- ----------------------------------------------------------- contratos
  insert into public.contratos (usuario_id, obra_id, ordem, codigo, codigo_base, registro, prestador, prestador_id,
      escopo, regime, forma_preco, quantidade, unidade, preco_unitario, valor_informado, inclui_material,
      inicio_previsto, fim_previsto, status, condicao_pagamento, retencao_pct,
      tipo_aditivo, status_aditivo, motivo_aditivo, data_aprovacao_aditivo, observacoes)
  values
    (v_uid, v_obra, 0, 'CT-001', 'CT-001', 'Contrato', 'Construtora Horizonte', p_hor,
      'Empreitada de mão de obra — fundação ao reboco', 'R$/m²', 'por_m2', 58, 'm²', 760, 0, 'Não',
      h - 148, h + 40, 'Em andamento', 'por_medicao', 0, null, 'aprovado', null, null,
      'Medição mensal pelo avanço físico.'),
    (v_uid, v_obra, 1, 'CT-001-A1', 'CT-001', 'Aditivo', 'Construtora Horizonte', p_hor,
      'Muro frontal com portão e calçada', 'Preço fechado', 'preco_fechado', 0, 'vb', 0, 4800, 'Não',
      null, null, 'Em andamento', 'por_medicao', 0, 'acrescimo', 'aprovado',
      'Cliente pediu muro frontal com portão e calçada de 1,2 m.', h - 62, null),
    (v_uid, v_obra, 2, 'CT-002', 'CT-002', 'Contrato', 'Elétrica Luz Forte', p_ele,
      'Instalações elétricas: tubulação, fiação e quadro', 'Preço fechado', 'preco_fechado', 0, 'vb', 0, 6800, 'Não',
      h - 75, h + 30, 'Em andamento', 'parcelas', 0, null, 'aprovado', null, null, null),
    (v_uid, v_obra, 3, 'CT-003', 'CT-003', 'Contrato', 'Hidráulica Santos', p_hid,
      'Instalações hidrossanitárias e fossa', 'Preço fechado', 'preco_fechado', 0, 'vb', 0, 5900, 'Não',
      h - 72, h + 25, 'Em andamento', 'por_medicao', 0, null, 'aprovado', null, null, null),
    (v_uid, v_obra, 4, 'CT-004', 'CT-004', 'Contrato', 'Pinturas Oliveira', p_pin,
      'Pintura interna e externa', 'Preço unitário', 'preco_unitario', 210, 'm²', 28, 0, 'Não',
      h + 12, h + 45, 'Planejado', 'por_medicao', 0, null, 'aprovado', null, null, null);

  -- ------------------------------------------------------------ medições
  insert into public.medicoes (usuario_id, obra_id, ordem, contrato_base, numero, data, descricao,
      progresso, valor_medido, desconto, data_pagamento, valor_pago, status, documento)
  values
    (v_uid, v_obra, 0, 'CT-001', '1', h - 120, 'Fundação e baldrame',        0.20,  9800, 0, h - 117,  9800, 'Pago',      'REC-01'),
    (v_uid, v_obra, 1, 'CT-001', '2', h -  86, 'Estrutura e alvenaria',      0.48, 13700, 0, h -  83, 13700, 'Pago',      'REC-02'),
    (v_uid, v_obra, 2, 'CT-001', '3', h -  50, 'Cobertura e muro frontal',   0.66,  8800, 0, h -  47,  8800, 'Pago',      'REC-03'),
    (v_uid, v_obra, 3, 'CT-001', '4', h -  10, 'Reboco interno e externo',   0.80,  6850, 0, null,        0, 'Em aberto', 'REC-04'),
    (v_uid, v_obra, 4, 'CT-002', '1', h -  40, 'Tubulação e caixas',         0.45,  3060, 0, h -  37,  3060, 'Pago',      'REC-05'),
    (v_uid, v_obra, 5, 'CT-003', '1', h -  38, 'Esgoto, água fria e fossa',  0.55,  3245, 0, h -  35,  3245, 'Pago',      'REC-06'),
    (v_uid, v_obra, 6, 'CT-003', '2', h -   6, 'Ramais e teste de estanqueidade', 0.80, 1475, 0, null, 0, 'Em aberto', 'REC-07');

  -- -------------------------------------------------------- recebimentos
  insert into public.recebimentos (usuario_id, obra_id, ordem, origem, numero_medicao, etapa_pci,
      data_prevista, valor_previsto, data_solicitacao, percent_obra, valor_aprovado, descontos,
      data_recebimento, valor_recebido, status, observacoes)
  values
    (v_uid, v_obra, 0, 'Cliente', '',  'Entrada do cliente (recursos próprios)', h - 150, 25000, null, 0, 0, 0, h - 148, 25000, 'Recebido', null),
    (v_uid, v_obra, 1, 'CAIXA',  '1', 'Fundação',                   h - 125, 35000, h - 126, 0.20, 35000, 245, h - 119, 34755, 'Recebido', null),
    (v_uid, v_obra, 2, 'CAIXA',  '2', 'Estrutura e alvenaria',      h -  90, 43750, h -  92, 0.45, 43750, 306, h -  84, 43444, 'Recebido', null),
    (v_uid, v_obra, 3, 'CAIXA',  '3', 'Cobertura e instalações',    h -  55, 35000, h -  57, 0.65, 35000, 245, h -  49, 34755, 'Recebido', null),
    (v_uid, v_obra, 4, 'CAIXA',  '4', 'Reboco e revestimentos',     h +   5, 26250, h -   4, 0.80,     0,   0, null,      0, 'Solicitado', 'Vistoria agendada pelo engenheiro da CAIXA.'),
    (v_uid, v_obra, 5, 'CAIXA',  '5', 'Acabamento e habite-se',     h +  62, 35000, null,    1.00,     0,   0, null,      0, 'Previsto', null);

  -- ----------------------------------------------------------- materiais
  insert into public.materiais (id, usuario_id, obra_id, ordem, etapa, material, quantidade_necessaria,
      unidade, data_necessaria, prioridade, preco_previsto, status, observacoes)
  values
    (m1, v_uid, v_obra, 0, 'Fundação',              'Cimento CP II 50 kg',            120, 'saco',     h - 145, 'Alta',   38, 'Comprado', null),
    (m2, v_uid, v_obra, 1, 'Fundação',              'Aço CA-50 10 mm',                 45, 'barra',    h - 145, 'Alta',   52, 'Comprado', null),
    (m3, v_uid, v_obra, 2, 'Fechamento/alvenaria',  'Bloco cerâmico 9x19x39',           6, 'milheiro', h - 110, 'Alta',  990, 'Comprado', null),
    (m4, v_uid, v_obra, 3, 'Cobertura',             'Telha cerâmica portuguesa',     1600, 'un',       h -  75, 'Alta',  2.9, 'Comprado', null),
    (m5, v_uid, v_obra, 4, 'Pisos e revestimentos', 'Porcelanato 60x60 acetinado',     70, 'm²',       h +   6, 'Alta',   49, 'Comprar', 'Cotado em 3 lojas; Casa do Piso tem o melhor prazo.'),
    (m6, v_uid, v_obra, 5, 'Esquadrias/janelas',    'Janelas de alumínio com vidro',    6, 'un',       h +  20, 'Alta',  480, 'Comprar', null),
    (m7, v_uid, v_obra, 6, 'Pintura',               'Tinta acrílica fosca 18 L',       10, 'lata',     h +  15, 'Média', 239, 'Planejar', null),
    (m8, v_uid, v_obra, 7, 'Louças e metais',       'Kit louças e metais',              1, 'un',       h +  40, 'Média',1950, 'Planejar', 'Bacia com caixa acoplada, lavatório, torneiras e registros.');

  -- --------------------------------------------------------- lançamentos
  insert into public.lancamentos (usuario_id, obra_id, ordem, data, tipo, etapa, categoria, descricao,
      fornecedor, prestador_id, documento, quantidade, unidade, preco_unitario, desconto, frete,
      forma_pagamento, material_id)
  values
    (v_uid, v_obra,  0, h - 146, 'Material',     'Fundação',              'Cimento',  'Cimento CP II 50 kg',              'Depósito Central',     null,  'NF 2011', 80, 'saco',     38, 40, 120, 'PIX',           m1),
    (v_uid, v_obra,  1, h - 145, 'Material',     'Fundação',              'Aço',      'Aço CA-50 10 mm',                  'Ferro & Cia',          null,  'NF 912',  45, 'barra',    52,  0,   0, 'Boleto',        m2),
    (v_uid, v_obra,  2, h - 140, 'Material',     'Fundação',              'Agregados','Areia média e brita 1',            'Areal Meia Ponte',     null,  'NF 77',   12, 'm³',      125,  0, 180, 'PIX',           null),
    (v_uid, v_obra,  3, h - 138, 'Taxa/imposto', 'Serviços preliminares', 'Taxas',    'ART de execução',                  'CREA-GO',              null,  'GRU 1180', 1, 'serviço', 262,  0,   0, 'PIX',           null),
    (v_uid, v_obra,  4, h - 137, 'Taxa/imposto', 'Serviços preliminares', 'Taxas',    'Alvará de construção',             'Prefeitura de Goiânia',null,  'DAM 5521', 1, 'serviço', 780,  0,   0, 'Boleto',        null),
    (v_uid, v_obra,  5, h - 112, 'Material',     'Fechamento/alvenaria',  'Bloco',    'Bloco cerâmico 9x19x39',           'Cerâmica Boa Vista',   null,  'NF 3302',  6, 'milheiro',990,  0, 350, 'Boleto',        m3),
    (v_uid, v_obra,  6, h - 104, 'Material',     'Fundação',              'Cimento',  'Cimento CP II 50 kg',              'Depósito Central',     null,  'NF 2140', 40, 'saco',     39,  0,  60, 'PIX',           m1),
    (v_uid, v_obra,  7, h -  78, 'Material',     'Cobertura',             'Telha',    'Telha cerâmica portuguesa',        'Telhas Goiás',         null,  'NF 845',1600, 'un',      2.9,  0, 250, 'Boleto',        m4),
    (v_uid, v_obra,  8, h -  76, 'Material',     'Cobertura',             'Madeira',  'Madeiramento do telhado',          'Madeireira Ipê',       null,  'NF 4410',  1, 'vb',     3900,  0,   0, 'Transferência', null),
    (v_uid, v_obra,  9, h -  60, 'Serviço avulso','Muro',                 'Diárias',  'Diárias de pedreiro — muro frontal','José Carlos Pereira', p_ped, '',         8, 'diária',  220,  0,   0, 'PIX',           null),
    (v_uid, v_obra, 10, h -  59, 'Serviço avulso','Muro',                 'Diárias',  'Diárias de servente — muro frontal','Marcos Vinícius Souza',p_ser, '',        8, 'diária',  150,  0,   0, 'PIX',           null),
    (v_uid, v_obra, 11, h -  45, 'Material',     'Instalações hidrossanitárias','Hidráulica','Tubos e conexões PVC',       'Casa do Encanador',    null,  'NF 1291',  1, 'vb',     1480,  0,   0, 'Cartão',        null),
    (v_uid, v_obra, 12, h -  44, 'Material',     'Eletrodutos e caixas',  'Elétrica', 'Eletrodutos, caixas e fios',       'Eletro Norte',         null,  'NF 552',   1, 'vb',     2240,  0,   0, 'Cartão',        null),
    (v_uid, v_obra, 13, h -  30, 'Honorário técnico/gestão','Extras',     'Gestão',   'Acompanhamento técnico — mês 5',   'Souz Engenharia',      null,  '',         1, 'mês',    1200,  0,   0, 'PIX',           null),
    (v_uid, v_obra, 14, h -  20, 'Material',     'Reboco e requadros',    'Argamassa','Argamassa AC-II e cal',            'Depósito Central',     null,  'NF 2290', 60, 'saco',     24,  0,  90, 'PIX',           null),
    (v_uid, v_obra, 15, h -   8, 'Serviço avulso','Reboco e requadros',   'Diárias',  'Diárias de servente — limpeza e apoio','Marcos Vinícius Souza',p_ser,'',       5, 'diária',  150,  0,   0, 'PIX',           null);

  -- ---------------------------------------------------------- cronograma
  insert into public.cronograma (usuario_id, obra_id, ordem, etapa, inicio_previsto, fim_previsto,
      inicio_real, fim_real, progresso, quantidade_executada, unidade_producao, responsavel, peso)
  values
    (v_uid, v_obra,  0, 'Serviços preliminares',        h - 150, h - 142, h - 150, h - 141, 1.00,  58, 'm²', 'Construtora Horizonte',  3),
    (v_uid, v_obra,  1, 'Fundação',                     h - 142, h - 120, h - 141, h - 118, 1.00,  58, 'm²', 'Construtora Horizonte', 12),
    (v_uid, v_obra,  2, 'Estrutura',                    h - 120, h - 100, h - 118, h -  97, 1.00,  58, 'm²', 'Construtora Horizonte', 12),
    (v_uid, v_obra,  3, 'Fechamento/alvenaria',         h - 100, h -  80, h -  97, h -  78, 1.00, 165, 'm²', 'Construtora Horizonte', 14),
    (v_uid, v_obra,  4, 'Cobertura',                    h -  80, h -  60, h -  78, h -  56, 1.00,  70, 'm²', 'Construtora Horizonte', 10),
    (v_uid, v_obra,  5, 'Muro',                         h -  65, h -  50, h -  62, h -  48, 1.00,  30, 'm²', 'José Carlos Pereira',     3),
    (v_uid, v_obra,  6, 'Instalações hidrossanitárias', h -  70, h +  10, h -  70, null,    0.80,  46, 'm²', 'Hidráulica Santos',       7),
    (v_uid, v_obra,  7, 'Eletrodutos e caixas',         h -  70, h +   5, h -  72, null,    0.85,  49, 'm²', 'Elétrica Luz Forte',      6),
    (v_uid, v_obra,  8, 'Reboco e requadros',           h -  40, h +   8, h -  38, null,    0.70, 180, 'm²', 'Construtora Horizonte',   9),
    (v_uid, v_obra,  9, 'Pisos e revestimentos',        h +   8, h +  30, null,    null,    0.00,   0, 'm²', 'Construtora Horizonte',   9),
    (v_uid, v_obra, 10, 'Forro/gesso',                  h +  10, h +  25, null,    null,    0.00,   0, 'm²', null,                      4),
    (v_uid, v_obra, 11, 'Esquadrias/janelas',           h +  20, h +  30, null,    null,    0.00,   0, 'un', null,                      4),
    (v_uid, v_obra, 12, 'Pintura',                      h +  12, h +  45, null,    null,    0.00,   0, 'm²', 'Pinturas Oliveira',       6),
    (v_uid, v_obra, 13, 'Louças e metais',              h +  40, h +  50, null,    null,    0.00,   0, 'un', 'Hidráulica Santos',       3),
    (v_uid, v_obra, 14, 'Calçada',                      h +  45, h +  55, null,    null,    0.00,   0, 'm²', 'Construtora Horizonte',   2);

  -- -------------------------------------------------------------- diário
  insert into public.diario (usuario_id, obra_id, ordem, data, clima, efetivo, etapa, atividades, ocorrencias, autor)
  values
    (v_uid, v_obra, 0, h - 60, 'Bom',         6, 'Muro',
      'Início do muro frontal: gabarito, sapatas corridas e primeira fiada.', 'Nenhuma.', 'Eng. Júlio Andrade'),
    (v_uid, v_obra, 1, h - 41, 'Nublado',     5, 'Instalações hidrossanitárias',
      'Rede de esgoto e fossa concluídas; teste de caimento aprovado.', 'Faltaram 2 joelhos de 100 mm — comprados no dia.', 'Eng. Júlio Andrade'),
    (v_uid, v_obra, 2, h - 22, 'Chuva fraca', 3, 'Reboco e requadros',
      'Reboco interno dos quartos. Equipe reduzida por causa da chuva.', 'Chuva parou o reboco externo à tarde.', 'Eng. Júlio Andrade'),
    (v_uid, v_obra, 3, h - 10, 'Bom',         7, 'Reboco e requadros',
      'Reboco externo da fachada e requadro das janelas. Medição 4 feita com o empreiteiro.', 'Nenhuma.', 'Eng. Júlio Andrade'),
    (v_uid, v_obra, 4, h -  4, 'Bom',         6, 'Eletrodutos e caixas',
      'Passagem de fios nos quartos e na cozinha. Engenheiro da CAIXA agendou a vistoria da 4ª parcela.', 'Nenhuma.', 'Eng. Júlio Andrade'),
    (v_uid, v_obra, 5, h -  1, 'Bom',         6, 'Reboco e requadros',
      'Acabamento do reboco da sala. Porcelanato cotado para entrega na próxima semana.', 'Cliente visitou a obra e aprovou a cor da fachada.', 'Eng. Júlio Andrade');

  raise notice 'Demo 1/5 criada: % (obra_id %)', v_nome, v_obra;
end $$;

-- Conferência: o que ficou gravado nesta obra
select o.nome,
       (select count(*) from public.contratos    x where x.obra_id = o.id) as contratos,
       (select count(*) from public.medicoes     x where x.obra_id = o.id) as medicoes,
       (select count(*) from public.recebimentos x where x.obra_id = o.id) as recebimentos,
       (select count(*) from public.lancamentos  x where x.obra_id = o.id) as lancamentos,
       (select count(*) from public.materiais    x where x.obra_id = o.id) as materiais,
       (select count(*) from public.cronograma   x where x.obra_id = o.id) as etapas,
       (select count(*) from public.diario       x where x.obra_id = o.id) as diario
  from public.obras o
 where o.nome = 'Casa 07 — Residencial Jardim Aurora';
