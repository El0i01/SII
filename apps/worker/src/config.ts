import fs from 'node:fs';
import path from 'node:path';
import { config as carregarDotenv } from 'dotenv';
import { z } from 'zod';

/** Sobe de `dir` até a raiz do monorepo (onde está o pnpm-workspace.yaml). */
export function raizDoRepo(dir = __dirname): string {
  let atual = dir;
  while (!fs.existsSync(path.join(atual, 'pnpm-workspace.yaml'))) {
    const pai = path.dirname(atual);
    if (pai === atual) throw new Error('raiz do monorepo não encontrada');
    atual = pai;
  }
  return atual;
}

const hex64 = z.string().regex(/^[0-9a-fA-F]{64}$/, 'precisa ter 32 bytes em hex (64 caracteres)');

export const EnvWorker = z.object({
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, 'precisa começar com postgresql://'),
  REDIS_URL: z.string().regex(/^rediss?:\/\//, 'precisa começar com redis://'),
  CHAVE_CIFRA: hex64,
  CHAVE_HMAC: hex64,
  MINIO_URL: z.url().optional(),
  MINIO_USUARIO: z.string().min(1).optional(),
  MINIO_SENHA: z.string().min(8).optional(),
  MINIO_ROOT_USER: z.string().min(1).optional(),
  MINIO_ROOT_PASSWORD: z.string().min(8).optional(),
  MINIO_BUCKET_CARGAS: z.string().optional(),
  DICIONARIO_CADUNICO: z.string().optional(),
  ESUS_PEC_HOST: z.string().min(1).optional(),
  ESUS_PEC_PORTA: z.coerce.number().int().positive().default(5433),
  ESUS_PEC_BANCO: z.string().min(1).default('esus'),
  ESUS_PEC_USUARIO: z.string().min(1).optional(),
  ESUS_PEC_SENHA: z.string().min(1).optional(),
  ESUS_PEC_SCHEMA: z
    .string()
    .regex(/^[a-z_][a-z0-9_]*$/, 'use um nome de schema simples')
    .default('public'),
  ESUS_CRON: z.string().min(9).default('0 2 * * *'),
  CONTRATO_ESUS: z.string().optional(),
  MICROAREAS_ESUS: z.string().optional(),
});
export type EnvWorker = z.infer<typeof EnvWorker>;

/** Lê o .env da raiz e valida. A mensagem cita só o nome da variável, nunca o valor. */
export function lerEnv(extra: Record<string, string | undefined> = {}): EnvWorker {
  carregarDotenv({ path: path.join(raizDoRepo(), '.env'), quiet: true });
  const r = EnvWorker.safeParse({ ...process.env, ...extra });
  if (!r.success)
    throw new Error(
      `Variáveis de ambiente inválidas (confira o .env da raiz):\n${r.error.issues
        .map((i) => `- ${i.path.join('.')}: ${i.message}`)
        .join('\n')}`,
    );
  return r.data;
}
