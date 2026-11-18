import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Module,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AprovarPesosIvm, FiltroPainel, PERFIS_COM_DADO_NOMINAL } from '@sii/shared';
import { z } from 'zod';
import { Perfis } from '../auth/decorators';
import { UsuarioAtual, type UsuarioAutenticado } from '../comum/usuario-autenticado';
import { ZodPipe } from '../comum/zod.pipe';
import { CiclosService } from './ciclos.service';

/** Ciclos de vida: perfis nominais (pela RLS) e o auditor (só agregados). */
const VEEM = [...PERFIS_COM_DADO_NOMINAL, 'AUDITOR_TCE'] as const;
/** O índice é por quadra (sem pessoa): também a Fazenda. */
const VEEM_IVM = [...VEEM, 'FAZENDA'] as const;

const Vagas = z.object({
  vagas: z
    .number({ message: 'Informe o número de vagas.' })
    .int('Use um número inteiro.')
    .min(0, 'Não pode ser negativo.')
    .max(2000, 'Confira o número: até 2.000 vagas.'),
});

/** Painéis de ciclos de vida e índice de vulnerabilidade (§3.9, §3.10, P19). */
@ApiTags('ciclos')
@Controller()
export class CiclosController {
  constructor(private readonly ciclos: CiclosService) {}

  @Get('ciclos/primeira-infancia')
  @Perfis(...VEEM)
  @ApiOperation({
    summary: 'Primeira infância (0 a 6): KPIs, por território, Criança Feliz, 0 a 3 sem cuidado',
  })
  primeiraInfancia(
    @UsuarioAtual() u: UsuarioAutenticado,
    @Query(new ZodPipe(FiltroPainel)) f: FiltroPainel,
  ) {
    return this.ciclos.primeiraInfancia(u, f.territorio ?? null);
  }

  @Get('ciclos/vagas-creche')
  @Perfis(...VEEM)
  @ApiOperation({
    summary: 'Simulador de vagas de creche: coortes, vagas, fila e índice por território',
  })
  vagasCreche(
    @UsuarioAtual() u: UsuarioAutenticado,
    @Query(new ZodPipe(FiltroPainel)) f: FiltroPainel,
  ) {
    return this.ciclos.vagasCreche(u, f.territorio ?? null);
  }

  @Put('ciclos/vagas-creche/oferta/:inep')
  @Perfis('SEMED_GESTOR', 'ADMIN_CTI')
  @ApiOperation({ summary: 'Vagas de creche da escola no ano' })
  definirOferta(
    @UsuarioAtual() u: UsuarioAutenticado,
    @Param('inep') inep: string,
    @Body(new ZodPipe(Vagas)) c: z.infer<typeof Vagas>,
  ) {
    return this.ciclos.definirOferta(u, inep, c.vagas);
  }

  @Get('ciclos/educacao-inclusiva')
  @Perfis(...VEEM)
  @ApiOperation({ summary: 'Educação inclusiva: atendimento especializado (sem diagnóstico)' })
  inclusiva(
    @UsuarioAtual() u: UsuarioAutenticado,
    @Query(new ZodPipe(FiltroPainel)) f: FiltroPainel,
  ) {
    return this.ciclos.educacaoInclusiva(u, f.territorio ?? null);
  }

  @Get('ciclos/eja')
  @Perfis(...VEEM)
  @ApiOperation({
    summary: 'EJA: público potencial pela escolaridade do CadÚnico, matrículas e convites',
  })
  eja(@UsuarioAtual() u: UsuarioAutenticado, @Query(new ZodPipe(FiltroPainel)) f: FiltroPainel) {
    return this.ciclos.eja(u, f.territorio ?? null);
  }

  @Get('ciclos/pessoa-idosa')
  @Perfis(...VEEM)
  @ApiOperation({ summary: 'Pessoa idosa: cruzamentos Saúde × Assistência e lista prioritária' })
  pessoaIdosa(
    @UsuarioAtual() u: UsuarioAutenticado,
    @Query(new ZodPipe(FiltroPainel)) f: FiltroPainel,
  ) {
    return this.ciclos.pessoaIdosa(u, f.territorio ?? null);
  }

  @Get('ivm')
  @Perfis(...VEEM_IVM)
  @ApiOperation({
    summary: 'Índice de vulnerabilidade por quadra, pesos vigentes e histórico de versões',
  })
  ivm(@Query(new ZodPipe(FiltroPainel)) f: FiltroPainel) {
    return this.ciclos.ivm(f.territorio ?? null);
  }

  @Post('ivm/pesos')
  @HttpCode(HttpStatus.OK)
  @Perfis('COMITE_GESTOR')
  @ApiOperation({ summary: 'Aprovar nova versão dos pesos do índice (recalcula o mapa)' })
  aprovarPesos(
    @UsuarioAtual() u: UsuarioAutenticado,
    @Body(new ZodPipe(AprovarPesosIvm)) a: AprovarPesosIvm,
  ) {
    return this.ciclos.aprovarPesos(u, a);
  }
}

@Module({ controllers: [CiclosController], providers: [CiclosService] })
export class CiclosModule {}
