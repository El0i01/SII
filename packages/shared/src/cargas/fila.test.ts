import { describe, expect, it } from 'vitest';
import {
  cargaDoJob,
  cargaTerminou,
  ETAPAS_CARGA,
  ROTULO_ETAPA,
  ROTULO_STATUS_CARGA,
  STATUS_CARGA,
} from './fila';

describe('fila de cargas', () => {
  it('toda etapa e todo status têm rótulo', () => {
    for (const e of ETAPAS_CARGA) expect(ROTULO_ETAPA[e]).toBeTruthy();
    for (const s of STATUS_CARGA) expect(ROTULO_STATUS_CARGA[s]).toBeTruthy();
  });

  it('só OK, REJEITADA e FALHOU encerram a carga', () => {
    expect(STATUS_CARGA.filter(cargaTerminou)).toEqual(['OK', 'REJEITADA', 'FALHOU']);
  });

  it('o job noturno do e-SUS nasce sem carga', () => {
    expect(cargaDoJob({ fonte: 'ESUS_PEC' })).toBeUndefined();
    expect(cargaDoJob({ fonte: 'ESUS_PEC', cargaId: 4 })).toBe(4);
    expect(cargaDoJob({ cargaId: 9 })).toBe(9);
  });
});
