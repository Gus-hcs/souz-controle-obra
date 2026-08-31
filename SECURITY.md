# Segurança

## O que já protege o sistema

**Isolamento por usuário no banco.** Todas as tabelas têm `usuario_id` e uma
política `dono_total` (`usuario_id = auth.uid()`), de leitura e de escrita.
A regra vive no PostgreSQL: mesmo que alguém chame a API direto, sem passar pela
tela, não enxerga nem grava linha de outro usuário. Isso foi verificado com dois
usuários — um não consegue ler, renomear nem apagar a obra do outro, e a
tentativa de inserir linha em nome de terceiro é recusada pelo banco.

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
5. **Equipe dentro da obra.** Hoje a obra pertence a uma pessoa. Para engenheiro
   lançar e cliente só consultar, é preciso uma tabela de membros por obra e
   políticas apontando para ela.
6. **Trilha de auditoria.** Uma tabela de eventos (quem alterou o quê e quando),
   preenchida por gatilho, para valores financeiros.
7. **Verificação de dependências.** Ligar o Dependabot e `npm audit` na CI.
8. **Cabeçalhos de segurança.** O GitHub Pages não permite definir CSP por
   cabeçalho; se um dia o sistema sair para servidor próprio, vale configurar
   `Content-Security-Policy`, `X-Frame-Options` e `Referrer-Policy`.

## Encontrou uma falha?

Não abra issue pública. Escreva para o responsável pelo repositório com a
descrição e como reproduzir.
