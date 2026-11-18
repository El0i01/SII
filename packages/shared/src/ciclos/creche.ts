import { coberturaCreche, deficitCreche, prioridadeNovaUnidade } from '../creche/cobertura';

/** Entrada do simulador de vagas de creche por território (P19). */
export interface SetorCrecheEntrada {
  setor: string;
  nome: string;
  /** Crianças por ano de nascimento (as 4 coortes de 0 a 3 anos). */
  coortes: Record<number, number>;
  vagas: number;
  fila: number;
  /** IVM médio das quadras do setor (0 a 1); sem quadras, 0. */
  ivmMedio: number;
}

export interface SimulacaoCreche {
  metaPct: number;
  setor: string | null;
  novasVagas: number;
}

export const TAMANHOS_UNIDADE = [0, 30, 60, 90] as const;

export interface LinhaCreche extends SetorCrecheEntrada {
  criancas: number;
  novas: number;
  demanda: number;
  deficit: number;
  coberturaAtual: number | null;
  coberturaSimulada: number | null;
  prioridade: number;
}

/** Linhas do simulador: cobertura atual e com a unidade simulada, déficit para a meta e prioridade. */
export function simularCreche(
  setores: readonly SetorCrecheEntrada[],
  s: SimulacaoCreche,
): LinhaCreche[] {
  return setores.map((e) => {
    const criancas = Object.values(e.coortes).reduce((a, n) => a + n, 0);
    const novas = s.setor === e.setor ? s.novasVagas : 0;
    const deficitSemNova = deficitCreche({ criancas, vagas: e.vagas, metaPct: s.metaPct });
    return {
      ...e,
      criancas,
      novas,
      demanda: Math.round((criancas * s.metaPct) / 100),
      deficit: deficitCreche({ criancas, vagas: e.vagas, novasVagas: novas, metaPct: s.metaPct }),
      coberturaAtual: coberturaCreche(criancas, e.vagas),
      coberturaSimulada: coberturaCreche(criancas, e.vagas + novas),
      prioridade: prioridadeNovaUnidade(deficitSemNova, e.ivmMedio),
    };
  });
}

/** Onde abrir primeiro: maior déficit (sem a simulação) ponderado pelo índice de vulnerabilidade. */
export function ondeAbrirPrimeiro(linhas: readonly LinhaCreche[]): LinhaCreche | null {
  return (
    [...linhas].filter((l) => l.prioridade > 0).sort((a, b) => b.prioridade - a.prioridade)[0] ??
    null
  );
}

export function totaisCreche(linhas: readonly LinhaCreche[]) {
  const soma = (k: 'criancas' | 'vagas' | 'novas' | 'fila' | 'deficit') =>
    linhas.reduce((a, l) => a + l[k], 0);
  const criancas = soma('criancas');
  const vagas = soma('vagas');
  const novas = soma('novas');
  return {
    criancas,
    vagas,
    novas,
    fila: soma('fila'),
    deficit: soma('deficit'),
    coberturaAtual: coberturaCreche(criancas, vagas),
    coberturaSimulada: coberturaCreche(criancas, vagas + novas),
  };
}

/** As 4 coortes de 0 a 3 anos no ano de referência (ex.: 2026 → 2023 a 2026). */
export const coortesCreche = (ano: number) => [ano - 3, ano - 2, ano - 1, ano];
