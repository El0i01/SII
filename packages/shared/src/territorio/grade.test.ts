import { describe, expect, it } from 'vitest';
import {
  anguloDominante,
  gradeGirada,
  ordemDeLeitura,
  retanguloOrientado,
  subdividir,
  type Ponto,
} from './grade';

const girar = ([x, y]: Ponto, graus: number): Ponto => {
  const a = (graus * Math.PI) / 180;
  return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
};
const retangulo = (l: number, a: number, graus: number): Ponto[] =>
  (
    [
      [0, 0],
      [l, 0],
      [l, a],
      [0, a],
      [0, 0],
    ] as Ponto[]
  ).map((p) => girar(p, graus));

describe('anguloDominante', () => {
  it('retângulo girado 30° → 30°; girado 120° → 30° (módulo 90)', () => {
    expect(anguloDominante([retangulo(400, 200, 30)])).toBeCloseTo(30, 6);
    expect(anguloDominante([retangulo(400, 200, 120)])).toBeCloseTo(30, 6);
  });

  it('arestas longas pesam mais que um chanfro curto', () => {
    const anel: Ponto[] = [
      [0, 0],
      [500, 0],
      [500, 300],
      [10, 300],
      [0, 290],
      [0, 0],
    ];
    expect(anguloDominante([anel])).toBeCloseTo(0, 0);
  });

  it('fica sempre em [0, 90)', () => {
    const a = anguloDominante([retangulo(100, 100, -10)]);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(90);
    expect(a).toBeCloseTo(80, 6);
  });

  it('sem arestas é erro', () => {
    expect(() => anguloDominante([[[1, 1]]])).toThrow(RangeError);
  });
});

describe('gradeGirada', () => {
  it('células quadradas do tamanho pedido, no ângulo, cobrindo o polígono', () => {
    const anel = retangulo(430, 210, 30);
    const celulas = gradeGirada([anel], 30, 216);
    for (const c of celulas) {
      expect(c).toHaveLength(5);
      const lado = Math.hypot(
        (c[1] as Ponto)[0] - (c[0] as Ponto)[0],
        (c[1] as Ponto)[1] - (c[0] as Ponto)[1],
      );
      expect(lado).toBeCloseTo(216, 6);
      const ang =
        (Math.atan2(
          (c[1] as Ponto)[1] - (c[0] as Ponto)[1],
          (c[1] as Ponto)[0] - (c[0] as Ponto)[0],
        ) *
          180) /
        Math.PI;
      expect(ang).toBeCloseTo(30, 6);
    }
    // 430 × 210 em células de 216: 2 × 1 (a grade cobre o retângulo girado)
    expect(celulas).toHaveLength(2);
  });
});

describe('retanguloOrientado e subdividir', () => {
  it('o retângulo orientado de um retângulo girado é ele mesmo', () => {
    const anel = retangulo(400, 300, 20);
    const r = retanguloOrientado([anel], 20);
    expect(r.largura).toBeCloseTo(400, 6);
    expect(r.altura).toBeCloseTo(300, 6);
  });

  it('subdivide em 4 × 3 = 12 partes de mesmo tamanho, numeradas linha a linha', () => {
    const r = retanguloOrientado([retangulo(400, 300, 0)], 0);
    const partes = subdividir(r, 4, 3);
    expect(partes).toHaveLength(12);
    expect(partes[0]?.[0]).toEqual([0, 300]); // lote 1: canto de cima à esquerda
    const [a, b, , d] = partes[11] as Ponto[];
    expect(
      Math.hypot((b as Ponto)[0] - (a as Ponto)[0], (b as Ponto)[1] - (a as Ponto)[1]),
    ).toBeCloseTo(100, 6);
    expect(
      Math.hypot((d as Ponto)[0] - (a as Ponto)[0], (d as Ponto)[1] - (a as Ponto)[1]),
    ).toBeCloseTo(100, 6);
  });
});

describe('ordemDeLeitura', () => {
  it('de cima para baixo, da esquerda para a direita, no sistema girado', () => {
    const centros: Ponto[] = [
      [300, 0],
      [0, 0],
      [0, 300],
      [300, 300],
    ];
    expect(ordemDeLeitura(centros, 0, 216)).toEqual([2, 3, 1, 0]);
  });
});
