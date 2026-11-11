import { Test } from '@nestjs/testing';
import { BatimentoService } from './batimento.service';
import { WorkerModule } from './worker.module';

describe('WorkerModule', () => {
  it('sobe o contexto, conta batimentos e para o timer ao fechar', async () => {
    const modulo = await Test.createTestingModule({ imports: [WorkerModule] }).compile();
    await modulo.init();

    const batimento = modulo.get(BatimentoService);
    batimento.bater();
    expect(batimento.batimentos).toBe(1);

    await modulo.close();
  });
});
