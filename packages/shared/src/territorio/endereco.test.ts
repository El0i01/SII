import { describe, expect, it } from 'vitest';
import { normalizarEndereco } from './endereco';

describe('normalizarEndereco', () => {
  it('maiúsculas, sem acento e com abreviações expandidas', () => {
    expect(normalizarEndereco('R. José Silvestre, 120')).toBe('RUA JOSE SILVESTRE 120');
    expect(normalizarEndereco('Av. Presidente Médici')).toBe('AVENIDA PRESIDENTE MEDICI');
    expect(normalizarEndereco('tv  das Flores')).toBe('TRAVESSA DAS FLORES');
    expect(normalizarEndereco('Ln C-10, km 4')).toBe('LINHA C 10 KM 4');
  });

  it('não expande abreviação no meio do nome', () => {
    expect(normalizarEndereco('Rua R. Barbosa')).toBe('RUA R BARBOSA');
  });

  it('vazio continua vazio', () => {
    expect(normalizarEndereco('  ')).toBe('');
  });
});
