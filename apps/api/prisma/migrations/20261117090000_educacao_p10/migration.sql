-- P10 · Educação: quem lançou a frequência e quando; uma matrícula por aluno, escola e ano (as
-- cargas da gestão escolar e da SEDUC fazem upsert por essa chave).
ALTER TABLE "educacao"."frequencia" ADD COLUMN     "atualizado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "lancado_por" INTEGER;

CREATE UNIQUE INDEX "matricula_pessoa_id_escola_id_ano_key" ON "educacao"."matricula"("pessoa_id", "escola_id", "ano");
