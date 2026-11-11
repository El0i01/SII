import { randomBytes } from 'node:crypto';
import {
  chaveDeHex,
  cifrar,
  decifrar,
  DocumentoInvalido,
  hashDocumento,
  normalizarDocumento,
  protegerDocumento,
  VERSAO_CIFRA,
} from './cifra';

const chave = randomBytes(32);
const hmac = randomBytes(32);
const CPF = '295.014.948-01';

describe('cifra de documentos', () => {
  it('volta ao original e grava versão | iv | tag | texto', () => {
    const c = cifrar('29501494801', chave);
    expect(c[0]).toBe(VERSAO_CIFRA);
    expect(c.length).toBe(1 + 12 + 16 + 11);
    expect(decifrar(c, chave)).toBe('29501494801');
  });

  it('o cifrado não contém os dígitos e muda a cada vez (IV aleatório)', () => {
    const a = cifrar('29501494801', chave);
    const b = cifrar('29501494801', chave);
    expect(a.equals(b)).toBe(false);
    expect(a.toString('latin1')).not.toContain('29501494801');
  });

  it('tag adulterada ou chave errada não decifram', () => {
    const c = cifrar('29501494801', chave);
    const adulterado = Buffer.from(c);
    adulterado[20] = (adulterado[20] as number) ^ 0xff;
    expect(() => decifrar(adulterado, chave)).toThrow();
    expect(() => decifrar(c, randomBytes(32))).toThrow();
    expect(() => decifrar(Buffer.from([9, 1, 2]), chave)).toThrow(/formato/);
  });

  it('hash: mesmo documento, mesmo hash, com ou sem pontuação', () => {
    expect(hashDocumento('CPF', CPF, hmac).equals(hashDocumento('CPF', '29501494801', hmac))).toBe(
      true,
    );
    expect(hashDocumento('CPF', CPF, hmac)).toHaveLength(32);
  });

  it('hash depende da chave e do tipo', () => {
    expect(hashDocumento('CPF', CPF, hmac).equals(hashDocumento('CPF', CPF, randomBytes(32)))).toBe(
      false,
    );
    expect(
      hashDocumento('CPF', '12345678901', hmac).equals(hashDocumento('NIS', '12345678901', hmac)),
    ).toBe(false);
  });

  it('valida o tamanho sem expor o valor', () => {
    expect(normalizarDocumento('CNS', '700 0000 0000 0001')).toBe('700000000000001');
    try {
      normalizarDocumento('CPF', '123.456');
      throw new Error('deveria falhar');
    } catch (e) {
      expect(e).toBeInstanceOf(DocumentoInvalido);
      expect((e as Error).message).toBe('CPF inválido');
    }
  });

  it('protegerDocumento devolve cifrado e hash coerentes', () => {
    const p = protegerDocumento('CPF', CPF, { cifra: chave, hmac });
    expect(decifrar(p.cifrado, chave)).toBe('29501494801');
    expect(p.hash.equals(hashDocumento('CPF', CPF, hmac))).toBe(true);
  });

  it('chave precisa ser 32 bytes em hex', () => {
    expect(chaveDeHex('ab'.repeat(32), 'X')).toHaveLength(32);
    expect(() => chaveDeHex('curta', 'CHAVE_CIFRA')).toThrow(/CHAVE_CIFRA/);
  });
});
