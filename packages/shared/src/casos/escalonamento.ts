import { type DataISO, diasCorridosEntre, diasUteisEntre } from '../calendario/dias';
import type { TipoCaso } from '../enums/dominio';
import { type NivelEscalonamento, type Prazo, prazoCaso } from './prazos';

export interface CasoParaPrazo {
  tipo: TipoCaso;
  status: string;
  /** Dia do alerta em Porto Velho. */
  alertaEm: DataISO;
}

/**
 * Prazo do caso hoje (job de prazos, P11): infrequência em dias úteis desde o alerta (com os
 * feriados), busca ativa em dias corridos. Tipo sem prazo na especificação → null.
 */
export function prazoHoje(
  caso: CasoParaPrazo,
  hoje: DataISO,
  feriados: Iterable<DataISO> = [],
): Prazo | null {
  if (caso.tipo !== 'INFREQUENCIA' && caso.tipo !== 'BUSCA_ATIVA_ESCOLAR') return null;
  const dias =
    caso.tipo === 'INFREQUENCIA'
      ? diasUteisEntre(caso.alertaEm, hoje, feriados)
      : Math.max(0, diasCorridosEntre(caso.alertaEm, hoje));
  return prazoCaso(caso.tipo, caso.status, dias);
}

/** O nível só gera aviso quando sobe (descer acontece quando o caso anda ou fecha). */
export function subiuDeNivel(antes: number, depois: NivelEscalonamento): boolean {
  return depois > antes;
}

export type TipoAviso = 'PARECER_EMITIDO' | 'NIVEL_1' | 'NIVEL_2' | 'NIVEL_3' | 'ENCAMINHAMENTO';

/**
 * Texto fixo dos avisos internos. Leva só o código do caso: aviso nunca tem dado pessoal (pode ir
 * para e-mail ou push no futuro).
 */
export function textoAviso(tipo: TipoAviso, codigoCaso: string, detalhe?: string): string {
  switch (tipo) {
    case 'PARECER_EMITIDO':
      return `O CRAS emitiu o parecer do caso ${codigoCaso}${detalhe ? `: ${detalhe}` : ''}.`;
    case 'NIVEL_1':
      return `O prazo do caso ${codigoCaso} vence em até 3 dias.`;
    case 'NIVEL_2':
      return `O prazo do caso ${codigoCaso} venceu: o caso foi para a coordenação.`;
    case 'NIVEL_3':
      return `O caso ${codigoCaso} está vencido há mais de 7 dias e entrou na pauta do Comitê.`;
    case 'ENCAMINHAMENTO':
      return `Novo caso encaminhado: ${codigoCaso}.`;
  }
}
