'use client';

import { type KeyboardEvent, useRef, useState } from 'react';
import {
  celula,
  type Grade,
  proximaSituacao,
  type Situacao,
  situacaoDaTecla,
} from '@/lib/fila-frequencia';

const LETRA: Record<NonNullable<Situacao>, string> = {
  PRESENTE: 'P',
  FALTA: 'F',
  JUSTIFICADA: 'J',
};
const ROTULO: Record<NonNullable<Situacao>, string> = {
  PRESENTE: 'presente',
  FALTA: 'falta',
  JUSTIFICADA: 'falta justificada',
};
const COR: Record<NonNullable<Situacao>, string> = {
  PRESENTE: 'bg-sucesso-claro text-texto-forte',
  FALTA: 'bg-erro-claro text-erro font-bold',
  JUSTIFICADA: 'bg-alerta-claro text-texto-forte',
};

interface Props {
  grade: Grade;
  valores: Map<string, Situacao>;
  /** Células alteradas que ainda não foram salvas no servidor. */
  pendentes: Set<string>;
  /** Somente leitura (perfil que só consulta). */
  leitura?: boolean;
  onAlterar: (matriculaId: number, dia: string, situacao: Situacao) => void;
}

const diaCurto = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const diaSemana = (d: string) => SEMANA[new Date(`${d}T12:00:00Z`).getUTCDay()];

/**
 * Grade aluno × dia letivo. Uma célula focável por vez (setas movem); P, F e J lançam, Delete
 * apaga, Enter ou espaço (e o clique) alternam. Cor sempre acompanhada da letra.
 */
export function GradeFrequencia({ grade, valores, pendentes, leitura, onAlterar }: Props) {
  const [foco, setFoco] = useState<[number, number]>([0, 0]);
  const tabela = useRef<HTMLTableElement>(null);
  const editavel = (dia: string) => !leitura && dia <= grade.hoje;

  function focar(l: number, c: number) {
    const linha = Math.max(0, Math.min(grade.alunos.length - 1, l));
    const coluna = Math.max(0, Math.min(grade.dias.length - 1, c));
    setFoco([linha, coluna]);
    tabela.current?.querySelector<HTMLButtonElement>(`[data-celula="${linha}-${coluna}"]`)?.focus();
  }

  function tecla(ev: KeyboardEvent<HTMLButtonElement>, l: number, c: number) {
    const mover: Record<string, [number, number]> = {
      ArrowUp: [l - 1, c],
      ArrowDown: [l + 1, c],
      ArrowLeft: [l, c - 1],
      ArrowRight: [l, c + 1],
      Home: [l, 0],
      End: [l, grade.dias.length - 1],
    };
    const destino = mover[ev.key];
    if (destino) {
      ev.preventDefault();
      focar(...destino);
      return;
    }
    const aluno = grade.alunos[l];
    const dia = grade.dias[c];
    if (!aluno || !dia || !editavel(dia)) return;
    const s = situacaoDaTecla(ev.key);
    if (s !== undefined) {
      ev.preventDefault();
      onAlterar(aluno.matriculaId, dia, s);
      // Lançar e descer para o próximo aluno: é como a chamada é feita.
      if (s !== null) focar(l + 1, c);
    }
  }

  return (
    <div className="relative max-h-[70vh] overflow-auto rounded-md border border-borda-suave">
      <table ref={tabela} className="border-separate border-spacing-0 text-sm">
        <caption className="sr-only">
          Frequência da turma {grade.turma.nome} em {grade.mes}. Use as setas para andar, P para
          presente, F para falta, J para falta justificada e Delete para apagar.
        </caption>
        <thead>
          <tr>
            <th
              scope="col"
              className="sticky left-0 top-0 z-20 min-w-48 border-b border-borda bg-superficie px-3 py-2 text-left"
            >
              Aluno
            </th>
            {grade.dias.map((d) => (
              <th
                key={d}
                scope="col"
                className="sticky top-0 z-10 border-b border-borda bg-superficie px-1 py-2 text-center font-semibold"
              >
                <span className="block">{diaCurto(d)}</span>
                <span className="block text-xs font-normal text-texto-suave">{diaSemana(d)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grade.alunos.map((a, l) => (
            <tr key={a.matriculaId}>
              <th
                scope="row"
                className="sticky left-0 z-10 border-b border-borda-suave bg-fundo px-3 py-1 text-left font-normal text-texto-forte"
              >
                {a.nome}
              </th>
              {grade.dias.map((d, c) => {
                const k = celula(a.matriculaId, d);
                const v = valores.get(k) ?? null;
                const pendente = pendentes.has(k);
                const pode = editavel(d);
                const descricao = `${a.nome}, ${diaCurto(d)}: ${v ? ROTULO[v] : 'sem lançamento'}${
                  pendente ? ', ainda não salvo' : ''
                }${pode ? '' : leitura ? '' : ', dia futuro'}`;
                return (
                  <td key={d} className="border-b border-borda-suave p-0.5 text-center">
                    <button
                      type="button"
                      data-celula={`${l}-${c}`}
                      tabIndex={foco[0] === l && foco[1] === c ? 0 : -1}
                      aria-label={descricao}
                      aria-disabled={!pode || undefined}
                      onFocus={() => setFoco([l, c])}
                      onKeyDown={(ev) => tecla(ev, l, c)}
                      onClick={() => pode && onAlterar(a.matriculaId, d, proximaSituacao(v))}
                      className={`relative h-11 w-11 rounded ${
                        v ? COR[v] : 'bg-fundo text-texto-suave'
                      } ${pode ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'} ${
                        pendente ? 'ring-2 ring-primaria ring-offset-1' : ''
                      }`}
                    >
                      {v ? LETRA[v] : '·'}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LegendaFrequencia() {
  return (
    <ul className="flex flex-wrap gap-4 text-sm text-texto" aria-label="Legenda">
      {(Object.keys(LETRA) as NonNullable<Situacao>[]).map((s) => (
        <li key={s} className="flex items-center gap-2">
          <span className={`inline-flex h-7 w-7 items-center justify-center rounded ${COR[s]}`}>
            {LETRA[s]}
          </span>
          {ROTULO[s][0]?.toUpperCase()}
          {ROTULO[s].slice(1)}
        </li>
      ))}
      <li className="flex items-center gap-2">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded ring-2 ring-primaria">
          ·
        </span>
        Ainda não salvo
      </li>
    </ul>
  );
}
