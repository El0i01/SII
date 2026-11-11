import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configurarApp } from '../src/configurar-app';

describe('GET /api/v1/health', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication();
    configurarApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('responde 200 com status ok', async () => {
    const resposta = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(resposta.body).toMatchObject({ status: 'ok', servico: 'api' });
  });

  it('publica a documentação OpenAPI', async () => {
    const resposta = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    expect(resposta.body.paths).toHaveProperty('/api/v1/health');
  });
});
