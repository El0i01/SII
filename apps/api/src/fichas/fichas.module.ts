import { Module } from '@nestjs/common';
import { FichasController } from './fichas.controller';
import { FichasService } from './fichas.service';

/** Ficha da criança, revelação de CPF com finalidade e painel de acessos do DPO (P12). */
@Module({ controllers: [FichasController], providers: [FichasService] })
export class FichasModule {}
