import { HttpStatus, Injectable } from '@nestjs/common';
import { destinosDoUsuario, type EnderecoAviso, type TipoAviso, textoAviso } from '@sii/shared';
import { PrismaService } from '../banco/prisma.service';
import { ErroApi } from '../comum/erros';
import type { UsuarioAutenticado } from '../comum/usuario-autenticado';
import type { Prisma } from '../generated/prisma/client';

/**
 * Avisos internos (P11, ADR 0010). Não têm dado pessoal (só o código do caso e texto fixo), por isso
 * ficam fora da RLS: o filtro é pelo destino do usuário (`destinosDoUsuario`, shared).
 */
@Injectable()
export class AvisosService {
  constructor(private readonly prisma: PrismaService) {}

  private filtro(u: UsuarioAutenticado): Prisma.AvisoWhereInput | null {
    const destinos = destinosDoUsuario(u.perfil, u.escopos);
    if (destinos === null) return {};
    if (destinos.length === 0) return null;
    return { OR: destinos.map((d) => ({ destinoTipo: d.tipo, destinoValor: d.valor })) };
  }

  async listar(u: UsuarioAutenticado) {
    const where = this.filtro(u);
    if (!where) return { naoLidos: 0, avisos: [] };
    const [naoLidos, avisos] = await Promise.all([
      this.prisma.aviso.count({ where: { ...where, lidoEm: null } }),
      this.prisma.aviso.findMany({
        where,
        orderBy: { id: 'desc' },
        take: 50,
        select: {
          id: true,
          tipo: true,
          texto: true,
          criadoEm: true,
          lidoEm: true,
          caso: { select: { codigo: true, notificacoes: { select: { codigo: true }, take: 1 } } },
        },
      }),
    ]);
    return {
      naoLidos,
      avisos: avisos.map((a) => ({
        id: a.id,
        tipo: a.tipo,
        texto: a.texto,
        criadoEm: a.criadoEm,
        lidoEm: a.lidoEm,
        caso: a.caso.codigo,
        notificacao: a.caso.notificacoes[0]?.codigo ?? null,
      })),
    };
  }

  async marcarLido(u: UsuarioAutenticado, id: number) {
    const where = this.filtro(u);
    const r = where
      ? await this.prisma.aviso.updateMany({
          where: { ...where, id, lidoEm: null },
          data: { lidoEm: new Date() },
        })
      : { count: 0 };
    if (r.count === 0) {
      const existe = where ? await this.prisma.aviso.count({ where: { ...where, id } }) : 0;
      if (!existe)
        throw new ErroApi(HttpStatus.NOT_FOUND, 'NAO_ENCONTRADO', 'Aviso não encontrado.');
    }
  }
}

/** Grava avisos dentro da transação de quem gerou o fato (parecer, encaminhamento, prazo). */
export async function registrarAvisos(
  tx: Pick<Prisma.TransactionClient, 'aviso'>,
  casoId: number,
  codigoCaso: string,
  tipo: TipoAviso,
  destinos: EnderecoAviso[],
  detalhe?: string,
): Promise<number> {
  const unicos = [...new Map(destinos.map((d) => [`${d.tipo}|${d.valor}`, d])).values()];
  if (unicos.length === 0) return 0;
  const r = await tx.aviso.createMany({
    data: unicos.map((d) => ({
      destinoTipo: d.tipo,
      destinoValor: d.valor.slice(0, 20),
      casoId,
      tipo,
      texto: textoAviso(tipo, codigoCaso, detalhe),
    })),
  });
  return r.count;
}
