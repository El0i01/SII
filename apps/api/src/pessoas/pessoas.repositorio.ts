import { Injectable } from '@nestjs/common';
import { type ContextoBanco, PrismaService } from '../banco/prisma.service';
import { DocumentoInvalido } from '../cripto/cifra';
import { CriptoService } from '../cripto/cripto.service';

/**
 * Busca de pessoas por documento. Compara o HMAC do documento com a coluna `cpf_hash` (índice
 * único): nada é decifrado, e a RLS do usuário continua valendo (comoUsuario).
 */
@Injectable()
export class PessoasRepositorio {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cripto: CriptoService,
  ) {}

  async buscarPorCpf(ctx: ContextoBanco, cpf: string): Promise<{ id: number } | null> {
    let hash: Buffer;
    try {
      hash = this.cripto.hash('CPF', cpf);
    } catch (e) {
      if (e instanceof DocumentoInvalido) return null;
      throw e;
    }
    return this.prisma.comoUsuario(ctx, (tx) =>
      tx.pessoaMestra.findUnique({
        where: { cpfHash: new Uint8Array(hash) },
        select: { id: true },
      }),
    );
  }
}
