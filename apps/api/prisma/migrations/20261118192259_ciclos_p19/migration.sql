-- AlterTable
ALTER TABLE "indicadores"."pesos_ivm" ADD COLUMN     "justificativa" VARCHAR(1000);

-- AlterTable
ALTER TABLE "pessoas"."membro_familia" ADD COLUMN     "grau_instrucao" VARCHAR(30),
ADD COLUMN     "sabe_ler" BOOLEAN;

-- CreateTable
CREATE TABLE "educacao"."oferta_creche" (
    "escola_id" INTEGER NOT NULL,
    "ano" SMALLINT NOT NULL,
    "vagas" INTEGER NOT NULL,
    "atualizado_por_id" INTEGER,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oferta_creche_pkey" PRIMARY KEY ("escola_id","ano")
);

-- AddForeignKey
ALTER TABLE "educacao"."oferta_creche" ADD CONSTRAINT "oferta_creche_escola_id_fkey" FOREIGN KEY ("escola_id") REFERENCES "educacao"."escola"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- P19 · Oferta de vagas de creche: sem dado pessoal; leitura para os dois papéis, escrita pela API (dono).
GRANT SELECT ON "educacao"."oferta_creche" TO sii_app, sii_auditor;
