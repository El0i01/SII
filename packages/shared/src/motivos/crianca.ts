/** Motivo de visita: código estável para filtros e rótulo para a tela (texto do protótipo). */
export interface Motivo<C extends string = string> {
  codigo: C;
  rotulo: string;
}

export type CodigoMotivoCrianca =
  | 'FORA_DA_ESCOLA'
  | 'FALTAS_SEGUIDAS'
  | 'VACINACAO_ATRASADA'
  | 'SEM_VISITA_ACS'
  | 'PCF_ATRASADO'
  | 'SEM_ATENDIMENTO_ESPECIALIZADO'
  | 'SEM_CRECHE_SEM_PCF';

/** O que as fontes dizem da criança. `null` = sem informação (não gera motivo). */
export interface DadosCrianca {
  idade: number;
  /** Matrícula ativa na rede municipal ou estadual (creche conta). */
  matriculaAtiva: boolean;
  faltasSeguidas: number;
  vacinacaoEmDia: boolean | null;
  diasSemVisitaAcs: number | null;
  acompanhadaPcf: boolean;
  diasSemVisitaPcf: number | null;
  necessitaAee: boolean;
  temSalaRecursos: boolean;
  atendidaApae: boolean;
  noCadUnico: boolean;
}

export const LIMITES_CRIANCA = {
  faltasSeguidas: 5,
  diasSemVisitaAcs: 90,
  diasSemVisitaPcf: 14,
} as const;

/** Motivos de visita da criança e do adolescente (§4.3), na ordem da especificação. */
export function motivosVisitaCrianca(c: DadosCrianca): Motivo<CodigoMotivoCrianca>[] {
  const m: Motivo<CodigoMotivoCrianca>[] = [];
  if (c.idade >= 4 && c.idade <= 17 && !c.matriculaAtiva) {
    m.push({ codigo: 'FORA_DA_ESCOLA', rotulo: 'Fora da escola' });
  }
  if (c.faltasSeguidas >= LIMITES_CRIANCA.faltasSeguidas) {
    m.push({ codigo: 'FALTAS_SEGUIDAS', rotulo: `${c.faltasSeguidas} faltas seguidas` });
  }
  if (c.vacinacaoEmDia === false) {
    m.push({ codigo: 'VACINACAO_ATRASADA', rotulo: 'Vacinação atrasada' });
  }
  if (c.diasSemVisitaAcs !== null && c.diasSemVisitaAcs > LIMITES_CRIANCA.diasSemVisitaAcs) {
    m.push({ codigo: 'SEM_VISITA_ACS', rotulo: `Sem visita do ACS há ${c.diasSemVisitaAcs} dias` });
  }
  if (
    c.acompanhadaPcf &&
    c.diasSemVisitaPcf !== null &&
    c.diasSemVisitaPcf > LIMITES_CRIANCA.diasSemVisitaPcf
  ) {
    m.push({ codigo: 'PCF_ATRASADO', rotulo: 'Visita do Criança Feliz atrasada' });
  }
  if (c.necessitaAee && !c.temSalaRecursos && !c.atendidaApae) {
    m.push({ codigo: 'SEM_ATENDIMENTO_ESPECIALIZADO', rotulo: 'Sem atendimento especializado' });
  }
  if (c.idade <= 3 && c.noCadUnico && !c.matriculaAtiva && !c.acompanhadaPcf) {
    m.push({ codigo: 'SEM_CRECHE_SEM_PCF', rotulo: 'Sem creche e sem Criança Feliz' });
  }
  return m;
}
