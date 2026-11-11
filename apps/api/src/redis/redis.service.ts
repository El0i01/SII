import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { Env } from '../config/env';

/**
 * Conexão Redis da API (cache, rate limit e, a partir do P08, as filas BullMQ).
 * ioredis 5, a mesma versão do BullMQ. Reconecta sozinha; comandos com o Redis fora
 * falham na hora (sem fila offline) para o /health refletir o estado real.
 */
@Injectable()
export class RedisService extends Redis implements OnModuleDestroy {
  private readonly logger = new Logger('redis');

  constructor(config: ConfigService<Env, true>) {
    super(config.get('REDIS_URL', { infer: true }), {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 2_000,
      retryStrategy: (tentativa) => Math.min(tentativa * 500, 5_000),
    });
    // Sem handler o ioredis loga "Unhandled error event". A mensagem não contém a URL.
    this.on('error', (erro: Error) => this.logger.warn(`sem conexão: ${erro.message}`));
    this.connect().catch(() => undefined);
  }

  async onModuleDestroy(): Promise<void> {
    this.disconnect();
  }
}
