import { describe, expect, it } from 'vitest';
import { cascataGeocodificacao, FONTES_GEO, PRECISAO_PADRAO_M } from './geocodificacao';

const sede = { lat: -9.1875, lon: -63.1875 };

describe('cascata de geocodificação (§3.2)', () => {
  it('ordem fixa, com a confirmação do usuário em primeiro', () => {
    expect(FONTES_GEO).toEqual([
      'CONFIRMADO_USUARIO',
      'CENSO_GPS',
      'LOTE',
      'ESUS_TERRITORIO',
      'CNEFE',
      'SIGEF_CAR',
      'SETOR',
    ]);
    expect(PRECISAO_PADRAO_M).toEqual({ CENSO_GPS: 5, LOTE: 10, ESUS_TERRITORIO: 30 });
  });

  it('a primeira fonte disponível vence, com a precisão padrão quando não informada', () => {
    expect(
      cascataGeocodificacao([
        { fonte: 'SETOR', ...sede, precisaoM: 800 },
        { fonte: 'LOTE', ...sede },
        { fonte: 'ESUS_TERRITORIO', ...sede, precisaoM: 20 },
      ]),
    ).toEqual({ fonte: 'LOTE', ...sede, precisaoM: 10 });
  });

  it('confirmação do usuário vence até o Censo', () => {
    const r = cascataGeocodificacao([
      { fonte: 'CENSO_GPS', ...sede },
      { fonte: 'CONFIRMADO_USUARIO', lat: -9.18, lon: -63.18, precisaoM: 4 },
    ]);
    expect(r).toEqual({ fonte: 'CONFIRMADO_USUARIO', lat: -9.18, lon: -63.18, precisaoM: 4 });
  });

  it('no CNEFE, nível 1 > 2 > 3', () => {
    const r = cascataGeocodificacao([
      { fonte: 'CNEFE', ...sede, precisaoM: 100, nivelCnefe: 3 },
      { fonte: 'CNEFE', lat: -9.19, lon: -63.19, precisaoM: 40, nivelCnefe: 1 },
      { fonte: 'CNEFE', ...sede, precisaoM: 60, nivelCnefe: 2 },
    ]);
    expect(r).toMatchObject({ fonte: 'CNEFE', nivelCnefe: 1, lat: -9.19 });
  });

  it('dois candidatos da mesma fonte: vence o mais preciso', () => {
    const r = cascataGeocodificacao([
      { fonte: 'ESUS_TERRITORIO', ...sede, precisaoM: 28 },
      { fonte: 'ESUS_TERRITORIO', lat: -9.2, lon: -63.2, precisaoM: 15 },
    ]);
    expect(r?.precisaoM).toBe(15);
  });

  it('descarta coordenadas inválidas e devolve null sem candidato', () => {
    expect(
      cascataGeocodificacao([
        { fonte: 'CENSO_GPS', lat: 0, lon: 0 },
        { fonte: 'LOTE', lat: 95, lon: -63 },
        { fonte: 'LOTE', lat: Number.NaN, lon: -63 },
      ]),
    ).toBeNull();
    expect(cascataGeocodificacao([])).toBeNull();
  });

  it('fonte sem precisão padrão exige precisaoM', () => {
    expect(() => cascataGeocodificacao([{ fonte: 'SETOR', ...sede }])).toThrow(TypeError);
    expect(() => cascataGeocodificacao([{ fonte: 'CONFIRMADO_USUARIO', ...sede }])).toThrow(
      TypeError,
    );
  });
});
