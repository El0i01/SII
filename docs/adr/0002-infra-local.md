# 0002 · Infraestrutura local e Prisma

Data: 11/11/2026 · Situação: aceita · Prompt: P02

## Contexto

A API precisa de PostgreSQL 16 + PostGIS, Redis e MinIO, e de um caminho para trazer os shapefiles do
geoportal (`~/geoportal_itapua-main(1)/geoportal_itapua-main/`) para o banco. A máquina de desenvolvimento
já roda outros sistemas em Docker (GTE, SGP, Censo, SOL) ocupando as portas padrão.

## Decisões

1. **Compose `sii`** (`infra/docker-compose.yml`), com portas só em 127.0.0.1: Postgres **5444**, Redis
   **6390**, MinIO **9010** (API) e **9011** (console). Volumes nomeados `sii_pg`, `sii_redis`, `sii_minio`.
   Use `pnpm infra:up` (espera os três ficarem *healthy*), `infra:down`, `infra:logs` e `infra:ps`.
2. Imagens com versão fixa: `postgis/postgis:16-3.4-alpine`, `redis:7-alpine` e o MinIO
   `RELEASE.2025-09-07T16-13-09Z` **fixado por digest** (`minio/minio@sha256:14cea4…`). A MinIO parou de
   publicar imagens no Docker Hub e a tag `RELEASE…` não está mais disponível para pull. **Decisão da CTI
   (11/11/2026): o MinIO permanece.** No P20, guardar uma cópia dessa imagem (`docker save`) junto com os
   backups, para o deploy não depender do Docker Hub.
3. As extensões (`postgis`, `pg_trgm`, `pgcrypto`, `unaccent`) são criadas no init do Docker **e** na primeira
   migration (`IF NOT EXISTS`), para que o shadow database do Prisma e bancos novos fiquem iguais. O init cria
   também o banco `sii_teste`, usado pelos testes de integração.
4. **Prisma 7.10** com o generator `prisma-client` (`moduleFormat = "cjs"`, porque o Nest é CommonJS) e o
   driver adapter `@prisma/adapter-pg`. A URL vem do `prisma.config.ts`, que lê o `.env` da raiz. O client é
   gerado em `apps/api/src/generated/` e **não é commitado**: o turbo roda `db:generate` antes de dev, build,
   lint, typecheck e test.
5. **Um schema PostgreSQL por domínio** (`territorio` agora; `pessoas`, `educacao`… nos próximos prompts), o
   que facilita a Row-Level Security do P03. O `public` fica **fora** do Prisma porque o PostGIS guarda nele a
   `spatial_ref_sys`, que o Prisma tentaria apagar. Os schemas de carga bruta `stg_<fonte>` também ficam fora:
   são recriados pelo ogr2ogr e pelo worker.
6. Colunas PostGIS como `Unsupported("geometry(<Tipo>, 4674)")`. O Prisma 7 gera o índice GiST a partir de
   `@@index([geom], type: Gist)`, então o índice fica declarado no schema e não aparece como drift. SQL à mão
   só para o que o Prisma não expressa (extensões, schemas fora do Prisma).
7. `Setor` entra agora só como prova do PostGIS (código, nome, geometria). O P05 completa o modelo
   territorial e o P06 popula a partir do geoportal.
8. **Importação de shapefile no host** (`infra/scripts/import-shapefile.sh`), com o GDAL 3.8 da máquina,
   gravando em `stg_geoportal.<tabela>`. Ela recusa arquivo sem `.shx`/`.dbf`/`.prj`, lê a projeção de cada
   `.prj` (o geoportal mistura WGS 84, Web Mercator e SIRGAS) e reprojeta sempre para 4674. A senha vai por
   `PGPASSWORD`, não na linha de comando.
9. **Health check** em `/api/v1/health`: consulta `postgis_lib_version()` e faz `PING` no Redis em paralelo,
   com tempo limite de 2 s. Responde 200 (`ok`) ou 503 (`degradado`). O erro bruto vai só para o log, nunca
   na resposta. A API sobe mesmo com banco ou Redis fora (conexão preguiçosa), e o health mostra o problema.
10. Variáveis de ambiente validadas com zod na partida. A mensagem de erro cita a variável, nunca o valor.

## Consequências

- Subir do zero: `nvm use && pnpm i && pnpm infra:up && pnpm db:migrate && pnpm dev`.
- Testes: `pnpm test` não precisa de infra (banco e Redis simulados). Com a infra no ar, rode também
  `pnpm --filter @sii/api test:integracao` e `infra/scripts/import-shapefile.test.sh`.
- O worker vai usar o mesmo schema Prisma (P08). A forma de compartilhar o client entre api e worker fica para
  esse prompt.
