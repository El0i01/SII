-- P09 · conector do e-SUS PEC: carga lida direto da fonte, incremental (ADR 0008).
ALTER TABLE "auditoria"."log_carga"
  ADD COLUMN "modo" VARCHAR(12),
  ADD COLUMN "marca" VARCHAR(40),
  ADD COLUMN "resumo" JSONB;
