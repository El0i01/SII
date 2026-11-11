import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configurarApp } from './configurar-app';

async function iniciar(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configurarApp(app);

  const porta = Number(process.env.API_PORTA ?? 3333);
  await app.listen(porta);
  new Logger('SII').log(`API ouvindo na porta ${porta} (docs em /api/docs)`);
}

void iniciar();
