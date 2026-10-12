# Mudanças

## Não publicado

**Construtoras**
- A conta que se vende é a construtora (`0021`): equipe com limite de acessos
  e de obras, papéis de gestor e engenheiro, e o cliente final, que acompanha a
  obra sem ocupar vaga. O administrador do sistema cria e controla tudo em
  "Contas e acessos".
- Obra de construtora é acessada pela construtora, não por vínculo individual
  (`0023`); conta ou construtora bloqueada não lê nem grava nada; o cliente
  final não lê custo nem anexo interno pela API.
- Políticas uma por comando e avaliadas uma vez por consulta, com índices nas
  chaves estrangeiras (`0024`).

**IA**
- "Lançar pela nota" (`0027`): a foto ou o PDF da nota fiscal vira lançamentos
  conferidos. A IA não grava nada: a pessoa confere e cria. Cota por
  construtora, controlada pelo administrador.
- "Perguntar" (`0028`): a equipe pergunta sobre as obras em português e a
  resposta sai dos números do sistema. As consultas rodam no navegador, sobre
  o que a pessoa já pode ver, e todo número da resposta é conferido.
- IA indisponível (sem a chave, fora do ar, cota em zero) vira frase clara, sem
  erro técnico: a nota que já subiu vai anexada no "Lançar à mão", e cota em
  zero mostra o cadeado para o gestor em vez de um botão que falha.

**Monitor de erros**
- Erros do app chegam ao administrador (`0026`), agrupados em "Contas e
  acessos", sem dado da obra.

**Obra e lançamentos**
- Lançamento de fornecimento + instalação com a parte de mão de obra separada;
  contrato assinado anexado, em foto ou PDF (`0025`).
- Fotos do diário no Storage, como a nota fiscal: o login não baixa mais todas
  as fotos.
- Seletor de obra com busca e recentes; resumo da obra no Painel; no celular, o
  conteúdo primeiro.
- Importação da planilha MCMV provada de ponta a ponta.
- Links de termos de uso e de privacidade na tela de acesso.

**Segurança (set–out/2026)**
- Bibliotecas de CDN com versão exata e hash de integridade; CSP sem
  `'unsafe-inline'`; CSV sem fórmula.
- Bucket `site` sem as políticas abertas (`0022`).

**Testes**
- A data fica congelada na suíte: nenhum teste depende do dia em que roda
  (dois quebraram em out/2026 e travaram a publicação). `npm run test:relogio`
  roda a suíte com o relógio adiantado em 30, 90 e 365 dias.

**Responsivo**
- Corrige rótulo de coluna vazando na mensagem "nenhum registro" de qualquer
  tabela vazia no celular (a linha de estado vazio, com `colspan`, ganhava por
  engano o rótulo da 1ª coluna).
- Gantt do cronograma (`Linha do tempo`) recupera a rolagem horizontal no
  celular — tinha ficado ilegível, espremido pela mesma regra que tira a
  rolagem das tabelas (que viram cartão, diferente do gráfico).
- Medições: dois selos de status na mesma linha (ex.: "Pago" +
  "Contrato ultrapassado") agora quebram linha no celular em vez de cortar.
- Fluxo de caixa: o detalhe de "Saídas" (ex.: "medições R$ 21 mil · outras
  R$ 480") não fica mais cortado no celular — parava de quebrar por herdar o
  `nowrap` da coluna numérica.
- Tabela com poucas colunas (Clientes, Prestadores) não esticava mais até a
  borda do cartão em telas largas, deixando as colunas espalhadas com muito
  vazio entre elas. Agora a largura segue o conteúdo — tabela densa continua
  larga (e rola se precisar), tabela enxuta fica compacta.

**Segurança**
- Migração `0009_seguranca_perfis.sql`: fecha o INSERT/DELETE de `perfis` que a
  `0006` deixou aberto — dava para apagar a própria linha e recriá-la como
  admin, ou escapar de um bloqueio. Também trava `search_path` nas funções que
  faltavam.
- Edge Function `admin-usuario` concentra criar / excluir / trocar e-mail de
  login / redefinir senha — a `service_role` sai do navegador, o cadastro
  público pode ser desligado, e a função recusa a conta do próprio admin e
  outras contas de admin. (Substitui `admin-criar-usuario`.)
- Tela de Administração vira gerencial: o editor de cliente ganha troca de
  e-mail de login, redefinição de senha e exclusão de conta (com confirmação
  por digitação). Só para `perfis.admin`.
- Política de senha alinhada ao Supabase (12+ com minúscula, maiúscula, número
  e símbolo) na Edge Function, na validação do front e na senha provisória.
- Migração `0010_revoga_truncate.sql`: `revoke truncate` de anon/authenticated.
- Cliente Supabase em PKCE; reset de senha volta para a URL limpa.

**Marca**
- Paleta de marca alinhada ao Manual da Marca v1.0 (set/2026): ciano mais
  fechado (`--marca: #0E9384`, escala 300/400/500/700/900/050) no sistema
  (`src/estilo.css`) e no site (`site/index.html` / `docs/landing.html`).
- Texto sobre o preenchimento da marca passa a ser **escuro**, nunca branco —
  a regra de contraste do manual (5,41:1 no escuro, branco não passa).
- Site troca Archivo + IBM Plex Mono por **Space Grotesk + Inter + JetBrains
  Mono**, mesma trinca já usada no sistema.
- Site: o escuro deixa de seguir o `prefers-color-scheme` do visitante — a
  marca é dark-first sempre, não só para quem já está no escuro.
- Site: ritmo claro/escuro inspirado no roqt.com.br. Problema, Como começa,
  Planos e Perguntas viram seções claras (`secao-clara`); Recursos, o
  simulador de duplicidade, Módulo CAIXA e o CTA final continuam escuros.
  Números de resultado maiores (até 60px). Botões seguem o raio 7/12/16px do
  manual — sem pílula, diferente da referência.
- `fonteImagem()` filtra todo `src` de imagem vindo do banco (fotos, logos).
- CSP por `<meta>` no build, `Referrer-Policy: no-referrer`, anti-frame.
- Migração `0006_seguranca.sql`: corrige falha crítica da `0005` — o usuário
  conseguia `update perfis set admin = true` na própria linha e virar admin.
  Agora as colunas de controle (`admin`, `plano`, `bloqueado`, `abas`) só
  mudam por admin, com `REVOKE UPDATE` + gatilho + RPC dedicada.
- Funções `security definer` com `search_path` travado; `CREATE` em `public`
  bloqueado para o cliente.
- Detalhe de alerta passa a ser escapado (evita XSS entre membros da obra).
- `SECURITY.md` reescrito com a auditoria completa e o checklist do Supabase.

**Administração**
- Migração `0007_limite_obras.sql`: teto de obras por conta
  (`perfis.limite_obras`). Checado no banco (gatilho `before insert` em
  `obras`), então vale para o app, a importação e qualquer inserção. Só o
  admin define, no modal "Acesso e limites" da tela de administração.
- Migração `0005_admin_e_permissoes.sql`: `perfis` ganha `admin`, `plano`,
  `bloqueado` e `abas`; função `admin_consumo()` agrega o uso de cada cliente.
- Tela **Administração** (só para quem é admin): consumo por cliente — obras,
  contratos, medições, lançamentos, fotos, última atividade — com plano,
  bloqueio de conta e liberação de acesso por aba.
- O usuário logado só vê no menu as abas que o admin liberou; conta bloqueada
  não entra. Tudo garantido pela RLS, não só pela tela.

**Interface (em curso)**
- Tema escuro passa a ser o padrão; o claro entra só pelo botão de tema.
- Paleta reorganizada em tokens: superfícies em camadas, cor de marca separada
  da cor semântica (crítico / atenção / positivo), raio e espaçamento nomeados.
- Componentes repolidos: cartões com elevação, KPIs maiores, tabelas com linha
  de leitura mais clara, botões e campos com foco visível, topo com desfoque.
- Painel da obra redesenhado: faixa de saúde no topo (nome, status, caixa,
  avanço, prazo, pendências) e bloco "Precisa de atenção" antes do detalhe.
- Todas as tabelas ganharam **ordenação por coluna** (clique no cabeçalho, a
  escolha persiste entre filtros) e, no **celular**, cada linha vira um cartão
  com rótulo → valor.
- **Indicadores primordiais em destaque**: painel e carteira abrem com uma faixa
  de 3 KPIs grandes — saldo em caixa (com mini-gráfico de tendência), resultado
  projetado e avanço físico (com anel de progresso). Cartões de obra na carteira
  ganharam anel de avanço.
- Gráficos: preenchimento em degradê sob a curva realizada, rótulo de % no ponto
  final, linhas de grade pontilhadas, cursor na cor da marca.
- Marca do sistema (dois cubos isométricos) no rail, na tela de acesso e no
  favicon, no lugar do "S" provisório.
- Cor de marca trocada do teal para **cinza chumbo** — visual monocromático,
  com a cor reservada só para o semântico (crítico / atenção / positivo).
- Fundo preto atrás da logo, para contraste.
- Tipografia nova: **Space Grotesk** nos títulos e números, **Inter** no texto,
  JetBrains Mono no monoespaçado. A marca escreve **SouZ**.
- **Passada minimalista**: sombras discretas, chips só de contorno, cabeçalhos
  de cartão mais leves, barra lateral do KPI só quando há estado a sinalizar.
- Telas de lista (medições, recebimentos, lançamentos, materiais) enxutas:
  tabela ocupa a largura toda, só as colunas essenciais, o detalhe fica na
  edição da linha. Estados vazios com botão de ação.
- Impressão força tema claro.

**Equipe da obra**
- Migração `0004_membros_e_papeis.sql`: tabela `obra_membros` com papel
  (dono / engenheiro / cliente), funções de autorização `security definer` e
  políticas de segurança por papel em todas as tabelas da obra. Toda obra
  existente recebe um membro `dono` — nada muda para quem usa o sistema sozinho.
- `usuario_id` das linhas passa a significar "quem criou/alterou"; a correção
  em `paraLinha`/`paraApp` evita que a linha nasça com dono errado quando
  alguém que não é o dono grava.
- `SUPA.papelNaObra()` / `podeEditarObra()` / `lerMembros()` disponíveis para a
  próxima etapa (tela de equipe).
- A interface ainda não convida ninguém nem esconde botão por papel; o esquema
  está pronto e o banco recusa a escrita indevida.

**Auditoria**
- Migração `0003_auditoria.sql`: tabela `auditoria` e gatilho que registra toda
  alteração de valor financeiro em contratos, medições, recebimentos e
  lançamentos — quem mudou, de quanto para quanto e quando.
- Tela **Trilha de auditoria** por obra: somente leitura, lê o banco direto,
  fora do ciclo de sincronização. Fora do banco (acesso sem login) explica que
  o recurso exige conta.

**Integridade**
- Camada de validação de domínio (`src/dominio/validacao.js`): cada registro é
  conferido antes de gravar, com dois níveis — erro (bloqueia) e alerta (avisa).
- Migração `0002_validacao.sql`: restrições `CHECK` no banco espelhando as mesmas
  regras, aplicadas com diagnóstico prévio e sem recusar o histórico.
- Os formulários destacam o campo com problema e explicam o motivo.
- A importação de planilha avisa quando a obra traz dados fora do padrão.

**Correções**
- Teste de navegador importava o Playwright por caminho absoluto de outra
  máquina; nunca passava fora do ambiente onde foi escrito.

## 1.0.0 — 31/08/2026

Primeira versão publicada e primeira organização profissional do projeto.

**Sistema**
- Carteira de obras com painel consolidado
- Contratos e aditivos agrupados por código-base, com posição contratual
- Medições com alerta de pagamento acima do medido
- Recebimentos da CAIXA e do cliente
- Plano de materiais ligado aos lançamentos
- Cronograma com avanço físico ponderado
- Curva S física × financeira
- Diário de obra com fotos
- Alertas e pendências automáticos
- Relatório em PDF para cliente e CAIXA, exportação CSV
- Importação das planilhas MCMV existentes

**Infraestrutura**
- Banco PostgreSQL no Supabase, com segurança por usuário em todas as tabelas
- Login por e-mail e senha, multiusuário
- Publicação automática no GitHub Pages a cada push na `main`

**Engenharia**
- Código dividido em módulos ES por camada: núcleo, domínio, dados, interface,
  gráficos e entrada/saída
- Build com Vite, gerando um arquivo único
- 71 testes automatizados: o motor de cálculo é conferido contra a planilha
  MCMV de origem, célula por célula
- Teste de navegador percorrendo as 17 telas
- ESLint e Prettier
