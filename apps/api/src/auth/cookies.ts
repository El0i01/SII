import type { Request, Response } from 'express';
import type { Credenciais } from './auth.service';
import type { Cliente } from './tokens';

export const COOKIE_ACESSO = 'sii_acesso';
export const COOKIE_REFRESH = 'sii_refresh';
/** O refresh só viaja para as rotas de autenticação. */
export const CAMINHO_REFRESH = '/api/v1/auth';
export const CAMINHO_ACESSO = '/api';

/** Cabeçalho com que o app mobile se identifica para receber os tokens no corpo. */
export const CABECALHO_CLIENTE = 'x-sii-cliente';

export function clienteDaRequisicao(req: Request): Cliente {
  return req.get(CABECALHO_CLIENTE)?.toLowerCase() === 'mobile' ? 'MOBILE' : 'WEB';
}

function base(seguro: boolean) {
  return { httpOnly: true, sameSite: 'strict' as const, secure: seguro };
}

export function gravarCookies(res: Response, c: Credenciais, seguro: boolean): void {
  res.cookie(COOKIE_ACESSO, c.acesso.token, {
    ...base(seguro),
    path: CAMINHO_ACESSO,
    expires: c.acesso.expiraEm,
  });
  res.cookie(COOKIE_REFRESH, c.refresh.token, {
    ...base(seguro),
    path: CAMINHO_REFRESH,
    expires: c.refresh.expiraEm,
  });
}

export function limparCookies(res: Response, seguro: boolean): void {
  res.clearCookie(COOKIE_ACESSO, { ...base(seguro), path: CAMINHO_ACESSO });
  res.clearCookie(COOKIE_REFRESH, { ...base(seguro), path: CAMINHO_REFRESH });
}

/** Resposta do login/refresh: o web recebe cookies; o mobile recebe os tokens no corpo. */
export function respostaCredenciais(c: Credenciais, cliente: Cliente) {
  const comum = {
    usuario: c.usuario,
    acessoExpiraEm: c.acesso.expiraEm,
    refreshExpiraEm: c.refresh.expiraEm,
  };
  return cliente === 'MOBILE'
    ? { ...comum, acessoToken: c.acesso.token, refreshToken: c.refresh.token }
    : comum;
}
