import { describe, expect, it } from 'vitest';
import { codigoVerificador, normalizarCodigoVerificador } from './verificador';

const HASH = 'd0c59015dffa11940239d57a72588b22248ee127cfd5d99edc4f8fa1ae13129a';

describe('código verificador da trilha', () => {
  it('são os 12 primeiros caracteres do hash, em 3 grupos maiúsculos', () => {
    expect(codigoVerificador(HASH)).toBe('D0C5-9015-DFFA');
    expect(codigoVerificador(`\\x${HASH}`)).toBe('D0C5-9015-DFFA');
  });

  it('aceita bytes', () => {
    expect(codigoVerificador(Uint8Array.from(Buffer.from(HASH, 'hex')))).toBe('D0C5-9015-DFFA');
  });

  it('hash curto ou inválido é erro', () => {
    expect(() => codigoVerificador('abc')).toThrow(RangeError);
    expect(() => codigoVerificador('z'.repeat(64))).toThrow(RangeError);
  });

  it('normaliza o que a pessoa digita para conferir', () => {
    expect(normalizarCodigoVerificador(' d0c5 9015-dffa ')).toBe('D0C5-9015-DFFA');
    expect(normalizarCodigoVerificador('D0C5-9015')).toBeNull();
  });
});
