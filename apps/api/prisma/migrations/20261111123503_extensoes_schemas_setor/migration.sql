-- Extensões exigidas pelo SII. Repetidas aqui (o init do Docker já cria) para que o shadow
-- database do Prisma e qualquer banco novo fiquem iguais. Escrito à mão.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Staging do geoportal (infra/scripts/import-shapefile.sh). Fora do Prisma de propósito.
CREATE SCHEMA IF NOT EXISTS "stg_geoportal";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "territorio";

-- CreateTable
CREATE TABLE "territorio"."setor" (
    "id" SERIAL NOT NULL,
    "codigo" VARCHAR(10) NOT NULL,
    "nome" VARCHAR(80) NOT NULL,
    "geom" geometry(MultiPolygon, 4674),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "setor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "setor_codigo_key" ON "territorio"."setor"("codigo");

-- CreateIndex
CREATE INDEX "setor_geom_gist" ON "territorio"."setor" USING GIST ("geom");
