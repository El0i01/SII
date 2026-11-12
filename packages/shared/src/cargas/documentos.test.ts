import { describe, expect, it } from 'vitest';
import { lerData, lerDecimal, normalizarCpf, normalizarNis } from './documentos';

describe('normalizarCpf', () => {
  it('aceita com e sem máscara e confere o DV', () => {
    expect(normalizarCpf('529.982.247-25')).toBe('52998224725');
    expect(normalizarCpf('52998224725')).toBe('52998224725');
    expect(normalizarCpf('52998224724')).toBeNull();
  });

  it('completa os zeros que o Excel tira', () => {
    // 012.345.678-90 é válido
    expect(normalizarCpf('1234567890')).toBe('01234567890');
  });

  it('vazio, longo demais e dígitos repetidos são inválidos', () => {
    expect(normalizarCpf('')).toBeNull();
    expect(normalizarCpf(null)).toBeNull();
    expect(normalizarCpf(undefined)).toBeNull();
    expect(normalizarCpf('123456789012')).toBeNull();
    expect(normalizarCpf('111.111.111-11')).toBeNull();
  });
});

describe('normalizarNis', () => {
  it('confere o DV do PIS/NIS', () => {
    expect(normalizarNis('123.45678.90-0')).toBe('12345678900');
    expect(normalizarNis('12034567899')).toBe('12034567899');
    expect(normalizarNis('12345678901')).toBeNull();
  });

  it('completa zeros à esquerda', () => {
    expect(normalizarNis('123456789')).toBe('00123456789');
  });

  it('vazio, longo e repetido são inválidos', () => {
    expect(normalizarNis('')).toBeNull();
    expect(normalizarNis(undefined)).toBeNull();
    expect(normalizarNis('123456789012')).toBeNull();
    expect(normalizarNis('00000000000')).toBeNull();
  });
});

describe('lerData', () => {
  it('formatos do CECAD e do Portal', () => {
    expect(lerData('05/03/2019')).toBe('2019-03-05');
    expect(lerData('05032019')).toBe('2019-03-05');
    expect(lerData('2019-03-05')).toBe('2019-03-05');
    expect(lerData('2019-03-05 00:00:00')).toBe('2019-03-05');
  });

  it('data impossível ou vazia é null', () => {
    expect(lerData('31/02/2019')).toBeNull();
    expect(lerData('')).toBeNull();
    expect(lerData(null)).toBeNull();
    expect(lerData('ontem')).toBeNull();
  });
});

describe('lerDecimal', () => {
  it('vírgula decimal, milhar com ponto, ponto decimal e R$', () => {
    expect(lerDecimal('1.234,56')).toBe(1234.56);
    expect(lerDecimal('218,00')).toBe(218);
    expect(lerDecimal('150.5')).toBe(150.5);
    expect(lerDecimal('R$ 90')).toBe(90);
  });

  it('vazio ou texto é null', () => {
    expect(lerDecimal('')).toBeNull();
    expect(lerDecimal(undefined)).toBeNull();
    expect(lerDecimal('abc')).toBeNull();
  });
});
