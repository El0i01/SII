import { Controller, Get, HttpStatus, Logger, Res } from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { PrismaService } from '../banco/prisma.service';
import { RedisService } from '../redis/redis.service';

export interface EstadoDependencia {
  ok: boolean;
  latenciaMs: number;
}

export interface EstadoServico {
  status: 'ok' | 'degradado';
  servico: 'api';
  horario: string;
  banco: EstadoDependencia & { postgis?: string };
  redis: EstadoDependencia;
}

export const LIMITE_VERIFICACAO_MS = 2_000;

/** Executa a verificação com tempo limite; erro e demora viram ok=false (detalhe só no log). */
async function medir<T>(
  nome: string,
  logger: Logger,
  verificar: () => Promise<T>,
): Promise<{ ok: boolean; latenciaMs: number; valor?: T }> {
  const inicio = performance.now();
  let timer: NodeJS.Timeout | undefined;
  try {
    const valor = await Promise.race([
      verificar(),
      new Promise<never>((_, rejeitar) => {
        timer = setTimeout(
          () => rejeitar(new Error(`sem resposta em ${LIMITE_VERIFICACAO_MS} ms`)),
          LIMITE_VERIFICACAO_MS,
        );
      }),
    ]);
    return { ok: true, latenciaMs: Math.round(performance.now() - inicio), valor };
  } catch (erro) {
    logger.warn(`${nome} indisponível: ${(erro as Error).message}`);
    return { ok: false, latenciaMs: Math.round(performance.now() - inicio) };
  } finally {
    clearTimeout(timer);
  }
}

@ApiTags('infra')
@Controller('health')
export class StatusController {
  private readonly logger = new Logger('health');

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async verificar(): Promise<EstadoServico> {
    const [banco, redis] = await Promise.all([
      medir('banco', this.logger, async () => {
        const [linha] = await this.prisma.$queryRaw<
          { versao: string }[]
        >`SELECT postgis_lib_version() AS versao`;
        return linha?.versao;
      }),
      medir('redis', this.logger, () => this.redis.ping()),
    ]);

    return {
      status: banco.ok && redis.ok ? 'ok' : 'degradado',
      servico: 'api',
      horario: new Date().toISOString(),
      banco: {
        ok: banco.ok,
        latenciaMs: banco.latenciaMs,
        ...(banco.valor ? { postgis: banco.valor } : {}),
      },
      redis: { ok: redis.ok, latenciaMs: redis.latenciaMs },
    };
  }

  @Get()
  @ApiOkResponse({ description: 'API, banco e Redis no ar.' })
  @ApiServiceUnavailableResponse({ description: 'Banco ou Redis fora do ar.' })
  async health(@Res({ passthrough: true }) res: Response): Promise<EstadoServico> {
    const estado = await this.verificar();
    res.status(estado.status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return estado;
  }
}
