# Mudanças

## Não publicado

**Integridade**
- Camada de validação de domínio (`src/dominio/validacao.js`): cada registro é
  conferido antes de gravar, com dois níveis — erro (bloqueia) e alerta (avisa).
- Migração `0002_validacao.sql`: restrições `CHECK` no banco espelhando as mesmas
  regras, aplicadas com diagnóstico prévio e sem recusar o histórico.
- Os formulários destacam o campo com problema e explicam o motivo.
- A importação de planilha avisa quando a obra traz dados fora do padrão.

**Correções**
- Teste de navegador importava o Playwright por caminho absoluto de outra
  máquina; nunca passava fora do ambiente onde foi escrito.

## 1.0.0 — 31/08/2026

Primeira versão publicada e primeira organização profissional do projeto.

**Sistema**
- Carteira de obras com painel consolidado
- Contratos e aditivos agrupados por código-base, com posição contratual
- Medições com alerta de pagamento acima do medido
- Recebimentos da CAIXA e do cliente
- Plano de materiais ligado aos lançamentos
- Cronograma com avanço físico ponderado
- Curva S física × financeira
- Diário de obra com fotos
- Alertas e pendências automáticos
- Relatório em PDF para cliente e CAIXA, exportação CSV
- Importação das planilhas MCMV existentes

**Infraestrutura**
- Banco PostgreSQL no Supabase, com segurança por usuário em todas as tabelas
- Login por e-mail e senha, multiusuário
- Publicação automática no GitHub Pages a cada push na `main`

**Engenharia**
- Código dividido em módulos ES por camada: núcleo, domínio, dados, interface,
  gráficos e entrada/saída
- Build com Vite, gerando um arquivo único
- 71 testes automatizados: o motor de cálculo é conferido contra a planilha
  MCMV de origem, célula por célula
- Teste de navegador percorrendo as 17 telas
- ESLint e Prettier
