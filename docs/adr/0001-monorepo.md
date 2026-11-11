# 0001 · Estrutura do monorepo

Data: 11/11/2026 · Situação: aceita · Prompt: P01

## Contexto

O SII tem API, worker, web e app de campo compartilhando regras de negócio e tipos. O CLAUDE.md fixa
Turborepo + pnpm, NestJS 10, Next.js 15 e Expo.

## Decisões

1. **Node 24 LTS**, fixado em `.nvmrc` e `engines`. O Node 20 da máquina saiu de suporte em abril de 2026,
   e o Expo SDK 58 exige Node 22 ou superior. Instalado pelo nvm no usuário; o padrão do nvm continua 20
   para não afetar os outros projetos (rode `nvm use` na raiz).
2. **TypeScript 5.9**, não o 7.0 (versão nativa recém-lançada): NestJS, Next e Expo ainda são testados no 5.x.
3. **Pacotes internos compilados**: `@sii/shared` sai em CommonJS (`dist/`) para ser lido pelo Nest/Jest sem
   transpilar fonte de fora; `@sii/config/tokens` sai em ESM. Turbo roda `^build` antes de dev, lint,
   typecheck e test.
4. **Tailwind 4** no lugar do "preset Tailwind" do CLAUDE.md: os tokens gov.br ficam num CSS com `@theme`
   (`packages/config/tokens/tokens.css`), que é o formato do Tailwind 4 e do shadcn/ui atual. O mobile usa o
   espelho em TypeScript (`@sii/config/tokens`). Mudou um, mude o outro.
5. **Testes**: Vitest no shared (limite de 100% de linhas, exigido no P04) e no web; Jest nos apps NestJS
   (unitário + e2e com supertest); jest-expo + Testing Library no mobile. Testes do mobile ficam em `src/`,
   nunca em `app/` (o expo-router transformaria o arquivo em rota).
6. **`pnpm dev`** sobe api (3333), web (3000) e worker; o mobile roda à parte (`pnpm --filter @sii/mobile start`).
7. O health check da API é o módulo **`status`** (`/api/v1/health`), para não colidir com o módulo de domínio
   `saude` (sinalizadores do e-SUS).
8. Sem `incremental` no tsconfig do Nest: com `deleteOutDir` do nest-cli, o `.tsbuildinfo` fora do `dist`
   fazia o tsc não emitir nada e o `nest start` falhava com "Cannot find module dist/main".
9. App mobile montado à mão: o `create-expo-app` 5.0.0 publicado no npm está quebrado (falta `@expo/env`).
   Versões escolhidas pelo `expo install` (SDK 58, React Native 0.88). O Metro resolve o workspace pnpm sem
   `node-linker=hoisted`.
10. Scripts `db:migrate` e `db:seed` entram no P02/P05, junto com o banco.

## Consequências

- Clonar e rodar: `nvm use && pnpm i && pnpm dev`.
- As portas padrão de Postgres, Redis e MinIO estão ocupadas nesta máquina; o `.env.example` já reserva
  5444, 6390 e 9010/9011 para o P02.
