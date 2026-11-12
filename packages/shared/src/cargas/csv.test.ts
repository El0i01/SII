import { describe, expect, it } from 'vitest';
import { decodificar, detectarSeparador, lerCsv } from './csv';

const latin1 = (s: string) => Uint8Array.from([...s].map((c) => c.charCodeAt(0)));

describe('decodificar', () => {
  it('UTF-8 com e sem BOM', () => {
    const utf8 = new TextEncoder().encode('João;Conceição');
    expect(decodificar(utf8)).toEqual({ texto: 'João;Conceição', codificacao: 'utf-8' });
    const bom = Uint8Array.from([0xef, 0xbb, 0xbf, ...utf8]);
    expect(decodificar(bom).texto).toBe('João;Conceição');
  });

  it('Windows-1252 quando não é UTF-8 válido', () => {
    expect(decodificar(latin1('João;Conceição'))).toEqual({
      texto: 'João;Conceição',
      codificacao: 'windows-1252',
    });
  });
});

describe('detectarSeparador', () => {
  it('escolhe o mais frequente fora de aspas', () => {
    expect(detectarSeparador('a;b;c')).toBe(';');
    expect(detectarSeparador('a,b,c')).toBe(',');
    expect(detectarSeparador('a\tb')).toBe('\t');
    expect(detectarSeparador('a|b|c')).toBe('|');
    expect(detectarSeparador('"x,y,z";b;c')).toBe(';');
  });

  it('empate fica com ;, e sem separador devolve null', () => {
    expect(detectarSeparador('a;b,c')).toBe(';');
    expect(detectarSeparador('coluna_unica')).toBeNull();
  });
});

describe('lerCsv', () => {
  it('lê linhas com número, pula vazias e aceita CRLF', () => {
    expect(lerCsv('a;b\r\n1;2\r\n\r\n3;4', ';')).toEqual([
      { numero: 1, campos: ['a', 'b'] },
      { numero: 2, campos: ['1', '2'] },
      { numero: 4, campos: ['3', '4'] },
    ]);
  });

  it('aspas, aspas duplicadas e quebra dentro de aspas', () => {
    const linhas = lerCsv('a,b\n"x, ""y""","linha\nquebrada"\n5,6\n', ',');
    expect(linhas[1]).toEqual({ numero: 2, campos: ['x, "y"', 'linha\nquebrada'] });
    expect(linhas[2]).toEqual({ numero: 4, campos: ['5', '6'] });
  });

  it('última linha sem quebra e campo vazio no fim', () => {
    expect(lerCsv('a;b\n1;', ';')).toEqual([
      { numero: 1, campos: ['a', 'b'] },
      { numero: 2, campos: ['1', ''] },
    ]);
  });
});
