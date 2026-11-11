import { Module } from '@nestjs/common';
import { BatimentoService } from './batimento.service';

@Module({
  providers: [BatimentoService],
})
export class WorkerModule {}
