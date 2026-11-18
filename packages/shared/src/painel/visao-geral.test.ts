import { describe, expect, it } from 'vitest';
import {
  ehMes,
  fimDoMes,
  FiltroPainel,
  mesesAte,
  percentual,
  periodosDisponiveis,
  precisaDeAtencao,
  rotuloMes,
  rotuloMesCurto,
  serieCasosPorMes,
  somarMeses,
} from './visao-geral';

describe('meses', () => {
  it('rótulos, soma e intervalo', () => {
    expect(ehMes('2026-10')).toBe(true);
    expect(ehMes('2026-13')).toBe(false);
    expect(rotuloMes('2026-10')).toBe('Outubro de 2026');
    expect(rotuloMesCurto('2026-03')).toBe('mar/26');
    expect(somarMeses('2026-11', 2)).toBe('2027-01');
    expect(somarMeses('2026-01', -1)).toBe('2025-12');
    expect(mesesAte('2026-02', 3)).toEqual(['2025-12', '2026-01', '2026-02']);
    expect(mesesAte('2026-10')).toHaveLength(12);
    expect(periodosDisponiveis('2026-11-18', 3)).toEqual(['2026-11', '2026-10', '2026-09']);
    expect(fimDoMes('2026-02')).toBe('2026-02-28');
    expect(fimDoMes('2026-12')).toBe('2026-12-31');
  });
  it('filtro do painel', () => {
    expect(FiltroPainel.parse({ territorio: 'S03', periodo: '2026-10' })).toEqual({
      territorio: 'S03',
      periodo: '2026-10',
    });
    expect(FiltroPainel.safeParse({ territorio: 's 3' }).success).toBe(false);
    expect(FiltroPainel.safeParse({ periodo: '2026-1' }).success).toBe(false);
  });
});

describe('serieCasosPorMes', () => {
  it('abertos no fim do mês e resolvidos no mês', () => {
    const s = serieCasosPorMes(
      [
        { alertaEm: '2026-08-10', encerradoEm: null },
        { alertaEm: '2026-08-20', encerradoEm: '2026-09-05' },
        { alertaEm: '2026-09-30', encerradoEm: '2026-09-30' },
        { alertaEm: '2026-10-01', encerradoEm: null },
      ],
      '2026-10',
      3,
    );
    expect(s).toEqual([
      { mes: '2026-08', abertos: 2, resolvidos: 0 },
      { mes: '2026-09', abertos: 1, resolvidos: 2 },
      { mes: '2026-10', abertos: 2, resolvidos: 0 },
    ]);
  });
});

describe('percentual', () => {
  it('inteiro; sem base, null', () => {
    expect(percentual(1, 3)).toBe(33);
    expect(percentual(0, 0)).toBeNull();
  });
});

describe('precisaDeAtencao', () => {
  it('na ordem de gravidade, com plural', () => {
    const itens = precisaDeAtencao({
      hoje: '2026-11-18',
      cargasComFalha: 2,
      notificacoesAguardando: 1,
      escalonados: 3,
      ultimaSeduc: '2026-08-01',
    });
    expect(itens.map((i) => [i.tom, i.titulo])).toEqual([
      ['critico', '2 cargas falharam'],
      ['critico', '3 casos escalonados ao Comitê Gestor'],
      ['alerta', '1 notificação aguardando parecer da Assistência'],
      ['info', 'Matrículas estaduais desatualizadas'],
    ]);
    expect(itens[3]?.detalhe).toBe('Última lista da SEDUC-RO há 109 dias');
  });
  it('singular, sem SEDUC e tudo em dia', () => {
    const itens = precisaDeAtencao({
      hoje: '2026-11-18',
      cargasComFalha: 1,
      notificacoesAguardando: 2,
      escalonados: 1,
      ultimaSeduc: null,
    });
    expect(itens.map((i) => i.titulo)).toEqual([
      '1 carga falhou',
      '1 caso escalonado ao Comitê Gestor',
      '2 notificações aguardando parecer da Assistência',
      'Matrículas estaduais desatualizadas',
    ]);
    expect(itens[3]?.detalhe).toBe('Nenhuma lista da SEDUC-RO recebida');
    expect(
      precisaDeAtencao({
        hoje: '2026-11-18',
        cargasComFalha: null,
        notificacoesAguardando: 0,
        escalonados: 0,
        ultimaSeduc: '2026-11-01',
      }),
    ).toEqual([]);
  });
});
