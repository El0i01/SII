import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Perfis } from '../auth/decorators';
import { UsuarioAtual, type UsuarioAutenticado } from '../comum/usuario-autenticado';
import { ZodPipe } from '../comum/zod.pipe';
import { IdentidadeService } from './identidade.service';

const Motivo = z.string().trim().min(10, 'Explique o motivo (10 caracteres ou mais).').max(300);
const Unir = z.object({
  manterId: z.number().int().positive(),
  absorverId: z.number().int().positive(),
  motivo: Motivo,
});
const Separar = z.object({ motivo: Motivo });

/** Identidade única (P07). Só a CTI revisa, une e separa (decisão de 11/11/2026). */
@ApiTags('identidade')
@Perfis('ADMIN_CTI')
@Controller('identidade')
export class IdentidadeController {
  constructor(private readonly identidade: IdentidadeService) {}

  @Get('revisoes')
  @ApiOperation({ summary: 'Pares de registros que talvez sejam a mesma pessoa' })
  revisoes(@Query('situacao') situacao?: string) {
    return this.identidade.listarRevisoes(situacao === 'REJEITADA' ? 'REJEITADA' : 'PENDENTE');
  }

  @Post('revisoes/:id/aceitar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'São a mesma pessoa: unir o par' })
  aceitar(@Param('id', ParseIntPipe) id: number, @UsuarioAtual() u: UsuarioAutenticado) {
    return this.identidade.aceitar(id, u.id);
  }

  @Post('revisoes/:id/rejeitar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'São pessoas diferentes' })
  rejeitar(@Param('id', ParseIntPipe) id: number, @UsuarioAtual() u: UsuarioAutenticado) {
    return this.identidade.rejeitar(id, u.id);
  }

  @Post('unir')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unir dois registros quaisquer (fora da fila)' })
  unir(@Body(new ZodPipe(Unir)) b: z.infer<typeof Unir>, @UsuarioAtual() u: UsuarioAutenticado) {
    return this.identidade.unir(b.manterId, b.absorverId, u.id, 'UNIAO_MANUAL', b.motivo);
  }

  @Post('vinculos/:id/separar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Desfazer uma união: o registro volta a ser uma pessoa própria' })
  separar(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodPipe(Separar)) b: z.infer<typeof Separar>,
    @UsuarioAtual() u: UsuarioAutenticado,
  ) {
    return this.identidade.separar(id, u.id, b.motivo);
  }

  @Get('pessoas')
  @ApiOperation({ summary: 'Buscar pessoas por nome (para a união manual)' })
  pessoas(@Query('q') q?: string) {
    return this.identidade.buscarPessoas(q ?? '');
  }

  @Get('resumo')
  @ApiOperation({ summary: 'Ligações por regra e revisões pendentes' })
  resumo() {
    return this.identidade.resumoLigacoes();
  }
}
