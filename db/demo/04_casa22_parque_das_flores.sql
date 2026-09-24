-- =====================================================================
--  DEMO 4/5 — Casa 22 — Residencial Parque das Flores (Aparecida de Goiânia/GO)
--  História: casa MCMV QUASE ENTREGUE (~95%). Empreitada, elétrica e
--  hidráulica encerradas e AVALIADAS (notas de prazo, qualidade e
--  organização que alimentam a ficha do prestador). Piso medido 100% com
--  saldo a pagar, pintura em andamento, última parcela da CAIXA
--  solicitada. Margem saudável — é a obra que mostra o resultado.
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
  v_nome  text := 'Casa 22 — Residencial Parque das Flores';
  v_uid   uuid;
  v_obra  text := gen_random_uuid()::text;
  h       date := current_date;
  v_cli text; p_hor text; p_ele text; p_hid text; p_rev text; p_pin text;
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
  v_cli := pg_temp.demo_cliente(v_uid, 'Luciana Ferreira Borges', 'Luciana', '(62) 90000-0204',
    'luciana.borges@exemplo.com', '252.760.189-87', 'Feirão da CAIXA',
    'Mudança marcada para o mês que vem. Pediu vistoria de entrega com checklist.');
  p_hor := pg_temp.demo_prestador(v_uid, 'Construtora Horizonte', 'Horizonte', 'Empreiteiro geral', 'Goiânia/GO',
    '5562900000101', null, '76.842.684/0001-30', 'financeiro@horizonte.exemplo.com', 'email', 'empreitada', 760);
  p_ele := pg_temp.demo_prestador(v_uid, 'Elétrica Luz Forte', null, 'Eletricista', 'Goiânia/GO',
    '5562900000103', null, '65.632.122/0001-46', 'pix@luzforte.exemplo.com', 'email', 'etapa', 0);
  p_hid := pg_temp.demo_prestador(v_uid, 'Hidráulica Santos', 'Seu Santos', 'Encanador', 'Aparecida de Goiânia/GO',
    '5562900000104', null, '083.016.613-05', '083.016.613-05', 'cpf_cnpj', 'etapa', 0);
  p_rev := pg_temp.demo_prestador(v_uid, 'Revest Pisos e Acabamentos', null, 'Azulejista', 'Aparecida de Goiânia/GO',
    '5562900000110', null, '28.907.866/0001-08', 'revest@exemplo.com', 'email', 'm2', 38);
  p_pin := pg_temp.demo_prestador(v_uid, 'Pinturas Oliveira', null, 'Pintor', 'Goiânia/GO',
    '5562900000105', null, '186.091.390-34', 'oliveira.pinturas@exemplo.com', 'email', 'm2', 28);

  -- ---------------------------------------------------------------- obra
  insert into public.obras (id, usuario_id, nome, cliente_id, cidade, endereco, area_construida, area_muro,
      sistema, padrao, data_inicio, previsao_conclusao, responsavel, status, observacoes,
      saldo_inicial, valor_terreno, valor_financiado, recursos_proprios, preco_empreitada_m2,
      custo_fisico_max_m2, valor_venda, margem_desejada, contrato_caixa, data_assinatura)
  values (v_obra, v_uid, v_nome, v_cli, 'Aparecida de Goiânia/GO', 'Rua das Orquídeas, Qd 9 Lt 22 — Parque das Flores', 62, 30,
      'Alvenaria convencional', 'MCMV', h - 270, h + 12, 'Eng. Júlio Andrade', 'Em andamento',
      'Reta final: pintura, louças e limpeza. Habite-se protocolado.',
      10000, 52000, 185000, 22000, 740, 2300, 262000, 0.15, '8.4455.0034567-8', h - 280);

  -- ----------------------------------------------------------- contratos
  insert into public.contratos (usuario_id, obra_id, ordem, codigo, codigo_base, registro, prestador, prestador_id,
      escopo, regime, forma_preco, quantidade, unidade, preco_unitario, valor_informado, inclui_material,
      inicio_previsto, fim_previsto, status, condicao_pagamento, retencao_pct, status_aditivo,
      data_encerramento, aval_prazo, aval_qualidade, aval_organizacao, observacoes)
  values
    (v_uid, v_obra, 0, 'CT-001', 'CT-001', 'Contrato', 'Construtora Horizonte', p_hor,
      'Empreitada de mão de obra — fundação ao reboco', 'R$/m²', 'por_m2', 62, 'm²', 740, 0, 'Não',
      h - 268, h - 25, 'Concluído', 'por_medicao', 0, 'aprovado', h - 20, 5, 4, 5,
      'Entregou 5 dias antes do prazo.'),
    (v_uid, v_obra, 1, 'CT-002', 'CT-002', 'Contrato', 'Elétrica Luz Forte', p_ele,
      'Instalação elétrica completa', 'Preço fechado', 'preco_fechado', 0, 'vb', 0, 7200, 'Não',
      h - 150, h - 40, 'Concluído', 'parcelas', 0, 'aprovado', h - 38, 4, 5, 4, null),
    (v_uid, v_obra, 2, 'CT-003', 'CT-003', 'Contrato', 'Hidráulica Santos', p_hid,
      'Instalações hidrossanitárias e fossa', 'Preço fechado', 'preco_fechado', 0, 'vb', 0, 6300, 'Não',
      h - 150, h - 45, 'Concluído', 'por_medicao', 0, 'aprovado', h - 45, 3, 4, 4,
      'Atrasou 10 dias por falta de material; serviço bem feito.'),
    (v_uid, v_obra, 3, 'CT-004', 'CT-004', 'Contrato', 'Revest Pisos e Acabamentos', p_rev,
      'Assentamento de piso e revestimento', 'Preço unitário', 'preco_unitario', 115, 'm²', 38, 0, 'Não',
      h - 60, h - 28, 'Em andamento', 'por_medicao', 0, 'aprovado', null, 0, 0, 0, null),
    (v_uid, v_obra, 4, 'CT-005', 'CT-005', 'Contrato', 'Pinturas Oliveira', p_pin,
      'Pintura interna e externa', 'Preço unitário', 'preco_unitario', 240, 'm²', 26, 0, 'Não',
      h - 22, h + 8, 'Em andamento', 'por_medicao', 0, 'aprovado', null, 0, 0, 0, null);

  -- ------------------------------------------------------------ medições
  insert into public.medicoes (usuario_id, obra_id, ordem, contrato_base, numero, data, descricao,
      progresso, valor_medido, desconto, data_pagamento, valor_pago, status, documento)
  values
    (v_uid, v_obra,  0, 'CT-001', '1', h - 240, 'Fundação e baldrame',          0.20, 9180, 0, h - 237, 9180, 'Pago', 'REC-01'),
    (v_uid, v_obra,  1, 'CT-001', '2', h - 200, 'Estrutura e alvenaria',        0.45, 11470, 0, h - 197, 11470, 'Pago', 'REC-02'),
    (v_uid, v_obra,  2, 'CT-001', '3', h - 150, 'Cobertura',                    0.65, 9175, 0, h - 147, 9175, 'Pago', 'REC-03'),
    (v_uid, v_obra,  3, 'CT-001', '4', h -  95, 'Reboco e contrapiso',          0.85, 9175, 0, h -  92, 9175, 'Pago', 'REC-04'),
    (v_uid, v_obra,  4, 'CT-001', '5', h -  30, 'Arremates finais',             1.00, 6880, 0, h -  25, 6880, 'Pago', 'REC-05'),
    (v_uid, v_obra,  5, 'CT-002', '1', h - 120, 'Tubulação e caixas',           0.50, 3600, 0, h - 117, 3600, 'Pago', 'REC-06'),
    (v_uid, v_obra,  6, 'CT-002', '2', h -  42, 'Fiação, quadro e acabamentos', 1.00, 3600, 0, h -  40, 3600, 'Pago', 'REC-07'),
    (v_uid, v_obra,  7, 'CT-003', '1', h - 125, 'Esgoto, água e fossa',         0.60, 3780, 0, h - 122, 3780, 'Pago', 'REC-08'),
    (v_uid, v_obra,  8, 'CT-003', '2', h -  46, 'Ramais, louças e testes',      1.00, 2520, 0, h -  44, 2520, 'Pago', 'REC-09'),
    (v_uid, v_obra,  9, 'CT-004', '1', h -  45, 'Piso da área social',          0.55, 2403.5, 0, h - 42, 2403.5, 'Pago', 'REC-10'),
    (v_uid, v_obra, 10, 'CT-004', '2', h -  12, 'Quartos, banheiro e rodapé',   1.00, 1966.5, 0, h -  9,  600, 'Parcial', 'REC-11'),
    (v_uid, v_obra, 11, 'CT-005', '1', h -   7, 'Massa e primeira demão',       0.70, 4368, 0, null,        0, 'Em aberto', 'REC-12');

  -- -------------------------------------------------------- recebimentos
  insert into public.recebimentos (usuario_id, obra_id, ordem, origem, numero_medicao, etapa_pci,
      data_prevista, valor_previsto, data_solicitacao, percent_obra, valor_aprovado, descontos,
      data_recebimento, valor_recebido, status, observacoes)
  values
    (v_uid, v_obra, 0, 'Cliente', '',  'Entrada do cliente (recursos próprios)', h - 270, 22000, null, 0, 0, 0, h - 268, 22000, 'Recebido', null),
    (v_uid, v_obra, 1, 'CAIXA',  '1', 'Fundação',                h - 245, 37000, h - 247, 0.20, 37000, 260, h - 239, 36740, 'Recebido', null),
    (v_uid, v_obra, 2, 'CAIXA',  '2', 'Estrutura e alvenaria',   h - 205, 46250, h - 207, 0.45, 46250, 324, h - 199, 45926, 'Recebido', null),
    (v_uid, v_obra, 3, 'CAIXA',  '3', 'Cobertura e instalações', h - 155, 37000, h - 157, 0.65, 37000, 259, h - 149, 36741, 'Recebido', null),
    (v_uid, v_obra, 4, 'CAIXA',  '4', 'Reboco e revestimentos',  h -  90, 27750, h -  93, 0.80, 27750, 194, h -  85, 27556, 'Recebido', null),
    (v_uid, v_obra, 5, 'CAIXA',  '5', 'Acabamento e habite-se',  h +  15, 37000, h -   3, 1.00,     0,   0, null,       0, 'Solicitado', 'Aguardando habite-se para a vistoria final.');

  -- ----------------------------------------------------------- materiais
  insert into public.materiais (id, usuario_id, obra_id, ordem, etapa, material, quantidade_necessaria,
      unidade, data_necessaria, prioridade, preco_previsto, status, observacoes)
  values
    (m1, v_uid, v_obra, 0, 'Fundação',              'Cimento CP II 50 kg',            150, 'saco',     h - 262, 'Alta',   37, 'Comprado', null),
    (m2, v_uid, v_obra, 1, 'Fechamento/alvenaria',  'Bloco cerâmico 9x19x39',         6.5, 'milheiro', h - 215, 'Alta',  950, 'Comprado', null),
    (m3, v_uid, v_obra, 2, 'Cobertura',             'Telha cerâmica',                1700, 'un',       h - 165, 'Alta',  2.8, 'Comprado', null),
    (m4, v_uid, v_obra, 3, 'Pisos e revestimentos', 'Porcelanato 60x60',              115, 'm²',       h -  62, 'Alta',   46, 'Comprado', null),
    (m5, v_uid, v_obra, 4, 'Pintura',               'Tinta acrílica 18 L',             12, 'lata',     h -  24, 'Alta',  229, 'Comprado', null),
    (m6, v_uid, v_obra, 5, 'Louças e metais',       'Kit louças e metais',              1, 'un',       h -  15, 'Média',1850, 'Comprado', null),
    (m7, v_uid, v_obra, 6, 'Instalação elétrica final','Luminárias, tomadas e interruptores', 1, 'vb', h +   3, 'Alta',  980, 'Comprar', 'Cliente escolheu as luminárias na loja.'),
    (m8, v_uid, v_obra, 7, 'Calçada',               'Concreto para calçada',            3, 'm³',       h +   6, 'Média', 480, 'Planejar', null);

  -- --------------------------------------------------------- lançamentos
  insert into public.lancamentos (usuario_id, obra_id, ordem, data, tipo, etapa, categoria, descricao,
      fornecedor, prestador_id, documento, quantidade, unidade, preco_unitario, desconto, frete,
      forma_pagamento, material_id)
  values
    (v_uid, v_obra,  0, h - 266, 'Taxa/imposto', 'Serviços preliminares', 'Taxas',    'ART de execução',            'CREA-GO',                  null, 'GRU 977',  1, 'serviço', 262, 0,   0, 'PIX',    null),
    (v_uid, v_obra,  1, h - 265, 'Taxa/imposto', 'Serviços preliminares', 'Taxas',    'Alvará de construção',       'Prefeitura de Aparecida',  null, 'DAM 1432', 1, 'serviço', 720, 0,   0, 'Boleto', null),
    (v_uid, v_obra,  2, h - 262, 'Material',     'Fundação',              'Cimento',  'Cimento CP II 50 kg',        'Depósito Central',         null, 'NF 1650', 150, 'saco',    37, 60, 180, 'PIX',   m1),
    (v_uid, v_obra,  3, h - 260, 'Material',     'Fundação',              'Aço',      'Aço CA-50 10 mm',            'Ferro & Cia',              null, 'NF 802',  45, 'barra',   50,  0,   0, 'Boleto', null),
    (v_uid, v_obra,  4, h - 258, 'Material',     'Fundação',              'Agregados','Areia e brita',              'Areal Meia Ponte',         null, 'NF 51',   14, 'm³',     125,  0, 200, 'PIX',    null),
    (v_uid, v_obra,  5, h - 215, 'Material',     'Fechamento/alvenaria',  'Bloco',    'Bloco cerâmico 9x19x39',     'Cerâmica Boa Vista',       null, 'NF 2988',6.5, 'milheiro',950, 0, 350, 'Boleto', m2),
    (v_uid, v_obra,  6, h - 165, 'Material',     'Cobertura',             'Telha',    'Telha cerâmica',             'Telhas Goiás',             null, 'NF 702', 1700, 'un',    2.8,  0, 250, 'Boleto', m3),
    (v_uid, v_obra,  7, h - 163, 'Material',     'Cobertura',             'Madeira',  'Madeiramento do telhado',    'Madeireira Ipê',           null, 'NF 3901',  1, 'vb',    3850,  0,   0, 'Transferência', null),
    (v_uid, v_obra,  8, h - 118, 'Material',     'Instalações hidrossanitárias','Hidráulica','Tubos e conexões',    'Casa do Encanador',        null, 'NF 1105',  1, 'vb',    1520,  0,   0, 'Cartão', null),
    (v_uid, v_obra,  9, h - 116, 'Material',     'Eletrodutos e caixas',  'Elétrica', 'Eletrodutos, caixas e fios', 'Eletro Norte',             null, 'NF 488',   1, 'vb',    2310,  0,   0, 'Cartão', null),
    (v_uid, v_obra, 10, h -  96, 'Material',     'Reboco e requadros',    'Argamassa','Argamassa e cal',            'Depósito Central',         null, 'NF 1802', 80, 'saco',    23,  0,  90, 'PIX',    null),
    (v_uid, v_obra, 11, h -  80, 'Fornecimento + instalação','Fossa e sumidouro','Fossa','Fossa séptica e sumidouro','Pré-Moldados Goiás',   null, 'NF 355',   1, 'serviço',4100, 0,   0, 'Boleto', null),
    (v_uid, v_obra, 12, h -  70, 'Material',     'Esquadrias/janelas',    'Esquadrias','Janelas de alumínio com vidro','Vidraçaria Cristal',    null, 'NF 612',   6, 'un',     470,  0,   0, 'Boleto', null),
    (v_uid, v_obra, 13, h -  68, 'Material',     'Portas',                'Portas',   'Portas e batentes',          'Madeireira Ipê',           null, 'NF 3977',  5, 'un',     390,  0,   0, 'PIX',    null),
    (v_uid, v_obra, 14, h -  62, 'Material',     'Pisos e revestimentos', 'Piso',     'Porcelanato 60x60',          'Casa do Piso',             null, 'NF 1109',115, 'm²',      46,  0, 220, 'Boleto', m4),
    (v_uid, v_obra, 15, h -  55, 'Fornecimento + instalação','Calhas e rufos','Calhas','Calhas e rufos galvanizados','Metal Sul',              null, 'NF 21',    1, 'serviço',2900, 0,   0, 'Transferência', null),
    (v_uid, v_obra, 16, h -  50, 'Material',     'Forro/gesso',           'Forro',    'Forro de PVC instalado',     'Forros Goiás',             null, 'NF 440',  58, 'm²',      42,  0,   0, 'Cartão', null),
    (v_uid, v_obra, 17, h -  24, 'Material',     'Pintura',               'Tinta',    'Tinta acrílica 18 L',        'Tintas Aparecida',         null, 'NF 2044', 12, 'lata',   229,  0,   0, 'Cartão', m5),
    (v_uid, v_obra, 18, h -  15, 'Material',     'Louças e metais',       'Louças',   'Kit louças e metais',        'Casa do Encanador',        null, 'NF 1290',  1, 'un',    1850,  0,   0, 'Cartão', m6),
    (v_uid, v_obra, 19, h -  10, 'Honorário técnico/gestão','Extras',     'Gestão',   'Acompanhamento técnico — mês 9','Souz Engenharia',       null, '',         1, 'mês',   1200,  0,   0, 'PIX',    null),
    (v_uid, v_obra, 20, h -   5, 'Taxa/imposto', 'Extras',                'Taxas',    'Taxa de habite-se',          'Prefeitura de Aparecida',  null, 'DAM 1990', 1, 'serviço', 380, 0,   0, 'Boleto', null);

  -- ---------------------------------------------------------- cronograma
  insert into public.cronograma (usuario_id, obra_id, ordem, etapa, inicio_previsto, fim_previsto,
      inicio_real, fim_real, progresso, quantidade_executada, unidade_producao, responsavel, peso)
  values
    (v_uid, v_obra,  0, 'Serviços preliminares',        h - 270, h - 262, h - 270, h - 261, 1.00,  62, 'm²', 'Construtora Horizonte', 3),
    (v_uid, v_obra,  1, 'Fundação',                     h - 262, h - 238, h - 261, h - 236, 1.00,  62, 'm²', 'Construtora Horizonte',12),
    (v_uid, v_obra,  2, 'Estrutura',                    h - 238, h - 212, h - 236, h - 210, 1.00,  62, 'm²', 'Construtora Horizonte',12),
    (v_uid, v_obra,  3, 'Fechamento/alvenaria',         h - 212, h - 180, h - 210, h - 178, 1.00, 170, 'm²', 'Construtora Horizonte',14),
    (v_uid, v_obra,  4, 'Cobertura',                    h - 175, h - 150, h - 172, h - 148, 1.00,  74, 'm²', 'Construtora Horizonte',10),
    (v_uid, v_obra,  5, 'Instalações hidrossanitárias', h - 150, h -  45, h - 148, h -  45, 1.00,  62, 'm²', 'Hidráulica Santos',     7),
    (v_uid, v_obra,  6, 'Eletrodutos e caixas',         h - 150, h -  40, h - 148, h -  42, 1.00,  62, 'm²', 'Elétrica Luz Forte',    6),
    (v_uid, v_obra,  7, 'Reboco e requadros',           h - 140, h -  90, h - 138, h -  92, 1.00, 180, 'm²', 'Construtora Horizonte', 9),
    (v_uid, v_obra,  8, 'Esquadrias/janelas',           h -  72, h -  60, h -  70, h -  61, 1.00,   6, 'un', null,                    4),
    (v_uid, v_obra,  9, 'Pisos e revestimentos',        h -  60, h -  28, h -  58, h -  12, 1.00, 115, 'm²', 'Revest Pisos e Acabamentos', 9),
    (v_uid, v_obra, 10, 'Forro/gesso',                  h -  52, h -  40, h -  50, h -  42, 1.00,  58, 'm²', null,                    4),
    (v_uid, v_obra, 11, 'Pintura',                      h -  22, h +   8, h -  22, null,    0.70, 168, 'm²', 'Pinturas Oliveira',     6),
    (v_uid, v_obra, 12, 'Instalação elétrica final',    h -   5, h +   6, h -   3, null,    0.40,  25, 'm²', 'Elétrica Luz Forte',    2),
    (v_uid, v_obra, 13, 'Louças e metais',              h -  10, h +   5, h -   8, null,    0.50,  31, 'm²', 'Hidráulica Santos',     3),
    (v_uid, v_obra, 14, 'Calçada',                      h +   2, h +  10, null,    null,    0.00,   0, 'm²', 'Construtora Horizonte', 2),
    (v_uid, v_obra, 15, 'Muro',                         h - 110, h -  95, h - 108, h -  96, 1.00,  30, 'm²', 'Construtora Horizonte', 3);

  -- -------------------------------------------------------------- diário
  insert into public.diario (usuario_id, obra_id, ordem, data, clima, efetivo, etapa, atividades, ocorrencias, autor)
  values
    (v_uid, v_obra, 0, h - 45, 'Bom',     4, 'Instalações hidrossanitárias',
      'Teste de estanqueidade aprovado. Hidráulica encerrada.', 'Nenhuma.', 'Eng. Júlio Andrade'),
    (v_uid, v_obra, 1, h - 20, 'Bom',     3, 'Pisos e revestimentos',
      'Rodapés e rejunte finalizados. Empreitada principal encerrada e avaliada.', 'Nenhuma.', 'Eng. Júlio Andrade'),
    (v_uid, v_obra, 2, h - 12, 'Nublado', 4, 'Pintura',
      'Massa corrida nos quartos; primeira demão na sala.', 'Revest mediu o restante do piso; pago parcial.', 'Eng. Júlio Andrade'),
    (v_uid, v_obra, 3, h -  5, 'Bom',     5, 'Louças e metais',
      'Instalação de bacia, lavatório e torneiras. Protocolo do habite-se.', 'Nenhuma.', 'Eng. Júlio Andrade'),
    (v_uid, v_obra, 4, h -  1, 'Bom',     5, 'Pintura',
      'Segunda demão interna e início da fachada.', 'Cliente fez vistoria e pediu retoque na porta do banheiro.', 'Eng. Júlio Andrade');

  raise notice 'Demo 4/5 criada: % (obra_id %)', v_nome, v_obra;
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
 where o.nome = 'Casa 22 — Residencial Parque das Flores';
