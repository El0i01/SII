import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { cargaDoJob, FILA_CARGAS, type JobCarga } from '@sii/shared';
import { type Job, Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import type { Client } from 'minio';
import { clienteMinio, configMinio } from '../../../api/src/cargas/armazenamento';
import { chaveDeHex } from '../../../api/src/cripto/cifra';
import { criarPrisma, type PrismaClient } from '../banco';
import { type EnvWorker, lerEnv } from '../config';
import { carregarContratoPec, carregarMicroareas, conectarPec, configPec } from '../esus/pec';
import { criarProcessadorPrazos } from '../casos/prazos';
import { criarProcessadorInfrequencia } from '../educacao/infrequencia';
import { criarProcessadorEsus } from '../esus/processador';
import { criarProcessadorCadunico } from './cadunico';
import { carregarDicionarioCadunico, carregarDicionarioEscolar } from './dicionario';
import { criarProcessadorEscolar } from './escolar';
import { type DependenciasCarga, executarCarga, type ProcessadorConsulta } from './pipeline';

/** Worker BullMQ da fila de cargas. Exportado para o teste de integração usar o mesmo caminho. */
export function criarConsumidor(deps: DependenciasCarga, conexao: Redis): Worker<JobCarga> {
  const worker = new Worker<JobCarga>(
    FILA_CARGAS,
    async (job: Job<JobCarga>) => {
      const tentativas = job.opts.attempts ?? 1;
      let cargaId = cargaDoJob(job.data);
      if (cargaId === undefined) {
        // Execução agendada (e-SUS, infrequência): cria o LogCarga e grava o id no job (a nova
        // tentativa usa o mesmo).
        const fonte = 'fonte' in job.data ? job.data.fonte : 'ESUS_PEC';
        const c = await deps.prisma.logCarga.create({ data: { fonte, status: 'AGUARDANDO' } });
        cargaId = c.id;
        await job.updateData({ ...job.data, cargaId });
      }
      await executarCarga(deps, cargaId, job.attemptsMade + 1 >= tentativas);
    },
    { connection: conexao, concurrency: 1 },
  );
  worker.on('error', (e) => deps.logger.warn(`fila: ${e.name}`));
  return worker;
}

/** Nome do agendamento da carga noturna do e-SUS no BullMQ. */
export const AGENDAMENTO_ESUS = 'esus-noturno';

/** Agenda (ou atualiza) a carga noturna do e-SUS: 3 tentativas, fuso de Porto Velho. */
export async function agendarEsus(fila: Queue<JobCarga>, cron: string): Promise<void> {
  await fila.upsertJobScheduler(
    AGENDAMENTO_ESUS,
    { pattern: cron, tz: 'America/Porto_Velho' },
    {
      name: 'esus',
      data: { fonte: 'ESUS_PEC' },
      opts: { attempts: 3, backoff: { type: 'exponential', delay: 60_000 } },
    },
  );
}

/** Nome do agendamento do job diário de infrequência (P10). */
export const AGENDAMENTO_INFREQUENCIA = 'infrequencia-diaria';

/**
 * Agenda o job de infrequência na mesma fila das cargas (concorrência 1: não roda no meio de uma
 * carga da gestão escolar). Fuso de Porto Velho.
 */
export async function agendarInfrequencia(fila: Queue<JobCarga>, cron: string): Promise<void> {
  await fila.upsertJobScheduler(
    AGENDAMENTO_INFREQUENCIA,
    { pattern: cron, tz: 'America/Porto_Velho' },
    {
      name: 'infrequencia',
      data: { fonte: 'INFREQUENCIA' },
      opts: { attempts: 3, backoff: { type: 'exponential', delay: 60_000 } },
    },
  );
}

/** Nome do agendamento do job diário de prazos (P11). */
export const AGENDAMENTO_PRAZOS = 'prazos-diario';

export async function agendarPrazos(fila: Queue<JobCarga>, cron: string): Promise<void> {
  await fila.upsertJobScheduler(
    AGENDAMENTO_PRAZOS,
    { pattern: cron, tz: 'America/Porto_Velho' },
    {
      name: 'prazos',
      data: { fonte: 'PRAZOS' },
      opts: { attempts: 3, backoff: { type: 'exponential', delay: 60_000 } },
    },
  );
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
  private fila: Queue<JobCarga> | undefined;
  private pec: ReturnType<typeof conectarPec> | undefined;

  async onModuleInit(): Promise<void> {
    const env = lerEnv();
    const minio = configMinio(env);
    this.prisma = criarPrisma(env.DATABASE_URL);
    this.minio = clienteMinio(minio);
    const chaves = {
      cifra: chaveDeHex(env.CHAVE_CIFRA, 'CHAVE_CIFRA'),
      hmac: chaveDeHex(env.CHAVE_HMAC, 'CHAVE_HMAC'),
    };
    const deps: DependenciasCarga = {
      prisma: this.prisma,
      minio: this.minio,
      bucket: minio.bucket,
      logger: this.logger,
      processadores: {
        CADUNICO: criarProcessadorCadunico(
          carregarDicionarioCadunico(env.DICIONARIO_CADUNICO),
          chaves,
        ),
        GESTAO_ESCOLAR: criarProcessadorEscolar(
          'GESTAO_ESCOLAR',
          carregarDicionarioEscolar('GESTAO_ESCOLAR', env.DICIONARIO_GESTAO_ESCOLAR),
          chaves,
        ),
        SEDUC: criarProcessadorEscolar(
          'SEDUC',
          carregarDicionarioEscolar('SEDUC', env.DICIONARIO_SEDUC),
          chaves,
        ),
      },
      consultas: {
        ...this.consultas(env),
        INFREQUENCIA: criarProcessadorInfrequencia(),
        PRAZOS: criarProcessadorPrazos(),
      },
    };
    // BullMQ exige maxRetriesPerRequest null na conexão do Worker.
    this.redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
    this.redis.on('error', (e: Error) => this.logger.warn(`redis: ${e.name}`));
    this.worker = criarConsumidor(deps, this.redis);
    this.logger.log(`ouvindo a fila ${FILA_CARGAS}`);
    this.fila = new Queue<JobCarga>(FILA_CARGAS, { connection: this.redis.duplicate() });
    await agendarInfrequencia(this.fila, env.INFREQUENCIA_CRON);
    this.logger.log(`infrequência agendada (${env.INFREQUENCIA_CRON}, America/Porto_Velho)`);
    await agendarPrazos(this.fila, env.PRAZOS_CRON);
    this.logger.log(`prazos agendados (${env.PRAZOS_CRON}, America/Porto_Velho)`);
    if (this.pec) {
      await agendarEsus(this.fila, env.ESUS_CRON);
      this.logger.log(`carga do e-SUS agendada (${env.ESUS_CRON}, America/Porto_Velho)`);
    } else {
      await this.fila.removeJobScheduler(AGENDAMENTO_ESUS);
      this.logger.log('e-SUS não configurado (ESUS_PEC_HOST): carga noturna desligada');
    }
  }

  /** Fontes lidas direto do sistema de origem. Sem configuração, não entram. */
  private consultas(env: EnvWorker): Record<string, ProcessadorConsulta> {
    const cfg = configPec(env);
    if (!cfg) return {};
    this.pec = conectarPec(cfg);
    return {
      ESUS_PEC: criarProcessadorEsus({
        pec: this.pec,
        schema: cfg.schema,
        contrato: carregarContratoPec(env.CONTRATO_ESUS),
        microareas: carregarMicroareas(env.MICROAREAS_ESUS),
        chaves: {
          cifra: chaveDeHex(env.CHAVE_CIFRA, 'CHAVE_CIFRA'),
          hmac: chaveDeHex(env.CHAVE_HMAC, 'CHAVE_HMAC'),
        },
      }),
    };
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
    await this.fila?.close();
    await this.pec?.end();
    this.redis?.disconnect();
    await this.prisma?.$disconnect();
  }
}
