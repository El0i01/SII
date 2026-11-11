import { Body, Controller, Get, Param, ParseIntPipe, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ParametrosCalendario } from '@sii/shared';
import { Escopo, Perfis } from '../auth/decorators';
import { ErroApi } from '../comum/erros';
import { UsuarioAtual, type UsuarioAutenticado } from '../comum/usuario-autenticado';
import { ZodPipe } from '../comum/zod.pipe';
import { CalendarioService } from './calendario.service';

const anoValido = (ano: number) => {
  if (ano < 2020 || ano > 2100) {
    throw new ErroApi(422, 'VALIDACAO', 'Ano inválido.', {
      ano: ['Use um ano entre 2020 e 2100.'],
    });
  }
  return ano;
};

@ApiTags('educacao')
@Controller()
export class CalendarioController {
  constructor(private readonly calendario: CalendarioService) {}

  @Get('escolas/:inep/calendario/:ano')
  @Perfis('ADMIN_CTI', 'COMITE_GESTOR', 'SEMED_GESTOR', 'ESCOLA')
  @Escopo({ tipo: 'ESCOLA', param: 'inep' })
  @ApiOperation({ summary: 'Parâmetros do calendário escolar de uma escola no ano' })
  consultar(@Param('inep') inep: string, @Param('ano', ParseIntPipe) ano: number) {
    return this.calendario.consultar(inep, anoValido(ano));
  }

  @Put('escolas/:inep/calendario/:ano')
  @Perfis('ADMIN_CTI', 'SEMED_GESTOR')
  @ApiOperation({ summary: 'Definir o calendário de uma escola (regera os dias letivos)' })
  definir(
    @Param('inep') inep: string,
    @Param('ano', ParseIntPipe) ano: number,
    @Body(new ZodPipe(ParametrosCalendario)) parametros: ParametrosCalendario,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ) {
    return this.calendario.definir(inep, anoValido(ano), parametros, usuario.id);
  }

  @Put('calendarios/:ano')
  @Perfis('ADMIN_CTI', 'SEMED_GESTOR')
  @ApiQuery({ name: 'rede', enum: ['MUNICIPAL', 'ESTADUAL'], required: false })
  @ApiOperation({ summary: 'Definir o mesmo calendário para todas as escolas de uma rede' })
  definirRede(
    @Param('ano', ParseIntPipe) ano: number,
    @Query('rede') rede: string | undefined,
    @Body(new ZodPipe(ParametrosCalendario)) parametros: ParametrosCalendario,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ) {
    const r = rede === 'ESTADUAL' ? 'ESTADUAL' : 'MUNICIPAL';
    return this.calendario.definirRede(r, anoValido(ano), parametros, usuario.id);
  }
}
