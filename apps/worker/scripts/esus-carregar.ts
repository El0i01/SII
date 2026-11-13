/**
 * pnpm --filter @sii/worker esus:carregar
 * Põe a carga do e-SUS na fila agora (o worker precisa estar rodando). Útil depois de corrigir o
 * contrato quando a carga noturna falhou.
 */
import { FILA_CARGAS, type JobCarga } from '@sii/shared';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { lerEnv } from '../src/config';

async function main() {
  const env = lerEnv();
  const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  const fila = new Queue<JobCarga>(FILA_CARGAS, { connection: redis });
  const job = await fila.add(
    'esus',
    { fonte: 'ESUS_PEC' },
    { attempts: 3, backoff: { type: 'exponential', delay: 60_000 } },
  );
  process.stdout.write(`Carga do e-SUS na fila (job ${job.id}). Acompanhe em /cargas.\n`);
  await fila.close();
  redis.disconnect();
}

void main();
