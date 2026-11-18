import { type DadosIdoso, LIMITE_IDOSO_PRIORITARIO, motivosVisitaIdoso } from '../motivos/idoso';

/** Pessoa idosa (60+) já lida (P19). Nenhuma condição de saúde por nome: só sinalizadores. */
export interface IdosoPainel {
  setor: string | null;
  idade: number;
  sozinha: boolean;
  diasSemVisitaAcs: number | null;
  acamada: boolean;
  bpc: boolean;
  cras: boolean;
  gripe: boolean | null;
  cronica: boolean;
  cronicaAcompanhada: boolean;
  scfv: boolean;
}

const semVisita90 = (p: IdosoPainel) => (p.diasSemVisitaAcs ?? Infinity) > 90;

export const dadosIdoso = (p: IdosoPainel): DadosIdoso => ({
  moraSozinha: p.sozinha,
  diasSemVisitaAcs: p.diasSemVisitaAcs,
  acamada: p.acamada,
  recebeBpc: p.bpc,
  acompanhadaCras: p.cras,
  vacinaGripe: p.gripe,
  condicaoCronica: p.cronica,
  consultaNoSemestre: p.cronicaAcompanhada,
});

export const CRITERIOS_IDOSA = {
  pessoas: () => true,
  sozinhas: (p: IdosoPainel) => p.sozinha,
  semVisita90,
  gripeInformada: (p: IdosoPainel) => p.gripe !== null,
  gripeEmDia: (p: IdosoPainel) => p.gripe === true,
  scfv: (p: IdosoPainel) => p.scfv,
  bpc: (p: IdosoPainel) => p.bpc,
  acamadas: (p: IdosoPainel) => p.acamada,
  cronicas: (p: IdosoPainel) => p.cronica,
  cronicasAcompanhadas: (p: IdosoPainel) => p.cronica && p.cronicaAcompanhada,
  // Cruzamentos Saúde × Assistência (protótipo):
  sozinhaSemVisita: (p: IdosoPainel) => p.sozinha && semVisita90(p),
  acamadaSemCras: (p: IdosoPainel) => p.acamada && !p.cras,
  bpcSemCras: (p: IdosoPainel) => p.bpc && !p.cras,
  cronicaSemConsulta: (p: IdosoPainel) => p.cronica && !p.cronicaAcompanhada,
  sozinhaSemScfv: (p: IdosoPainel) => p.sozinha && !p.scfv,
  prioritarias: (p: IdosoPainel) =>
    motivosVisitaIdoso(dadosIdoso(p)).length >= LIMITE_IDOSO_PRIORITARIO,
} as const;

/** Os cinco cruzamentos, na ordem e com os textos do protótipo. */
export const CRUZAMENTOS_IDOSA = [
  {
    chave: 'sozinhaSemVisita',
    titulo: 'moram sozinhas e estão sem visita do ACS há mais de 90 dias',
    detalhe: 'Prioridade para a visita domiciliar',
    secretaria: 'Saúde',
    tom: 'critico',
  },
  {
    chave: 'acamadaSemCras',
    titulo: 'acamadas ou domiciliadas sem acompanhamento do CRAS',
    detalhe: 'Avaliar cuidador e benefícios',
    secretaria: 'Assistência',
    tom: 'critico',
  },
  {
    chave: 'bpcSemCras',
    titulo: 'recebem BPC e não são acompanhadas pelo CRAS',
    detalhe: 'Inclusão no acompanhamento familiar',
    secretaria: 'Assistência',
    tom: 'alerta',
  },
  {
    chave: 'cronicaSemConsulta',
    titulo: 'com condição crônica sem consulta no semestre',
    detalhe: 'Dado agregado, sem a condição',
    secretaria: 'Saúde',
    tom: 'alerta',
  },
  {
    chave: 'sozinhaSemScfv',
    titulo: 'moram sozinhas e não participam do Serviço de Convivência',
    detalhe: 'Convite do CRAS para os grupos',
    secretaria: 'Assistência',
    tom: 'info',
  },
] as const;

/** Lista prioritária: 3 ou mais motivos, mais motivos primeiro, depois mais dias sem visita. */
export function ordenarPrioritarios<
  T extends { motivos: unknown[]; diasSemVisitaAcs: number | null },
>(lista: readonly T[]): T[] {
  return lista
    .filter((p) => p.motivos.length >= LIMITE_IDOSO_PRIORITARIO)
    .sort(
      (a, b) =>
        b.motivos.length - a.motivos.length ||
        (b.diasSemVisitaAcs ?? 100_000) - (a.diasSemVisitaAcs ?? 100_000),
    );
}
