import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { FILA_CARGAS, type JobCarga } from '@sii/shared';
import { type Job, Worker } from 'bullmq';
import Redis from 'ioredis';
import type { Client } from 'minio';
import { clienteMinio, configMinio } from '../../../api/src/cargas/armazenamento';
import { chaveDeHex } from '../../../api/src/cripto/cifra';
import { criarPrisma, type PrismaClient } from '../banco';
import { lerEnv } from '../config';
import { criarProcessadorCadunico } from './cadunico';
import { carregarDicionarioCadunico } from './dicionario';
import { type DependenciasCarga, executarCarga } from './pipeline';

/** Worker BullMQ da fila de cargas. Exportado para o teste de integração usar o mesmo caminho. */
export function criarConsumidor(deps: DependenciasCarga, conexao: Redis): Worker<JobCarga> {
  const worker = new Worker<JobCarga>(
    FILA_CARGAS,
    async (job: Job<JobCarga>) => {
      const tentativas = job.opts.attempts ?? 1;
      await executarCarga(deps, job.data.cargaId, job.attemptsMade + 1 >= tentativas);
    },
    { connection: conexao, concurrency: 1 },
  );
  worker.on('error', (e) => deps.logger.warn(`fila: ${e.name}`));
  return worker;
}

/**
 * Consumidor da fila `cargas` (concorrência 1: uma carga por vez, para não disputar a ligação de
 * pessoas). O job só traz o id do LogCarga.
 */
@Injectable()
export class CargasWorker implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger('cargas');
  private worker: Worker<JobCarga> | undefined;
  private redis: Redis | undefined;
  private prisma: PrismaClient | undefined;
  private minio: Client | undefined;

  onModuleInit(): void {
    const env = lerEnv();
    const minio = configMinio(env);
    this.prisma = criarPrisma(env.DATABASE_URL);
    this.minio = clienteMinio(minio);
    const deps: DependenciasCarga = {
      prisma: this.prisma,
      minio: this.minio,
      bucket: minio.bucket,
      logger: this.logger,
      processadores: {
        CADUNICO: criarProcessadorCadunico(carregarDicionarioCadunico(env.DICIONARIO_CADUNICO), {
          cifra: chaveDeHex(env.CHAVE_CIFRA, 'CHAVE_CIFRA'),
          hmac: chaveDeHex(env.CHAVE_HMAC, 'CHAVE_HMAC'),
        }),
      },
    };
    // BullMQ exige maxRetriesPerRequest null na conexão do Worker.
    this.redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
    this.redis.on('error', (e: Error) => this.logger.warn(`redis: ${e.name}`));
    this.worker = criarConsumidor(deps, this.redis);
    this.logger.log(`ouvindo a fila ${FILA_CARGAS}`);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
    this.redis?.disconnect();
    await this.prisma?.$disconnect();
  }
}
