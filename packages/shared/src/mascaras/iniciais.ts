const PARTICULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', "d'"]);

/** Nome em iniciais para listas (`M. S. O.`). O nome completo só aparece na ficha, para perfil autorizado. */
export function iniciais(nome: string): string {
  const partes = nome
    .trim()
    .split(/\s+/)
    .filter((p) => p && !PARTICULAS.has(p.toLowerCase()));
  if (partes.length === 0) return '—';
  return partes.map((p) => `${p.charAt(0).toLocaleUpperCase('pt-BR')}.`).join(' ');
}
