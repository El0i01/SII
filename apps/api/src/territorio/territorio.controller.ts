import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { PontoGps } from '@sii/shared';
import type { Response } from 'express';
import { Perfis } from '../auth/decorators';
import { erros } from '../comum/erros';
import { UsuarioAtual, type UsuarioAutenticado } from '../comum/usuario-autenticado';
import { ZodPipe } from '../comum/zod.pipe';
import { type Camada, CAMADAS } from './camadas';
import { TerritorioService } from './territorio.service';

@ApiTags('territorio')
@Controller()
export class TerritorioController {
  constructor(private readonly territorio: TerritorioService) {}

  @Get('territorio/:camada.geojson')
  @ApiParam({ name: 'camada', enum: CAMADAS })
  @ApiOperation({ summary: 'Camada do mapa em GeoJSON, simplificada pelo zoom (sem dado pessoal)' })
  async geojson(
    @Param('camada') camada: string,
    @Query('zoom') zoomTexto: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    if (!(CAMADAS as readonly string[]).includes(camada)) {
      throw erros.validacao({ camada: [`Use uma destas camadas: ${CAMADAS.join(', ')}.`] });
    }
    const zoom = Math.min(22, Math.max(0, Number.parseInt(zoomTexto ?? '14', 10) || 14));
    const { corpo, cache } = await this.territorio.geojson(camada as Camada, zoom);
    res.setHeader('Content-Type', 'application/geo+json; charset=utf-8');
    res.setHeader('X-Cache', cache);
    return corpo;
  }

  @Get('territorio/logradouros')
  @ApiOperation({
    summary: 'Busca de logradouro por similaridade (opcionalmente dentro de um setor)',
  })
  logradouros(@Query('q') q: string | undefined, @Query('setor') setor: string | undefined) {
    return this.territorio.buscarLogradouros(q ?? '', setor);
  }

  @Get('territorio/relatorio-geocodificacao')
  @Perfis('ADMIN_CTI', 'COMITE_GESTOR', 'SEMED_GESTOR', 'SAUDE_GESTOR', 'AUDITOR_TCE')
  @ApiOperation({ summary: 'Cobertura por fonte e precisão do ponto por setor (agregado)' })
  relatorio() {
    return this.territorio.relatorioGeocodificacao();
  }

  @Post('domicilios/:id/geocodificar')
  @Perfis('ADMIN_CTI')
  @ApiOperation({ summary: 'Recalcular o ponto do domicílio pela cascata de fontes' })
  geocodificar(@Param('id', ParseIntPipe) id: number) {
    return this.territorio.geocodificar(id);
  }

  @Put('domicilios/:id/ponto')
  @Perfis('ACS', 'CRAS_TECNICO', 'VISITADOR_PCF', 'SAUDE_GESTOR', 'SEMED_GESTOR', 'ADMIN_CTI')
  @ApiOperation({ summary: 'Confirmar ou ajustar o pino do domicílio em campo' })
  confirmarPonto(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodPipe(PontoGps)) ponto: PontoGps,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ) {
    return this.territorio.confirmarPonto(usuario, id, ponto);
  }
}
