-- CreateEnum
CREATE TYPE "indicadores"."FonteDespesa" AS ENUM ('API', 'CSV');

-- CreateTable
CREATE TABLE "indicadores"."meta_indicador" (
    "id" SERIAL NOT NULL,
    "indicador" VARCHAR(60) NOT NULL,
    "versao" INTEGER NOT NULL,
    "linha_base" DECIMAL(12,4),
    "data_base" DATE,
    "meta" DECIMAL(12,4) NOT NULL,
    "meta_texto" VARCHAR(60),
    "prazo" DATE,
    "aprovado_por_id" INTEGER,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meta_indicador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "indicadores"."despesa_programa" (
    "id" SERIAL NOT NULL,
    "ano" SMALLINT NOT NULL,
    "mes" SMALLINT NOT NULL,
    "programa" VARCHAR(40) NOT NULL,
    "valor_liquidado" DECIMAL(16,2) NOT NULL,
    "fonte" "indicadores"."FonteDespesa" NOT NULL,
    "carga_id" INTEGER,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "despesa_programa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "indicadores"."relatorio_semestral" (
    "id" SERIAL NOT NULL,
    "semestre" VARCHAR(7) NOT NULL,
    "formato" VARCHAR(4) NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "gerado_por_id" INTEGER NOT NULL,
    "gerado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "entregue_em" TIMESTAMPTZ(3),
    "entregue_por_id" INTEGER,

    CONSTRAINT "relatorio_semestral_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "meta_indicador_indicador_versao_key" ON "indicadores"."meta_indicador"("indicador", "versao");

-- CreateIndex
CREATE UNIQUE INDEX "despesa_programa_ano_mes_programa_key" ON "indicadores"."despesa_programa"("ano", "mes", "programa");

-- CreateIndex
CREATE INDEX "relatorio_semestral_semestre_idx" ON "indicadores"."relatorio_semestral"("semestre");

-- P16 · Indicadores e controle externo. As três tabelas são desidentificadas: leitura para os dois
-- papéis da aplicação (o auditor navega por elas); escrita só pelo dono (worker e API da CTI).
GRANT SELECT ON "indicadores"."meta_indicador", "indicadores"."despesa_programa",
  "indicadores"."relatorio_semestral" TO sii_app, sii_auditor;

-- Verificação da trilha pelo código do caso (auditor, Comitê, CTI, DPO). SECURITY DEFINER: devolve
-- só a integridade, o código verificador e o tipo e a data de cada evento. Nunca `dados`, autor
-- ou pessoa: o auditor confere a cadeia sem ler a trilha nominal.
CREATE OR REPLACE FUNCTION casos.verificar_trilha_codigo(p_codigo text)
  RETURNS TABLE (integra boolean, primeiro_seq_quebrado int, eventos int, verificador text,
                 seq int, tipo text, ocorrido_em timestamptz)
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS
$$
DECLARE
  v_caso int;
  v record;
BEGIN
  SELECT c.id INTO v_caso FROM casos.caso c WHERE c.codigo = upper(p_codigo);
  IF v_caso IS NULL THEN
    RETURN;
  END IF;
  SELECT * INTO v FROM casos.verificar_trilha(v_caso);
  RETURN QUERY
    SELECT v.integra, v.primeiro_seq_quebrado, v.eventos,
           CASE WHEN v.ultimo_hash IS NULL THEN NULL
                ELSE upper(substr(encode(v.ultimo_hash, 'hex'), 1, 4) || '-' ||
                           substr(encode(v.ultimo_hash, 'hex'), 5, 4) || '-' ||
                           substr(encode(v.ultimo_hash, 'hex'), 9, 4)) END,
           e.seq, e.tipo::text, e.ocorrido_em
    FROM casos.evento_caso e WHERE e.caso_id = v_caso ORDER BY e.seq;
END
$$;

REVOKE EXECUTE ON FUNCTION casos.verificar_trilha_codigo(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION casos.verificar_trilha_codigo(text) TO sii_app, sii_auditor;
