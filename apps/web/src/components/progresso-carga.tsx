import {
  cargaTerminou,
  type EtapaCarga,
  ROTULO_ETAPA,
  ROTULO_STATUS_CARGA,
  type StatusCarga,
} from '@sii/shared';

export interface Carga {
  id: number;
  fonte: string;
  status: StatusCarga;
  etapa: EtapaCarga | null;
  arquivo: string | null;
  mesReferencia: string | null;
  inicioEm: string;
  fimEm: string | null;
  total: number;
  processados: number;
  lidos: number;
  inseridos: number;
  rejeitados: number;
  ligados: number;
  novos: number;
  revisao: number;
  avisos: number;
  erro: string | null;
  /** Cargas lidas direto da fonte (e-SUS): COMPLETA ou INCREMENTAL. */
  modo?: string | null;
}

/** Nome da carga na tela: o arquivo enviado, o tipo de leitura do e-SUS ou o job de faltas. */
export function nomeCarga(c: Pick<Carga, 'id' | 'fonte' | 'arquivo' | 'modo'>): string {
  if (c.arquivo) return c.arquivo;
  if (c.fonte === 'ESUS_PEC')
    return c.modo === 'INCREMENTAL'
      ? 'e-SUS PEC · leitura incremental'
      : c.modo === 'COMPLETA'
        ? 'e-SUS PEC · leitura completa'
        : 'e-SUS PEC';
  if (c.fonte === 'INFREQUENCIA') return 'Conferência diária das faltas';
  if (c.fonte === 'BUSCA_ATIVA') return 'Busca ativa diária (crianças fora da escola)';
  if (c.fonte === 'PRAZOS') return 'Conferência diária dos prazos';
  return `Carga ${c.id}`;
}

const numero = (n: number) => n.toLocaleString('pt-BR');

/** Situação de uma carga: barra de progresso, etapa em texto e contagens. Só números, nenhum nome. */
export function ProgressoCarga({ carga }: { carga: Carga }) {
  const terminou = cargaTerminou(carga.status);
  const pct =
    carga.status === 'OK'
      ? 100
      : carga.total > 0
        ? Math.min(99, Math.round((carga.processados / carga.total) * 100))
        : 0;
  const etapa = carga.etapa ? ROTULO_ETAPA[carga.etapa] : ROTULO_STATUS_CARGA[carga.status];
  const tituloId = `carga-${carga.id}-titulo`;
  return (
    <section
      aria-labelledby={tituloId}
      className="flex flex-col gap-3 rounded-md border border-borda-suave bg-superficie p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={tituloId} className="text-lg font-semibold text-texto-forte">
          {nomeCarga(carga)}
          {carga.mesReferencia && ' '}
          {carga.mesReferencia && (
            <span className="ml-2 font-normal text-texto-suave">
              · referência {carga.mesReferencia}
            </span>
          )}
        </h2>
        <span className="font-semibold text-texto-forte">{ROTULO_STATUS_CARGA[carga.status]}</span>
      </div>

      {carga.status === 'REJEITADA' && carga.erro && (
        <p
          role="alert"
          className="rounded-md border-l-4 border-erro bg-erro-claro p-3 text-texto-forte"
        >
          {carga.erro}
        </p>
      )}
      {carga.status === 'FALHOU' && carga.erro && (
        <p
          role="alert"
          className="rounded-md border-l-4 border-erro bg-erro-claro p-3 text-texto-forte"
        >
          {carga.erro}
        </p>
      )}

      {carga.status !== 'REJEITADA' && carga.status !== 'FALHOU' && (
        <div className="flex flex-col gap-1">
          <div
            role="progressbar"
            aria-label="Progresso da carga"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-valuetext={`${pct}% — ${etapa}`}
            className="h-3 w-full overflow-hidden rounded-full bg-borda-suave"
          >
            <div className="h-full bg-primaria transition-[width]" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-sm text-texto">
            {etapa}
            {!terminou &&
              carga.total > 0 &&
              ` · ${numero(carga.processados)} de ${numero(carga.total)} linhas`}
          </p>
        </div>
      )}

      {carga.status === 'OK' && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-6">
          {(
            [
              ['Linhas lidas', carga.lidos],
              ['Carregadas', carga.inseridos],
              ['Já conhecidas', carga.ligados],
              ['Pessoas novas', carga.novos],
              ['Para revisão da CTI', carga.revisao],
              ['Linhas rejeitadas', carga.rejeitados],
            ] as const
          ).map(([rotulo, valor]) => (
            <div key={rotulo} className="flex flex-col">
              <dt className="text-sm text-texto-suave">{rotulo}</dt>
              <dd className="text-xl font-semibold text-texto-forte">{numero(valor)}</dd>
            </div>
          ))}
        </dl>
      )}
      {carga.status === 'OK' && carga.avisos > 0 && (
        <p className="text-sm text-texto">
          {numero(carga.avisos)} aviso(s): pessoas carregadas sem um dado inválido (por exemplo, CPF
          com dígito errado).
        </p>
      )}
    </section>
  );
}
