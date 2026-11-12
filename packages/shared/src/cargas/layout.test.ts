import { describe, expect, it } from 'vitest';
import { Dicionario, mapearCabecalho, mensagemColunasFaltando, normalizarColuna } from './layout';

const dic = Dicionario.parse({
  fonte: 'CADUNICO',
  versao: 'teste',
  campos: {
    nis: { rotulo: 'NIS', colunas: ['p.num_nis_pessoa_atual', 'nis'], obrigatorio: true },
    nome: { rotulo: 'Nome', colunas: ['p.nom_pessoa'], obrigatorio: true },
    cpf: { rotulo: 'CPF', colunas: ['p.num_cpf_pessoa'] },
    faixa: { rotulo: 'Faixa de renda', colunas: ['d.fx_rfpc'], obrigatorio: true },
    renda: { rotulo: 'Renda per capita', colunas: ['d.vlr_renda_media_fam'], obrigatorio: true },
  },
  algumDe: [['faixa', 'renda']],
});

describe('normalizarColuna', () => {
  it('tira prefixo, aspas, acento e caixa', () => {
    expect(normalizarColuna(' "P.NOM_PESSOA" ')).toBe('nom_pessoa');
    expect(normalizarColuna('Código')).toBe('codigo');
  });
});

describe('mapearCabecalho', () => {
  it('acha colunas por qualquer alias, com ou sem prefixo', () => {
    const r = mapearCabecalho(['nom_pessoa', 'NIS', 'x', 'd.vlr_renda_media_fam'], dic);
    expect(r.mapa).toEqual({ nome: 0, nis: 1, renda: 3 });
    expect(r.faltando).toEqual([]);
  });

  it('coluna repetida: vale a primeira', () => {
    expect(mapearCabecalho(['nis', 'nis', 'p.nom_pessoa', 'fx_rfpc'], dic).mapa.nis).toBe(0);
  });

  it('lista as obrigatórias que faltam, incluindo o grupo', () => {
    const r = mapearCabecalho(['p.nom_pessoa', 'p.num_cpf_pessoa'], dic);
    expect(r.faltando).toEqual([
      { campos: ['nis'], rotulo: 'NIS', coluna: 'p.num_nis_pessoa_atual' },
      {
        campos: ['faixa', 'renda'],
        rotulo: 'Faixa de renda ou Renda per capita',
        coluna: 'd.fx_rfpc ou d.vlr_renda_media_fam',
      },
    ]);
  });
});

describe('mensagemColunasFaltando', () => {
  it('singular e plural, com o nome oficial', () => {
    const um = mensagemColunasFaltando(
      [{ campos: ['nis'], rotulo: 'NIS', coluna: 'p.num_nis_pessoa_atual' }],
      'CadÚnico',
    );
    expect(um).toContain('a coluna obrigatória do layout CadÚnico: NIS (p.num_nis_pessoa_atual)');
    const dois = mensagemColunasFaltando(
      [
        { campos: ['nis'], rotulo: 'NIS', coluna: 'a' },
        { campos: ['nome'], rotulo: 'Nome', coluna: 'b' },
      ],
      'CadÚnico',
    );
    expect(dois).toContain('as colunas obrigatórias do layout CadÚnico: NIS (a); Nome (b)');
  });
});
