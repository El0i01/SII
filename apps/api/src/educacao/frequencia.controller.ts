import { Body, Controller, Get, Param, ParseIntPipe, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { hojeEmPortoVelho, LancamentosFrequencia, MesFrequencia } from '@sii/shared';
import { Escopo, Perfis } from '../auth/decorators';
import { UsuarioAtual, type UsuarioAutenticado } from '../comum/usuario-autenticado';
import { ZodPipe } from '../comum/zod.pipe';
import { FrequenciaService } from './frequencia.service';

const LEEM = ['ADMIN_CTI', 'COMITE_GESTOR', 'SEMED_GESTOR', 'ESCOLA'] as const;
const LANCAM = ['ADMIN_CTI', 'SEMED_GESTOR', 'ESCOLA'] as const;

/** Escolas, turmas e frequência diária da turma (§3.4, P10). */
@ApiTags('educacao')
@Controller('escolas')
export class FrequenciaController {
  constructor(private readonly frequencia: FrequenciaService) {}

  @Get()
  @Perfis(...LEEM)
  @ApiOperation({ summary: 'Escolas que o usuário pode abrir' })
  escolas(@UsuarioAtual() u: UsuarioAutenticado) {
    return this.frequencia.escolas(u);
  }

  @Get(':inep/turmas')
  @Perfis(...LEEM)
  @Escopo({ tipo: 'ESCOLA', param: 'inep' })
  @ApiQuery({ name: 'ano', required: false })
  @ApiOperation({ summary: 'Turmas da escola no ano (padrão: o ano corrente)' })
  turmas(@Param('inep') inep: string, @Query('ano') ano?: string) {
    const n = Number(ano);
    const valido = Number.isInteger(n) && n >= 2020 && n <= 2100;
    return this.frequencia.turmas(inep, valido ? n : Number(hojeEmPortoVelho().slice(0, 4)));
  }

  @Get(':inep/turmas/:turmaId/frequencia')
  @Perfis(...LEEM)
  @Escopo({ tipo: 'ESCOLA', param: 'inep' })
  @ApiQuery({ name: 'mes', description: 'AAAA-MM', required: true })
  @ApiOperation({ summary: 'Grade aluno × dia letivo do mês' })
  grade(
    @Param('inep') inep: string,
    @Param('turmaId', ParseIntPipe) turmaId: number,
    @Query('mes', new ZodPipe(MesFrequencia)) mes: string,
    @UsuarioAtual() u: UsuarioAutenticado,
  ) {
    return this.frequencia.grade(u, inep, turmaId, mes);
  }

  @Put(':inep/turmas/:turmaId/frequencia')
  @Perfis(...LANCAM)
  @Escopo({ tipo: 'ESCOLA', param: 'inep' })
  @ApiOperation({ summary: 'Lançar ou corrigir a frequência (lote; situação null apaga)' })
  lancar(
    @Param('inep') inep: string,
    @Param('turmaId', ParseIntPipe) turmaId: number,
    @Body(new ZodPipe(LancamentosFrequencia)) corpo: LancamentosFrequencia,
    @UsuarioAtual() u: UsuarioAutenticado,
  ) {
    return this.frequencia.lancar(u, inep, turmaId, corpo.lancamentos);
  }
}
