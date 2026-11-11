import { Module } from '@nestjs/common';
import { PessoasController } from './pessoas.controller';

@Module({ controllers: [PessoasController] })
export class PessoasModule {}
