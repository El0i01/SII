-- AlterTable
ALTER TABLE "territorio"."equipamento" ADD COLUMN     "codigo" VARCHAR(20);

-- CreateTable
CREATE TABLE "territorio"."limite_municipal" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "codigo_ibge" CHAR(7) NOT NULL,
    "nome" VARCHAR(80) NOT NULL,
    "geom" geometry(MultiPolygon, 4674),

    CONSTRAINT "limite_municipal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "territorio"."logradouro" (
    "id" SERIAL NOT NULL,
    "nome" VARCHAR(160) NOT NULL,
    "nome_normalizado" VARCHAR(160) NOT NULL,
    "tipo" VARCHAR(20),
    "extensao_km" REAL,
    "geom" geometry(MultiLineString, 4674),

    CONSTRAINT "logradouro_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "limite_municipal_geom_gist" ON "territorio"."limite_municipal" USING GIST ("geom");

-- CreateIndex
CREATE INDEX "logradouro_geom_gist" ON "territorio"."logradouro" USING GIST ("geom");

-- CreateIndex
CREATE INDEX "logradouro_nome_trgm" ON "territorio"."logradouro" USING GIN ("nome_normalizado" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "equipamento_codigo_key" ON "territorio"."equipamento"("codigo");

