import { Module } from '@nestjs/common';
import { PessoasController } from './pessoas.controller';
import { PessoasRepositorio } from './pessoas.repositorio';

@Module({
  controllers: [PessoasController],
  providers: [PessoasRepositorio],
  exports: [PessoasRepositorio],
})
export class PessoasModule {}
