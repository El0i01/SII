# 0013 · Layout institucional, componentes base e Visão geral

Data: 18/11/2026 · Situação: aceita · Prompt: P14

## Contexto

Até o P13, cada tela do web tinha o próprio KPI, cartão, pill, tabela e estados, e não havia menu: só um cabeçalho simples e atalhos na página inicial. O P14 pede o layout do protótipo, componentes base com shadcn/ui, filtros persistentes de território e período e a Visão geral.

Critérios de aceite:
- axe no Playwright sem erros críticos;
- navegação completa por teclado;
- funciona em 360 px.

## Decisões

1. **Menu só com telas prontas** (decisão do usuário, 17/11/2026), filtrado pelo perfil.
   - `lib/menu.ts` repete os perfis do `@Perfis` de cada rota da API; o teste confere a lista de cada perfil.
   - Grupo sem tela some. Quem não tem a Visão geral (DPO, Fazenda) entra na primeira tela do seu menu.
2. **Migrar todas as telas** para os componentes base (decisão do usuário), para não haver duas versões do mesmo componente.
3. **Componentes shadcn escritos no padrão "new-york"** de `components.json`, com os tokens gov.br, em vez do CLI do shadcn: só o que o SII usa, sem cor solta.
4. **Dependências novas**, todas previstas na stack do CLAUDE.md:

   | Pacote | Para quê |
   | --- | --- |
   | `@tanstack/react-table` 8 | Tabela; a versão 9 foi evitada (API nova, ainda pouco usada) |
   | `lucide-react` | Ícones do menu e dos botões |
   | `class-variance-authority` | Variantes do Botão |
   | `@radix-ui/react-slot` | Botão com `asChild` (link com cara de botão) |
   | `@radix-ui/react-dialog` | Gaveta do menu no celular (foco preso, Esc fecha) |
   | `@axe-core/playwright` (dev) | Auditoria de acessibilidade |

5. **Território e período na URL** (`?territorio=S03&periodo=2026-10`).
   - Os links do menu levam os dois parâmetros.
   - Cada tela grava os próprios parâmetros sem apagar os globais (`gravarParametrosDaTela`).
   - O período vale para a série mensal e as rematrículas do ano; os demais KPIs são a situação de hoje.
6. **Visão geral** num endpoint próprio (`GET /painel/visao-geral`).
   - Perfis nominais contam por `comoUsuario`, ou seja, cada um vê os números do que a RLS deixa ver.
   - O auditor do TCE conta pelo cliente dono, com contagens de 1 a 4 suprimidas, sem pauta e sem alertas de caso.
   - Domicílios e o ponto preciso não são nominais e contam direto no território.
   - Regras puras no shared (`painel/visao-geral.ts`): série mensal, períodos, "Precisa de atenção".
7. **Gráficos em SVG próprio** (linha e barras), sem biblioteca de gráficos: cada um tem o número escrito ou uma tabela alternativa.

## Consequências

- Tela nova precisa entrar em `lib/menu.ts` e no teste de acessibilidade.
- A sessão vem de um provedor (`GET /auth/eu`); sem sessão numa rota protegida, o usuário vai para `/entrar?proximo=`.
- "Escalonados" na busca ativa é calculado para hoje, enquanto a pauta usa o nível gravado pelo job de prazos. No banco de desenvolvimento, sem o job rodando, os dois números podem diferir; em produção o job roda todo dia.
