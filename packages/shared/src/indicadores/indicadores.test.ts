import { describe, expect, it } from 'vitest';
import {
  converterDespesa,
  lerDespesas,
  lerPrograma,
  lerValorReais,
  PROGRAMAS,
  somarDespesas,
  urlConsulta,
  type ContratoTransparencia,
} from './despesa';
import {
  AcessosPorCpf,
  calcularSnapshot,
  CODIGOS_INDICADOR,
  cumpreFrequenciaPbf,
  ehSemestre,
  indicadorDePessoas,
  encaminhadoNoPrazo,
  INDICADORES,
  intervaloSemestre,
  MetaIndicador,
  periodoMensal,
  ROTULO_SITUACAO_INDICADOR,
  rotuloSemestre,
  semestre,
  semestresAte,
  situacaoIndicador,
  TOM_SITUACAO_INDICADOR,
  unidadeIndicador,
  VerificarTrilha,
  vigenciaPbf,
} from './indicadores';

describe('indicadores OE1 a OE6', () => {
  it('tem os 8 indicadores do protótipo, de OE1 a OE6', () => {
    expect(INDICADORES).toHaveLength(8);
    expect(new Set(INDICADORES.map((i) => i.objetivo))).toEqual(
      new Set(['OE1', 'OE2', 'OE3', 'OE4', 'OE5', 'OE6']),
    );
    expect(CODIGOS_INDICADOR).toContain('PBF_SAUDE');
    expect(unidadeIndicador('RELATORIOS_ENTREGUES')).toBe('contagem');
    expect(unidadeIndicador('CRECHE_0_3')).toBe('%');
    expect(indicadorDePessoas('CRECHE_0_3')).toBe(true);
    expect(indicadorDePessoas('ACESSOS_REGISTRADOS')).toBe(false);
  });

  it('snapshot com supressão de 1 a 4', () => {
    expect(calcularSnapshot(30, 40)).toEqual({
      numerador: 30,
      denominador: 40,
      valor: 75,
      suprimido: false,
    });
    expect(calcularSnapshot(2, 40)).toEqual({
      numerador: null,
      denominador: null,
      valor: null,
      suprimido: true,
    });
    expect(calcularSnapshot(0, 3).suprimido).toBe(true);
    expect(calcularSnapshot(0, 0)).toEqual({
      numerador: 0,
      denominador: 0,
      valor: null,
      suprimido: false,
    });
    expect(calcularSnapshot(0, 10).valor).toBe(0);
    expect(calcularSnapshot(1, 3, 'contagem')).toEqual({
      numerador: 1,
      denominador: 3,
      valor: 1,
      suprimido: false,
    });
    expect(calcularSnapshot(2, 3).suprimido).toBe(true);
    expect(calcularSnapshot(2, 3, '%', false)).toEqual({
      numerador: 2,
      denominador: 3,
      valor: 66.7,
      suprimido: false,
    });
    expect(calcularSnapshot(789, 1000).valor).toBe(78.9);
    expect(() => calcularSnapshot(5, 4)).toThrow(RangeError);
    expect(() => calcularSnapshot(-1, 4)).toThrow(RangeError);
  });

  it('período, vigência e semestre', () => {
    expect(periodoMensal('2026-11-18')).toBe('2026-11');
    expect(vigenciaPbf('2026-06-30')).toBe('2026-V1');
    expect(vigenciaPbf('2026-07-01')).toBe('2026-V2');
    expect(semestre('2026-11-18')).toBe('2026-S2');
    expect(semestre('2026-02-01')).toBe('2026-S1');
    expect(ehSemestre('2026-S2')).toBe(true);
    expect(ehSemestre('2026-S3')).toBe(false);
    expect(ehSemestre(3)).toBe(false);
    expect(intervaloSemestre('2026-S1')).toEqual({ inicio: '2026-01-01', fim: '2026-06-30' });
    expect(intervaloSemestre('2026-V2')).toEqual({ inicio: '2026-07-01', fim: '2026-12-31' });
    expect(() => intervaloSemestre('2026')).toThrow(RangeError);
    expect(rotuloSemestre('2026-S2')).toBe('2º semestre de 2026');
    expect(() => rotuloSemestre('x')).toThrow(RangeError);
    expect(semestresAte('2027-03-01', '2026-S1')).toEqual(['2026-S1', '2026-S2', '2027-S1']);
  });

  it('OE1: encaminhado em até 30 dias', () => {
    expect(encaminhadoNoPrazo('2026-09-01', '2026-10-01', '2026-11-18')).toBe(true);
    expect(encaminhadoNoPrazo('2026-09-01', '2026-10-02', '2026-11-18')).toBe(false);
    expect(encaminhadoNoPrazo('2026-11-01', null, '2026-11-18')).toBeNull();
    expect(encaminhadoNoPrazo('2026-09-01', null, '2026-11-18')).toBe(false);
  });

  it('OE3: frequência mínima de 85%', () => {
    expect(cumpreFrequenciaPbf(17, 20)).toBe(true);
    expect(cumpreFrequenciaPbf(16, 20)).toBe(false);
    expect(cumpreFrequenciaPbf(0, 0)).toBeNull();
  });

  it('situação: em dia, em evolução pela trajetória, abaixo, sem dado', () => {
    const base = {
      base: 29.1,
      dataBase: '2025-11-01',
      meta: 40,
      prazo: '2028-12-31',
      hoje: '2026-11-18',
    };
    expect(situacaoIndicador({ ...base, atual: 41 })).toBe('EM_DIA');
    expect(situacaoIndicador({ ...base, atual: 33.4 })).toBe('EM_EVOLUCAO');
    expect(situacaoIndicador({ ...base, atual: 30 })).toBe('ABAIXO');
    expect(situacaoIndicador({ ...base, atual: null })).toBe('SEM_DADO');
    expect(situacaoIndicador({ atual: 50, meta: null, hoje: '2026-11-18' })).toBe('SEM_DADO');
    expect(situacaoIndicador({ atual: 88, meta: 100, hoje: '2026-11-18' })).toBe('EM_EVOLUCAO');
    expect(situacaoIndicador({ ...base, prazo: '2025-11-01', atual: 39 })).toBe('ABAIXO');
    expect(situacaoIndicador({ ...base, hoje: '2030-01-01', atual: 39.9 })).toBe('ABAIXO');
    expect(ROTULO_SITUACAO_INDICADOR.ABAIXO).toBe('Abaixo do esperado');
    expect(TOM_SITUACAO_INDICADOR.EM_DIA).toBe('bom');
  });

  it('schemas: meta, acessos por CPF e verificação da trilha', () => {
    expect(
      MetaIndicador.safeParse({ linhaBase: 71.4, dataBase: '2025-11-01', meta: 85, prazo: null })
        .success,
    ).toBe(true);
    const sem = MetaIndicador.safeParse({ linhaBase: 71.4, dataBase: null, meta: 85, prazo: null });
    expect(sem.success).toBe(false);
    expect(AcessosPorCpf.parse({ cpf: '529.982.247-25' }).cpf).toBe('52998224725');
    const ruim = AcessosPorCpf.safeParse({ cpf: '111.111.111-11' });
    expect(ruim.success).toBe(false);
    expect(ruim.error?.issues[0]?.message).not.toContain('111');
    expect(VerificarTrilha.parse({ caso: 'ba-2026-0329', verificador: 'a1b2 c3d4 e5f6' })).toEqual({
      caso: 'BA-2026-0329',
      verificador: 'A1B2-C3D4-E5F6',
    });
    expect(VerificarTrilha.safeParse({ caso: 'BA-2026-0329', verificador: 'xyz' }).success).toBe(
      false,
    );
    expect(VerificarTrilha.safeParse({ caso: '329', verificador: 'A1B2C3D4E5F6' }).success).toBe(
      false,
    );
  });
});

describe('despesa (gasto × resultado)', () => {
  const contrato: ContratoTransparencia = {
    versaoTestada: 'fictício',
    url: 'http://localhost:9999/despesas',
    parametros: { exercicio: '{ano}', mes: '{mes}', municipio: '1100114' },
    caminhoItens: 'dados.itens',
    campos: { programa: 'programa', ano: 'exercicio', mes: 'mes', valor: 'valorLiquidado' },
  };

  it('programas com o indicador do resultado', () => {
    expect(PROGRAMAS.map((p) => p.nome)).toEqual([
      'Atenção primária',
      'Creche',
      'Transporte escolar',
      'CRAS / PAIF',
    ]);
    expect(lerPrograma('Atenção primária')).toBe('ATENCAO_PRIMARIA');
    expect(lerPrograma('cras/paif')).toBe('CRAS_PAIF');
    expect(lerPrograma('CRECHE')).toBe('CRECHE');
    expect(lerPrograma('Outro')).toBeNull();
    expect(lerPrograma(undefined)).toBeNull();
  });

  it('valores em reais', () => {
    expect(lerValorReais('R$ 3.900.000,00')).toBe(3900000);
    expect(lerValorReais('1234.56')).toBe(1234.56);
    expect(lerValorReais('2.100.000')).toBe(2100000);
    expect(lerValorReais(900000)).toBe(900000);
    expect(lerValorReais(-1)).toBeNull();
    expect(lerValorReais('abc')).toBeNull();
    expect(lerValorReais('')).toBeNull();
    expect(lerValorReais(null)).toBeNull();
  });

  it('converte linhas e recusa as inválidas com motivo fixo', () => {
    expect(converterDespesa({ programa: 'Creche', ano: '2026', mes: '3', valor: '10,50' })).toEqual(
      {
        ok: true,
        despesa: { ano: 2026, mes: 3, programa: 'CRECHE', valorLiquidado: 10.5 },
      },
    );
    expect(converterDespesa({ programa: 'X', ano: 2026, mes: 1, valor: 1 })).toEqual({
      ok: false,
      motivo: 'Programa desconhecido.',
    });
    expect(converterDespesa({ programa: 'Creche', ano: 1990, mes: 1, valor: 1 })).toMatchObject({
      motivo: 'Ano inválido.',
    });
    expect(converterDespesa({ programa: 'Creche', ano: 2026, mes: 13, valor: 1 })).toMatchObject({
      motivo: 'Mês inválido.',
    });
    expect(converterDespesa({ programa: 'Creche', ano: 2026, mes: 2, valor: 'x' })).toMatchObject({
      motivo: 'Valor liquidado inválido.',
    });
  });

  it('lê a resposta pelo contrato e falha de forma visível se a estrutura mudar', () => {
    expect(urlConsulta(contrato, 2026, 3)).toBe(
      'http://localhost:9999/despesas?exercicio=2026&mes=3&municipio=1100114',
    );
    expect(urlConsulta({ ...contrato, url: 'http://x/a?chave=1' }, 2026, 1)).toBe(
      'http://x/a?chave=1&exercicio=2026&mes=1&municipio=1100114',
    );
    expect(urlConsulta({ ...contrato, parametros: {} }, 2026, 1)).toBe(
      'http://localhost:9999/despesas',
    );
    const resposta = {
      dados: {
        itens: [
          { programa: 'Creche', exercicio: 2026, mes: 3, valorLiquidado: '100,00' },
          { programa: 'Creche', exercicio: 2026, mes: 3, valorLiquidado: '50,50' },
          { programa: 'Outro', exercicio: 2026, mes: 3, valorLiquidado: '1,00' },
        ],
      },
    };
    const r = lerDespesas(resposta, contrato);
    expect(r).toEqual({
      despesas: [
        { ano: 2026, mes: 3, programa: 'CRECHE', valorLiquidado: 100 },
        { ano: 2026, mes: 3, programa: 'CRECHE', valorLiquidado: 50.5 },
      ],
      rejeitadas: 1,
    });
    expect(somarDespesas('despesas' in r ? r.despesas : [])).toEqual([
      { ano: 2026, mes: 3, programa: 'CRECHE', valorLiquidado: 150.5 },
    ]);
    expect(lerDespesas({ dados: {} }, contrato)).toEqual({
      erroContrato: 'A resposta não tem a lista de itens do contrato.',
    });
    expect(lerDespesas([{ programa: 'Creche' }], { ...contrato, caminhoItens: '' })).toEqual({
      erroContrato: 'A resposta não tem o campo "exercicio" do contrato.',
    });
    expect(lerDespesas([], { ...contrato, caminhoItens: '' })).toEqual({
      despesas: [],
      rejeitadas: 0,
    });
    expect(lerDespesas(null, contrato)).toHaveProperty('erroContrato');
  });
});
