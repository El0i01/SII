import { describe, expect, it } from 'vitest';
import {
  acoesPermitidas,
  type CasoPainel,
  csvBuscaAtiva,
  deveAbrirBuscaAtiva,
  EncaminharBuscaAtiva,
  faixaEtariaBuscaAtiva,
  MatriculaBuscaAtiva,
  origemDoAlerta,
  proximaEtapa,
  quemPode,
  resumoBuscaAtiva,
  suprimirContagem,
  VisitaBuscaAtiva,
} from './busca-ativa';

const HOJE = '2026-11-17';
const base = {
  idade: 10,
  residente: true,
  matriculaAtiva: false,
  casoAberto: false,
  ultimoConselhoEm: null,
};

describe('deveAbrirBuscaAtiva', () => {
  it('4 a 17, residente, sem matrícula e sem caso aberto', () => {
    expect(deveAbrirBuscaAtiva(base, HOJE)).toBe(true);
    expect(deveAbrirBuscaAtiva({ ...base, idade: 4 }, HOJE)).toBe(true);
    expect(deveAbrirBuscaAtiva({ ...base, idade: 17 }, HOJE)).toBe(true);
    expect(deveAbrirBuscaAtiva({ ...base, idade: 3 }, HOJE)).toBe(false);
    expect(deveAbrirBuscaAtiva({ ...base, idade: 18 }, HOJE)).toBe(false);
    expect(deveAbrirBuscaAtiva({ ...base, residente: false }, HOJE)).toBe(false);
    expect(deveAbrirBuscaAtiva({ ...base, matriculaAtiva: true }, HOJE)).toBe(false);
    expect(deveAbrirBuscaAtiva({ ...base, casoAberto: true }, HOJE)).toBe(false);
  });
  it('não reabre nos 180 dias depois do Conselho Tutelar', () => {
    expect(deveAbrirBuscaAtiva({ ...base, ultimoConselhoEm: '2026-11-01' }, HOJE)).toBe(false);
    expect(deveAbrirBuscaAtiva({ ...base, ultimoConselhoEm: '2026-05-21' }, HOJE)).toBe(true);
    expect(deveAbrirBuscaAtiva({ ...base, ultimoConselhoEm: '2026-05-22' }, HOJE)).toBe(false);
  });
});

describe('faixa e origem', () => {
  it('faixa etária sem idade exata', () => {
    expect(faixaEtariaBuscaAtiva(5)).toBe('4-5');
    expect(faixaEtariaBuscaAtiva(6)).toBe('6-14');
    expect(faixaEtariaBuscaAtiva(15)).toBe('15-17');
  });
  it('origem pela preferência CadÚnico > e-SUS > Censo', () => {
    expect(origemDoAlerta(['ESUS', 'CADUNICO'])).toBe('CadÚnico');
    expect(origemDoAlerta(['CENSO', 'ESUS'])).toBe('e-SUS');
    expect(origemDoAlerta(['CENSO'])).toBe('Censo Municipal');
    expect(origemDoAlerta(['SINASC'])).toBe('Outra base');
  });
});

describe('proximaEtapa', () => {
  it('fluxo da §4.2', () => {
    expect(proximaEtapa('IDENTIFICADO', 'ENCAMINHAR')).toEqual({
      status: 'ENCAMINHADO',
      encerra: false,
    });
    expect(proximaEtapa('ENCAMINHADO', 'ENCAMINHAR')).toBeNull();
    expect(proximaEtapa('ENCAMINHADO', 'VISITA')?.status).toBe('VISITA_REALIZADA');
    expect(proximaEtapa('ENCAMINHADO', 'VISITA', false)?.status).toBe('NAO_LOCALIZADO');
    expect(proximaEtapa('NAO_LOCALIZADO', 'VISITA')?.status).toBe('VISITA_REALIZADA');
    expect(proximaEtapa('IDENTIFICADO', 'VISITA')).toBeNull();
    expect(proximaEtapa('VISITA_REALIZADA', 'MATRICULAR')).toEqual({
      status: 'MATRICULADO',
      encerra: true,
    });
    expect(proximaEtapa('MATRICULADO', 'MATRICULAR')).toBeNull();
    expect(proximaEtapa('NAO_LOCALIZADO', 'CONSELHO')).toEqual({
      status: 'NAO_LOCALIZADO',
      encerra: true,
    });
    expect(proximaEtapa('ENCAMINHADO', 'CONSELHO')).toBeNull();
  });
});

describe('quemPode e acoesPermitidas', () => {
  it('CTI e Comitê podem tudo; SEMED encaminha, matricula e comunica o CT', () => {
    expect(quemPode('VISITA', 'COMITE_GESTOR', 'SEMSAU')).toBe(true);
    expect(quemPode('CONSELHO', 'ADMIN_CTI', 'SEMED')).toBe(true);
    expect(quemPode('ENCAMINHAR', 'SEMED_GESTOR', 'SEMED')).toBe(true);
    expect(quemPode('ENCAMINHAR', 'CRAS_TECNICO', 'ASSISTENCIA')).toBe(false);
    expect(quemPode('MATRICULAR', 'ESCOLA', 'SEMED')).toBe(false);
  });
  it('a visita é da secretaria responsável', () => {
    expect(quemPode('VISITA', 'CRAS_TECNICO', 'ASSISTENCIA')).toBe(true);
    expect(quemPode('VISITA', 'ASSISTENCIA_GESTOR', 'ASSISTENCIA')).toBe(true);
    expect(quemPode('VISITA', 'ACS', 'SEMSAU')).toBe(true);
    expect(quemPode('VISITA', 'SEMED_GESTOR', 'SEMED')).toBe(true);
    expect(quemPode('VISITA', 'ACS', 'ASSISTENCIA')).toBe(false);
    expect(quemPode('VISITA', 'SEMED_GESTOR', 'ASSISTENCIA')).toBe(false);
    expect(quemPode('VISITA', 'ACS', 'CONSELHO_TUTELAR')).toBe(false);
  });
  it('ações pela etapa e pelo perfil; caso encerrado não tem ação', () => {
    expect(acoesPermitidas('IDENTIFICADO', false, 'SEMED_GESTOR', 'SEMED')).toEqual([
      'ENCAMINHAR',
      'MATRICULAR',
    ]);
    expect(acoesPermitidas('ENCAMINHADO', false, 'CRAS_TECNICO', 'ASSISTENCIA')).toEqual([
      'VISITA',
    ]);
    expect(acoesPermitidas('NAO_LOCALIZADO', true, 'ADMIN_CTI', 'SEMED')).toEqual([]);
  });
});

describe('schemas de entrada', () => {
  it('encaminhar só para SEMED, Assistência ou Saúde', () => {
    expect(EncaminharBuscaAtiva.safeParse({ secretaria: 'ASSISTENCIA' }).success).toBe(true);
    const r = EncaminharBuscaAtiva.safeParse({ secretaria: 'SEMFAZ' });
    expect(r.error?.issues[0]?.message).toBe('Escolha a secretaria.');
  });
  it('visita com relato de 20+ caracteres e sem CID', () => {
    const relato = 'Família localizada; a mãe vai procurar a escola na segunda.';
    expect(VisitaBuscaAtiva.safeParse({ localizada: true, relato }).success).toBe(true);
    expect(VisitaBuscaAtiva.safeParse({ localizada: true, relato: 'curto' }).success).toBe(false);
    expect(
      VisitaBuscaAtiva.safeParse({ localizada: false, relato: `${relato} CID F32.1` }).success,
    ).toBe(false);
    expect(VisitaBuscaAtiva.safeParse({ relato }).error?.issues[0]?.message).toBe(
      'Informe se a família foi localizada.',
    );
  });
  it('matrícula pede o INEP da escola', () => {
    expect(MatriculaBuscaAtiva.safeParse({ inep: '11005165' }).success).toBe(true);
    expect(MatriculaBuscaAtiva.safeParse({ inep: '' }).success).toBe(false);
  });
});

describe('resumoBuscaAtiva', () => {
  const caso = (c: Partial<CasoPainel>): CasoPainel => ({
    status: 'IDENTIFICADO',
    alertaEm: '2026-11-10',
    encaminhadoEm: null,
    origem: 'CadÚnico',
    encerrado: false,
    ...c,
  });
  it('fórmulas do protótipo', () => {
    const r = resumoBuscaAtiva(
      [
        caso({}),
        caso({ status: 'IDENTIFICADO', alertaEm: '2026-10-01' }), // 47 dias: escalonado e fora dos 30
        caso({ status: 'ENCAMINHADO', encaminhadoEm: '2026-11-12', origem: 'e-SUS' }),
        caso({
          status: 'VISITA_REALIZADA',
          encaminhadoEm: '2026-11-11',
          origem: 'Censo Municipal',
        }),
        caso({
          status: 'MATRICULADO',
          alertaEm: '2026-08-01',
          encaminhadoEm: '2026-09-20',
          encerrado: true,
        }),
        caso({ status: 'NAO_LOCALIZADO', encaminhadoEm: '2026-11-11', origem: null }),
        caso({ status: 'NAO_LOCALIZADO', alertaEm: '2026-01-01', encerrado: true, origem: 'x' }),
      ],
      HOJE,
    );
    expect(r).toEqual({
      identificados: 7,
      encaminhados: 5,
      visitados: 2,
      matriculados: 1,
      naoLocalizados: 2,
      escalonados: 1,
      // base: 4 encaminhados + 1 identificado há mais de 30 dias; no prazo: 3 (o de agosto levou 50)
      encaminhadosEm30: 60,
      porOrigem: { CadÚnico: 3, 'e-SUS': 1, 'Censo Municipal': 1, 'Outra base': 2 },
    });
  });
  it('sem base para o indicador de 30 dias: null', () => {
    expect(resumoBuscaAtiva([caso({})], HOJE).encaminhadosEm30).toBeNull();
    expect(resumoBuscaAtiva([], HOJE).identificados).toBe(0);
  });
});

describe('supressão e CSV', () => {
  it('contagens de 1 a 4 viram null', () => {
    expect(suprimirContagem(0)).toBe(0);
    expect(suprimirContagem(4)).toBeNull();
    expect(suprimirContagem(5)).toBe(5);
  });
  it('CSV sem CPF nem nome, com aspas escapadas', () => {
    const csv = csvBuscaAtiva([
      {
        codigo: 'BA-2026-0301',
        iniciais: 'A. B. C.',
        idade: 9,
        setor: 'Setor "1"',
        localidade: 'Q052',
        origem: 'CadÚnico',
        responsavel: 'ASSISTENCIA',
        status: 'ENCAMINHADO',
        dias: 12,
        prazo: 'No prazo · 8 dias',
      },
      {
        codigo: 'BA-2026-0308',
        iniciais: 'D. E.',
        idade: null,
        setor: null,
        localidade: null,
        origem: null,
        responsavel: 'OUTRA',
        status: 'MATRICULADO',
        dias: 3,
        prazo: 'Concluído',
      },
    ]);
    const linhas = csv.split('\r\n');
    expect(linhas[0]).toBe(
      '"Caso";"Criança";"Idade";"Território";"Quadra/Linha";"Origem";"Responsável";"Situação";"Dias";"Prazo"',
    );
    expect(linhas[1]).toBe(
      '"BA-2026-0301";"A. B. C.";"9";"Setor ""1""";"Q052";"CadÚnico";"Assistência Social";"Encaminhado";"12";"No prazo · 8 dias"',
    );
    expect(linhas[2]).toBe(
      '"BA-2026-0308";"D. E.";"";"";"";"";"OUTRA";"Matriculado";"3";"Concluído"',
    );
  });
});
