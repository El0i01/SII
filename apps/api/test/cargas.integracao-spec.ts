import type { INestApplication } from '@nestjs/common';
import { FILA_CARGAS } from '@sii/shared';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import request from 'supertest';
import { chaveObjeto, clienteMinio, configMinio } from '../src/cargas/armazenamento';
import type { PrismaClient } from '../src/generated/prisma/client';
import { semearUsuarios } from '../prisma/seed/usuarios';
import { aplicarMigrations, clienteDono, criarApp, usarBancoDeTeste } from './apoio-integracao';

/**
 * Envio de cargas pela API (P08): perfil, validação, arquivo no MinIO e job na fila.
 * Redis no banco 15 e bucket de teste: um worker de desenvolvimento rodando não pega estes jobs.
 */
const { url, senhaSeed } = usarBancoDeTeste();
process.env.REDIS_URL = `${(process.env.REDIS_URL ?? '').replace(/\/\d*$/, '')}/15`;
process.env.MINIO_BUCKET_CARGAS = 'sii-cargas-teste';
const MOBILE = { 'x-sii-cliente': 'mobile' };
const CSV = Buffer.from('p.nom_pessoa;p.num_nis_pessoa_atual\nAna;12345678900\n', 'latin1');

let dono: PrismaClient;
let app: INestApplication;
let redis: Redis;
let fila: Queue;
const criadas: number[] = [];

async function como(login: string) {
  const r = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .set(MOBILE)
    .send({ login, senha: senhaSeed });
  return { Authorization: `Bearer ${r.body.acessoToken}` };
}

beforeAll(async () => {
  aplicarMigrations(url);
  dono = clienteDono(url);
  await semearUsuarios(dono, senhaSeed);
  redis = new Redis(process.env.REDIS_URL as string, { maxRetriesPerRequest: null });
  fila = new Queue(FILA_CARGAS, { connection: redis });
  await fila.obliterate({ force: true });
  app = await criarApp();
}, 120_000);

afterAll(async () => {
  const minio = configMinio(process.env);
  const cliente = clienteMinio(minio);
  for (const id of criadas)
    await cliente.removeObject(minio.bucket, chaveObjeto('CADUNICO', id)).catch(() => undefined);
  if (criadas.length) await dono.logCarga.deleteMany({ where: { id: { in: criadas } } });
  await fila?.obliterate({ force: true });
  await fila?.close();
  redis?.disconnect();
  await app?.close();
  await dono?.$disconnect();
});

describe('POST /cargas', () => {
  it('escola não envia carga (403)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/cargas')
      .set(await como('escola.custodio'))
      .field('fonte', 'CADUNICO')
      .field('mesReferencia', '2026-10')
      .attach('arquivo', CSV, 'cecad.csv')
      .expect(403);
  });

  it('ponto focal da Assistência envia: arquivo no MinIO, LogCarga AGUARDANDO e job só com o id', async () => {
    const r = await request(app.getHttpServer())
      .post('/api/v1/cargas')
      .set(await como('assistencia.gestor'))
      .field('fonte', 'CADUNICO')
      .field('mesReferencia', '2026-10')
      .attach('arquivo', CSV, 'Base Ação.csv')
      .expect(201);
    criadas.push(r.body.id);
    expect(r.body).toMatchObject({
      status: 'AGUARDANDO',
      arquivo: 'Base Ação.csv',
      mesReferencia: '2026-10',
    });

    const log = await dono.logCarga.findUniqueOrThrow({ where: { id: r.body.id } });
    expect(log.objeto).toBe(chaveObjeto('CADUNICO', r.body.id));
    const minio = configMinio(process.env);
    const stat = await clienteMinio(minio).statObject(minio.bucket, log.objeto as string);
    expect(stat.size).toBe(CSV.length);

    const job = await fila.getJob(`carga-${r.body.id}`);
    expect(job?.data).toEqual({ cargaId: r.body.id });
    expect(job?.opts.attempts).toBe(3);

    const lista = await request(app.getHttpServer())
      .get('/api/v1/cargas')
      .set(await como('assistencia.gestor'))
      .expect(200);
    expect(lista.body[0].id).toBe(r.body.id);
    const erros = await request(app.getHttpServer())
      .get(`/api/v1/cargas/${r.body.id}/erros`)
      .set(await como('cti.admin'))
      .expect(200);
    expect(erros.body).toEqual({ total: 0, pagina: 1, tamanho: 50, itens: [] });
  });

  it('planilha do Excel, sem arquivo e mês inválido: 422 com a mensagem no campo', async () => {
    const auth = await como('assistencia.gestor');
    const xlsx = await request(app.getHttpServer())
      .post('/api/v1/cargas')
      .set(auth)
      .field('fonte', 'CADUNICO')
      .field('mesReferencia', '2026-10')
      .attach('arquivo', CSV, 'base.xlsx')
      .expect(422);
    expect(xlsx.body.campos.arquivo[0]).toContain('envie o arquivo .csv');

    const semArquivo = await request(app.getHttpServer())
      .post('/api/v1/cargas')
      .set(auth)
      .field('fonte', 'CADUNICO')
      .field('mesReferencia', '2026-10')
      .expect(422);
    expect(semArquivo.body.campos.arquivo[0]).toBe('Escolha o arquivo para enviar.');

    const mes = await request(app.getHttpServer())
      .post('/api/v1/cargas')
      .set(auth)
      .field('fonte', 'CADUNICO')
      .field('mesReferencia', '10/2026')
      .attach('arquivo', CSV, 'cecad.csv')
      .expect(422);
    expect(Object.keys(mes.body.campos)).toEqual(['mesReferencia']);
  });

  it('carga inexistente: 404', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/cargas/999999')
      .set(await como('cti.admin'))
      .expect(404);
  });
});

describe('GET /cargas/alertas (P09)', () => {
  it('só a CTI vê; a falha do e-SUS aparece até uma carga OK da mesma fonte', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/cargas/alertas')
      .set(await como('assistencia.gestor'))
      .expect(403);

    const erro =
      'A estrutura do banco do e-SUS mudou (provável atualização do PEC): falta tb_cidadao.dt_atualizado.';
    const falha = await dono.logCarga.create({
      data: { fonte: 'ESUS_PEC', status: 'FALHOU', erro, fimEm: new Date() },
    });
    criadas.push(falha.id);
    const cti = await como('cti.admin');
    const r = await request(app.getHttpServer()).get('/api/v1/cargas/alertas').set(cti).expect(200);
    expect(r.body).toEqual([expect.objectContaining({ id: falha.id, fonte: 'ESUS_PEC', erro })]);
    const lista = await request(app.getHttpServer()).get('/api/v1/cargas').set(cti).expect(200);
    expect(lista.body.map((c: { id: number }) => c.id)).toContain(falha.id);

    const ok = await dono.logCarga.create({
      data: { fonte: 'ESUS_PEC', status: 'OK', modo: 'COMPLETA', fimEm: new Date() },
    });
    criadas.push(ok.id);
    const depois = await request(app.getHttpServer())
      .get('/api/v1/cargas/alertas')
      .set(cti)
      .expect(200);
    expect(depois.body.filter((a: { fonte: string }) => a.fonte === 'ESUS_PEC')).toEqual([]);
  });
});
