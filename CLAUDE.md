# CLAUDE.md — SII · Sistema Integrado Intersecretarial

Prefeitura Municipal de Itapuã do Oeste/RO · Educação (SEMED), Saúde (SEMSAU), Assistência Social e Fazenda (SEMFAZ).
Coordenação técnica: CTI/SEMED. Domínio de produção: `*.itapuadooeste.ro.gov.br` (a confirmar).

Leia também, antes de qualquer tarefa:

- `docs/ESPECIFICACAO.md`: domínio, regras de negócio, modelo de dados, integrações, perfis e LGPD.
- `docs/prototipo/index.html`: protótipo navegável (dados fictícios). É a referência de telas, textos e fluxos.

## O que é o sistema

Uma base única de pessoas, famílias, domicílios e lotes que liga as fontes das quatro secretarias para:

1. acompanhar cada criança (ficha única com escola, saúde, CRAS, Criança Feliz, Conselho Tutelar);
2. disparar alertas e casos intersetoriais (5 faltas seguidas → notificação ao CRAS → parecer de volta à escola; busca ativa escolar; idosos sem visita);
3. acompanhar ciclos de vida: primeira infância (0 a 6, foco em 0 a 3), educação inclusiva, EJA, pessoa idosa;
4. mostrar tudo no território (setor → quadra → lote), com mapas de calor;
5. prestar contas ao TCE-RO com indicadores agregados e trilha de evidências.

Escopo: municipal. Não é produto multi-município (não adicionar multi-tenancy).

## Stack (obrigatória)

Monorepo **Turborepo + pnpm**. Node.js LTS. TypeScript estrito em tudo.

| Camada | Tecnologia |
| --- | --- |
| API | NestJS 10, Prisma, PostgreSQL 16 + PostGIS, Redis, BullMQ |
| Worker (ETL e jobs) | NestJS standalone + BullMQ (mesmo Prisma da API) |
| Web | Next.js 15 (App Router), Tailwind CSS, shadcn/ui (Radix), lucide-react, TanStack Query, TanStack Table, react-hook-form + zod, MapLibre GL JS |
| Mobile | Expo (React Native + TypeScript), expo-router, expo-sqlite (offline), expo-location, expo-secure-store, expo-notifications, MapLibre React Native |
| Compartilhado | `packages/shared`: schemas zod, tipos, enums e **regras de negócio puras** usadas por API, web e mobile |
| Infra | Docker Compose (postgres-postgis, redis, minio para anexos), Nginx no deploy |
| Testes | Vitest (shared, web), Jest (NestJS), Playwright (web e2e) |

**Autenticação própria no NestJS** (`@nestjs/jwt` + `passport-jwt`, sem servidor de identidade externo e sem reaproveitar o GTE-SEMED): JWT de acesso de 15 min, refresh token opaco rotativo guardado como hash, com detecção de reuso (reuso revoga a família inteira), bcrypt 12, rate limiting (`@nestjs/throttler`), RBAC + ABAC, cookies httpOnly no web e DTOs duplos para LGPD (DTO interno × DTO de saída mascarado). Do Central Educacional (`~/central-educacional/apps/api/src/plataforma/acesso/`) vêm as ideias: bloqueio após 5 falhas por 15 min, hash fictício no login inexistente (tempo igual, não revela logins), senha provisória legível (`xxxx-xxxx-xxxx`, 24 h, troca obrigatória) gerada pelo admin, sem depender de e-mail.

**Dados geográficos de origem**: `~/geoportal_itapua-main(1)/geoportal_itapua-main/` (shapefiles editados no QGIS). Ver `docs/ESPECIFICACAO.md` §3.1.1 para as projeções e os problemas conhecidos de cada camada.

## Estrutura do repositório

```
sii-itapua/
  apps/
    api/          NestJS: módulos de domínio, REST /api/v1, OpenAPI em /api/docs
    worker/       NestJS standalone: filas BullMQ, ETL das fontes, jobs de prazo e indicadores
    web/          Next.js 15: painéis, ficha, notificações, mapa, administração
    mobile/       Expo: app de campo (ACS, CRAS, Criança Feliz, busca ativa), offline-first
  packages/
    shared/       zod, tipos, enums, regras (prazos, índice, motivos de visita, máscaras)
    config/       eslint, tsconfig, prettier, tokens gov.br (tokens.css para Tailwind 4 + espelho TS para o mobile)
  infra/
    docker-compose.yml, postgres/init (extensões), scripts/import-shapefile.sh (ogr2ogr), backups
  docs/
    ESPECIFICACAO.md, prototipo/index.html, adr/ (decisões de arquitetura)
```

## Convenções de código

- Domínio em **português** (entidades, campos, rotas, mensagens): `Crianca`, `Notificacao`, `parecer`, `/api/v1/notificacoes`. Infra e termos técnicos em inglês quando consagrados (`service`, `controller`, `job`).
- Banco em `snake_case`, Prisma em `camelCase` com `@map`/`@@map`.
- Um módulo NestJS por domínio: `territorio`, `pessoas`, `educacao`, `saude`, `assistencia`, `casos`, `notificacoes`, `fichas`, `indicadores`, `auditoria`, `integracoes`, `auth`, `usuarios`.
- Toda regra de negócio que precise rodar em mais de um lugar vai para `packages/shared`, como função pura testada. Nunca duplicar regra entre API, web e mobile.
- Validação de entrada com zod (schema em `shared`) via pipe no NestJS; formulários web e mobile usam o mesmo schema.
- Datas em UTC no banco; exibição em `America/Porto_Velho`. Contagem de "dias letivos" sempre pelo calendário escolar, nunca dias corridos.
- Erros da API no formato `{ codigo, mensagem, campos? }`, mensagem em linguagem simples.
- Commits pequenos, mensagem em português no imperativo ("Adiciona regra de 5 faltas").
- Não criar dependência nova sem justificar no PR. Preferir o que já está na stack.

## Segurança e LGPD (não negociável)

- **Dados pessoais**: CPF, NIS e CNS cifrados na aplicação (AES-256-GCM, chave em variável de ambiente) + hash HMAC para busca e ligação. Nunca em log, URL, query string, push ou mensagem de erro.
- **Máscara por padrão**: o DTO de saída sempre mascara (`***.456.789-**`). Revelar exige endpoint próprio, perfil autorizado e **finalidade**, e grava em `auditoria.acesso_dado_pessoal`.
- **Dado de saúde**: CID, laudo e diagnóstico **não entram** na base integrada. A Saúde fornece só sinalizadores (`vacinacaoEmDia`, `necessitaAtendimentoEspecializado`, `acamado`…).
- **Segregação**: Row-Level Security no PostgreSQL por secretaria e território, além do RBAC na API. O perfil `AUDITOR_TCE` só acessa views agregadas.
- **Agregados**: contagens menores que 5 são suprimidas (`<5`) nas views públicas e de auditoria.
- **Trilha**: todo evento de caso gera registro encadeado por hash (código verificador). Registros de trilha são append-only.
- Variáveis sensíveis só em `.env` (nunca commitado). `.env.example` sempre atualizado.
- **Dado nominal só por `PrismaService.comoUsuario(usuario, tx => ...)`**: é isso que liga o papel do banco e a RLS. O cliente Prisma direto (dono) fica restrito a autenticação, health e tarefas da CTI. Tabela nominal nova vai num schema com RLS e policy na mesma migration (ADR 0003).
- Rotas exigem login por padrão; `@Publico()` é exceção e precisa de motivo. Restrinja com `@Perfis(...)` e, quando a rota tiver escola/microárea/CRAS no caminho, `@Escopo(...)`.

## Front-end (modo institucional gov.br)

Seguir o Padrão Digital de Governo e o protótipo:

- Fonte Rawline (fallback Raleway, system-ui); azul institucional `#1351B4` como primária; neutros frios; status: verde `#168821`, amarelo `#8A6D00`/`#F2B705`, vermelho `#C41C00`. Tokens em variáveis CSS (`packages/config/tokens/tokens.css`, `@theme` do Tailwind 4), nunca cor solta no componente.
- Cabeçalho com identificação do órgão; faixa "Ambiente de homologação" fora de produção.
- Acessibilidade eMAG + WCAG 2.1 AA: contraste 4.5:1, foco visível, teclado em tudo, `label` em todo campo, erro ligado ao campo com `aria-describedby`, alvos de 44 px, `lang="pt-BR"`, link "Ir para o conteúdo".
- Linguagem simples; botões com verbo ("Enviar parecer à escola").
- Toda tela tem os estados: carregando (skeleton), vazio (dizendo o que fazer), erro (com ação de recuperar), sucesso e sem permissão.
- Dashboards: KPI no topo, filtros persistentes (território, período), tabelas com busca, ordenação, paginação e exportação CSV/XLSX (exportação nunca leva CPF).
- Mobile-first; nada de emoji como ícone; um único conjunto de ícones (lucide).

## Mobile (app de campo)

- Offline-first: SQLite local, fila de sincronização com chave de idempotência por registro, resolução de conflito "servidor vence, exceto campos de visita do próprio usuário".
- Baixa só a carteira do usuário (sua microárea, seu CRAS, suas famílias do Criança Feliz), cifrada no aparelho.
- Push nunca contém dado pessoal ("Você tem 3 visitas novas").
- Captura de ponto GPS com precisão registrada; o usuário confirma ou ajusta o pino.

## Comandos

```
nvm use                  # Node 24 (.nvmrc)
pnpm i
pnpm infra:up            # postgres+postgis (5444), redis (6390), minio (9010/9011); espera ficar healthy
pnpm db:migrate          # prisma migrate dev
pnpm dev                 # api (3333), worker e web (3000)
pnpm --filter @sii/mobile start
pnpm db:seed             # usuários fictícios (1 por perfil, senha SEED_SENHA do .env) e pessoas fictícias
pnpm test && pnpm lint && pnpm typecheck
pnpm --filter @sii/api test:integracao     # precisa da infra no ar
pnpm geo:importar <arquivo.shp> <tabela>   # shapefile → stg_geoportal.<tabela> em EPSG:4674
pnpm infra:down
```

Portas locais fora do padrão porque a máquina já roda outros sistemas (ADR 0002). O `.env` fica na raiz.

## Como trabalhar neste repositório

1. Para qualquer tarefa com mais de um arquivo, entre em modo de plano e mostre o plano antes de codar.
2. Leia a seção correspondente de `docs/ESPECIFICACAO.md`; se a regra não estiver lá, pergunte em vez de inventar.
3. Escreva os testes das regras de `packages/shared` antes da implementação.
4. Ao terminar: rode `pnpm test`, `pnpm lint` e `pnpm typecheck`, e liste o que ficou pendente.
5. Decisão de arquitetura relevante → um ADR curto em `docs/adr/NNNN-titulo.md`.
6. Dados reais nunca entram no repositório, nem em fixture. Seeds e testes usam o gerador fictício.
