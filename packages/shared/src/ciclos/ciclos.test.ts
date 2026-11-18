import { describe, expect, it } from 'vitest';
import { contarPor, pctContagem, suprimirContagens } from './contagem';
import {
  coortesCreche,
  ondeAbrirPrimeiro,
  simularCreche,
  TAMANHOS_UNIDADE,
  totaisCreche,
} from './creche';
import {
  CRITERIOS_EJA,
  ehTurmaEja,
  frequenciaMediaEja,
  lerGrauInstrucao,
  lerSabeLer,
  META_COBERTURA_EJA,
  type PessoaEja,
  publicoPotencialEja,
} from './eja';
import {
  CRITERIOS_IDOSA,
  CRUZAMENTOS_IDOSA,
  dadosIdoso,
  type IdosoPainel,
  ordenarPrioritarios,
} from './idosa';
import { CRITERIOS_INCLUSIVA, ROTULO_SITUACAO_AEE, situacaoAee } from './inclusiva';
import {
  type CriancaPrimeiraInfancia,
  CRITERIOS_PRIMEIRA_INFANCIA,
  METAS_PRIMEIRA_INFANCIA,
  semCuidado03,
} from './primeira-infancia';

describe('contagem por setor', () => {
  const itens = [
    { s: 'S01', a: true },
    { s: 'S01', a: false },
    { s: 'S02', a: true },
    { s: null, a: true },
  ];
  it('conta o município e cada setor (setores sem ninguém aparecem com zero)', () => {
    const c = contarPor(itens, (x) => x.s, { todos: () => true, a: (x) => x.a }, ['S03']);
    expect(c.total).toEqual({ todos: 4, a: 3 });
    expect(c.porSetor).toEqual([
      { setor: 'S01', valores: { todos: 2, a: 1 } },
      { setor: 'S02', valores: { todos: 1, a: 1 } },
      { setor: 'S03', valores: { todos: 0, a: 0 } },
    ]);
  });
  it('suprime de 1 a 4 e calcula percentual só com números', () => {
    const c = suprimirContagens(contarPor(itens, (x) => x.s, { todos: () => true }));
    expect(c.total.todos).toBeNull();
    expect(c.porSetor[0]?.valores.todos).toBeNull();
    const nulo = suprimirContagens({ total: { a: null }, porSetor: [] });
    expect(nulo.total.a).toBeNull();
    expect(
      suprimirContagens(contarPor(Array(6).fill(itens[0]), (x) => x.s, { t: () => true })).total.t,
    ).toBe(6);
    expect(pctContagem(1, 3)).toBe(33.3);
    expect(pctContagem(null, 3)).toBeNull();
    expect(pctContagem(1, null)).toBeNull();
    expect(pctContagem(0, 0)).toBeNull();
  });
});

describe('primeira infância', () => {
  const c = (p: Partial<CriancaPrimeiraInfancia>): CriancaPrimeiraInfancia => ({
    setor: 'S01',
    idade: 2,
    vacinacaoEmDia: true,
    matriculada: false,
    noCadunico: true,
    pcf: null,
    ...p,
  });
  it('0 a 3 sem cuidado: CadÚnico, sem creche, sem Criança Feliz', () => {
    expect(semCuidado03(c({}))).toBe(true);
    expect(semCuidado03(c({ matriculada: true }))).toBe(false);
    expect(semCuidado03(c({ pcf: { diasSemVisita: 3 } }))).toBe(false);
    expect(semCuidado03(c({ noCadunico: false }))).toBe(false);
    expect(semCuidado03(c({ idade: 4 }))).toBe(false);
  });
  it('critérios do painel', () => {
    const r = contarPor(
      [
        c({}),
        c({ idade: 4, matriculada: true, vacinacaoEmDia: null }),
        c({ idade: 5, pcf: { diasSemVisita: 20 } }),
        c({ pcf: { diasSemVisita: 2 }, matriculada: true, vacinacaoEmDia: false }),
      ],
      (x) => x.setor,
      CRITERIOS_PRIMEIRA_INFANCIA,
    );
    expect(r.total).toEqual({
      criancas: 4,
      vacinaInformada: 3,
      vacinadas: 2,
      de0a3: 2,
      creche: 1,
      de4a5: 2,
      preEscola: 1,
      noCadunico: 4,
      pcf: 2,
      pcfEmDia: 1,
      semCuidado03: 1,
    });
    expect(METAS_PRIMEIRA_INFANCIA.vacinacao).toBe(85);
  });
});

describe('simulador de creche', () => {
  const setores = [
    {
      setor: 'S01',
      nome: 'Setor 01',
      coortes: { 2023: 30, 2024: 30, 2025: 20, 2026: 20 },
      vagas: 30,
      fila: 5,
      ivmMedio: 0.3,
    },
    {
      setor: 'S03',
      nome: 'Setor 03',
      coortes: { 2023: 40, 2024: 40, 2025: 40, 2026: 40 },
      vagas: 20,
      fila: 12,
      ivmMedio: 0.6,
    },
    { setor: 'S05', nome: 'Setor 05', coortes: {}, vagas: 0, fila: 0, ivmMedio: 0 },
  ];
  it('cobertura, déficit para a meta e efeito da unidade simulada', () => {
    const l = simularCreche(setores, { metaPct: 50, setor: 'S03', novasVagas: 60 });
    expect(l[0]).toMatchObject({
      criancas: 100,
      novas: 0,
      demanda: 50,
      deficit: 20,
      coberturaAtual: 30,
      coberturaSimulada: 30,
    });
    expect(l[1]).toMatchObject({
      criancas: 160,
      novas: 60,
      demanda: 80,
      deficit: 0,
      coberturaAtual: 12.5,
      coberturaSimulada: 50,
    });
    expect(l[1]?.prioridade).toBeCloseTo(60 * 1.6);
    expect(l[2]).toMatchObject({ criancas: 0, coberturaAtual: null, prioridade: 0 });
    expect(ondeAbrirPrimeiro(l)?.setor).toBe('S03');
    expect(totaisCreche(l)).toEqual({
      criancas: 260,
      vagas: 50,
      novas: 60,
      fila: 17,
      deficit: 20,
      coberturaAtual: (50 / 260) * 100,
      coberturaSimulada: (110 / 260) * 100,
    });
    expect(
      ondeAbrirPrimeiro(
        simularCreche([setores[2] as never], { metaPct: 50, setor: null, novasVagas: 0 }),
      ),
    ).toBeNull();
    expect(coortesCreche(2026)).toEqual([2023, 2024, 2025, 2026]);
    expect(TAMANHOS_UNIDADE).toContain(60);
  });
});

describe('educação inclusiva', () => {
  it('situação do atendimento e critérios', () => {
    expect(situacaoAee({ salaRecursos: true, apae: true })).toBe('SALA_RECURSOS');
    expect(situacaoAee({ salaRecursos: false, apae: true })).toBe('APAE');
    expect(situacaoAee({ salaRecursos: false, apae: false })).toBe('SEM_ATENDIMENTO');
    expect(ROTULO_SITUACAO_AEE.SEM_ATENDIMENTO).toBe('Sem atendimento');
    const base = {
      setor: 'S01',
      idade: 2,
      salaRecursos: false,
      apae: false,
      bpc: true,
      matriculada: false,
      pcf: true,
    };
    const r = contarPor(
      [
        base,
        { ...base, idade: 8, salaRecursos: true, bpc: false, pcf: false, matriculada: true },
        { ...base, idade: 6 },
      ],
      (x) => x.setor,
      CRITERIOS_INCLUSIVA,
    );
    expect(r.total).toEqual({
      identificadas: 3,
      salaRecursos: 1,
      apae: 0,
      bpc: 2,
      semAtendimento: 2,
      de0a3: 1,
      de0a3NoPcf: 1,
      foraDaEscola: 1,
    });
  });
});

describe('EJA', () => {
  const p = (x: Partial<PessoaEja>): PessoaEja => ({
    setor: 'S01',
    idade: 30,
    grau: 'FUNDAMENTAL_INCOMPLETO',
    sabeLer: true,
    matriculaRegular: false,
    matriculaEja: false,
    frequenciaEja: null,
    responsavelFamiliar: false,
    paiDeAluno: false,
    noScfv: false,
    ...x,
  });
  it('escolaridade do CadÚnico', () => {
    expect(lerGrauInstrucao('1')).toBe('SEM_INSTRUCAO');
    expect(lerGrauInstrucao(' 6 ')).toBe('SUPERIOR');
    expect(lerGrauInstrucao('7')).toBeNull();
    expect(lerGrauInstrucao(undefined)).toBeNull();
    expect(lerSabeLer('1')).toBe(true);
    expect(lerSabeLer('2')).toBe(false);
    expect(lerSabeLer('não')).toBe(false);
    expect(lerSabeLer('')).toBeNull();
    expect(lerSabeLer(null)).toBeNull();
    expect(ehTurmaEja('EJA 1º segmento')).toBe(true);
    expect(ehTurmaEja('Educação de Jovens e Adultos')).toBe(true);
    expect(ehTurmaEja('9º ano')).toBe(false);
    expect(ehTurmaEja(null)).toBe(false);
    expect(META_COBERTURA_EJA).toBe(25);
  });
  it('público potencial, alfabetização e convites', () => {
    expect(publicoPotencialEja(p({}))).toBe(true);
    expect(publicoPotencialEja(p({ idade: 14 }))).toBe(false);
    expect(publicoPotencialEja(p({ grau: 'MEDIO_COMPLETO' }))).toBe(false);
    expect(publicoPotencialEja(p({ matriculaRegular: true }))).toBe(false);
    const r = contarPor(
      [
        p({ responsavelFamiliar: true, paiDeAluno: true }),
        p({ idade: 16, grau: 'SEM_INSTRUCAO', sabeLer: false }),
        p({ idade: 70, grau: 'SEM_INSTRUCAO', sabeLer: false, noScfv: true }),
        p({ matriculaEja: true, frequenciaEja: 80, grau: 'MEDIO_INCOMPLETO' }),
        p({ matriculaEja: true, frequenciaEja: 90 }),
      ],
      (x) => x.setor,
      CRITERIOS_EJA,
    );
    expect(r.total).toEqual({
      potencial: 5,
      semAlfabetizacao: 2,
      matriculados: 2,
      conviteResponsavel: 1,
      convitePais: 1,
      conviteJovens: 1,
      conviteIdososScfv: 1,
    });
    expect(
      frequenciaMediaEja([
        p({ matriculaEja: true, frequenciaEja: 80 }),
        p({ matriculaEja: true, frequenciaEja: 91 }),
      ]),
    ).toBe(85.5);
    expect(frequenciaMediaEja([p({})])).toBeNull();
  });
});

describe('pessoa idosa', () => {
  const i = (x: Partial<IdosoPainel>): IdosoPainel => ({
    setor: 'S01',
    idade: 70,
    sozinha: false,
    diasSemVisitaAcs: 10,
    acamada: false,
    bpc: false,
    cras: false,
    gripe: true,
    cronica: false,
    cronicaAcompanhada: false,
    scfv: false,
    ...x,
  });
  it('cruzamentos Saúde × Assistência e lista prioritária', () => {
    const lista = [
      i({ sozinha: true, diasSemVisitaAcs: 120 }),
      i({ acamada: true, bpc: true, gripe: false }),
      i({ cronica: true, scfv: true, gripe: null, diasSemVisitaAcs: null }),
      i({ cronica: true, cronicaAcompanhada: true, cras: true, bpc: true }),
    ];
    const r = contarPor(lista, (x) => x.setor, CRITERIOS_IDOSA);
    expect(r.total).toMatchObject({
      pessoas: 4,
      sozinhas: 1,
      semVisita90: 2,
      gripeInformada: 3,
      gripeEmDia: 2,
      scfv: 1,
      bpc: 2,
      acamadas: 1,
      cronicas: 2,
      cronicasAcompanhadas: 1,
      sozinhaSemVisita: 1,
      acamadaSemCras: 1,
      bpcSemCras: 1,
      cronicaSemConsulta: 1,
      sozinhaSemScfv: 1,
      prioritarias: 1,
    });
    expect(CRUZAMENTOS_IDOSA.map((c) => c.chave)).toEqual([
      'sozinhaSemVisita',
      'acamadaSemCras',
      'bpcSemCras',
      'cronicaSemConsulta',
      'sozinhaSemScfv',
    ]);
    expect(dadosIdoso(lista[1] as IdosoPainel)).toMatchObject({
      acamada: true,
      recebeBpc: true,
      vacinaGripe: false,
    });
    const ord = ordenarPrioritarios([
      { id: 1, motivos: [1, 2, 3], diasSemVisitaAcs: 100 },
      { id: 2, motivos: [1, 2, 3, 4], diasSemVisitaAcs: 10 },
      { id: 3, motivos: [1, 2, 3], diasSemVisitaAcs: null },
      { id: 4, motivos: [1, 2], diasSemVisitaAcs: 400 },
    ]);
    expect(ord.map((x) => x.id)).toEqual([2, 3, 1]);
  });
});
