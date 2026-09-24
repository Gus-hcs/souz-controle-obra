-- =====================================================================
--  DEMO 2/5 — Casa 14 — Vila Nova Esperança (Anápolis/GO)
--  História: casa MCMV COM PROBLEMAS. Prazo vencido, empreiteiro
--  atrasado, chuva parou a obra e ele pediu aditivo de prazo (proposto),
--  cliente pediu troca do forro (acréscimo proposto), calçada saiu do
--  escopo (supressão aprovada). Medição em aberto há 45 dias, telhado
--  medido 100% e pago só em parte, gesseiro não começou, parcela da
--  CAIXA atrasada sem retorno, caixa negativo, um lançamento lançado duas
--  vezes e rejunte vencido sem compra.
--  É a obra que acende os alertas e o painel de pendências.
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
  v_nome  text := 'Casa 14 — Vila Nova Esperança';
  v_uid   uuid;
  v_obra  text := gen_random_uuid()::text;
  h       date := current_date;
  v_cli text; p_ant text; p_tel text; p_ges text; p_ser text;
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
  v_cli := pg_temp.demo_cliente(v_uid, 'Rafael e Juliana Moreira', 'Juliana', '(62) 90000-0202',
    'juliana.moreira@exemplo.com', '543.231.948-97', 'Corretor parceiro',
    'Casal com bebê chegando: entrega atrasada é tema sensível. Juliana é quem decide.');
  p_ant := pg_temp.demo_prestador(v_uid, 'Antônio Ribeiro', 'Toninho', 'Empreiteiro geral', 'Anápolis/GO',
    '5562900000102', null, '526.018.159-06', '526.018.159-06', 'cpf_cnpj', 'empreitada', 720);
  p_tel := pg_temp.demo_prestador(v_uid, 'Telhados Cardoso', null, 'Carpinteiro', 'Anápolis/GO',
    '5562900000111', null, '993.518.190-19', 'cardoso.telhados@exemplo.com', 'email', 'etapa', 0);
  p_ges := pg_temp.demo_prestador(v_uid, 'Gesso Arte', null, 'Gesseiro', 'Goiânia/GO',
    '5562900000106', null, '33.079.244/0001-60', 'gessoarte@exemplo.com', 'email', 'm2', 45);
  p_ser := pg_temp.demo_prestador(v_uid, 'Marcos Vinícius Souza', 'Marquinhos', 'Servente', 'Goiânia/GO',
    '5562900000109', null, '628.194.821-12', '628.194.821-12', 'cpf_cnpj', 'diaria', 150);

  -- ---------------------------------------------------------------- obra
  insert into public.obras (id, usuario_id, nome, cliente_id, cidade, endereco, area_construida, area_muro,
      sistema, padrao, data_inicio, previsao_conclusao, responsavel, status, observacoes,
      saldo_inicial, valor_terreno, valor_financiado, recursos_proprios, preco_empreitada_m2,
      custo_fisico_max_m2, valor_venda, margem_desejada, contrato_caixa, data_assinatura)
  values (v_obra, v_uid, v_nome, v_cli, 'Anápolis/GO', 'Rua 7, Qd 12 Lt 14 — Vila Nova Esperança', 52, 26,
      'Alvenaria convencional', 'MCMV', h - 240, h - 10, 'Eng. Júlio Andrade', 'Em andamento',
      'Prazo de entrega vencido. Renegociar com o empreiteiro e avisar a CAIXA.',
      3000, 42000, 150000, 18000, 720, 1200, 205000, 0.15, '8.4455.0023456-1', h - 250);

  -- ----------------------------------------------------------- contratos
  insert into public.contratos (usuario_id, obra_id, ordem, codigo, codigo_base, registro, prestador, prestador_id,
      escopo, regime, forma_preco, quantidade, unidade, preco_unitario, valor_informado, inclui_material,
      inicio_previsto, fim_previsto, status, condicao_pagamento, retencao_pct,
      tipo_aditivo, status_aditivo, motivo_aditivo, data_aprovacao_aditivo, novo_prazo_aditivo, observacoes)
  values
    (v_uid, v_obra, 0, 'CT-001', 'CT-001', 'Contrato', 'Antônio Ribeiro', p_ant,
      'Empreitada de mão de obra — obra completa', 'R$/m²', 'por_m2', 52, 'm²', 720, 0, 'Não',
      h - 236, h - 30, 'Em andamento', 'por_medicao', 0, null, 'aprovado', null, null, null,
      'Empreiteiro com equipe reduzida desde as chuvas.'),
    (v_uid, v_obra, 1, 'CT-001-A1', 'CT-001', 'Aditivo', 'Antônio Ribeiro', p_ant,
      'Prorrogação de prazo', 'Preço fechado', 'preco_fechado', 0, 'vb', 0, 0, 'Não',
      null, null, 'Em andamento', 'por_medicao', 0, 'prazo', 'proposto',
      'Chuvas de março pararam a obra por 18 dias; empreiteiro pede prazo novo.', null, h + 25, null),
    (v_uid, v_obra, 2, 'CT-001-A2', 'CT-001', 'Aditivo', 'Antônio Ribeiro', p_ant,
      'Troca do forro de PVC por gesso', 'Preço fechado', 'preco_fechado', 0, 'vb', 0, 3200, 'Não',
      null, null, 'Em andamento', 'por_medicao', 0, 'acrescimo', 'proposto',
      'Cliente pediu forro de gesso no lugar do PVC na sala e nos quartos.', null, null, null),
    (v_uid, v_obra, 3, 'CT-001-A3', 'CT-001', 'Aditivo', 'Antônio Ribeiro', p_ant,
      'Calçada lateral fora do escopo', 'Preço fechado', 'preco_fechado', 0, 'vb', 0, 1500, 'Não',
      null, null, 'Em andamento', 'por_medicao', 0, 'supressao', 'aprovado',
      'Calçada lateral saiu do escopo: o cliente vai fazer depois da entrega.', h - 95, null, null),
    (v_uid, v_obra, 4, 'CT-002', 'CT-002', 'Contrato', 'Telhados Cardoso', p_tel,
      'Estrutura do telhado e cobertura', 'Preço fechado', 'preco_fechado', 0, 'vb', 0, 7800, 'Não',
      h - 150, h - 110, 'Concluído', 'por_medicao', 0, null, 'aprovado', null, null, null,
      'Serviço entregue; falta quitar a última medição.'),
    (v_uid, v_obra, 5, 'CT-003', 'CT-003', 'Contrato', 'Gesso Arte', p_ges,
      'Forro de gesso', 'Preço unitário', 'preco_unitario', 52, 'm²', 45, 0, 'Não',
      h - 20, h + 10, 'Planejado', 'por_medicao', 0, null, 'aprovado', null, null, null,
      'Aguardando a sala ficar livre do reboco para começar.');

  -- ------------------------------------------------------------ medições
  insert into public.medicoes (usuario_id, obra_id, ordem, contrato_base, numero, data, descricao,
      progresso, valor_medido, desconto, data_pagamento, valor_pago, status, documento)
  values
    (v_uid, v_obra, 0, 'CT-001', '1', h - 205, 'Fundação',                    0.22, 7900, 0, h - 202, 7900, 'Pago',      'REC-01'),
    (v_uid, v_obra, 1, 'CT-001', '2', h - 160, 'Alvenaria e estrutura',       0.48, 9350, 0, h - 157, 9350, 'Pago',      'REC-02'),
    (v_uid, v_obra, 2, 'CT-001', '3', h - 100, 'Laje e reboco externo',       0.70, 7900, 0, h -  96, 7900, 'Pago',      'REC-03'),
    (v_uid, v_obra, 3, 'CT-001', '4', h -  45, 'Reboco interno e contrapiso', 0.85, 5400, 0, null,       0, 'Em aberto', 'REC-04'),
    (v_uid, v_obra, 4, 'CT-002', '1', h - 128, 'Madeiramento',                0.50, 3900, 0, h - 125, 3900, 'Pago',      'REC-05'),
    (v_uid, v_obra, 5, 'CT-002', '2', h - 108, 'Telhamento concluído',        1.00, 3900, 0, h - 100, 2300, 'Parcial',   'REC-06');

  -- -------------------------------------------------------- recebimentos
  insert into public.recebimentos (usuario_id, obra_id, ordem, origem, numero_medicao, etapa_pci,
      data_prevista, valor_previsto, data_solicitacao, percent_obra, valor_aprovado, descontos,
      data_recebimento, valor_recebido, status, observacoes)
  values
    (v_uid, v_obra, 0, 'Cliente', '',  'Entrada do cliente (recursos próprios)', h - 240, 18000, null, 0, 0, 0, h - 238, 18000, 'Recebido', null),
    (v_uid, v_obra, 1, 'CAIXA',  '1', 'Fundação',               h - 210, 30000, h - 212, 0.20, 30000, 210,   h - 204, 29790,   'Recebido', null),
    (v_uid, v_obra, 2, 'CAIXA',  '2', 'Estrutura e alvenaria',  h - 165, 37500, h - 167, 0.45, 37500, 262.5, h - 158, 37237.5, 'Recebido', null),
    (v_uid, v_obra, 3, 'CAIXA',  '3', 'Cobertura e reboco',     h -  40, 37500, h -  45, 0.70,     0,   0,   null,          0, 'Solicitado', 'Vistoria feita; laudo ainda não saiu. Cobrar o engenheiro da CAIXA.'),
    (v_uid, v_obra, 4, 'CAIXA',  '4', 'Acabamento e habite-se', h +  30, 45000, null,    1.00,     0,   0,   null,          0, 'Previsto', null);

  -- ----------------------------------------------------------- materiais
  insert into public.materiais (id, usuario_id, obra_id, ordem, etapa, material, quantidade_necessaria,
      unidade, data_necessaria, prioridade, preco_previsto, status, observacoes)
  values
    (m1, v_uid, v_obra, 0, 'Fundação',              'Cimento CP II 50 kg',         100, 'saco',     h - 230, 'Alta',   37, 'Comprado parcial', null),
    (m2, v_uid, v_obra, 1, 'Fundação',              'Aço CA-50 10 mm',              40, 'barra',    h - 228, 'Alta',   51, 'Comprado', null),
    (m3, v_uid, v_obra, 2, 'Fechamento/alvenaria',  'Bloco cerâmico 9x19x39',      5.5, 'milheiro', h - 192, 'Alta',  960, 'Comprado', null),
    (m4, v_uid, v_obra, 3, 'Cobertura',             'Telha cerâmica',             1500, 'un',       h - 152, 'Alta',  2.8, 'Comprado', null),
    (m5, v_uid, v_obra, 4, 'Pisos e revestimentos', 'Porcelanato 60x60',            60, 'm²',       h -  72, 'Alta',   47, 'Comprado', null),
    (m6, v_uid, v_obra, 5, 'Louças e metais',       'Kit louças e metais',           1, 'un',       h -  16, 'Média',1890, 'Comprado', null),
    (m7, v_uid, v_obra, 6, 'Pisos e revestimentos', 'Rejunte e argamassa AC-III',   40, 'saco',     h -   6, 'Alta',   31, 'Comprar', 'Piso parado esperando o rejunte.'),
    (m8, v_uid, v_obra, 7, 'Pintura',               'Tinta acrílica 18 L',           9, 'lata',     h +   8, 'Média', 235, 'Planejar', null);

  -- --------------------------------------------------------- lançamentos
  insert into public.lancamentos (usuario_id, obra_id, ordem, data, tipo, etapa, categoria, descricao,
      fornecedor, prestador_id, documento, quantidade, unidade, preco_unitario, desconto, frete,
      forma_pagamento, material_id)
  values
    (v_uid, v_obra,  0, h - 232, 'Taxa/imposto', 'Serviços preliminares', 'Taxas',    'ART de execução',               'CREA-GO',                 null, 'GRU 1043', 1, 'serviço', 262, 0,   0, 'PIX',    null),
    (v_uid, v_obra,  1, h - 230, 'Taxa/imposto', 'Serviços preliminares', 'Taxas',    'Alvará de construção',          'Prefeitura de Anápolis',  null, 'DAM 2210', 1, 'serviço', 650, 0,   0, 'Boleto', null),
    (v_uid, v_obra,  2, h - 228, 'Material',     'Fundação',              'Cimento',  'Cimento CP II 50 kg',           'Casa do Construtor Anápolis', null, 'NF 5010', 90, 'saco', 37, 0, 150, 'PIX', m1),
    (v_uid, v_obra,  3, h - 226, 'Material',     'Fundação',              'Aço',      'Aço CA-50 10 mm',               'Ferro & Cia',             null, 'NF 1033', 40, 'barra',    51, 0,   0, 'Boleto', m2),
    (v_uid, v_obra,  4, h - 224, 'Material',     'Fundação',              'Agregados','Areia e brita',                 'Areal Anápolis',          null, 'NF 318',  10, 'm³',      130, 0, 200, 'PIX',    null),
    (v_uid, v_obra,  5, h - 190, 'Material',     'Fechamento/alvenaria',  'Bloco',    'Bloco cerâmico 9x19x39',        'Cerâmica Anápolis',       null, 'NF 781', 5.5, 'milheiro',960, 0, 300, 'Boleto', m3),
    (v_uid, v_obra,  6, h - 150, 'Material',     'Cobertura',             'Telha',    'Telha cerâmica',                'Telhas Goiás',            null, 'NF 901',1500, 'un',      2.8, 0, 220, 'Boleto', m4),
    (v_uid, v_obra,  7, h - 148, 'Material',     'Cobertura',             'Madeira',  'Madeiramento do telhado',       'Madeireira Anápolis',     null, 'NF 66',    1, 'vb',     3600, 0,   0, 'Transferência', null),
    (v_uid, v_obra,  8, h - 120, 'Material',     'Reboco e requadros',    'Argamassa','Argamassa e cal',               'Casa do Construtor Anápolis', null, 'NF 5122', 70, 'saco', 23, 0, 0, 'PIX', null),
    (v_uid, v_obra,  9, h -  90, 'Material',     'Instalações hidrossanitárias','Hidráulica','Tubos e conexões',       'Casa do Encanador',       null, 'NF 1402',  1, 'vb',     1650, 0,   0, 'Cartão', null),
    (v_uid, v_obra, 10, h -  88, 'Material',     'Eletrodutos e caixas',  'Elétrica', 'Eletrodutos e fios',            'Eletro Norte',            null, 'NF 610',   1, 'vb',     2380, 0,   0, 'Cartão', null),
    (v_uid, v_obra, 11, h -  70, 'Material',     'Pisos e revestimentos', 'Piso',     'Porcelanato 60x60',             'Casa do Piso',            null, 'NF 1205', 60, 'm²',       47, 0, 180, 'Boleto', m5),
    (v_uid, v_obra, 12, h -  70, 'Material',     'Pisos e revestimentos', 'Piso',     'Porcelanato 60x60',             'Casa do Piso',            null, 'NF 1205', 60, 'm²',       47, 0, 180, 'Boleto', null),
    (v_uid, v_obra, 13, h -  60, 'Material',     'Esquadrias/janelas',    'Esquadrias','Janelas de alumínio',          'Vidraçaria Anápolis',     null, 'NF 230',   6, 'un',      470, 0,   0, 'Boleto', null),
    (v_uid, v_obra, 14, h -  55, 'Material',     'Portas',                'Portas',   'Portas e batentes',             'Madeireira Anápolis',     null, 'NF 71',    5, 'un',      380, 0,   0, 'PIX',    null),
    (v_uid, v_obra, 15, h -  52, 'Fornecimento + instalação','Calhas e rufos','Calhas','Calhas e rufos galvanizados', 'Metal Sul',               null, 'NF 18',    1, 'serviço',3400, 0,   0, 'Transferência', null),
    (v_uid, v_obra, 16, h -  48, 'Fornecimento + instalação','Fossa e sumidouro','Fossa','Fossa séptica e sumidouro', 'Pré-Moldados Goiás',      null, 'NF 402',   1, 'serviço',4200, 0,   0, 'Boleto', null),
    (v_uid, v_obra, 17, h -  45, 'Material',     'Muro',                  'Bloco',    'Blocos e argamassa do muro',    'Cerâmica Anápolis',       null, 'NF 812',   1, 'vb',     2600, 0,   0, 'PIX',    null),
    (v_uid, v_obra, 18, h -  40, 'Honorário técnico/gestão','Extras',     'Gestão',   'Acompanhamento técnico — mês 7','Souz Engenharia',         null, '',         1, 'mês',    1200, 0,   0, 'PIX',    null),
    (v_uid, v_obra, 19, h -  35, 'Serviço avulso','Extras',               'Diárias',  'Diárias de servente — limpeza da obra', 'Marcos Vinícius Souza', p_ser, '', 6, 'diária', 150, 0, 0, 'PIX', null),
    (v_uid, v_obra, 20, h -  20, 'Comissão imobiliária','Extras',         'Comissão', 'Comissão do corretor (3%)',     'Imobiliária Lar Feliz',   null, 'RPA 55',   1, 'serviço',6150, 0,   0, 'Transferência', null),
    (v_uid, v_obra, 21, h -  18, 'Material',     'Pintura',               'Tinta',    'Massa corrida e selador',       'Tintas Anápolis',         null, 'NF 3390',  1, 'vb',     2300, 0,   0, 'Cartão', null),
    (v_uid, v_obra, 22, h -  15, 'Material',     'Louças e metais',       'Louças',   'Kit louças e metais',           'Casa do Encanador',       null, 'NF 1488',  1, 'un',     1890, 0,   0, 'Cartão', m6);

  -- ---------------------------------------------------------- cronograma
  insert into public.cronograma (usuario_id, obra_id, ordem, etapa, inicio_previsto, fim_previsto,
      inicio_real, fim_real, progresso, quantidade_executada, unidade_producao, responsavel, peso)
  values
    (v_uid, v_obra,  0, 'Serviços preliminares',        h - 240, h - 232, h - 238, h - 229, 1.00,  52, 'm²', 'Antônio Ribeiro',   3),
    (v_uid, v_obra,  1, 'Fundação',                     h - 232, h - 210, h - 229, h - 200, 1.00,  52, 'm²', 'Antônio Ribeiro',  12),
    (v_uid, v_obra,  2, 'Estrutura',                    h - 210, h - 185, h - 200, h - 170, 1.00,  52, 'm²', 'Antônio Ribeiro',  12),
    (v_uid, v_obra,  3, 'Fechamento/alvenaria',         h - 185, h - 160, h - 170, h - 140, 1.00, 150, 'm²', 'Antônio Ribeiro',  14),
    (v_uid, v_obra,  4, 'Cobertura',                    h - 150, h - 110, h - 130, h - 105, 1.00,  64, 'm²', 'Telhados Cardoso', 10),
    (v_uid, v_obra,  5, 'Reboco e requadros',           h - 110, h -  40, h - 100, null,    0.90, 150, 'm²', 'Antônio Ribeiro',   9),
    (v_uid, v_obra,  6, 'Instalações hidrossanitárias', h -  95, h -  35, h -  92, null,    0.80,  42, 'm²', 'Antônio Ribeiro',   7),
    (v_uid, v_obra,  7, 'Eletrodutos e caixas',         h -  95, h -  35, h -  90, null,    0.75,  39, 'm²', 'Antônio Ribeiro',   6),
    (v_uid, v_obra,  8, 'Pisos e revestimentos',        h -  45, h -  10, h -  30, null,    0.30,  18, 'm²', 'Antônio Ribeiro',   9),
    (v_uid, v_obra,  9, 'Forro/gesso',                  h -  20, h +  10, null,    null,    0.00,   0, 'm²', 'Gesso Arte',        4),
    (v_uid, v_obra, 10, 'Pintura',                      h +   5, h +  25, null,    null,    0.00,   0, 'm²', null,                6),
    (v_uid, v_obra, 11, 'Louças e metais',              h +  15, h +  25, null,    null,    0.00,   0, 'un', null,                3),
    (v_uid, v_obra, 12, 'Muro',                         h -  50, h -  35, h -  48, h -  33, 1.00,  26, 'm²', 'Antônio Ribeiro',   3);

  -- -------------------------------------------------------------- diário
  insert into public.diario (usuario_id, obra_id, ordem, data, clima, efetivo, etapa, atividades, ocorrencias, autor)
  values
    (v_uid, v_obra, 0, h - 190, 'Chuva forte',  0, 'Fechamento/alvenaria',
      'Obra parada.', 'Chuva forte o dia todo; alvenaria do quarto 2 descoberta ficou encharcada.', 'Eng. Júlio Andrade'),
    (v_uid, v_obra, 1, h - 186, 'Impraticável', 0, 'Fechamento/alvenaria',
      'Obra parada.', 'Quarto dia seguido sem trabalhar. Empreiteiro avisou que vai pedir prazo.', 'Eng. Júlio Andrade'),
    (v_uid, v_obra, 2, h -  72, 'Bom',          4, 'Pisos e revestimentos',
      'Recebido o porcelanato. Início do contrapiso da sala.', 'Nota do porcelanato lançada em duplicidade — conferir com o financeiro.', 'Eng. Júlio Andrade'),
    (v_uid, v_obra, 3, h -  45, 'Nublado',      3, 'Reboco e requadros',
      'Medição 4 do empreiteiro (reboco interno e contrapiso).', 'Equipe reduzida: só 3 pessoas. Empreiteiro diz que falta mão de obra.', 'Eng. Júlio Andrade'),
    (v_uid, v_obra, 4, h -  12, 'Bom',          2, 'Pisos e revestimentos',
      'Assentamento do piso na cozinha.', 'Piso parou: falta rejunte (compra atrasada). Cliente ligou cobrando a entrega.', 'Eng. Júlio Andrade'),
    (v_uid, v_obra, 5, h -   2, 'Bom',          3, 'Reboco e requadros',
      'Retoques de reboco no banheiro.', 'Reunião com a cliente: nova data depende da aprovação do aditivo de prazo.', 'Eng. Júlio Andrade');

  raise notice 'Demo 2/5 criada: % (obra_id %)', v_nome, v_obra;
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
 where o.nome = 'Casa 14 — Vila Nova Esperança';
