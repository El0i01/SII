import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../banco/prisma.service';
import { ErroApi } from '../comum/erros';
import { Env } from '../config/env';
import {
  avaliarRefresh,
  Cliente,
  gerarTokenOpaco,
  hashToken,
  pareceTokenOpaco,
  validadeRefreshMs,
} from './tokens';

export interface Metadados {
  ip?: string;
  userAgent?: string;
}

export interface RefreshEmitido {
  token: string;
  expiraEm: Date;
  cliente: Cliente;
}

const sessaoInvalida = () =>
  new ErroApi(HttpStatus.UNAUTHORIZED, 'SESSAO_INVALIDA', 'Sua sessão terminou. Entre de novo.');

/**
 * Refresh tokens opacos e rotativos (schema acesso). Cada uso troca o token por um novo da mesma
 * família; reuso de um token antigo revoga a família inteira.
 */
@Injectable()
export class SessoesService {
  private readonly logger = new Logger('sessoes');

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private validade(cliente: Cliente): number {
    return validadeRefreshMs(cliente, {
      horasWeb: this.config.get('REFRESH_HORAS_WEB', { infer: true }),
      diasMobile: this.config.get('REFRESH_DIAS_MOBILE', { infer: true }),
    });
  }

  async criar(
    usuarioId: number,
    cliente: Cliente,
    meta: Metadados,
    familiaId: string = randomUUID(),
  ): Promise<RefreshEmitido> {
    const token = gerarTokenOpaco();
    const expiraEm = new Date(Date.now() + this.validade(cliente));
    await this.prisma.sessaoRefresh.create({
      data: {
        familiaId,
        usuarioId,
        tokenHash: hashToken(token),
        cliente,
        expiraEm,
        ip: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
      },
    });
    return { token, expiraEm, cliente };
  }

  /** Troca um refresh válido por um novo. Devolve o dono da sessão. */
  async rotacionar(
    token: unknown,
    meta: Metadados,
  ): Promise<{ usuarioId: number; refresh: RefreshEmitido }> {
    if (!pareceTokenOpaco(token)) throw sessaoInvalida();
    const sessao = await this.prisma.sessaoRefresh.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (!sessao) throw sessaoInvalida();

    const agora = new Date();
    const situacao = avaliarRefresh(sessao, agora);
    if (situacao === 'REUSO') {
      await this.revogarPorReuso(sessao.familiaId, sessao.usuarioId, meta);
      throw sessaoInvalida();
    }
    if (situacao === 'EXPIRADO') throw sessaoInvalida();

    // Marca como usado só se ninguém usou antes: duas requisições com o mesmo token ao mesmo
    // tempo não ganham duas sessões; a segunda é tratada como reuso.
    const marcado = await this.prisma.sessaoRefresh.updateMany({
      where: { id: sessao.id, usadoEm: null, revogadoEm: null },
      data: { usadoEm: agora },
    });
    if (marcado.count === 0) {
      await this.revogarPorReuso(sessao.familiaId, sessao.usuarioId, meta);
      throw sessaoInvalida();
    }

    const refresh = await this.criar(sessao.usuarioId, sessao.cliente, meta, sessao.familiaId);
    return { usuarioId: sessao.usuarioId, refresh };
  }

  /** Encerra a família do token informado (botão "Sair"). Token desconhecido: não faz nada. */
  async encerrar(token: unknown): Promise<number | null> {
    if (!pareceTokenOpaco(token)) return null;
    const sessao = await this.prisma.sessaoRefresh.findUnique({
      where: { tokenHash: hashToken(token) },
      select: { familiaId: true, usuarioId: true },
    });
    if (!sessao) return null;
    await this.revogarFamilia(sessao.familiaId, 'SAIR');
    return sessao.usuarioId;
  }

  async revogarTodas(usuarioId: number, motivo: string): Promise<number> {
    const r = await this.prisma.sessaoRefresh.updateMany({
      where: { usuarioId, revogadoEm: null },
      data: { revogadoEm: new Date(), motivoRevogacao: motivo },
    });
    return r.count;
  }

  private async revogarFamilia(familiaId: string, motivo: string): Promise<void> {
    await this.prisma.sessaoRefresh.updateMany({
      where: { familiaId, revogadoEm: null },
      data: { revogadoEm: new Date(), motivoRevogacao: motivo },
    });
  }

  private async revogarPorReuso(familiaId: string, usuarioId: number, meta: Metadados) {
    await this.revogarFamilia(familiaId, 'REUSO');
    await this.prisma.eventoAcesso.create({
      data: {
        usuarioId,
        tipo: 'REUSO_REFRESH',
        ip: meta.ip ?? null,
        detalhe: 'refresh já usado apareceu de novo; família revogada',
      },
    });
    this.logger.warn(`reuso de refresh token: família revogada (usuário ${usuarioId})`);
  }
}
