/**
 * EJA (P19): escolaridade vinda do CadÚnico. Códigos do grau de instrução do CECAD (a confirmar com
 * o dicionário oficial do MDS): 1 sem instrução, 2 fundamental incompleto, 3 fundamental completo,
 * 4 médio incompleto, 5 médio completo, 6 superior (incompleto ou mais).
 */
export const GRAUS_INSTRUCAO = [
  'SEM_INSTRUCAO',
  'FUNDAMENTAL_INCOMPLETO',
  'FUNDAMENTAL_COMPLETO',
  'MEDIO_INCOMPLETO',
  'MEDIO_COMPLETO',
  'SUPERIOR',
] as const;
export type GrauInstrucao = (typeof GRAUS_INSTRUCAO)[number];

export function lerGrauInstrucao(codigo: string | undefined | null): GrauInstrucao | null {
  const n = Number((codigo ?? '').trim());
  return Number.isInteger(n) && n >= 1 && n <= 6 ? (GRAUS_INSTRUCAO[n - 1] as GrauInstrucao) : null;
}

/** `cod_sabe_ler_escrever_memb`: 1 sim, 2 não. */
export function lerSabeLer(codigo: string | undefined | null): boolean | null {
  const v = (codigo ?? '').trim().toUpperCase();
  if (v === '1' || v === 'S' || v === 'SIM') return true;
  if (v === '2' || v === 'N' || v === 'NAO' || v === 'NÃO') return false;
  return null;
}

export const ehTurmaEja = (nome: string | null | undefined) =>
  !!nome && /\bEJA\b|jovens e adultos/i.test(nome);

/** Meta de cobertura do público potencial pela EJA (protótipo). */
export const META_COBERTURA_EJA = 25;

export interface PessoaEja {
  setor: string | null;
  idade: number;
  grau: GrauInstrucao | null;
  sabeLer: boolean | null;
  /** Matrícula ativa em turma regular (não EJA). */
  matriculaRegular: boolean;
  matriculaEja: boolean;
  /** Frequência na EJA no mês (0 a 100), quando matriculada e com lançamento. */
  frequenciaEja: number | null;
  responsavelFamiliar: boolean;
  /** Tem filho ou neto com matrícula ativa na rede. */
  paiDeAluno: boolean;
  noScfv: boolean;
}

/** 15 anos ou mais sem o fundamental completo e fora da escola regular. */
export const publicoPotencialEja = (p: PessoaEja) =>
  p.idade >= 15 &&
  (p.grau === 'SEM_INSTRUCAO' || p.grau === 'FUNDAMENTAL_INCOMPLETO') &&
  !p.matriculaRegular;

export const CRITERIOS_EJA = {
  potencial: (p: PessoaEja) => publicoPotencialEja(p) || p.matriculaEja,
  semAlfabetizacao: (p: PessoaEja) => p.idade >= 15 && p.sabeLer === false,
  matriculados: (p: PessoaEja) => p.matriculaEja,
  conviteResponsavel: (p: PessoaEja) =>
    publicoPotencialEja(p) && !p.matriculaEja && p.responsavelFamiliar,
  convitePais: (p: PessoaEja) => publicoPotencialEja(p) && !p.matriculaEja && p.paiDeAluno,
  conviteJovens: (p: PessoaEja) =>
    p.idade >= 15 && p.idade <= 17 && publicoPotencialEja(p) && !p.matriculaEja,
  conviteIdososScfv: (p: PessoaEja) => p.idade >= 60 && p.sabeLer === false && p.noScfv,
} as const;

/** Frequência média ponderada da EJA (só quem tem lançamento). */
export function frequenciaMediaEja(pessoas: readonly PessoaEja[]): number | null {
  const f = pessoas.filter((p) => p.matriculaEja && p.frequenciaEja !== null);
  if (f.length === 0) return null;
  return Math.round((f.reduce((a, p) => a + (p.frequenciaEja as number), 0) / f.length) * 10) / 10;
}
