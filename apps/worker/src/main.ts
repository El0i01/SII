import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';

/**
 * Processo de fundo, sem HTTP: consome a fila BullMQ `cargas` (P08). Prazos e indicadores entram
 * nos próximos prompts.
 */
async function iniciar(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();
  new Logger('SII').log('worker pronto');
}

void iniciar();
