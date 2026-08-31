# Sincronização com o banco — decisão pendente

**Status:** aberto. Precisa da decisão do dono do projeto antes de virar código.

## O problema

`SUPA.sincronizar()` ([src/dados/supabase.js](../src/dados/supabase.js)) grava por
diferença: compara o estado atual com o último confirmado (`Store.snapshot`) e
sobe só as linhas que mudaram, apagando as que sumiram.

Isso funciona bem com **um usuário por obra**. Com dois, quebra:

- **Sobrescrita silenciosa.** A e B abrem a mesma obra. A altera o valor de uma
  medição e grava. B, que carregou antes, altera outro campo da mesma medição e
  grava depois. O `upsert` de B manda a linha inteira e apaga a alteração de A,
  sem aviso.
- **Ressurreição.** A exclui um lançamento. B, com o estado antigo, grava
  qualquer coisa. O lançamento que A apagou volta, porque ainda está no snapshot
  de B e o `sincronizar` de B o reenvia.

Não aparece hoje porque cada obra tem um dono só. Vai aparecer no dia em que a
tela de equipe (parte seguinte da Onda 0) entrar no ar.

## Opções

### 1. Recarregar antes de gravar

Antes de cada `sincronizar`, buscar do banco as linhas das obras que serão
tocadas e refazer o snapshot. Some as duas alterações quando são em campos
diferentes; quando são no mesmo campo, a última ainda vence, mas sobre dado
fresco.

- Simples, cabe em uma função.
- Não resolve conflito real de campo, só reduz a janela.
- Uma ida a mais ao banco por gravação.

### 2. Carimbo de versão por linha

Cada linha ganha `versao integer` (ou usa `atualizado_em`). O `upsert` só grava
se a versão do banco for a que o cliente carregou; senão, recusa e a tela avisa
"esta linha mudou, recarregue".

- Conflito vira erro visível, não perda silenciosa.
- Exige coluna nova em todas as tabelas, gatilho de incremento, e tratamento de
  recusa na tela.
- Migração e mudança no `sincronizar`.

### 3. Gravação por campo (CRDT leve)

Em vez de mandar a linha inteira, mandar só os campos que mudaram
(`update ... set campo = valor where id = ...`). Duas pessoas editando campos
diferentes da mesma linha não se atropelam.

- Resolve o caso mais comum (campos diferentes).
- Reescreve o `sincronizar` inteiro; a lógica de diff fica bem mais complexa.
- Exclusão ainda precisa de tratamento à parte (opção 2 junto).

## Recomendação

Começar pela **opção 1** agora (baixo custo, tira o pior da ressurreição) e
planejar a **opção 2** para quando a tela de equipe estiver de pé e houver mesmo
duas pessoas na obra. A opção 3 só se o uso mostrar que edição simultânea da
mesma linha é comum — improvável em obra.
