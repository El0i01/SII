import { execFileSync } from 'node:child_process';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';
import { PrismaClient } from '../src/generated/prisma/client';

config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });

/** Aponta TUDO para o banco de teste antes de qualquer módulo ler o ambiente. */
export function usarBancoDeTeste(): { url: string; senhaSeed: string } {
  const url = process.env.DATABASE_URL_TESTE;
  const senhaSeed = process.env.SEED_SENHA;
  if (!url || !senhaSeed) throw new Error('defina DATABASE_URL_TESTE e SEED_SENHA no .env da raiz');
  process.env.DATABASE_URL = url;
  return { url, senhaSeed };
}

export function aplicarMigrations(url: string): void {
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}

export function clienteDono(url: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}

/** App completo (guards, filtro de erros, cookies), cada um com o próprio limite de tentativas. */
export async function criarApp(): Promise<INestApplication> {
  const { AppModule } = await import('../src/app.module');
  const { configurarApp } = await import('../src/configurar-app');
  const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = modulo.createNestApplication({ logger: ['error'] });
  configurarApp(app);
  await app.init();
  return app;
}

/** Valores dos cookies de uma resposta (nome → atributos crus). */
export function cookies(setCookie: string | string[] | undefined): Record<string, string> {
  const lista = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  return Object.fromEntries(lista.map((c) => [c.split('=')[0] as string, c]));
}
