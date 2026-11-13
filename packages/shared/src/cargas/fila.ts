/** Contrato entre a API (que enfileira) e o worker (que processa) as cargas (§5, P08). */
export const FILA_CARGAS = 'cargas';

/**
 * O job leva só o id do LogCarga: nada do arquivo nem de pessoa passa pelo Redis. A carga noturna
 * do e-SUS (P09) nasce sem carga: o worker cria o LogCarga e grava o id no próprio job.
 */
export type JobCarga = { cargaId: number } | { fonte: 'ESUS_PEC'; cargaId?: number };

/** Id da carga do job, se já existir. */
export function cargaDoJob(job: JobCarga): number | undefined {
  return job.cargaId;
}

/** LIGACAO cobre a ligação das pessoas e a gravação no domínio, família por família. */
export const ETAPAS_CARGA = [
  'BAIXANDO',
  'LAYOUT',
  'ESTRUTURA',
  'LEITURA',
  'STAGING',
  'LIGACAO',
  'FIM',
] as const;
export type EtapaCarga = (typeof ETAPAS_CARGA)[number];

/** Texto da etapa para a tela de acompanhamento. */
export const ROTULO_ETAPA: Record<EtapaCarga, string> = {
  BAIXANDO: 'Abrindo o arquivo',
  LAYOUT: 'Conferindo as colunas',
  ESTRUTURA: 'Conferindo a estrutura do banco do e-SUS',
  LEITURA: 'Lendo o e-SUS',
  STAGING: 'Lendo as linhas',
  LIGACAO: 'Ligando as pessoas e gravando as famílias',
  FIM: 'Concluída',
};

export const STATUS_CARGA = ['AGUARDANDO', 'EXECUTANDO', 'OK', 'REJEITADA', 'FALHOU'] as const;
export type StatusCarga = (typeof STATUS_CARGA)[number];
export const ROTULO_STATUS_CARGA: Record<StatusCarga, string> = {
  AGUARDANDO: 'Na fila',
  EXECUTANDO: 'Em andamento',
  OK: 'Concluída',
  REJEITADA: 'Rejeitada',
  FALHOU: 'Falhou',
};

export function cargaTerminou(status: StatusCarga): boolean {
  return status === 'OK' || status === 'REJEITADA' || status === 'FALHOU';
}
