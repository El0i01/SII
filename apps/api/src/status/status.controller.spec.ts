import { StatusController } from './status.controller';

describe('StatusController', () => {
  it('responde status ok', () => {
    const resposta = new StatusController().verificar();
    expect(resposta.status).toBe('ok');
    expect(resposta.servico).toBe('api');
    expect(Number.isNaN(Date.parse(resposta.horario))).toBe(false);
  });
});
