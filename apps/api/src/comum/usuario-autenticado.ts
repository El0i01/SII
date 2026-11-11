import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Escopo, Perfil } from '@sii/shared';
import type { Request } from 'express';

/** O que a API sabe de quem está chamando, depois de validar o token (jwt.strategy.ts). */
export interface UsuarioAutenticado {
  id: number;
  login: string;
  nome: string;
  perfil: Perfil;
  escopos: Escopo[];
  trocaObrigatoria: boolean;
}

export type RequisicaoAutenticada = Request & { user?: UsuarioAutenticado };

/** Injeta o usuário autenticado no handler: `eu(@UsuarioAtual() u: UsuarioAutenticado)`. */
export const UsuarioAtual = createParamDecorator(
  (_dado: unknown, ctx: ExecutionContext): UsuarioAutenticado | undefined =>
    ctx.switchToHttp().getRequest<RequisicaoAutenticada>().user,
);

/** IP e navegador da requisição, resumidos, para a trilha de acesso. */
export function metadadosRequisicao(req: Request): { ip?: string; userAgent?: string } {
  const ip = req.ip?.replace(/^::ffff:/, '').slice(0, 45);
  const userAgent = req.get('user-agent')?.slice(0, 200);
  return { ...(ip ? { ip } : {}), ...(userAgent ? { userAgent } : {}) };
}
