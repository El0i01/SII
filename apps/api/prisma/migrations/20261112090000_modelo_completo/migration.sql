-- Schemas novos do P05. (Corrigido em 11/11/2026: o SQL foi gerado num banco em que o reset do
-- Prisma já tinha criado os schemas, e os CREATE SCHEMA tinham ficado de fora.)
CREATE SCHEMA IF NOT EXISTS "educacao";
CREATE SCHEMA IF NOT EXISTS "saude";
CREATE SCHEMA IF NOT EXISTS "assistencia";
CREATE SCHEMA IF NOT EXISTS "indicadores";
CREATE SCHEMA IF NOT EXISTS "auditoria";

-- CreateEnum
CREATE TYPE "territorio"."TipoSetor" AS ENUM ('URBANO', 'RURAL');

-- CreateEnum
CREATE TYPE "territorio"."SituacaoLote" AS ENUM ('REGULAR', 'SEM_INSCRICAO', 'REURB_EM_ANALISE', 'TITULADO', 'VAZIO');

-- CreateEnum
CREATE TYPE "territorio"."FonteGeo" AS ENUM ('CONFIRMADO_USUARIO', 'CENSO_GPS', 'LOTE', 'ESUS_TERRITORIO', 'CNEFE', 'SIGEF_CAR', 'SETOR');

-- CreateEnum
CREATE TYPE "territorio"."TipoEquipamento" AS ENUM ('ESCOLA', 'SAUDE', 'ASSISTENCIA', 'OUTRO');

-- CreateEnum
CREATE TYPE "territorio"."TipoAreaReferencia" AS ENUM ('MICROAREA', 'TERRITORIO_CRAS', 'ZONA_ESCOLA');

-- CreateEnum
CREATE TYPE "pessoas"."Sexo" AS ENUM ('FEMININO', 'MASCULINO');

-- CreateEnum
CREATE TYPE "pessoas"."PapelFamiliar" AS ENUM ('RESPONSAVEL', 'CONJUGE', 'FILHO', 'NETO', 'OUTRO');

-- CreateEnum
CREATE TYPE "pessoas"."FonteVinculo" AS ENUM ('ESUS', 'CADUNICO', 'GESTAO_ESCOLAR', 'CENSO', 'SEDUC', 'SINASC');

-- CreateEnum
CREATE TYPE "pessoas"."RegraVinculo" AS ENUM ('CPF', 'CNS_NIS', 'NOME_NASCIMENTO_MAE', 'MANUAL', 'SEED');

-- CreateEnum
CREATE TYPE "pessoas"."SituacaoRevisao" AS ENUM ('PENDENTE', 'ACEITA', 'REJEITADA', 'UNIDA');

-- CreateEnum
CREATE TYPE "educacao"."Rede" AS ENUM ('MUNICIPAL', 'ESTADUAL');

-- CreateEnum
CREATE TYPE "educacao"."SituacaoMatricula" AS ENUM ('ATIVA', 'TRANSFERIDA', 'ABANDONO', 'CONCLUIDA');

-- CreateEnum
CREATE TYPE "educacao"."SituacaoFrequencia" AS ENUM ('PRESENTE', 'FALTA', 'JUSTIFICADA');

-- CreateEnum
CREATE TYPE "educacao"."TipoAtendimentoEspecializado" AS ENUM ('SALA_RECURSOS', 'APAE');

-- CreateEnum
CREATE TYPE "assistencia"."FaixaRenda" AS ENUM ('EXTREMA_POBREZA', 'POBREZA', 'BAIXA_RENDA', 'ACIMA_MEIO_SALARIO');

-- CreateEnum
CREATE TYPE "assistencia"."TipoAcompanhamento" AS ENUM ('PAIF', 'PAEFI');

-- CreateEnum
CREATE TYPE "assistencia"."TipoBpc" AS ENUM ('IDOSO', 'PCD');

-- CreateEnum
CREATE TYPE "casos"."TipoEventoCaso" AS ENUM ('ALERTA_GERADO', 'ENCAMINHADO', 'NOTIFICACAO_ENVIADA', 'EM_ANALISE', 'VISITA_REALIZADA', 'PARECER_EMITIDO', 'ENCAMINHADO_CONSELHO_TUTELAR', 'DESFECHO');

-- CreateEnum
CREATE TYPE "casos"."StatusNotificacao" AS ENUM ('NOVA', 'EM_ANALISE', 'PARECER_EMITIDO');

-- CreateEnum
CREATE TYPE "casos"."Desfecho" AS ENUM ('RETORNO_ESCOLA_COMBINADO', 'ENCAMINHADO_SEMED_TRANSPORTE', 'AUSENCIA_JUSTIFICADA_SAUDE', 'ENCAMINHADO_CREAS', 'ENCAMINHADO_CONSELHO_TUTELAR', 'FAMILIA_NAO_LOCALIZADA');

-- CreateEnum
CREATE TYPE "casos"."TipoVisita" AS ENUM ('ACS', 'CRAS', 'CRIANCA_FELIZ', 'BUSCA_ATIVA');

-- CreateEnum
CREATE TYPE "auditoria"."StatusCarga" AS ENUM ('EXECUTANDO', 'OK', 'FALHOU');

-- AlterTable
ALTER TABLE "casos"."caso" ADD COLUMN     "alerta_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "atualizado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "codigo" VARCHAR(20) NOT NULL,
ADD COLUMN     "encerrado_em" TIMESTAMPTZ(3),
ADD COLUMN     "localidade" VARCHAR(40),
ADD COLUMN     "nivel" SMALLINT NOT NULL DEFAULT 0,
ADD COLUMN     "origem" VARCHAR(40),
ADD COLUMN     "prazo_em" DATE,
ADD COLUMN     "responsavel_usuario_id" INTEGER,
ADD COLUMN     "setor_codigo" VARCHAR(10);

-- AlterTable
ALTER TABLE "pessoas"."pessoa_mestra" ADD COLUMN     "atualizado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "cns_cifrado" BYTEA,
ADD COLUMN     "cns_hash" BYTEA,
ADD COLUMN     "cpf_cifrado" BYTEA,
ADD COLUMN     "cpf_hash" BYTEA,
ADD COLUMN     "data_nascimento" DATE,
ADD COLUMN     "domicilio_id" INTEGER,
ADD COLUMN     "nis_cifrado" BYTEA,
ADD COLUMN     "nis_hash" BYTEA,
ADD COLUMN     "nome_mae" VARCHAR(160),
ADD COLUMN     "nome_normalizado" VARCHAR(160) NOT NULL,
ADD COLUMN     "sexo" "pessoas"."Sexo";

-- AlterTable
ALTER TABLE "territorio"."setor" ADD COLUMN     "tipo" "territorio"."TipoSetor" NOT NULL DEFAULT 'URBANO';

-- CreateTable
CREATE TABLE "territorio"."quadra" (
    "id" SERIAL NOT NULL,
    "setor_id" INTEGER NOT NULL,
    "codigo" VARCHAR(10) NOT NULL,
    "provisoria" BOOLEAN NOT NULL DEFAULT true,
    "geom" geometry(MultiPolygon, 4674),

    CONSTRAINT "quadra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "territorio"."lote" (
    "id" SERIAL NOT NULL,
    "quadra_id" INTEGER NOT NULL,
    "numero" SMALLINT NOT NULL,
    "situacao" "territorio"."SituacaoLote" NOT NULL DEFAULT 'REGULAR',
    "inscricao" VARCHAR(30),
    "geom" geometry(MultiPolygon, 4674),

    CONSTRAINT "lote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "territorio"."domicilio" (
    "id" SERIAL NOT NULL,
    "lote_id" INTEGER,
    "setor_id" INTEGER NOT NULL,
    "localidade" VARCHAR(60),
    "geo_fonte" "territorio"."FonteGeo",
    "geo_precisao_m" REAL,
    "ponto" geometry(Point, 4674),
    "confirmado_em" TIMESTAMPTZ(3),
    "moradores" SMALLINT,

    CONSTRAINT "domicilio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "territorio"."equipamento" (
    "id" SERIAL NOT NULL,
    "tipo" "territorio"."TipoEquipamento" NOT NULL,
    "nome" VARCHAR(160) NOT NULL,
    "codigo_inep" VARCHAR(8),
    "codigo_cnes" VARCHAR(7),
    "codigo_cadsuas" VARCHAR(20),
    "endereco" VARCHAR(200),
    "principal_id" INTEGER,
    "geom" geometry(Geometry, 4674),

    CONSTRAINT "equipamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "territorio"."area_referencia" (
    "id" SERIAL NOT NULL,
    "tipo" "territorio"."TipoAreaReferencia" NOT NULL,
    "codigo" VARCHAR(40) NOT NULL,
    "nome" VARCHAR(120),
    "equipamento_id" INTEGER,
    "geom" geometry(MultiPolygon, 4674),

    CONSTRAINT "area_referencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pessoas"."familia" (
    "id" SERIAL NOT NULL,
    "codigo_familiar" VARCHAR(20),
    "domicilio_id" INTEGER,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "familia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pessoas"."membro_familia" (
    "familia_id" INTEGER NOT NULL,
    "pessoa_id" INTEGER NOT NULL,
    "papel" "pessoas"."PapelFamiliar" NOT NULL,

    CONSTRAINT "membro_familia_pkey" PRIMARY KEY ("familia_id","pessoa_id")
);

-- CreateTable
CREATE TABLE "pessoas"."vinculo_fonte" (
    "id" SERIAL NOT NULL,
    "pessoa_id" INTEGER NOT NULL,
    "fonte" "pessoas"."FonteVinculo" NOT NULL,
    "id_externo" VARCHAR(60) NOT NULL,
    "regra" "pessoas"."RegraVinculo" NOT NULL,
    "confianca" DECIMAL(3,2) NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vinculo_fonte_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pessoas"."revisao_vinculo" (
    "id" SERIAL NOT NULL,
    "pessoa_a_id" INTEGER NOT NULL,
    "pessoa_b_id" INTEGER NOT NULL,
    "similaridade" DECIMAL(3,2) NOT NULL,
    "situacao" "pessoas"."SituacaoRevisao" NOT NULL DEFAULT 'PENDENTE',
    "decidido_por" INTEGER,
    "decidido_em" TIMESTAMPTZ(3),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "revisao_vinculo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "educacao"."escola" (
    "id" SERIAL NOT NULL,
    "inep" VARCHAR(8) NOT NULL,
    "nome" VARCHAR(160) NOT NULL,
    "rede" "educacao"."Rede" NOT NULL,
    "rural" BOOLEAN NOT NULL DEFAULT false,
    "equipamento_id" INTEGER,

    CONSTRAINT "escola_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "educacao"."turma" (
    "id" SERIAL NOT NULL,
    "escola_id" INTEGER NOT NULL,
    "ano" SMALLINT NOT NULL,
    "nome" VARCHAR(60) NOT NULL,

    CONSTRAINT "turma_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "educacao"."matricula" (
    "id" SERIAL NOT NULL,
    "pessoa_id" INTEGER NOT NULL,
    "escola_id" INTEGER NOT NULL,
    "turma_id" INTEGER,
    "ano" SMALLINT NOT NULL,
    "situacao" "educacao"."SituacaoMatricula" NOT NULL DEFAULT 'ATIVA',
    "inicio_em" DATE NOT NULL,

    CONSTRAINT "matricula_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "educacao"."calendario_escolar" (
    "escola_id" INTEGER NOT NULL,
    "dia" DATE NOT NULL,

    CONSTRAINT "calendario_escolar_pkey" PRIMARY KEY ("escola_id","dia")
);

-- CreateTable
CREATE TABLE "educacao"."frequencia" (
    "id" BIGSERIAL NOT NULL,
    "matricula_id" INTEGER NOT NULL,
    "dia" DATE NOT NULL,
    "situacao" "educacao"."SituacaoFrequencia" NOT NULL,

    CONSTRAINT "frequencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "educacao"."fila_creche" (
    "id" SERIAL NOT NULL,
    "pessoa_id" INTEGER NOT NULL,
    "escola_id" INTEGER,
    "inscrita_em" DATE NOT NULL,
    "criterios" JSONB NOT NULL DEFAULT '{}',
    "posicao" INTEGER,
    "atendida" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "fila_creche_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "educacao"."atendimento_especializado" (
    "id" SERIAL NOT NULL,
    "pessoa_id" INTEGER NOT NULL,
    "tipo" "educacao"."TipoAtendimentoEspecializado" NOT NULL,
    "inicio_em" DATE,

    CONSTRAINT "atendimento_especializado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saude"."sinalizador_saude" (
    "pessoa_id" INTEGER NOT NULL,
    "ubs_cnes" VARCHAR(7),
    "microarea" VARCHAR(40),
    "acs_responsavel" VARCHAR(80),
    "ultima_visita_acs" DATE,
    "vacinacao_em_dia" BOOLEAN,
    "vacina_gripe_em_dia" BOOLEAN,
    "pre_natal_adequado" BOOLEAN,
    "acamado_domiciliado" BOOLEAN,
    "condicao_cronica" BOOLEAN,
    "condicao_cronica_acompanhada" BOOLEAN,
    "necessita_atendimento_especializado" BOOLEAN,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sinalizador_saude_pkey" PRIMARY KEY ("pessoa_id")
);

-- CreateTable
CREATE TABLE "assistencia"."cadunico_familia" (
    "id" SERIAL NOT NULL,
    "familia_id" INTEGER NOT NULL,
    "mes_referencia" CHAR(7) NOT NULL,
    "faixa_renda" "assistencia"."FaixaRenda" NOT NULL,
    "recebe_pbf" BOOLEAN NOT NULL,
    "qtd_membros" SMALLINT NOT NULL,
    "atualizado_em" DATE NOT NULL,

    CONSTRAINT "cadunico_familia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistencia"."acompanhamento_paif" (
    "id" SERIAL NOT NULL,
    "familia_id" INTEGER NOT NULL,
    "tipo" "assistencia"."TipoAcompanhamento" NOT NULL,
    "cras_codigo" VARCHAR(20) NOT NULL,
    "inicio_em" DATE NOT NULL,
    "ultimo_atendimento_em" DATE,
    "fim_em" DATE,

    CONSTRAINT "acompanhamento_paif_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistencia"."bpc" (
    "id" SERIAL NOT NULL,
    "pessoa_id" INTEGER NOT NULL,
    "tipo" "assistencia"."TipoBpc" NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "bpc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistencia"."scfv" (
    "id" SERIAL NOT NULL,
    "pessoa_id" INTEGER NOT NULL,
    "faixa_etaria" VARCHAR(20) NOT NULL,
    "inicio_em" DATE NOT NULL,

    CONSTRAINT "scfv_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistencia"."crianca_feliz" (
    "id" SERIAL NOT NULL,
    "pessoa_id" INTEGER NOT NULL,
    "visitador" VARCHAR(80) NOT NULL,
    "ultima_visita_em" DATE,
    "frequencia_esperada" VARCHAR(20) NOT NULL DEFAULT 'SEMANAL',
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "crianca_feliz_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "casos"."evento_caso" (
    "id" BIGSERIAL NOT NULL,
    "caso_id" INTEGER NOT NULL,
    "seq" INTEGER NOT NULL DEFAULT 0,
    "tipo" "casos"."TipoEventoCaso" NOT NULL,
    "ocorrido_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "autor_id" INTEGER,
    "dados" JSONB NOT NULL DEFAULT '{}',
    "hash_anterior" BYTEA NOT NULL,
    "hash" BYTEA NOT NULL,

    CONSTRAINT "evento_caso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "casos"."notificacao" (
    "id" SERIAL NOT NULL,
    "codigo" VARCHAR(20) NOT NULL,
    "caso_id" INTEGER NOT NULL,
    "origem" VARCHAR(20) NOT NULL DEFAULT 'ESCOLA',
    "destino_cras_codigo" VARCHAR(20) NOT NULL,
    "motivo" VARCHAR(200) NOT NULL,
    "status" "casos"."StatusNotificacao" NOT NULL DEFAULT 'NOVA',
    "criada_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "prazo_em" DATE NOT NULL,

    CONSTRAINT "notificacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "casos"."parecer" (
    "id" SERIAL NOT NULL,
    "notificacao_id" INTEGER NOT NULL,
    "desfecho" "casos"."Desfecho" NOT NULL,
    "texto" VARCHAR(4000) NOT NULL,
    "autor_id" INTEGER,
    "autor_descricao" VARCHAR(80),
    "nova_visita" BOOLEAN NOT NULL DEFAULT false,
    "data_nova_visita" DATE,
    "emitido_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parecer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "casos"."visita" (
    "id" SERIAL NOT NULL,
    "id_local" UUID NOT NULL,
    "tipo" "casos"."TipoVisita" NOT NULL,
    "caso_id" INTEGER,
    "autor_id" INTEGER,
    "pessoa_ids" INTEGER[],
    "realizada_em" TIMESTAMPTZ(3) NOT NULL,
    "situacao" VARCHAR(2000) NOT NULL,
    "encaminhamentos" JSONB NOT NULL DEFAULT '[]',
    "ponto" geometry(Point, 4674),
    "precisao_m" REAL,
    "pino_confirmado" BOOLEAN NOT NULL DEFAULT false,
    "recebida_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visita_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "indicadores"."indicador_snapshot" (
    "id" SERIAL NOT NULL,
    "objetivo" VARCHAR(10) NOT NULL,
    "indicador" VARCHAR(60) NOT NULL,
    "territorio_codigo" VARCHAR(20) NOT NULL,
    "periodo" VARCHAR(10) NOT NULL,
    "numerador" INTEGER,
    "denominador" INTEGER,
    "valor" DECIMAL(12,4),
    "suprimido" BOOLEAN NOT NULL DEFAULT false,
    "calculado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "indicador_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "indicadores"."pesos_ivm" (
    "id" SERIAL NOT NULL,
    "versao" INTEGER NOT NULL,
    "pesos" JSONB NOT NULL,
    "aprovado_por_id" INTEGER,
    "aprovado_em" TIMESTAMPTZ(3),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pesos_ivm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "indicadores"."dimensao_ivm_quadra" (
    "quadra_id" INTEGER NOT NULL,
    "periodo" VARCHAR(7) NOT NULL,
    "renda" DECIMAL(5,4) NOT NULL,
    "saude" DECIMAL(5,4) NOT NULL,
    "escola" DECIMAL(5,4) NOT NULL,
    "imovel" DECIMAL(5,4) NOT NULL,
    "regularizacao" DECIMAL(5,4) NOT NULL,

    CONSTRAINT "dimensao_ivm_quadra_pkey" PRIMARY KEY ("quadra_id","periodo")
);

-- CreateTable
CREATE TABLE "auditoria"."acesso_dado_pessoal" (
    "id" BIGSERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "perfil" VARCHAR(20) NOT NULL,
    "pessoa_id" INTEGER,
    "registro" VARCHAR(30),
    "campo" VARCHAR(10) NOT NULL,
    "finalidade" VARCHAR(300) NOT NULL,
    "ip" VARCHAR(45),
    "quando" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "acesso_dado_pessoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditoria"."log_carga" (
    "id" SERIAL NOT NULL,
    "fonte" VARCHAR(30) NOT NULL,
    "status" "auditoria"."StatusCarga" NOT NULL DEFAULT 'EXECUTANDO',
    "arquivo" VARCHAR(200),
    "mes_referencia" CHAR(7),
    "inicio_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fim_em" TIMESTAMPTZ(3),
    "lidos" INTEGER NOT NULL DEFAULT 0,
    "inseridos" INTEGER NOT NULL DEFAULT 0,
    "rejeitados" INTEGER NOT NULL DEFAULT 0,
    "erro" VARCHAR(1000),

    CONSTRAINT "log_carga_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quadra_geom_gist" ON "territorio"."quadra" USING GIST ("geom");

-- CreateIndex
CREATE UNIQUE INDEX "quadra_setor_id_codigo_key" ON "territorio"."quadra"("setor_id", "codigo");

-- CreateIndex
CREATE INDEX "lote_geom_gist" ON "territorio"."lote" USING GIST ("geom");

-- CreateIndex
CREATE UNIQUE INDEX "lote_quadra_id_numero_key" ON "territorio"."lote"("quadra_id", "numero");

-- CreateIndex
CREATE INDEX "domicilio_ponto_gist" ON "territorio"."domicilio" USING GIST ("ponto");

-- CreateIndex
CREATE UNIQUE INDEX "equipamento_codigo_inep_key" ON "territorio"."equipamento"("codigo_inep");

-- CreateIndex
CREATE UNIQUE INDEX "equipamento_codigo_cnes_key" ON "territorio"."equipamento"("codigo_cnes");

-- CreateIndex
CREATE UNIQUE INDEX "equipamento_codigo_cadsuas_key" ON "territorio"."equipamento"("codigo_cadsuas");

-- CreateIndex
CREATE INDEX "equipamento_geom_gist" ON "territorio"."equipamento" USING GIST ("geom");

-- CreateIndex
CREATE INDEX "area_referencia_geom_gist" ON "territorio"."area_referencia" USING GIST ("geom");

-- CreateIndex
CREATE UNIQUE INDEX "area_referencia_tipo_codigo_key" ON "territorio"."area_referencia"("tipo", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "familia_codigo_familiar_key" ON "pessoas"."familia"("codigo_familiar");

-- CreateIndex
CREATE INDEX "membro_familia_pessoa_id_idx" ON "pessoas"."membro_familia"("pessoa_id");

-- CreateIndex
CREATE INDEX "vinculo_fonte_pessoa_id_idx" ON "pessoas"."vinculo_fonte"("pessoa_id");

-- CreateIndex
CREATE UNIQUE INDEX "vinculo_fonte_fonte_id_externo_key" ON "pessoas"."vinculo_fonte"("fonte", "id_externo");

-- CreateIndex
CREATE INDEX "revisao_vinculo_situacao_idx" ON "pessoas"."revisao_vinculo"("situacao");

-- CreateIndex
CREATE UNIQUE INDEX "escola_inep_key" ON "educacao"."escola"("inep");

-- CreateIndex
CREATE UNIQUE INDEX "escola_equipamento_id_key" ON "educacao"."escola"("equipamento_id");

-- CreateIndex
CREATE UNIQUE INDEX "turma_escola_id_ano_nome_key" ON "educacao"."turma"("escola_id", "ano", "nome");

-- CreateIndex
CREATE INDEX "matricula_pessoa_id_idx" ON "educacao"."matricula"("pessoa_id");

-- CreateIndex
CREATE INDEX "matricula_escola_id_situacao_idx" ON "educacao"."matricula"("escola_id", "situacao");

-- CreateIndex
CREATE UNIQUE INDEX "frequencia_matricula_id_dia_key" ON "educacao"."frequencia"("matricula_id", "dia");

-- CreateIndex
CREATE INDEX "fila_creche_pessoa_id_idx" ON "educacao"."fila_creche"("pessoa_id");

-- CreateIndex
CREATE UNIQUE INDEX "atendimento_especializado_pessoa_id_tipo_key" ON "educacao"."atendimento_especializado"("pessoa_id", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "cadunico_familia_familia_id_mes_referencia_key" ON "assistencia"."cadunico_familia"("familia_id", "mes_referencia");

-- CreateIndex
CREATE INDEX "acompanhamento_paif_familia_id_idx" ON "assistencia"."acompanhamento_paif"("familia_id");

-- CreateIndex
CREATE INDEX "bpc_pessoa_id_idx" ON "assistencia"."bpc"("pessoa_id");

-- CreateIndex
CREATE INDEX "scfv_pessoa_id_idx" ON "assistencia"."scfv"("pessoa_id");

-- CreateIndex
CREATE INDEX "crianca_feliz_pessoa_id_idx" ON "assistencia"."crianca_feliz"("pessoa_id");

-- CreateIndex
CREATE UNIQUE INDEX "evento_caso_caso_id_seq_key" ON "casos"."evento_caso"("caso_id", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "notificacao_codigo_key" ON "casos"."notificacao"("codigo");

-- CreateIndex
CREATE INDEX "notificacao_caso_id_idx" ON "casos"."notificacao"("caso_id");

-- CreateIndex
CREATE INDEX "notificacao_status_idx" ON "casos"."notificacao"("status");

-- CreateIndex
CREATE UNIQUE INDEX "parecer_notificacao_id_key" ON "casos"."parecer"("notificacao_id");

-- CreateIndex
CREATE UNIQUE INDEX "visita_id_local_key" ON "casos"."visita"("id_local");

-- CreateIndex
CREATE INDEX "visita_caso_id_idx" ON "casos"."visita"("caso_id");

-- CreateIndex
CREATE UNIQUE INDEX "indicador_snapshot_indicador_territorio_codigo_periodo_key" ON "indicadores"."indicador_snapshot"("indicador", "territorio_codigo", "periodo");

-- CreateIndex
CREATE UNIQUE INDEX "pesos_ivm_versao_key" ON "indicadores"."pesos_ivm"("versao");

-- CreateIndex
CREATE INDEX "acesso_dado_pessoal_pessoa_id_quando_idx" ON "auditoria"."acesso_dado_pessoal"("pessoa_id", "quando");

-- CreateIndex
CREATE INDEX "acesso_dado_pessoal_usuario_id_quando_idx" ON "auditoria"."acesso_dado_pessoal"("usuario_id", "quando");

-- CreateIndex
CREATE UNIQUE INDEX "caso_codigo_key" ON "casos"."caso"("codigo");

-- CreateIndex
CREATE INDEX "caso_tipo_status_idx" ON "casos"."caso"("tipo", "status");

-- CreateIndex
CREATE UNIQUE INDEX "pessoa_mestra_cpf_hash_key" ON "pessoas"."pessoa_mestra"("cpf_hash");

-- CreateIndex
CREATE UNIQUE INDEX "pessoa_mestra_nis_hash_key" ON "pessoas"."pessoa_mestra"("nis_hash");

-- CreateIndex
CREATE UNIQUE INDEX "pessoa_mestra_cns_hash_key" ON "pessoas"."pessoa_mestra"("cns_hash");

-- CreateIndex
CREATE INDEX "pessoa_mestra_nome_normalizado_idx" ON "pessoas"."pessoa_mestra"("nome_normalizado");

-- CreateIndex
CREATE INDEX "pessoa_mestra_setor_codigo_idx" ON "pessoas"."pessoa_mestra"("setor_codigo");

-- AddForeignKey
ALTER TABLE "pessoas"."pessoa_mestra" ADD CONSTRAINT "pessoa_mestra_domicilio_id_fkey" FOREIGN KEY ("domicilio_id") REFERENCES "territorio"."domicilio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "territorio"."quadra" ADD CONSTRAINT "quadra_setor_id_fkey" FOREIGN KEY ("setor_id") REFERENCES "territorio"."setor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "territorio"."lote" ADD CONSTRAINT "lote_quadra_id_fkey" FOREIGN KEY ("quadra_id") REFERENCES "territorio"."quadra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "territorio"."domicilio" ADD CONSTRAINT "domicilio_lote_id_fkey" FOREIGN KEY ("lote_id") REFERENCES "territorio"."lote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "territorio"."domicilio" ADD CONSTRAINT "domicilio_setor_id_fkey" FOREIGN KEY ("setor_id") REFERENCES "territorio"."setor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "territorio"."equipamento" ADD CONSTRAINT "equipamento_principal_id_fkey" FOREIGN KEY ("principal_id") REFERENCES "territorio"."equipamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "territorio"."area_referencia" ADD CONSTRAINT "area_referencia_equipamento_id_fkey" FOREIGN KEY ("equipamento_id") REFERENCES "territorio"."equipamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pessoas"."familia" ADD CONSTRAINT "familia_domicilio_id_fkey" FOREIGN KEY ("domicilio_id") REFERENCES "territorio"."domicilio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pessoas"."membro_familia" ADD CONSTRAINT "membro_familia_familia_id_fkey" FOREIGN KEY ("familia_id") REFERENCES "pessoas"."familia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pessoas"."membro_familia" ADD CONSTRAINT "membro_familia_pessoa_id_fkey" FOREIGN KEY ("pessoa_id") REFERENCES "pessoas"."pessoa_mestra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pessoas"."vinculo_fonte" ADD CONSTRAINT "vinculo_fonte_pessoa_id_fkey" FOREIGN KEY ("pessoa_id") REFERENCES "pessoas"."pessoa_mestra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "educacao"."escola" ADD CONSTRAINT "escola_equipamento_id_fkey" FOREIGN KEY ("equipamento_id") REFERENCES "territorio"."equipamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "educacao"."turma" ADD CONSTRAINT "turma_escola_id_fkey" FOREIGN KEY ("escola_id") REFERENCES "educacao"."escola"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "educacao"."matricula" ADD CONSTRAINT "matricula_pessoa_id_fkey" FOREIGN KEY ("pessoa_id") REFERENCES "pessoas"."pessoa_mestra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "educacao"."matricula" ADD CONSTRAINT "matricula_escola_id_fkey" FOREIGN KEY ("escola_id") REFERENCES "educacao"."escola"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "educacao"."matricula" ADD CONSTRAINT "matricula_turma_id_fkey" FOREIGN KEY ("turma_id") REFERENCES "educacao"."turma"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "educacao"."calendario_escolar" ADD CONSTRAINT "calendario_escolar_escola_id_fkey" FOREIGN KEY ("escola_id") REFERENCES "educacao"."escola"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "educacao"."frequencia" ADD CONSTRAINT "frequencia_matricula_id_fkey" FOREIGN KEY ("matricula_id") REFERENCES "educacao"."matricula"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "educacao"."fila_creche" ADD CONSTRAINT "fila_creche_pessoa_id_fkey" FOREIGN KEY ("pessoa_id") REFERENCES "pessoas"."pessoa_mestra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "educacao"."fila_creche" ADD CONSTRAINT "fila_creche_escola_id_fkey" FOREIGN KEY ("escola_id") REFERENCES "educacao"."escola"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "educacao"."atendimento_especializado" ADD CONSTRAINT "atendimento_especializado_pessoa_id_fkey" FOREIGN KEY ("pessoa_id") REFERENCES "pessoas"."pessoa_mestra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saude"."sinalizador_saude" ADD CONSTRAINT "sinalizador_saude_pessoa_id_fkey" FOREIGN KEY ("pessoa_id") REFERENCES "pessoas"."pessoa_mestra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistencia"."cadunico_familia" ADD CONSTRAINT "cadunico_familia_familia_id_fkey" FOREIGN KEY ("familia_id") REFERENCES "pessoas"."familia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistencia"."acompanhamento_paif" ADD CONSTRAINT "acompanhamento_paif_familia_id_fkey" FOREIGN KEY ("familia_id") REFERENCES "pessoas"."familia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistencia"."bpc" ADD CONSTRAINT "bpc_pessoa_id_fkey" FOREIGN KEY ("pessoa_id") REFERENCES "pessoas"."pessoa_mestra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistencia"."scfv" ADD CONSTRAINT "scfv_pessoa_id_fkey" FOREIGN KEY ("pessoa_id") REFERENCES "pessoas"."pessoa_mestra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistencia"."crianca_feliz" ADD CONSTRAINT "crianca_feliz_pessoa_id_fkey" FOREIGN KEY ("pessoa_id") REFERENCES "pessoas"."pessoa_mestra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "casos"."evento_caso" ADD CONSTRAINT "evento_caso_caso_id_fkey" FOREIGN KEY ("caso_id") REFERENCES "casos"."caso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "casos"."notificacao" ADD CONSTRAINT "notificacao_caso_id_fkey" FOREIGN KEY ("caso_id") REFERENCES "casos"."caso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "casos"."parecer" ADD CONSTRAINT "parecer_notificacao_id_fkey" FOREIGN KEY ("notificacao_id") REFERENCES "casos"."notificacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "casos"."visita" ADD CONSTRAINT "visita_caso_id_fkey" FOREIGN KEY ("caso_id") REFERENCES "casos"."caso"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "indicadores"."dimensao_ivm_quadra" ADD CONSTRAINT "dimensao_ivm_quadra_quadra_id_fkey" FOREIGN KEY ("quadra_id") REFERENCES "territorio"."quadra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Escrito à mão (P05): grants, Row-Level Security das tabelas nominais novas e trilha append-only.
-- Regra (ADR 0003): toda tabela nominal entra com RLS + FORCE + policy na mesma migration.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- ── Grants ─────────────────────────────────────────────────────────────────────────────────────
-- Território (não nominal) e cadastros públicos: os dois papéis leem.
GRANT SELECT ON ALL TABLES IN SCHEMA territorio TO sii_app, sii_auditor;
GRANT USAGE ON SCHEMA educacao, indicadores TO sii_app, sii_auditor;
GRANT SELECT ON educacao.escola, educacao.turma, educacao.calendario_escolar TO sii_app, sii_auditor;
GRANT SELECT ON ALL TABLES IN SCHEMA indicadores TO sii_app, sii_auditor;
ALTER DEFAULT PRIVILEGES IN SCHEMA indicadores GRANT SELECT ON TABLES TO sii_app, sii_auditor;

-- Nominal: só sii_app (filtrado por RLS). sii_auditor não recebe nada aqui.
GRANT USAGE ON SCHEMA saude, assistencia TO sii_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON educacao.matricula, educacao.frequencia, educacao.fila_creche,
  educacao.atendimento_especializado TO sii_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA saude, assistencia TO sii_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA educacao, saude, assistencia TO sii_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA saude, assistencia GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sii_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA saude, assistencia GRANT USAGE, SELECT ON SEQUENCES TO sii_app;
REVOKE ALL ON SCHEMA saude, assistencia, auditoria FROM PUBLIC;
-- Auditoria: só o dono (a API) lê e grava. Nem sii_app nem sii_auditor.

-- ── RLS: visibilidade herdada da pessoa ──────────────────────────────────────────────────────────
-- Padrão: a linha é visível se a pessoa for visível (a subconsulta passa pela RLS de pessoa_mestra).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'pessoas.membro_familia', 'pessoas.vinculo_fonte',
    'educacao.matricula', 'educacao.fila_creche', 'educacao.atendimento_especializado',
    'saude.sinalizador_saude',
    'assistencia.bpc', 'assistencia.scfv', 'assistencia.crianca_feliz'
  ] LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY pessoa_visivel ON %s FOR ALL TO sii_app
         USING (EXISTS (SELECT 1 FROM pessoas.pessoa_mestra p WHERE p.id = pessoa_id))', t);
  END LOOP;
END
$$;

-- Família: visível se algum membro for visível.
ALTER TABLE pessoas.familia ENABLE ROW LEVEL SECURITY;
ALTER TABLE pessoas.familia FORCE ROW LEVEL SECURITY;
CREATE POLICY familia_visivel ON pessoas.familia FOR ALL TO sii_app
  USING (EXISTS (SELECT 1 FROM pessoas.membro_familia m WHERE m.familia_id = id));

-- Revisão de vínculo: visível se uma das duas pessoas for visível.
ALTER TABLE pessoas.revisao_vinculo ENABLE ROW LEVEL SECURITY;
ALTER TABLE pessoas.revisao_vinculo FORCE ROW LEVEL SECURITY;
CREATE POLICY revisao_visivel ON pessoas.revisao_vinculo FOR ALL TO sii_app
  USING (EXISTS (SELECT 1 FROM pessoas.pessoa_mestra p WHERE p.id IN (pessoa_a_id, pessoa_b_id)));

-- Frequência: pela matrícula.
ALTER TABLE educacao.frequencia ENABLE ROW LEVEL SECURITY;
ALTER TABLE educacao.frequencia FORCE ROW LEVEL SECURITY;
CREATE POLICY frequencia_visivel ON educacao.frequencia FOR ALL TO sii_app
  USING (EXISTS (SELECT 1 FROM educacao.matricula m WHERE m.id = matricula_id));

-- CadÚnico e PAIF/PAEFI: pela família.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['assistencia.cadunico_familia', 'assistencia.acompanhamento_paif'] LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY familia_visivel ON %s FOR ALL TO sii_app
         USING (EXISTS (SELECT 1 FROM pessoas.familia f WHERE f.id = familia_id))', t);
  END LOOP;
END
$$;

-- Filhas do caso: pelo caso (que herda a visibilidade da pessoa).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['casos.evento_caso', 'casos.notificacao'] LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY caso_visivel ON %s FOR ALL TO sii_app
         USING (EXISTS (SELECT 1 FROM casos.caso c WHERE c.id = caso_id))', t);
  END LOOP;
END
$$;

ALTER TABLE casos.parecer ENABLE ROW LEVEL SECURITY;
ALTER TABLE casos.parecer FORCE ROW LEVEL SECURITY;
CREATE POLICY parecer_visivel ON casos.parecer FOR ALL TO sii_app
  USING (EXISTS (SELECT 1 FROM casos.notificacao n WHERE n.id = notificacao_id));

-- Visita: visível se alguma das pessoas atendidas for visível.
ALTER TABLE casos.visita ENABLE ROW LEVEL SECURITY;
ALTER TABLE casos.visita FORCE ROW LEVEL SECURITY;
CREATE POLICY visita_visivel ON casos.visita FOR ALL TO sii_app
  USING (EXISTS (SELECT 1 FROM pessoas.pessoa_mestra p WHERE p.id = ANY (pessoa_ids)));

-- ── Trilha do caso: append-only e encadeada por hash ─────────────────────────────────────────────
-- O hash é calculado pelo banco, não pela aplicação: quem grava não consegue forjar a cadeia.
-- hash = sha256(hash_anterior || caso|seq|tipo|ocorrido_em(UTC, ms)|autor|dados)

CREATE OR REPLACE FUNCTION casos.hash_evento(
  p_anterior bytea, p_caso int, p_seq int, p_tipo text, p_ocorrido timestamptz, p_autor int, p_dados jsonb
) RETURNS bytea
  LANGUAGE sql IMMUTABLE AS
$$
  SELECT public.digest(
    p_anterior || convert_to(concat_ws('|',
      p_caso, p_seq, p_tipo,
      to_char(p_ocorrido AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      coalesce(p_autor::text, ''),
      p_dados::text), 'UTF8'),
    'sha256')
$$;

CREATE OR REPLACE FUNCTION casos.evento_caso_encadear() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS
$$
DECLARE
  ultimo_seq int;
  ultimo_hash bytea;
BEGIN
  -- Trava o caso: dois eventos simultâneos do mesmo caso entram um depois do outro.
  PERFORM 1 FROM casos.caso WHERE id = NEW.caso_id FOR UPDATE;
  SELECT e.seq, e.hash INTO ultimo_seq, ultimo_hash
    FROM casos.evento_caso e WHERE e.caso_id = NEW.caso_id ORDER BY e.seq DESC LIMIT 1;
  NEW.seq := coalesce(ultimo_seq, 0) + 1;
  NEW.hash_anterior := coalesce(ultimo_hash, decode(repeat('00', 32), 'hex'));
  NEW.ocorrido_em := date_trunc('milliseconds', NEW.ocorrido_em);
  NEW.hash := casos.hash_evento(NEW.hash_anterior, NEW.caso_id, NEW.seq, NEW.tipo::text,
                                NEW.ocorrido_em, NEW.autor_id, NEW.dados);
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION casos.evento_caso_imutavel() RETURNS trigger
  LANGUAGE plpgsql AS
$$
BEGIN
  RAISE EXCEPTION 'A trilha do caso não pode ser alterada nem apagada (append-only).'
    USING ERRCODE = 'insufficient_privilege';
END
$$;

CREATE TRIGGER evento_caso_encadear BEFORE INSERT ON casos.evento_caso
  FOR EACH ROW EXECUTE FUNCTION casos.evento_caso_encadear();
CREATE TRIGGER evento_caso_sem_update BEFORE UPDATE ON casos.evento_caso
  FOR EACH ROW EXECUTE FUNCTION casos.evento_caso_imutavel();
CREATE TRIGGER evento_caso_sem_delete BEFORE DELETE ON casos.evento_caso
  FOR EACH ROW EXECUTE FUNCTION casos.evento_caso_imutavel();
CREATE TRIGGER evento_caso_sem_truncate BEFORE TRUNCATE ON casos.evento_caso
  FOR EACH STATEMENT EXECUTE FUNCTION casos.evento_caso_imutavel();

REVOKE UPDATE, DELETE, TRUNCATE ON casos.evento_caso FROM sii_app;

-- Recalcula a cadeia do caso. SECURITY DEFINER: o auditor confere a integridade (só recebe
-- verdadeiro/falso e o primeiro evento quebrado), sem ler a trilha nominal.
CREATE OR REPLACE FUNCTION casos.verificar_trilha(p_caso int)
  RETURNS TABLE (integra boolean, primeiro_seq_quebrado int, eventos int, ultimo_hash bytea)
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS
$$
DECLARE
  r record;
  esperado bytea := decode(repeat('00', 32), 'hex');
  n int := 0;
BEGIN
  FOR r IN SELECT * FROM casos.evento_caso WHERE caso_id = p_caso ORDER BY seq LOOP
    n := n + 1;
    IF r.seq <> n OR r.hash_anterior <> esperado
       OR r.hash <> casos.hash_evento(r.hash_anterior, r.caso_id, r.seq, r.tipo::text,
                                      r.ocorrido_em, r.autor_id, r.dados) THEN
      RETURN QUERY SELECT false, r.seq, n, NULL::bytea;
      RETURN;
    END IF;
    esperado := r.hash;
  END LOOP;
  RETURN QUERY SELECT true, NULL::int, n, CASE WHEN n = 0 THEN NULL ELSE esperado END;
END
$$;

GRANT USAGE ON SCHEMA casos TO sii_auditor;
GRANT EXECUTE ON FUNCTION casos.verificar_trilha(int) TO sii_app, sii_auditor;
REVOKE EXECUTE ON FUNCTION casos.verificar_trilha(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION casos.verificar_trilha(int) TO sii_app, sii_auditor;
