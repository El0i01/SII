import type { SituacaoFrequencia } from '@sii/shared';

/**
 * Estado offline simples da grade de frequência (P10, ADR 0009). Guarda no navegador a fila de
 * alterações ainda não enviadas e a última grade aberta de cada turma, para a escola continuar
 * lançando sem conexão. Por ter nome de aluno:
 * - a chave é por usuário, escola e turma;
 * - tudo expira em 24 h;
 * - ao entrar, `limparFrequenciaGuardada` apaga o que for de outro usuário (o do próprio usuário
 *   fica: a sessão pode ter vencido com alterações ainda por enviar).
 */

export type Situacao = SituacaoFrequencia | null;

export interface Alteracao {
  matriculaId: number;
  dia: string;
  situacao: Situacao;
}

export interface Grade {
  escola: { inep: string; nome: string };
  turma: { id: number; nome: string; ano: number };
  mes: string;
  hoje: string;
  dias: string[];
  alunos: { matriculaId: number; nome: string }[];
  lancamentos: { matriculaId: number; dia: string; situacao: SituacaoFrequencia }[];
}

export interface Guardado {
  salvoEm: number;
  fila: Alteracao[];
  /** Última grade aberta, por mês (AAAA-MM). */
  grades: Record<string, Grade>;
}

/** O que a página usa do `localStorage` (permite trocar nos testes). */
export type Armazem = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

export const PREFIXO = 'sii:frequencia:';
export const VALIDADE_MS = 24 * 3_600_000;

export const celula = (matriculaId: number, dia: string) => `${matriculaId}|${dia}`;

export function chaveGuardado(usuarioId: number, inep: string, turmaId: number): string {
  return `${PREFIXO}${usuarioId}:${inep}:${turmaId}`;
}

/** Lê o que está guardado; vencido ou ilegível é apagado e volta null. */
export function lerGuardado(a: Armazem, chave: string, agora = Date.now()): Guardado | null {
  let texto: string | null;
  try {
    texto = a.getItem(chave);
  } catch {
    return null;
  }
  if (!texto) return null;
  try {
    const g = JSON.parse(texto) as Guardado;
    if (typeof g.salvoEm !== 'number' || !Array.isArray(g.fila) || agora - g.salvoEm > VALIDADE_MS)
      throw new Error('vencido');
    return { salvoEm: g.salvoEm, fila: g.fila, grades: g.grades ?? {} };
  } catch {
    apagar(a, chave);
    return null;
  }
}

export function gravarGuardado(a: Armazem, chave: string, g: Guardado): void {
  try {
    if (g.fila.length === 0 && Object.keys(g.grades).length === 0) a.removeItem(chave);
    else a.setItem(chave, JSON.stringify(g));
  } catch {
    // Armazenamento cheio ou bloqueado: a tela continua, só perde o modo offline.
  }
}

function apagar(a: Armazem, chave: string) {
  try {
    a.removeItem(chave);
  } catch {
    // nada a fazer
  }
}

/** Apaga a frequência guardada neste navegador, menos a de `manterUsuario` (se informado). */
export function limparFrequenciaGuardada(a: Armazem, manterUsuario?: number): void {
  const chaves: string[] = [];
  const manter = manterUsuario === undefined ? null : `${PREFIXO}${manterUsuario}:`;
  try {
    for (let i = 0; i < a.length; i++) {
      const k = a.key(i);
      if (k?.startsWith(PREFIXO) && (manter === null || !k.startsWith(manter))) chaves.push(k);
    }
  } catch {
    return;
  }
  for (const k of chaves) apagar(a, k);
}

/** Põe a alteração na fila; a mesma célula alterada de novo substitui a anterior. */
export function enfileirar(fila: readonly Alteracao[], alt: Alteracao): Alteracao[] {
  const k = celula(alt.matriculaId, alt.dia);
  return [...fila.filter((f) => celula(f.matriculaId, f.dia) !== k), alt];
}

/**
 * Tira da fila o que foi enviado. Se a célula mudou de novo enquanto o envio estava no ar, a
 * alteração nova fica para o próximo envio.
 */
export function removerEnviados(
  fila: readonly Alteracao[],
  enviados: readonly Alteracao[],
): Alteracao[] {
  const feitos = new Map(enviados.map((e) => [celula(e.matriculaId, e.dia), e.situacao]));
  return fila.filter((f) => {
    const k = celula(f.matriculaId, f.dia);
    return !feitos.has(k) || feitos.get(k) !== f.situacao;
  });
}

/** Valores da grade: os lançamentos do servidor com a fila por cima. */
export function valoresDaGrade(
  lancamentos: Grade['lancamentos'],
  fila: readonly Alteracao[],
): Map<string, Situacao> {
  const m = new Map<string, Situacao>(
    lancamentos.map((l) => [celula(l.matriculaId, l.dia), l.situacao]),
  );
  for (const f of fila) m.set(celula(f.matriculaId, f.dia), f.situacao);
  return m;
}

const CICLO: Situacao[] = [null, 'PRESENTE', 'FALTA', 'JUSTIFICADA'];

/** Clique na célula: vazio → P → F → J → vazio. */
export function proximaSituacao(atual: Situacao): Situacao {
  return CICLO[(CICLO.indexOf(atual) + 1) % CICLO.length] as Situacao;
}

/** Tecla na célula → situação (undefined = a tecla não lança nada). */
export function situacaoDaTecla(tecla: string): Situacao | undefined {
  switch (tecla.toLowerCase()) {
    case 'p':
      return 'PRESENTE';
    case 'f':
      return 'FALTA';
    case 'j':
      return 'JUSTIFICADA';
    case 'delete':
    case 'backspace':
      return null;
    default:
      return undefined;
  }
}
