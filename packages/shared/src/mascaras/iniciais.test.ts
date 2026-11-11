import { describe, expect, it } from 'vitest';
import { iniciais } from './iniciais';

describe('iniciais (ESPECIFICACAO §4.5: nome em iniciais nas listas)', () => {
  it('usa a inicial de cada parte do nome, com ponto', () => {
    expect(iniciais('Maria Silva Oliveira')).toBe('M. S. O.');
  });

  it('ignora partículas (de, da, do, dos, das, e)', () => {
    expect(iniciais('João da Costa e Souza dos Santos')).toBe('J. C. S. S.');
  });

  it('normaliza espaços e caixa, mantendo acentos', () => {
    expect(iniciais('  ângela   de  oliveira ')).toBe('Â. O.');
  });

  it('nome vazio vira travessão', () => {
    expect(iniciais('')).toBe('—');
    expect(iniciais('   ')).toBe('—');
  });
});
