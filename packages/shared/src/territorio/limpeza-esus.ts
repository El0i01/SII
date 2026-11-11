/** [longitude, latitude] em graus (WGS 84 / SIRGAS 2000). */
export type LonLat = [number, number];

export type MotivoPontoSuspeito =
  'PERTO_DA_UNIDADE_DE_SAUDE' | 'FORA_DO_MUNICIPIO' | 'REPETIDO_EM_IMOVEIS';

/** Limites da limpeza dos pontos do e-SUS Território (§3.2). */
export const LIMPEZA_ESUS = { distanciaUnidadeM: 30, repeticoesImoveis: 3 } as const;

const RAIO_TERRA_M = 6_371_008.8;

export function distanciaMetros([lon1, lat1]: LonLat, [lon2, lat2]: LonLat): number {
  const r = Math.PI / 180;
  const dLat = (lat2 - lat1) * r;
  const dLon = (lon2 - lon1) * r;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
  return 2 * RAIO_TERRA_M * Math.asin(Math.sqrt(a));
}

/** Ponto em polígono (anel fechado), por raio. */
export function dentroDoPoligono([x, y]: LonLat, anel: readonly LonLat[]): boolean {
  let dentro = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const [xi, yi] = anel[i] as LonLat;
    const [xj, yj] = anel[j] as LonLat;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

/**
 * Por que um ponto do e-SUS Território não serve para geocodificar (§3.2):
 * - a menos de 30 m de uma unidade de saúde (cadastro feito da UBS, não do domicílio);
 * - fora do limite municipal;
 * - o mesmo ponto em 3 ou mais imóveis distintos.
 * Sem motivo, o ponto entra na cascata como ESUS_TERRITORIO.
 */
export function motivosPontoEsusSuspeito(
  ponto: LonLat,
  imoveisNoMesmoPonto: number,
  ctx: { unidadesSaude: readonly LonLat[]; limiteMunicipio: readonly LonLat[] },
): MotivoPontoSuspeito[] {
  const motivos: MotivoPontoSuspeito[] = [];
  if (ctx.unidadesSaude.some((u) => distanciaMetros(ponto, u) < LIMPEZA_ESUS.distanciaUnidadeM)) {
    motivos.push('PERTO_DA_UNIDADE_DE_SAUDE');
  }
  if (!dentroDoPoligono(ponto, ctx.limiteMunicipio)) motivos.push('FORA_DO_MUNICIPIO');
  if (imoveisNoMesmoPonto >= LIMPEZA_ESUS.repeticoesImoveis) motivos.push('REPETIDO_EM_IMOVEIS');
  return motivos;
}
