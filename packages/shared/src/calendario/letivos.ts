import { z } from 'zod';
import { adicionarDias, type DataISO, diaDaSemana, ehDataISO } from './dias';

const data = z.string().refine(ehDataISO, 'Data inválida (use AAAA-MM-DD).');

const Periodo = z.object({ inicio: data, fim: data }).refine((p) => p.fim >= p.inicio, {
  path: ['fim'],
  message: 'O fim precisa ser depois do início.',
});

/**
 * Parâmetros do calendário escolar de uma escola num ano (configurável pela SEMED/CTI).
 * Os dias letivos são gerados a partir deles: dias úteis entre início e fim, menos recessos e
 * feriados, mais os dias letivos extras (sábado letivo, reposição).
 */
export const ParametrosCalendario = z
  .object({
    inicio: data,
    fim: data,
    recessos: z.array(Periodo).max(20).default([]),
    feriados: z.array(data).max(60).default([]),
    letivosExtras: z.array(data).max(60).default([]),
  })
  .superRefine((p, ctx) => {
    if (p.fim < p.inicio) {
      ctx.addIssue({
        code: 'custom',
        path: ['fim'],
        message: 'O fim precisa ser depois do início.',
      });
    } else if (p.inicio.slice(0, 4) !== p.fim.slice(0, 4)) {
      ctx.addIssue({
        code: 'custom',
        path: ['fim'],
        message: 'O ano letivo precisa começar e terminar no mesmo ano.',
      });
    }
  });
export type ParametrosCalendario = z.infer<typeof ParametrosCalendario>;

/** Dias letivos (AAAA-MM-DD, em ordem, sem repetição) a partir dos parâmetros do calendário. */
export function gerarDiasLetivos(p: ParametrosCalendario): DataISO[] {
  const fora = new Set(p.feriados);
  const emRecesso = (d: DataISO) => p.recessos.some((r) => d >= r.inicio && d <= r.fim);
  const dias = new Set<DataISO>();
  for (let d = p.inicio; d <= p.fim; d = adicionarDias(d, 1)) {
    const semana = diaDaSemana(d);
    if (semana !== 0 && semana !== 6 && !fora.has(d) && !emRecesso(d)) dias.add(d);
  }
  for (const extra of p.letivosExtras) {
    if (extra >= p.inicio && extra <= p.fim) dias.add(extra);
  }
  return [...dias].sort();
}
