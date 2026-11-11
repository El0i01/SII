import { validarEnv } from './env';

const valido = {
  DATABASE_URL: 'postgresql://sii:segredo-123@localhost:5444/sii',
  REDIS_URL: 'redis://:segredo-456@localhost:6390/0',
};

describe('validarEnv', () => {
  it('aplica os padrões', () => {
    const env = validarEnv(valido);
    expect(env.API_PORTA).toBe(3333);
    expect(env.NODE_ENV).toBe('development');
  });

  it('converte a porta para número', () => {
    expect(validarEnv({ ...valido, API_PORTA: '4000' }).API_PORTA).toBe(4000);
  });

  it('recusa DATABASE_URL ausente citando a variável', () => {
    expect(() => validarEnv({ REDIS_URL: valido.REDIS_URL })).toThrow(/DATABASE_URL/);
  });

  it('nunca expõe o valor (senha) na mensagem de erro', () => {
    try {
      validarEnv({ ...valido, DATABASE_URL: 'mysql://root:segredo-123@x/y' });
      throw new Error('deveria ter falhado');
    } catch (e) {
      expect((e as Error).message).toMatch(/DATABASE_URL/);
      expect((e as Error).message).not.toMatch(/segredo-123/);
    }
  });
});
