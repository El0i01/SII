/**
 * Cascata fixa de geocodificação (§3.2): a primeira fonte disponível vence.
 * O ponto confirmado (ou ajustado) pelo usuário em campo vem antes de todas.
 */
export const FONTES_GEO = [
  'CONFIRMADO_USUARIO',
  'CENSO_GPS',
  'LOTE',
  'ESUS_TERRITORIO',
  'CNEFE',
  'SIGEF_CAR',
  'SETOR',
] as const;
export type FonteGeo = (typeof FONTES_GEO)[number];

/** Precisão padrão, em metros, só onde a especificação dá o número. */
export const PRECISAO_PADRAO_M: Partial<Record<FonteGeo, number>> = {
  CENSO_GPS: 5,
  LOTE: 10,
  ESUS_TERRITORIO: 30,
};

export interface CandidatoGeo {
  fonte: FonteGeo;
  lat: number;
  lon: number;
  precisaoM?: number;
  /** Nível de geocodificação do CNEFE 2022: 1 é o melhor. */
  nivelCnefe?: 1 | 2 | 3;
}

export interface PontoEscolhido {
  fonte: FonteGeo;
  lat: number;
  lon: number;
  precisaoM: number;
  nivelCnefe?: 1 | 2 | 3;
}

function coordenadaValida(c: CandidatoGeo): boolean {
  return (
    Number.isFinite(c.lat) &&
    Number.isFinite(c.lon) &&
    Math.abs(c.lat) <= 90 &&
    Math.abs(c.lon) <= 180 &&
    !(c.lat === 0 && c.lon === 0)
  );
}

function precisao(c: CandidatoGeo): number {
  const p = c.precisaoM ?? PRECISAO_PADRAO_M[c.fonte];
  if (p === undefined) throw new TypeError(`Informe precisaoM para a fonte ${c.fonte}`);
  return p;
}

/**
 * Escolhe o ponto do domicílio. Dentro da mesma fonte: no CNEFE, nível 1 > 2 > 3; nas outras, o
 * mais preciso. Coordenadas inválidas (fora do globo, 0,0) são descartadas. Sem candidato: `null`.
 */
export function cascataGeocodificacao(candidatos: readonly CandidatoGeo[]): PontoEscolhido | null {
  const validos = candidatos.filter(coordenadaValida).map((c) => ({ c, precisaoM: precisao(c) }));
  validos.sort(
    (a, b) =>
      FONTES_GEO.indexOf(a.c.fonte) - FONTES_GEO.indexOf(b.c.fonte) ||
      (a.c.nivelCnefe ?? 0) - (b.c.nivelCnefe ?? 0) ||
      a.precisaoM - b.precisaoM,
  );
  const melhor = validos[0];
  if (!melhor) return null;
  const { c, precisaoM } = melhor;
  return {
    fonte: c.fonte,
    lat: c.lat,
    lon: c.lon,
    precisaoM,
    ...(c.nivelCnefe ? { nivelCnefe: c.nivelCnefe } : {}),
  };
}
