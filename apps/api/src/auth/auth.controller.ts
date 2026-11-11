import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Login, TrocarSenha } from '@sii/shared';
import type { Request, Response } from 'express';
import {
  metadadosRequisicao,
  type RequisicaoAutenticada,
  UsuarioAtual,
  type UsuarioAutenticado,
} from '../comum/usuario-autenticado';
import { ZodPipe } from '../comum/zod.pipe';
import { Env } from '../config/env';
import { AuthService } from './auth.service';
import {
  CABECALHO_CLIENTE,
  clienteDaRequisicao,
  COOKIE_REFRESH,
  gravarCookies,
  limparCookies,
  respostaCredenciais,
} from './cookies';
import { LiberadoComTrocaPendente, Publico } from './decorators';

/** Refresh: o web manda no cookie; o mobile, no corpo ({ refreshToken }). */
function refreshDaRequisicao(req: Request): unknown {
  const doCorpo = (req.body as { refreshToken?: unknown } | undefined)?.refreshToken;
  return doCorpo ?? (req.cookies as Record<string, string> | undefined)?.[COOKIE_REFRESH];
}

@ApiTags('auth')
@ApiHeader({
  name: CABECALHO_CLIENTE,
  required: false,
  description: '"mobile" para receber os tokens no corpo em vez de cookies',
})
@Controller('auth')
export class AuthController {
  private readonly cookieSeguro: boolean;

  constructor(
    private readonly auth: AuthService,
    config: ConfigService<Env, true>,
  ) {
    this.cookieSeguro = config.get('NODE_ENV', { infer: true }) === 'production';
  }

  @Post('login')
  @Publico()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Entrar com login e senha' })
  async login(
    @Body(new ZodPipe(Login)) dados: Login,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cliente = clienteDaRequisicao(req);
    const credenciais = await this.auth.entrar(dados, cliente, metadadosRequisicao(req));
    if (cliente === 'WEB') gravarCookies(res, credenciais, this.cookieSeguro);
    return respostaCredenciais(credenciais, cliente);
  }

  @Post('refresh')
  @Publico()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renovar a sessão (troca o refresh token por um novo)' })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const cliente = clienteDaRequisicao(req);
    try {
      const credenciais = await this.auth.renovar(
        refreshDaRequisicao(req),
        metadadosRequisicao(req),
      );
      if (cliente === 'WEB') gravarCookies(res, credenciais, this.cookieSeguro);
      return respostaCredenciais(credenciais, credenciais.refresh.cliente);
    } catch (erro) {
      if (cliente === 'WEB') limparCookies(res, this.cookieSeguro);
      throw erro;
    }
  }

  @Post('sair')
  @Publico()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Sair (encerra a sessão deste aparelho)' })
  async sair(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.sair(refreshDaRequisicao(req), metadadosRequisicao(req));
    limparCookies(res, this.cookieSeguro);
  }

  @Get('eu')
  @LiberadoComTrocaPendente()
  @ApiOperation({ summary: 'Quem sou eu (perfil, escopos e se precisa trocar a senha)' })
  eu(@UsuarioAtual() usuario: UsuarioAutenticado): UsuarioAutenticado {
    return usuario;
  }

  @Post('trocar-senha')
  @LiberadoComTrocaPendente()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Trocar a senha (obrigatório depois de uma senha provisória)' })
  async trocarSenha(
    @Body(new ZodPipe(TrocarSenha)) dados: TrocarSenha,
    @Req() req: RequisicaoAutenticada,
    @Res({ passthrough: true }) res: Response,
  ) {
    const usuario = req.user as UsuarioAutenticado;
    const cliente = clienteDaRequisicao(req);
    const credenciais = await this.auth.trocarSenha(
      usuario.id,
      dados,
      cliente,
      metadadosRequisicao(req),
    );
    if (cliente === 'WEB') gravarCookies(res, credenciais, this.cookieSeguro);
    return respostaCredenciais(credenciais, cliente);
  }
}
