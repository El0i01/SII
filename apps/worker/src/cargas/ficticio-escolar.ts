import { cpfValido, NOMES_F, NOMES_M, rng, SOBRENOMES } from './ficticio';

/**
 * CSV fictício da gestão escolar no layout próprio do SII (P10): uma linha por aluno × dia, UTF-8,
 * `;`. Nomes inventados, CPF gerado ao acaso com dígito válido. Nunca dado real.
 */
export const CABECALHO_GESTAO_ESCOLAR = [
  'inep_escola',
  'turma',
  'codigo_aluno',
  'nome_aluno',
  'data_nascimento',
  'nome_mae',
  'cpf_aluno',
  'sexo',
  'data_frequencia',
  'situacao_frequencia',
] as const;

export interface OpcoesGestaoEscolar {
  inep: string;
  /** Dias (AAAA-MM-DD) lançados para cada aluno. */
  dias: string[];
  alunos: number;
  turmas?: string[];
  semente?: number;
  /** Prefixo do código do aluno (isola os testes). */
  prefixo?: string;
  colunas?: readonly string[];
}

export function gerarGestaoEscolarFicticia(o: OpcoesGestaoEscolar): {
  bytes: Buffer;
  linhas: number;
  /** Código do aluno → situação por dia, para os testes conferirem. */
  esperado: Map<string, Map<string, 'P' | 'F' | 'J'>>;
} {
  const r = rng(o.semente ?? 20261117);
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)] as T;
  const turmas = o.turmas ?? ['1º ano A', '2º ano A'];
  const colunas = o.colunas ?? CABECALHO_GESTAO_ESCOLAR;
  const linhas: string[] = [colunas.join(';')];
  const esperado = new Map<string, Map<string, 'P' | 'F' | 'J'>>();
  const br = (iso: string) => iso.split('-').reverse().join('/');
  for (let i = 0; i < o.alunos; i++) {
    const feminino = r() < 0.5;
    const nome = `${pick(feminino ? NOMES_F : NOMES_M)} ${pick(SOBRENOMES)} ${pick(SOBRENOMES)}`;
    const mae = `${pick(NOMES_F)} ${pick(SOBRENOMES)}`;
    const nasc = `${2014 + Math.floor(r() * 6)}-0${1 + Math.floor(r() * 9)}-1${Math.floor(r() * 9)}`;
    const codigo = `${o.prefixo ?? 'GE'}${String(i + 1).padStart(5, '0')}`;
    const turma = turmas[i % turmas.length] as string;
    const cpf = r() < 0.5 ? cpfValido(r) : '';
    const dias = new Map<string, 'P' | 'F' | 'J'>();
    for (const d of o.dias) {
      const s = r() < 0.8 ? 'P' : r() < 0.8 ? 'F' : 'J';
      dias.set(d, s);
      const valores: Record<string, string> = {
        inep_escola: o.inep,
        turma,
        codigo_aluno: codigo,
        nome_aluno: nome,
        data_nascimento: br(nasc),
        nome_mae: mae,
        cpf_aluno: cpf,
        sexo: feminino ? 'F' : 'M',
        data_frequencia: br(d),
        situacao_frequencia: s,
      };
      linhas.push(colunas.map((c) => valores[c] ?? '').join(';'));
    }
    esperado.set(codigo, dias);
  }
  return {
    bytes: Buffer.from(`${linhas.join('\n')}\n`, 'utf8'),
    linhas: linhas.length - 1,
    esperado,
  };
}
