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

interface Quadra {
  id: number;
  codigo: string;
  setor: string;
  lotes: number;
  lotesIrregulares: number;
  criancas03: number | null;
  casosBuscaAtiva: number | null;
  idosos: number | null;
  domicilios: number | null;
}

/** Nenhuma resposta do mapa tem nome, CPF, NIS ou CNS (nem a chave). */
function semDadoPessoal(corpo: unknown) {
  const texto = JSON.stringify(corpo);
  expect(texto).not.toMatch(/"(nome|cpf|nis|cns)[A-Za-z]*"/i);
}

describe('mapa do território (P15)', () => {
  it('indicadores por quadra conferem com SQL independente', async () => {
    const r = await http()
      .get('/api/v1/mapa/quadras')
      .set(await como('comite.gestor'))
      .expect(200);
    semDadoPessoal(r.body);
    expect(r.body.agregado).toBe(false);
    const quadras = r.body.quadras as Quadra[];
    expect(quadras).toHaveLength(await dono.quadra.count());

    const lotes = await dono.$queryRaw<{ quadra_id: number; n: number; irr: number }[]>`
      SELECT quadra_id, count(*)::int AS n,
             count(*) FILTER (WHERE situacao IN ('SEM_INSCRICAO', 'REURB_EM_ANALISE'))::int AS irr
      FROM territorio.lote GROUP BY 1`;
    for (const l of lotes) {
      const q = quadras.find((x) => x.id === l.quadra_id);
      expect(q).toMatchObject({ lotes: l.n, lotesIrregulares: l.irr });
    }

    const hoje = hojeEmPortoVelho();
    const [esperado] = await dono.$queryRaw<
      { c03: number; ba: number; idosos: number; dom: number }[]
    >`
      SELECT
        (SELECT count(*)::int FROM pessoas.pessoa_mestra p JOIN territorio.domicilio d ON d.id = p.domicilio_id
          WHERE d.lote_id IS NOT NULL AND p.data_nascimento > ${hoje}::date - interval '4 years') AS c03,
        (SELECT count(DISTINCT p.id)::int FROM pessoas.pessoa_mestra p
           JOIN territorio.domicilio d ON d.id = p.domicilio_id
           JOIN casos.caso c ON c.pessoa_id = p.id
          WHERE d.lote_id IS NOT NULL AND c.tipo = 'BUSCA_ATIVA_ESCOLAR' AND c.encerrado_em IS NULL) AS ba,
        (SELECT count(*)::int FROM pessoas.pessoa_mestra p JOIN territorio.domicilio d ON d.id = p.domicilio_id
          WHERE d.lote_id IS NOT NULL AND p.data_nascimento <= ${hoje}::date - interval '60 years') AS idosos,
        (SELECT count(*)::int FROM territorio.domicilio WHERE lote_id IS NOT NULL) AS dom`;
    const soma = (k: keyof Quadra) => quadras.reduce((a, q) => a + Number(q[k] ?? 0), 0);
    expect(soma('criancas03')).toBe(esperado?.c03);
    expect(soma('casosBuscaAtiva')).toBe(esperado?.ba);
    expect(soma('idosos')).toBe(esperado?.idosos);
    expect(soma('domicilios')).toBe(esperado?.dom);
    expect(r.body.rural.domicilios).toBeGreaterThan(0);
  });

  it('território do cabeçalho filtra as quadras', async () => {
    const r = await http()
      .get('/api/v1/mapa/quadras?territorio=S02')
      .set(await como('comite.gestor'))
      .expect(200);
    const quadras = r.body.quadras as Quadra[];
    expect(quadras.length).toBeGreaterThan(0);
    expect(quadras.every((q) => q.setor === 'S02')).toBe(true);
  });

  it('o ACS só conta quem a RLS deixa ver (a microárea dele)', async () => {
    const [todos, acs] = await Promise.all([
      http()
        .get('/api/v1/mapa/quadras')
        .set(await como('comite.gestor')),
      http()
        .get('/api/v1/mapa/quadras')
        .set(await como('acs.area01')),
    ]);
    const soma = (b: { quadras: Quadra[] }) =>
      b.quadras.reduce((a, q) => a + Number(q.idosos ?? 0), 0);
    expect(acs.status).toBe(200);
    expect(soma(acs.body)).toBeGreaterThan(0);
    expect(soma(acs.body)).toBeLessThan(soma(todos.body));
  });

  it('pontos: só coordenadas, só para perfis nominais', async () => {
    const r = await http()
      .get('/api/v1/mapa/pontos')
      .set(await como('comite.gestor'))
      .expect(200);
    semDadoPessoal(r.body);
    const comPonto = await dono.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM pessoas.pessoa_mestra p JOIN territorio.domicilio d ON d.id = p.domicilio_id
      WHERE d.lote_id IS NOT NULL AND d.ponto IS NOT NULL
        AND p.data_nascimento > ${hojeEmPortoVelho()}::date - interval '4 years'`;
    expect(r.body.calor03).toHaveLength(comPonto[0]?.n ?? 0);
    for (const p of r.body.calor03) expect(p).toEqual([expect.any(Number), expect.any(Number)]);
    for (const p of r.body.pcf) expect(Object.keys(p).sort()).toEqual(['atrasada', 'c']);

    await http()
      .get('/api/v1/mapa/pontos')
      .set(await como('tce.auditor'))
      .expect(403);
    await http()
      .get('/api/v1/mapa/pontos')
      .set(await como('fazenda.cadastro'))
      .expect(403);
    await http()
      .get('/api/v1/mapa/quadras')
      .set(await como('dpo.encarregado'))
      .expect(403);
  });

  it('auditor: contagens < 5 suprimidas e detalhe sem moradores', async () => {
    const r = await http()
      .get('/api/v1/mapa/quadras')
      .set(await como('tce.auditor'))
      .expect(200);
    expect(r.body.agregado).toBe(true);
    const quadras = r.body.quadras as Quadra[];
    for (const q of quadras)
      for (const k of ['criancas03', 'casosBuscaAtiva', 'idosos', 'domicilios'] as const) {
        const v = q[k];
        expect(v === null || v === 0 || (v as number) >= 5).toBe(true);
      }
    expect(quadras.some((q) => q.criancas03 === null)).toBe(true);

    const alvo = quadras[0] as Quadra;
    const d = await http()
      .get(`/api/v1/mapa/quadras/${alvo.id}`)
      .set(await como('tce.auditor'))
      .expect(200);
    expect(d.body.lotes.length).toBe(alvo.lotes);
    for (const l of d.body.lotes) expect(l.moradores).toBeUndefined();
  });

  it('detalhe nominal: moradores por lote com iniciais, sem nome', async () => {
    const [q] = await dono.$queryRaw<{ id: number; n: number }[]>`
      SELECT l.quadra_id AS id, count(*)::int AS n FROM pessoas.pessoa_mestra p
      JOIN territorio.domicilio d ON d.id = p.domicilio_id JOIN territorio.lote l ON l.id = d.lote_id
      GROUP BY 1 ORDER BY 2 DESC LIMIT 1`;
    const r = await http()
      .get(`/api/v1/mapa/quadras/${q?.id}`)
      .set(await como('comite.gestor'))
      .expect(200);
    semDadoPessoal(r.body);
    const moradores = r.body.lotes.flatMap((l: { moradores: unknown[] }) => l.moradores);
    expect(moradores).toHaveLength(q?.n ?? 0);
    for (const m of moradores) expect(m.iniciais).toMatch(/^([A-ZÀ-Ú]\. ?)+$/);
    const crianca = moradores.find((m: { crianca: boolean }) => m.crianca);
    if (crianca) expect(crianca.fichaId).toEqual(expect.any(Number));
    await http()
      .get('/api/v1/mapa/quadras/999999')
      .set(await como('comite.gestor'))
      .expect(404);
  });
});
