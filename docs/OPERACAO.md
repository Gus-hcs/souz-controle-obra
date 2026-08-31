# Operação

## Publicar uma versão nova

```bash
git add -A
git commit -m "descrição da mudança"
git push
```

O resto é automático: a CI roda lint, testes de cálculo, build e o teste de
navegador. Se tudo passar, publica em <https://gus-hcs.github.io/souz-controle-obra/>.
Se algo falhar, **nada vai ao ar** — o site continua na versão anterior.

Acompanhe em *Actions*, na página do repositório.

## Mudar o banco de destino

Edite `.env.production` e faça o push. Para testar contra outro projeto sem
alterar o repositório, crie um `.env.local` (não versionado):

```
VITE_SUPABASE_URL=https://outro-projeto.supabase.co
VITE_SUPABASE_ANON=sb_publishable_...
```

## Rodar sem banco nenhum

```bash
npx vite build --mode teste --outDir dist-local
```

Gera uma versão que grava só no navegador — útil para demonstração e é a que o
teste de navegador usa.

## Aplicar uma mudança no banco

1. Crie o arquivo em `db/migracoes/`, numerado em sequência.
2. Escreva de forma reaplicável (`if not exists`, `drop policy if exists`).
3. Rode no *SQL Editor* do Supabase.
4. Anote na tabela de `db/README.md`.

## Backup e restauração

- **No sistema:** *Ajustes e dados → Baixar backup (JSON)* e *Restaurar backup*.
- **No banco:** Supabase → *Database → Backups*.

Vale baixar o JSON antes de qualquer migração que mexa em dados.

## Power BI

O sistema grava em PostgreSQL puro, então o Power BI lê direto.

1. Supabase → *Project Settings → Database → Connection string* → **Session
   pooler** (é a que aceita conexão de fora). Anote host, porta, banco
   (`postgres`) e usuário.
2. Power BI → *Obter dados → Banco de dados PostgreSQL* → autenticação
   *Database*.
3. Importe as visões, não as tabelas cruas:

| Visão | Traz |
|---|---|
| `vw_resumo_obra` | recebido, pago, contratado e progresso por obra |
| `vw_posicao_contratual` | autorizado, medido, pago e saldo por contrato |
| `vw_fluxo_mensal` | entradas e saídas mês a mês |
| `vw_lancamentos` | lançamentos com o total já calculado |
| `vw_contratos` | contratos e aditivos com o valor do registro calculado |

O usuário `postgres` enxerga todas as linhas — é o comportamento desejado para
o dono do sistema.

## Quando o projeto Supabase pausar

No plano gratuito, o projeto pausa após 7 dias sem uso. O sistema mostra erro de
conexão; basta reativar no painel do Supabase. Nada é perdido.

## Se algo der errado depois de publicar

Reverta o commit e faça o push — a CI republica a versão anterior:

```bash
git revert HEAD
git push
```
