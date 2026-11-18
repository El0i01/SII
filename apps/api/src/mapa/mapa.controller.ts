import { Controller, Get, Module, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { FiltroPainel, PERFIS_COM_DADO_NOMINAL } from '@sii/shared';
import { Perfis } from '../auth/decorators';
import { UsuarioAtual, type UsuarioAutenticado } from '../comum/usuario-autenticado';
import { ZodPipe } from '../comum/zod.pipe';
import { MapaService } from './mapa.service';

/** Quem abre o mapa: perfis nominais (pela RLS) e os de agregado (auditor do TCE e Fazenda). */
const VEEM_MAPA = [...PERFIS_COM_DADO_NOMINAL, 'AUDITOR_TCE', 'FAZENDA'] as const;

/** Tela Território (P15). */
@ApiTags('mapa')
@Controller('mapa')
export class MapaController {
  constructor(private readonly mapa: MapaService) {}

  @Get('quadras')
  @Perfis(...VEEM_MAPA)
  @ApiOperation({ summary: 'Indicadores de todas as camadas por quadra (agregado: < 5 suprimido)' })
  quadras(
    @UsuarioAtual() u: UsuarioAutenticado,
    @Query(new ZodPipe(FiltroPainel)) f: FiltroPainel,
  ) {
    return this.mapa.quadras(u, f.territorio ?? null);
  }

  @Get('pontos')
  @Perfis(...PERFIS_COM_DADO_NOMINAL)
  @ApiOperation({
    summary: 'Pontos do calor e do Criança Feliz (só coordenadas; só perfis nominais)',
  })
  pontos(@UsuarioAtual() u: UsuarioAutenticado, @Query(new ZodPipe(FiltroPainel)) f: FiltroPainel) {
    return this.mapa.pontos(u, f.territorio ?? null);
  }

  @Get('quadras/:id')
  @Perfis(...VEEM_MAPA)
  @ApiOperation({
    summary: 'Detalhe da quadra: lotes e moradores (iniciais; agregado sem moradores)',
  })
  detalhe(@UsuarioAtual() u: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number) {
    return this.mapa.detalhe(u, id);
  }
}

@Module({ controllers: [MapaController], providers: [MapaService] })
export class MapaModule {}
