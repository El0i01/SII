import { describe, expect, it } from 'vitest';
import {
  type DadosIdentidade,
  decidirLigacao,
  jaroWinkler,
  LIMITES_LIGACAO,
  normalizarNomePessoa,
  pontuarCandidato,
  similaridadeNomes,
} from './similaridade';

const base: DadosIdentidade = {
  cpf: null,
  cns: null,
  nis: null,
  nome: 'Ana Beatriz Lima',
  nascimento: '2015-03-14',
  mae: 'Maria Silva Oliveira',
};

describe('normalização e Jaro-Winkler', () => {
  it('normaliza: minúsculas, sem acento, sem pontuação e sem partículas', () => {
    expect(normalizarNomePessoa('  José  da Silva-Sauro dos Santos ')).toBe(
      'jose silva sauro santos',
    );
  });

  it('Jaro-Winkler: iguais = 1, nada em comum = 0, valores conhecidos', () => {
    expect(jaroWinkler('martha', 'martha')).toBe(1);
    expect(jaroWinkler('abc', 'xyz')).toBe(0);
    expect(jaroWinkler('martha', 'marhta')).toBeCloseTo(0.961, 3);
    expect(jaroWinkler('dixon', 'dicksonx')).toBeCloseTo(0.813, 3);
    expect(jaroWinkler('', 'a')).toBe(0);
  });

  it('expande iniciais pelo nome do outro lado (mãe abreviada)', () => {
    expect(similaridadeNomes('Maria S. Oliveira', 'Maria Silva Oliveira')).toBe(1);
    expect(similaridadeNomes('M. Silva Oliveira', 'Maria Silva Oliveira')).toBe(1);
  });

  it('acento e caixa não pesam', () => {
    expect(similaridadeNomes('JOÃO PEDRO', 'Joao Pedro')).toBe(1);
  });
});

describe('pontuarCandidato', () => {
  it('mesmo CPF → regra CPF, mesmo com nome diferente', () => {
    const r = pontuarCandidato(
      { ...base, cpf: '123.456.789-01' },
      { ...base, nome: 'Outro Nome', cpf: '12345678901' },
    );
    expect(r.tipo).toBe('CPF');
  });

  it('CPF diferente nos dois lados → descartado, mesmo com tudo igual', () => {
    expect(
      pontuarCandidato({ ...base, cpf: '11111111111' }, { ...base, cpf: '22222222222' }).tipo,
    ).toBe('DESCARTADO');
  });

  it('mesmo CNS ou NIS → regra CNS_NIS', () => {
    expect(
      pontuarCandidato({ ...base, cns: '700000000000001' }, { ...base, cns: '700000000000001' })
        .tipo,
    ).toBe('CNS_NIS');
    expect(
      pontuarCandidato({ ...base, nis: '12345678901' }, { ...base, nis: '12345678901' }).tipo,
    ).toBe('CNS_NIS');
  });

  it('nome, nascimento e mãe iguais → pontuação 1', () => {
    expect(pontuarCandidato(base, base)).toMatchObject({
      tipo: 'NOME',
      pontuacao: 1,
      nascimentoIgual: true,
    });
  });

  it('homônimos: mesmo nome, nascimento distante → descartado', () => {
    expect(
      pontuarCandidato(base, { ...base, nascimento: '2012-08-01', mae: 'Joana Pereira' }).tipo,
    ).toBe('DESCARTADO');
  });

  it('erro de digitação no nascimento (dia e mês trocados) → no máximo revisão', () => {
    const trocado = pontuarCandidato(
      { ...base, nascimento: '2015-05-03' },
      { ...base, nascimento: '2015-03-05' },
    );
    expect(trocado.tipo).toBe('NOME');
    expect(trocado.nascimentoIgual).toBe(false);
    expect(trocado.pontuacao).toBeLessThan(LIMITES_LIGACAO.automatica);
    expect(trocado.pontuacao).toBeGreaterThanOrEqual(LIMITES_LIGACAO.revisao);
  });

  it('mãe desconhecida de um lado → nunca passa do teto (não liga sozinho)', () => {
    const r = pontuarCandidato(base, { ...base, mae: null });
    expect(r.maeConhecida).toBe(false);
    expect(r.pontuacao).toBeLessThan(LIMITES_LIGACAO.automatica);
  });
});

describe('decidirLigacao (§3.3)', () => {
  it('CPF vence tudo, com confiança 1,00', () => {
    expect(
      decidirLigacao([
        pontuarCandidato(base, base),
        pontuarCandidato({ ...base, cpf: '1'.repeat(11) }, { ...base, cpf: '1'.repeat(11) }),
      ]),
    ).toEqual({
      acao: 'LIGAR',
      regra: 'CPF',
      confianca: 1,
      indice: 1,
    });
  });

  it('CNS/NIS liga com 0,95', () => {
    expect(
      decidirLigacao([
        pontuarCandidato({ ...base, nis: '1'.repeat(11) }, { ...base, nis: '1'.repeat(11) }),
      ]),
    ).toMatchObject({
      acao: 'LIGAR',
      regra: 'CNS_NIS',
      confianca: 0.95,
    });
  });

  it('mãe abreviada com nome e nascimento iguais → liga por nome com 0,85', () => {
    const r = decidirLigacao([pontuarCandidato(base, { ...base, mae: 'Maria S. Oliveira' })]);
    expect(r).toEqual({ acao: 'LIGAR', regra: 'NOME_NASCIMENTO_MAE', confianca: 0.85, indice: 0 });
  });

  it('gêmeos (mesma mãe e nascimento, primeiro nome diferente) → nunca liga sozinho', () => {
    const joao = { ...base, nome: 'João Pedro Alves' };
    const jose = { ...base, nome: 'José Pedro Alves' };
    expect(decidirLigacao([pontuarCandidato(joao, jose)]).acao).not.toBe('LIGAR');
    const gemeas = { ...base, nome: 'Ana Clara Lima' };
    expect(decidirLigacao([pontuarCandidato(base, gemeas)]).acao).not.toBe('LIGAR');
  });

  it('gêmeos com CPF → pessoa nova', () => {
    expect(
      decidirLigacao([
        pontuarCandidato({ ...base, cpf: '1'.repeat(11) }, { ...base, cpf: '2'.repeat(11) }),
      ]),
    ).toEqual({ acao: 'NOVA' });
  });

  it('dois candidatos fortes ao mesmo tempo → revisão (ambíguo)', () => {
    const r = decidirLigacao([pontuarCandidato(base, base), pontuarCandidato(base, base)]);
    expect(r).toEqual({
      acao: 'REVISAR',
      candidatos: [
        { indice: 0, pontuacao: 1 },
        { indice: 1, pontuacao: 1 },
      ],
    });
  });

  it('pontuação entre 0,75 e 0,92 → revisão; abaixo → pessoa nova; sem candidato → nova', () => {
    const r = decidirLigacao([
      pontuarCandidato(
        { ...base, nascimento: '2015-05-03' },
        { ...base, nascimento: '2015-03-05' },
      ),
    ]);
    expect(r.acao).toBe('REVISAR');
    expect(
      decidirLigacao([pontuarCandidato(base, { ...base, nome: 'Bruno Costa', mae: 'Joana Reis' })]),
    ).toEqual({ acao: 'NOVA' });
    expect(decidirLigacao([])).toEqual({ acao: 'NOVA' });
  });
});
