import { describe, expect, it } from 'vitest';
import { contarFaltasSeguidas } from './frequencia';
import {
  decidirInfrequencia,
  faltasDoMotivo,
  motivoInfrequencia,
  referenciaInfrequencia,
} from './infrequencia';

describe('decidirInfrequencia', () => {
  it('cria caso com 5 faltas seguidas e nenhum caso aberto', () => {
    expect(decidirInfrequencia({ faltasSeguidas: 5, casoAberto: null })).toBe('CRIAR');
  });

  it('não faz nada abaixo de 5 faltas, com ou sem caso aberto', () => {
    expect(decidirInfrequencia({ faltasSeguidas: 4, casoAberto: null })).toBe('NADA');
    expect(decidirInfrequencia({ faltasSeguidas: 0, casoAberto: { faltasNoMotivo: 6 } })).toBe(
      'NADA',
    );
  });

  it('com caso aberto, só atualiza o motivo quando o número mudou (5 → 7)', () => {
    expect(decidirInfrequencia({ faltasSeguidas: 7, casoAberto: { faltasNoMotivo: 5 } })).toBe(
      'ATUALIZAR',
    );
    expect(decidirInfrequencia({ faltasSeguidas: 5, casoAberto: { faltasNoMotivo: 5 } })).toBe(
      'NADA',
    );
  });

  it('caso anterior encerrado não conta como aberto: reabre na hora (decisão de 17/11/2026)', () => {
    // Quem chama passa casoAberto = null quando o último caso já foi encerrado.
    expect(decidirInfrequencia({ faltasSeguidas: 8, casoAberto: null })).toBe('CRIAR');
  });

  it('motivo sem número legível é atualizado', () => {
    expect(decidirInfrequencia({ faltasSeguidas: 6, casoAberto: { faltasNoMotivo: null } })).toBe(
      'ATUALIZAR',
    );
  });
});

describe('motivoInfrequencia e faltasDoMotivo', () => {
  it('monta o texto do seed e lê o número de volta', () => {
    expect(motivoInfrequencia(6)).toBe('6 dias letivos seguidos sem frequência');
    expect(faltasDoMotivo(motivoInfrequencia(12))).toBe(12);
    expect(faltasDoMotivo('Encaminhado pela escola')).toBeNull();
  });
});

describe('referenciaInfrequencia', () => {
  const letivos = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-23'];

  it('é o último dia letivo antes de hoje (o dia corrente pode não estar lançado)', () => {
    expect(referenciaInfrequencia(letivos, '2026-11-19')).toBe('2026-11-18');
  });

  it('pula o feriado e o fim de semana (20/11 não está no calendário)', () => {
    expect(referenciaInfrequencia(letivos, '2026-11-23')).toBe('2026-11-19');
  });

  it('sem dia letivo anterior devolve null', () => {
    expect(referenciaInfrequencia(letivos, '2026-11-16')).toBeNull();
    expect(referenciaInfrequencia([], '2026-11-16')).toBeNull();
  });
});

describe('feriado no meio das 5 faltas', () => {
  it('não notifica com 4 letivos de falta + feriado; notifica no 5º letivo', () => {
    // 20/11 é feriado (fora do calendário): faltas em 17, 18, 19, 23 = 4.
    const letivos = [
      '2026-11-16',
      '2026-11-17',
      '2026-11-18',
      '2026-11-19',
      '2026-11-23',
      '2026-11-24',
    ];
    const freq = [
      { data: '2026-11-16', situacao: 'PRESENTE' as const },
      { data: '2026-11-17', situacao: 'FALTA' as const },
      { data: '2026-11-18', situacao: 'FALTA' as const },
      { data: '2026-11-19', situacao: 'FALTA' as const },
      { data: '2026-11-20', situacao: 'FALTA' as const },
      { data: '2026-11-23', situacao: 'FALTA' as const },
    ];
    const ref1 = referenciaInfrequencia(letivos, '2026-11-24') as string;
    const n1 = contarFaltasSeguidas(freq, letivos, ref1);
    expect(n1).toBe(4);
    expect(decidirInfrequencia({ faltasSeguidas: n1, casoAberto: null })).toBe('NADA');

    const freq2 = [...freq, { data: '2026-11-24', situacao: 'FALTA' as const }];
    const n2 = contarFaltasSeguidas(freq2, letivos, '2026-11-24');
    expect(decidirInfrequencia({ faltasSeguidas: n2, casoAberto: null })).toBe('CRIAR');
  });
});
