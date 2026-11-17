import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Encaminhamento } from '@sii/shared';
import { Perfis } from '../auth/decorators';
import { UsuarioAtual, type UsuarioAutenticado } from '../comum/usuario-autenticado';
import { ZodPipe } from '../comum/zod.pipe';
import { AvisosService } from './avisos.service';
import { CasosService } from './casos.service';

@ApiTags('casos')
@Controller()
export class CasosController {
  constructor(
    private readonly casos: CasosService,
    private readonly avisos: AvisosService,
  ) {}

  @Post('casos/encaminhamentos')
  @Perfis('ADMIN_CTI', 'COMITE_GESTOR', 'SEMED_GESTOR', 'ESCOLA')
  @ApiOperation({ summary: 'Encaminhar um caso a partir da ficha' })
  encaminhar(
    @UsuarioAtual() u: UsuarioAutenticado,
    @Body(new ZodPipe(Encaminhamento)) corpo: Encaminhamento,
  ) {
    return this.casos.encaminhar(u, corpo);
  }

  @Get('casos/pauta')
  @Perfis('ADMIN_CTI', 'COMITE_GESTOR', 'SEMED_GESTOR')
  @ApiOperation({ summary: 'Pauta do Comitê: casos vencidos há mais de 7 dias' })
  pauta(@UsuarioAtual() u: UsuarioAutenticado) {
    return this.casos.pauta(u);
  }

  @Get('avisos')
  @ApiOperation({ summary: 'Avisos internos do usuário (sem dado pessoal)' })
  listarAvisos(@UsuarioAtual() u: UsuarioAutenticado) {
    return this.avisos.listar(u);
  }

  @Post('avisos/:id/lido')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Marcar aviso como lido' })
  async lido(@UsuarioAtual() u: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number) {
    await this.avisos.marcarLido(u, id);
  }
}
