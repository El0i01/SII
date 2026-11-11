/** Abreviações do tipo de logradouro, só no início do endereço (§3.2). */
const TIPOS: Record<string, string> = {
  R: 'RUA',
  AV: 'AVENIDA',
  TV: 'TRAVESSA',
  TRAV: 'TRAVESSA',
  LN: 'LINHA',
  EST: 'ESTRADA',
  ROD: 'RODOVIA',
  PC: 'PRACA',
  AL: 'ALAMEDA',
};

/**
 * Endereço para comparação por similaridade (pg_trgm): maiúsculas, sem acento, sem pontuação e com
 * o tipo do logradouro por extenso ("R." → "RUA"). O banco usa a mesma regra (unaccent + upper).
 */
export function normalizarEndereco(endereco: string): string {
  const partes = endereco
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  const [primeira, ...resto] = partes;
  if (primeira === undefined) return '';
  return [TIPOS[primeira] ?? primeira, ...resto].join(' ');
}
