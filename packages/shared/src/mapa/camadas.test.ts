import { describe, expect, it } from 'vitest';
import {
  CAMADAS_MAPA,
  classeQuadra,
  CLASSE_NEUTRA,
  CLASSE_SUPRIMIDA,
  ehCamadaMapa,
  fontePredominante,
  idosoSozinhoSemVisita,
  type IndicadoresQuadra,
  LEGENDA_CAMADA_MAPA,
  loteIrregular,
  pcfAtrasada,
  type PessoaNaQuadra,
  pesoCalorAgregado,
  ROTULO_CAMADA_MAPA,
  somarPessoas,
  suprimirIndicadores,
  TIPO_CAMADA_MAPA,
  valorCamada,
} from './camadas';

const base: IndicadoresQuadra = {
  id: 1,
  codigo: 'Q001',
  setor: 'S01',
  provisoria: true,
  centro: [-63.18, -9.19],
  ivm: 0.42,
  lotes: 12,
  lotesIrregulares: 0,
  domicilios: 10,
  domiciliosPorFonte: { CENSO_GPS: 6, LOTE: 4 },
  criancas03: 3,
  criancasVisita: 2,
  familiasPcf: 1,
  pcfAtrasadas: 0,
  idosos: 7,
  idososSozinhos: 2,
  idososSozinhosSemVisita: 6,
  casosBuscaAtiva: 0,
};
const q = (p: Partial<IndicadoresQuadra>): IndicadoresQuadra => ({ ...base, ...p });

describe('camadas do mapa', () => {
  it('tem as 7 camadas do protótipo, com rótulo, tipo e legenda', () => {
    expect(CAMADAS_MAPA).toHaveLength(7);
    for (const c of CAMADAS_MAPA) {
      expect(ROTULO_CAMADA_MAPA[c]).toBeTruthy();
      expect(TIPO_CAMADA_MAPA[c]).toMatch(/quadra|calor|pontos/);
      expect(LEGENDA_CAMADA_MAPA[c].length).toBeGreaterThan(0);
    }
    expect(ehCamadaMapa('vul')).toBe(true);
    expect(ehCamadaMapa('outra')).toBe(false);
    expect(ehCamadaMapa(3)).toBe(false);
  });

  it('vulnerabilidade usa as faixas do IVM', () => {
    expect(classeQuadra('vul', q({ ivm: 0.2 }))).toBe('BAIXA');
    expect(classeQuadra('vul', q({ ivm: 0.7 }))).toBe('MUITO_ALTA');
    expect(classeQuadra('vul', q({ ivm: null }))).toBe(CLASSE_NEUTRA);
  });

  it('casos: 0, 1, 2, 3 ou mais e suprimido', () => {
    expect(classeQuadra('casos', q({ casosBuscaAtiva: 0 }))).toBe('0');
    expect(classeQuadra('casos', q({ casosBuscaAtiva: 2 }))).toBe('2');
    expect(classeQuadra('casos', q({ casosBuscaAtiva: 9 }))).toBe('3');
    expect(classeQuadra('casos', q({ casosBuscaAtiva: null }))).toBe(CLASSE_SUPRIMIDA);
  });

  it('reurb pela fração de lotes irregulares', () => {
    expect(classeQuadra('reurb', q({ lotesIrregulares: 0 }))).toBe('0');
    expect(classeQuadra('reurb', q({ lotesIrregulares: 3 }))).toBe('25');
    expect(classeQuadra('reurb', q({ lotesIrregulares: 6 }))).toBe('50');
    expect(classeQuadra('reurb', q({ lotesIrregulares: 7 }))).toBe('100');
    expect(classeQuadra('reurb', q({ lotes: 0 }))).toBe(CLASSE_NEUTRA);
  });

  it('precisão pela fonte predominante, empate fica com a mais precisa', () => {
    expect(classeQuadra('prec', base)).toBe('GPS');
    expect(fontePredominante(q({ domiciliosPorFonte: { SETOR: 3, SIGEF_CAR: 3, LOTE: 5 } }))).toBe(
      'BAIXA',
    );
    expect(fontePredominante(q({ domiciliosPorFonte: { LOTE: 4, CNEFE: 4 } }))).toBe('LOTE');
    expect(fontePredominante(q({ domiciliosPorFonte: { LOTE: null, CNEFE: 5 } }))).toBe('CNEFE');
    expect(classeQuadra('prec', q({ domiciliosPorFonte: {} }))).toBe(CLASSE_NEUTRA);
  });

  it('camadas de calor e de pontos não pintam a quadra', () => {
    expect(classeQuadra('calor03', base)).toBe(CLASSE_NEUTRA);
    expect(classeQuadra('pcf', base)).toBe(CLASSE_NEUTRA);
  });

  it('toda classe calculada existe na legenda da camada', () => {
    const amostras = [
      base,
      q({ ivm: null, casosBuscaAtiva: null, lotes: 0, domiciliosPorFonte: {} }),
      q({ ivm: 0.9, casosBuscaAtiva: 5, lotesIrregulares: 12 }),
    ];
    for (const c of CAMADAS_MAPA)
      for (const a of amostras) {
        const k = classeQuadra(c, a);
        if (TIPO_CAMADA_MAPA[c] === 'quadra')
          expect(LEGENDA_CAMADA_MAPA[c].map((i) => i.classe)).toContain(k);
      }
  });

  it('valor da camada para a lista de quadras', () => {
    expect(valorCamada('vul', base)).toEqual({ texto: '0,42 · Moderada', ordem: 0.42 });
    expect(valorCamada('vul', q({ ivm: null })).ordem).toBe(-1);
    expect(valorCamada('calor03', base)).toEqual({ texto: '3', ordem: 3 });
    expect(valorCamada('pcf', q({ familiasPcf: null }))).toEqual({ texto: '< 5', ordem: 2.5 });
    expect(valorCamada('calorIdosos', base).texto).toBe('6');
    expect(valorCamada('casos', base).texto).toBe('0');
    expect(valorCamada('reurb', q({ lotesIrregulares: 3 }))).toEqual({
      texto: '3 de 12 irregulares',
      ordem: 0.25,
    });
    expect(valorCamada('reurb', q({ lotes: 0 })).ordem).toBe(-1);
    expect(valorCamada('prec', base)).toEqual({
      texto: 'GPS do Censo ou confirmado em campo',
      ordem: 5,
    });
    expect(valorCamada('prec', q({ domiciliosPorFonte: {} }))).toEqual({
      texto: 'Sem informação',
      ordem: -1,
    });
  });

  it('suprime contagens de pessoas e domicílios de 1 a 4, nunca os lotes', () => {
    const s = suprimirIndicadores(
      q({ lotesIrregulares: 2, domiciliosPorFonte: { LOTE: 3, CENSO_GPS: 7 }, pcfAtrasadas: null }),
    );
    expect(s.criancas03).toBeNull();
    expect(s.criancasVisita).toBeNull();
    expect(s.idosos).toBe(7);
    expect(s.casosBuscaAtiva).toBe(0);
    expect(s.pcfAtrasadas).toBeNull();
    expect(s.lotesIrregulares).toBe(2);
    expect(s.domiciliosPorFonte).toEqual({ LOTE: null, CENSO_GPS: 7 });
    const comNulo = suprimirIndicadores(q({ domiciliosPorFonte: { CNEFE: null } }));
    expect(comNulo.domiciliosPorFonte).toEqual({ CNEFE: null });
  });

  it('peso do calor agregado: contagem suprimida não entra', () => {
    expect(pesoCalorAgregado('calor03', base)).toBe(3);
    expect(pesoCalorAgregado('calorIdosos', base)).toBe(6);
    expect(pesoCalorAgregado('pcf', base)).toBe(1);
    expect(pesoCalorAgregado('calor03', q({ criancas03: null }))).toBe(0);
    expect(pesoCalorAgregado('vul', base)).toBe(0);
  });

  it('lotes irregulares são os sem inscrição e os em Reurb', () => {
    expect(loteIrregular('SEM_INSCRICAO')).toBe(true);
    expect(loteIrregular('REURB_EM_ANALISE')).toBe(true);
    expect(loteIrregular('REGULAR')).toBe(false);
  });
});

describe('regras de pessoa no mapa', () => {
  it('idosa sozinha sem visita há mais de 90 dias (ou nunca visitada)', () => {
    expect(idosoSozinhoSemVisita({ idade: 70, moradores: 1, diasSemVisitaAcs: 91 })).toBe(true);
    expect(idosoSozinhoSemVisita({ idade: 70, moradores: 1, diasSemVisitaAcs: 90 })).toBe(false);
    expect(idosoSozinhoSemVisita({ idade: 70, moradores: 1, diasSemVisitaAcs: null })).toBe(true);
    expect(idosoSozinhoSemVisita({ idade: 70, moradores: 2, diasSemVisitaAcs: 200 })).toBe(false);
    expect(idosoSozinhoSemVisita({ idade: 59, moradores: 1, diasSemVisitaAcs: 200 })).toBe(false);
  });

  it('Criança Feliz atrasada depois de 14 dias', () => {
    expect(pcfAtrasada(14)).toBe(false);
    expect(pcfAtrasada(15)).toBe(true);
    expect(pcfAtrasada(null)).toBe(true);
  });

  it('soma as pessoas por quadra', () => {
    const p = (x: Partial<PessoaNaQuadra>): PessoaNaQuadra => ({
      quadraId: 1,
      idade: 30,
      moradores: 3,
      diasSemVisitaAcs: 10,
      pcf: null,
      precisaVisita: false,
      buscaAtivaAberta: false,
      ...x,
    });
    const m = somarPessoas([
      p({ idade: 2, pcf: { diasSemVisita: 20 }, precisaVisita: true }),
      p({ idade: 3, pcf: { diasSemVisita: 3 } }),
      p({ idade: 12, buscaAtivaAberta: true, precisaVisita: true }),
      p({ idade: 75, moradores: 1, diasSemVisitaAcs: 120 }),
      p({ idade: 65, moradores: 1, diasSemVisitaAcs: 5 }),
      p({ idade: 80 }),
      p({ idade: null, precisaVisita: true }),
      p({ quadraId: 2, idade: 1 }),
    ]);
    expect(m.get(1)).toEqual({
      criancas03: 2,
      criancasVisita: 2,
      familiasPcf: 2,
      pcfAtrasadas: 1,
      idosos: 3,
      idososSozinhos: 2,
      idososSozinhosSemVisita: 1,
      casosBuscaAtiva: 1,
    });
    expect(m.get(2)?.criancas03).toBe(1);
  });
});
