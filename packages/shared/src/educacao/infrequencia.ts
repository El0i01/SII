import type { DataISO } from '../calendario/dias';
import { LIMITE_FALTAS_SEGUIDAS } from './frequencia';

/**
 * Decisão do job diário de infrequência (§4.1, P10), sobre o resultado de `contarFaltasSeguidas`.
 *
 * - Um caso **aberto** por aluno: novas faltas só atualizam o motivo da notificação.
 * - Caso encerrado não conta: se o aluno ainda tem 5 ou mais faltas seguidas, abre caso novo na
 *   próxima execução (decisão de 17/11/2026).
 */
export type AcaoInfrequencia = 'CRIAR' | 'ATUALIZAR' | 'NADA';

export interface SituacaoInfrequencia {
  faltasSeguidas: number;
  /** Caso de infrequência ainda aberto do aluno, com o número de faltas que está no motivo. */
  casoAberto: { faltasNoMotivo: number | null } | null;
}

export function decidirInfrequencia(s: SituacaoInfrequencia): AcaoInfrequencia {
  if (s.faltasSeguidas < LIMITE_FALTAS_SEGUIDAS) return 'NADA';
  if (!s.casoAberto) return 'CRIAR';
  return s.casoAberto.faltasNoMotivo === s.faltasSeguidas ? 'NADA' : 'ATUALIZAR';
}

/** Texto do motivo da notificação (sem dado pessoal). */
export function motivoInfrequencia(faltasSeguidas: number): string {
  return `${faltasSeguidas} dias letivos seguidos sem frequência`;
}

/** Número de faltas gravado no motivo, ou null se o texto não for o do job. */
export function faltasDoMotivo(motivo: string): number | null {
  const m = /^(\d+) dias letivos seguidos sem frequência$/.exec(motivo);
  return m ? Number(m[1]) : null;
}

/**
 * Dia até o qual o job conta: o último dia letivo da escola **antes** de hoje. O dia corrente fica
 * de fora porque a escola pode ainda não ter lançado a frequência (dia sem lançamento quebra a
 * sequência).
 */
export function referenciaInfrequencia(
  diasLetivos: readonly DataISO[],
  hoje: DataISO,
): DataISO | null {
  let ref: DataISO | null = null;
  for (const d of diasLetivos) if (d < hoje && (ref === null || d > ref)) ref = d;
  return ref;
}
