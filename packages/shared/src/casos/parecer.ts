import type { Desfecho } from '../enums/dominio';

export interface EfeitoParecer {
  /** O caso fecha (encerrado_em) com o parecer. */
  encerraCaso: boolean;
  /** Eventos que entram na trilha depois de PARECER_EMITIDO. */
  eventosExtras: 'ENCAMINHADO_CONSELHO_TUTELAR'[];
}

/**
 * O que o parecer faz com o caso (§4.1): fecha, exceto quando o desfecho é o encaminhamento ao
 * Conselho Tutelar ou há nova visita programada.
 */
export function efeitoDoParecer(desfecho: Desfecho, novaVisita: boolean): EfeitoParecer {
  const conselho = desfecho === 'ENCAMINHADO_CONSELHO_TUTELAR';
  return {
    encerraCaso: !conselho && !novaVisita,
    eventosExtras: conselho ? ['ENCAMINHADO_CONSELHO_TUTELAR'] : [],
  };
}
