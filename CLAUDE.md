# CLAUDE.md — guia para quem for mexer neste projeto

Souz Controle de Obra: sistema web de gestão de obras. Nasceu de uma planilha de
controle de obra MCMV financiada pela CAIXA e virou produto. No ar em
<https://obras.souztech.com/>.

Fale, escreva e comente **em português** — código, commits, respostas.

## O que o sistema faz hoje

Carteira de obras com painel consolidado · contratos e aditivos por código-base ·
medições · recebimentos por marco físico de **qualquer financiador** (CAIXA, outro
banco, consórcio ou o próprio cliente) · lançamentos · plano de materiais ·
cronograma com avanço físico ponderado, dependências e caminho crítico · curva S
com liberado × executado · fluxo de caixa projetado com vale de caixa · diário de
obra de campo com fotos, que funciona sem rede · pendências com tratamento e causa
raiz · pendências do cliente · nota fiscal e comprovante (foto ou PDF, no Storage) ·
relatórios em PDF com período, fotos, valores e observação, e histórico dos
gerados · importação de planilha por modelo (obras, lançamentos, prestadores,
cronograma) e da planilha MCMV · exportação CSV e Excel · acesso do Power BI ao
PostgreSQL.

O sistema atende qualquer construtora: nada na tela assume a CAIXA. O nome do
financiador vem de `obras.financiador`; vazio, a tela diz "financiador".

17 telas. JavaScript modular puro, sem framework, montado pelo Vite em um único
`index.html`.

## Arquitetura em uma frase

**O cálculo não conhece a tela, e nenhuma tela recalcula nada por conta própria.**

```
nucleo/base.js        utilitários, formatação, esquema de dados, migração
      ▼
dominio/calculos.js   toda regra de negócio — funções puras, testadas
dominio/validacao.js  toda regra de integridade — funções puras, testadas
      ▼
dados/store.js        carga, gravação e sincronização do estado
dados/supabase.js     mapa das tabelas, sincronização, telas de acesso
ui/ · graficos/ · io/ desenham a partir do que o domínio devolve
      ▼
PostgreSQL (Supabase)
```

Existe um único objeto de estado, carregado por `dados/store.js` e normalizado por
`migrar()` em `nucleo/base.js`. `migrar()` é idempotente e tolerante: aceita
estado antigo, incompleto ou corrompido e devolve algo íntegro.

A interface não tem framework nem VDOM. Cada tela é uma função que devolve HTML
como texto; `App.render()` troca o conteúdo. Eventos por delegação: um ouvinte no
documento lê `data-acao` e chama a função em `ui/acoes.js`.

## Padrão de tela

Toda tela usa as mesmas peças (`ui/telas/componentes.js`, CSS em
`ui/padrao.css`, carregado por último). Tela que precisa de um jeito diferente
disso é defeito, não exceção.

| Peça                     | O que é                                                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `faixaKpis`              | a faixa de KPIs: 3 a 5 cards de mesma largura e altura, rótulo → valor → contexto (2 linhas, texto inteiro no tooltip); card é botão só quando filtra a tela |
| `barraFiltros`           | pílulas com contagem + menu "Mais filtros"; filtro do menu ligado vira etiqueta com ×. Nenhum `<select>` nativo de filtro                                    |
| `lista`                  | a tabela ordenável; `grupos` agrupa linhas (Lançamentos por mês)                                                                                             |
| `painelAnalise`          | o fim da tela: blocos em duas colunas (uma abaixo de 1200px)                                                                                                 |
| `graficoAuto` (graficos) | gráfico desenhado na largura real do bloco; o `ResizeObserver` do shell redesenha                                                                            |

**Tabela** (toda tabela da interface — `lista`, `.tab`, `.mini-tab`; a folha A4
e os PDFs têm regra própria): tudo alinhado à esquerda — cabeçalho, linhas,
total e linha de grupo, número inclusive (`tabular-nums` mantém os dígitos na
mesma largura; `.num` não alinha à direita). Fundo de uma cor só, o do card
(`--fundo-conteudo`), sem zebra: cabeçalho e total se separam pelo fio
(`--separador-forte`) e pela cor do texto. Largura pelo conteúdo, mesma régua
de espaçamento em toda coluna. Hover e linha selecionada são estado, não
decoração. Tabela fora disso é defeito.

Contêiner único: largura toda, 24px de margem (16px no celular), sem
`max-width` local. Números na fonte do texto com `tabular-nums`. Telas de
configuração (Configuração da obra, Ajustes) gravam sozinhas ao mudar — sem
botão "Salvar". `tests/responsivo` confere KPIs iguais, área vazia à direita
e painel com rolagem lateral.

## Regras que não se quebram

1. **Toda regra de negócio (número que aparece na tela) sai de `dominio/calculos.js`.**
   Nenhuma tela faz conta própria. Cada função é conferida contra a planilha
   original em `tests/planilha.test.js`.

2. **Toda funcionalidade nova precisa de validação nas duas pontas:** regra em
   `src/dominio/validacao.js` **e** `CHECK` equivalente numa migração nova. Sem
   as duas, não está pronto. Se uma regra não puder virar `CHECK` (ex.: depende
   de lista personalizável pelo usuário, ou é situação incomum mas legítima),
   ela é um **alerta**, não um **erro** — não bloqueia gravação.

3. **Toda tabela nova precisa de isolamento por usuário via RLS.**
   Nunca crie tabela sem isolamento. Tabela ligada a uma obra: coluna `obra_id`
   e políticas por comando chamando `pode_ler_obra()` / `pode_escrever_obra()`
   (migração 0004). Tabela de cadastro do usuário: `usuario_id` e política
   `using (usuario_id = auth.uid()) with check (mesmo)`.
   `usuario_id` significa **quem criou/alterou** a linha, não "dono" — o acesso
   é pela obra, via `obra_membros`.

4. **Toda regra de negócio precisa de teste.** Cálculo se prova em `tests/`, não
   na tela.

5. **Não altere `tests/esperado.json`.** É a planilha de referência que prova que
   os cálculos estão certos. Se um número mudar, o problema está no código.

6. **Zero dependência de execução.** O `package.json` só tem `devDependencies`.
   Bibliotecas de runtime (`supabase-js`, `xlsx`, `jspdf`) são carregadas sob
   demanda por CDN, nunca empacotadas. Não adicione dependência sem combinar antes.

7. **A chave `service_role` do Supabase nunca entra no repositório** — nem
   comentada, nem em exemplo. A publicável (`sb_publishable_...` em
   `.env.production`) é pública de propósito e pode ficar.

8. **Quem publica é a CI**, no push da `main`. Não há passo manual de deploy.

9. **Achou algo errado no código existente? Avise, não contorne.** A origem é o
   que se corrige.

## Migrações

Cada arquivo em `db/migracoes/` roda uma vez, em ordem, no SQL Editor do Supabase.
Todos são escritos para rodar de novo sem quebrar (`if not exists`,
`drop policy if exists`). Ao criar uma:

- Numere em sequência (`0003_...`, `0004_...`) e descreva no `db/README.md`.
- `CHECK` em tabela com dados: adicione como `not valid` e inclua no próprio
  arquivo uma consulta de diagnóstico que lista as linhas violadoras. Quem cola
  no SQL Editor roda, confere, corrige as linhas e só então
  `alter table ... validate constraint`. Nunca uma migração que quebra no meio.
- **Quem aplica no banco de produção é o dono do projeto**, não o agente.

## Quebras de padrão conscientes

- **Tela de auditoria (`VIEWS.auditoria`)**: é somente leitura e não entra no
  ciclo do `Store` nem no `TABELAS_DB`. Tem um leitor dedicado
  (`SUPA.lerAuditoria`) porque o `Store` sincroniza por diferença e a auditoria
  nunca é escrita pela tela — só pelo gatilho do banco.
- **`obra_membros`** também fica fora do `TABELAS_DB`: `SUPA.carregarPapeis()`
  lê os papéis do usuário no login para `SUPA.papeis`, e `SUPA.lerMembros()`
  serve a futura tela de equipe. Não há gravação de membro pela tela ainda.
- **Administração (`VIEWS.admin`)**: só aparece quando `SUPA.ehAdmin` (lido do
  `perfis.admin` no login). Lê `admin_consumo()` por um leitor dedicado; grava
  em `perfis` de outros usuários por `SUPA.adminSalvarPerfil`. O controle de
  acesso por aba vive em `perfis.abas` e a RLS de `0005` — a tela só reflete
  o que o banco já garante (`SUPA.abaLiberada`, filtro no menu, guarda no
  `App.ir`).

## Vocabulário

Um termo para cada coisa, em todas as telas, PDFs e alertas:

| Use                      | Não use                                      | O que é                                                                          |
| ------------------------ | -------------------------------------------- | -------------------------------------------------------------------------------- |
| **Pendências**           | Alertas, Precisa de ação, Precisa de atenção | alerta de gravidade ≥ 2 (`pendenciasObra`); a tela `alertas` se chama Pendências |
| **Caixa hoje**           | Saldo em caixa, Saldo                        | `kpisObra().saldoCaixa`                                                          |
| **Financeiro realizado** | Avanço financeiro                            | desembolso ÷ custo previsto, em % (curva S)                                      |
| **Desembolso**           | —                                            | o mesmo, em R$ acumulados                                                        |

## Pendências conhecidas

- **Papel na tela.** O cliente vê só cronograma, diário e o relatório de status
  (`viewPermitida`, `VIEWS_CLIENTE` em `ui/shell.js`); obra em que a pessoa é
  cliente não entra na Carteira. O banco continua sendo quem garante (RLS).
- **Offline é por aparelho.** Sem rede, o que é gravado fica no localStorage e
  vai ao banco quando a rede volta (`Store`, `public/sw.js`). Com a
  carimbo de versão (abaixo), duas pessoas editando a mesma linha offline:
  quem reconecta depois recebe o aviso de conflito e a versão da outra.
- **Concorrência** resolvida por carimbo de versão (`atualizado_em`): ver
  [docs/SINCRONIZACAO.md](docs/SINCRONIZACAO.md). Conflito recarrega do banco e
  avisa; nada é sobrescrito em silêncio.

## Comandos

| Comando             | O que faz                                                |
| ------------------- | -------------------------------------------------------- |
| `npm run dev`       | sobe em modo desenvolvimento                             |
| `npm run build`     | gera `dist/index.html` — o sistema inteiro em um arquivo |
| `npm test`          | conferência do motor de cálculo e da validação           |
| `npm run test:e2e`  | abre o sistema em navegador e percorre todas as telas    |
| `npm run lint`      | análise estática                                         |
| `npm run formatar`  | Prettier                                                 |
| `npm run verificar` | lint + test + build + e2e — o mesmo que a CI roda        |

O `test:e2e` precisa do Chromium do Playwright: `npx playwright install chromium`
uma vez.

## Padrão de código

- Prettier decide o estilo: 100 colunas, aspas simples, ponto-e-vírgula,
  `trailingComma: all`, `arrowParens: always`, fim de linha `lf`.
- ESLint pega o que vira bug: variável esquecida, `==` frouxo, promise sem
  `await`, global implícito. `console.log` é aviso — use `console.error`/`warn`.
- Módulos ES. `import`/`export` nomeado, lista de exports no fim do arquivo.
- Nomes em português. Funções de domínio: substantivo + qualificador
  (`contratoSaldo`, `medicaoLiquido`). Ações de UI: verbo no infinitivo como
  chave de `ACOES` (`nova-medicao`, `salvar-form`).
- `num()` de `nucleo/base.js` para ler qualquer número (aceita "1.234,56" e
  "1,234.56"). Datas são sempre strings `AAAA-MM-DD`; use os helpers de `base.js`.
- Nada de recalcular na tela: chame o domínio.

## Ambiente

- Node 20+ (a CI usa 20). Windows: se `npm` não estiver no PATH, o Node fica em
  `C:\Program Files\nodejs`.
- Variáveis em arquivos `.env` (veja `.env.example`). `VITE_EXIGE_BANCO=true`
  força login; `false` roda local sem banco.
