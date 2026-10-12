# Estado atual — Souz Controle de Obra

Diagnóstico de 12/10/2026, feito lendo o código, rodando os comandos de
verificação e consultando o banco de produção só para leitura. Nenhum código
foi alterado e nada foi commitado. Este arquivo é o único criado.

Como ler: "verificado" quer dizer que rodei ou consultei nesta data. Onde não
consegui confirmar, está escrito.

## 1. Resumo em 10 linhas

1. O sistema está no ar em <https://obras.souztech.com/>, na versão `13aae16`
   (publicada em 03/10/2026). O site responde e a publicação daquele dia
   funcionou.
2. **A CI está quebrada hoje:** `npm test` tem 2 testes falhando (754 de 756
   passam). Eles dependem da data do relógio e começaram a falhar por volta de
   07–08/10. A `main` tem o mesmo código, então o próximo push ou merge na
   `main` não publica.
3. Lint passa sem aviso. Build passa (702 kB, um arquivo). O Playwright passa:
   18 telas abrem sem exceção.
4. **A IA não funciona em produção.** A função `ia` está publicada, mas falta o
   secret `ANTHROPIC_API_KEY` no painel do Supabase: em 12/10 ela respondeu 503
   e a tabela de uso está vazia. A leitura de nota fiscal está no site e nunca
   completou uma leitura.
5. O assistente "Perguntar" está pronto na branch `ia-pergunte-a-obra`, sem
   merge. O banco já recebeu a migração dele (0028) e a função já tem o código.
   Faltam o merge, a chave e a cota de perguntas (hoje 0).
6. Há mais duas branches prontas e paradas desde 29/09: `importacao-mcmv` e
   `termos-e-privacidade`. Nenhuma das três tem conflito com a `main`.
7. O banco de produção confere com as migrações: 20 tabelas, todas com RLS;
   5 visões; 45 funções; nenhuma regra (`CHECK`) pendente de validação.
8. Estável: cálculo, validação, RLS por obra e por construtora, sincronização
   com carimbo de versão, fotos e notas no Storage.
9. Não existe ambiente de homologação. As migrações são aplicadas à mão direto
   em produção.
10. Produção tem 2 contas, 2 construtoras e 11 obras. Não há cliente pagante e
    os preços dos planos não foram decididos.

## 2. Estrutura

| Pasta | O que faz |
|---|---|
| `src/nucleo/base.js` | utilitários, formatação, esquema do estado e `migrar()` (normaliza estado antigo ou corrompido) |
| `src/dominio/calculos.js` | toda regra de negócio, funções puras (3.986 linhas) |
| `src/dominio/validacao.js` | toda regra de integridade; espelha os `CHECK` do banco |
| `src/dominio/assistente.js` | ferramentas do "Perguntar", que rodam no navegador (só nesta branch) |
| `src/dados/store.js` | estado único, gravação local e sincronização |
| `src/dados/supabase.js` | mapa das tabelas (`TABELAS_DB`), carga, acesso, chamadas de função |
| `src/dados/erros.js` | captura erros do app e grava em `erros_app` |
| `src/ui/` | `shell.js` (menu e topo), `acoes.js` (ações por delegação), `telas-*.js` e `telas/` (23 arquivos), CSS |
| `src/graficos/` | gráficos em SVG, sem biblioteca |
| `src/io/` | PDF, Excel, CSV e importação de planilha; bibliotecas por CDN com versão e SRI |
| `supabase/functions/admin-usuario` | cria, apaga e altera conta (usa a `service_role` injetada pelo runtime) |
| `supabase/functions/ia` | `index.ts` (invólucro Deno), `leitura.js` (nota fiscal), `perguntas.js` ("Perguntar") |
| `db/migracoes/` | 28 migrações SQL, de `0001` a `0028` |
| `db/bancada/` | provas de acesso (RLS) num Postgres local em memória |
| `tests/` | 52 arquivos de teste (Vitest), o teste de navegador `fumaca.e2e.mjs`, a suíte `responsivo/` e as avaliações reais da IA em `tests/ia/` |
| `public/` | `sw.js` (modo sem rede) e `CNAME` |
| `.github/workflows/` | `deploy.yml` (verifica e publica) e `responsivo.yml` (fora da publicação) |
| `docs/` | `ARQUITETURA.md`, `OPERACAO.md`, `SINCRONIZACAO.md` |

JavaScript puro em módulos ES, sem framework. O Vite monta tudo em um
`index.html`. O `package.json` só tem `devDependencies`.

## 3. Funcionalidades

"Testado" quer dizer que há teste automático da regra ou da tela. Nenhuma
funcionalidade tem teste automático contra o banco real.

**Existe e funciona**

| Funcionalidade | Situação |
|---|---|
| Carteira de obras e painel consolidado | testado |
| Contratos, aditivos e medições | testado |
| Recebimentos por marco físico, qualquer financiador | testado |
| Lançamentos, com parte de mão de obra separada | testado |
| Plano de materiais | testado |
| Cronograma com dependências e caminho crítico | testado |
| Curva S e fluxo de caixa projetado | testado (conferidos contra a planilha em `tests/planilha.test.js`) |
| Diário de obra com fotos no Storage | testado |
| Pendências, tratamento e causa raiz; pendências do cliente | testado, mas é onde estão os 2 testes que falham hoje |
| Construtoras, papéis, cliente final, limites | testado (telas e bancada de acesso) |
| Sincronização com carimbo de versão e modo sem rede | testado em unidade; não testado em navegador real |
| Monitor de erros do app | testado |
| Exportação CSV | testado |
| Importação por modelo de planilha | testado em parte |
| Relatórios em PDF | não testado (a geração usa `jspdf` do CDN; só as regras de conteúdo têm teste) |
| Exportação Excel | não testado |
| Service worker (`public/sw.js`) | não testado |
| Função `admin-usuario` | não testado |
| Visões SQL para o Power BI (`vw_*`) | não testado |

**Existe, mas é frágil**

- Leitura de nota fiscal por IA: no site, com testes e avaliação real (10 de 10
  notas inventadas), mas **não funciona em produção** por falta da chave e
  nunca foi testada com uma nota de verdade.
- Testes com data fixa: ver item 6.1.
- Tela "Contas e acessos" (admin): fora do teste de navegador; só tem teste em
  `jsdom`.

**Pronto, sem merge**

- "Perguntar" (branch `ia-pergunte-a-obra`).
- Importação da planilha MCMV provada de ponta a ponta (branch
  `importacao-mcmv`; a importação em si já está na `main`, a branch traz a
  prova e ajustes).
- Links de termos de uso e privacidade no login (branch
  `termos-e-privacidade`).

**Planejado e não feito**

- Diário preenchido por texto com IA.
- Texto do relatório redigido por IA.
- Painel "O que olhar hoje".
- Importação de documentos da CAIXA e leitura de fotos (só ideia).
- Tela de equipe com gravação de membro (`obra_membros` hoje só lê).

## 4. Banco e Supabase

**Na pasta `db/migracoes`:** 28 arquivos, de `0001_estrutura_inicial` a
`0028_ia_perguntas`. A última é a 0028; a próxima livre é a 0029.

**Em produção (verificado por consulta de leitura):**

- PostgreSQL 17.6.
- 20 tabelas, todas com RLS ligada: `alertas_tratamento`, `auditoria`,
  `clientes`, `contratos`, `cronograma`, `diario`, `empresas`, `erros_app`,
  `ia_config`, `ia_uso`, `lancamentos`, `materiais`, `medicoes`,
  `obra_membros`, `obras`, `pendencias_cliente`, `perfis`, `prestadores`,
  `recebimentos`, `relatorios_gerados`.
- Políticas: 4 por tabela (uma por comando) na maioria; `erros_app` 3;
  `perfis` 2; `auditoria`, `ia_config` e `ia_uso` 1 (só leitura pela API).
- 5 visões, todas com `security_invoker=on`: `vw_contratos`,
  `vw_fluxo_mensal`, `vw_lancamentos`, `vw_posicao_contratual`,
  `vw_resumo_obra`.
- 45 funções, 42 `SECURITY DEFINER`, todas com `search_path` fixo. Nenhuma
  executável por anônimo.
- 118 `CHECK`, nenhum pendente de validação. 29 gatilhos. 67 índices.
- Storage: bucket `anexos` privado (10 MB, só JPG, PNG, WebP e PDF, 4
  políticas, 5 arquivos) e bucket `site` **público, sem política e vazio**
  (ver 6.6).
- As 10 funções da 0028 têm o mesmo código do arquivo (comparei o hash; em
  `ia_reservar` só faltam 3 comentários).

**Edge Functions em produção:** `admin-usuario` (versão 1) e `ia` (versão 2,
com os 3 arquivos iguais aos desta branch). As duas exigem JWT.

**O histórico de migrações do Supabase não é confiável.** Ele começa na 0015 e
não lista a 0027, que foi aplicada em blocos por SQL direto. A 0027 foi
conferida pelo catálogo, não pelo histórico. A fonte da verdade é
`db/migracoes`.

**O que o código espera e não está em produção:** o secret
`ANTHROPIC_API_KEY`. Não consigo ler secrets; deduzi pela resposta 503 da
função, que só sai nessa condição (`supabase/functions/ia/index.ts:58`).

**Não consegui confirmar no painel:** backups e plano do projeto,
configurações de Auth além do que o aviso de segurança mostra, e quais
secrets existem.

## 5. IA

**Implementado**

| Parte | Onde | Situação |
|---|---|---|
| Cota e uso por construtora ou conta | `ia_config`, `ia_uso` (0027, 0028) | em produção |
| Função `ia` | `supabase/functions/ia/` | publicada, versão 2 |
| Leitura de nota fiscal (foto ou PDF → lançamentos conferidos) | `leitura.js`, `src/ui/telas/nota-ia.js`, funções em `calculos.js` e `validacao.js` | na `main` e no site |
| "Perguntar" (perguntas sobre as obras) | `perguntas.js`, `src/dominio/assistente.js`, `src/ui/telas/assistente.js` | só na branch |
| Tela de cotas do administrador | `src/ui/telas-cadastros.js` | na `main`; o campo de perguntas só na branch |
| Testes | 6 arquivos `tests/ia-*.test.js`, 68 testes | passam |
| Avaliação com a IA real (fora da CI) | `tests/ia/avaliar.mjs`, `tests/ia/avaliar-perguntas.mjs` | última rodada: 10/10 notas, 26/26 perguntas (não repeti hoje) |

Como funciona: a chave fica só no servidor. A IA não grava nada; ela devolve
uma proposta e a pessoa confirma. Quem pede reserva a cota com o próprio
token, então a RLS vale. No "Perguntar", as consultas rodam no navegador sobre
os dados já carregados e todo número da resposta é conferido contra esses
dados. Modelo: `claude-sonnet-5`.

**Com problema**

- Secret `ANTHROPIC_API_KEY` ausente em produção: nada de IA funciona no site.
- `ia_uso` com 0 linhas: nenhuma chamada real completou.
- Cota de perguntas da única construtora com IA ligada: 0.
- O invólucro `index.ts` não tem teste automático (só o núcleo em JS).

**Falta**

- Merge de `ia-pergunte-a-obra`.
- Teste com nota fiscal de verdade.
- Diário por texto, texto do relatório, "O que olhar hoje".
- Decidir preço e cotas dos planos (o código só tem cota configurável).

## 6. Débitos técnicos e riscos

### Crítico

1. **Testes dependem do relógio e travam a publicação.**
   `tests/casa14.fixture.js:17` fixa `HOJE = '2026-09-25'`, mas
   `alertasObra` usa a data real (`src/dominio/calculos.js:1630`). Falham
   `tests/cliente-e-fornecedor.test.js:45` e `:84`. A publicação depende do
   job de verificação (`.github/workflows/deploy.yml`). 14 arquivos de teste
   usam essa fixture e `calculos.js` chama `hojeISO()` em 53 lugares: outros
   testes podem quebrar com o tempo.
2. **IA no ar sem chave.** O botão de leitura de nota aparece para o usuário e
   falha. Ver seção 5.
3. **Sem homologação, com exclusão em cascata.** Migração vai direto para
   produção. Excluir uma obra apaga contratos, medições, lançamentos,
   materiais, cronograma, diário e mais 4 tabelas (`on delete cascade`,
   confirmado em produção). Não há lixeira. A recuperação depende do backup do
   Supabase, que não consegui verificar.

### Importante

4. **Carga de tudo no login.** `SUPA.carregar()`
   (`src/dados/supabase.js:873`) lê todas as tabelas de `TABELAS_DB` inteiras,
   em páginas de 1.000, e monta o estado na memória. Com 11 obras não pesa;
   cresce com a carteira.
5. **Dados da obra no aparelho, sem cifra.** O estado inteiro vai para o
   `localStorage` (`src/dados/store.js:110`). Aparelho compartilhado ou
   perdido expõe custos. O limite do navegador (cerca de 5 MB) também limita o
   modo sem rede; há aviso quando enche.
6. **Bucket `site` ainda existe e é público.** A 0022 tirou as políticas (sem
   elas, ninguém envia nem lista), mas apagar o bucket é passo manual no
   painel e não foi feito.
7. **Proteção contra senha vazada desligada** no Auth (aviso do Supabase).
8. **Histórico de migrações incompleto** (seção 4): não dá para reconstruir o
   banco pelo histórico.
9. **Concorrência.** Não é mais "última gravação vence": há carimbo de versão
   (`docs/SINCRONIZACAO.md`, `src/dados/store.js:179`). O que resta: em
   conflito, quem chega depois recebe a versão da outra pessoa e perde a
   própria edição daquela linha; o modo sem rede é por aparelho.
10. **Três branches prontas e paradas.** Sem conflito hoje, mas divergem a
    cada dia.
11. **Funções com a `service_role` sem teste.** `admin-usuario` cria e apaga
    conta e não tem teste automático.
12. **LGPD.** Termos e privacidade fora do ar (branch parada) e documentos
    pendentes.

### Baixo

13. **29 funções `SECURITY DEFINER` executáveis por usuário logado** (aviso do
    Supabase). É intencional: são os auxiliares da RLS e as `admin_*`, que
    conferem a permissão por dentro. Prova em `db/bancada/acesso.mjs`.
14. **Fotos em base64.** Resolvido para o caso normal: vão para o Storage.
    Ficam em base64 só sem rede, até a próxima abertura com rede
    (`src/ui/anexos.js:126`), e a logo da empresa fica em data URI no banco.
15. **`npm audit`: 5 vulnerabilidades altas**, todas em ferramentas de
    desenvolvimento (`vite-plugin-singlefile`, `micromatch`, `braces`,
    `brace-expansion`, `source-map-js`). Nada disso vai para o navegador. Duas
    saem com `npm audit fix`; as outras três pedem rebaixar o
    `vite-plugin-singlefile` para 0.9.0.
16. **CORS `*` nas duas Edge Functions** (`supabase/functions/ia/index.ts:37`,
    `admin-usuario/index.ts:25`). As duas exigem JWT.
17. **Node local 24, CI 20.**
18. **39 arquivos de `src` fora do Prettier** e `calculos.js` com quase 4 mil
    linhas. Formatar em massa estoura o diff.
19. **Pacotes soltos em `node_modules`** (restos de instalação sem salvar para
    a bancada e a avaliação). `npm ci` limpa.
20. **Dependências com versão nova disponível:** `vite` 6.4.3 (há 8.x),
    `eslint` 9 (há 10), `jsdom` 25 (há 30). Sem urgência.

## 7. Deploy

- **Como:** push na `main` dispara `.github/workflows/deploy.yml`: lint,
  testes, build, teste de navegador e publicação no GitHub Pages. Pull request
  roda a verificação e não publica. Não há passo manual.
- **Domínio:** `obras.souztech.com` (`public/CNAME`).
- **Último deploy:** funcionou. O site está em `13aae16`, com data de
  03/10/2026 04:43 UTC, um minuto depois do merge do PR #18. Não consegui
  abrir o histórico do GitHub Actions (o `gh` não está instalado).
- **Próximo deploy:** vai falhar no passo de testes enquanto o item 6.1 não
  for corrigido.
- **Banco e funções:** fora da CI. Migração é colada à mão; função é publicada
  pelo conector do Supabase.
- **Variáveis (só nomes):**
  - Build (arquivos `.env.*`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON`
    (chave publicável, pública de propósito), `VITE_EXIGE_BANCO`,
    `VITE_VERSAO` (a CI preenche com o commit).
  - Edge Functions: `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
    `SUPABASE_SERVICE_ROLE_KEY` (injetadas pelo Supabase) e
    `ANTHROPIC_API_KEY` (secret manual, **ausente**).
  - Local: `supabase/.env` com `ANTHROPIC_API_KEY`, ignorado pelo git.
  - A CI não usa nenhum secret.
- **Segredos no repositório:** procurei chave da Anthropic, chave secreta do
  Supabase e JWT nos arquivos e em todo o histórico. Nada encontrado.

## 8. Próximos passos

1. **Corrigir os testes que dependem do relógio.** Sem isso nenhum merge
   publica.
2. **Cadastrar `ANTHROPIC_API_KEY` no painel do Supabase e testar com uma nota
   de verdade.** O recurso já está à vista do usuário e falha.
3. **Juntar as três branches** (`ia-pergunte-a-obra`, `importacao-mcmv`,
   `termos-e-privacidade`) e definir a cota de perguntas. É trabalho pronto
   parado.
4. **Fechar o painel:** apagar o bucket `site`, ligar a proteção contra senha
   vazada e confirmar que há backup. São minutos e fecham riscos de segurança
   e de perda de dados.
5. **Criar um projeto Supabase de homologação.** Hoje toda migração é testada
   em produção.

## 9. Dúvidas e inconsistências

**Não consegui verificar**

- Histórico do GitHub Actions e se há pull request aberto para as branches.
- Backups, plano e secrets do Supabase.
- A bancada de acesso (`db/bancada/acesso.mjs`): não rodei hoje porque exige
  instalar pacotes. O último resultado que tenho é 176 de 176, de 04/10.
- A suíte de responsividade: não rodei hoje.
- Cobertura de testes em porcentagem: não medi.
- Uso real: o último registro da trilha de auditoria é de 27/09/2026.

**Documentação × código**

- `CLAUDE.md` diz "17 telas"; o código tem 19 (`VIEWS`), 18 no teste de
  navegador mais a de administração.
- `CLAUDE.md` desta branch descreve o "Perguntar" como algo que o sistema faz
  hoje; ele não está no ar.
- `CLAUDE.md` e a memória do projeto citam a concorrência e as fotos como
  resolvidas, o que confere com o código. Quem ainda fala em "última gravação
  vence" e "fotos em base64" está desatualizado.
- `SECURITY.md` fala em 301 testes e em uma atualização do `vitest` pendente;
  hoje são 756 testes e o `vitest` já é o 5.
- `CHANGELOG.md` parou: não cita construtoras, monitor de erros nem IA.
- `package.json` descreve o sistema como "gestão de obras MCMV… recebimentos
  CAIXA"; o `CLAUDE.md` diz que nada assume a CAIXA.
- `db/README.md` lista as migrações até a 0028, mas a seção "Aplicadas em
  produção" (linha 401) para na 0020 e ainda diz que falta aplicar
  `chk_obra_padrao`. Em produção a regra já está aplicada e validada, e as
  migrações 0021 a 0028 também.

---

Gerado em 12/10/2026, 01:45 (horário de Brasília).
Commit: `a448286d803da500da5a06a1a5689c7a3b5f355b`, branch
`ia-pergunte-a-obra`, sem alterações locais além deste arquivo.
