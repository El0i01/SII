FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/usr/local/bin NEXT_TELEMETRY_DISABLED=1 CI=true
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable && corepack prepare pnpm@9.15.9 --activate \
    && install -d -o node -g node /sii
WORKDIR /sii
USER node

FROM base AS workspace
COPY --chown=node:node . .

FROM workspace AS backend-build
RUN pnpm --filter @sii/api... --filter @sii/worker... install --frozen-lockfile \
    && pnpm --filter @sii/shared build \
    && DATABASE_URL=postgresql://localhost/sii pnpm --filter @sii/api db:generate \
    && pnpm --filter @sii/api build \
    && pnpm --filter @sii/worker build
FROM base AS backend-deps
COPY --chown=node:node .npmrc package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --chown=node:node apps/api/package.json apps/api/
COPY --chown=node:node apps/worker/package.json apps/worker/
COPY --chown=node:node packages/shared/package.json packages/shared/
RUN pnpm --filter @sii/api... --filter @sii/worker... install --prod --frozen-lockfile

FROM base AS backend
COPY --from=backend-deps --chown=node:node /sii/ /sii/
COPY --from=backend-build --chown=node:node /sii/apps/api/dist/ ./apps/api/dist/
COPY --from=backend-build --chown=node:node /sii/apps/worker/dist/ ./apps/worker/dist/
COPY --from=backend-build --chown=node:node /sii/packages/shared/dist/ ./packages/shared/dist/
COPY --chown=node:node apps/api/prisma/schema.prisma apps/api/prisma/
COPY --chown=node:node apps/api/prisma/migrations/ apps/api/prisma/migrations/
COPY --chown=node:node apps/api/prisma.config.ts apps/api/criar-admin.mjs apps/api/
COPY --chown=node:node apps/worker/config/ apps/worker/config/
ENV NODE_ENV=production
CMD ["node", "apps/api/dist/main.js"]

FROM workspace AS web-build
ENV NEXT_PUBLIC_API_URL=/api/v1
RUN pnpm --filter @sii/web... install --frozen-lockfile \
    && pnpm --filter @sii/config build \
    && pnpm --filter @sii/shared build \
    && SII_WEB_STANDALONE=1 pnpm --filter @sii/web build

FROM node:24-bookworm-slim AS web
WORKDIR /sii
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=web-build --chown=node:node /sii/apps/web/.next/standalone/ ./
COPY --from=web-build --chown=node:node /sii/apps/web/.next/static/ ./apps/web/.next/static/
COPY --from=web-build --chown=node:node /sii/apps/web/public/ ./apps/web/public/
USER node
CMD ["node", "apps/web/server.js"]
