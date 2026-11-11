-- CreateEnum
CREATE TYPE "auditoria"."TipoEventoIdentidade" AS ENUM ('LIGACAO_AUTOMATICA', 'REVISAO_ACEITA', 'REVISAO_REJEITADA', 'UNIAO_MANUAL', 'SEPARACAO');

-- AlterTable
ALTER TABLE "pessoas"."vinculo_fonte" ADD COLUMN     "dados" JSONB;

-- CreateTable
CREATE TABLE "auditoria"."evento_identidade" (
    "id" BIGSERIAL NOT NULL,
    "tipo" "auditoria"."TipoEventoIdentidade" NOT NULL,
    "pessoa_id" INTEGER NOT NULL,
    "outra_pessoa" INTEGER,
    "revisao_id" INTEGER,
    "vinculo_ids" INTEGER[],
    "usuario_id" INTEGER,
    "motivo" VARCHAR(300),
    "quando" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evento_identidade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "evento_identidade_pessoa_id_idx" ON "auditoria"."evento_identidade"("pessoa_id");

