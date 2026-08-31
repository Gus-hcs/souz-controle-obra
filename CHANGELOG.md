# Mudanças

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
