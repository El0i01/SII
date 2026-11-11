import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import type { Escopo, Perfil } from '@sii/shared';
import { Prisma, PrismaClient } from '../generated/prisma/client';
import { Env } from '../config/env';

/** Quem está consultando, para a Row-Level Security. */
export interface ContextoBanco {
  id: number;
  perfil: Perfil;
  escopos: Escopo[];
}

/**
 * Papel do PostgreSQL por perfil. Valores fixos (nunca vêm da requisição), porque SET ROLE não
 * aceita parâmetro. AUDITOR_TCE usa um papel sem nenhum grant nas tabelas nominais.
 */
export function papelDoBanco(perfil: Perfil): 'sii_app' | 'sii_auditor' {
  return perfil === 'AUDITOR_TCE' ? 'sii_auditor' : 'sii_app';
}

/**
 * Cliente Prisma único da API. A conexão é preguiçosa: a API sobe mesmo com o banco fora,
 * e o /health mostra o problema em vez de a aplicação morrer na partida.
 *
 * Conecta como o dono do banco, que não passa pela RLS. Por isso, **todo acesso a dado nominal
 * (schemas pessoas, casos e os que vierem) passa por `comoUsuario`**. O cliente direto fica
 * para autenticação, health e tarefas da CTI.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: ConfigService<Env, true>) {
    super({
      adapter: new PrismaPg({
        connectionString: config.get('DATABASE_URL', { infer: true }),
        connectionTimeoutMillis: 2_000,
      }),
    });
  }

  /**
   * Executa `fn` numa transação com o papel e o contexto do usuário (SET LOCAL ROLE + set_config
   * locais). As policies do banco filtram as linhas; ao fim da transação tudo volta ao normal.
   */
  comoUsuario<T>(ctx: ContextoBanco, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    const papel = papelDoBanco(ctx.perfil);
    const escopos = JSON.stringify(ctx.escopos.map((e) => ({ tipo: e.tipo, valor: e.valor })));
    return this.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE ${papel}`);
      await tx.$executeRaw`SELECT
        set_config('sii.usuario_id', ${String(ctx.id)}, true),
        set_config('sii.perfil', ${ctx.perfil}, true),
        set_config('sii.escopos', ${escopos}, true)`;
      return fn(tx);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
