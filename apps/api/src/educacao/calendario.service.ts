import { HttpStatus, Injectable } from '@nestjs/common';
import { gerarDiasLetivos, type ParametrosCalendario } from '@sii/shared';
import { PrismaService } from '../banco/prisma.service';
import { ErroApi } from '../comum/erros';

const escolaNaoEncontrada = () =>
  new ErroApi(HttpStatus.NOT_FOUND, 'ESCOLA_NAO_ENCONTRADA', 'Escola não encontrada.');

/**
 * Calendário escolar configurável (decisão de 11/11/2026). Os parâmetros ficam em
 * educacao.calendario_parametros e os dias letivos são regerados em educacao.calendario_escolar,
 * que é o que a regra das 5 faltas usa. Não é dado nominal: usa o cliente direto.
 */
@Injectable()
export class CalendarioService {
  constructor(private readonly prisma: PrismaService) {}

  async consultar(inep: string, ano: number) {
    const escola = await this.prisma.escola.findUnique({
      where: { inep },
      select: { id: true, nome: true },
    });
    if (!escola) throw escolaNaoEncontrada();
    const config = await this.prisma.calendarioParametros.findUnique({
      where: { escolaId_ano: { escolaId: escola.id, ano } },
    });
    return {
      escola: { inep, nome: escola.nome },
      ano,
      parametros: config?.parametros ?? null,
      diasLetivos: config?.diasLetivos ?? 0,
      atualizadoEm: config?.atualizadoEm ?? null,
    };
  }

  /** Define o calendário de uma escola. Devolve quantos dias letivos o ano passou a ter. */
  async definir(inep: string, ano: number, parametros: ParametrosCalendario, usuarioId: number) {
    const escola = await this.prisma.escola.findUnique({ where: { inep }, select: { id: true } });
    if (!escola) throw escolaNaoEncontrada();
    const [r] = await this.aplicar([escola.id], ano, parametros, usuarioId);
    return r;
  }

  /** Aplica o mesmo calendário a todas as escolas de uma rede (a SEDUC define o da estadual). */
  async definirRede(
    rede: 'MUNICIPAL' | 'ESTADUAL',
    ano: number,
    parametros: ParametrosCalendario,
    usuarioId: number,
  ) {
    const escolas = await this.prisma.escola.findMany({ where: { rede }, select: { id: true } });
    const r = await this.aplicar(
      escolas.map((e) => e.id),
      ano,
      parametros,
      usuarioId,
    );
    return { escolas: r.length, diasLetivos: r[0]?.diasLetivos ?? 0 };
  }

  private async aplicar(
    escolaIds: number[],
    ano: number,
    parametros: ParametrosCalendario,
    usuarioId: number,
  ) {
    if (Number(parametros.inicio.slice(0, 4)) !== ano) {
      throw new ErroApi(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'VALIDACAO',
        'Confira os campos destacados.',
        {
          inicio: [`O calendário precisa ser do ano ${ano}.`],
        },
      );
    }
    const dias = gerarDiasLetivos(parametros).map((d) => new Date(`${d}T00:00:00Z`));
    return this.prisma.$transaction(async (tx) => {
      const resultado: { diasLetivos: number }[] = [];
      for (const escolaId of escolaIds) {
        await tx.calendarioEscolar.deleteMany({
          where: {
            escolaId,
            dia: {
              gte: new Date(`${ano}-01-01T00:00:00Z`),
              lte: new Date(`${ano}-12-31T00:00:00Z`),
            },
          },
        });
        await tx.calendarioEscolar.createMany({ data: dias.map((dia) => ({ escolaId, dia })) });
        await tx.calendarioParametros.upsert({
          where: { escolaId_ano: { escolaId, ano } },
          create: { escolaId, ano, parametros, diasLetivos: dias.length, atualizadoPor: usuarioId },
          update: { parametros, diasLetivos: dias.length, atualizadoPor: usuarioId },
        });
        resultado.push({ diasLetivos: dias.length });
      }
      return resultado;
    });
  }
}
