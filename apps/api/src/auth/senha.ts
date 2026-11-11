import { randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';

/** Custo do bcrypt (CLAUDE.md). */
export const CUSTO_BCRYPT = 12;

export function hashSenha(senha: string): Promise<string> {
  return bcrypt.hash(senha, CUSTO_BCRYPT);
}

export function conferirSenha(senha: string, hash: string): Promise<boolean> {
  return bcrypt.compare(senha, hash);
}

/**
 * Hash de uma senha que ninguém tem. Usado quando o login não existe (ou está inativo) para que a
 * resposta leve o mesmo tempo de um login real e não revele quais logins existem.
 */
export const HASH_FICTICIO = bcrypt.hashSync('senha-que-nao-pertence-a-ninguem', CUSTO_BCRYPT);

/** Validade da senha provisória gerada pela CTI. Depois disso, o login com ela é recusado. */
export const VALIDADE_PROVISORIA_HORAS = 24;

// Sem letras e números que se confundem (l, 1, o, 0, i), para ditar por telefone ou copiar do papel.
export const ALFABETO_PROVISORIA = 'abcdefghjkmnpqrstuvwxyz23456789';

/** Senha provisória legível em três grupos: `xxxx-xxxx-xxxx` (≈ 59 bits). */
export function gerarSenhaProvisoria(agora: Date = new Date()): { senha: string; expiraEm: Date } {
  const grupo = () =>
    Array.from(
      { length: 4 },
      () => ALFABETO_PROVISORIA[randomInt(ALFABETO_PROVISORIA.length)],
    ).join('');
  return {
    senha: [grupo(), grupo(), grupo()].join('-'),
    expiraEm: new Date(agora.getTime() + VALIDADE_PROVISORIA_HORAS * 3_600_000),
  };
}
