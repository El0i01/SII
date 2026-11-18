/** Criança ou adolescente com necessidade de atendimento especializado (P19). Sem diagnóstico. */
export interface CriancaInclusiva {
  setor: string | null;
  idade: number;
  salaRecursos: boolean;
  apae: boolean;
  bpc: boolean;
  matriculada: boolean;
  pcf: boolean;
}

export type SituacaoAee = 'SALA_RECURSOS' | 'APAE' | 'SEM_ATENDIMENTO';

export function situacaoAee(c: Pick<CriancaInclusiva, 'salaRecursos' | 'apae'>): SituacaoAee {
  return c.salaRecursos ? 'SALA_RECURSOS' : c.apae ? 'APAE' : 'SEM_ATENDIMENTO';
}

export const ROTULO_SITUACAO_AEE: Record<SituacaoAee, string> = {
  SALA_RECURSOS: 'Sala de recursos',
  APAE: 'APAE',
  SEM_ATENDIMENTO: 'Sem atendimento',
};

export const CRITERIOS_INCLUSIVA = {
  identificadas: () => true,
  salaRecursos: (c: CriancaInclusiva) => c.salaRecursos,
  apae: (c: CriancaInclusiva) => c.apae,
  bpc: (c: CriancaInclusiva) => c.bpc,
  semAtendimento: (c: CriancaInclusiva) => situacaoAee(c) === 'SEM_ATENDIMENTO',
  de0a3: (c: CriancaInclusiva) => c.idade <= 3,
  de0a3NoPcf: (c: CriancaInclusiva) => c.idade <= 3 && c.pcf,
  foraDaEscola: (c: CriancaInclusiva) => c.idade >= 4 && !c.matriculada,
} as const;
