# Banco de dados

O sistema grava em PostgreSQL puro (Supabase). Não há ORM nem camada mágica:
as tabelas espelham as coleções do sistema e as **visões** entregam os números
já calculados para o Power BI.

## Estrutura

| Tabela | Guarda |
|---|---|
| `perfis` | dados da empresa e listas configuráveis, um por usuário |
| `clientes` · `prestadores` | cadastros compartilhados entre obras |
| `obras` | a obra e seus parâmetros financeiros |
| `contratos` | contratos e aditivos, agrupados por `codigo_base` |
| `medicoes` | medições do empreiteiro e seus pagamentos |
| `recebimentos` | entradas da CAIXA e do cliente |
| `materiais` | plano de compras |
| `lancamentos` | compras, taxas e demais saídas |
| `cronograma` | etapas, prazos e avanço físico |
| `diario` | diário de obra e fotos |

Visões para análise: `vw_contratos`, `vw_posicao_contratual`, `vw_lancamentos`,
`vw_resumo_obra`, `vw_fluxo_mensal` — todas com `security_invoker = on`, ou seja,
respeitam a segurança por usuário de quem consulta.

## Segurança

Toda tabela tem `usuario_id` e uma política `dono_total`:

```sql
using (usuario_id = auth.uid()) with check (usuario_id = auth.uid())
```

Ninguém enxerga nem grava linha de outro usuário — a regra vive no banco, não na
tela. A chave que vai para o navegador é a **publicável**; a `service_role`
nunca entra neste repositório.

## Migrações

Cada arquivo em `migracoes/` roda uma vez, em ordem, no SQL Editor do Supabase.
Todos são escritos para poder rodar de novo sem quebrar (`if not exists`,
`drop policy if exists`), então reaplicar é seguro.

| Arquivo | O que faz |
|---|---|
| `0001_estrutura_inicial.sql` | tabelas, índices, gatilhos, políticas e visões |

Ao criar uma migração nova, numere em sequência e descreva a mudança aqui.
