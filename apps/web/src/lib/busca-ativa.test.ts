import { atendeBuscaCaso, atendeSituacao, csvDosCasos, type ItemBuscaAtiva } from './busca-ativa';

const item = (i: Partial<ItemBuscaAtiva>): ItemBuscaAtiva => ({
  codigo: 'BA-2026-0301',
  pessoaId: 1,
  iniciais: 'A. B. C.',
  cpf: '***.456.789-**',
  idade: 9,
  setorCodigo: 'S03',
  setor: 'Setor 3',
  localidade: 'Q052',
  origem: 'CadÚnico',
  responsavel: 'ASSISTENCIA',
  rotuloResponsavel: 'Assistência Social',
  status: 'ENCAMINHADO',
  encerrado: false,
  escola: null,
  dias: 12,
  prazo: { restante: 8, nivel: 0, rotulo: 'No prazo · 8 dias', tom: 'ok' },
  acoes: [],
  ...i,
});

describe('busca ativa no web', () => {
  it('CSV não leva CPF nem nome: só iniciais', () => {
    const csv = csvDosCasos([item({}), item({ codigo: 'BA-2026-0308', cpf: null })]);
    expect(csv).not.toMatch(/\d{3}\.\d{3}/);
    expect(csv).not.toContain('***');
    expect(csv).toContain('"A. B. C."');
    expect(csv.split('\r\n')).toHaveLength(3);
  });

  it('filtro de situação e escalonados', () => {
    expect(atendeSituacao(item({}), 'todos')).toBe(true);
    expect(atendeSituacao(item({}), 'ENCAMINHADO')).toBe(true);
    expect(atendeSituacao(item({}), 'IDENTIFICADO')).toBe(false);
    expect(
      atendeSituacao(
        item({ prazo: { restante: -9, nivel: 3, rotulo: 'x', tom: 'critico' } }),
        'escalonados',
      ),
    ).toBe(true);
    expect(atendeSituacao(item({}), 'escalonados')).toBe(false);
  });

  it('busca por caso, quadra, escola ou responsável', () => {
    expect(atendeBuscaCaso(item({}), '')).toBe(true);
    expect(atendeBuscaCaso(item({}), 'q052')).toBe(true);
    expect(atendeBuscaCaso(item({}), 'assistência')).toBe(true);
    expect(atendeBuscaCaso(item({ escola: 'EMEF Castanheira' }), 'castanheira')).toBe(true);
    expect(atendeBuscaCaso(item({}), 'BA-2026-9')).toBe(false);
  });
});
