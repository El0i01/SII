import { Module } from '@nestjs/common';
import { CalendarioController } from './calendario.controller';
import { CalendarioService } from './calendario.service';
import { FrequenciaController } from './frequencia.controller';
import { FrequenciaService } from './frequencia.service';

@Module({
  controllers: [CalendarioController, FrequenciaController],
  providers: [CalendarioService, FrequenciaService],
})
export class EducacaoModule {}
