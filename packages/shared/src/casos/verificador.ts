/**
 * Código verificador da trilha de um caso (§3.7): os 12 primeiros caracteres hex do hash do último
 * evento, em `XXXX-XXXX-XXXX`. Vai no relatório ao TCE; quem recebe confere com `verificar_trilha`.
 */
export function codigoVerificador(hash: string | Uint8Array): string {
  const hex =
    typeof hash === 'string'
      ? hash.replace(/^\\x/, '')
      : Array.from(hash, (b) => b.toString(16).padStart(2, '0')).join('');
  if (!/^[0-9a-fA-F]{12,}$/.test(hex))
    throw new RangeError('Hash inválido para código verificador');
  const c = hex.slice(0, 12).toUpperCase();
  return `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8, 12)}`;
}

/** Normaliza o código digitado (espaços, hífens, minúsculas). Formato errado: null. */
export function normalizarCodigoVerificador(digitado: string): string | null {
  const c = digitado.replace(/[\s-]/g, '').toUpperCase();
  if (!/^[0-9A-F]{12}$/.test(c)) return null;
  return `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8, 12)}`;
}
