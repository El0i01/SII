import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Parecer, StatusNotificacao } from '@sii/shared';
import { Perfis } from '../auth/decorators';
import { UsuarioAtual, type UsuarioAutenticado } from '../comum/usuario-autenticado';
import { ZodPipe } from '../comum/zod.pipe';
import { NotificacoesService, RESPONDEM } from './notificacoes.service';

/** Leem as notificações: quem acompanha o caso. A RLS recorta o que cada um vê. */
const LEEM = [
  'ADMIN_CTI',
  'COMITE_GESTOR',
  'SEMED_GESTOR',
  'ESCOLA',
  'CRAS_TECNICO',
  'ASSISTENCIA_GESTOR',
] as const;

/** Notificações à Assistência e parecer (§3.7, §4.1, P11). */
@ApiTags('notificacoes')
@Controller('notificacoes')
export class NotificacoesController {
  constructor(private readonly notificacoes: NotificacoesService) {}

  @Get()
  @Perfis(...LEEM)
  @ApiQuery({ name: 'situacao', enum: ['NOVA', 'EM_ANALISE', 'PARECER_EMITIDO'], required: false })
  @ApiOperation({ summary: 'Caixa de entrada (CRAS) e acompanhamento (escola, SEMED, Comitê)' })
  listar(@UsuarioAtual() u: UsuarioAutenticado, @Query('situacao') situacao?: string) {
    const s = StatusNotificacao.safeParse(situacao);
    return this.notificacoes.listar(u, s.success ? s.data : undefined);
  }

  @Get(':codigo')
  @Perfis(...LEEM)
  @ApiOperation({ summary: 'Notificação com parecer e trilha do caso' })
  detalhe(@UsuarioAtual() u: UsuarioAutenticado, @Param('codigo') codigo: string) {
    return this.notificacoes.detalhe(u, codigo);
  }

  @Post(':codigo/em-analise')
  @HttpCode(HttpStatus.OK)
  @Perfis(...RESPONDEM)
  @ApiOperation({ summary: 'Marcar como em análise (visita em andamento)' })
  emAnalise(@UsuarioAtual() u: UsuarioAutenticado, @Param('codigo') codigo: string) {
    return this.notificacoes.emAnalise(u, codigo);
  }

  @Post(':codigo/parecer')
  @HttpCode(HttpStatus.OK)
  @Perfis(...RESPONDEM)
  @ApiOperation({ summary: 'Registrar o parecer (volta para a escola e a SEMED)' })
  parecer(
    @UsuarioAtual() u: UsuarioAutenticado,
    @Param('codigo') codigo: string,
    @Body(new ZodPipe(Parecer)) corpo: Parecer,
  ) {
    return this.notificacoes.parecer(u, codigo, corpo);
  }
}
