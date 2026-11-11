import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../banco/prisma.service';
import type { UsuarioAutenticado } from '../comum/usuario-autenticado';
import { Env } from '../config/env';
import type { ConteudoJwt } from './auth.service';
import { COOKIE_ACESSO } from './cookies';

const doCookie = (req: Request): string | null =>
  (req.cookies as Record<string, string> | undefined)?.[COOKIE_ACESSO] ?? null;

/**
 * Lê o JWT do cookie (web) ou do Authorization: Bearer (mobile). A cada requisição recarrega o
 * usuário e os escopos: usuário desativado ou com senha trocada perde o acesso na hora, sem esperar
 * os 15 minutos do token.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        doCookie,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      secretOrKey: config.get('JWT_SEGREDO', { infer: true }),
      algorithms: ['HS256'],
      ignoreExpiration: false,
    });
  }

  async validate(conteudo: ConteudoJwt): Promise<UsuarioAutenticado | false> {
    const id = Number(conteudo.sub);
    if (!Number.isInteger(id) || id <= 0) return false;

    const usuario = await this.prisma.usuario.findUnique({
      where: { id },
      include: { escopos: { select: { tipo: true, valor: true } } },
    });
    if (!usuario || !usuario.ativo || usuario.versaoToken !== conteudo.tv) return false;

    return {
      id: usuario.id,
      login: usuario.login,
      nome: usuario.nome,
      perfil: usuario.perfil,
      escopos: usuario.escopos,
      trocaObrigatoria: usuario.trocaObrigatoria,
    };
  }
}
