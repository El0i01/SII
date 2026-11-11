/**
 * pnpm geo:carregar — carrega o geoportal (shapefiles) no cadastro de território do SII.
 * Pasta de origem: GEOPORTAL_DIR (.env), ou ~/geoportal_itapua-main(1)/geoportal_itapua-main.
 */
import os from 'node:os';
import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';
import Redis from 'ioredis';
import { PrismaClient } from '../src/generated/prisma/client';
import { aplicarGeoportal, importarCamadas } from './geo/carregar';

config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });

async function principal() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Defina DATABASE_URL no .env da raiz.');
  const dir =
    process.env.GEOPORTAL_DIR ??
    path.join(os.homedir(), 'geoportal_itapua-main(1)/geoportal_itapua-main');

  console.warn(`Importando camadas de ${dir} …`);
  importarCamadas(dir, url);

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const rel = await aplicarGeoportal(prisma);
    console.warn(JSON.stringify(rel, null, 2));
  } finally {
    await prisma.$disconnect();
  }

  // O GeoJSON servido pela API fica em cache no Redis: a carga invalida.
  if (process.env.REDIS_URL) {
    const redis = new Redis(process.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
    try {
      await redis.connect();
      const chaves = await redis.keys('geo:*');
      if (chaves.length) await redis.del(...chaves);
      console.warn(`Cache de mapa invalidado (${chaves.length} chaves).`);
    } catch {
      console.warn('Redis fora do ar: o cache de mapa expira sozinho em 24 h.');
    } finally {
      redis.disconnect();
    }
  }
}

principal().catch((erro: Error) => {
  console.error(erro.message);
  process.exit(1);
});
