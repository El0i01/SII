import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { type Perfil, veMunicipio } from '@sii/shared';
import { ErroApi, erros } from '../comum/erros';
import type { RequisicaoAutenticada } from '../comum/usuario-autenticado';
import {
  CHAVE_ESCOPO,
  CHAVE_LIBERADO_TROCA,
  CHAVE_PERFIS,
  CHAVE_PUBLICO,
  type RegraEscopo,
} from './decorators';

function metadado<T>(reflector: Reflector, chave: string, ctx: ExecutionContext): T | undefined {
  return reflector.getAllAndOverride<T>(chave, [ctx.getHandler(), ctx.getClass()]);
}

function requisicao(ctx: ExecutionContext): RequisicaoAutenticada {
  return ctx.switchToHttp().getRequest<RequisicaoAutenticada>();
}

/** 1º guard: exige JWT válido, exceto nas rotas @Publico(). */
@Injectable()
export class JwtGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override canActivate(ctx: ExecutionContext) {
    if (metadado<boolean>(this.reflector, CHAVE_PUBLICO, ctx)) return true;
    return super.canActivate(ctx);
  }

  override handleRequest<T>(erro: unknown, usuario: T): T {
    if (erro || !usuario) throw erros.naoAutenticado();
    return usuario;
  }
}

/** 2º guard: com senha provisória, só as rotas de troca de senha, "eu" e "sair" funcionam. */
@Injectable()
export class TrocaObrigatoriaGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const usuario = requisicao(ctx).user;
    if (!usuario?.trocaObrigatoria) return true;
    if (metadado<boolean>(this.reflector, CHAVE_LIBERADO_TROCA, ctx)) return true;
    throw new ErroApi(
      HttpStatus.FORBIDDEN,
      'TROCA_DE_SENHA_OBRIGATORIA',
      'Antes de continuar, crie sua senha pessoal.',
    );
  }
}

/** 3º guard (RBAC): @Perfis(...). */
@Injectable()
export class PerfisGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const permitidos = metadado<Perfil[]>(this.reflector, CHAVE_PERFIS, ctx);
    if (!permitidos) return true;
    const usuario = requisicao(ctx).user;
    if (!usuario || !permitidos.includes(usuario.perfil)) throw erros.semPermissao();
    return true;
  }
}

/** 4º guard (ABAC): @Escopo({ tipo, param }). */
@Injectable()
export class EscopoGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const regra = metadado<RegraEscopo>(this.reflector, CHAVE_ESCOPO, ctx);
    if (!regra) return true;
    const req = requisicao(ctx);
    const usuario = req.user;
    if (!usuario) throw erros.naoAutenticado();
    if (veMunicipio(usuario.perfil)) return true;

    const valor = req.params[regra.param];
    const tem = usuario.escopos.some((e) => e.tipo === regra.tipo && e.valor === valor);
    if (!tem) throw erros.foraDoEscopo();
    return true;
  }
}
