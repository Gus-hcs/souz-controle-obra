-- =====================================================================
--  DEMO 3/5 — Sobrado 3 — Condomínio Alto da Glória (Goiânia/GO)
--  História: sobrado de ALTO PADRÃO para venda, NO COMEÇO (fundação).
--  Sem financiamento: aportes do investidor (recursos próprios). Mostra
--  empreitada com retenção de 10% e condição "sinal + medições",
--  contrato por diária, contratos futuros ainda não iniciados, plano de
--  materiais grande e cronograma longo, quase todo por fazer.
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
  v_nome  text := 'Sobrado 3 — Condomínio Alto da Glória';
  v_uid   uuid;
  v_obra  text := gen_random_uuid()::text;
  h       date := current_date;
  v_cli text; p_hor text; p_vid text; p_ser text; p_ped text; p_aux text;
  m1 text := gen_random_uuid()::text; m2 text := gen_random_uuid()::text;
  m3 text := gen_random_uuid()::text; m4 text := gen_random_uuid()::text;
  m5 text := gen_random_uuid()::text; m6 text := gen_random_uuid()::text;
  m7 text := gen_random_uuid()::text; m8 text := gen_random_uuid()::text;
  m9 text := gen_random_uuid()::text;
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
  v_cli := pg_temp.demo_cliente(v_uid, 'Paulo Henrique Arantes', 'Dr. Paulo', '(62) 90000-0203',
    'paulo.arantes@exemplo.com', '757.491.186-06', 'Instagram',
    'Investidor. Quer relatório mensal em PDF com fotos e curva S.');
  p_hor := pg_temp.demo_prestador(v_uid, 'Construtora Horizonte', 'Horizonte', 'Empreiteiro geral', 'Goiânia/GO',
    '5562900000101', null, '76.842.684/0001-30', 'financeiro@horizonte.exemplo.com', 'email', 'empreitada', 760);
  p_vid := pg_temp.demo_prestador(v_uid, 'Vidraçaria Cristal', null, 'Outro', 'Goiânia/GO',
    '5562900000112', null, '66.176.031/0001-06', 'comercial@cristal.exemplo.com', 'email', 'etapa', 0);
  p_ser := pg_temp.demo_prestador(v_uid, 'Serralheria Aço Forte', null, 'Serralheiro', 'Anápolis/GO',
    null, '556232000107', '02.685.995/0001-05', 'acoforte@exemplo.com', 'email', 'etapa', 0);
  p_ped := pg_temp.demo_prestador(v_uid, 'José Carlos Pereira', 'Zé Carlos', 'Pedreiro', 'Goiânia/GO',
    '5562900000108', null, '996.030.824-30', '996.030.824-30', 'cpf_cnpj', 'diaria', 220);
  p_aux := pg_temp.demo_prestador(v_uid, 'Marcos Vinícius Souza', 'Marquinhos', 'Servente', 'Goiânia/GO',
    '5562900000109', null, '628.194.821-12', '628.194.821-12', 'cpf_cnpj', 'diaria', 150);

  -- ---------------------------------------------------------------- obra
  insert into public.obras (id, usuario_id, nome, cliente_id, cidade, endereco, area_construida, area_muro,
      sistema, padrao, data_inicio, previsao_conclusao, responsavel, status, observacoes,
      saldo_inicial, valor_terreno, valor_financiado, recursos_proprios, preco_empreitada_m2,
      custo_fisico_max_m2, valor_venda, margem_desejada, contrato_caixa, data_assinatura)
  values (v_obra, v_uid, v_nome, v_cli, 'Goiânia/GO', 'Alameda das Palmeiras, Qd 3 Lt 3 — Alto da Glória', 168, 64,
      'Concreto armado e alvenaria', 'Alto padrão', h - 42, h + 330, 'Eng. Júlio Andrade', 'Em andamento',
      '3 suítes, pé-direito duplo na sala, área gourmet. Obra para venda.',
      20000, 185000, 0, 420000, 850, 2600, 1150000, 0.20, null, null);

  -- ----------------------------------------------------------- contratos
  insert into public.contratos (usuario_id, obra_id, ordem, codigo, codigo_base, registro, prestador, prestador_id,
      escopo, regime, forma_preco, quantidade, unidade, preco_unitario, valor_informado, inclui_material,
      inicio_previsto, fim_previsto, status, condicao_pagamento, retencao_pct, status_aditivo, observacoes)
  values
    (v_uid, v_obra, 0, 'CT-001', 'CT-001', 'Contrato', 'Construtora Horizonte', p_hor,
      'Empreitada de mão de obra — estrutura, alvenaria e reboco', 'R$/m²', 'por_m2', 168, 'm²', 850, 0, 'Não',
      h - 40, h + 260, 'Em andamento', 'sinal_mais_medicoes', 0.10, 'aprovado',
      'Retenção de 10% em cada medição, liberada na entrega da obra.'),
    (v_uid, v_obra, 1, 'CT-002', 'CT-002', 'Contrato', 'Vidraçaria Cristal', p_vid,
      'Esquadrias de alumínio e vidro temperado', 'Preço fechado', 'preco_fechado', 0, 'vb', 0, 38500, 'Sim',
      h + 150, h + 185, 'Planejado', 'sinal_mais_medicoes', 0, 'aprovado', 'Inclui material e instalação.'),
    (v_uid, v_obra, 2, 'CT-003', 'CT-003', 'Contrato', 'Serralheria Aço Forte', p_ser,
      'Portão, gradis e guarda-corpo da escada', 'Preço fechado', 'preco_fechado', 0, 'vb', 0, 21800, 'Sim',
      h + 180, h + 210, 'Planejado', 'parcelas', 0, 'aprovado', null),
    (v_uid, v_obra, 3, 'CT-004', 'CT-004', 'Contrato', 'José Carlos Pereira', p_ped,
      'Diárias de pedreiro — locação e fundação', 'Diária', 'diaria', 60, 'diária', 230, 0, 'Não',
      h - 42, h + 18, 'Em andamento', 'por_medicao', 0, 'aprovado', 'Medição quinzenal pelas diárias trabalhadas.');

  -- ------------------------------------------------------------ medições
  -- CT-001: pago 90% da medição; 10% fica retido até a entrega.
  insert into public.medicoes (usuario_id, obra_id, ordem, contrato_base, numero, data, descricao,
      progresso, valor_medido, desconto, data_pagamento, valor_pago, status, documento)
  values
    (v_uid, v_obra, 0, 'CT-004', '1', h - 28, 'Gabarito, escavação e estacas', 0.35, 4830, 0, h - 26, 4830, 'Pago',      'RPA-01'),
    (v_uid, v_obra, 1, 'CT-001', '1', h -  8, 'Sinal e canteiro de obras',     0.05, 7140, 0, h -  6, 6426, 'Parcial',   'NF 118'),
    (v_uid, v_obra, 2, 'CT-004', '2', h -  5, 'Blocos e baldrame',             0.60, 3450, 0, null,      0, 'Em aberto', 'RPA-02');

  -- -------------------------------------------------------- recebimentos
  insert into public.recebimentos (usuario_id, obra_id, ordem, origem, numero_medicao, etapa_pci,
      data_prevista, valor_previsto, data_solicitacao, percent_obra, valor_aprovado, descontos,
      data_recebimento, valor_recebido, status, observacoes)
  values
    (v_uid, v_obra, 0, 'Recursos próprios', '', 'Aporte 1 — projetos e fundação', h - 45, 120000, null, 0, 0, 0, h - 44, 120000, 'Recebido', 'TED do investidor.'),
    (v_uid, v_obra, 1, 'Recursos próprios', '', 'Aporte 2 — estrutura',           h + 20, 100000, null, 0, 0, 0, null,        0, 'Previsto', null),
    (v_uid, v_obra, 2, 'Recursos próprios', '', 'Aporte 3 — alvenaria e cobertura',h + 110,100000, null, 0, 0, 0, null,        0, 'Previsto', null),
    (v_uid, v_obra, 3, 'Recursos próprios', '', 'Aporte 4 — acabamento',          h + 230,100000, null, 0, 0, 0, null,        0, 'Previsto', null);

  -- ----------------------------------------------------------- materiais
  insert into public.materiais (id, usuario_id, obra_id, ordem, etapa, material, quantidade_necessaria,
      unidade, data_necessaria, prioridade, preco_previsto, status, observacoes)
  values
    (m1, v_uid, v_obra, 0, 'Fundação',              'Concreto usinado fck 25 MPa',       60, 'm³',       h + 25, 'Alta',   540, 'Comprado parcial', 'Segunda concretagem com a laje.'),
    (m2, v_uid, v_obra, 1, 'Fundação',              'Aço CA-50 12,5 mm',                180, 'barra',    h + 15, 'Alta',    78, 'Comprado parcial', null),
    (m3, v_uid, v_obra, 2, 'Estrutura',             'Aço CA-50 10 mm',                  220, 'barra',    h + 10, 'Alta',    52, 'Comprar', null),
    (m4, v_uid, v_obra, 3, 'Fechamento/alvenaria',  'Bloco cerâmico 14x19x39',           18, 'milheiro', h + 55, 'Alta',  1450, 'Planejar', null),
    (m5, v_uid, v_obra, 4, 'Estrutura',             'Laje treliçada com EPS',           168, 'm²',       h + 70, 'Alta',    68, 'Planejar', null),
    (m6, v_uid, v_obra, 5, 'Cobertura',             'Telha termoacústica',              120, 'm²',       h + 140,'Média',   95, 'Planejar', null),
    (m7, v_uid, v_obra, 6, 'Pisos e revestimentos', 'Porcelanato 90x90 retificado',     190, 'm²',       h + 220,'Média',  129, 'Planejar', null),
    (m8, v_uid, v_obra, 7, 'Mármores e bancadas',   'Bancadas em quartzito',              1, 'vb',       h + 250,'Média',18500, 'Planejar', null),
    (m9, v_uid, v_obra, 8, 'Louças e metais',       'Louças e metais (3 suítes + lavabo)',1, 'vb',       h + 270,'Baixa',16800, 'Planejar', null);

  -- --------------------------------------------------------- lançamentos
  insert into public.lancamentos (usuario_id, obra_id, ordem, data, tipo, etapa, categoria, descricao,
      fornecedor, prestador_id, documento, quantidade, unidade, preco_unitario, desconto, frete,
      forma_pagamento, material_id)
  values
    (v_uid, v_obra,  0, h - 58, 'Honorário técnico/gestão','Serviços preliminares','Projetos','Projeto arquitetônico e complementares','Studio Arq',        null, 'NF 331',  1, 'serviço',24000,   0,   0, 'Transferência', null),
    (v_uid, v_obra,  1, h - 50, 'Serviço avulso','Serviços preliminares', 'Topografia','Levantamento topográfico',      'Geo Topografia',          null, 'NF 87',   1, 'serviço', 1800,   0,   0, 'PIX',    null),
    (v_uid, v_obra,  2, h - 48, 'Serviço avulso','Fundação',              'Sondagem', 'Sondagem SPT (3 furos)',        'Solo Firme Sondagens',    null, 'NF 140',  1, 'serviço', 3200,   0,   0, 'PIX',    null),
    (v_uid, v_obra,  3, h - 46, 'Taxa/imposto', 'Serviços preliminares',  'Taxas',    'Alvará de construção',          'Prefeitura de Goiânia',   null, 'DAM 8821',1, 'serviço', 2400,   0,   0, 'Boleto', null),
    (v_uid, v_obra,  4, h - 46, 'Taxa/imposto', 'Serviços preliminares',  'Taxas',    'ART de execução',               'CREA-GO',                 null, 'GRU 2290',1, 'serviço',  262,   0,   0, 'PIX',    null),
    (v_uid, v_obra,  5, h - 45, 'Taxa/imposto', 'Serviços preliminares',  'Taxas',    'Aprovação do projeto no condomínio','Condomínio Alto da Glória', null, 'Boleto 12', 1, 'serviço', 850, 0, 0, 'Boleto', null),
    (v_uid, v_obra,  6, h - 40, 'Serviço avulso','Serviços preliminares', 'Locação',  'Locação de betoneira e andaimes (mês 1)','Loca Obras',     null, 'NF 2201', 1, 'mês',      950,   0,   0, 'Boleto', null),
    (v_uid, v_obra,  7, h - 36, 'Material',     'Fundação',               'Aço',      'Aço CA-50 12,5 mm',             'Ferro & Cia',             null, 'NF 1301',120, 'barra',     78, 180,   0, 'Boleto', m2),
    (v_uid, v_obra,  8, h - 30, 'Material',     'Fundação',               'Cimento',  'Cimento CP II 50 kg',           'Depósito Central',        null, 'NF 2415', 60, 'saco',      38,   0,  90, 'PIX',    null),
    (v_uid, v_obra,  9, h - 22, 'Material',     'Fundação',               'Concreto', 'Concreto usinado fck 25 MPa',   'Concreteira Centro-Oeste',null, 'NF 7780', 22, 'm³',       540,   0,   0, 'Boleto', m1),
    (v_uid, v_obra, 10, h - 20, 'Material',     'Fundação',               'Madeira',  'Tábuas e pontaletes para formas','Madeireira Ipê',         null, 'NF 4502',  1, 'vb',      4500,   0, 150, 'Transferência', null),
    (v_uid, v_obra, 11, h - 12, 'Serviço avulso','Fundação',              'Diárias',  'Diárias de servente — fundação','Marcos Vinícius Souza',   p_aux, '',      10, 'diária',   150,   0,   0, 'PIX',    null),
    (v_uid, v_obra, 12, h - 10, 'Serviço avulso','Serviços preliminares', 'Locação',  'Locação de betoneira e andaimes (mês 2)','Loca Obras',     null, 'NF 2260', 1, 'mês',      950,   0,   0, 'Boleto', null);

  -- ---------------------------------------------------------- cronograma
  insert into public.cronograma (usuario_id, obra_id, ordem, etapa, inicio_previsto, fim_previsto,
      inicio_real, fim_real, progresso, quantidade_executada, unidade_producao, responsavel, peso)
  values
    (v_uid, v_obra,  0, 'Serviços preliminares',        h -  42, h -  32, h -  42, h -  30, 1.00, 168, 'm²', 'José Carlos Pereira',    2),
    (v_uid, v_obra,  1, 'Fundação',                     h -  32, h +  12, h -  30, null,    0.60, 101, 'm²', 'José Carlos Pereira',   10),
    (v_uid, v_obra,  2, 'Estrutura',                    h +   8, h +  80, null,    null,    0.00,   0, 'm²', 'Construtora Horizonte', 16),
    (v_uid, v_obra,  3, 'Fechamento/alvenaria',         h +  60, h + 130, null,    null,    0.00,   0, 'm²', 'Construtora Horizonte', 12),
    (v_uid, v_obra,  4, 'Cobertura',                    h + 120, h + 160, null,    null,    0.00,   0, 'm²', 'Construtora Horizonte',  7),
    (v_uid, v_obra,  5, 'Instalações hidrossanitárias', h + 100, h + 200, null,    null,    0.00,   0, 'm²', null,                     6),
    (v_uid, v_obra,  6, 'Eletrodutos e caixas',         h + 100, h + 200, null,    null,    0.00,   0, 'm²', null,                     5),
    (v_uid, v_obra,  7, 'Reboco e requadros',           h + 150, h + 215, null,    null,    0.00,   0, 'm²', 'Construtora Horizonte',  7),
    (v_uid, v_obra,  8, 'Esquadrias/janelas',           h + 150, h + 185, null,    null,    0.00,   0, 'vb', 'Vidraçaria Cristal',     8),
    (v_uid, v_obra,  9, 'Pisos e revestimentos',        h + 210, h + 260, null,    null,    0.00,   0, 'm²', null,                     9),
    (v_uid, v_obra, 10, 'Forro/gesso',                  h + 220, h + 250, null,    null,    0.00,   0, 'm²', null,                     3),
    (v_uid, v_obra, 11, 'Mármores e bancadas',          h + 240, h + 265, null,    null,    0.00,   0, 'vb', null,                     4),
    (v_uid, v_obra, 12, 'Pintura',                      h + 250, h + 300, null,    null,    0.00,   0, 'm²', null,                     5),
    (v_uid, v_obra, 13, 'Instalação elétrica final',    h + 270, h + 300, null,    null,    0.00,   0, 'm²', null,                     2),
    (v_uid, v_obra, 14, 'Louças e metais',              h + 280, h + 310, null,    null,    0.00,   0, 'vb', null,                     2),
    (v_uid, v_obra, 15, 'Muro',                         h + 180, h + 215, null,    null,    0.00,   0, 'm²', 'Serralheria Aço Forte',  2),
    (v_uid, v_obra, 16, 'Calçada',                      h + 300, h + 325, null,    null,    0.00,   0, 'm²', null,                     1);

  -- -------------------------------------------------------------- diário
  insert into public.diario (usuario_id, obra_id, ordem, data, clima, efetivo, etapa, atividades, ocorrencias, autor)
  values
    (v_uid, v_obra, 0, h - 42, 'Bom',     4, 'Serviços preliminares',
      'Limpeza do terreno, barracão e ligação provisória de água e energia.', 'Nenhuma.', 'Eng. Júlio Andrade'),
    (v_uid, v_obra, 1, h - 31, 'Bom',     5, 'Serviços preliminares',
      'Gabarito conferido com o topógrafo. Locação das estacas.', 'Divisa dos fundos 12 cm fora da planta — ajustado com o condomínio.', 'Eng. Júlio Andrade'),
    (v_uid, v_obra, 2, h - 22, 'Nublado', 7, 'Fundação',
      'Concretagem das estacas e blocos (22 m³). Corpos de prova moldados.', 'Caminhão da concreteira atrasou 1 hora.', 'Eng. Júlio Andrade'),
    (v_uid, v_obra, 3, h -  6, 'Bom',     6, 'Fundação',
      'Armação e formas do baldrame. Construtora Horizonte montou canteiro para a estrutura.', 'Nenhuma.', 'Eng. Júlio Andrade');

  raise notice 'Demo 3/5 criada: % (obra_id %)', v_nome, v_obra;
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
 where o.nome = 'Sobrado 3 — Condomínio Alto da Glória';
