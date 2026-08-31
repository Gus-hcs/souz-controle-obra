# Publicar a landing em souztech.com

A landing (`docs/landing.html`) vira o site em **souztech.com**. Ela precisa de um
repositório próprio — o repositório do produto já serve o sistema em
`gus-hcs.github.io/souz-controle-obra/` e o GitHub Pages só aceita um domínio por
repositório.

A pasta `site/` (fora do controle de versão) já está montada com tudo pronto:
`index.html`, `CNAME` e `.nojekyll`.

---

## 1. Criar o repositório do site

No GitHub, criar um repositório **vazio** (sem README, sem .gitignore) chamado
`souztech-site`.

## 2. Publicar o conteúdo

No terminal, dentro da pasta do projeto:

```bash
cd site
git init -b main
git add -A
git commit -m "Site souztech.com"
git remote add origin https://github.com/Gus-hcs/souztech-site.git
git push -u origin main
```

## 3. Ligar o GitHub Pages

No repositório `souztech-site` → **Settings → Pages**:

- **Source:** Deploy from a branch
- **Branch:** `main` · pasta `/ (root)` · **Save**
- Em **Custom domain**, digitar `souztech.com` → **Save**
  (o arquivo `CNAME` já faz isso, mas confirme que aparece)

Deixe **Enforce HTTPS** ligado assim que ficar disponível (pode levar alguns
minutos após o DNS resolver).

## 4. Apontar o domínio (no painel do registrador)

Em **DNS / Nameservers**. Se os nameservers estiverem em `dns-parking.com` e não
der para editar registros, troque para os nameservers padrão do registrador
primeiro.

Adicionar os registros do GitHub Pages:

| Tipo | Nome | Valor |
|---|---|---|
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |
| CNAME | `www` | `gus-hcs.github.io` |

(Opcional, para IPv6 — quatro registros AAAA em `@`:
`2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`,
`2606:50c0:8003::153`.)

O DNS costuma propagar em minutos, às vezes até 24 h.

## 5. Antes de mostrar para cliente

- Criar o e-mail **contato@souztech.com** no provedor e testar os botões de
  contato e o formulário (ele abre o e-mail com a mensagem pronta).
- Quando tiver Calendly / Cal.com, trocar no `index.html` os links
  `mailto:contato@souztech.com?subject=Quero agendar...` pela URL da agenda.
- Apagar a faixa cinza do topo: procurar por `class="setup"` no `index.html` e
  remover essa `<div>`.
- Para atualizar o site depois: editar `site/index.html`, `git add -A`,
  `git commit`, `git push`.

---

## Alternativa sem GitHub

Se preferir, **Netlify Drop** (`app.netlify.com/drop`): arrasta a pasta `site/`,
o site sobe na hora, depois em *Domain settings* você adiciona `souztech.com` e
o Netlify mostra os registros de DNS. Mesmo princípio.
