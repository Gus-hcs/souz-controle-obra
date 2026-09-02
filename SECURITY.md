# Segurança

Auditoria e postura de segurança do Souz Controle de Obra.

O sistema é um front-end estático (GitHub Pages) falando direto com o Supabase
pela chave **publicável**. **Toda a segurança real vive no banco** — políticas
RLS, funções `security definer` e a configuração de autenticação do Supabase.
O front não protege nada: qualquer pessoa lê o JavaScript.

---

## O que protege o sistema hoje

### Isolamento no banco (RLS)

Todas as tabelas têm Row Level Security **ligada**. O acesso a uma obra e a tudo
que pende dela é decidido pela tabela `obra_membros` e pelo papel do usuário —
`dono`, `engenheiro` ou `cliente` (migração `0004`). As políticas chamam três
funções `security definer` (`pode_ler_obra`, `pode_escrever_obra`,
`eh_dono_obra`), que consultam `obra_membros` por fora da RLS para não entrar em
recursão. `clientes` e `prestadores` ficam isolados pelo `usuario_id` do dono.
`perfis` só é lido/editado pelo próprio usuário — e as colunas de controle de
conta (`admin`, `plano`, `bloqueado`, `abas`, `limite_obras`) só por admin
(migrações `0006`/`0007`). A `0009` tira ainda o **INSERT** e o **DELETE** de
`perfis` da API: ninguém apaga a própria linha para escapar de um bloqueio nem a
recria como admin. A criação fica só com o gatilho `criar_perfil()` no cadastro.

Verificado com duas contas: uma não lê, renomeia nem apaga a obra da outra, e
inserir linha em nome de terceiro é recusado.

### Administração

O painel de administração (`0005`) é liberado pela coluna `perfis.admin` e pela
RLS — **não por senha na tela**. A função `admin_consumo()` agrega o uso de todos
os clientes e só responde para quem é admin. Alterar plano/bloqueio/abas de um
cliente vai por `admin_definir_perfil()` (`security definer`, checa `pode_admin`).
Promover alguém a `admin` **só pelo SQL Editor** — não há caminho pela API.

### Funções `security definer`

Todas com `set search_path = ''` e nomes totalmente qualificados — as de
autorização na `0006`, o resto (`criar_perfil`, `marcar_atualizacao`,
`obra_dono_membro`, `obra_protege_dono`, `registrar_auditoria`) na `0009`.
`CREATE` no schema `public` bloqueado para `anon`/`authenticated` — para o
cliente não conseguir sequestrar uma função por confusão de search_path.

### Autenticação

O cliente Supabase usa **PKCE** (`flowType: 'pkce'`): o token de sessão não
trafega no fragmento da URL. O link de redefinição de senha volta para a URL
limpa da aplicação (`location.origin + pathname`), que precisa estar em
*Redirect URLs* do projeto, sem curinga.

### Front-end

Toda saída para HTML passa por `esc()`. Detalhe de alerta também é escapado
(`0006` no código). Todo `src` de imagem que possa ter vindo do banco (fotos do
diário, logo do cliente e da empresa) passa por `fonteImagem()`
(`src/nucleo/base.js`): só data URI de imagem rasterizada ou caminho
relativo/HTTPS — corta `javascript:`, `data:text/html`, SVG com script e
tentativa de quebrar o atributo.

O `index.html` traz `Referrer-Policy: no-referrer` e um anti-frame por script (o
Pages não define `X-Frame-Options`). O build injeta um **CSP** por `<meta>`
(`vite.config.js`): `default-src 'self'`, `object-src 'none'`, conexão só para o
Supabase e os dois CDNs de bibliotecas, `upgrade-insecure-requests`. O
`script-src` mantém `'unsafe-inline'` porque o build é arquivo único — o CSP
trava a origem de script e o destino de conexão, não a injeção inline (essa é
com o `esc()`).

### Chaves

O navegador recebe só a chave **publicável**. A `service_role` (ignora RLS) não
está no repositório e não deve entrar nunca. Verificado: as ocorrências do termo
no repo são só documentação.

### Transporte e publicação

HTTPS obrigatório (Pages e API Supabase). Nada vai ao ar sem lint, 130 testes e
teste de navegador.

---

## Falha crítica corrigida (migração 0006)

A `0005` acrescentou `admin`/`plano`/`bloqueado`/`abas` ao `perfis`, mas a
política era `for all` — então **qualquer usuário logado podia rodar
`update perfis set admin = true` na própria linha** e:

- virar admin e ver/alterar a conta de todos os clientes;
- desligar o próprio bloqueio;
- reabrir todas as abas que o admin tinha fechado.

A `0006` fecha isso: `REVOKE UPDATE` das colunas de controle + gatilho que
reverte a mudança de quem não é admin + RPC dedicada para o admin.

---

## Falha crítica corrigida (migração 0009)

A `0006` fechou o `UPDATE`, mas **INSERT e DELETE de `perfis` continuaram
abertos** para o usuário logado — política `for all` da `0001` + grant padrão do
Supabase. O gatilho da `0006` é `BEFORE UPDATE`, não pega `INSERT`. Então:

```sql
delete from public.perfis where id = auth.uid();
insert into public.perfis (id, admin) values (auth.uid(), true);
```

...virava admin. Ou, sem escalar: apagar a própria linha já **anulava o
`bloqueado = true`** de uma conta suspensa.

A `0009` fecha: `REVOKE INSERT, DELETE` de `perfis`; política trocada por
`SELECT` + `UPDATE` do próprio dono; o gatilho passa a `BEFORE INSERT OR UPDATE`,
forçando as colunas de controle a valores seguros no insert de quem não é admin.

---

## O que ainda falta — em ordem de prioridade

### No painel do Supabase (Authentication → …)

1. **Fechar o cadastro aberto.** *Sign In / Providers* → desligar *Allow new
   users to sign up*. Criar cliente pelo painel enquanto não há fluxo de convite.
2. **Confirmação de e-mail.** *Sign In / Providers → Email* → ligar *Confirm
   email*.
3. **Senha forte.** *Policies* → mínimo **12** caracteres + *Prevent use of
   compromised passwords* (checagem no HaveIBeenPwned).
4. **Proteção contra bots / força bruta.** *Rate Limits* e *Attack Protection* →
   ativar CAPTCHA (Turnstile/hCaptcha) no login e cadastro.
5. **MFA na conta administradora.** *Multi-Factor* → exigir TOTP para a sua conta.
6. **URLs de redirecionamento.** *URL Configuration* → deixar só a URL exata do
   Pages em *Redirect URLs*, sem curinga (o reset de senha volta para lá).
7. **Expiração de JWT.** Reduzir para ~1 h; manter refresh token.

### No código / banco

8. **Convite de membro + interface por papel.** O esquema existe (`0004`); falta
   a tela e a interface esconder ação que o papel não permite.
9. **Prestador por id, não por nome.** Hoje `contratos.prestador` é texto e a
   política `prestadores_da_obra` casa por nome — um membro de obra consegue ler
   o contato de um prestador homônimo de outra conta. Yield baixo (precisa
   adivinhar o nome exato), mas o certo é referenciar por id.
10. **SRI nos scripts de CDN.** `supabase-js`, `xlsx` e `jspdf` vêm de CDN. O
    CSP já restringe a origem a `cdnjs`/`jsdelivr`; falta fixar o hash (ou
    empacotar o `supabase-js` no build).
11. **Dependabot + `npm audit` na CI.**
12. **`frame-ancestors` e HSTS de verdade.** Só com header HTTP — num servidor
    próprio (`souztech.com` via proxy/CDN), não no Pages. O `<meta>` cobre o
    resto do CSP; o anti-frame por script cobre o clickjacking.

**Feito nesta rodada:** CSP por `<meta>` no build, `Referrer-Policy: no-referrer`,
anti-frame por script, `fonteImagem()` em todo `src` de imagem, PKCE na
autenticação, `redirectTo` limpo no reset de senha, e a migração `0009`.

---

## Migrações de segurança

| Arquivo | Papel na segurança |
|---|---|
| `0001` | RLS + política `dono_total` em toda tabela; visões com `security_invoker` |
| `0002` | `CHECK` de integridade (não é acesso, mas evita dado corrompido) |
| `0003` | trilha de auditoria dos valores financeiros |
| `0004` | acesso por obra e por papel; funções de autorização |
| `0005` | painel de admin (introduziu a falha do `perfis`) |
| `0006` | **corrige o `UPDATE` do `perfis`**; endurece funções e schema |
| `0007` | teto de obras por conta (gatilho no banco) |
| `0009` | **fecha o INSERT/DELETE do `perfis`**; `search_path` no resto das funções |

---

## Encontrou uma falha?

Não abra issue pública. Escreva para o responsável pelo repositório com a
descrição e como reproduzir.
