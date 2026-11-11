-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "acesso";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "casos";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "pessoas";

-- CreateEnum
CREATE TYPE "acesso"."Perfil" AS ENUM ('ADMIN_CTI', 'COMITE_GESTOR', 'SEMED_GESTOR', 'ESCOLA', 'SAUDE_GESTOR', 'ACS', 'CRAS_TECNICO', 'VISITADOR_PCF', 'FAZENDA', 'AUDITOR_TCE', 'DPO');

-- CreateEnum
CREATE TYPE "acesso"."TipoEscopo" AS ENUM ('SECRETARIA', 'SETOR', 'ESCOLA', 'MICROAREA', 'CRAS', 'FAMILIA_PCF');

-- CreateEnum
CREATE TYPE "acesso"."ClienteSessao" AS ENUM ('WEB', 'MOBILE');

-- CreateEnum
CREATE TYPE "acesso"."TipoEventoAcesso" AS ENUM ('LOGIN_OK', 'LOGIN_FALHA', 'BLOQUEIO', 'REUSO_REFRESH', 'TROCA_SENHA', 'SENHA_PROVISORIA', 'SAIR', 'REVOGACAO');

-- CreateTable
CREATE TABLE "acesso"."usuario" (
    "id" SERIAL NOT NULL,
    "login" VARCHAR(60) NOT NULL,
    "nome" VARCHAR(120) NOT NULL,
    "perfil" "acesso"."Perfil" NOT NULL,
    "senha_hash" VARCHAR(100) NOT NULL,
    "senha_provisoria_expira_em" TIMESTAMPTZ(3),
    "troca_obrigatoria" BOOLEAN NOT NULL DEFAULT true,
    "falhas_seguidas" INTEGER NOT NULL DEFAULT 0,
    "bloqueado_ate" TIMESTAMPTZ(3),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "versao_token" INTEGER NOT NULL DEFAULT 1,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "acesso"."escopo_usuario" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "tipo" "acesso"."TipoEscopo" NOT NULL,
    "valor" VARCHAR(40) NOT NULL,

    CONSTRAINT "escopo_usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "acesso"."sessao_refresh" (
    "id" UUID NOT NULL,
    "familia_id" UUID NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "cliente" "acesso"."ClienteSessao" NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expira_em" TIMESTAMPTZ(3) NOT NULL,
    "usado_em" TIMESTAMPTZ(3),
    "revogado_em" TIMESTAMPTZ(3),
    "motivo_revogacao" VARCHAR(40),
    "ip" VARCHAR(45),
    "user_agent" VARCHAR(200),

    CONSTRAINT "sessao_refresh_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "acesso"."evento_acesso" (
    "id" BIGSERIAL NOT NULL,
    "usuario_id" INTEGER,
    "tipo" "acesso"."TipoEventoAcesso" NOT NULL,
    "ip" VARCHAR(45),
    "detalhe" VARCHAR(200),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evento_acesso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pessoas"."pessoa_mestra" (
    "id" SERIAL NOT NULL,
    "nome" VARCHAR(160) NOT NULL,
    "setor_codigo" VARCHAR(10),
    "microarea" VARCHAR(40),
    "escola_inep" VARCHAR(8),
    "cras_codigo" VARCHAR(20),
    "familia_pcf" VARCHAR(40),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pessoa_mestra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "casos"."caso" (
    "id" SERIAL NOT NULL,
    "tipo" VARCHAR(40) NOT NULL,
    "pessoa_id" INTEGER NOT NULL,
    "secretaria_responsavel" VARCHAR(20) NOT NULL,
    "status" VARCHAR(30) NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "caso_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuario_login_key" ON "acesso"."usuario"("login");

-- CreateIndex
CREATE UNIQUE INDEX "escopo_usuario_usuario_id_tipo_valor_key" ON "acesso"."escopo_usuario"("usuario_id", "tipo", "valor");

-- CreateIndex
CREATE UNIQUE INDEX "sessao_refresh_token_hash_key" ON "acesso"."sessao_refresh"("token_hash");

-- CreateIndex
CREATE INDEX "sessao_refresh_familia_id_idx" ON "acesso"."sessao_refresh"("familia_id");

-- CreateIndex
CREATE INDEX "sessao_refresh_usuario_id_idx" ON "acesso"."sessao_refresh"("usuario_id");

-- CreateIndex
CREATE INDEX "evento_acesso_usuario_id_criado_em_idx" ON "acesso"."evento_acesso"("usuario_id", "criado_em");

-- CreateIndex
CREATE INDEX "caso_pessoa_id_idx" ON "casos"."caso"("pessoa_id");

-- AddForeignKey
ALTER TABLE "acesso"."escopo_usuario" ADD CONSTRAINT "escopo_usuario_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "acesso"."usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acesso"."sessao_refresh" ADD CONSTRAINT "sessao_refresh_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "acesso"."usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acesso"."evento_acesso" ADD CONSTRAINT "evento_acesso_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "acesso"."usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "casos"."caso" ADD CONSTRAINT "caso_pessoa_id_fkey" FOREIGN KEY ("pessoa_id") REFERENCES "pessoas"."pessoa_mestra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Escrito à mão (P03): papéis, funções de contexto, Row-Level Security e views agregadas.
-- Ver docs/adr/0003-autenticacao-e-rls.md.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- Papéis do banco. NOLOGIN: ninguém conecta com eles; a API assume o papel com SET LOCAL ROLE
-- dentro de cada transação. Papéis são do cluster inteiro, daí o IF NOT EXISTS.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sii_app') THEN
    CREATE ROLE sii_app NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sii_auditor') THEN
    CREATE ROLE sii_auditor NOLOGIN NOINHERIT;
  END IF;
END
$$;

-- O usuário dono (o da DATABASE_URL) precisa poder assumir os dois papéis.
GRANT sii_app TO CURRENT_USER;
GRANT sii_auditor TO CURRENT_USER;

-- Contexto da requisição, gravado pela API com set_config(..., true): vale só na transação.
CREATE SCHEMA IF NOT EXISTS sii;

CREATE OR REPLACE FUNCTION sii.perfil_atual() RETURNS text
  LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('sii.perfil', true), '') $$;

CREATE OR REPLACE FUNCTION sii.ve_municipio() RETURNS boolean
  LANGUAGE sql STABLE AS
$$ SELECT coalesce(sii.perfil_atual() IN ('ADMIN_CTI', 'COMITE_GESTOR', 'SEMED_GESTOR', 'SAUDE_GESTOR'), false) $$;

-- sii.escopos é um JSON: [{"tipo":"ESCOLA","valor":"11005165"}, ...]
CREATE OR REPLACE FUNCTION sii.tem_escopo(p_tipo text, p_valor text) RETURNS boolean
  LANGUAGE sql STABLE AS
$$
  SELECT p_valor IS NOT NULL
     AND coalesce(nullif(current_setting('sii.escopos', true), ''), '[]')::jsonb
         @> jsonb_build_array(jsonb_build_object('tipo', p_tipo, 'valor', p_valor))
$$;

GRANT USAGE ON SCHEMA sii TO sii_app, sii_auditor;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA sii TO sii_app, sii_auditor;

-- Território não é nominal: os dois papéis leem.
GRANT USAGE ON SCHEMA territorio TO sii_app, sii_auditor;
GRANT SELECT ON ALL TABLES IN SCHEMA territorio TO sii_app, sii_auditor;
ALTER DEFAULT PRIVILEGES IN SCHEMA territorio GRANT SELECT ON TABLES TO sii_app, sii_auditor;

-- Nominal: só sii_app, sempre filtrado por RLS. sii_auditor não recebe NADA aqui.
GRANT USAGE ON SCHEMA pessoas, casos TO sii_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA pessoas, casos TO sii_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA pessoas, casos TO sii_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA pessoas, casos GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sii_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA pessoas, casos GRANT USAGE, SELECT ON SEQUENCES TO sii_app;
REVOKE ALL ON SCHEMA pessoas, casos FROM PUBLIC;
REVOKE ALL ON SCHEMA acesso FROM PUBLIC;

-- Pessoa: visível para quem vê o município ou para quem tem o escopo da pessoa.
-- FAZENDA, DPO e perfil ausente não enxergam nenhuma linha.
ALTER TABLE pessoas.pessoa_mestra ENABLE ROW LEVEL SECURITY;
ALTER TABLE pessoas.pessoa_mestra FORCE ROW LEVEL SECURITY;

CREATE POLICY pessoa_visivel ON pessoas.pessoa_mestra
  FOR ALL TO sii_app
  USING (
    sii.ve_municipio()
    OR (sii.perfil_atual() = 'ESCOLA'        AND sii.tem_escopo('ESCOLA', escola_inep))
    OR (sii.perfil_atual() = 'ACS'           AND sii.tem_escopo('MICROAREA', microarea))
    OR (sii.perfil_atual() = 'CRAS_TECNICO'  AND sii.tem_escopo('CRAS', cras_codigo))
    OR (sii.perfil_atual() = 'VISITADOR_PCF' AND sii.tem_escopo('FAMILIA_PCF', familia_pcf))
  );

-- Caso: herda a visibilidade da pessoa (a subconsulta também passa pela RLS de pessoa_mestra).
ALTER TABLE casos.caso ENABLE ROW LEVEL SECURITY;
ALTER TABLE casos.caso FORCE ROW LEVEL SECURITY;

CREATE POLICY caso_visivel ON casos.caso
  FOR ALL TO sii_app
  USING (EXISTS (SELECT 1 FROM pessoas.pessoa_mestra p WHERE p.id = pessoa_id));

-- Agregados desidentificados, com supressão de contagens menores que 5. Únicos objetos que o
-- auditor lê. A view roda com os privilégios do dono: agrega o município inteiro sem expor linhas.
-- As views de verdade entram no P16; esta prova o acesso.
CREATE SCHEMA IF NOT EXISTS agregados;

CREATE VIEW agregados.pessoas_por_setor AS
SELECT
  coalesce(setor_codigo, 'SEM_SETOR') AS setor_codigo,
  CASE WHEN count(*) < 5 THEN '<5' ELSE count(*)::text END AS total
FROM pessoas.pessoa_mestra
GROUP BY 1;

GRANT USAGE ON SCHEMA agregados TO sii_auditor, sii_app;
GRANT SELECT ON ALL TABLES IN SCHEMA agregados TO sii_auditor, sii_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA agregados GRANT SELECT ON TABLES TO sii_auditor, sii_app;
