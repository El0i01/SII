'use client';

export interface LadoRevisao {
  id: number;
  nome: string;
  nascimento: string | null;
  mae: string | null;
  sexo: string | null;
  setor: string | null;
  cpf: string | null;
  nis: string | null;
  temCns: boolean;
  fontes: { fonte: string; regra: string }[];
}

export interface Revisao {
  id: number;
  similaridade: number;
  a: LadoRevisao;
  b: LadoRevisao;
}

const NOMES_FONTE: Record<string, string> = {
  ESUS: 'e-SUS',
  CADUNICO: 'CadÚnico',
  GESTAO_ESCOLAR: 'Gestão escolar',
  CENSO: 'Censo Municipal',
  SEDUC: 'SEDUC',
  SINASC: 'SINASC',
};

const data = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : 'não informado');

function Lado({ titulo, p, outro }: { titulo: string; p: LadoRevisao; outro: LadoRevisao }) {
  const linhas: [string, string, boolean][] = [
    ['Nome', p.nome, p.nome !== outro.nome],
    ['Nascimento', data(p.nascimento), p.nascimento !== outro.nascimento],
    ['Mãe', p.mae ?? 'não informada', p.mae !== outro.mae],
    ['Setor', p.setor ?? '—', false],
    ['CPF', p.cpf ?? 'sem CPF', false],
    ['NIS', p.nis ?? 'sem NIS', false],
    ['Fontes', p.fontes.map((f) => NOMES_FONTE[f.fonte] ?? f.fonte).join(', ') || '—', false],
  ];
  return (
    <div className="flex-1 rounded-md border border-borda-suave bg-superficie p-4">
      <h3 className="mb-2 font-semibold text-texto-forte">{titulo}</h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        {linhas.map(([rotulo, valor, difere]) => (
          <div key={rotulo} className="contents">
            <dt className="text-texto-suave">{rotulo}</dt>
            <dd className={difere ? 'font-semibold text-alerta' : 'text-texto-forte'}>
              {valor}
              {difere && <span className="sr-only"> (diferente do outro registro)</span>}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

interface Props {
  revisao: Revisao;
  ocupado: boolean;
  onUnir: () => void;
  onRejeitar: () => void;
}

/** Um par da fila: os dois registros lado a lado, com o que difere destacado (cor e texto). */
export function ParRevisao({ revisao, ocupado, onUnir, onRejeitar }: Props) {
  const id = `par-${revisao.id}`;
  return (
    <article
      aria-labelledby={id}
      className="flex flex-col gap-3 rounded-md border border-borda bg-fundo p-4"
    >
      <h2 id={id} className="text-lg font-semibold text-texto-forte">
        Talvez sejam a mesma pessoa · semelhança {Math.round(revisao.similaridade * 100)}%
      </h2>
      <div className="flex flex-col gap-3 md:flex-row">
        <Lado titulo="Registro que já existia" p={revisao.a} outro={revisao.b} />
        <Lado titulo="Registro novo" p={revisao.b} outro={revisao.a} />
      </div>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={ocupado}
          onClick={onUnir}
          className="min-h-[var(--spacing-alvo)] rounded-md bg-primaria px-4 font-semibold text-fundo hover:bg-primaria-escura disabled:opacity-70"
        >
          São a mesma pessoa: unir
        </button>
        <button
          type="button"
          disabled={ocupado}
          onClick={onRejeitar}
          className="min-h-[var(--spacing-alvo)] rounded-md border border-primaria px-4 font-semibold text-primaria hover:bg-primaria-clara disabled:opacity-70"
        >
          São pessoas diferentes
        </button>
      </div>
    </article>
  );
}
