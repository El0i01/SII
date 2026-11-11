import { describe, expect, it } from 'vitest';
import { gerarDiasLetivos, ParametrosCalendario } from './letivos';

const base = {
  inicio: '2026-11-09',
  fim: '2026-11-27',
  recessos: [],
  feriados: [],
  letivosExtras: [],
};

describe('gerarDiasLetivos', () => {
  it('segunda a sexta entre início e fim, inclusive', () => {
    const d = gerarDiasLetivos(base);
    expect(d).toHaveLength(15);
    expect(d[0]).toBe('2026-11-09');
    expect(d.at(-1)).toBe('2026-11-27');
    expect(d).not.toContain('2026-11-14'); // sábado
  });

  it('feriado e recesso saem; sábado letivo extra entra', () => {
    const d = gerarDiasLetivos({
      ...base,
      feriados: ['2026-11-20'],
      recessos: [{ inicio: '2026-11-23', fim: '2026-11-24' }],
      letivosExtras: ['2026-11-14'],
    });
    expect(d).not.toContain('2026-11-20');
    expect(d).not.toContain('2026-11-23');
    expect(d).not.toContain('2026-11-24');
    expect(d).toContain('2026-11-14');
    expect(d).toHaveLength(15 - 3 + 1);
  });

  it('dia extra fora do período é ignorado; resultado sem repetição e em ordem', () => {
    const d = gerarDiasLetivos({
      ...base,
      letivosExtras: ['2026-12-05', '2026-11-14', '2026-11-14'],
    });
    expect(d).not.toContain('2026-12-05');
    expect(d.filter((x) => x === '2026-11-14')).toHaveLength(1);
    expect([...d].sort()).toEqual(d);
  });
});

describe('ParametrosCalendario', () => {
  it('aceita parâmetros válidos e completa listas vazias', () => {
    expect(ParametrosCalendario.parse({ inicio: '2026-02-09', fim: '2026-12-18' })).toEqual({
      inicio: '2026-02-09',
      fim: '2026-12-18',
      recessos: [],
      feriados: [],
      letivosExtras: [],
    });
  });

  it('fim antes do início, recesso invertido e data inválida são recusados', () => {
    const campos = (v: unknown) => {
      const r = ParametrosCalendario.safeParse(v);
      return r.success ? [] : r.error.issues.map((i) => i.path.join('.'));
    };
    expect(campos({ inicio: '2026-12-18', fim: '2026-02-09' })).toEqual(['fim']);
    expect(campos({ ...base, recessos: [{ inicio: '2026-07-24', fim: '2026-07-06' }] })).toEqual([
      'recessos.0.fim',
    ]);
    expect(campos({ ...base, feriados: ['2026-02-30'] })).toEqual(['feriados.0']);
  });

  it('o ano letivo cabe num ano civil', () => {
    const r = ParametrosCalendario.safeParse({ inicio: '2026-02-09', fim: '2027-01-10' });
    expect(r.success).toBe(false);
  });
});
