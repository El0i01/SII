import { describe, expect, it } from 'vitest';
import {
  AprovarPesosIvm,
  calcularIvm,
  contarFaixas,
  DIMENSOES_IVM,
  faixaIvm,
  PESOS_IVM_PADRAO,
  PesosIvm,
  pesosVigentes,
  rankingIvm,
} from './ivm';

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

describe('pesos vigentes, ranking e aprovação (P19)', () => {
  const dims = (v: number) => ({ renda: v, saude: v, escola: v, imovel: v, regularizacao: v });
  it('vigente = maior versão aprovada; sem aprovada, a proposta padrão', () => {
    const v1 = { versao: 1, pesos: PESOS_IVM_PADRAO, aprovadoEm: null };
    const v2 = { versao: 2, pesos: { ...PESOS_IVM_PADRAO, renda: 50 }, aprovadoEm: '2026-11-18' };
    const v3 = { versao: 3, pesos: { ...PESOS_IVM_PADRAO, renda: 10 }, aprovadoEm: null };
    expect(pesosVigentes([v1])).toEqual({ versao: null, pesos: PESOS_IVM_PADRAO, proposta: true });
    expect(pesosVigentes([v1, v2, v3])).toEqual({ versao: 2, pesos: v2.pesos, proposta: false });
    const v4 = { ...v3, versao: 4, aprovadoEm: '2026-11-19' };
    expect(pesosVigentes([v4, v1, v2]).versao).toBe(4);
  });
  it('ranking da mais vulnerável e contagem por faixa', () => {
    const r = rankingIvm(
      [
        { id: 1, codigo: 'Q002', setor: 'S01', dimensoes: dims(0.2) },
        { id: 2, codigo: 'Q001', setor: 'S01', dimensoes: dims(0.7) },
        { id: 3, codigo: 'Q003', setor: 'S02', dimensoes: dims(0.2) },
      ],
      PESOS_IVM_PADRAO,
    );
    expect(r.map((q) => q.codigo)).toEqual(['Q001', 'Q002', 'Q003']);
    expect(r[0]?.faixa.codigo).toBe('MUITO_ALTA');
    expect(contarFaixas(r)).toEqual({ MUITO_ALTA: 1, ALTA: 0, MODERADA: 0, BAIXA: 2 });
  });
  it('aprovação exige justificativa e pesos válidos', () => {
    expect(
      AprovarPesosIvm.safeParse({
        pesos: PESOS_IVM_PADRAO,
        justificativa: 'Regularização pesa mais em 2027.',
      }).success,
    ).toBe(true);
    expect(
      AprovarPesosIvm.safeParse({ pesos: PESOS_IVM_PADRAO, justificativa: 'curta' }).success,
    ).toBe(false);
    expect(
      AprovarPesosIvm.safeParse({
        pesos: dims(0),
        justificativa: 'Todas as dimensões zeradas, teste.',
      }).success,
    ).toBe(false);
  });
});
