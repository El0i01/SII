/**
 * pnpm --filter @sii/worker esus:pec-ficticio [cidadãos]
 * Cria (ou recria) o banco `pec_ficticio` no PostgreSQL local com o schema mínimo do PEC e dados
 * inventados, e o papel `pec_leitura` só com SELECT. Para testar o conector sem o PEC real:
 *   ESUS_PEC_HOST=localhost ESUS_PEC_PORTA=5444 ESUS_PEC_BANCO=pec_ficticio
 *   ESUS_PEC_USUARIO=pec_leitura ESUS_PEC_SENHA=pec-leitura-local
 */
import { Client, Pool } from 'pg';
import { lerEnv } from '../src/config';
import { popularPecFicticio } from '../src/esus/ficticio';
import { hojePortoVelho } from '../src/esus/processador';

const BANCO = 'pec_ficticio';

async function main() {
  const env = lerEnv();
  const n = Number(process.argv[2] ?? 300);
  const admin = new Client({
    connectionString: env.DATABASE_URL.replace(/\/[^/?]+(\?|$)/, '/postgres$1'),
  });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${BANCO} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${BANCO}`);
  await admin.query(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pec_leitura') THEN
      CREATE ROLE pec_leitura LOGIN PASSWORD 'pec-leitura-local';
    ELSE ALTER ROLE pec_leitura PASSWORD 'pec-leitura-local';
    END IF; END $$`);
  await admin.end();
  const db = new Pool({
    connectionString: env.DATABASE_URL.replace(/\/[^/?]+(\?|$)/, `/${BANCO}$1`),
  });
  const r = await popularPecFicticio(db, { n, hoje: hojePortoVelho() });
  await db.query(
    'GRANT USAGE ON SCHEMA public TO pec_leitura; GRANT SELECT ON ALL TABLES IN SCHEMA public TO pec_leitura',
  );
  await db.end();
  process.stdout.write(
    `Banco ${BANCO} criado: ${r.validos} cidadãos válidos, ${r.semNascimento} sem nascimento, ` +
      `${r.inativos} inativo.\n`,
  );
}

void main();
