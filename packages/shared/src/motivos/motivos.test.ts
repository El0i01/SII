import { describe, expect, it } from 'vitest';
import { type DadosCrianca, motivosVisitaCrianca } from './crianca';
import {
  type DadosIdoso,
  idosoPrioritario,
  LIMITE_IDOSO_PRIORITARIO,
  motivosVisitaIdoso,
} from './idoso';

const criancaOk: DadosCrianca = {
  idade: 8,
  matriculaAtiva: true,
  faltasSeguidas: 0,
  vacinacaoEmDia: true,
  diasSemVisitaAcs: 30,
  acompanhadaPcf: false,
  diasSemVisitaPcf: null,
  necessitaAee: false,
  temSalaRecursos: false,
  atendidaApae: false,
  noCadUnico: false,
};

const codigos = (m: { codigo: string }[]) => m.map((x) => x.codigo);

describe('motivosVisitaCrianca (§4.3)', () => {
  it('criança acompanhada não tem motivo', () => {
    expect(motivosVisitaCrianca(criancaOk)).toEqual([]);
  });

  it('fora da escola só de 4 a 17 anos', () => {
    expect(codigos(motivosVisitaCrianca({ ...criancaOk, matriculaAtiva: false }))).toEqual([
      'FORA_DA_ESCOLA',
    ]);
    expect(
      codigos(motivosVisitaCrianca({ ...criancaOk, idade: 3, matriculaAtiva: false })),
    ).toEqual([]);
    expect(
      codigos(motivosVisitaCrianca({ ...criancaOk, idade: 18, matriculaAtiva: false })),
    ).toEqual([]);
  });

  it('5 ou mais faltas seguidas, com o número no texto', () => {
    expect(motivosVisitaCrianca({ ...criancaOk, faltasSeguidas: 4 })).toEqual([]);
    expect(motivosVisitaCrianca({ ...criancaOk, faltasSeguidas: 6 })).toEqual([
      { codigo: 'FALTAS_SEGUIDAS', rotulo: '6 faltas seguidas' },
    ]);
  });

  it('vacinação atrasada (sem informação não gera motivo)', () => {
    expect(codigos(motivosVisitaCrianca({ ...criancaOk, vacinacaoEmDia: false }))).toEqual([
      'VACINACAO_ATRASADA',
    ]);
    expect(motivosVisitaCrianca({ ...criancaOk, vacinacaoEmDia: null })).toEqual([]);
  });

  it('sem visita do ACS há mais de 90 dias', () => {
    expect(motivosVisitaCrianca({ ...criancaOk, diasSemVisitaAcs: 90 })).toEqual([]);
    expect(motivosVisitaCrianca({ ...criancaOk, diasSemVisitaAcs: 91 })).toEqual([
      { codigo: 'SEM_VISITA_ACS', rotulo: 'Sem visita do ACS há 91 dias' },
    ]);
  });

  it('Criança Feliz sem visita há mais de 14 dias', () => {
    const pcf = { ...criancaOk, idade: 2, matriculaAtiva: false, acompanhadaPcf: true };
    expect(motivosVisitaCrianca({ ...pcf, diasSemVisitaPcf: 14 })).toEqual([]);
    expect(codigos(motivosVisitaCrianca({ ...pcf, diasSemVisitaPcf: 15 }))).toEqual([
      'PCF_ATRASADO',
    ]);
  });

  it('necessidade de AEE sem sala de recursos nem APAE', () => {
    const aee = { ...criancaOk, necessitaAee: true };
    expect(codigos(motivosVisitaCrianca(aee))).toEqual(['SEM_ATENDIMENTO_ESPECIALIZADO']);
    expect(motivosVisitaCrianca({ ...aee, temSalaRecursos: true })).toEqual([]);
    expect(motivosVisitaCrianca({ ...aee, atendidaApae: true })).toEqual([]);
  });

  it('0 a 3 anos no CadÚnico sem creche e sem Criança Feliz', () => {
    const bebe = { ...criancaOk, idade: 1, matriculaAtiva: false, noCadUnico: true };
    expect(motivosVisitaCrianca(bebe)).toEqual([
      { codigo: 'SEM_CRECHE_SEM_PCF', rotulo: 'Sem creche e sem Criança Feliz' },
    ]);
    expect(motivosVisitaCrianca({ ...bebe, acompanhadaPcf: true, diasSemVisitaPcf: 3 })).toEqual(
      [],
    );
    expect(motivosVisitaCrianca({ ...bebe, matriculaAtiva: true })).toEqual([]);
    expect(motivosVisitaCrianca({ ...bebe, noCadUnico: false })).toEqual([]);
  });

  it('vários motivos saem na ordem da especificação', () => {
    expect(
      codigos(
        motivosVisitaCrianca({
          ...criancaOk,
          matriculaAtiva: false,
          faltasSeguidas: 7,
          vacinacaoEmDia: false,
          diasSemVisitaAcs: 120,
          necessitaAee: true,
        }),
      ),
    ).toEqual([
      'FORA_DA_ESCOLA',
      'FALTAS_SEGUIDAS',
      'VACINACAO_ATRASADA',
      'SEM_VISITA_ACS',
      'SEM_ATENDIMENTO_ESPECIALIZADO',
    ]);
  });
});

const idosoOk: DadosIdoso = {
  moraSozinha: false,
  diasSemVisitaAcs: 20,
  acamada: false,
  recebeBpc: false,
  acompanhadaCras: false,
  vacinaGripe: true,
  condicaoCronica: false,
  consultaNoSemestre: false,
};

describe('motivosVisitaIdoso (§4.4)', () => {
  it('idosa acompanhada não tem motivo', () => {
    expect(motivosVisitaIdoso(idosoOk)).toEqual([]);
  });

  it('cada motivo com o texto do protótipo', () => {
    expect(
      motivosVisitaIdoso({
        moraSozinha: true,
        diasSemVisitaAcs: 120,
        acamada: true,
        recebeBpc: true,
        acompanhadaCras: false,
        vacinaGripe: false,
        condicaoCronica: true,
        consultaNoSemestre: false,
      }),
    ).toEqual([
      { codigo: 'MORA_SOZINHA', rotulo: 'Mora sozinha' },
      { codigo: 'SEM_VISITA_ACS', rotulo: 'Sem visita há 120 dias' },
      { codigo: 'ACAMADA', rotulo: 'Acamada' },
      { codigo: 'BPC_SEM_CRAS', rotulo: 'BPC sem CRAS' },
      { codigo: 'SEM_VACINA_GRIPE', rotulo: 'Sem vacina da gripe' },
      { codigo: 'CRONICO_SEM_CONSULTA', rotulo: 'Crônico sem consulta' },
    ]);
  });

  it('BPC com CRAS, crônico com consulta e dados ausentes não geram motivo', () => {
    expect(
      motivosVisitaIdoso({
        ...idosoOk,
        recebeBpc: true,
        acompanhadaCras: true,
        condicaoCronica: true,
        consultaNoSemestre: true,
        vacinaGripe: null,
        diasSemVisitaAcs: null,
      }),
    ).toEqual([]);
  });

  it('lista prioritária com 3 ou mais motivos', () => {
    expect(LIMITE_IDOSO_PRIORITARIO).toBe(3);
    const dois = motivosVisitaIdoso({ ...idosoOk, moraSozinha: true, acamada: true });
    const tres = motivosVisitaIdoso({
      ...idosoOk,
      moraSozinha: true,
      acamada: true,
      vacinaGripe: false,
    });
    expect(idosoPrioritario(dois)).toBe(false);
    expect(idosoPrioritario(tres)).toBe(true);
  });
});
