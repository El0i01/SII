import { describe, expect, it } from 'vitest';
import {
  converterLinhaCadunico,
  faixaPorCodigo,
  faixaPorRenda,
  papelPorParentesco,
  type CamposCadunico,
} from './cadunico';

const linhas = { extremaPobreza: 109, pobreza: 218, meioSalarioMinimo: 800 };
const base: CamposCadunico = {
  codigoFamiliar: '0123456789-0',
  nome: '  Ana   Souza ',
  nis: '12345678900',
  cpf: '529.982.247-25',
  nascimento: '05/03/2019',
  mae: 'Maria Souza',
  sexo: '2',
  parentesco: '3',
  faixaRenda: '2',
  pbf: '1',
  atualizadoEm: '2026-10-01',
  qtdPessoas: '4',
  grauInstrucao: '2',
  sabeLer: '1',
};

describe('faixa de renda', () => {
  it('pelo código fx_rfpc do CECAD', () => {
    expect(faixaPorCodigo('1')).toBe('EXTREMA_POBREZA');
    expect(faixaPorCodigo(' 4 ')).toBe('ACIMA_MEIO_SALARIO');
    expect(faixaPorCodigo('5')).toBeNull();
    expect(faixaPorCodigo('x')).toBeNull();
  });

  it('pela renda per capita e as linhas configuradas', () => {
    expect(faixaPorRenda(109, linhas)).toBe('EXTREMA_POBREZA');
    expect(faixaPorRenda(200, linhas)).toBe('POBREZA');
    expect(faixaPorRenda(500, linhas)).toBe('BAIXA_RENDA');
    expect(faixaPorRenda(801, linhas)).toBe('ACIMA_MEIO_SALARIO');
  });
});

describe('papelPorParentesco', () => {
  it('códigos do CadÚnico', () => {
    expect(papelPorParentesco('1')).toBe('RESPONSAVEL');
    expect(papelPorParentesco('2')).toBe('CONJUGE');
    expect(papelPorParentesco('3')).toBe('FILHO');
    expect(papelPorParentesco('4')).toBe('FILHO');
    expect(papelPorParentesco('5')).toBe('NETO');
    expect(papelPorParentesco('11')).toBe('OUTRO');
    expect(papelPorParentesco(undefined)).toBe('OUTRO');
  });
});

describe('converterLinhaCadunico', () => {
  it('linha completa vira registro normalizado', () => {
    const r = converterLinhaCadunico(base, linhas);
    expect(r).toEqual({
      ok: true,
      avisos: [],
      registro: {
        codigoFamiliar: '01234567890',
        nome: 'Ana Souza',
        nis: '12345678900',
        cpf: '52998224725',
        nascimento: '2019-03-05',
        mae: 'Maria Souza',
        sexo: 'FEMININO',
        papel: 'FILHO',
        faixaRenda: 'POBREZA',
        recebePbf: true,
        atualizadoEm: '2026-10-01',
        qtdPessoas: 4,
        grauInstrucao: 'FUNDAMENTAL_INCOMPLETO',
        sabeLer: true,
      },
    });
  });

  it('sem fx_rfpc usa a renda per capita; sexo M, PBF 0, mãe e CPF ausentes', () => {
    const r = converterLinhaCadunico(
      {
        ...base,
        faixaRenda: '',
        rendaPerCapita: '90,00',
        sexo: 'M',
        pbf: '0',
        mae: '',
        cpf: '',
        qtdPessoas: '',
        grauInstrucao: '',
        sabeLer: '',
      },
      linhas,
    );
    expect(r.ok && r.registro).toMatchObject({
      faixaRenda: 'EXTREMA_POBREZA',
      sexo: 'MASCULINO',
      recebePbf: false,
      mae: null,
      cpf: null,
      qtdPessoas: null,
      grauInstrucao: null,
      sabeLer: null,
    });
  });

  it('sexo desconhecido vira null e quantidade absurda é ignorada', () => {
    const r = converterLinhaCadunico({ ...base, sexo: '9', qtdPessoas: '250' }, linhas);
    expect(r.ok && r.registro.sexo).toBeNull();
    expect(r.ok && r.registro.qtdPessoas).toBeNull();
  });

  it('CPF inválido é aviso: carrega a pessoa sem CPF', () => {
    const r = converterLinhaCadunico({ ...base, cpf: '52998224724' }, linhas);
    expect(r.ok).toBe(true);
    expect(r.ok && r.registro.cpf).toBeNull();
    expect(r.ok && r.avisos).toEqual([
      {
        campo: 'cpf',
        mensagem: 'CPF inválido: a pessoa foi carregada sem CPF.',
        gravidade: 'AVISO',
      },
    ]);
  });

  it('erros descartam a linha, com mensagens que não trazem o valor', () => {
    const r = converterLinhaCadunico(
      {
        codigoFamiliar: '',
        nome: ' ',
        nis: '12345678901',
        cpf: '52998224724',
        nascimento: '31/02/2019',
        faixaRenda: '9',
        rendaPerCapita: 'abc',
      },
      linhas,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.problemas.map((p) => [p.campo, p.gravidade])).toEqual([
      ['codigoFamiliar', 'ERRO'],
      ['nome', 'ERRO'],
      ['nascimento', 'ERRO'],
      ['nis', 'ERRO'],
      ['faixaRenda', 'ERRO'],
      ['cpf', 'AVISO'],
    ]);
    const texto = JSON.stringify(r.problemas);
    expect(texto).not.toContain('12345678901');
    expect(texto).not.toContain('52998224724');
  });

  it('renda negativa não vale', () => {
    const { faixaRenda: _sem, ...semFaixa } = base;
    const r = converterLinhaCadunico({ ...semFaixa, rendaPerCapita: '-5' }, linhas);
    expect(r.ok).toBe(false);
  });
});
