import { Test } from '@nestjs/testing';
import { BatimentoService } from './batimento.service';

describe('BatimentoService', () => {
  it('conta batimentos e para o timer ao fechar', async () => {
    const modulo = await Test.createTestingModule({ providers: [BatimentoService] }).compile();
    await modulo.init();

    const batimento = modulo.get(BatimentoService);
    batimento.bater();
    expect(batimento.batimentos).toBe(1);

    await modulo.close();
  });
});
