import { describe, expect, it } from 'vitest';
import { DESFECHOS } from '../enums/dominio';
import { efeitoDoParecer } from './parecer';

describe('efeitoDoParecer (§4.1)', () => {
  it('fecha o caso nos desfechos comuns, sem nova visita', () => {
    for (const d of DESFECHOS.filter((x) => x !== 'ENCAMINHADO_CONSELHO_TUTELAR'))
      expect(efeitoDoParecer(d, false)).toEqual({ encerraCaso: true, eventosExtras: [] });
  });

  it('Conselho Tutelar mantém o caso aberto e registra o encaminhamento na trilha', () => {
    expect(efeitoDoParecer('ENCAMINHADO_CONSELHO_TUTELAR', false)).toEqual({
      encerraCaso: false,
      eventosExtras: ['ENCAMINHADO_CONSELHO_TUTELAR'],
    });
  });

  it('nova visita programada mantém o caso aberto', () => {
    expect(efeitoDoParecer('RETORNO_ESCOLA_COMBINADO', true)).toEqual({
      encerraCaso: false,
      eventosExtras: [],
    });
  });
});
