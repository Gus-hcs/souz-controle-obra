# Souz Controle de Obra

Sistema web de gestão de obras MCMV: carteira de obras, contratos e aditivos,
medições, recebimentos da CAIXA, plano de materiais, lançamentos, cronograma,
curva S física × financeira, diário de obra com fotos, alertas automáticos e
relatório em PDF para cliente e para a CAIXA.

**No ar:** <https://gus-hcs.github.io/souz-controle-obra/>

---

## Como rodar

```bash
npm install          # uma vez
npm run dev          # servidor de desenvolvimento, com recarga automática
```

| Comando | O que faz |
|---|---|
| `npm run dev` | sobe o sistema em modo desenvolvimento |
| `npm run build` | gera `dist/index.html` — o sistema inteiro em um arquivo |
| `npm run preview` | serve o que foi construído, para conferir antes de publicar |
| `npm test` | roda a conferência do motor de cálculo contra a planilha |
| `npm run test:watch` | o mesmo, reexecutando a cada alteração |
| `npm run test:e2e` | abre o sistema em navegador e percorre todas as telas |
| `npm run lint` | análise estática |
| `npm run formatar` | formata o código |
| `npm run verificar` | tudo acima, em sequência — o mesmo que a CI roda |

## Estrutura

```
src/
  nucleo/base.js          utilitários, formatação, esquema de dados, migração
  dominio/calculos.js     todas as regras de negócio — sem tocar em tela
  dados/store.js          carga, gravação e sincronização do estado
  dados/supabase.js       mapeamento das tabelas, sincronização e telas de acesso
  ui/shell.js             navegação, componentes e formulários
  ui/telas-obra.js        painel, contratos, medições, recebimentos, materiais…
  ui/telas-cadastros.js   clientes, prestadores, relatórios e ajustes
  ui/acoes.js             o que cada clique dispara
  graficos/index.js       curva S, fluxo, Gantt e barras — SVG puro
  io/index.js             importação de planilha MCMV, exportação CSV e PDF
  config.js               leitura das variáveis de ambiente
  app.js                  ponto de entrada: eventos, rotas, inicialização
tests/                    conferência contra a planilha e fumaça no navegador
db/                       estrutura do banco e migrações
docs/                     arquitetura e operação
```

A regra que organiza tudo: **`dominio/calculos.js` não conhece tela, e nenhuma
tela recalcula nada por conta própria.** Todo número que aparece na interface
sai de uma função de domínio, e cada uma delas é conferida contra a planilha
original em `tests/planilha.test.js`.

## Configuração

As variáveis ficam em arquivos `.env` (veja `.env.example`):

| Variável | Para que serve |
|---|---|
| `VITE_SUPABASE_URL` | endereço do projeto Supabase |
| `VITE_SUPABASE_ANON` | chave **publicável** — pública por natureza |
| `VITE_EXIGE_BANCO` | `true` exige banco; `false` roda local, sem login |

A chave publicável vai para o navegador de qualquer forma e sozinha não abre
nada: cada linha do banco só é visível para o usuário dono dela. A chave
`service_role` é secreta e **nunca** entra neste repositório.

## Publicação

`git push` na `main` → a CI roda lint, testes, build e o teste de navegador; se
tudo passar, publica no GitHub Pages. Não há passo manual.

## Documentação

- [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md) — como o sistema é montado por dentro
- [`docs/OPERACAO.md`](docs/OPERACAO.md) — publicar, restaurar, ligar o Power BI
- [`db/README.md`](db/README.md) — tabelas, visões e segurança
- [`SECURITY.md`](SECURITY.md) — o que já protege o sistema e o que falta
