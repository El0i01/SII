import { describe, expect, it } from 'vitest';
import { mascararCpf, mascararNis, somenteDigitos } from './documentos';

describe('máscaras (§4.5)', () => {
  it('somente dígitos', () => {
    expect(somenteDigitos('123.456.789-01')).toBe('12345678901');
  });

  it('CPF mostra só o 4º ao 9º dígito: ***.456.789-**', () => {
    expect(mascararCpf('12345678901')).toBe('***.456.789-**');
    expect(mascararCpf('123.456.789-01')).toBe('***.456.789-**');
  });

  it('NIS mostra o 4º ao 7º dígito: ***.4567*.**-* (decisão de 11/11/2026)', () => {
    expect(mascararNis('12345678901')).toBe('***.4567*.**-*');
    expect(mascararNis('123.45678.90-1')).toBe('***.4567*.**-*');
  });

  it('entrada com tamanho errado vira máscara cheia, sem vazar dígito', () => {
    expect(mascararCpf('123456')).toBe('***.***.***-**');
    expect(mascararCpf('')).toBe('***.***.***-**');
    expect(mascararNis('1234567890123')).toBe('***.*****.**-*');
  });
});
