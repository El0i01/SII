import { z } from 'zod';

/** Dimensões do índice de vulnerabilidade municipal (§3.10). */
export const DIMENSOES_IVM = [
  { codigo: 'renda', rotulo: 'Renda', fonte: 'CadÚnico' },
  { codigo: 'saude', rotulo: 'Saúde', fonte: 'e-SUS' },
  { codigo: 'escola', rotulo: 'Escola', fonte: 'Educação' },
  { codigo: 'imovel', rotulo: 'Condição do imóvel', fonte: 'Censo' },
  { codigo: 'regularizacao', rotulo: 'Regularização', fonte: 'Fazenda/Reurb' },
] as const;

export type DimensaoIvm = (typeof DIMENSOES_IVM)[number]['codigo'];
export type ValoresIvm = Record<DimensaoIvm, number>;

/** Pesos propostos; os vigentes são aprovados pelo Comitê e versionados (PesosIvm no banco). */
export const PESOS_IVM_PADRAO: ValoresIvm = {
  renda: 30,
  saude: 20,
  escola: 20,
  imovel: 15,
  regularizacao: 15,
};

const peso = z.number().min(0, 'O peso não pode ser negativo.').max(100, 'O peso vai até 100.');

export const PesosIvm = z
  .object({ renda: peso, saude: peso, escola: peso, imovel: peso, regularizacao: peso })
  .refine((p) => Object.values(p).reduce((a, b) => a + b, 0) > 0, {
    message: 'Pelo menos uma dimensão precisa ter peso.',
  });

/** IVM da quadra, de 0 a 1: Σ(dimensão × peso) / Σ(peso). Dimensões já normalizadas de 0 a 1. */
export function calcularIvm(dimensoes: ValoresIvm, pesos: ValoresIvm = PESOS_IVM_PADRAO): number {
  let soma = 0;
  let total = 0;
  for (const { codigo } of DIMENSOES_IVM) {
    const v = dimensoes[codigo];
    const w = pesos[codigo];
    if (!(v >= 0 && v <= 1)) throw new RangeError(`Dimensão ${codigo} fora de 0..1`);
    if (!(w >= 0)) throw new RangeError(`Peso de ${codigo} inválido`);
    soma += v * w;
    total += w;
  }
  if (total === 0) throw new RangeError('A soma dos pesos precisa ser maior que zero');
  return soma / total;
}

export type CodigoFaixaIvm = 'BAIXA' | 'MODERADA' | 'ALTA' | 'MUITO_ALTA';

export interface FaixaIvm {
  codigo: CodigoFaixaIvm;
  rotulo: string;
  tom: 'ok' | 'info' | 'alerta' | 'critico';
}

/** Faixas da especificação: baixa < 0,35 ≤ moderada < 0,50 ≤ alta < 0,65 ≤ muito alta. */
export function faixaIvm(valor: number): FaixaIvm {
  if (!(valor >= 0 && valor <= 1)) throw new RangeError('IVM fora de 0..1');
  if (valor >= 0.65) return { codigo: 'MUITO_ALTA', rotulo: 'Muito alta', tom: 'critico' };
  if (valor >= 0.5) return { codigo: 'ALTA', rotulo: 'Alta', tom: 'alerta' };
  if (valor >= 0.35) return { codigo: 'MODERADA', rotulo: 'Moderada', tom: 'info' };
  return { codigo: 'BAIXA', rotulo: 'Baixa', tom: 'ok' };
}
