-- AlterEnum
ALTER TYPE "acesso"."Perfil" ADD VALUE 'ASSISTENCIA_GESTOR';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "auditoria"."StatusCarga" ADD VALUE 'AGUARDANDO';
ALTER TYPE "auditoria"."StatusCarga" ADD VALUE 'REJEITADA';

-- AlterTable
ALTER TABLE "auditoria"."log_carga" ADD COLUMN     "avisos" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "codificacao" VARCHAR(20),
ADD COLUMN     "etapa" VARCHAR(20),
ADD COLUMN     "ligados" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "novos" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "objeto" VARCHAR(200),
ADD COLUMN     "processados" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "revisao" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "separador" VARCHAR(5),
ADD COLUMN     "total" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "usuario_id" INTEGER;

-- AlterTable
ALTER TABLE "pessoas"."vinculo_fonte" ADD COLUMN     "carga_id" INTEGER;

-- CreateTable
CREATE TABLE "auditoria"."erro_carga" (
    "id" BIGSERIAL NOT NULL,
    "carga_id" INTEGER NOT NULL,
    "linha" INTEGER NOT NULL,
    "campo" VARCHAR(40) NOT NULL,
    "gravidade" VARCHAR(5) NOT NULL,
    "mensagem" VARCHAR(300) NOT NULL,

    CONSTRAINT "erro_carga_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "erro_carga_carga_id_linha_idx" ON "auditoria"."erro_carga"("carga_id", "linha");

-- CreateIndex
CREATE INDEX "log_carga_fonte_inicio_em_idx" ON "auditoria"."log_carga"("fonte", "inicio_em");

-- CreateIndex
CREATE INDEX "vinculo_fonte_carga_id_idx" ON "pessoas"."vinculo_fonte"("carga_id");

-- AddForeignKey
ALTER TABLE "auditoria"."erro_carga" ADD CONSTRAINT "erro_carga_carga_id_fkey" FOREIGN KEY ("carga_id") REFERENCES "auditoria"."log_carga"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Ponto focal do CadÚnico vê o município inteiro, como os gestores da SEMED e da Saúde (12/11/2026).
-- perfil_atual() devolve texto (current_setting): o valor novo do enum não é usado nesta transação.
CREATE OR REPLACE FUNCTION sii.ve_municipio() RETURNS boolean
  LANGUAGE sql STABLE AS
$$ SELECT coalesce(sii.perfil_atual() IN ('ADMIN_CTI', 'COMITE_GESTOR', 'SEMED_GESTOR', 'SAUDE_GESTOR', 'ASSISTENCIA_GESTOR'), false) $$;

-- auditoria.erro_carga fica sem grant para sii_app e sii_auditor, como o resto do schema auditoria.
