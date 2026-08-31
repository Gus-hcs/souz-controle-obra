# Mudanças

## Não publicado

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
