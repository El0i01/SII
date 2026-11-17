import { describe, expect, it } from 'vitest';
import { prazoHoje, subiuDeNivel, textoAviso } from './escalonamento';

describe('prazoHoje', () => {
  it('infrequência conta dias úteis com feriado (alerta 16/11, feriado 20/11)', () => {
    const caso = { tipo: 'INFREQUENCIA' as const, status: 'NOVA', alertaEm: '2026-11-16' };
    // 17, 18, 19, 23 = 4 dias úteis → falta 1 → nível 1.
    expect(prazoHoje(caso, '2026-11-23', ['2026-11-20'])?.nivel).toBe(1);
    // Sem o feriado seriam 5 dias úteis → vence hoje, ainda nível 1.
    expect(prazoHoje(caso, '2026-11-23')?.restante).toBe(0);
    // 13 dias úteis → vencido há 8 → Comitê.
    expect(prazoHoje(caso, '2026-12-03')?.nivel).toBe(3);
  });

  it('parecer emitido é concluído (nível 0)', () => {
    const caso = {
      tipo: 'INFREQUENCIA' as const,
      status: 'PARECER_EMITIDO',
      alertaEm: '2026-10-01',
    };
    expect(prazoHoje(caso, '2026-11-23')).toMatchObject({ nivel: 0, concluido: true });
  });

  it('busca ativa conta dias corridos pela etapa', () => {
    const caso = {
      tipo: 'BUSCA_ATIVA_ESCOLAR' as const,
      status: 'ENCAMINHADO',
      alertaEm: '2026-10-20',
    };
    expect(prazoHoje(caso, '2026-11-07')?.restante).toBe(2);
    expect(prazoHoje(caso, '2026-12-01')?.nivel).toBe(3);
    // Data de alerta no futuro não quebra: conta zero.
    expect(prazoHoje(caso, '2026-10-19')?.restante).toBe(20);
  });

  it('tipos sem prazo na especificação', () => {
    expect(
      prazoHoje({ tipo: 'IDOSO_SEM_VISITA', status: 'X', alertaEm: '2026-11-01' }, '2026-11-20'),
    ).toBeNull();
  });
});

describe('subiuDeNivel e textoAviso', () => {
  it('só sobe', () => {
    expect(subiuDeNivel(1, 2)).toBe(true);
    expect(subiuDeNivel(2, 2)).toBe(false);
    expect(subiuDeNivel(3, 0)).toBe(false);
  });

  it('texto leva só o código do caso', () => {
    expect(textoAviso('PARECER_EMITIDO', 'IF-2026-0123', 'Retorno à escola combinado')).toBe(
      'O CRAS emitiu o parecer do caso IF-2026-0123: Retorno à escola combinado.',
    );
    expect(textoAviso('PARECER_EMITIDO', 'IF-2026-0123')).toContain('IF-2026-0123.');
    for (const t of ['NIVEL_1', 'NIVEL_2', 'NIVEL_3', 'ENCAMINHAMENTO', 'IDENTIFICADO'] as const)
      expect(textoAviso(t, 'BA-2026-0301')).toContain('BA-2026-0301');
    expect(textoAviso('VISITA', 'BA-2026-0301', 'família não localizada')).toBe(
      'Visita registrada no caso BA-2026-0301: família não localizada.',
    );
    expect(textoAviso('VISITA', 'BA-2026-0301')).toBe('Visita registrada no caso BA-2026-0301.');
  });
});
