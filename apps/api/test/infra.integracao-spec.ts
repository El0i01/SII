import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';
import Redis from 'ioredis';
import { PrismaClient } from '../src/generated/prisma/client';

// Roda contra o banco de TESTE (DATABASE_URL_TESTE), com as migrations aplicadas na hora.
config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });

const urlTeste = process.env.DATABASE_URL_TESTE;
const urlRedis = process.env.REDIS_URL;

describe('Infra local (integração)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    if (!urlTeste || !urlRedis) throw new Error('defina DATABASE_URL_TESTE e REDIS_URL no .env');
    const { execFileSync } = await import('node:child_process');
    execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
      cwd: path.resolve(__dirname, '..'),
      env: { ...process.env, DATABASE_URL: urlTeste },
      stdio: 'pipe',
    });
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlTeste }) });
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('tem as quatro extensões', async () => {
    const linhas = await prisma.$queryRaw<{ extname: string }[]>`
      SELECT extname FROM pg_extension ORDER BY extname`;
    expect(linhas.map((l) => l.extname)).toEqual(
      expect.arrayContaining(['pg_trgm', 'pgcrypto', 'postgis', 'unaccent']),
    );
  });

  it('tem o índice GiST na geometria do setor', async () => {
    const linhas = await prisma.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes WHERE schemaname = 'territorio' AND indexname = 'setor_geom_gist'`;
    expect(linhas[0]?.indexdef).toMatch(/USING gist \(geom\)/);
  });

  it('grava e lê um setor com geometria em SIRGAS 2000 (4674)', async () => {
    const codigo = `T${Date.now() % 1_000_000}`;
    try {
      await prisma.$executeRaw`
        INSERT INTO territorio.setor (codigo, nome, geom)
        VALUES (${codigo}, 'Setor de teste', ST_Multi(ST_GeomFromText(
          'POLYGON((-63.19 -9.19, -63.18 -9.19, -63.18 -9.18, -63.19 -9.18, -63.19 -9.19))', 4674)))`;
      const [linha] = await prisma.$queryRaw<{ srid: number; tipo: string }[]>`
        SELECT ST_SRID(geom) AS srid, GeometryType(geom) AS tipo
        FROM territorio.setor WHERE codigo = ${codigo}`;
      expect(linha).toEqual({ srid: 4674, tipo: 'MULTIPOLYGON' });

      const setor = await prisma.setor.findUnique({ where: { codigo } });
      expect(setor?.nome).toBe('Setor de teste');
    } finally {
      await prisma.setor.deleteMany({ where: { codigo } });
    }
  });

  it('recusa geometria em outro SRID', async () => {
    await expect(prisma.$executeRaw`
      INSERT INTO territorio.setor (codigo, nome, geom)
      VALUES ('TSRID', 'x', ST_Multi(ST_GeomFromText('POLYGON((0 0,1 0,1 1,0 1,0 0))', 4326)))`).rejects.toThrow();
  });

  it('responde PING no Redis', async () => {
    const redis = new Redis(urlRedis as string, { lazyConnect: true, maxRetriesPerRequest: 1 });
    try {
      await redis.connect();
      expect(await redis.ping()).toBe('PONG');
    } finally {
      redis.disconnect();
    }
  });
});
