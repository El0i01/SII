-- Roda só na primeira subida do volume (docker-entrypoint-initdb.d).
-- As migrations do Prisma repetem o CREATE EXTENSION IF NOT EXISTS, para o shadow DB e bancos novos.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Banco dos testes de integração, com as mesmas extensões.
CREATE DATABASE sii_teste;
\connect sii_teste
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS unaccent;
