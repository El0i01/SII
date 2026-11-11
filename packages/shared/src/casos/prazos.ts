import { STATUS_BUSCA_ATIVA, STATUS_NOTIFICACAO, type TipoCaso } from '../enums/dominio';

/** Prazos da busca ativa, em dias contados do alerta, pela etapa em que o caso está (§4.2). */
export const LIMITES_BUSCA_ATIVA = {
  IDENTIFICADO: 5,
  ENCAMINHADO: 20,
  VISITA_REALIZADA: 30,
  NAO_LOCALIZADO: 30,
} as const;

/** Prazo do parecer do CRAS na infrequência, em dias úteis (§4.1). */
export const PRAZO_PARECER_DIAS_UTEIS = 5;

/** Faltando esta folga ou menos, o caso sobe ao nível 1 (aviso). */
export const FOLGA_AVISO = 3;
/** Vencido há mais que isto, o caso vai à pauta do Comitê (nível 3). */
export const ATRASO_COMITE = 7;

export type NivelEscalonamento = 0 | 1 | 2 | 3;
export type TomPrazo = 'neutro' | 'ok' | 'alerta' | 'critico';

export interface Prazo {
  /** Dias que faltam (negativo = atraso). null quando o caso está concluído. */
  restante: number | null;
  nivel: NivelEscalonamento;
  rotulo: string;
  tom: TomPrazo;
  concluido: boolean;
}

const CONCLUIDO: Prazo = {
  restante: null,
  nivel: 0,
  rotulo: 'Concluído',
  tom: 'neutro',
  concluido: true,
};

function escala(restante: number): Prazo {
  const base = { restante, concluido: false };
  if (restante > FOLGA_AVISO)
    return { ...base, nivel: 0, rotulo: `No prazo · ${restante} dias`, tom: 'ok' };
  if (restante >= 0) {
    const rotulo =
      restante === 0 ? 'Vence hoje' : `Vence em ${restante} ${restante === 1 ? 'dia' : 'dias'}`;
    return { ...base, nivel: 1, rotulo, tom: 'alerta' };
  }
  if (restante >= -ATRASO_COMITE)
    return { ...base, nivel: 2, rotulo: 'Vencido · coordenação', tom: 'critico' };
  return { ...base, nivel: 3, rotulo: 'Escalonado ao Comitê', tom: 'critico' };
}

/**
 * Prazo e nível de escalonamento de um caso (§4.1 e §4.2), no formato do protótipo.
 *
 * - Busca ativa: limite pela etapa atual, `diasDesdeAlerta` em dias corridos.
 * - Infrequência: 5 dias **úteis** para o parecer; `diasDesdeAlerta` em dias úteis (use
 *   `diasUteisEntre`). Mesma escala da busca ativa (decisão de 11/11/2026).
 * - Níveis: 0 no prazo · 1 faltando 3 dias ou menos · 2 vencido (coordenação) · 3 vencido há mais
 *   de 7 dias (pauta do Comitê).
 * - Os demais tipos ainda não têm prazo na especificação: devolve `null`.
 */
export function prazoCaso(tipo: TipoCaso, status: string, diasDesdeAlerta: number): Prazo | null {
  if (!Number.isInteger(diasDesdeAlerta) || diasDesdeAlerta < 0) {
    throw new RangeError('diasDesdeAlerta precisa ser inteiro ≥ 0');
  }

  if (tipo === 'BUSCA_ATIVA_ESCOLAR') {
    if (!(STATUS_BUSCA_ATIVA as readonly string[]).includes(status)) {
      throw new RangeError(`Status ${status} não é da busca ativa`);
    }
    if (status === 'MATRICULADO') return CONCLUIDO;
    return escala(
      LIMITES_BUSCA_ATIVA[status as keyof typeof LIMITES_BUSCA_ATIVA] - diasDesdeAlerta,
    );
  }

  if (tipo === 'INFREQUENCIA') {
    if (!(STATUS_NOTIFICACAO as readonly string[]).includes(status)) {
      throw new RangeError(`Status ${status} não é de notificação`);
    }
    if (status === 'PARECER_EMITIDO') return CONCLUIDO;
    return escala(PRAZO_PARECER_DIAS_UTEIS - diasDesdeAlerta);
  }

  return null;
}
