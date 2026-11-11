import { createHash, randomBytes } from 'node:crypto';

/** Validade do JWT de acesso (CLAUDE.md). */
export const ACESSO_MINUTOS = 15;

export type Cliente = 'WEB' | 'MOBILE';

/** Token opaco de 256 bits, em base64url. Vai para o cliente; o banco guarda só o sha256. */
export function gerarTokenOpaco(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * sha256 em hex. Para um segredo aleatório de 256 bits não precisa de bcrypt: não há dicionário
 * para atacar, e a busca pelo hash precisa ser direta (índice único).
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Formato do token opaco: recusa lixo antes de ir ao banco. */
export function pareceTokenOpaco(valor: unknown): valor is string {
  return typeof valor === 'string' && /^[A-Za-z0-9_-]{43}$/.test(valor);
}

export function validadeRefreshMs(
  cliente: Cliente,
  cfg: { horasWeb: number; diasMobile: number },
): number {
  return cliente === 'WEB' ? cfg.horasWeb * 3_600_000 : cfg.diasMobile * 86_400_000;
}

export interface SessaoParaAvaliar {
  expiraEm: Date;
  usadoEm: Date | null;
  revogadoEm: Date | null;
}

export type ResultadoRefresh = 'VALIDO' | 'REUSO' | 'EXPIRADO';

/**
 * Um refresh já usado ou revogado que volta a aparecer é sinal de roubo (alguém guardou uma cópia):
 * a família inteira é revogada. Revogado conta como reuso porque, depois de uma revogação por reuso,
 * o token legítimo e o roubado ficam ambos sem acesso.
 */
export function avaliarRefresh(
  sessao: SessaoParaAvaliar,
  agora: Date = new Date(),
): ResultadoRefresh {
  if (sessao.usadoEm || sessao.revogadoEm) return 'REUSO';
  if (sessao.expiraEm.getTime() <= agora.getTime()) return 'EXPIRADO';
  return 'VALIDO';
}
