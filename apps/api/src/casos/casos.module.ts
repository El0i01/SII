import { Module } from '@nestjs/common';
import { AvisosService } from './avisos.service';
import { BuscaAtivaController } from './busca-ativa.controller';
import { BuscaAtivaService } from './busca-ativa.service';
import { CasosController } from './casos.controller';
import { CasosService } from './casos.service';
import { NotificacoesController } from './notificacoes.controller';
import { NotificacoesService } from './notificacoes.service';

/** Casos, notificações à Assistência, parecer, pauta do Comitê, avisos internos (P11) e busca ativa (P13). */
@Module({
  controllers: [NotificacoesController, CasosController, BuscaAtivaController],
  providers: [NotificacoesService, CasosService, AvisosService, BuscaAtivaService],
  exports: [CasosService],
})
export class CasosModule {}
