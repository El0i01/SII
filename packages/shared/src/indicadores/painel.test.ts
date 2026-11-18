import { describe, expect, it } from 'vitest';
import { montarLinhaIndicador, rotuloPeriodo, textoValor } from './painel';

const snap = (p: Partial<Parameters<typeof montarLinhaIndicador>[1] & object> = {}) => ({
  periodo: '2026-11',
  numerador: 789,
  denominador: 1000,
  valor: 78.9,
  suprimido: false,
  ...p,
});
const meta = {
  linhaBase: 71.4,
  dataBase: '2025-11-01',
  meta: 85,
  metaTexto: null,
  prazo: '2028-12-31',
  versao: 1,
};

describe('linha do painel de controle externo', () => {
  it('rótulos de período e valores', () => {
    expect(rotuloPeriodo('2025-11-01')).toBe('nov/25');
    expect(rotuloPeriodo('2026-03')).toBe('mar/26');
    expect(rotuloPeriodo('2026-V2')).toBe('2ª vigência de 2026');
    expect(textoValor('VACINACAO_0_6', null)).toBe('—');
    expect(textoValor('VACINACAO_0_6', { valor: null, denominador: null, suprimido: true })).toBe(
      '< 5',
    );
    expect(textoValor('VACINACAO_0_6', { valor: null, denominador: 0, suprimido: false })).toBe(
      '—',
    );
    expect(textoValor('RELATORIOS_ENTREGUES', { valor: 1, denominador: 1, suprimido: false })).toBe(
      '1 de 1',
    );
    expect(
      textoValor('RELATORIOS_ENTREGUES', { valor: 0, denominador: null, suprimido: false }),
    ).toBe('0 de 0');
  });

  it('com meta cadastrada: base, atual, meta e situação', () => {
    const l = montarLinhaIndicador('VACINACAO_0_6', snap(), null, meta, '2026-11-18');
    expect(l).toMatchObject({
      objetivo: 'OE2',
      eixo: 'Primeira infância',
      linhaBase: '71,4% (nov/25)',
      atual: '78,9%',
      meta: '85%',
      situacao: 'EM_EVOLUCAO',
      rotuloSituacao: 'Em evolução',
    });
    expect(l.valores).toMatchObject({ linhaBase: 71.4, atual: 78.9, meta: 85, periodo: '2026-11' });
  });

  it('sem linha de base cadastrada usa o primeiro snapshot; texto da meta quando houver', () => {
    const l = montarLinhaIndicador(
      'PBF_SAUDE',
      snap(),
      snap({ periodo: '2026-V1', valor: 70 }),
      {
        ...meta,
        linhaBase: null,
        dataBase: null,
        meta: 72.3,
        metaTexto: 'Crescer por vigência',
        prazo: null,
      },
      '2026-11-18',
    );
    expect(l.linhaBase).toBe('70% (1ª vigência de 2026)');
    expect(l.meta).toBe('Crescer por vigência');
    expect(l.situacao).toBe('EM_DIA');
    // Primeiro snapshot = o atual: ainda não há linha de base.
    expect(montarLinhaIndicador('PBF_SAUDE', snap(), snap(), null, '2026-11-18').linhaBase).toBe(
      '—',
    );
    expect(montarLinhaIndicador('PBF_SAUDE', snap(), snap(), null, '2026-11-18').meta).toBe('—');
    expect(montarLinhaIndicador('PBF_SAUDE', snap(), snap(), null, '2026-11-18').situacao).toBe(
      'SEM_DADO',
    );
    expect(
      montarLinhaIndicador('PBF_SAUDE', snap(), null, { ...meta, dataBase: null }, '2026-11-18')
        .linhaBase,
    ).toBe('71,4%');
  });

  it('OE5: entregues de devidos; nenhum devido ainda = em dia', () => {
    const m = {
      ...meta,
      linhaBase: null,
      dataBase: null,
      meta: 1,
      metaTexto: 'Semestral',
      prazo: null,
    };
    const devido = montarLinhaIndicador(
      'RELATORIOS_ENTREGUES',
      snap({ numerador: 0, denominador: 1, valor: 0 }),
      null,
      m,
      '2026-11-18',
    );
    expect(devido).toMatchObject({ atual: '0 de 1', meta: 'Semestral', situacao: 'EM_EVOLUCAO' });
    const ok = montarLinhaIndicador(
      'RELATORIOS_ENTREGUES',
      snap({ numerador: 1, denominador: 1, valor: 1 }),
      null,
      m,
      '2026-11-18',
    );
    expect(ok.situacao).toBe('EM_DIA');
    const nenhum = montarLinhaIndicador(
      'RELATORIOS_ENTREGUES',
      snap({ numerador: 0, denominador: 0, valor: 0 }),
      null,
      m,
      '2026-11-18',
    );
    expect(nenhum.situacao).toBe('EM_DIA');
    const base = montarLinhaIndicador(
      'RELATORIOS_ENTREGUES',
      snap({ numerador: 1, denominador: 1, valor: 1 }),
      null,
      { ...m, linhaBase: 1 },
      '2026-11-18',
    );
    expect(base.linhaBase).toBe('1');
    expect(montarLinhaIndicador('RELATORIOS_ENTREGUES', null, null, null, '2026-11-18').atual).toBe(
      '—',
    );
  });

  it('suprimido e sem snapshot', () => {
    const s = montarLinhaIndicador(
      'CRECHE_0_3',
      snap({ suprimido: true, valor: null, numerador: null, denominador: null }),
      null,
      meta,
      '2026-11-18',
    );
    expect(s).toMatchObject({ atual: '< 5', situacao: 'SEM_DADO' });
    expect(s.valores.suprimido).toBe(true);
    const n = montarLinhaIndicador('CRECHE_0_3', null, null, meta, '2026-11-18');
    expect(n).toMatchObject({ atual: '—', situacao: 'SEM_DADO' });
    expect(n.valores).toMatchObject({ atual: null, periodo: null, suprimido: false });
  });
});
