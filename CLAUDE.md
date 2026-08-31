# CLAUDE.md — guia para quem for mexer neste projeto

Souz Controle de Obra: sistema web de gestão de obras. Nasceu de uma planilha de
controle de obra MCMV financiada pela CAIXA e virou produto. No ar em
<https://gus-hcs.github.io/souz-controle-obra/>.

Fale, escreva e comente **em português** — código, commits, respostas.

## O que o sistema faz hoje

Carteira de obras com painel consolidado · contratos e aditivos por código-base ·
medições · recebimentos da CAIXA · lançamentos · plano de materiais · cronograma
com avanço físico ponderado · curva S · fluxo de caixa · diário de obra com fotos
· alertas automáticos · relatório em PDF · importação de planilha MCMV · exportação
CSV · acesso do Power BI ao PostgreSQL.

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

## Pendências conhecidas

- **UI cega a papel.** `SUPA.papelNaObra()` / `SUPA.podeEditarObra()` existem,
  mas nenhuma tela ramifica por papel ainda, e não há tela para convidar
  engenheiro/cliente. O banco recusa a escrita indevida (RLS); a tela ainda não.
- **Sincronização e concorrência.** Ver [docs/SINCRONIZACAO.md](docs/SINCRONIZACAO.md):
  `SUPA.sincronizar()` é last-write-wins por linha inteira. Some com um usuário
  por obra; quebra com dois. Decisão pendente.

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | sobe em modo desenvolvimento |
| `npm run build` | gera `dist/index.html` — o sistema inteiro em um arquivo |
| `npm test` | conferência do motor de cálculo e da validação |
| `npm run test:e2e` | abre o sistema em navegador e percorre todas as telas |
| `npm run lint` | análise estática |
| `npm run formatar` | Prettier |
| `npm run verificar` | lint + test + build + e2e — o mesmo que a CI roda |

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
