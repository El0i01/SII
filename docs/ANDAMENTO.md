# Andamento — SII · Sistema Integrado Intersecretarial

Registro do que já foi entregue, prompt a prompt (`docs/PROMPTS.md`). O detalhe de cada regra fica na especificação (seções "Como ficou") e o porquê de cada escolha, nos ADRs (`docs/adr/`).

Situação em 18/11/2026: **fases 1 e 2 concluídas (P01 a P13)** e P14 feito. Próximo: P15 (mapa).

## Resumo por prompt

| Prompt | Data | Commit | Entrega | ADR |
| --- | --- | --- | --- | --- |
| P01 | 11/11 | `04d4c98` | Monorepo Turborepo + pnpm (api, worker, web, mobile, shared, config) | 0001 |
| P02 | 11/11 | `0e35efa` | Infra local: PostGIS, Redis, MinIO (portas 5444, 6390, 9010) | 0002 |
| P03 | 11/11 | `3ed95f8` | Autenticação própria, perfis, escopos e Row-Level Security | 0003 |
| P04 | 11/11 | `d6b769a` | Regras de negócio no `packages/shared` | — |
| P05 | 11/11 | `67955a8` | Modelo de dados, cifragem de CPF/NIS/CNS, trilha com hash, seed fictício | 0004 |
| P06 | 11/11 | `17f0ddb` | Território, grade provisória de quadras, geocodificação | 0005 |
| P07 | 11/11 | `7b48fbc` | Identidade única e revisão de vínculos | 0006 |
| P08 | 12/11 | `64b9a23` | Padrão de carga e carga do CadÚnico | 0007 |
| P09 | 13/11 | `481c1ae` | Conector do e-SUS PEC (somente leitura) | 0008 |
| P10 | 17/11 | `bc8fb72` | Frequência, cargas escolares e job de infrequência | 0009 |
| P11 | 17/11 | `fa062d5` | Notificações ao CRAS, parecer, avisos, prazos e pauta do Comitê | 0010 |
| P12 | 17/11 | `5eb7e0c` | Ficha da criança, revelar CPF com finalidade, painel do DPO | 0011 |
| P13 | 17/11 | `e854774` | Busca ativa escolar: job, etapas e painel | 0012 |
| P14 | 18/11 | `bc6ac05` | Layout institucional, componentes base, Visão geral, acessibilidade | 0013 |

---

## 18/11/2026 — P14

O web ganhou a cara do protótipo e uma base comum para todas as telas.

- **Layout:**
  - cabeçalho do órgão com usuário e "Sair";
  - **Território** e **Período** no cabeçalho, gravados na URL;
  - menu lateral agrupado e filtrado pelo perfil, só com telas prontas; no celular, gaveta.
- **Visão geral** (`/`):
  - KPIs: pessoas, casos abertos, rematrículas, vacinação de 0 a 6 anos, ponto preciso;
  - casos abertos × resolvidos por mês, com tabela alternativa;
  - "Precisa de atenção", casos por responsável e por território, e a pauta do Comitê;
  - o auditor vê os números com "< 5".
- **Componentes base** em `apps/web/src/components/ui/`: Botao, Card, Kpi, Pill, Estado, Barras, GraficoLinha, CabecalhoPagina e Tabela (TanStack Table). Todas as telas foram migradas.
- **Território do cabeçalho** também filtra fichas, busca ativa e pauta.
- **Rotas novas:** `GET /painel/visao-geral`, `GET /territorio/setores`; `GET /fichas` e `GET /busca-ativa/painel` aceitam `territorio`.
- **Dependências novas:** `@tanstack/react-table` 8, `lucide-react`, `class-variance-authority`, `@radix-ui/react-slot`, `@radix-ui/react-dialog`, `@axe-core/playwright`.
- **Decisões do usuário:** menu só com telas prontas; migrar todas as telas agora.

Testes ao fim do dia:

| Suíte | Resultado |
| --- | --- |
| `packages/shared` | 274 testes, 100% das linhas |
| Web (Vitest) | 53 testes |
| API, integração | 141 testes em 12 suítes |
| Worker, integração | 30 testes em 6 suítes |
| E2E (Playwright) | 6 testes: os 3 fluxos e mais axe sem violação crítica nem séria em 12 telas, teclado, 360 px sem rolagem lateral |

## 17/11/2026 — P10 a P13

O ciclo intersetorial da criança ficou completo: **falta → notificação ao CRAS → parecer → aviso à escola**, a **ficha** que junta as quatro secretarias e a **busca ativa** de quem está fora da escola.

### Telas novas no web

| Tela | Quem usa | O que faz |
| --- | --- | --- |
| `/frequencia` | Escola, SEMED | Grade da turma por mês; teclado (P, F, J); salva por item; funciona sem internet (fila + grade em cache por 24 h) |
| `/notificacoes` | CRAS, Comitê, escola, SEMED | Caixa de entrada com contadores; detalhe com a trilha e o código verificador; parecer (CRAS e Comitê) |
| `/avisos` | Todos com destino | Avisos internos sem dado pessoal (parecer emitido, prazo subindo, caso novo) |
| `/pauta` | Comitê, SEMED, CTI | Casos vencidos há mais de 7 dias (lista viva); CSV sem CPF |
| `/fichas` | Perfis nominais | Lista por prioridade e ficha ao lado: blocos das quatro secretarias, motivos de visita, histórico, relatórios de visita, revelar CPF, encaminhar |
| `/busca-ativa` | Perfis nominais; auditor só números | KPIs, funil, origem do alerta, prazos, casos com etapas, CSV sem CPF nem nome |
| `/acessos` | DPO, CTI | Quem revelou CPF, quando e para quê (versão mínima; o P16 amplia) |

### Jobs diários (fila `cargas`, horário de Porto Velho)

| Hora | Job | Comando para rodar agora |
| --- | --- | --- |
| 6h (seg. a sáb.) | Infrequência: 5 faltas seguidas → caso + notificação ao CRAS | `pnpm --filter @sii/worker infrequencia:rodar [data]` |
| 6h15 | Busca ativa: abre caso de quem está fora da escola; fecha quem matriculou | `pnpm --filter @sii/worker busca-ativa:rodar [data]` |
| 6h30 | Prazos: nível de escalonamento e avisos quando o nível sobe | `pnpm --filter @sii/worker prazos:rodar [data]` |

Os horários mudam por `INFREQUENCIA_CRON`, `BUSCA_ATIVA_CRON` e `PRAZOS_CRON` (`.env`). Cada execução aparece em `/cargas`.

### Rotas novas da API (`/api/v1`)

- **Educação (P10):** `GET /escolas`, `GET /escolas/:inep/turmas`, `GET|PUT /escolas/:inep/turmas/:turmaId/frequencia`; cargas `GESTAO_ESCOLAR` e `SEDUC` (CSV) em `/cargas`.
- **Casos (P11):** `GET /notificacoes`, `GET /notificacoes/:codigo`, `POST /notificacoes/:codigo/em-analise`, `POST /notificacoes/:codigo/parecer`, `POST /casos/encaminhamentos`, `GET /casos/pauta`, `GET /avisos`, `POST /avisos/:id/lido`.
- **Fichas (P12):** `GET /fichas`, `GET /fichas/:id`, `POST /fichas/:id/revelar-cpf`, `GET /auditoria/acessos`.
- **Busca ativa (P13):** `GET /busca-ativa/painel`, `GET /busca-ativa`, `GET /busca-ativa/:codigo`, `POST /busca-ativa/:codigo/encaminhar | visita | matricula | conselho-tutelar`.

### Decisões tomadas com o usuário

| Data | Assunto | Decisão |
| --- | --- | --- |
| 17/11 | Reabertura da infrequência | Caso encerrado reabre na hora se o aluno ainda tem 5+ faltas seguidas |
| 17/11 | Layout das cargas escolares | Layout próprio do SII, a confirmar com a SEMED e a SEDUC |
| 17/11 | Frequência sem internet | Fila de lançamentos + grade em cache |
| 17/11 | Quem emite parecer | Técnico do CRAS (só do próprio CRAS) e Comitê Gestor |
| 17/11 | Pauta do Comitê | Lista viva (casos em nível 3 agora) |
| 17/11 | O que cada perfil vê na ficha | Todos os blocos para todo perfil nominal, como no protótipo |
| 17/11 | Revelar CPF | Qualquer perfil nominal, com finalidade de uma lista ou "Outra" descrita |
| 17/11 | Etapas da busca ativa | SEMED encaminha, matricula e comunica o Conselho; a visita é da secretaria do caso |
| 17/11 | Seed × job da busca ativa | Seed intocado: o painel bate com o protótipo antes de rodar o job |

### Decisões técnicas registradas (sem consulta)

- Caso novo só por `criarCaso` (trava e conferência de caso aberto na mesma transação), usado pelos jobs e pelo encaminhamento manual.
- Avisos internos no lugar de e-mail, com texto fixo e só o código do caso (sem SMTP configurado).
- Revelar CPF grava o registro de acesso **antes** de decifrar; fora do escopo → 404 sem registro.
- Busca ativa: quarentena de 180 dias depois do Conselho Tutelar; matrícula registrada pela SEMED cria a matrícula; "encaminhados em até 30 dias" calculado (no protótipo era fixo).
- O auditor do TCE vê só números da busca ativa, com contagens menores que 5 suprimidas.
- Testes de navegador com Playwright usando o Chrome instalado (sem baixar navegador): `pnpm --filter @sii/web e2e`, API na porta 3334 e web na 3001, sempre no banco de teste.

### Seed

Ganhou relatórios de visita fictícios (ACS, Criança Feliz e CRAS) em `casos.visita`, com os textos do protótipo.

### Testes ao fim do dia

| Suíte | Resultado |
| --- | --- |
| `packages/shared` (Vitest) | 268 testes, 100% das linhas |
| Web (Vitest) | 41 testes |
| API, integração (Jest) | 136 testes em 11 suítes |
| Worker, integração (Jest) | 30 testes em 6 suítes |
| E2E (Playwright) | 3 fluxos: infrequência → parecer → aviso; ficha → revelar CPF → DPO; busca ativa → encaminhar → CSV |

### Pendências que ficaram (detalhe na §9 da especificação)

- Layouts reais das cargas da gestão escolar e da SEDUC.
- Servidor SMTP para mandar os avisos também por e-mail.
- Pauta fechada por reunião do Comitê (ata e prestação de contas).
- Fonte própria do Conselho Tutelar para a ficha.
- Confirmar a quarentena de 180 dias da busca ativa depois do Conselho Tutelar.
- Disco da máquina de desenvolvimento perto de 98%: o MinIO recusa arquivos abaixo do limite livre.
