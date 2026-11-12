-- CreateIndex
CREATE INDEX "pessoa_mestra_data_nascimento_idx" ON "pessoas"."pessoa_mestra"("data_nascimento");

-- CreateIndex
CREATE INDEX "pessoa_mestra_nome_trgm" ON "pessoas"."pessoa_mestra" USING GIN ("nome_normalizado" gin_trgm_ops);

