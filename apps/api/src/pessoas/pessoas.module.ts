import { Module } from '@nestjs/common';
import { PessoasController } from './pessoas.controller';
import { PessoasRepositorio } from './pessoas.repositorio';
import { IdentidadeController } from './identidade.controller';
import { IdentidadeService } from './identidade.service';

@Module({
  controllers: [PessoasController, IdentidadeController],
  providers: [PessoasRepositorio, IdentidadeService],
  exports: [PessoasRepositorio],
})
export class PessoasModule {}
