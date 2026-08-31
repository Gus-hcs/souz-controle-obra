-- =====================================================================
--  SEED DE EXEMPLO — cria uma obra completa na conta de um usuário.
--
--  Troque o e-mail na linha abaixo pelo seu. Cole tudo no SQL Editor do
--  Supabase e clique em Run. Pode rodar de novo: apaga a obra de exemplo
--  anterior e recria.
--
--  Não precisa das migrações 0002–0005 para funcionar, mas se a 0002
--  estiver aplicada os valores aqui já respeitam os CHECK.
-- =====================================================================

do $$
declare
  v_email text := 'gustavohcs1@hotmail.com';   -- <<< seu e-mail
  v_uid   uuid;
  v_obra  text := gen_random_uuid()::text;
  hoje    date := current_date;
begin
  select id into v_uid from auth.users where lower(email) = lower(v_email);
  if v_uid is null then
    raise exception 'Nenhum usuário com o e-mail %. Veja em Authentication > Users.', v_email;
  end if;

  delete from public.obras
    where usuario_id = v_uid and nome = 'Casa 12 — Residencial Aurora';

  -- ---------------------------------------------------------------- obra
  insert into public.obras (id, usuario_id, nome, cidade, endereco, area_construida, area_muro,
      sistema, padrao, data_inicio, previsao_conclusao, responsavel, status,
      saldo_inicial, valor_terreno, valor_financiado, recursos_proprios,
      preco_empreitada_m2, custo_fisico_max_m2, valor_venda, margem_desejada,
      contrato_caixa, data_assinatura)
  values (v_obra, v_uid, 'Casa 12 — Residencial Aurora', 'Goiânia/GO', 'Rua das Acácias, 120',
      62.5, 28, 'Alvenaria convencional', 'MCMV', hoje - 180, hoje + 30, 'Gustavo Souza', 'Em andamento',
      5000, 45000, 150000, 20000,
      700, 1500, 195000, 0.15,
      '8.1234.5678901-2', hoje - 190);

  -- ------------------------------------------------------------ contratos
  insert into public.contratos (usuario_id, obra_id, ordem, codigo, codigo_base, registro, prestador,
      escopo, regime, quantidade, unidade, preco_unitario, valor_informado, inclui_material,
      inicio_previsto, fim_previsto, status)
  values
    (v_uid, v_obra, 0, 'CT-001', 'CT-001', 'Contrato', 'Marcos Empreitada', 'Empreitada principal',
      'R$/m²', 62.5, 'm²', 700, 0, 'Sim', hoje - 179, hoje + 2, 'Em andamento'),
    (v_uid, v_obra, 1, 'CT-001-A1', 'CT-001', 'Aditivo', 'Marcos Empreitada', 'Muro frontal e calçada',
      'Preço fechado', 0, 'vb', 0, 6500, 'Sim', hoje - 58, hoje - 39, 'Em andamento'),
    (v_uid, v_obra, 2, 'CT-002', 'CT-002', 'Contrato', 'Pintura Silva', 'Pintura geral',
      'Preço fechado', 0, 'vb', 0, 4200, 'Não', hoje - 8, hoje + 17, 'Planejado');

  -- ------------------------------------------------------------- medições
  insert into public.medicoes (usuario_id, obra_id, ordem, contrato_base, numero, data, descricao,
      progresso, valor_medido, desconto, data_pagamento, valor_pago, status, documento)
  values
    (v_uid, v_obra, 0, 'CT-001', '1', hoje - 161, 'Fundação e baldrame',       0.20, 12000, 500, hoje - 159, 11500, 'Pago',     'REC-01'),
    (v_uid, v_obra, 1, 'CT-001', '2', hoje - 125, 'Alvenaria e estrutura',     0.45, 15000,   0, hoje - 122, 15000, 'Pago',     'REC-02'),
    (v_uid, v_obra, 2, 'CT-001', '3', hoje -  90, 'Cobertura e reboco',        0.70, 20000,   0, hoje -  87, 20000, 'Pago',     'REC-03'),
    (v_uid, v_obra, 3, 'CT-001', '4', hoje -  20, 'Acabamento inicial',        0.85,  8000,   0, null,           0, 'Em aberto', 'REC-04');

  -- --------------------------------------------------------- recebimentos
  insert into public.recebimentos (usuario_id, obra_id, ordem, origem, numero_medicao, etapa_pci,
      data_prevista, valor_previsto, data_solicitacao, percent_obra, valor_aprovado, descontos,
      data_recebimento, valor_recebido, status)
  values
    (v_uid, v_obra, 0, 'CAIXA',   '1', 'Fundação',              hoje - 166, 30000, hoje - 165, 0.20, 30000, 250, hoje - 161, 29750, 'Recebido'),
    (v_uid, v_obra, 1, 'CAIXA',   '2', 'Alvenaria e cobertura', hoje - 136, 40000, hoje - 135, 0.45, 38000, 300, hoje - 129, 37700, 'Recebido'),
    (v_uid, v_obra, 2, 'CAIXA',   '3', 'Reboco e instalações',  hoje - 105, 45000, hoje - 104, 0.70, 45000, 320, hoje -  98, 44680, 'Recebido'),
    (v_uid, v_obra, 3, 'CAIXA',   '4', 'Acabamento',            hoje -  14, 40000, hoje -  13, 0.85,     0,   0, null,            0, 'Solicitado'),
    (v_uid, v_obra, 4, 'Cliente', '',  'Aporte para muro',      hoje -  30,  6500, null,       0,        0,   0, hoje -  28,  6500, 'Recebido');

  -- ---------------------------------------------------------- lançamentos
  insert into public.lancamentos (usuario_id, obra_id, ordem, data, tipo, etapa, categoria, descricao,
      fornecedor, documento, quantidade, unidade, preco_unitario, desconto, frete, forma_pagamento)
  values
    (v_uid, v_obra, 0, hoje - 176, 'Material',                  'Fundação',             'Cimento', 'Cimento CP II 50kg',           'Depósito Central',  'NF 1201', 40, 'saco',     38, 20, 150, 'PIX'),
    (v_uid, v_obra, 1, hoje - 175, 'Material',                  'Fundação',             'Aço',     'Aço CA-50 8mm',                'Ferro & Cia',       'NF 88',   30, 'barra',    42,  0,   0, 'Boleto'),
    (v_uid, v_obra, 2, hoje - 140, 'Material',                  'Fechamento/alvenaria', 'Bloco',   'Bloco cerâmico 9x19x39',       'Cerâmica Boa Vista','NF 455',   3, 'milheiro',950,  0, 300, 'Boleto'),
    (v_uid, v_obra, 3, hoje - 118, 'Taxa/imposto',              'Serviços preliminares','Taxas',   'ART de execução',              'CREA-GO',           'GRU 77',   1, 'serviço', 250,  0,   0, 'PIX'),
    (v_uid, v_obra, 4, hoje -  74, 'Material',                  'Fundação',             'Cimento', 'Cimento CP II 50kg',           'Depósito Central',  'NF 1399', 20, 'saco',     39,  0,   0, 'PIX'),
    (v_uid, v_obra, 5, hoje -  51, 'Fornecimento + instalação', 'Calhas e rufos',       'Calhas',  'Calhas e rufos galvanizados',  'Metal Sul',         'NF 12',    1, 'serviço',2800,100,   0, 'Transferência'),
    (v_uid, v_obra, 6, hoje -  30, 'Material',                  'Pisos e revestimentos','Piso',    'Porcelanato 60x60',            'Casa do Piso',      'NF 903',  70, 'm²',       46,  0, 180, 'Cartão'),
    (v_uid, v_obra, 7, hoje -  12, 'Honorário técnico/gestão',  'Extras',               'Gestão',  'Acompanhamento técnico mensal','Souz Engenharia',   '',         1, 'mês',     900,  0,   0, 'PIX');

  -- ------------------------------------------------------------ materiais
  insert into public.materiais (usuario_id, obra_id, ordem, etapa, material, quantidade_necessaria,
      unidade, data_necessaria, prioridade, preco_previsto, status)
  values
    (v_uid, v_obra, 0, 'Fundação',             'Cimento CP II 50kg',       80, 'saco',     hoje - 178, 'Alta',  38, 'Comprado parcial'),
    (v_uid, v_obra, 1, 'Fechamento/alvenaria', 'Bloco cerâmico 9x19x39',    5, 'milheiro', hoje - 143, 'Alta', 950, 'Comprado parcial'),
    (v_uid, v_obra, 2, 'Pisos e revestimentos','Porcelanato 60x60',        75, 'm²',       hoje -  35, 'Alta',  46, 'Comprado parcial'),
    (v_uid, v_obra, 3, 'Pintura',              'Tinta acrílica 18L',       12, 'lata',     hoje +  18, 'Média',210, 'Planejar'),
    (v_uid, v_obra, 4, 'Louças e metais',      'Kit louças e metais',       1, 'un',       hoje +  25, 'Média',1800,'Planejar');

  -- ----------------------------------------------------------- cronograma
  insert into public.cronograma (usuario_id, obra_id, ordem, etapa, inicio_previsto, fim_previsto,
      inicio_real, fim_real, progresso, quantidade_executada, unidade_producao)
  values
    (v_uid, v_obra,  0, 'Serviços preliminares',        hoje - 179, hoje - 171, hoje - 179, hoje - 169, 1.00, 62.5, 'm²'),
    (v_uid, v_obra,  1, 'Fundação',                     hoje - 170, hoje - 145, hoje - 168, hoje - 143, 1.00, 62.5, 'm²'),
    (v_uid, v_obra,  2, 'Estrutura',                    hoje - 144, hoje - 115, hoje - 142, hoje - 110, 1.00, 62.5, 'm²'),
    (v_uid, v_obra,  3, 'Fechamento/alvenaria',         hoje - 114, hoje -  79, hoje - 109, hoje -  71, 1.00, 180,  'm²'),
    (v_uid, v_obra,  4, 'Cobertura',                    hoje -  78, hoje -  54, hoje -  70, hoje -  50, 1.00, 70,   'm²'),
    (v_uid, v_obra,  5, 'Reboco e requadros',           hoje -  53, hoje -  23, hoje -  49, hoje -  18, 1.00, 120,  'm²'),
    (v_uid, v_obra,  6, 'Instalações hidrossanitárias', hoje -  50, hoje -  30, hoje -  48, hoje -  25, 1.00, 62.5, 'm²'),
    (v_uid, v_obra,  7, 'Eletrodutos e caixas',         hoje -  50, hoje -  30, hoje -  48, hoje -  24, 1.00, 62.5, 'm²'),
    (v_uid, v_obra,  8, 'Pisos e revestimentos',        hoje -  22, hoje +   3, hoje -  17, null,       0.60, 45,   'm²'),
    (v_uid, v_obra,  9, 'Forro/gesso',                  hoje -  10, hoje +   8, hoje -   6, null,       0.40, 30,   'm²'),
    (v_uid, v_obra, 10, 'Instalação elétrica final',    hoje +   0, hoje +  14, null,       null,       0.00, 0,    'm²'),
    (v_uid, v_obra, 11, 'Pintura',                      hoje +   5, hoje +  24, null,       null,       0.00, 0,    'm²'),
    (v_uid, v_obra, 12, 'Louças e metais',              hoje +  18, hoje +  28, null,       null,       0.00, 0,    'm²'),
    (v_uid, v_obra, 13, 'Calçada',                      hoje +  20, hoje +  30, null,       null,       0.00, 0,    'm²'),
    (v_uid, v_obra, 14, 'Muro',                         hoje -  58, hoje -  39, hoje -  55, hoje -  36, 1.00, 28,   'm²');

  -- --------------------------------------------------------------- diário
  insert into public.diario (usuario_id, obra_id, ordem, data, clima, efetivo, etapa, atividades, ocorrencias, autor)
  values
    (v_uid, v_obra, 0, hoje - 7, 'Bom',         5, 'Pisos e revestimentos',
      'Assentamento de porcelanato nas áreas sociais e quartos.', 'Falta rejunte — material chega quinta.', 'Júlio César'),
    (v_uid, v_obra, 1, hoje - 2, 'Chuva fraca', 3, 'Forro/gesso',
      'Montagem do forro de gesso na sala e circulação.', 'Chuva atrasou o início em duas horas.', 'Júlio César');

  raise notice 'Obra de exemplo criada para % (obra_id %)', v_email, v_obra;
end $$;
