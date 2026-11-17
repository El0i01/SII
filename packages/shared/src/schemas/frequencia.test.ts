import { describe, expect, it } from 'vitest';
import { LancamentosFrequencia, MAXIMO_LANCAMENTOS, MesFrequencia } from './frequencia';

describe('LancamentosFrequencia', () => {
  it('aceita lançamento e apagamento (situação null)', () => {
    const r = LancamentosFrequencia.safeParse({
      lancamentos: [
        { matriculaId: 1, dia: '2026-11-16', situacao: 'FALTA' },
        { matriculaId: 1, dia: '2026-11-17', situacao: null },
      ],
    });
    expect(r.success).toBe(true);
  });

  it('recusa data inválida, situação desconhecida e lista vazia', () => {
    expect(
      LancamentosFrequencia.safeParse({
        lancamentos: [{ matriculaId: 1, dia: '2026-02-30', situacao: 'FALTA' }],
      }).success,
    ).toBe(false);
    expect(
      LancamentosFrequencia.safeParse({
        lancamentos: [{ matriculaId: 1, dia: '2026-11-16', situacao: 'ATRASO' }],
      }).success,
    ).toBe(false);
    expect(LancamentosFrequencia.safeParse({ lancamentos: [] }).success).toBe(false);
  });

  it('recusa envio acima do limite', () => {
    const lancamentos = Array.from({ length: MAXIMO_LANCAMENTOS + 1 }, (_, i) => ({
      matriculaId: i + 1,
      dia: '2026-11-16',
      situacao: 'PRESENTE' as const,
    }));
    expect(LancamentosFrequencia.safeParse({ lancamentos }).success).toBe(false);
  });
});

describe('MesFrequencia', () => {
  it('aceita AAAA-MM e recusa o resto', () => {
    expect(MesFrequencia.safeParse('2026-11').success).toBe(true);
    expect(MesFrequencia.safeParse('2026-13').success).toBe(false);
  });
});
