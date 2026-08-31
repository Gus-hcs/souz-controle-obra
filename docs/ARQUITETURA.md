# Arquitetura

## A ideia central

O sistema é uma aplicação de página única, sem framework, dividida em camadas
com uma regra só: **o cálculo não conhece a tela**.

```
       nucleo/base.js
             │        utilitários, formatação, esquema de dados
             ▼
      dominio/calculos.js
             │        toda regra de negócio — funções puras, testadas
             ▼
   ┌─────────┴──────────┐
   ▼                    ▼
dados/                 ui/  ·  graficos/  ·  io/
store.js               desenham a partir do que o domínio calcula
supabase.js
   │
   ▼
 PostgreSQL (Supabase)
```

`dominio/calculos.js` recebe um objeto de obra e devolve números. Não lê DOM,
não escreve em banco, não depende de data do sistema além de `hoje`. É por isso
que dá para conferir cada função contra a planilha original, célula por célula.

## Estado

Existe um único objeto de estado, carregado por `dados/store.js` e normalizado
por `migrar()` em `nucleo/base.js`. `migrar()` é idempotente e tolerante: aceita
estado antigo, incompleto ou corrompido e devolve algo íntegro. É o que permite
evoluir o formato dos dados sem quebrar quem já tem obra cadastrada.

## Persistência

`dados/store.js` decide onde gravar, em ordem de preferência:

1. **Supabase** — quando há banco configurado e usuário autenticado
2. **localStorage** — quando não há banco (modo local ou perda de conexão)

A sincronização com o banco é por diferença: a cada gravação, o estado atual é
comparado com o último enviado e só as linhas que mudaram sobem; as que sumiram
são apagadas. Isso mantém o tráfego baixo e evita reescrever a obra inteira a
cada clique.

## Interface

Não há framework nem VDOM. Cada tela é uma função que devolve HTML como texto, e
`App.render()` troca o conteúdo. Os eventos são resolvidos por **delegação**: um
único ouvinte no documento lê `data-acao` e chama a função correspondente em
`ui/acoes.js`.

```html
<button data-acao="editar-medicao" data-id="m-42">Editar</button>
```

Isso significa que nenhuma tela precisa registrar nem remover ouvintes, e
redesenhar não vaza memória.

## Gráficos

`graficos/index.js` desenha SVG na mão — curva S, fluxo de caixa, Gantt e
barras. Sem biblioteca de gráficos: o volume de dados é pequeno, o controle
visual é total e o arquivo final não carrega centenas de kB que nunca seriam
usados.

## Bibliotecas externas

Três bibliotecas são carregadas **sob demanda**, por CDN, só quando o recurso é
usado: `supabase-js` (banco), `xlsx` (importar planilha) e `jspdf` (relatório).
Quem só consulta a obra nunca baixa nenhuma delas.

## Build

O Vite monta tudo em **um único `dist/index.html`**, com CSS e JS embutidos.
Isso mantém a publicação trivial — GitHub Pages, servidor próprio ou até aberto
do disco — sem abrir mão do código-fonte modular.

## Decisões que valem explicar

**Por que não React/Vue?** O sistema é feito de tabelas e formulários sobre um
estado único. O ganho de um framework aqui seria pequeno perto do custo: mais
dependências para manter, build mais pesado e um arquivo final maior. A
separação que importa — domínio isolado da tela — já está feita, e é ela que
permite trocar a camada de interface no futuro sem tocar em uma linha de
cálculo.

**Por que arquivo único?** Porque o sistema precisa ser fácil de publicar em
qualquer lugar e de guardar como cópia de segurança. Um arquivo que abre no
navegador é um artefato que sobrevive a qualquer mudança de hospedagem.

**Por que a chave do banco fica no código?** Porque ela é publicável por
definição. A proteção real está no banco: `Row Level Security` em todas as
tabelas, com política por `auth.uid()`.
