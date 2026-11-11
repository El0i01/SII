import type { Motivo } from './crianca';

export type CodigoMotivoIdoso =
  | 'MORA_SOZINHA'
  | 'SEM_VISITA_ACS'
  | 'ACAMADA'
  | 'BPC_SEM_CRAS'
  | 'SEM_VACINA_GRIPE'
  | 'CRONICO_SEM_CONSULTA';

/** O que as fontes dizem da pessoa idosa (60+). `null` = sem informação. */
export interface DadosIdoso {
  moraSozinha: boolean;
  diasSemVisitaAcs: number | null;
  acamada: boolean;
  recebeBpc: boolean;
  acompanhadaCras: boolean;
  vacinaGripe: boolean | null;
  condicaoCronica: boolean;
  /** Consulta da condição crônica no semestre corrente. */
  consultaNoSemestre: boolean;
}

/** A partir de quantos motivos a pessoa vai para a lista prioritária (§4.4). */
export const LIMITE_IDOSO_PRIORITARIO = 3;
const DIAS_SEM_VISITA_ACS = 90;

/** Motivos de visita da pessoa idosa (§4.4), na ordem da especificação. */
export function motivosVisitaIdoso(p: DadosIdoso): Motivo<CodigoMotivoIdoso>[] {
  const m: Motivo<CodigoMotivoIdoso>[] = [];
  if (p.moraSozinha) m.push({ codigo: 'MORA_SOZINHA', rotulo: 'Mora sozinha' });
  if (p.diasSemVisitaAcs !== null && p.diasSemVisitaAcs > DIAS_SEM_VISITA_ACS) {
    m.push({ codigo: 'SEM_VISITA_ACS', rotulo: `Sem visita há ${p.diasSemVisitaAcs} dias` });
  }
  if (p.acamada) m.push({ codigo: 'ACAMADA', rotulo: 'Acamada' });
  if (p.recebeBpc && !p.acompanhadaCras) m.push({ codigo: 'BPC_SEM_CRAS', rotulo: 'BPC sem CRAS' });
  if (p.vacinaGripe === false)
    m.push({ codigo: 'SEM_VACINA_GRIPE', rotulo: 'Sem vacina da gripe' });
  if (p.condicaoCronica && !p.consultaNoSemestre) {
    m.push({ codigo: 'CRONICO_SEM_CONSULTA', rotulo: 'Crônico sem consulta' });
  }
  return m;
}

export function idosoPrioritario(motivos: readonly Motivo[]): boolean {
  return motivos.length >= LIMITE_IDOSO_PRIORITARIO;
}
