import fs from 'node:fs';
import path from 'node:path';
import { COLUNAS_PEC, ContratoPec, type DataISO, TABELAS_PEC, tempoDeDia } from '@sii/shared';
import { Pool, type PoolClient } from 'pg';
import { z } from 'zod';
import { type EnvWorker, raizDoRepo } from '../config';

/**
 * Conexão com o banco do e-SUS APS PEC (P09, ADR 0008). **Somente leitura**, em três camadas:
 * 1. o usuário do PEC deve ter só SELECT (pedido à Saúde);
 * 2. a sessão abre com `default_transaction_read_only=on`;
 * 3. toda leitura roda numa transação `READ ONLY` (e `REPEATABLE READ`: uma foto só do banco).
 *
 * As consultas são montadas a partir do contrato (nomes físicos validados como identificador simples
 * e sempre entre aspas). Nenhuma coluna de CID, CIAP ou diagnóstico é selecionada.
 */

export interface ConfigPec {
  host: string;
  porta: number;
  banco: string;
  usuario: string;
  senha: string;
  schema: string;
}

/** null quando o e-SUS não está configurado no .env (a carga noturna não é agendada). */
export function configPec(env: EnvWorker): ConfigPec | null {
  if (!env.ESUS_PEC_HOST) return null;
  if (!env.ESUS_PEC_USUARIO || !env.ESUS_PEC_SENHA)
    throw new Error(
      'ESUS_PEC_HOST definido sem ESUS_PEC_USUARIO e ESUS_PEC_SENHA (confira o .env).',
    );
  return {
    host: env.ESUS_PEC_HOST,
    porta: env.ESUS_PEC_PORTA,
    banco: env.ESUS_PEC_BANCO,
    usuario: env.ESUS_PEC_USUARIO,
    senha: env.ESUS_PEC_SENHA,
    schema: env.ESUS_PEC_SCHEMA,
  };
}

/** Tempo máximo de cada consulta no PEC (o banco é da Saúde: não pode travar o atendimento). */
const LIMITE_CONSULTA_MS = 10 * 60_000;

export function conectarPec(c: ConfigPec): Pool {
  const pool = new Pool({
    host: c.host,
    port: c.porta,
    database: c.banco,
    user: c.usuario,
    password: c.senha,
    max: 2,
    application_name: 'sii-worker',
    connectionTimeoutMillis: 15_000,
    options: `-c default_transaction_read_only=on -c statement_timeout=${LIMITE_CONSULTA_MS}`,
  });
  // Erro de conexão ociosa não derruba o worker; a próxima consulta falha e a carga registra.
  pool.on('error', () => undefined);
  return pool;
}

/** Executa `fn` numa transação somente leitura com foto única do banco. */
export async function emLeitura<T>(pool: Pool, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const r = await fn(c);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally {
    c.release();
  }
}

// ─── Configuração ──────────────────────────────────────────────────────────────────────────────

export const CAMINHO_CONTRATO = 'apps/worker/config/esus/contrato.json';
export const CAMINHO_MICROAREAS = 'apps/worker/config/esus/microareas.json';

function lerJson(arquivo: string): unknown {
  return JSON.parse(fs.readFileSync(arquivo, 'utf8'));
}

function problemas(e: z.ZodError) {
  return e.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
}

export function carregarContratoPec(caminho?: string): ContratoPec {
  const arquivo = caminho ?? path.join(raizDoRepo(), CAMINHO_CONTRATO);
  const r = ContratoPec.safeParse(lerJson(arquivo));
  if (!r.success)
    throw new Error(
      `Contrato do e-SUS inválido (${path.basename(arquivo)}): ${problemas(r.error)}`,
    );
  return r.data;
}

const MapaMicroareas = z.record(
  z.string().regex(/^\d{7}\/\d{2}$/, 'a chave é "CNES/número", ex.: "7327862/04"'),
  z.string().min(1).max(40),
);

export function carregarMicroareas(caminho?: string): Record<string, string> {
  const arquivo = caminho ?? path.join(raizDoRepo(), CAMINHO_MICROAREAS);
  const r = MapaMicroareas.safeParse(lerJson(arquivo));
  if (!r.success)
    throw new Error(
      `Tabela de microáreas inválida (${path.basename(arquivo)}): ${problemas(r.error)}`,
    );
  return r.data;
}

// ─── Leitura ───────────────────────────────────────────────────────────────────────────────────

/** Tabela física → colunas existentes, pelo information_schema do PEC. */
export async function lerEstrutura(c: PoolClient, schema: string) {
  const r = await c.query<{ tabela: string; coluna: string }>(
    `SELECT table_name AS tabela, column_name AS coluna
       FROM information_schema.columns WHERE table_schema = $1`,
    [schema],
  );
  const m = new Map<string, Set<string>>();
  for (const { tabela, coluna } of r.rows) {
    const s = m.get(tabela) ?? new Set<string>();
    s.add(coluna);
    m.set(tabela, s);
  }
  return m;
}

const q = (ident: string) => `"${ident}"`;

/** Nome físico qualificado e colunas físicas de uma tabela lógica. */
function tabela<T extends keyof typeof COLUNAS_PEC>(k: ContratoPec, schema: string, t: T) {
  const m = k.tabelas[t];
  const col = m.colunas as Record<(typeof COLUNAS_PEC)[T][number], string>;
  return {
    nome: `${q(schema)}.${q(m.tabela)}`,
    c: (nome: (typeof COLUNAS_PEC)[T][number]) => q(col[nome]),
  };
}

/** Linha lida do PEC por cidadão. Datas como AAAA-MM-DD; tempos como AAAAMMDD. */
export interface CidadaoPec {
  co_cidadao: string;
  nome: string | null;
  mae: string | null;
  nascimento: DataISO | null;
  sexo: string | null;
  cpf: string | null;
  cns: string | null;
  cnes: string | null;
  microarea: string | null;
  acs: string | null;
  gestante: boolean | null;
  acamado: boolean | null;
  domiciliado: boolean | null;
  cronico: boolean | null;
  tem_cadastro: boolean;
  ultima_visita: number | null;
  ultimo_atendimento: number | null;
  ultima_gripe: number | null;
}

/**
 * Cidadãos ativos a ler. Completa (`desde` null): todos. Incremental: alterados depois de `desde`
 * (com 1 dia de folga, a carga é idempotente) ou com fato novo desde o dia de `desde`.
 */
function sqlAlterados(k: ContratoPec, s: string): string {
  const cid = tabela(k, s, 'cidadao');
  const fc = tabela(k, s, 'fatCidadao');
  const fatos = (['cadIndividual', 'visita', 'atendimento', 'vacinacao'] as const).map((t) => {
    const f = tabela(k, s, t);
    return `SELECT fc.${fc.c('cidadao')} FROM ${f.nome} f JOIN ${fc.nome} fc ON fc.${fc.c('id')} = f.${f.c('fatCidadao')} WHERE f.${f.c('tempo')} >= $2`;
  });
  return `alterados AS (
    SELECT c.${cid.c('id')} AS id FROM ${cid.nome} c
     WHERE $1::timestamptz IS NULL OR c.${cid.c('atualizado')} > $1::timestamptz - interval '1 day'
    UNION ${fatos.join('\n    UNION ')}
  )`;
}

const ativo = (k: ContratoPec, s: string) =>
  `COALESCE(c.${tabela(k, s, 'cidadao').c('ativo')}::int, 1) = 1`;

export function sqlCidadaos(k: ContratoPec, s: string): string {
  const cid = tabela(k, s, 'cidadao');
  const fc = tabela(k, s, 'fatCidadao');
  const ci = tabela(k, s, 'cadIndividual');
  const un = tabela(k, s, 'unidade');
  const pr = tabela(k, s, 'profissional');
  const marcado = (col: string) => `COALESCE(f.${col}::int, 0) = 1`;
  const cronico = k.colunasCronicas.map((col) => marcado(q(col))).join(' OR ');
  const ultima = (t: 'visita' | 'atendimento' | 'vacinacao', filtro = '') => {
    const f = tabela(k, s, t);
    return `(SELECT max(f.${f.c('tempo')}) FROM ${f.nome} f JOIN ${fc.nome} fc ON fc.${fc.c('id')} = f.${f.c('fatCidadao')} WHERE fc.${fc.c('cidadao')} = c.${cid.c('id')}${filtro})`;
  };
  const vac = tabela(k, s, 'vacinacao');
  return `WITH ${sqlAlterados(k, s)}
  SELECT c.${cid.c('id')}::text AS co_cidadao, c.${cid.c('nome')} AS nome, c.${cid.c('mae')} AS mae,
         to_char(c.${cid.c('nascimento')}, 'YYYY-MM-DD') AS nascimento, c.${cid.c('sexo')}::text AS sexo,
         c.${cid.c('cpf')}::text AS cpf, c.${cid.c('cns')}::text AS cns,
         cad.cnes, cad.microarea, cad.acs, cad.gestante, cad.acamado, cad.domiciliado, cad.cronico,
         COALESCE(cad.tem, false) AS tem_cadastro,
         ${ultima('visita')}::int AS ultima_visita,
         ${ultima('atendimento')}::int AS ultimo_atendimento,
         ${ultima('vacinacao', ` AND f.${vac.c('imunobiologico')}::text = ANY($3::text[])`)}::int AS ultima_gripe
    FROM ${cid.nome} c
    JOIN alterados a ON a.id = c.${cid.c('id')}
    LEFT JOIN LATERAL (
      SELECT true AS tem, u.${un.c('cnes')}::text AS cnes, f.${ci.c('microarea')}::text AS microarea,
             p.${pr.c('nome')} AS acs,
             ${marcado(ci.c('gestante'))} AS gestante, ${marcado(ci.c('acamado'))} AS acamado,
             ${marcado(ci.c('domiciliado'))} AS domiciliado, (${cronico}) AS cronico
        FROM ${ci.nome} f
        JOIN ${fc.nome} fc ON fc.${fc.c('id')} = f.${ci.c('fatCidadao')}
        LEFT JOIN ${un.nome} u ON u.${un.c('id')} = f.${ci.c('unidade')}
        LEFT JOIN ${pr.nome} p ON p.${pr.c('id')} = f.${ci.c('profissional')}
       WHERE fc.${fc.c('cidadao')} = c.${cid.c('id')}
       ORDER BY f.${ci.c('tempo')} DESC LIMIT 1
    ) cad ON true
   WHERE ${ativo(k, s)}
   ORDER BY c.${cid.c('id')}`;
}

/** Parâmetros das consultas: marca da última carga (ou null para ler tudo). */
export function parametros(k: ContratoPec, desde: string | null): unknown[] {
  return [desde, desde ? tempoDeDia(desde.slice(0, 10)) : null, k.imunobiologicosGripe];
}

/** Instante do início da foto no relógio do PEC: a marca da próxima incremental. */
export async function lerMarca(c: PoolClient): Promise<string> {
  const r = await c.query<{ marca: string }>(
    `SELECT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS marca`,
  );
  return (r.rows[0] as { marca: string }).marca;
}

export interface RelatorioLeitura {
  /** Linhas por tabela física do PEC (total, não só as que seriam lidas). */
  tabelas: Record<string, number>;
  /** Cidadãos ativos que a próxima carga leria. */
  cidadaosALer: number;
}

/** Dry-run e resumo da carga: contagens por tabela e quantos cidadãos seriam lidos. */
export async function contarTabelas(
  c: PoolClient,
  k: ContratoPec,
  schema: string,
  desde: string | null,
): Promise<RelatorioLeitura> {
  const tabelas: Record<string, number> = {};
  for (const t of TABELAS_PEC) {
    const nome = k.tabelas[t].tabela;
    const r = await c.query<{ n: string }>(`SELECT count(*) AS n FROM ${q(schema)}.${q(nome)}`);
    tabelas[nome] = Number(r.rows[0]?.n ?? 0);
  }
  const cid = tabela(k, schema, 'cidadao');
  const r = await c.query<{ n: string }>(
    `WITH ${sqlAlterados(k, schema)}
     SELECT count(*) AS n FROM ${cid.nome} c JOIN alterados a ON a.id = c.${cid.c('id')}
      WHERE ${ativo(k, schema)}`,
    parametros(k, desde).slice(0, 2),
  );
  return { tabelas, cidadaosALer: Number(r.rows[0]?.n ?? 0) };
}
