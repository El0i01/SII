import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Module,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { MetaIndicador, VerificarTrilha } from '@sii/shared';
import type { Response } from 'express';
import { z } from 'zod';
import { Perfis } from '../auth/decorators';
import { UsuarioAtual, type UsuarioAutenticado } from '../comum/usuario-autenticado';
import { ZodPipe } from '../comum/zod.pipe';
import { IndicadoresService } from './indicadores.service';

/** Quem vê o controle externo: só números (o auditor pelo papel sii_auditor). */
const VEEM = ['ADMIN_CTI', 'COMITE_GESTOR', 'AUDITOR_TCE'] as const;

const FiltroSemestre = z.object({ semestre: z.string().trim().optional() });
const FiltroRelatorio = FiltroSemestre.extend({
  formato: z.enum(['pdf', 'xlsx'], { message: 'Use pdf ou xlsx.' }).default('pdf'),
});

const TIPO_ARQUIVO = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
} as const;

/** Indicadores OE1–OE6, relatório semestral e verificação da trilha (§3.11, P16). */
@ApiTags('indicadores')
@Controller()
export class IndicadoresController {
  constructor(private readonly indicadores: IndicadoresService) {}

  @Get('indicadores/controle-externo')
  @Perfis(...VEEM)
  @ApiOperation({ summary: 'Painel do controle externo: indicadores, gasto × resultado, trilhas' })
  controleExterno(
    @UsuarioAtual() u: UsuarioAutenticado,
    @Query(new ZodPipe(FiltroSemestre)) f: z.infer<typeof FiltroSemestre>,
  ) {
    return this.indicadores.controleExterno(u, f.semestre);
  }

  @Get('indicadores/relatorio')
  @Perfis(...VEEM)
  @ApiOperation({ summary: 'Relatório semestral ao TCE (PDF ou XLSX), sem dado pessoal' })
  async relatorio(
    @UsuarioAtual() u: UsuarioAutenticado,
    @Query(new ZodPipe(FiltroRelatorio)) f: z.infer<typeof FiltroRelatorio>,
    @Res({ passthrough: true }) res: Response,
  ) {
    const r = await this.indicadores.relatorio(u, f.semestre, f.formato);
    res.setHeader('Content-Type', TIPO_ARQUIVO[f.formato]);
    res.setHeader('Content-Disposition', `attachment; filename="${r.nome}"`);
    res.setHeader('X-Relatorio-Id', String(r.id));
    res.setHeader('X-Relatorio-Sha256', r.sha256);
    res.setHeader(
      'Access-Control-Expose-Headers',
      'Content-Disposition, X-Relatorio-Id, X-Relatorio-Sha256',
    );
    return new StreamableFile(r.arquivo);
  }

  @Post('indicadores/relatorios/:id/entregar')
  @HttpCode(HttpStatus.OK)
  @Perfis('ADMIN_CTI')
  @ApiOperation({ summary: 'Marcar o relatório como entregue ao TCE (OE5)' })
  entregar(@UsuarioAtual() u: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number) {
    return this.indicadores.entregar(u, id);
  }

  @Get('indicadores/metas')
  @Perfis(...VEEM)
  @ApiOperation({ summary: 'Metas e linhas de base vigentes' })
  metas() {
    return this.indicadores.listarMetas();
  }

  @Put('indicadores/metas/:indicador')
  @Perfis('ADMIN_CTI', 'COMITE_GESTOR')
  @ApiOperation({ summary: 'Nova versão da meta de um indicador' })
  definirMeta(
    @UsuarioAtual() u: UsuarioAutenticado,
    @Param('indicador') indicador: string,
    @Body(new ZodPipe(MetaIndicador)) m: MetaIndicador,
  ) {
    return this.indicadores.definirMeta(u, indicador, m);
  }

  @Post('auditoria/verificar-trilha')
  @HttpCode(HttpStatus.OK)
  @Perfis(...VEEM, 'DPO')
  @ApiOperation({ summary: 'Conferir a trilha de um caso pelo código verificador' })
  verificarTrilha(
    @UsuarioAtual() u: UsuarioAutenticado,
    @Body(new ZodPipe(VerificarTrilha)) v: VerificarTrilha,
  ) {
    return this.indicadores.verificarTrilha(u, v);
  }
}

@Module({ controllers: [IndicadoresController], providers: [IndicadoresService] })
export class IndicadoresModule {}
