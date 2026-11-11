import { describe, expect, it } from 'vitest';
import {
  coberturaCreche,
  deficitCreche,
  META_COBERTURA_PADRAO,
  ordenarPrioridadeCreche,
  prioridadeNovaUnidade,
} from './cobertura';

describe('vagas de creche (§3.9)', () => {
  it('meta padrão de 50% (PNE)', () => {
    expect(META_COBERTURA_PADRAO).toBe(50);
  });

  it('cobertura = vagas / crianças de 0 a 3 × 100', () => {
    expect(coberturaCreche(200, 50)).toBe(25);
    expect(coberturaCreche(0, 10)).toBeNull();
  });

  it('déficit para a meta, descontando vagas novas, nunca negativo', () => {
    expect(deficitCreche({ criancas: 200, vagas: 50 })).toBe(50);
    expect(deficitCreche({ criancas: 200, vagas: 50, novasVagas: 30 })).toBe(20);
    expect(deficitCreche({ criancas: 200, vagas: 150 })).toBe(0);
    expect(deficitCreche({ criancas: 201, vagas: 0, metaPct: 25 })).toBe(50); // round(50.25)
  });

  it('prioridade = déficit × (1 + índice médio do setor)', () => {
    expect(prioridadeNovaUnidade(40, 0.5)).toBe(60);
    expect(prioridadeNovaUnidade(0, 0.9)).toBe(0);
  });

  it('ordena os setores pela prioridade', () => {
    const r = ordenarPrioridadeCreche([
      { setor: 'S01', criancas: 100, vagas: 40, ivmMedio: 0.3 }, // déficit 10 → 13
      { setor: 'S03', criancas: 300, vagas: 60, ivmMedio: 0.7 }, // déficit 90 → 153
      { setor: 'S02', criancas: 200, vagas: 50, ivmMedio: 0.4 }, // déficit 50 → 70
    ]);
    expect(r.map((s) => s.setor)).toEqual(['S03', 'S02', 'S01']);
    expect(r[0]).toMatchObject({ deficit: 90, cobertura: 20 });
    expect(r[0]?.prioridade).toBeCloseTo(153, 10);
  });

  it('valores negativos ou meta fora de 0..100 são erro', () => {
    expect(() => coberturaCreche(-1, 0)).toThrow(RangeError);
    expect(() => deficitCreche({ criancas: 10, vagas: -1 })).toThrow(RangeError);
    expect(() => deficitCreche({ criancas: 10, vagas: 0, metaPct: 120 })).toThrow(RangeError);
    expect(() => prioridadeNovaUnidade(10, 1.5)).toThrow(RangeError);
  });
});
