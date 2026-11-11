import {
  avaliarRefresh,
  gerarTokenOpaco,
  hashToken,
  pareceTokenOpaco,
  validadeRefreshMs,
} from './tokens';

describe('tokens', () => {
  it('gera token opaco de 256 bits em base64url, sempre diferente', () => {
    const a = gerarTokenOpaco();
    const b = gerarTokenOpaco();
    expect(a).toHaveLength(43);
    expect(pareceTokenOpaco(a)).toBe(true);
    expect(a).not.toBe(b);
  });

  it('o hash é sha256 hex e determinístico', () => {
    const t = gerarTokenOpaco();
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t)).not.toContain(t);
  });

  it('recusa valores que não têm o formato do token', () => {
    expect(pareceTokenOpaco('')).toBe(false);
    expect(pareceTokenOpaco('a'.repeat(42))).toBe(false);
    expect(pareceTokenOpaco("x' OR 1=1 --".padEnd(43, 'x'))).toBe(false);
    expect(pareceTokenOpaco(undefined)).toBe(false);
  });

  it('web dura 12 h e celular 7 dias', () => {
    const cfg = { horasWeb: 12, diasMobile: 7 };
    expect(validadeRefreshMs('WEB', cfg)).toBe(12 * 3_600_000);
    expect(validadeRefreshMs('MOBILE', cfg)).toBe(7 * 86_400_000);
  });

  describe('avaliarRefresh', () => {
    const agora = new Date('2026-11-11T12:00:00Z');
    const futuro = new Date(agora.getTime() + 60_000);

    it('válido quando não foi usado, nem revogado, nem venceu', () => {
      expect(avaliarRefresh({ expiraEm: futuro, usadoEm: null, revogadoEm: null }, agora)).toBe(
        'VALIDO',
      );
    });

    it('reuso quando já foi usado', () => {
      expect(avaliarRefresh({ expiraEm: futuro, usadoEm: agora, revogadoEm: null }, agora)).toBe(
        'REUSO',
      );
    });

    it('reuso quando foi revogado', () => {
      expect(avaliarRefresh({ expiraEm: futuro, usadoEm: null, revogadoEm: agora }, agora)).toBe(
        'REUSO',
      );
    });

    it('expirado no instante exato do vencimento', () => {
      expect(avaliarRefresh({ expiraEm: agora, usadoEm: null, revogadoEm: null }, agora)).toBe(
        'EXPIRADO',
      );
    });

    it('reuso tem precedência sobre expiração', () => {
      const passado = new Date(agora.getTime() - 1);
      expect(avaliarRefresh({ expiraEm: passado, usadoEm: passado, revogadoEm: null }, agora)).toBe(
        'REUSO',
      );
    });
  });
});
