import { ehDataISO, type DataISO } from '../calendario/dias';
import { somenteDigitos } from '../mascaras/documentos';

/**
 * Normalização de documentos e valores vindos das cargas (§5). Nada aqui devolve o valor numa
 * mensagem: quem chama recebe `null` e um motivo fixo.
 */

const todosIguais = (d: string) => /^(\d)\1+$/.test(d);

function dvCpf(base: string): number {
  let soma = 0;
  for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (base.length + 1 - i);
  const resto = (soma * 10) % 11;
  return resto === 10 ? 0 : resto;
}

/** CPF com 11 dígitos (completa zeros à esquerda, como o Excel tira) e dígitos verificadores. */
export function normalizarCpf(valor: string | null | undefined): string | null {
  const d = somenteDigitos(valor ?? '');
  if (d.length === 0 || d.length > 11) return null;
  const cpf = d.padStart(11, '0');
  if (todosIguais(cpf)) return null;
  const base = cpf.slice(0, 9);
  const d1 = dvCpf(base);
  const d2 = dvCpf(base + d1);
  return cpf === `${base}${d1}${d2}` ? cpf : null;
}

const PESOS_NIS = [3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

/** NIS/PIS/PASEP com 11 dígitos e dígito verificador (módulo 11, pesos 3298765432). */
export function normalizarNis(valor: string | null | undefined): string | null {
  const d = somenteDigitos(valor ?? '');
  if (d.length === 0 || d.length > 11) return null;
  const nis = d.padStart(11, '0');
  if (todosIguais(nis)) return null;
  const soma = PESOS_NIS.reduce((s, p, i) => s + p * Number(nis[i]), 0);
  const resto = 11 - (soma % 11);
  const dv = resto >= 10 ? 0 : resto;
  return Number(nis[10]) === dv ? nis : null;
}

/** Data em DD/MM/AAAA (CECAD), DDMMAAAA ou AAAA-MM-DD (Portal). Inválida → null. */
export function lerData(valor: string | null | undefined): DataISO | null {
  const v = (valor ?? '').trim();
  let iso: string | null = null;
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v) ?? /^(\d{2})(\d{2})(\d{4})$/.exec(v);
  if (br) iso = `${br[3]}-${br[2]}-${br[1]}`;
  else if (/^\d{4}-\d{2}-\d{2}/.test(v)) iso = v.slice(0, 10);
  return iso && ehDataISO(iso) ? iso : null;
}

/** Número em formato brasileiro (1.234,56) ou com ponto decimal (1234.56). Inválido → null. */
export function lerDecimal(valor: string | null | undefined): number | null {
  let v = (valor ?? '').trim().replace(/^R\$\s*/, '');
  if (v === '') return null;
  if (v.includes(',')) v = v.replace(/\./g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(v)) return null;
  return Number(v);
}
