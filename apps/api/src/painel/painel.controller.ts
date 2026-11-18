import { Controller, Get, Module, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { FiltroPainel, PERFIS_COM_DADO_NOMINAL } from '@sii/shared';
import { Perfis } from '../auth/decorators';
import { CasosModule } from '../casos/casos.module';
import { UsuarioAtual, type UsuarioAutenticado } from '../comum/usuario-autenticado';
import { ZodPipe } from '../comum/zod.pipe';
import { PainelService } from './painel.service';

/** Visão geral e listas de apoio do layout (P14). */
@ApiTags('painel')
@Controller()
export class PainelController {
  constructor(private readonly painel: PainelService) {}

  @Get('painel/visao-geral')
  @Perfis(...PERFIS_COM_DADO_NOMINAL, 'AUDITOR_TCE')
  @ApiOperation({ summary: 'Visão geral por território e período (auditor: < 5 suprimido)' })
  visaoGeral(
    @UsuarioAtual() u: UsuarioAutenticado,
    @Query(new ZodPipe(FiltroPainel)) filtro: FiltroPainel,
  ) {
    return this.painel.visaoGeral(u, filtro);
  }

  /** Só código e nome: alimenta o seletor de território do cabeçalho (qualquer usuário logado). */
  @Get('territorio/setores')
  @ApiOperation({ summary: 'Setores do município (código e nome)' })
  setores() {
    return this.painel.setores();
  }
}

@Module({ imports: [CasosModule], controllers: [PainelController], providers: [PainelService] })
export class PainelModule {}
