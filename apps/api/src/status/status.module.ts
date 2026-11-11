import { Module } from '@nestjs/common';
import { StatusController } from './status.controller';

/**
 * Health check do serviço (/health). Chama-se `status` para não colidir com o
 * módulo de domínio `saude` (sinalizadores do e-SUS), que entra na Fase 2.
 */
@Module({
  controllers: [StatusController],
})
export class StatusModule {}
