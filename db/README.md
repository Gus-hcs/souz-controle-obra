# Banco de dados

O sistema grava em PostgreSQL puro (Supabase). Não há ORM nem camada mágica:
as tabelas espelham as coleções do sistema e as **visões** entregam os números
já calculados para o Power BI.

## Estrutura

| Tabela | Guarda |
|---|---|
| `perfis` | dados da empresa, listas, e o controle de conta (admin, plano, bloqueio, abas liberadas) |
| `clientes` · `prestadores` | cadastros compartilhados entre obras |
| `obras` | a obra e seus parâmetros financeiros |
| `obra_membros` | quem participa de cada obra e com que papel (dono/engenheiro/cliente) |
| `contratos` | contratos e aditivos, agrupados por `codigo_base` |
| `medicoes` | medições do empreiteiro e seus pagamentos |
| `recebimentos` | entradas da CAIXA e do cliente |
| `materiais` | plano de compras |
| `lancamentos` | compras, taxas e demais saídas |
| `cronograma` | etapas, prazos e avanço físico |
| `diario` | diário de obra e fotos |
| `auditoria` | trilha de alterações de valor financeiro, preenchida por gatilho |

Visões para análise: `vw_contratos`, `vw_posicao_contratual`, `vw_lancamentos`,
`vw_resumo_obra`, `vw_fluxo_mensal` — todas com `security_invoker = on`, ou seja,
respeitam a segurança por usuário de quem consulta.

## Segurança

Até a migração `0003`, cada obra pertencia a uma pessoa (`usuario_id = auth.uid()`).
A partir da `0004`, o acesso é **pela obra**, via `obra_membros`:

| Papel | Pode |
|---|---|
| `dono` | tudo — inclusive gerenciar a equipe e excluir a obra |
| `engenheiro` | lançar, medir, editar; não gerencia equipe nem exclui a obra |
| `cliente` | só leitura |

As políticas das tabelas da obra chamam três funções `security definer` —
`pode_ler_obra()`, `pode_escrever_obra()`, `eh_dono_obra()` — que consultam
`obra_membros` por fora da RLS (senão a política entra em recursão consigo mesma).

`clientes` e `prestadores` continuam do dono: só ele cria e edita. Um membro
convidado enxerga apenas os cadastros que a obra dele usa.

O `usuario_id` das linhas passou a significar **quem criou/alterou**, não "dono".
Toda obra existente ganhou um membro `dono` na migração, então nada muda para
quem usa o sistema sozinho.

`perfis` é lido e alterado só pelo próprio dono; as colunas de conta (`admin`,
`plano`, `bloqueado`, `abas`, `limite_obras`) só por admin. Desde a `0009` a API
não tem mais INSERT nem DELETE em `perfis` — não dá para apagar a própria linha
e recriá-la como admin, nem escapar de um `bloqueado = true` removendo o perfil.
A criação da linha fica só com o gatilho `criar_perfil()` no cadastro.

A chave que vai para o navegador é a **publicável**; a `service_role` nunca entra
neste repositório.

## Edge Functions

`supabase/functions/admin-usuario/` concentra toda operação de conta que precisa
da `service_role` (injetada pelo runtime, nunca versionada): `criar`, `excluir`,
`trocar-email`, `redefinir-senha`. Confere `perfis.admin` de quem chama e recusa
a própria conta do admin e outra conta de admin. Substitui a antiga
`admin-criar-usuario` — apague-a no painel depois de publicar a nova.

```
supabase link --project-ref vushcazzyabvamylbtat
supabase functions deploy admin-usuario
```

O deploy anterior foi feito pelo editor do painel, então **o painel é a fonte da
verdade** do que está rodando: toda mudança no `index.ts` exige republicar.

## Migrações

Cada arquivo em `migracoes/` roda uma vez, em ordem, no SQL Editor do Supabase.
Todos são escritos para poder rodar de novo sem quebrar (`if not exists`,
`drop policy if exists`), então reaplicar é seguro.

| Arquivo | O que faz |
|---|---|
| `0001_estrutura_inicial.sql` | tabelas, índices, gatilhos, políticas e visões |
| `0002_validacao.sql` | restrições `CHECK` que espelham `src/dominio/validacao.js` |
| `0003_auditoria.sql` | tabela `auditoria` e gatilho de trilha de valores financeiros |
| `0004_membros_e_papeis.sql` | `obra_membros`, funções de autorização e políticas por papel |
| `0005_admin_e_permissoes.sql` | painel de administração: consumo por cliente e liberação de acesso por aba |
| `0006_seguranca.sql` | corrige a falha de auto-promoção a admin; endurece funções e schema |
| `0007_limite_obras.sql` | teto de obras por conta (`perfis.limite_obras`), com gatilho no banco |
| `0008_logos.sql` | `perfis.logo` e `clientes.logo` para o cabeçalho do relatório em PDF |
| `0009_seguranca_perfis.sql` | fecha o INSERT/DELETE de `perfis` (escalada a admin / fuga de bloqueio); trava `search_path` no resto das funções |
| `0010_revoga_truncate.sql` | revoga `TRUNCATE` de `anon`/`authenticated` (ignora RLS); ajusta o default privilege |

Ao criar uma migração nova, numere em sequência e descreva a mudança aqui.

### 0002 — como aplicar

Este arquivo tem três blocos, para rodar **em ordem** no SQL Editor:

1. **Diagnóstico** (só leitura) — lista as linhas que violariam as novas regras.
2. **Restrições `NOT VALID`** — passam a valer para gravações novas sem recusar o
   histórico.
3. **Validação do histórico** — só conclui se o diagnóstico estiver zerado.

Se o diagnóstico trouxer linhas, corrija-as e repita o bloco 1 antes do bloco 3.
Uma vez validado, não precisa reaplicar.

### 0003 — auditoria

Cria `public.auditoria` e um gatilho `after insert/update/delete` em `contratos`,
`medicoes`, `recebimentos` e `lancamentos` que registra cada mudança nos campos
de valor. Só o gatilho escreve (é `security definer`); o cliente só lê a trilha
das próprias obras. A tabela **não** tem FK para `obras` de propósito: a trilha
sobrevive à exclusão da obra.

A tela **Trilha de auditoria** (por obra) lê `public.auditoria` direto, fora do
ciclo de sincronização do sistema.

### 0004 — equipe e papéis

Roda direto (é re-executável). Rode `0001`, `0002` e `0003` antes.

Cria `obra_membros`, as funções de autorização e um gatilho que adiciona o `dono`
como membro sempre que uma obra é criada. Toda obra já existente recebe o membro
`dono` na hora. Troca as políticas `dono_total` das tabelas da obra por políticas
por comando que chamam `pode_ler_obra()` / `pode_escrever_obra()`.

Ainda **não há tela** para convidar engenheiro ou cliente — o esquema está
pronto, a interface de equipe é o próximo passo. Enquanto isso, todo mundo é
`dono` da própria obra e nada muda.

### 0005 — administração

Roda direto (é re-executável). Rode `0001`–`0004` antes.

Acrescenta ao `perfis`: `admin`, `plano` (com `CHECK`), `bloqueado`, `abas`
(jsonb — abas bloqueadas para aquele usuário). Cria `pode_admin()` e a função
`admin_consumo()` (`security definer`), que agrega o uso de todos os clientes e
só responde para quem é admin.

**Depois de aplicar**, marque a sua conta como administradora, uma vez. No SQL
Editor o `auth.uid()` é nulo, então identifique-se pelo e-mail:

```sql
update public.perfis set admin = true
where id = (select id from auth.users where email = 'seu-email@exemplo.com');
```

Aí aparece o grupo **Administração** no menu, só para você.

Um ponto a conferir ao aplicar: criar uma obra pela primeira vez deve retornar a
obra normalmente (a política de leitura tem um ramo `usuario_id = auth.uid()`
justamente para isso). Se o `RETURNING` do insert vier vazio, é sinal de que esse
ramo não pegou.
