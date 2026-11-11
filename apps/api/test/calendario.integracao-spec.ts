import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { PrismaClient } from '../src/generated/prisma/client';
import { semearPrototipo } from '../prisma/seed/prototipo/persistir';
import { semearUsuarios } from '../prisma/seed/usuarios';
import { chaveDeHex } from '../src/cripto/cifra';
import { aplicarMigrations, clienteDono, criarApp, usarBancoDeTeste } from './apoio-integracao';

const { url, senhaSeed } = usarBancoDeTeste();
const MOBILE = { 'x-sii-cliente': 'mobile' };
const CUSTODIO = '11005165';

let dono: PrismaClient;
let app: INestApplication;
const tokens = new Map<string, string>();

async function token(login: string) {
  const guardado = tokens.get(login);
  if (guardado) return guardado;
  const r = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .set(MOBILE)
    .send({ login, senha: senhaSeed });
  tokens.set(login, r.body.acessoToken);
  return r.body.acessoToken as string;
}

beforeAll(async () => {
  aplicarMigrations(url);
  dono = clienteDono(url);
  await semearUsuarios(dono, senhaSeed);
  await semearPrototipo(dono, {
    cifra: chaveDeHex(process.env.CHAVE_CIFRA ?? '', 'CHAVE_CIFRA'),
    hmac: chaveDeHex(process.env.CHAVE_HMAC ?? '', 'CHAVE_HMAC'),
  });
  app = await criarApp();
}, 180_000);

afterAll(async () => {
  await app?.close();
  await dono?.$disconnect();
});

const PARAMETROS = {
  inicio: '2026-02-09',
  fim: '2026-12-18',
  recessos: [{ inicio: '2026-07-06', fim: '2026-07-24' }],
  feriados: ['2026-04-21', '2026-05-01'],
  letivosExtras: ['2026-03-14'],
};

describe('calendário escolar configurável', () => {
  it('a escola consulta o próprio calendário, gravado pelo seed', async () => {
    const r = await request(app.getHttpServer())
      .get(`/api/v1/escolas/${CUSTODIO}/calendario/2026`)
      .set('Authorization', `Bearer ${await token('escola.custodio')}`)
      .expect(200);
    expect(r.body.parametros.inicio).toBe('2026-02-09');
    expect(r.body.diasLetivos).toBeGreaterThan(180);
  });

  it('a escola não altera o calendário (403) nem consulta o de outra escola', async () => {
    const escola = await token('escola.custodio');
    await request(app.getHttpServer())
      .put(`/api/v1/escolas/${CUSTODIO}/calendario/2026`)
      .set('Authorization', `Bearer ${escola}`)
      .send(PARAMETROS)
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/escolas/11005378/calendario/2026')
      .set('Authorization', `Bearer ${escola}`)
      .expect(403);
  });

  it('a SEMED define o calendário e os dias letivos são regerados', async () => {
    const semed = await token('semed.gestor');
    const r = await request(app.getHttpServer())
      .put(`/api/v1/escolas/${CUSTODIO}/calendario/2026`)
      .set('Authorization', `Bearer ${semed}`)
      .send(PARAMETROS)
      .expect(200);
    const [linha] = await dono.$queryRaw<{ n: bigint; sabado: boolean; feriado: boolean }[]>`
      SELECT count(*) AS n,
             bool_or(c.dia = '2026-03-14') AS sabado,
             bool_or(c.dia = '2026-04-21') AS feriado
      FROM educacao.calendario_escolar c JOIN educacao.escola e ON e.id = c.escola_id
      WHERE e.inep = ${CUSTODIO}`;
    expect(Number(linha?.n)).toBe(r.body.diasLetivos);
    expect(linha?.sabado).toBe(true);
    expect(linha?.feriado).toBe(false);
  });

  it('calendário de outro ano ou com fim antes do início é recusado (422)', async () => {
    const semed = await token('semed.gestor');
    const outroAno = await request(app.getHttpServer())
      .put(`/api/v1/escolas/${CUSTODIO}/calendario/2027`)
      .set('Authorization', `Bearer ${semed}`)
      .send(PARAMETROS)
      .expect(422);
    expect(outroAno.body.campos).toHaveProperty('inicio');
    const invertido = await request(app.getHttpServer())
      .put(`/api/v1/escolas/${CUSTODIO}/calendario/2026`)
      .set('Authorization', `Bearer ${semed}`)
      .send({ ...PARAMETROS, inicio: '2026-12-18', fim: '2026-02-09' })
      .expect(422);
    expect(invertido.body.campos).toHaveProperty('fim');
  });

  it('a SEMED aplica o mesmo calendário a toda a rede municipal', async () => {
    const r = await request(app.getHttpServer())
      .put('/api/v1/calendarios/2026?rede=MUNICIPAL')
      .set('Authorization', `Bearer ${await token('semed.gestor')}`)
      .send(PARAMETROS)
      .expect(200);
    expect(r.body.escolas).toBe(5);
    const estaduais = await dono.calendarioParametros.findMany({
      where: { escola: { rede: 'ESTADUAL' } },
      select: { parametros: true, diasLetivos: true },
    });
    // As estaduais (calendário da SEDUC) continuam com o calendário anterior, gravado pelo seed:
    // 15 feriados e sem o sábado letivo extra.
    expect(estaduais).toHaveLength(2);
    for (const e of estaduais) {
      const p = e.parametros as { feriados: string[]; letivosExtras: string[] };
      expect(p.feriados).toHaveLength(15);
      expect(p.letivosExtras).toEqual([]);
      expect(e.diasLetivos).not.toBe(r.body.diasLetivos);
    }
  });
});
