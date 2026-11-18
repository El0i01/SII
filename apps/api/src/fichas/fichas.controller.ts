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
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AcessosPorCpf,
  BOM_UTF8,
  ConsultaFichas,
  FiltroAcessos,
  PERFIS_COM_DADO_NOMINAL,
  RevelarCpf,
} from '@sii/shared';
import type { Request, Response } from 'express';
import { Perfis } from '../auth/decorators';
import {
  metadadosRequisicao,
  UsuarioAtual,
  type UsuarioAutenticado,
} from '../comum/usuario-autenticado';
import { ZodPipe } from '../comum/zod.pipe';
import { FichasService } from './fichas.service';

/** Ficha da criança (§3.8) e revelação de CPF com finalidade (§3.12), P12. */
@ApiTags('fichas')
@Controller()
export class FichasController {
  constructor(private readonly fichas: FichasService) {}

  @Get('fichas')
  @Perfis(...PERFIS_COM_DADO_NOMINAL)
  @ApiOperation({ summary: 'Crianças e adolescentes (0 a 17) que o seu perfil vê, por prioridade' })
  listar(
    @UsuarioAtual() u: UsuarioAutenticado,
    @Query(new ZodPipe(ConsultaFichas)) consulta: ConsultaFichas,
  ) {
    return this.fichas.listar(u, consulta);
  }

  @Get('fichas/:id')
  @Perfis(...PERFIS_COM_DADO_NOMINAL)
  @ApiOperation({ summary: 'Ficha da criança: blocos, motivos de visita, histórico e visitas' })
  detalhe(@UsuarioAtual() u: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number) {
    return this.fichas.detalhe(u, id);
  }

  @Post('fichas/:id/revelar-cpf')
  @HttpCode(HttpStatus.OK)
  @Perfis(...PERFIS_COM_DADO_NOMINAL)
  @ApiOperation({ summary: 'Revelar o CPF (finalidade obrigatória; o acesso fica registrado)' })
  revelarCpf(
    @UsuarioAtual() u: UsuarioAutenticado,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodPipe(RevelarCpf)) corpo: RevelarCpf,
    @Req() req: Request,
  ) {
    return this.fichas.revelarCpf(u, id, corpo, metadadosRequisicao(req).ip);
  }

  @Get('auditoria/acessos')
  @Perfis('DPO', 'ADMIN_CTI')
  @ApiOperation({ summary: 'Painel do DPO: acessos a dado pessoal' })
  acessos(@Query(new ZodPipe(FiltroAcessos)) filtro: FiltroAcessos) {
    return this.fichas.acessos(filtro);
  }

  @Get('auditoria/acessos.csv')
  @Perfis('DPO', 'ADMIN_CTI')
  @ApiOperation({ summary: 'Acessos a dado pessoal em CSV (nunca o número revelado)' })
  async acessosCsv(
    @Query(new ZodPipe(FiltroAcessos)) filtro: FiltroAcessos,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="acessos-dado-pessoal.csv"');
    return BOM_UTF8 + (await this.fichas.acessosCsv(filtro));
  }

  /** CPF só no corpo (nunca em URL nem log). A consulta também fica registrada. */
  @Post('auditoria/acessos/por-cpf')
  @HttpCode(HttpStatus.OK)
  @Perfis('DPO', 'ADMIN_CTI')
  @ApiOperation({ summary: 'Acessos de uma pessoa pelo CPF (atendimento ao titular)' })
  acessosPorCpf(
    @UsuarioAtual() u: UsuarioAutenticado,
    @Body(new ZodPipe(AcessosPorCpf)) corpo: AcessosPorCpf,
    @Req() req: Request,
  ) {
    return this.fichas.acessosPorCpf(u, corpo, metadadosRequisicao(req).ip);
  }
}
