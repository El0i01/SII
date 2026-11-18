import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configurarApp } from './configurar-app';

async function iniciar(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // A porta da API fica na rede privada da stack, atrás de um único proxy.
  if (process.env.SII_PROXY_CONFIAVEL === '1') app.set('trust proxy', 1);
  configurarApp(app);

  const porta = Number(process.env.API_PORTA ?? 3333);
  await app.listen(porta);
  new Logger('SII').log(`API ouvindo na porta ${porta} (docs em /api/docs)`);
}

void iniciar();
