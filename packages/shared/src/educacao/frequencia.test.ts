import { describe, expect, it } from 'vitest';
import {
  contarFaltasSeguidas,
  deveNotificarInfrequencia,
  LIMITE_FALTAS_SEGUIDAS,
} from './frequencia';

// Novembro/2026: dias letivos de seg a sex; 20/11 (sexta) é feriado e NÃO está no calendário.
const LETIVOS = [
  '2026-11-09',
  '2026-11-10',
  '2026-11-11',
  '2026-11-12',
  '2026-11-13',
  '2026-11-16',
  '2026-11-17',
  '2026-11-18',
  '2026-11-19',
  '2026-11-23',
  '2026-11-24',
];

const f = (data: string, situacao: 'PRESENTE' | 'FALTA' | 'JUSTIFICADA') => ({ data, situacao });

describe('contarFaltasSeguidas', () => {
  it('conta as faltas seguidas até o último dia letivo', () => {
    const freq = [
      f('2026-11-16', 'PRESENTE'),
      f('2026-11-17', 'FALTA'),
      f('2026-11-18', 'FALTA'),
      f('2026-11-19', 'FALTA'),
      f('2026-11-23', 'FALTA'),
      f('2026-11-24', 'FALTA'),
    ];
    expect(contarFaltasSeguidas(freq, LETIVOS)).toBe(5);
    expect(deveNotificarInfrequencia(freq, LETIVOS)).toBe(true);
  });

  it('feriado no meio das 5 faltas não quebra a sequência', () => {
    // 19/11 (qui) falta, 20/11 feriado, 23 e 24 faltas, 17 e 18 faltas → 5 seguidas
    const freq = ['2026-11-17', '2026-11-18', '2026-11-19', '2026-11-23', '2026-11-24'].map((d) =>
      f(d, 'FALTA'),
    );
    expect(contarFaltasSeguidas(freq, LETIVOS)).toBe(5);
  });

  it('frequência lançada em dia que não é letivo é ignorada', () => {
    const freq = [
      f('2026-11-19', 'FALTA'),
      f('2026-11-20', 'PRESENTE'), // feriado: não conta e não quebra
      f('2026-11-23', 'FALTA'),
      f('2026-11-24', 'FALTA'),
    ];
    expect(contarFaltasSeguidas(freq, LETIVOS)).toBe(3);
  });

  it('falta justificada quebra a sequência', () => {
    const freq = [
      f('2026-11-17', 'FALTA'),
      f('2026-11-18', 'FALTA'),
      f('2026-11-19', 'JUSTIFICADA'),
      f('2026-11-23', 'FALTA'),
      f('2026-11-24', 'FALTA'),
    ];
    expect(contarFaltasSeguidas(freq, LETIVOS)).toBe(2);
    expect(deveNotificarInfrequencia(freq, LETIVOS)).toBe(false);
  });

  it('dia letivo sem lançamento quebra a sequência (decisão de 11/11/2026)', () => {
    const freq = [
      f('2026-11-16', 'FALTA'),
      f('2026-11-17', 'FALTA'),
      f('2026-11-18', 'FALTA'),
      // 19/11 sem lançamento
      f('2026-11-23', 'FALTA'),
      f('2026-11-24', 'FALTA'),
    ];
    expect(contarFaltasSeguidas(freq, LETIVOS)).toBe(2);
  });

  it('usa a data de referência e ignora o que vem depois dela', () => {
    const freq = LETIVOS.map((d) => f(d, 'FALTA'));
    expect(contarFaltasSeguidas(freq, LETIVOS, '2026-11-13')).toBe(5);
    // Referência num feriado: conta a partir do último letivo antes dele.
    expect(contarFaltasSeguidas(freq, LETIVOS, '2026-11-20')).toBe(9);
  });

  it('presença no último dia zera; sem calendário ou sem frequência dá 0', () => {
    expect(contarFaltasSeguidas([f('2026-11-24', 'PRESENTE')], LETIVOS)).toBe(0);
    expect(contarFaltasSeguidas([], LETIVOS)).toBe(0);
    expect(contarFaltasSeguidas([f('2026-11-24', 'FALTA')], [])).toBe(0);
  });

  it('o calendário pode vir fora de ordem e com dias repetidos', () => {
    const freq = ['2026-11-23', '2026-11-24'].map((d) => f(d, 'FALTA'));
    expect(
      contarFaltasSeguidas(freq, ['2026-11-24', '2026-11-19', '2026-11-23', '2026-11-24']),
    ).toBe(2);
  });

  it('o gatilho é de 5 faltas', () => {
    expect(LIMITE_FALTAS_SEGUIDAS).toBe(5);
    const quatro = ['2026-11-18', '2026-11-19', '2026-11-23', '2026-11-24'].map((d) =>
      f(d, 'FALTA'),
    );
    expect(deveNotificarInfrequencia(quatro, LETIVOS)).toBe(false);
  });
});
