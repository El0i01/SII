-- CreateTable
CREATE TABLE "educacao"."calendario_parametros" (
    "escola_id" INTEGER NOT NULL,
    "ano" SMALLINT NOT NULL,
    "parametros" JSONB NOT NULL,
    "dias_letivos" SMALLINT NOT NULL,
    "atualizado_por" INTEGER,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calendario_parametros_pkey" PRIMARY KEY ("escola_id","ano")
);

-- AddForeignKey
ALTER TABLE "educacao"."calendario_parametros" ADD CONSTRAINT "calendario_parametros_escola_id_fkey" FOREIGN KEY ("escola_id") REFERENCES "educacao"."escola"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Escrito à mão: parâmetros de calendário não são nominais; leitura para os dois papéis.
GRANT SELECT ON educacao.calendario_parametros TO sii_app, sii_auditor;
