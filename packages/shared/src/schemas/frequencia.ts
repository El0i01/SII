import { z } from 'zod';
import { ehDataISO } from '../calendario/dias';
import { SITUACOES_FREQUENCIA } from '../educacao/frequencia';

/** Máximo de lançamentos por envio da grade (uma turma de 40 alunos × 23 dias cabe com folga). */
export const MAXIMO_LANCAMENTOS = 2000;

export const LancamentoFrequencia = z.object({
  matriculaId: z.number().int().positive(),
  dia: z.string().refine(ehDataISO, 'Data inválida (use AAAA-MM-DD).'),
  /** `null` apaga o lançamento (o dia volta a ficar sem registro). */
  situacao: z.enum(SITUACOES_FREQUENCIA).nullable(),
});
export type LancamentoFrequencia = z.infer<typeof LancamentoFrequencia>;

/** Envio da grade de frequência da turma (P10): web, mobile e API usam o mesmo schema. */
export const LancamentosFrequencia = z.object({
  lancamentos: z
    .array(LancamentoFrequencia)
    .min(1, 'Nada para salvar.')
    .max(MAXIMO_LANCAMENTOS, `Envie no máximo ${MAXIMO_LANCAMENTOS} lançamentos por vez.`),
});
export type LancamentosFrequencia = z.infer<typeof LancamentosFrequencia>;

/** Mês da grade (AAAA-MM). */
export const MesFrequencia = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mês inválido (use AAAA-MM).');
