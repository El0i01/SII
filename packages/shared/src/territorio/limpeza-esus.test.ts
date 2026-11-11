import { describe, expect, it } from 'vitest';
import { distanciaMetros, dentroDoPoligono, motivosPontoEsusSuspeito } from './limpeza-esus';

// Quadrado ~2 km em volta da sede (lon, lat).
const LIMITE: [number, number][] = [
  [-63.2, -9.2],
  [-63.17, -9.2],
  [-63.17, -9.17],
  [-63.2, -9.17],
  [-63.2, -9.2],
];
const UBS: [number, number] = [-63.1798, -9.18705];

describe('distância e polígono', () => {
  it('haversine: 1 grau de latitude ≈ 111 km', () => {
    expect(distanciaMetros([-63, -9], [-63, -10])).toBeGreaterThan(110_000);
    expect(distanciaMetros([-63, -9], [-63, -10])).toBeLessThan(112_000);
  });

  it('ponto dentro e fora do polígono', () => {
    expect(dentroDoPoligono([-63.185, -9.185], LIMITE)).toBe(true);
    expect(dentroDoPoligono([-63.3, -9.185], LIMITE)).toBe(false);
  });
});

describe('motivosPontoEsusSuspeito (§3.2)', () => {
  const ctx = { unidadesSaude: [UBS], limiteMunicipio: LIMITE };

  it('ponto bom não tem motivo', () => {
    expect(motivosPontoEsusSuspeito([-63.185, -9.185], 1, ctx)).toEqual([]);
  });

  it('a menos de 30 m de uma unidade de saúde (o ACS cadastrou da UBS)', () => {
    const pertinho: [number, number] = [UBS[0] + 0.0001, UBS[1]]; // ~11 m
    expect(motivosPontoEsusSuspeito(pertinho, 1, ctx)).toEqual(['PERTO_DA_UNIDADE_DE_SAUDE']);
  });

  it('fora do município', () => {
    expect(motivosPontoEsusSuspeito([-63.3, -9.185], 1, ctx)).toEqual(['FORA_DO_MUNICIPIO']);
  });

  it('o mesmo ponto em 3 ou mais imóveis distintos', () => {
    expect(motivosPontoEsusSuspeito([-63.185, -9.185], 2, ctx)).toEqual([]);
    expect(motivosPontoEsusSuspeito([-63.185, -9.185], 3, ctx)).toEqual(['REPETIDO_EM_IMOVEIS']);
  });
});
