import { describe, expect, it } from 'vitest';
import {
  type CamposEscolar,
  converterLinhaGestaoEscolar,
  converterLinhaSeduc,
  lerSituacaoFrequencia,
  lerSituacaoMatricula,
} from './escolar';

const base: CamposEscolar = {
  inep: '11005165',
  turma: ' 3º ano  A ',
  codigoAluno: 'AL-0001',
  nome: 'Aluna  Fictícia da Silva',
  nascimento: '10/03/2017',
  mae: 'Mãe Fictícia',
  cpf: '529.982.247-25',
  sexo: 'F',
};

describe('lerSituacaoFrequencia', () => {
  it('aceita letras, palavras e 1/0', () => {
    expect(lerSituacaoFrequencia('p')).toBe('PRESENTE');
    expect(lerSituacaoFrequencia('1')).toBe('PRESENTE');
    expect(lerSituacaoFrequencia('Falta')).toBe('FALTA');
    expect(lerSituacaoFrequencia('0')).toBe('FALTA');
    expect(lerSituacaoFrequencia('J')).toBe('JUSTIFICADA');
    expect(lerSituacaoFrequencia('x')).toBeNull();
    expect(lerSituacaoFrequencia(undefined)).toBeNull();
  });
});

describe('lerSituacaoMatricula', () => {
  it('vazio é ativa; reconhece sinônimos com e sem acento', () => {
    expect(lerSituacaoMatricula(undefined)).toBe('ATIVA');
    expect(lerSituacaoMatricula('Cursando')).toBe('ATIVA');
    expect(lerSituacaoMatricula('transferido')).toBe('TRANSFERIDA');
    expect(lerSituacaoMatricula('Deixou de frequentar')).toBe('ABANDONO');
    expect(lerSituacaoMatricula('Concluído')).toBe('CONCLUIDA');
    expect(lerSituacaoMatricula('remanejado')).toBeNull();
  });
});

describe('converterLinhaGestaoEscolar', () => {
  it('converte aluno × dia', () => {
    const r = converterLinhaGestaoEscolar({ ...base, data: '16/11/2026', situacao: 'F' });
    expect(r).toEqual({
      ok: true,
      avisos: [],
      registro: {
        inep: '11005165',
        turma: '3º ano A',
        codigoAluno: 'AL-0001',
        nome: 'Aluna Fictícia da Silva',
        nascimento: '2017-03-10',
        mae: 'Mãe Fictícia',
        cpf: '52998224725',
        sexo: 'FEMININO',
        data: '2026-11-16',
        situacao: 'FALTA',
      },
    });
  });

  it('sem data vale como matrícula; turma, mãe e sexo vazios viram null', () => {
    const r = converterLinhaGestaoEscolar({ ...base, turma: '', mae: '', sexo: 'M', cpf: '' });
    expect(r.ok && r.registro).toMatchObject({
      turma: null,
      mae: null,
      sexo: 'MASCULINO',
      cpf: null,
      data: null,
      situacao: null,
    });
  });

  it('CPF inválido é aviso, não erro, e a mensagem não traz o valor', () => {
    const r = converterLinhaGestaoEscolar({ ...base, cpf: '52998224724', sexo: '' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.registro.cpf).toBeNull();
      expect(r.registro.sexo).toBeNull();
      expect(r.avisos[0]?.mensagem).not.toContain('5299');
    }
  });

  it('rejeita INEP, código, nome, nascimento, data e situação inválidos', () => {
    const r = converterLinhaGestaoEscolar({
      inep: '123',
      codigoAluno: '',
      nome: 'x',
      nascimento: '31/02/2017',
      data: '99/99/2026',
      situacao: 'Z',
      cpf: '111',
    });
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.problemas.map((p) => p.campo)).toEqual([
        'inep',
        'codigoAluno',
        'nome',
        'nascimento',
        'data',
        'situacao',
        'cpf',
      ]);
  });

  it('erro só na frequência também descarta a linha', () => {
    const r = converterLinhaGestaoEscolar({ ...base, data: '16/11/2026', situacao: '' });
    expect(r.ok).toBe(false);
  });
});

describe('converterLinhaSeduc', () => {
  it('converte a matrícula estadual', () => {
    const r = converterLinhaSeduc({ ...base, situacaoMatricula: 'Transferido' });
    expect(r.ok && r.registro.situacaoMatricula).toBe('TRANSFERIDA');
  });

  it('rejeita situação desconhecida e aluno inválido', () => {
    expect(converterLinhaSeduc({ ...base, situacaoMatricula: 'remanejado' }).ok).toBe(false);
    expect(converterLinhaSeduc({ ...base, inep: '' }).ok).toBe(false);
  });
});
