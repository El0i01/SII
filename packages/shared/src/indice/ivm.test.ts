import { describe, expect, it } from 'vitest';
import { calcularIvm, DIMENSOES_IVM, faixaIvm, PESOS_IVM_PADRAO, PesosIvm } from './ivm';

const dims = { renda: 0.8, saude: 0.4, escola: 0.5, imovel: 0.2, regularizacao: 1 };

describe('IVM (§3.10)', () => {
  it('cinco dimensões com os pesos padrão 30/20/20/15/15', () => {
    expect(DIMENSOES_IVM.map((d) => d.codigo)).toEqual([
      'renda',
      'saude',
      'escola',
      'imovel',
      'regularizacao',
    ]);
    expect(PESOS_IVM_PADRAO).toEqual({
      renda: 30,
      saude: 20,
      escola: 20,
      imovel: 15,
      regularizacao: 15,
    });
  });

  it('média ponderada Σ(dim × peso) / Σ(peso)', () => {
    // (0.8*30 + 0.4*20 + 0.5*20 + 0.2*15 + 1*15) / 100 = 0.6
    expect(calcularIvm(dims)).toBeCloseTo(0.6, 10);
  });

  it('pesos são relativos (dobrar todos não muda o índice)', () => {
    const dobro = { renda: 60, saude: 40, escola: 40, imovel: 30, regularizacao: 30 };
    expect(calcularIvm(dims, dobro)).toBeCloseTo(calcularIvm(dims), 10);
  });

  it('peso zero tira a dimensão da conta', () => {
    const soRenda = { renda: 1, saude: 0, escola: 0, imovel: 0, regularizacao: 0 };
    expect(calcularIvm(dims, soRenda)).toBeCloseTo(0.8, 10);
  });

  it('dimensão fora de 0..1, peso negativo ou soma zero são erro', () => {
    expect(() => calcularIvm({ ...dims, renda: 1.2 })).toThrow(RangeError);
    expect(() => calcularIvm({ ...dims, saude: Number.NaN })).toThrow(RangeError);
    expect(() => calcularIvm(dims, { ...PESOS_IVM_PADRAO, renda: -1 })).toThrow(RangeError);
    expect(() =>
      calcularIvm(dims, { renda: 0, saude: 0, escola: 0, imovel: 0, regularizacao: 0 }),
    ).toThrow(RangeError);
  });

  it('faixas da especificação nos limites exatos', () => {
    expect(faixaIvm(0)).toMatchObject({ codigo: 'BAIXA', rotulo: 'Baixa' });
    expect(faixaIvm(0.3499).codigo).toBe('BAIXA');
    expect(faixaIvm(0.35)).toMatchObject({ codigo: 'MODERADA', rotulo: 'Moderada' });
    expect(faixaIvm(0.5)).toMatchObject({ codigo: 'ALTA', rotulo: 'Alta' });
    expect(faixaIvm(0.65)).toMatchObject({ codigo: 'MUITO_ALTA', rotulo: 'Muito alta' });
    expect(faixaIvm(1).codigo).toBe('MUITO_ALTA');
    expect(() => faixaIvm(1.01)).toThrow(RangeError);
  });

  it('schema de pesos aprovado pelo Comitê: 0 a 100 e soma maior que zero', () => {
    expect(PesosIvm.safeParse(PESOS_IVM_PADRAO).success).toBe(true);
    expect(PesosIvm.safeParse({ ...PESOS_IVM_PADRAO, renda: 101 }).success).toBe(false);
    expect(
      PesosIvm.safeParse({ renda: 0, saude: 0, escola: 0, imovel: 0, regularizacao: 0 }).success,
    ).toBe(false);
  });
});
