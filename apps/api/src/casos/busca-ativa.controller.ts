import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  EncaminharBuscaAtiva,
  MatriculaBuscaAtiva,
  PERFIS_COM_DADO_NOMINAL,
  VisitaBuscaAtiva,
} from '@sii/shared';
import { Perfis } from '../auth/decorators';
import { UsuarioAtual, type UsuarioAutenticado } from '../comum/usuario-autenticado';
import { ZodPipe } from '../comum/zod.pipe';
import { BuscaAtivaService } from './busca-ativa.service';

/**
 * Quem age em cada etapa (o service confere a secretaria do caso com `quemPode`): aqui fica só o
 * primeiro filtro de perfil.
 */
const AGEM = [
  'ADMIN_CTI',
  'COMITE_GESTOR',
  'SEMED_GESTOR',
  'CRAS_TECNICO',
  'ASSISTENCIA_GESTOR',
  'SAUDE_GESTOR',
  'ACS',
] as const;

/** Busca ativa escolar (§4.2, P13). */
@ApiTags('busca-ativa')
@Controller('busca-ativa')
export class BuscaAtivaController {
  constructor(private readonly busca: BuscaAtivaService) {}

  @Get('painel')
  @Perfis(...PERFIS_COM_DADO_NOMINAL, 'AUDITOR_TCE')
  @ApiOperation({ summary: 'KPIs, funil e origem (auditor: só agregados, < 5 suprimido)' })
  painel(@UsuarioAtual() u: UsuarioAutenticado) {
    return this.busca.painel(u);
  }

  @Get()
  @Perfis(...PERFIS_COM_DADO_NOMINAL)
  @ApiOperation({ summary: 'Casos de busca ativa visíveis para o seu perfil (CPF mascarado)' })
  listar(@UsuarioAtual() u: UsuarioAutenticado) {
    return this.busca.listar(u);
  }

  @Get(':codigo')
  @Perfis(...PERFIS_COM_DADO_NOMINAL)
  @ApiOperation({ summary: 'Caso com a trilha e as visitas' })
  detalhe(@UsuarioAtual() u: UsuarioAutenticado, @Param('codigo') codigo: string) {
    return this.busca.detalhe(u, codigo);
  }

  @Post(':codigo/encaminhar')
  @HttpCode(HttpStatus.OK)
  @Perfis(...AGEM)
  @ApiOperation({ summary: 'Encaminhar à secretaria responsável (SEMED, Assistência ou Saúde)' })
  encaminhar(
    @UsuarioAtual() u: UsuarioAutenticado,
    @Param('codigo') codigo: string,
    @Body(new ZodPipe(EncaminharBuscaAtiva)) corpo: EncaminharBuscaAtiva,
  ) {
    return this.busca.agir(u, codigo, 'ENCAMINHAR', corpo);
  }

  @Post(':codigo/visita')
  @HttpCode(HttpStatus.OK)
  @Perfis(...AGEM)
  @ApiOperation({ summary: 'Registrar a visita (família localizada ou não)' })
  visita(
    @UsuarioAtual() u: UsuarioAutenticado,
    @Param('codigo') codigo: string,
    @Body(new ZodPipe(VisitaBuscaAtiva)) corpo: VisitaBuscaAtiva,
  ) {
    return this.busca.agir(u, codigo, 'VISITA', corpo);
  }

  @Post(':codigo/matricula')
  @HttpCode(HttpStatus.OK)
  @Perfis(...AGEM)
  @ApiOperation({ summary: 'Registrar a matrícula (cria a matrícula e fecha o caso)' })
  matricula(
    @UsuarioAtual() u: UsuarioAutenticado,
    @Param('codigo') codigo: string,
    @Body(new ZodPipe(MatriculaBuscaAtiva)) corpo: MatriculaBuscaAtiva,
  ) {
    return this.busca.agir(u, codigo, 'MATRICULAR', corpo);
  }

  @Post(':codigo/conselho-tutelar')
  @HttpCode(HttpStatus.OK)
  @Perfis(...AGEM)
  @ApiOperation({ summary: 'Comunicar o Conselho Tutelar (não localizado; fecha o caso)' })
  conselho(@UsuarioAtual() u: UsuarioAutenticado, @Param('codigo') codigo: string) {
    return this.busca.agir(u, codigo, 'CONSELHO');
  }
}
