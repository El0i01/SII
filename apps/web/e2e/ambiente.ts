import fs from 'node:fs';
import path from 'node:path';

/** Raiz do monorepo e variáveis do .env da raiz (o E2E sempre usa o banco de TESTE). */
export const RAIZ = path.resolve(__dirname, '../../..');

export function lerEnvRaiz(): Record<string, string> {
  const texto = fs.readFileSync(path.join(RAIZ, '.env'), 'utf8');
  const env: Record<string, string> = {};
  for (const linha of texto.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(linha);
    if (m) env[m[1] as string] = (m[2] as string).replace(/^["']|["']$/g, '');
  }
  return env;
}

export const PORTA_API = 3334;
export const PORTA_WEB = 3001;
export const URL_API = `http://localhost:${PORTA_API}/api/v1`;
export const DADOS = path.join(__dirname, '.dados.json');

export interface DadosE2E {
  inep: string;
  turma: string;
  matriculaId: number;
  aluno: string;
  dias: string[];
  hoje: string;
}

/** Ambiente dos processos do E2E: banco de teste no lugar do de desenvolvimento. */
export function envTeste(): NodeJS.ProcessEnv {
  const env = lerEnvRaiz();
  const teste = env.DATABASE_URL_TESTE;
  if (!teste) throw new Error('defina DATABASE_URL_TESTE no .env da raiz');
  // Redis em outro banco lógico (/1): o cache do mapa (geo:*) do dev não vaza para o teste.
  const redis = (env.REDIS_URL ?? process.env.REDIS_URL ?? '').replace(/\/\d+$/, '');
  return { ...process.env, DATABASE_URL: teste, ...(redis ? { REDIS_URL: `${redis}/1` } : {}) };
}
