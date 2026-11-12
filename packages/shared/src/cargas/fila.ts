/** Contrato entre a API (que enfileira) e o worker (que processa) as cargas (§5, P08). */
export const FILA_CARGAS = 'cargas';

/** O job leva só o id do LogCarga: nada do arquivo nem de pessoa passa pelo Redis. */
export interface JobCarga {
  cargaId: number;
}

/** LIGACAO cobre a ligação das pessoas e a gravação no domínio, família por família. */
export const ETAPAS_CARGA = ['BAIXANDO', 'LAYOUT', 'STAGING', 'LIGACAO', 'FIM'] as const;
export type EtapaCarga = (typeof ETAPAS_CARGA)[number];

/** Texto da etapa para a tela de acompanhamento. */
export const ROTULO_ETAPA: Record<EtapaCarga, string> = {
  BAIXANDO: 'Abrindo o arquivo',
  LAYOUT: 'Conferindo as colunas',
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
