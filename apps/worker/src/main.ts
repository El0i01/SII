import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';

/**
 * Processo de fundo, sem HTTP. As filas BullMQ (cargas, prazos, indicadores)
 * entram a partir do P08; por enquanto ele só sobe e fica de pé.
 */
async function iniciar(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();
  new Logger('SII').log('worker pronto');
}

void iniciar();
