# Segurança

## O que já protege o sistema

**Isolamento por obra no banco.** O acesso a uma obra e a tudo que pende dela
(contratos, medições, recebimentos, lançamentos, materiais, cronograma, diário,
auditoria) é decidido pela tabela `obra_membros` e pelo papel do usuário —
`dono`, `engenheiro` ou `cliente` (migração `0004`). A regra vive no PostgreSQL,
em políticas por comando: mesmo chamando a API direto, quem não é membro não lê
nem grava, e o papel `cliente` só lê. `clientes` e `prestadores` continuam
isolados pelo `usuario_id` do dono. Antes da `0004` o isolamento era por
`usuario_id` em toda tabela (política `dono_total`); a migração converte tudo e
dá a cada obra existente um membro `dono`.

Ainda sem cobertura: a **interface** não esconde ação por papel nem tem tela
para convidar membro. O banco recusa a escrita indevida; a tela, por enquanto,
deixaria o `cliente` tentar e tomar erro.

**Chaves.** O navegador recebe apenas a chave **publicável**, que é pública por
definição e sozinha não abre nada. A chave `service_role`, que ignora as
políticas de segurança, não está neste repositório e não deve entrar nunca.

**Transporte.** O site é servido só por HTTPS, e a API do Supabase também.

**Senhas.** Ficam com o Supabase (hash, nunca em texto). O sistema nunca guarda
nem transmite senha para outro lugar.

**Publicação.** Nada vai ao ar sem passar por lint, testes e teste de navegador.

## O que ainda falta — em ordem de prioridade

1. **Religar a confirmação de e-mail.** Está desligada para facilitar o primeiro
   acesso. Antes de abrir para clientes, religar em *Authentication → Sign In /
   Providers → User Signups*.
2. **Fechar o cadastro aberto.** Hoje qualquer pessoa com o endereço cria conta.
   Enquanto o sistema for de uso interno, vale desligar *Allow new users to sign
   up* e criar os usuários pelo painel.
3. **Limite de tentativas de login.** Configurar *Authentication → Rate Limits*
   e *Attack Protection*.
4. **Senha forte.** O mínimo hoje é 6 caracteres. Subir para 10 e ligar
   *Password requirements*.
5. **Interface consciente de papel.** O esquema de equipe existe (migração
   `0004`), mas falta a tela para convidar engenheiro/cliente e falta a
   interface esconder ação que o papel não permite.
6. **Autenticação de admin.** O painel de administração (migração `0005`) é
   liberado pela coluna `perfis.admin` e pela RLS — não por senha na tela.
   Ainda falta 2FA para a conta administradora.
7. **Verificação de dependências.** Ligar o Dependabot e `npm audit` na CI.
8. **Cabeçalhos de segurança.** O GitHub Pages não permite definir CSP por
   cabeçalho; se um dia o sistema sair para servidor próprio, vale configurar
   `Content-Security-Policy`, `X-Frame-Options` e `Referrer-Policy`.

Feito: **equipe dentro da obra** (migração `0004`) e **trilha de auditoria**
(migração `0003`).

## Encontrou uma falha?

Não abra issue pública. Escreva para o responsável pelo repositório com a
descrição e como reproduzir.
