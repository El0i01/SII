import { Module } from '@nestjs/common';
import { BatimentoService } from './batimento.service';
import { CargasWorker } from './cargas/cargas.worker';

@Module({
  providers: [BatimentoService, CargasWorker],
})
export class WorkerModule {}
