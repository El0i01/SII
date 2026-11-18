import type { INestApplication } from '@nestjs/common';
import { hojeEmPortoVelho } from '@sii/shared';
import request from 'supertest';
import { semearPrototipo } from '../prisma/seed/prototipo/persistir';
import { semearUsuarios } from '../prisma/seed/usuarios';
import { chaveDeHex } from '../src/cripto/cifra';
import type { PrismaClient } from '../src/generated/prisma/client';
import { aplicarMigrations, clienteDono, criarApp, usarBancoDeTeste } from './apoio-integracao';

const { url, senhaSeed } = usarBancoDeTeste();
const MOBILE = { 'x-sii-cliente': 'mobile' };

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
const como = async (login: string) => ({ Authorization: `Bearer ${await token(login)}` });
const http = () => request(app.getHttpServer());

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

describe('visão geral (P14)', () => {
  it('números do município conferem com o seed', async () => {
    const r = await http()
      .get('/api/v1/painel/visao-geral')
      .set(await como('comite.gestor'))
      .expect(200);
    const hoje = hojeEmPortoVelho();
    const abertos = await dono.caso.count({ where: { encerradoEm: null } });
    expect(r.body.kpis).toMatchObject({
      pessoas: await dono.pessoaMestra.count(),
      domicilios: await dono.domicilio.count(),
      casosAbertos: abertos,
      rematriculas: await dono.caso.count({
        where: {
          tipo: 'BUSCA_ATIVA_ESCOLAR',
          status: 'MATRICULADO',
          encerradoEm: { gte: new Date(`${hoje.slice(0, 4)}-01-01T04:00:00Z`) },
        },
      }),
    });
    expect(r.body.kpis.vacinacaoEmDia).toEqual(expect.any(Number));
    expect(r.body.kpis.pontoPreciso).toEqual(expect.any(Number));
    expect(r.body.serie).toHaveLength(12);
    expect(r.body.serie.at(-1).abertos).toBe(abertos);
    const somaResp = r.body.porResponsavel.reduce(
      (a: number, x: { valor: number }) => a + x.valor,
      0,
    );
    expect(somaResp).toBe(abertos);
    expect(r.body.pauta.total).toBe(
      await dono.caso.count({ where: { nivel: 3, encerradoEm: null } }),
    );
    expect(r.body.pauta.itens.length).toBeLessThanOrEqual(8);
    expect(r.body.atencao.map((a: { titulo: string }) => a.titulo)).toContain(
      'Matrículas estaduais desatualizadas',
    );
    expect(JSON.stringify(r.body)).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}|"nome":"[A-Z][a-z]+ /);
  });

  it('filtro de território e período', async () => {
    const r = await http()
      .get('/api/v1/painel/visao-geral?territorio=S03&periodo=2026-10')
      .set(await como('comite.gestor'))
      .expect(200);
    expect(r.body.territorio).toEqual({ codigo: 'S03', nome: 'Setor 03' });
    expect(r.body.referencia).toBe('Outubro de 2026');
    expect(r.body.serie.at(-1).mes).toBe('2026-10');
    expect(r.body.kpis.pessoas).toBe(
      await dono.pessoaMestra.count({ where: { setorCodigo: 'S03' } }),
    );
    expect(r.body.kpis.casosAbertos).toBe(
      await dono.caso.count({ where: { encerradoEm: null, setorCodigo: 'S03' } }),
    );
    await http()
      .get('/api/v1/painel/visao-geral?periodo=2026-13')
      .set(await como('comite.gestor'))
      .expect(422);
  });

  it('a escola conta só o que a RLS deixa ver; sem pauta', async () => {
    const r = await http()
      .get('/api/v1/painel/visao-geral')
      .set(await como('escola.custodio'))
      .expect(200);
    expect(r.body.kpis.pessoas).toBe(
      await dono.pessoaMestra.count({ where: { escolaInep: '11005165' } }),
    );
    expect(r.body.pauta).toBeNull();
  });

  it('auditor: só números, < 5 suprimido, sem pauta nem alertas de caso', async () => {
    const r = await http()
      .get('/api/v1/painel/visao-geral')
      .set(await como('tce.auditor'))
      .expect(200);
    expect(r.body.suprimido).toBe(true);
    expect(r.body.pauta).toBeNull();
    expect(r.body.kpis.pessoas).toBe(await dono.pessoaMestra.count());
    for (const b of r.body.porTerritorio) {
      if (b.valor !== null) expect(b.valor === 0 || b.valor >= 5).toBe(true);
    }
    expect(r.body.atencao.map((a: { link: string }) => a.link)).not.toContain('/notificacoes');
  });

  it('Fazenda e DPO não abrem a visão geral; setores para qualquer usuário logado', async () => {
    await http()
      .get('/api/v1/painel/visao-geral')
      .set(await como('fazenda.cadastro'))
      .expect(403);
    await http()
      .get('/api/v1/painel/visao-geral')
      .set(await como('dpo.encarregado'))
      .expect(403);
    const s = await http()
      .get('/api/v1/territorio/setores')
      .set(await como('dpo.encarregado'))
      .expect(200);
    expect(s.body).toContainEqual({ codigo: 'S03', nome: 'Setor 03' });
    await http().get('/api/v1/territorio/setores').expect(401);
  });
});
