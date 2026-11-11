/**
 * Identidade única (§3.3, P07): pontua se dois registros são a mesma pessoa e decide a ligação.
 * Regras em ordem: CPF (1,00) → CNS ou NIS (0,95) → nome + nascimento + mãe com similaridade
 * ≥ 0,92 (0,85) → abaixo disso, revisão manual. Nunca liga sozinho abaixo de 0,85.
 */
import { adicionarDias, type DataISO } from '../calendario/dias';

export const LIMITES_LIGACAO = {
  /** A partir daqui (com nascimento igual e mãe conhecida), liga por nome sozinho. */
  automatica: 0.92,
  /** Entre este valor e o automático, o par vai para a revisão manual. */
  revisao: 0.75,
  /** Confiança gravada para cada regra. */
  confiancaCpf: 1,
  confiancaCnsNis: 0.95,
  confiancaNome: 0.85,
  /** Nascimento diferente (provável erro de digitação): até tantos dias, e a pontuação cai 10%. */
  diasErroNascimento: 31,
  fatorErroNascimento: 0.9,
  /** Sem a mãe de um dos lados, a pontuação nunca passa disto (não liga sozinho). */
  tetoSemMae: 0.91,
} as const;

const PARTICULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

export function normalizarNomePessoa(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !PARTICULAS.has(t))
    .join(' ');
}

/** Jaro-Winkler clássico (prefixo até 4, fator 0,1). */
export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const janela = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const casouA = new Array<boolean>(a.length).fill(false);
  const casouB = new Array<boolean>(b.length).fill(false);
  let m = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = Math.max(0, i - janela); j < Math.min(b.length, i + janela + 1); j++) {
      if (!casouB[j] && a[i] === b[j]) {
        casouA[i] = true;
        casouB[j] = true;
        m++;
        break;
      }
    }
  }
  if (m === 0) return 0;
  let k = 0;
  let trocas = 0;
  for (let i = 0; i < a.length; i++) {
    if (!casouA[i]) continue;
    while (!casouB[k]) k++;
    if (a[i] !== b[k]) trocas++;
    k++;
  }
  const jaro = (m / a.length + m / b.length + (m - trocas / 2) / m) / 3;
  let prefixo = 0;
  while (prefixo < 4 && a[prefixo] === b[prefixo]) prefixo++;
  return jaro + prefixo * 0.1 * (1 - jaro);
}

/** Troca a inicial de um lado pela palavra do outro lado na mesma posição ("S." → "Silva"). */
function expandirIniciais(a: string[], b: string[]): [string[], string[]] {
  const ea = [...a];
  const eb = [...b];
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const x = ea[i] as string;
    const y = eb[i] as string;
    if (x.length === 1 && y.startsWith(x)) ea[i] = y;
    else if (y.length === 1 && x.startsWith(y)) eb[i] = x;
  }
  return [ea, eb];
}

/** Similaridade de 0 a 1 entre dois nomes, depois de normalizar e expandir as iniciais. */
export function similaridadeNomes(a: string, b: string): number {
  const [ta, tb] = expandirIniciais(
    normalizarNomePessoa(a).split(' '),
    normalizarNomePessoa(b).split(' '),
  );
  return jaroWinkler(ta.join(' '), tb.join(' '));
}

function similaridadePrimeiroNome(a: string, b: string): number {
  const [ta, tb] = expandirIniciais(
    normalizarNomePessoa(a).split(' ').slice(0, 1),
    normalizarNomePessoa(b).split(' ').slice(0, 1),
  );
  return jaroWinkler(ta[0] ?? '', tb[0] ?? '');
}

export interface DadosIdentidade {
  cpf: string | null;
  cns: string | null;
  nis: string | null;
  nome: string;
  nascimento: DataISO | null;
  mae: string | null;
}

export interface Avaliacao {
  tipo: 'CPF' | 'CNS_NIS' | 'NOME' | 'DESCARTADO';
  pontuacao: number;
  nascimentoIgual: boolean;
  maeConhecida: boolean;
}

const digitos = (v: string | null) => (v ? v.replace(/\D/g, '') : '');
const DESCARTADO: Avaliacao = {
  tipo: 'DESCARTADO',
  pontuacao: 0,
  nascimentoIgual: false,
  maeConhecida: false,
};

/** Nascimentos diferentes que parecem erro de digitação: até 31 dias ou dia e mês trocados. */
function parecemErroDeDigitacao(a: DataISO, b: DataISO): boolean {
  const [ano, mes, dia] = a.split('-');
  if (`${ano}-${dia}-${mes}` === b) return true;
  return (
    b >= adicionarDias(a, -LIMITES_LIGACAO.diasErroNascimento) &&
    b <= adicionarDias(a, LIMITES_LIGACAO.diasErroNascimento)
  );
}

/** Quanto o candidato parece ser a pessoa do registro. */
export function pontuarCandidato(registro: DadosIdentidade, candidato: DadosIdentidade): Avaliacao {
  const cpfR = digitos(registro.cpf);
  const cpfC = digitos(candidato.cpf);
  if (cpfR && cpfC) {
    // Dois CPFs: ou é a mesma pessoa, ou com certeza não é (gêmeos, homônimos com documento).
    return cpfR === cpfC
      ? { tipo: 'CPF', pontuacao: 1, nascimentoIgual: true, maeConhecida: true }
      : DESCARTADO;
  }
  for (const doc of ['cns', 'nis'] as const) {
    const r = digitos(registro[doc]);
    if (r && r === digitos(candidato[doc])) {
      return {
        tipo: 'CNS_NIS',
        pontuacao: LIMITES_LIGACAO.confiancaCnsNis,
        nascimentoIgual: true,
        maeConhecida: true,
      };
    }
  }

  let fator = 1;
  const nascimentoIgual = !!registro.nascimento && registro.nascimento === candidato.nascimento;
  if (!nascimentoIgual) {
    if (!registro.nascimento || !candidato.nascimento) fator = LIMITES_LIGACAO.fatorErroNascimento;
    else if (parecemErroDeDigitacao(registro.nascimento, candidato.nascimento))
      fator = LIMITES_LIGACAO.fatorErroNascimento;
    else return DESCARTADO;
  }

  const maeConhecida = !!registro.mae && !!candidato.mae;
  const sims = [
    similaridadeNomes(registro.nome, candidato.nome),
    similaridadePrimeiroNome(registro.nome, candidato.nome),
  ];
  if (maeConhecida) sims.push(similaridadeNomes(registro.mae as string, candidato.mae as string));
  let pontuacao = Math.min(...sims) * fator;
  if (!maeConhecida) pontuacao = Math.min(pontuacao, LIMITES_LIGACAO.tetoSemMae);
  return {
    tipo: 'NOME',
    pontuacao: Math.round(pontuacao * 1000) / 1000,
    nascimentoIgual,
    maeConhecida,
  };
}

export type DecisaoLigacao =
  | {
      acao: 'LIGAR';
      regra: 'CPF' | 'CNS_NIS' | 'NOME_NASCIMENTO_MAE';
      confianca: number;
      indice: number;
    }
  | { acao: 'REVISAR'; candidatos: { indice: number; pontuacao: number }[] }
  | { acao: 'NOVA' };

/** Decide a ligação a partir das avaliações dos candidatos (na ordem em que foram buscados). */
export function decidirLigacao(avaliacoes: readonly Avaliacao[]): DecisaoLigacao {
  const cpf = avaliacoes.findIndex((a) => a.tipo === 'CPF');
  if (cpf >= 0)
    return { acao: 'LIGAR', regra: 'CPF', confianca: LIMITES_LIGACAO.confiancaCpf, indice: cpf };
  const doc = avaliacoes.findIndex((a) => a.tipo === 'CNS_NIS');
  if (doc >= 0)
    return {
      acao: 'LIGAR',
      regra: 'CNS_NIS',
      confianca: LIMITES_LIGACAO.confiancaCnsNis,
      indice: doc,
    };

  const porNome = avaliacoes
    .map((a, indice) => ({ a, indice }))
    .filter(({ a }) => a.tipo === 'NOME' && a.pontuacao >= LIMITES_LIGACAO.revisao);
  const fortes = porNome.filter(
    ({ a }) => a.pontuacao >= LIMITES_LIGACAO.automatica && a.nascimentoIgual && a.maeConhecida,
  );
  if (fortes.length === 1) {
    return {
      acao: 'LIGAR',
      regra: 'NOME_NASCIMENTO_MAE',
      confianca: LIMITES_LIGACAO.confiancaNome,
      indice: (fortes[0] as { indice: number }).indice,
    };
  }
  if (porNome.length > 0) {
    return {
      acao: 'REVISAR',
      candidatos: porNome.map(({ a, indice }) => ({ indice, pontuacao: a.pontuacao })),
    };
  }
  return { acao: 'NOVA' };
}
