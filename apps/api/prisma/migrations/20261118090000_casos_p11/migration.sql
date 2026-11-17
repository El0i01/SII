-- P11 · avisos internos (sem dado pessoal, ADR 0010) e motivo maior na notificação (encaminhamento
-- manual). A tabela de avisos não tem RLS: só código do caso e texto fixo; a API filtra pelo destino.
-- CreateEnum
CREATE TYPE "casos"."DestinoAviso" AS ENUM ('ESCOLA', 'SECRETARIA', 'CRAS', 'COMITE');

-- AlterTable
ALTER TABLE "casos"."notificacao" ALTER COLUMN "motivo" SET DATA TYPE VARCHAR(2000);

-- CreateTable
CREATE TABLE "casos"."aviso" (
    "id" SERIAL NOT NULL,
    "destino_tipo" "casos"."DestinoAviso" NOT NULL,
    "destino_valor" VARCHAR(20) NOT NULL,
    "caso_id" INTEGER NOT NULL,
    "tipo" VARCHAR(20) NOT NULL,
    "texto" VARCHAR(300) NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lido_em" TIMESTAMPTZ(3),

    CONSTRAINT "aviso_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "aviso_destino_tipo_destino_valor_criado_em_idx" ON "casos"."aviso"("destino_tipo", "destino_valor", "criado_em");

-- CreateIndex
CREATE INDEX "aviso_caso_id_idx" ON "casos"."aviso"("caso_id");

-- AddForeignKey
ALTER TABLE "casos"."aviso" ADD CONSTRAINT "aviso_caso_id_fkey" FOREIGN KEY ("caso_id") REFERENCES "casos"."caso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- O auditor não lê avisos (têm o código do caso).
REVOKE ALL ON "casos"."aviso" FROM sii_auditor;
