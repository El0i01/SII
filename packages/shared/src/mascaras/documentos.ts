export function somenteDigitos(valor: string): string {
  return valor.replace(/\D/g, '');
}

/** CPF mascarado `***.456.789-**` (§4.5). Tamanho errado: máscara cheia, sem vazar dígito. */
export function mascararCpf(cpf: string): string {
  const d = somenteDigitos(cpf);
  if (d.length !== 11) return '***.***.***-**';
  return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
}

/** NIS mascarado com o 4º ao 7º dígito: `***.4567*.**-*` (§4.5, decisão de 11/11/2026). */
export function mascararNis(nis: string): string {
  const d = somenteDigitos(nis);
  if (d.length !== 11) return '***.*****.**-*';
  return `***.${d.slice(3, 7)}*.**-*`;
}
