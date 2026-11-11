import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { iniciais } from '@sii/shared';
import { PrismaService } from '../banco/prisma.service';
import { UsuarioAtual, type UsuarioAutenticado } from '../comum/usuario-autenticado';
import { Escopo, Perfis } from '../auth/decorators';

/** Linha de lista: nome em iniciais (§4.5). A ficha completa entra no P12. */
export interface PessoaLista {
  id: number;
  iniciais: string;
  setor: string | null;
}

/**
 * Rotas mínimas do P03, para provar o caminho completo perfil → escopo → RLS.
 * O módulo `pessoas` de verdade (identidade única, ligação de fontes) é o P07.
 */
@ApiTags('pessoas')
@Controller()
export class PessoasController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('pessoas')
  @Perfis(
    'ADMIN_CTI',
    'COMITE_GESTOR',
    'SEMED_GESTOR',
    'ESCOLA',
    'SAUDE_GESTOR',
    'ACS',
    'CRAS_TECNICO',
    'VISITADOR_PCF',
  )
  @ApiOperation({ summary: 'Pessoas que o seu perfil e escopo permitem ver' })
  listar(@UsuarioAtual() usuario: UsuarioAutenticado): Promise<PessoaLista[]> {
    return this.prisma.comoUsuario(usuario, async (tx) => {
      const pessoas = await tx.pessoaMestra.findMany({
        select: { id: true, nome: true, setorCodigo: true },
        orderBy: { id: 'asc' },
        take: 500,
      });
      return pessoas.map((p) => ({ id: p.id, iniciais: iniciais(p.nome), setor: p.setorCodigo }));
    });
  }

  @Get('escolas/:inep/pessoas')
  @Perfis('ADMIN_CTI', 'COMITE_GESTOR', 'SEMED_GESTOR', 'ESCOLA')
  @Escopo({ tipo: 'ESCOLA', param: 'inep' })
  @ApiOperation({ summary: 'Alunos de uma escola (só a própria escola, para o perfil ESCOLA)' })
  porEscola(
    @Param('inep') inep: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<PessoaLista[]> {
    return this.prisma.comoUsuario(usuario, async (tx) => {
      const pessoas = await tx.pessoaMestra.findMany({
        where: { escolaInep: inep },
        select: { id: true, nome: true, setorCodigo: true },
        orderBy: { id: 'asc' },
      });
      return pessoas.map((p) => ({ id: p.id, iniciais: iniciais(p.nome), setor: p.setorCodigo }));
    });
  }

  @Get('agregados/pessoas-por-setor')
  @Perfis('ADMIN_CTI', 'COMITE_GESTOR', 'AUDITOR_TCE')
  @ApiOperation({ summary: 'Total de pessoas por setor, com contagens menores que 5 suprimidas' })
  porSetor(@UsuarioAtual() usuario: UsuarioAutenticado) {
    return this.prisma.comoUsuario(
      usuario,
      (tx) =>
        tx.$queryRaw<{ setor_codigo: string; total: string }[]>`
        SELECT setor_codigo, total FROM agregados.pessoas_por_setor ORDER BY setor_codigo`,
    );
  }
}
