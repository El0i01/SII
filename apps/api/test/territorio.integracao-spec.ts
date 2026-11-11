import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { chaveDeHex } from '../src/cripto/cifra';
import type { PrismaClient } from '../src/generated/prisma/client';
import { semearPrototipo } from '../prisma/seed/prototipo/persistir';
import { semearUsuarios } from '../prisma/seed/usuarios';
import { aplicarGeoportal, importarCamadas, type RelatorioCarga } from '../scripts/geo/carregar';
import { aplicarMigrations, clienteDono, criarApp, usarBancoDeTeste } from './apoio-integracao';

const { url, senhaSeed } = usarBancoDeTeste();
const GEOPORTAL =
  process.env.GEOPORTAL_DIR ??
  path.join(os.homedir(), 'geoportal_itapua-main(1)/geoportal_itapua-main');
const MOBILE = { 'x-sii-cliente': 'mobile' };

let dono: PrismaClient;
let app: INestApplication;
let relatorio: RelatorioCarga;
const tokens = new Map<string, string>();

async function token(login: string) {
  if (!tokens.has(login)) {
    const r = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set(MOBILE)
      .send({ login, senha: senhaSeed });
    tokens.set(login, r.body.acessoToken);
  }
  return tokens.get(login) as string;
}

/** Cálculo independente do SII: GDAL/SpatiaLite direto no shapefile original (o que o QGIS mostra). */
function gdal(shp: string, sql: string): Record<string, string> {
  const camada = path.basename(shp, '.shp');
  const csv = execFileSync(
    'ogr2ogr',
    [
      '-f',
      'CSV',
      '/vsistdout/',
      path.join(GEOPORTAL, shp),
      '-dialect',
      'sqlite',
      '-sql',
      sql.replace('$CAMADA', `"${camada}"`),
    ],
    {
      encoding: 'utf8',
    },
  );
  const [cab, linha] = csv.trim().split('\n');
  const chaves = (cab ?? '').split(',');
  const valores = (linha ?? '').split(',');
  return Object.fromEntries(chaves.map((k, i) => [k, valores[i] ?? '']));
}

beforeAll(async () => {
  aplicarMigrations(url);
  dono = clienteDono(url);
  await semearUsuarios(dono, senhaSeed);
  await semearPrototipo(dono, {
    cifra: chaveDeHex(process.env.CHAVE_CIFRA ?? '', 'CHAVE_CIFRA'),
    hmac: chaveDeHex(process.env.CHAVE_HMAC ?? '', 'CHAVE_HMAC'),
  });
  importarCamadas(GEOPORTAL, url);
  relatorio = await aplicarGeoportal(dono);
  app = await criarApp();
  // Cache limpo para os testes de cache.
  const { RedisService } = await import('../src/redis/redis.service');
  const redis = app.get(RedisService);
  if (redis.status !== 'ready') await new Promise((ok) => redis.once('ready', ok));
  const chaves = await redis.keys('geo:*');
  if (chaves.length) await redis.del(...chaves);
}, 300_000);

afterAll(async () => {
  await app?.close();
  await dono?.$disconnect();
});

describe('carga do geoportal', () => {
  it('relatório: todas as camadas lidas e todos os equipamentos casados', () => {
    expect(relatorio.camadas).toMatchObject({
      setor1: 1,
      industrial: 1,
      ruas: 91,
      saude: 7,
      escolas_mun: 7,
      acs_sede: 6,
      acs_rural: 14,
    });
    expect(relatorio.equipamentosSemFeicao).toEqual([]);
    expect(relatorio.equipamentosComGeometria).toBe(20);
    expect(relatorio.microareasComGeometria).toBe(19);
    expect(relatorio.microareasDuplicadas).toEqual(['urb9 (2 polígonos, unidos)']);
    expect(relatorio.setoresComGeometria).toBe(7);
  });

  it.each([
    ['S01', 'setores/setor1.shp'],
    ['S03', 'setores/setor3.shp'],
    ['SIND', 'setores/industrial.shp'],
  ])('área do setor %s bate com o shapefile original (±0,5%%)', async (codigo, shp) => {
    const esperado = Number(
      gdal(shp, 'SELECT ST_Area(ST_Transform(geometry, 31980)) AS a FROM $CAMADA').a,
    );
    const [l] = await dono.$queryRaw<{ a: number }[]>`
      SELECT ST_Area(ST_Transform(geom, 31980)) AS a FROM territorio.setor WHERE codigo = ${codigo}`;
    expect(Math.abs(Number(l?.a) - esperado) / esperado).toBeLessThan(0.005);
  });

  it.each([
    ['UBS4', 'predios_publicos/saude/saude.shp', 'id = 3'],
    ['CUST', 'predios_publicos/escolas/municipais/escolas_mun.shp', "nome = 'CUST'"],
  ])('o equipamento %s fica onde o shapefile diz (< 1 m)', async (codigo, shp, filtro) => {
    const g = gdal(
      shp,
      `SELECT ST_X(ST_Transform(ST_Centroid(geometry), 4674)) AS x, ST_Y(ST_Transform(ST_Centroid(geometry), 4674)) AS y FROM $CAMADA WHERE ${filtro}`,
    );
    const [l] = await dono.$queryRaw<{ d: number }[]>`
      SELECT ST_Distance(ST_Centroid(geom)::geography, ST_SetSRID(ST_MakePoint(${Number(g.x)}, ${Number(g.y)}), 4674)::geography) AS d
      FROM territorio.equipamento WHERE codigo = ${codigo}`;
    expect(Number(l?.d)).toBeLessThan(1);
  });

  it('zona rural = município menos os setores urbanos, sem sobreposição', async () => {
    const [l] = await dono.$queryRaw<{ sobra: number; sobreposicao: number }[]>`
      SELECT abs(ST_Area(lim.geom::geography) - ST_Area(ST_Union(s.geom)::geography)) / ST_Area(lim.geom::geography) AS sobra,
             (SELECT ST_Area(ST_Intersection(r.geom, u.geom)::geography) FROM territorio.setor r,
                (SELECT ST_Union(geom) AS geom FROM territorio.setor WHERE tipo = 'URBANO') u WHERE r.codigo = 'RUR') AS sobreposicao
      FROM territorio.limite_municipal lim, territorio.setor s GROUP BY lim.geom`;
    expect(Number(l?.sobra)).toBeLessThan(0.001);
    expect(Number(l?.sobreposicao)).toBeLessThan(1);
  });

  it('grade provisória: as 79 quadras com geometria, cada uma dentro do próprio setor', async () => {
    const [l] = await dono.$queryRaw<
      { total: bigint; com: bigint; fora: bigint; provisorias: bigint }[]
    >`
      SELECT count(*) AS total, count(q.geom) AS com, count(*) FILTER (WHERE q.provisoria) AS provisorias,
             count(*) FILTER (WHERE NOT ST_CoveredBy(ST_Buffer(q.geom::geography, -0.5)::geometry, s.geom)) AS fora
      FROM territorio.quadra q JOIN territorio.setor s ON s.id = q.setor_id`;
    expect([Number(l?.total), Number(l?.com), Number(l?.provisorias), Number(l?.fora)]).toEqual([
      79, 79, 79, 0,
    ]);
    expect(relatorio.lotesComGeometria).toBeGreaterThan(900);
  });

  it('todo domicílio tem ponto, dentro do próprio setor', async () => {
    const [l] = await dono.$queryRaw<{ sem: bigint; fora: bigint }[]>`
      SELECT count(*) FILTER (WHERE d.ponto IS NULL) AS sem,
             count(*) FILTER (WHERE d.ponto IS NOT NULL AND NOT ST_Intersects(d.ponto, s.geom)) AS fora
      FROM territorio.domicilio d JOIN territorio.setor s ON s.id = d.setor_id`;
    expect([Number(l?.sem), Number(l?.fora)]).toEqual([0, 0]);
  });
});

describe('GeoJSON do mapa', () => {
  it('setores: FeatureCollection, sem dado pessoal, com cache na segunda chamada', async () => {
    const t = await token('semed.gestor');
    const a = await request(app.getHttpServer())
      .get('/api/v1/territorio/setores.geojson?zoom=14')
      .set('Authorization', `Bearer ${t}`)
      .expect(200);
    expect(a.headers['content-type']).toMatch(/application\/geo\+json/);
    expect(a.headers['x-cache']).toBe('MISS');
    const fc = JSON.parse(a.text);
    expect(fc.type).toBe('FeatureCollection');
    expect(
      fc.features.map((f: { properties: { codigo: string } }) => f.properties.codigo).sort(),
    ).toEqual(['RUR', 'S01', 'S02', 'S03', 'S04', 'S05', 'SIND']);
    const b = await request(app.getHttpServer())
      .get('/api/v1/territorio/setores.geojson?zoom=14')
      .set('Authorization', `Bearer ${t}`)
      .expect(200);
    expect(b.headers['x-cache']).toBe('HIT');
  });

  it('zoom menor = geometria mais simples (payload menor)', async () => {
    const t = await token('semed.gestor');
    const perto = await request(app.getHttpServer())
      .get('/api/v1/territorio/setores.geojson?zoom=18')
      .set('Authorization', `Bearer ${t}`)
      .expect(200);
    const longe = await request(app.getHttpServer())
      .get('/api/v1/territorio/setores.geojson?zoom=9')
      .set('Authorization', `Bearer ${t}`)
      .expect(200);
    expect(longe.text.length).toBeLessThan(perto.text.length);
  });

  it('quadras trazem o IVM; lotes trazem a situação', async () => {
    const t = await token('fazenda.cadastro');
    const q = JSON.parse(
      (
        await request(app.getHttpServer())
          .get('/api/v1/territorio/quadras.geojson')
          .set('Authorization', `Bearer ${t}`)
          .expect(200)
      ).text,
    );
    expect(q.features).toHaveLength(79);
    expect(q.features[0].properties.ivm).toBeGreaterThan(0);
    const l = JSON.parse(
      (
        await request(app.getHttpServer())
          .get('/api/v1/territorio/lotes.geojson')
          .set('Authorization', `Bearer ${t}`)
          .expect(200)
      ).text,
    );
    expect(
      new Set(l.features.map((f: { properties: { situacao: string } }) => f.properties.situacao)),
    ).toEqual(new Set(['REGULAR', 'REURB_EM_ANALISE', 'SEM_INSCRICAO', 'VAZIO']));
  });

  it('o auditor também vê o mapa (não é dado nominal); camada desconhecida dá 422; sem login, 401', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/territorio/equipamentos.geojson')
      .set('Authorization', `Bearer ${await token('tce.auditor')}`)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/territorio/pessoas.geojson')
      .set('Authorization', `Bearer ${await token('tce.auditor')}`)
      .expect(422);
    await request(app.getHttpServer()).get('/api/v1/territorio/setores.geojson').expect(401);
  });
});

describe('geocodificação', () => {
  it('busca de logradouro por similaridade, com ou sem acento e abreviação', async () => {
    const t = await token('acs.area01');
    const r = await request(app.getHttpServer())
      .get('/api/v1/territorio/logradouros?q=r jose silvestre')
      .set('Authorization', `Bearer ${t}`)
      .expect(200);
    expect(r.body[0].nome).toMatch(/Jos[eé] Silvestre/i);
  });

  it('cascata: domicílio da sede → LOTE; da zona rural → SETOR', async () => {
    const t = await token('cti.admin');
    const [sede] = await dono.$queryRaw<{ id: number }[]>`
      SELECT d.id FROM territorio.domicilio d JOIN territorio.lote l ON l.id = d.lote_id WHERE l.geom IS NOT NULL LIMIT 1`;
    const [rural] = await dono.$queryRaw<{ id: number }[]>`
      SELECT d.id FROM territorio.domicilio d JOIN territorio.setor s ON s.id = d.setor_id WHERE s.codigo = 'RUR' LIMIT 1`;
    const a = await request(app.getHttpServer())
      .post(`/api/v1/domicilios/${sede?.id}/geocodificar`)
      .set('Authorization', `Bearer ${t}`)
      .expect(201);
    expect(a.body).toMatchObject({ fonte: 'LOTE', precisaoM: 10 });
    const b = await request(app.getHttpServer())
      .post(`/api/v1/domicilios/${rural?.id}/geocodificar`)
      .set('Authorization', `Bearer ${t}`)
      .expect(201);
    expect(b.body.fonte).toBe('SETOR');
    expect(b.body.precisaoM).toBeGreaterThan(1000);
  });

  it('ACS confirma o pino na própria microárea; fora dela, 404; fora do município, 422', async () => {
    const t = await token('acs.area01');
    const [meu] = await dono.$queryRaw<{ id: number }[]>`
      SELECT domicilio_id AS id FROM pessoas.pessoa_mestra WHERE microarea = 'area01' AND domicilio_id IS NOT NULL LIMIT 1`;
    const [outro] = await dono.$queryRaw<{ id: number }[]>`
      SELECT domicilio_id AS id FROM pessoas.pessoa_mestra p WHERE microarea = 'area04'
        AND NOT EXISTS (SELECT 1 FROM pessoas.pessoa_mestra x WHERE x.domicilio_id = p.domicilio_id AND x.microarea = 'area01') LIMIT 1`;
    const ponto = { latitude: -9.1875, longitude: -63.1875, precisaoM: 6 };
    const ok = await request(app.getHttpServer())
      .put(`/api/v1/domicilios/${meu?.id}/ponto`)
      .set('Authorization', `Bearer ${t}`)
      .send(ponto)
      .expect(200);
    expect(ok.body).toMatchObject({ geoFonte: 'CONFIRMADO_USUARIO', precisaoM: 6 });
    await request(app.getHttpServer())
      .put(`/api/v1/domicilios/${outro?.id}/ponto`)
      .set('Authorization', `Bearer ${t}`)
      .send(ponto)
      .expect(404);
    const fora = await request(app.getHttpServer())
      .put(`/api/v1/domicilios/${meu?.id}/ponto`)
      .set('Authorization', `Bearer ${t}`)
      .send({ latitude: -10.5, longitude: -62.5, precisaoM: 6 })
      .expect(422);
    expect(fora.body.campos.latitude[0]).toMatch(/fora de Itapuã/);

    // A geocodificação automática não passa por cima do ponto confirmado em campo.
    const r = await request(app.getHttpServer())
      .post(`/api/v1/domicilios/${meu?.id}/geocodificar`)
      .set('Authorization', `Bearer ${await token('cti.admin')}`)
      .expect(201);
    expect(r.body.fonte).toBe('CONFIRMADO_USUARIO');
  });

  it('relatório de geocodificação por setor, com supressão < 5', async () => {
    const r = await request(app.getHttpServer())
      .get('/api/v1/territorio/relatorio-geocodificacao')
      .set('Authorization', `Bearer ${await token('tce.auditor')}`)
      .expect(200);
    const s03 = r.body.find((s: { setor: string }) => s.setor === 'S03');
    expect(s03.domicilios).toBeGreaterThan(100);
    expect(s03.precisaoMediaM).toBeGreaterThan(0);
    expect(Object.keys(s03.porFonte)).toEqual(expect.arrayContaining(['CENSO_GPS', 'LOTE']));
    const pequenos = r.body
      .flatMap((s: { porFonte: Record<string, number | string> }) => Object.values(s.porFonte))
      .filter((v: number | string) => typeof v === 'number' && v < 5);
    expect(pequenos).toEqual([]);
  });
});
