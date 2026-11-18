import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TAMANHO_MAXIMO_CARGA } from '@sii/shared';
import { Perfis } from '../auth/decorators';
import { UsuarioAtual, type UsuarioAutenticado } from '../comum/usuario-autenticado';
import { type ArquivoEnviado, CargasService, type PerfilQueEnvia } from './cargas.service';

/**
 * Cargas por upload (§5, P08, P10). A CTI envia todas; o ponto focal da Assistência, o CadÚnico
 * (decisão de 12/11/2026); a SEMED, gestão escolar e SEDUC-RO (P10).
 * As respostas só trazem contagens e mensagens fixas: nenhum dado de pessoa.
 */
@ApiTags('cargas')
@Perfis('ADMIN_CTI', 'ASSISTENCIA_GESTOR', 'SEMED_GESTOR', 'FAZENDA')
@Controller('cargas')
export class CargasController {
  constructor(private readonly cargas: CargasService) {}

  @Post()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Enviar arquivo de carga (CadÚnico, gestão escolar, SEDUC-RO)' })
  @UseInterceptors(
    // Sem `dest`, o multer guarda em memória: o arquivo nunca toca o disco da API.
    FileInterceptor('arquivo', {
      limits: { fileSize: TAMANHO_MAXIMO_CARGA, files: 1 },
    }),
  )
  enviar(
    @Body() corpo: { fonte?: string; mesReferencia?: string },
    @UploadedFile() arquivo: ArquivoEnviado | undefined,
    @UsuarioAtual() u: UsuarioAutenticado,
  ) {
    return this.cargas.enviar(corpo, arquivo, u.id, u.perfil as PerfilQueEnvia);
  }

  @Get()
  @ApiOperation({ summary: 'Últimas 20 cargas' })
  listar() {
    return this.cargas.listar();
  }

  @Get('alertas')
  @Perfis('ADMIN_CTI')
  @ApiOperation({ summary: 'Cargas que falharam e ainda não voltaram a dar certo (só CTI)' })
  alertas() {
    return this.cargas.alertas();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Situação e progresso de uma carga' })
  obter(@Param('id', ParseIntPipe) id: number) {
    return this.cargas.obter(id);
  }

  @Get(':id/erros')
  @ApiOperation({ summary: 'Problemas por linha (50 por página)' })
  erros(
    @Param('id', ParseIntPipe) id: number,
    @Query('pagina', new DefaultValuePipe(1), ParseIntPipe) pagina: number,
  ) {
    return this.cargas.erros(id, Math.max(1, pagina));
  }
}
