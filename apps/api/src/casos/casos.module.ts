import { Module } from '@nestjs/common';
import { AvisosService } from './avisos.service';
import { CasosController } from './casos.controller';
import { CasosService } from './casos.service';
import { NotificacoesController } from './notificacoes.controller';
import { NotificacoesService } from './notificacoes.service';

/** Casos, notificações à Assistência, parecer, pauta do Comitê e avisos internos (P11). */
@Module({
  controllers: [NotificacoesController, CasosController],
  providers: [NotificacoesService, CasosService, AvisosService],
})
export class CasosModule {}
