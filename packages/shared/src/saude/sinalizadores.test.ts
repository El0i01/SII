import { describe, expect, it } from 'vitest';
import {
  calcularSinalizadores,
  converterMicroarea,
  type DadosSaudePec,
  diaDeTempo,
  idadeEm,
  tempoDeDia,
} from './sinalizadores';

const HOJE = '2026-11-13';

const cadastro = {
  cnes: '7327862',
  microarea: '04',
  acs: 'ACS Fictício',
  gestante: false,
  acamado: false,
  domiciliado: false,
  cronico: false,
};

function dados(p: Partial<DadosSaudePec> = {}): DadosSaudePec {
  return {
    nascimento: '1990-05-10',
    cadastro,
    microareaSii: 'area04',
    ultimaVisita: null,
    ultimoAtendimento: null,
    ultimaVacinaGripe: null,
    ...p,
  };
}

describe('datas do PEC', () => {
  it('co_dim_tempo AAAAMMDD vira data e volta', () => {
    expect(diaDeTempo(20261112)).toBe('2026-11-12');
    expect(diaDeTempo(null)).toBeNull();
    expect(diaDeTempo(0)).toBeNull();
    expect(diaDeTempo(20261340)).toBeNull();
    expect(tempoDeDia('2026-11-12')).toBe(20261112);
  });

  it('idade em anos completos, contando o aniversário', () => {
    expect(idadeEm('1966-11-13', HOJE)).toBe(60);
    expect(idadeEm('1966-11-14', HOJE)).toBe(59);
    expect(idadeEm('1966-12-01', HOJE)).toBe(59);
  });
});

describe('microárea do PEC → área do Geoportal', () => {
  const mapa = { '7327862/04': 'area04' };
  it('converte pelo CNES e número com dois dígitos', () => {
    expect(converterMicroarea('7327862', '4', mapa)).toBe('area04');
    expect(converterMicroarea('7327862', ' 04 ', mapa)).toBe('area04');
  });
  it('sem conversão ou sem dado → null', () => {
    expect(converterMicroarea('7327862', '05', mapa)).toBeNull();
    expect(converterMicroarea(null, '04', mapa)).toBeNull();
    expect(converterMicroarea('7327862', null, mapa)).toBeNull();
    expect(converterMicroarea('7327862', '  ', mapa)).toBeNull();
  });
});

describe('sinalizadores da §3.5', () => {
  it('copia UBS, ACS e última visita; microárea convertida tem prioridade sobre o número', () => {
    const s = calcularSinalizadores(dados({ ultimaVisita: '2026-10-01' }), HOJE);
    expect(s).toMatchObject({
      ubsCnes: '7327862',
      microarea: 'area04',
      acsResponsavel: 'ACS Fictício',
      ultimaVisitaAcs: '2026-10-01',
    });
    expect(calcularSinalizadores(dados({ microareaSii: null }), HOJE).microarea).toBe('04');
  });

  it('nunca calcula vacinação em dia, pré-natal ou atendimento especializado (regras pendentes)', () => {
    const s = calcularSinalizadores(dados({ cadastro: { ...cadastro, gestante: true } }), HOJE);
    expect(s.vacinacaoEmDia).toBeNull();
    expect(s.preNatalAdequado).toBeNull();
    expect(s.necessitaAtendimentoEspecializado).toBeNull();
  });

  it('acamado ou domiciliado', () => {
    expect(calcularSinalizadores(dados(), HOJE).acamadoDomiciliado).toBe(false);
    expect(
      calcularSinalizadores(dados({ cadastro: { ...cadastro, acamado: true } }), HOJE)
        .acamadoDomiciliado,
    ).toBe(true);
    expect(
      calcularSinalizadores(dados({ cadastro: { ...cadastro, domiciliado: true } }), HOJE)
        .acamadoDomiciliado,
    ).toBe(true);
  });

  it('crônica acompanhada = atendimento nos últimos 180 dias; sem crônica não se aplica', () => {
    const cronico = { ...cadastro, cronico: true };
    const em = (d: string | null) =>
      calcularSinalizadores(dados({ cadastro: cronico, ultimoAtendimento: d }), HOJE);
    expect(em('2026-05-17')).toMatchObject({
      condicaoCronica: true,
      condicaoCronicaAcompanhada: true,
    });
    expect(em('2026-05-16').condicaoCronicaAcompanhada).toBe(false);
    expect(em(null).condicaoCronicaAcompanhada).toBe(false);
    const s = calcularSinalizadores(dados({ ultimoAtendimento: '2026-11-01' }), HOJE);
    expect(s).toMatchObject({ condicaoCronica: false, condicaoCronicaAcompanhada: null });
  });

  it('vacina da gripe: só para 60 anos ou mais, dose nos últimos 12 meses', () => {
    const idoso = (v: string | null) =>
      calcularSinalizadores(dados({ nascimento: '1950-01-01', ultimaVacinaGripe: v }), HOJE)
        .vacinaGripeEmDia;
    expect(idoso('2025-11-13')).toBe(true);
    expect(idoso('2025-11-12')).toBe(false);
    expect(idoso(null)).toBe(false);
    expect(
      calcularSinalizadores(dados({ ultimaVacinaGripe: '2026-05-01' }), HOJE).vacinaGripeEmDia,
    ).toBeNull();
    expect(
      calcularSinalizadores(dados({ nascimento: null, ultimaVacinaGripe: '2026-05-01' }), HOJE)
        .vacinaGripeEmDia,
    ).toBeNull();
  });

  it('sem cadastro individual: só o que vem dos fatos, o resto fica sem informação', () => {
    const s = calcularSinalizadores(
      dados({ cadastro: null, microareaSii: null, ultimaVisita: '2026-09-09' }),
      HOJE,
    );
    expect(s).toMatchObject({
      ubsCnes: null,
      microarea: null,
      acsResponsavel: null,
      ultimaVisitaAcs: '2026-09-09',
      acamadoDomiciliado: null,
      condicaoCronica: null,
      condicaoCronicaAcompanhada: null,
    });
  });
});
