import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/banco/prisma.service';
import { configurarApp } from '../src/configurar-app';
import { RedisService } from '../src/redis/redis.service';

// Banco e Redis simulados: este e2e testa a API, não a infra (essa fica no test:integracao).
const prisma = { $queryRaw: jest.fn(), $disconnect: jest.fn() };
const redis = { ping: jest.fn(), disconnect: jest.fn() };

describe('GET /api/v1/health', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.DATABASE_URL ??= 'postgresql://teste:teste@localhost:1/teste';
    process.env.REDIS_URL ??= 'redis://localhost:1/0';
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(RedisService)
      .useValue(redis)
      .compile();
    app = modulo.createNestApplication({ logger: false });
    configurarApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('200 quando banco e Redis respondem', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([{ versao: '3.4.3' }]);
    redis.ping.mockResolvedValueOnce('PONG');
    const resposta = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(resposta.body).toMatchObject({
      status: 'ok',
      servico: 'api',
      banco: { ok: true, postgis: '3.4.3' },
      redis: { ok: true },
    });
  });

  it('503 quando o Redis está fora', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([{ versao: '3.4.3' }]);
    redis.ping.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const resposta = await request(app.getHttpServer()).get('/api/v1/health').expect(503);
    expect(resposta.body).toMatchObject({ status: 'degradado', redis: { ok: false } });
  });

  it('publica a documentação OpenAPI', async () => {
    const resposta = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    expect(resposta.body.paths).toHaveProperty('/api/v1/health');
  });
});
