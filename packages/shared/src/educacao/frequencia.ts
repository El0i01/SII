import type { DataISO } from '../calendario/dias';

export const SITUACOES_FREQUENCIA = ['PRESENTE', 'FALTA', 'JUSTIFICADA'] as const;
export type SituacaoFrequencia = (typeof SITUACOES_FREQUENCIA)[number];

export interface RegistroFrequencia {
  data: DataISO;
  situacao: SituacaoFrequencia;
}

/** Gatilho da notificação ao CRAS (§4.1). */
export const LIMITE_FALTAS_SEGUIDAS = 5;

/**
 * Faltas seguidas até a data de referência, contadas pelo **calendário escolar** (§4.1).
 *
 * - Só os dias letivos da escola contam: feriado, recesso e fim de semana não estão no calendário,
 *   então não somam nem quebram a sequência.
 * - Segue o **lançamento**: só `FALTA` lançada soma. `PRESENTE`, `JUSTIFICADA` ou dia letivo **sem
 *   lançamento** encerram a contagem (decisão de 11/11/2026: sem registro não se afirma falta).
 * - Frequência lançada em dia que não é letivo é ignorada.
 *
 * @param referencia dia até o qual contar; padrão, o último dia letivo do calendário.
 */
export function contarFaltasSeguidas(
  frequencias: readonly RegistroFrequencia[],
  diasLetivos: readonly DataISO[],
  referencia?: DataISO,
): number {
  const porDia = new Map(frequencias.map((f) => [f.data, f.situacao]));
  const letivos = [...new Set(diasLetivos)]
    .filter((d) => referencia === undefined || d <= referencia)
    .sort()
    .reverse();

  let faltas = 0;
  for (const dia of letivos) {
    if (porDia.get(dia) !== 'FALTA') break;
    faltas += 1;
  }
  return faltas;
}

export function deveNotificarInfrequencia(
  frequencias: readonly RegistroFrequencia[],
  diasLetivos: readonly DataISO[],
  referencia?: DataISO,
): boolean {
  return contarFaltasSeguidas(frequencias, diasLetivos, referencia) >= LIMITE_FALTAS_SEGUIDAS;
}
