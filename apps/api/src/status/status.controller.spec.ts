import type { PrismaService } from '../banco/prisma.service';
import type { RedisService } from '../redis/redis.service';
import { LIMITE_VERIFICACAO_MS, StatusController } from './status.controller';

function criar(opcoes: { banco?: () => Promise<unknown>; redis?: () => Promise<string> }) {
  const prisma = {
    $queryRaw: jest.fn(opcoes.banco ?? (async () => [{ versao: '3.4.3' }])),
  } as unknown as PrismaService;
  const redis = { ping: jest.fn(opcoes.redis ?? (async () => 'PONG')) } as unknown as RedisService;
  return new StatusController(prisma, redis);
}

describe('StatusController', () => {
  it('ok quando banco e Redis respondem', async () => {
    const estado = await criar({}).verificar();
    expect(estado.status).toBe('ok');
    expect(estado.banco).toMatchObject({ ok: true, postgis: '3.4.3' });
    expect(estado.redis.ok).toBe(true);
  });

  it('degradado quando o banco cai, sem vazar a mensagem do erro', async () => {
    const estado = await criar({
      banco: async () => {
        throw new Error('password authentication failed for user "sii"');
      },
    }).verificar();
    expect(estado.status).toBe('degradado');
    expect(estado.banco.ok).toBe(false);
    expect(estado.banco).not.toHaveProperty('postgis');
    expect(JSON.stringify(estado)).not.toMatch(/password/);
    expect(estado.redis.ok).toBe(true);
  });

  it('degradado quando o Redis cai', async () => {
    const estado = await criar({
      redis: async () => {
        throw new Error('ECONNREFUSED');
      },
    }).verificar();
    expect(estado.status).toBe('degradado');
    expect(estado.redis.ok).toBe(false);
    expect(estado.banco.ok).toBe(true);
  });

  it('dá tempo limite quando uma dependência não responde', async () => {
    jest.useFakeTimers();
    try {
      const pendente = criar({ redis: () => new Promise<string>(() => undefined) }).verificar();
      await jest.advanceTimersByTimeAsync(LIMITE_VERIFICACAO_MS + 1);
      const estado = await pendente;
      expect(estado.redis.ok).toBe(false);
      expect(estado.status).toBe('degradado');
    } finally {
      jest.useRealTimers();
    }
  });
});
