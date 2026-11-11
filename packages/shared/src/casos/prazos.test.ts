import { describe, expect, it } from 'vitest';
import { LIMITES_BUSCA_ATIVA, PRAZO_PARECER_DIAS_UTEIS, prazoCaso } from './prazos';

describe('prazoCaso · busca ativa (§4.2)', () => {
  it('limites contados do alerta', () => {
    expect(LIMITES_BUSCA_ATIVA).toEqual({
      IDENTIFICADO: 5,
      ENCAMINHADO: 20,
      VISITA_REALIZADA: 30,
      NAO_LOCALIZADO: 30,
    });
  });

  it('com mais de 3 dias de folga: nível 0, no prazo', () => {
    expect(prazoCaso('BUSCA_ATIVA_ESCOLAR', 'ENCAMINHADO', 10)).toEqual({
      restante: 10,
      nivel: 0,
      rotulo: 'No prazo · 10 dias',
      tom: 'ok',
      concluido: false,
    });
  });

  it('faltando 3 dias ou menos: nível 1', () => {
    expect(prazoCaso('BUSCA_ATIVA_ESCOLAR', 'IDENTIFICADO', 2)).toMatchObject({
      restante: 3,
      nivel: 1,
      rotulo: 'Vence em 3 dias',
      tom: 'alerta',
    });
    expect(prazoCaso('BUSCA_ATIVA_ESCOLAR', 'IDENTIFICADO', 4)?.rotulo).toBe('Vence em 1 dia');
  });

  it('prazo vencendo hoje: restante 0, nível 1, "Vence hoje"', () => {
    expect(prazoCaso('BUSCA_ATIVA_ESCOLAR', 'IDENTIFICADO', 5)).toMatchObject({
      restante: 0,
      nivel: 1,
      rotulo: 'Vence hoje',
    });
  });

  it('vencido até 7 dias: nível 2, coordenação', () => {
    expect(prazoCaso('BUSCA_ATIVA_ESCOLAR', 'VISITA_REALIZADA', 31)).toMatchObject({
      restante: -1,
      nivel: 2,
      rotulo: 'Vencido · coordenação',
      tom: 'critico',
    });
    expect(prazoCaso('BUSCA_ATIVA_ESCOLAR', 'VISITA_REALIZADA', 37)?.nivel).toBe(2);
  });

  it('vencido há mais de 7 dias: nível 3, pauta do Comitê', () => {
    expect(prazoCaso('BUSCA_ATIVA_ESCOLAR', 'NAO_LOCALIZADO', 38)).toMatchObject({
      restante: -8,
      nivel: 3,
      rotulo: 'Escalonado ao Comitê',
    });
  });

  it('matriculado é caso concluído', () => {
    expect(prazoCaso('BUSCA_ATIVA_ESCOLAR', 'MATRICULADO', 100)).toEqual({
      restante: null,
      nivel: 0,
      rotulo: 'Concluído',
      tom: 'neutro',
      concluido: true,
    });
  });

  it('status de outro fluxo é erro', () => {
    expect(() => prazoCaso('BUSCA_ATIVA_ESCOLAR', 'NOVA', 1)).toThrow(RangeError);
  });
});

describe('prazoCaso · infrequência (§4.1, dias úteis)', () => {
  it('o parecer tem 5 dias úteis', () => {
    expect(PRAZO_PARECER_DIAS_UTEIS).toBe(5);
  });

  it('mesma escala da busca ativa, contada em dias úteis', () => {
    expect(prazoCaso('INFREQUENCIA', 'NOVA', 1)).toMatchObject({ restante: 4, nivel: 0 });
    expect(prazoCaso('INFREQUENCIA', 'EM_ANALISE', 2)).toMatchObject({ restante: 3, nivel: 1 });
    expect(prazoCaso('INFREQUENCIA', 'NOVA', 5)).toMatchObject({
      restante: 0,
      rotulo: 'Vence hoje',
    });
    expect(prazoCaso('INFREQUENCIA', 'NOVA', 12)).toMatchObject({ restante: -7, nivel: 2 });
    expect(prazoCaso('INFREQUENCIA', 'NOVA', 13)).toMatchObject({ restante: -8, nivel: 3 });
  });

  it('parecer emitido conclui o prazo', () => {
    expect(prazoCaso('INFREQUENCIA', 'PARECER_EMITIDO', 30)?.concluido).toBe(true);
  });

  it('status de busca ativa na infrequência é erro', () => {
    expect(() => prazoCaso('INFREQUENCIA', 'MATRICULADO', 1)).toThrow(RangeError);
  });
});

describe('prazoCaso · demais tipos e entradas inválidas', () => {
  it('tipos sem prazo definido na especificação devolvem null', () => {
    expect(prazoCaso('IDOSO_SEM_VISITA', 'NOVA', 3)).toBeNull();
    expect(prazoCaso('PRIMEIRA_INFANCIA_SEM_CUIDADO', 'NOVA', 3)).toBeNull();
    expect(prazoCaso('INCLUSAO_SEM_ATENDIMENTO', 'NOVA', 3)).toBeNull();
  });

  it('dias negativos ou fracionados são erro', () => {
    expect(() => prazoCaso('INFREQUENCIA', 'NOVA', -1)).toThrow(RangeError);
    expect(() => prazoCaso('INFREQUENCIA', 'NOVA', 1.5)).toThrow(RangeError);
  });
});
