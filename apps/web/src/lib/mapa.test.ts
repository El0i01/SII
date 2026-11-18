import type { IndicadoresQuadra } from '@sii/shared';
import {
  classesDasQuadras,
  expressaoCorQuadra,
  idadeTexto,
  limites,
  pontosDaCamada,
  sinaisDoMorador,
} from './mapa';

const q = (p: Partial<IndicadoresQuadra>): IndicadoresQuadra => ({
  id: 1,
  codigo: 'Q01',
  setor: 'S01',
  provisoria: true,
  centro: [-63, -9],
  ivm: 0.7,
  lotes: 12,
  lotesIrregulares: 0,
  domicilios: 10,
  domiciliosPorFonte: {},
  criancas03: 6,
  criancasVisita: 0,
  familiasPcf: null,
  pcfAtrasadas: 0,
  idosos: 0,
  idososSozinhos: 0,
  idososSozinhosSemVisita: 0,
  casosBuscaAtiva: 0,
  ...p,
});

describe('mapa', () => {
  it('monta a expressão de cor pela legenda da camada', () => {
    const e = expressaoCorQuadra('casos', (t) => `#${t}`);
    expect(e[0]).toBe('match');
    expect(e).toContain('3');
    expect(e).toContain('#erro');
    expect(e.at(-1)).toBe('#superficie');
  });

  it('classe de cada quadra', () => {
    expect(classesDasQuadras('vul', [q({})])).toEqual([{ id: 1, classe: 'MUITO_ALTA' }]);
  });

  it('pontos individuais para perfil nominal', () => {
    const p = { calor03: [[1, 2]], calorIdosos: [], pcf: [{ c: [3, 4], atrasada: true }] } as never;
    expect(pontosDaCamada('calor03', [], p).features).toHaveLength(1);
    expect(pontosDaCamada('pcf', [], p).features[0]?.properties).toEqual({
      peso: 1,
      atrasada: true,
    });
  });

  it('agregado: centro da quadra com peso, sem quadra suprimida nem sem centro', () => {
    const quadras = [q({}), q({ id: 2, criancas03: null }), q({ id: 3, centro: null })];
    const c = pontosDaCamada('calor03', quadras, null);
    expect(c.features).toHaveLength(1);
    expect(c.features[0]?.properties.peso).toBe(6);
    expect(pontosDaCamada('pcf', [q({ familiasPcf: 7 })], null).features[0]?.properties).toEqual({
      peso: 7,
      atrasada: false,
    });
  });

  it('limites de um GeoJSON', () => {
    const geo = {
      features: [
        {
          geometry: {
            coordinates: [
              [
                [1, 5],
                [3, 2],
              ],
            ],
          },
        },
        { geometry: { coordinates: [0, 9] } },
        { geometry: {} },
      ],
    };
    expect(limites(geo)).toEqual([0, 2, 3, 9]);
    expect(limites({})).toBeNull();
  });

  it('sinais e idade do morador', () => {
    const base = {
      iniciais: 'M. S.',
      idade: 70,
      crianca: false,
      idosa: true,
      sozinha: true,
      criancaFeliz: false,
      precisaVisita: false,
      buscaAtiva: false,
    };
    expect(sinaisDoMorador(base)).toEqual(['Pessoa idosa sozinha']);
    expect(
      sinaisDoMorador({
        ...base,
        idade: 2,
        crianca: true,
        idosa: false,
        criancaFeliz: true,
        precisaVisita: true,
        buscaAtiva: true,
      }),
    ).toEqual(['Criança', 'Criança Feliz', 'Precisa de visita', 'Busca ativa']);
    expect(sinaisDoMorador({ ...base, sozinha: false })).toEqual(['Pessoa idosa']);
    expect(idadeTexto(null)).toBe('idade não informada');
    expect(idadeTexto(1)).toBe('1 ano');
    expect(idadeTexto(4)).toBe('4 anos');
  });
});
