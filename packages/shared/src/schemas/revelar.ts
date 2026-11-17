import { z } from 'zod';
import { ehDataISO } from '../calendario/dias';
import { somenteDigitos } from '../mascaras/documentos';
import { contemCid } from './entrada';

/**
 * Finalidade da revelação de um dado pessoal (§3.12, LGPD art. 6º, I). Fica gravada em
 * `auditoria.acesso_dado_pessoal` e aparece no painel do DPO. Sem finalidade, a API responde 422.
 */
export const FINALIDADES_REVELACAO = [
  'CONTATO_MATRICULA',
  'ENCAMINHAMENTO_REDE',
  'ATUALIZACAO_CADASTRAL',
  'ATENDIMENTO_TITULAR',
  'OUTRA',
] as const;
export const FinalidadeRevelacao = z.enum(FINALIDADES_REVELACAO, {
  error: 'Escolha a finalidade.',
});
export type FinalidadeRevelacao = z.infer<typeof FinalidadeRevelacao>;
export const ROTULO_FINALIDADE: Record<FinalidadeRevelacao, string> = {
  CONTATO_MATRICULA: 'Contato com a família para matrícula',
  ENCAMINHAMENTO_REDE: 'Encaminhamento à rede de proteção',
  ATUALIZACAO_CADASTRAL: 'Atualização cadastral',
  ATENDIMENTO_TITULAR: 'Atendimento ao titular ou responsável',
  OUTRA: 'Outra',
};

export const RevelarCpf = z
  .object({
    finalidade: FinalidadeRevelacao,
    detalhe: z
      .string()
      .trim()
      .max(250, 'Use no máximo 250 caracteres.')
      .refine((t) => !contemCid(t), 'Não registre diagnóstico nem código CID.')
      .optional(),
  })
  .superRefine((d, ctx) => {
    if (d.finalidade === 'OUTRA' && (d.detalhe ?? '').length < 10) {
      ctx.addIssue({
        code: 'custom',
        path: ['detalhe'],
        message: 'Descreva a finalidade (10 caracteres ou mais).',
      });
    }
  });
export type RevelarCpf = z.infer<typeof RevelarCpf>;

/** Texto gravado no registro de acesso (até 300 caracteres). */
export function textoFinalidade(r: RevelarCpf): string {
  const base = ROTULO_FINALIDADE[r.finalidade];
  if (r.finalidade === 'OUTRA') return `${base}: ${r.detalhe}`;
  return r.detalhe ? `${base}: ${r.detalhe}` : base;
}

/** CPF formatado `000.000.000-00` (só para a resposta da revelação). */
export function formatarCpf(cpf: string): string {
  const d = somenteDigitos(cpf);
  if (d.length !== 11) return d;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

const dataOpcional = z.string().refine(ehDataISO, 'Data inválida (use AAAA-MM-DD).').optional();

/** Filtros do painel do DPO (acessos a dado pessoal). */
export const FiltroAcessos = z
  .object({
    de: dataOpcional,
    ate: dataOpcional,
    usuario: z.string().trim().toLowerCase().max(60).optional(),
    registro: z.string().trim().max(30).optional(),
    pagina: z.coerce.number().int().min(1).default(1),
  })
  .refine((f) => !f.de || !f.ate || f.de <= f.ate, {
    path: ['ate'],
    message: 'A data final precisa ser igual ou depois da inicial.',
  });
export type FiltroAcessos = z.infer<typeof FiltroAcessos>;
