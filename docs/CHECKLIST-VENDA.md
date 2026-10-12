# Checklist de venda — o que depende de você

Lista do que só o dono do projeto consegue fazer, anotada durante o trabalho
de "pronto para vender". Cada item diz onde fazer e por quê. O estado
verificado e o roteiro de aceitação com o primeiro cliente entram aqui na
etapa 4.

Atualizado em 12/10/2026, fim da etapa 2.

## Agora (destrava a IA que já está no site)

- [ ] **Cadastrar a chave da IA no Supabase.** Painel do projeto → Edge
      Functions → Secrets → `ANTHROPIC_API_KEY`, com o valor que está em
      `supabase/.env`. Sem isso a leitura de nota e o "Perguntar" não
      funcionam. Não precisa republicar a função.
- [ ] **Testar "Lançar pela nota" com uma nota de verdade** (Lançamentos →
      "Lançar pela nota") e avisar para conferir o registro de uso no banco.

## Depois do merge na `main`

- [ ] **Abrir e aprovar o pull request** da branch `pronto-para-vender`
      (já está no GitHub) quando a CI estiver verde. As etapas 1 e 2 podem
      entrar já: destravam a publicação.
- [ ] **Definir as perguntas por mês.** Hoje está em 0; com 0 o botão
      "Perguntar" aparece com cadeado para o gestor e não aparece para o
      engenheiro. Dois caminhos: Contas e acessos → IA (a tela sugere 50 por
      obra), ou o prompt do Claude web
      (`.claude/auditoria/claude-web-pronto-para-vender.md`), que grava a cota
      e confere a produção.
- [ ] **Republicar a função `ia` só se ela mudar.** Até a etapa 2 ela não
      mudou: a versão 2 que está no ar serve.

## Painel do Supabase (segurança e operação)

- [ ] **Apagar o bucket `site`** (Storage → site → Delete bucket). Está
      público, vazio e sem uso; a migração 0022 só tirou as políticas.
- [ ] **Ligar a proteção contra senha vazada** (Authentication → Policies).
      Pede o plano Pro.
- [ ] **Plano Pro e backup:** confirmar que há backup diário e testar uma
      restauração num projeto de teste. Hoje excluir uma obra apaga tudo dela,
      sem lixeira.
- [ ] **Fechar o cadastro aberto** (Sign In / Providers → desligar "Allow new
      users to sign up"): as contas são criadas pelo administrador.
- [ ] **Redirect URLs:** deixar só `https://obras.souztech.com/`, sem curinga.
- [ ] **SMTP próprio** com remetente `@souztech.com`: a recuperação de senha
      depende dele, e o SMTP padrão do Supabase manda poucos e-mails por hora.
- [ ] **MFA na sua conta de administrador.**

## Documentos e LGPD

- [ ] **Revisão jurídica** dos termos de uso e da política de privacidade (os
      rascunhos são conferidos na etapa 3).
- [ ] **Publicar os dois textos** e preencher `VITE_TERMOS_URL` e
      `VITE_PRIVACIDADE_URL` no `.env.production`: os links da tela de acesso
      só aparecem com essas duas variáveis.
- [ ] **Contrato com cláusula de tratamento de dados** para a construtora
      assinar (você é operador; ela é a controladora).

## Negócio

- [ ] **Preço e cotas dos planos**, com e sem IA. O código só tem a cota
      configurável; nenhum preço está escrito.
- [ ] **Criar um projeto Supabase de homologação** para testar migração antes
      de produção.

## Decisões que tomei por você (pode mudar)

- **Pull request único** com tudo, na branch `pronto-para-vender`, como o
  plano pede — em vez de uma branch por item.
- **Cota em zero = recurso fora do plano.** IA ligada com 0 leituras ou 0
  perguntas mostra o cadeado para o gestor e esconde o botão dos outros, em
  vez de um botão que responde "acabaram".
- **IA fora do ar:** depois de uma falha por indisponibilidade, o botão
  "Lançar pela nota" avisa por 5 minutos em vez de pedir outra foto.
