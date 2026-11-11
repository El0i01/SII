/** Meta padrão de cobertura de creche (0 a 3 anos), em %: PNE. */
export const META_COBERTURA_PADRAO = 50;

function naoNegativo(nome: string, v: number): void {
  if (!(v >= 0)) throw new RangeError(`${nome} não pode ser negativo`);
}

/** Cobertura em %: vagas / crianças de 0 a 3 × 100. Sem crianças, `null`. */
export function coberturaCreche(criancas: number, vagas: number): number | null {
  naoNegativo('criancas', criancas);
  naoNegativo('vagas', vagas);
  return criancas === 0 ? null : (vagas / criancas) * 100;
}

/** Vagas que faltam para a meta, depois de contar as vagas novas simuladas. Nunca negativo. */
export function deficitCreche(p: {
  criancas: number;
  vagas: number;
  novasVagas?: number;
  metaPct?: number;
}): number {
  const novas = p.novasVagas ?? 0;
  const meta = p.metaPct ?? META_COBERTURA_PADRAO;
  naoNegativo('criancas', p.criancas);
  naoNegativo('vagas', p.vagas);
  naoNegativo('novasVagas', novas);
  if (!(meta >= 0 && meta <= 100)) throw new RangeError('metaPct fora de 0..100');
  return Math.max(0, Math.round((p.criancas * meta) / 100) - p.vagas - novas);
}

/** Prioridade para abrir uma unidade: déficit × (1 + índice médio do setor). */
export function prioridadeNovaUnidade(deficit: number, ivmMedio: number): number {
  naoNegativo('deficit', deficit);
  if (!(ivmMedio >= 0 && ivmMedio <= 1)) throw new RangeError('ivmMedio fora de 0..1');
  return deficit * (1 + ivmMedio);
}

export interface SetorCreche {
  setor: string;
  criancas: number;
  vagas: number;
  ivmMedio: number;
}

/** Ranking de onde abrir creche primeiro (maior prioridade primeiro). */
export function ordenarPrioridadeCreche(
  setores: readonly SetorCreche[],
  metaPct: number = META_COBERTURA_PADRAO,
) {
  return setores
    .map((s) => {
      const deficit = deficitCreche({ criancas: s.criancas, vagas: s.vagas, metaPct });
      return {
        ...s,
        cobertura: coberturaCreche(s.criancas, s.vagas),
        deficit,
        prioridade: prioridadeNovaUnidade(deficit, s.ivmMedio),
      };
    })
    .sort((a, b) => b.prioridade - a.prioridade);
}
