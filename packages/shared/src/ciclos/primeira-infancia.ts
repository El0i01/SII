import { pcfAtrasada } from '../mapa/camadas';

/** Criança de 0 a 6 anos já lida (P19, primeira infância). Sem dado de identificação. */
export interface CriancaPrimeiraInfancia {
  setor: string | null;
  idade: number;
  vacinacaoEmDia: boolean | null;
  matriculada: boolean;
  noCadunico: boolean;
  /** `null` = fora do Criança Feliz. */
  pcf: { diasSemVisita: number | null } | null;
}

export const METAS_PRIMEIRA_INFANCIA = { vacinacao: 85, creche: 40, preEscola: 100 } as const;

/** 0 a 3 anos no CadÚnico, fora da creche e fora do Criança Feliz (§3.9). */
export const semCuidado03 = (c: CriancaPrimeiraInfancia) =>
  c.idade <= 3 && c.noCadunico && !c.matriculada && c.pcf === null;

/** Critérios das contagens do painel (para `contarPor`). */
export const CRITERIOS_PRIMEIRA_INFANCIA = {
  criancas: (c: CriancaPrimeiraInfancia) => c.idade <= 6,
  vacinaInformada: (c: CriancaPrimeiraInfancia) => c.idade <= 6 && c.vacinacaoEmDia !== null,
  vacinadas: (c: CriancaPrimeiraInfancia) => c.idade <= 6 && c.vacinacaoEmDia === true,
  de0a3: (c: CriancaPrimeiraInfancia) => c.idade <= 3,
  creche: (c: CriancaPrimeiraInfancia) => c.idade <= 3 && c.matriculada,
  de4a5: (c: CriancaPrimeiraInfancia) => c.idade >= 4 && c.idade <= 5,
  preEscola: (c: CriancaPrimeiraInfancia) => c.idade >= 4 && c.idade <= 5 && c.matriculada,
  noCadunico: (c: CriancaPrimeiraInfancia) => c.idade <= 6 && c.noCadunico,
  pcf: (c: CriancaPrimeiraInfancia) => c.pcf !== null,
  pcfEmDia: (c: CriancaPrimeiraInfancia) => c.pcf !== null && !pcfAtrasada(c.pcf.diasSemVisita),
  semCuidado03,
} as const;
