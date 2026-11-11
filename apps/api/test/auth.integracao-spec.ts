import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/banco/prisma.service';
import type { PrismaClient } from '../src/generated/prisma/client';
import { semearFixtureRls } from './fixtures/rls';
import {
  aplicarMigrations,
  clienteDono,
  cookies,
  criarApp,
  usarBancoDeTeste,
} from './apoio-integracao';

const { url, senhaSeed } = usarBancoDeTeste();
const MOBILE = { 'x-sii-cliente': 'mobile' };

let dono: PrismaClient;

beforeAll(async () => {
  aplicarMigrations(url);
  dono = clienteDono(url);
  await semearFixtureRls(dono, senhaSeed);
}, 120_000);

afterAll(async () => {
  await dono?.$disconnect();
});

async function entrarMobile(app: INestApplication, login: string, senha = senhaSeed) {
  const r = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .set(MOBILE)
    .send({ login, senha });
  return r;
}

// Um login por usuário e por app: cada app tem o próprio limite de 10 logins por minuto.
const tokens = new WeakMap<INestApplication, Map<string, string>>();
async function tokenDe(app: INestApplication, login: string): Promise<string> {
  const doApp = tokens.get(app) ?? new Map<string, string>();
  tokens.set(app, doApp);
  const guardado = doApp.get(login);
  if (guardado) return guardado;
  const r = await entrarMobile(app, login);
  expect(r.status).toBe(200);
  doApp.set(login, r.body.acessoToken as string);
  return r.body.acessoToken as string;
}

describe('login e sessão', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await criarApp();
  });
  afterAll(() => app.close());

  it('web: login grava cookies httpOnly + SameSite=Strict e não devolve token no corpo', async () => {
    const r = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ login: 'escola.custodio', senha: senhaSeed })
      .expect(200);

    const c = cookies(r.headers['set-cookie']);
    expect(c.sii_acesso).toMatch(/HttpOnly/);
    expect(c.sii_acesso).toMatch(/SameSite=Strict/);
    expect(c.sii_acesso).toMatch(/Path=\/api;/);
    expect(c.sii_refresh).toMatch(/HttpOnly/);
    expect(c.sii_refresh).toMatch(/Path=\/api\/v1\/auth/);
    expect(r.body).not.toHaveProperty('acessoToken');
    expect(r.body).not.toHaveProperty('refreshToken');
    expect(r.body.usuario).toMatchObject({ login: 'escola.custodio', perfil: 'ESCOLA' });

    const acesso = (c.sii_acesso as string).split(';')[0] as string;
    const eu = await request(app.getHttpServer())
      .get('/api/v1/auth/eu')
      .set('Cookie', acesso)
      .expect(200);
    expect(eu.body.escopos).toEqual([{ tipo: 'ESCOLA', valor: '11005165' }]);
  });

  it('senha errada e login inexistente dão a mesma resposta', async () => {
    const errada = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ login: 'semed.gestor', senha: 'senha-errada-123' })
      .expect(401);
    const inexistente = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ login: 'ninguem.aqui', senha: 'senha-errada-123' })
      .expect(401);
    expect(errada.body).toEqual(inexistente.body);
    expect(errada.body).toEqual({
      codigo: 'CREDENCIAIS_INVALIDAS',
      mensagem: 'Login ou senha incorretos.',
    });
    await dono.usuario.update({ where: { login: 'semed.gestor' }, data: { falhasSeguidas: 0 } });
  });

  it('valida o corpo com o schema do shared (422 com campos)', async () => {
    const r = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ login: '' })
      .expect(422);
    expect(r.body.codigo).toBe('VALIDACAO');
    expect(Object.keys(r.body.campos)).toEqual(['login', 'senha']);
  });

  it('sem token: 401 NAO_AUTENTICADO', async () => {
    const r = await request(app.getHttpServer()).get('/api/v1/auth/eu').expect(401);
    expect(r.body.codigo).toBe('NAO_AUTENTICADO');
  });

  it('refresh rotaciona: o token novo é outro e o acesso continua', async () => {
    const login = await entrarMobile(app, 'acs.area01');
    const r1 = login.body.refreshToken as string;
    const renovado = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set(MOBILE)
      .send({ refreshToken: r1 })
      .expect(200);
    expect(renovado.body.refreshToken).not.toBe(r1);
    await request(app.getHttpServer())
      .get('/api/v1/auth/eu')
      .set('Authorization', `Bearer ${renovado.body.acessoToken}`)
      .expect(200);
  });

  it('REUSO do refresh antigo revoga a família inteira, inclusive o token novo', async () => {
    const login = await entrarMobile(app, 'cras.tecnico');
    const r1 = login.body.refreshToken as string;
    const r2 = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set(MOBILE)
        .send({ refreshToken: r1 })
    ).body.refreshToken as string;

    // Alguém guardou o r1 e tenta usar de novo.
    const reuso = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set(MOBILE)
      .send({ refreshToken: r1 })
      .expect(401);
    expect(reuso.body.codigo).toBe('SESSAO_INVALIDA');

    // O token legítimo mais novo também morreu.
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set(MOBILE)
      .send({ refreshToken: r2 })
      .expect(401);

    const usuario = await dono.usuario.findUniqueOrThrow({ where: { login: 'cras.tecnico' } });
    const evento = await dono.eventoAcesso.findFirst({
      where: { usuarioId: usuario.id, tipo: 'REUSO_REFRESH' },
      orderBy: { criadoEm: 'desc' },
    });
    expect(evento).not.toBeNull();
  });

  it('web: refresh pelo cookie e "sair" encerra a sessão', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ login: 'saude.gestor', senha: senhaSeed })
      .expect(200);
    const refresh = (cookies(login.headers['set-cookie']).sii_refresh as string).split(
      ';',
    )[0] as string;

    const renovado = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', refresh)
      .expect(200);
    const refresh2 = (cookies(renovado.headers['set-cookie']).sii_refresh as string).split(
      ';',
    )[0] as string;

    await request(app.getHttpServer())
      .post('/api/v1/auth/sair')
      .set('Cookie', refresh2)
      .expect(204);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', refresh2)
      .expect(401);
  });

  it('o banco guarda só o hash do refresh, nunca o token', async () => {
    const login = await entrarMobile(app, 'pcf.visitador');
    const token = login.body.refreshToken as string;
    const achado = await dono.sessaoRefresh.findFirst({ where: { tokenHash: token } });
    expect(achado).toBeNull();
    const linhas = await dono.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM acesso.sessao_refresh WHERE token_hash = encode(sha256(${token}::bytea), 'hex')`;
    expect(Number(linhas[0]?.n)).toBe(1);
  });
});

describe('limite de tentativas', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await criarApp();
  });
  afterAll(() => app.close());

  it('a 11ª tentativa de login no mesmo minuto recebe 429', async () => {
    const tentativa = () =>
      request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ login: 'nao.existe', senha: 'x' });
    for (let i = 0; i < 10; i++) expect((await tentativa()).status).toBe(401);
    const bloqueada = await tentativa();
    expect(bloqueada.status).toBe(429);
    expect(bloqueada.body.codigo).toBe('MUITAS_TENTATIVAS');
  });
});

describe('bloqueio por conta', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await criarApp();
  });
  afterAll(async () => {
    await dono.usuario.update({
      where: { login: 'dpo.encarregado' },
      data: { falhasSeguidas: 0, bloqueadoAte: null },
    });
    await app.close();
  });

  it('5 senhas erradas bloqueiam por 15 min, mesmo com a senha certa depois', async () => {
    const errar = () =>
      request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ login: 'dpo.encarregado', senha: 'errada-1234' });
    for (let i = 0; i < 4; i++) expect((await errar()).status).toBe(401);
    const quinta = await errar();
    expect(quinta.status).toBe(423);
    expect(quinta.body.codigo).toBe('ACESSO_BLOQUEADO');
    expect(quinta.body.mensagem).toMatch(/15 minutos/);

    const certa = await entrarMobile(app, 'dpo.encarregado');
    expect(certa.status).toBe(423);
  });
});

describe('senha provisória, perfis e escopos', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await criarApp();
    await dono.usuario.deleteMany({ where: { login: 'prof.teste' } });
  });
  afterAll(() => app.close());

  it('admin cria usuário, que entra com a provisória e só consegue trocar a senha', async () => {
    const admin = await tokenDe(app, 'cti.admin');
    const criado = await request(app.getHttpServer())
      .post('/api/v1/usuarios')
      .set('Authorization', `Bearer ${admin}`)
      .send({
        login: 'Prof.Teste',
        nome: 'Professora de Teste',
        perfil: 'ESCOLA',
        escopos: [{ tipo: 'ESCOLA', valor: '11005165' }],
      })
      .expect(201);
    const provisoria = criado.body.senhaProvisoria as string;
    expect(provisoria).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
    expect(criado.body.usuario.login).toBe('prof.teste');
    expect(JSON.stringify(criado.body)).not.toMatch(/senhaHash|\$2[aby]\$/);

    const login = await entrarMobile(app, 'prof.teste', provisoria);
    expect(login.status).toBe(200);
    expect(login.body.usuario.trocaObrigatoria).toBe(true);
    const acessoProvisorio = login.body.acessoToken as string;

    const bloqueada = await request(app.getHttpServer())
      .get('/api/v1/pessoas')
      .set('Authorization', `Bearer ${acessoProvisorio}`)
      .expect(403);
    expect(bloqueada.body.codigo).toBe('TROCA_DE_SENHA_OBRIGATORIA');

    const trocada = await request(app.getHttpServer())
      .post('/api/v1/auth/trocar-senha')
      .set(MOBILE)
      .set('Authorization', `Bearer ${acessoProvisorio}`)
      .send({ senhaAtual: provisoria, senhaNova: 'minha-senha-pessoal-1' })
      .expect(200);
    expect(trocada.body.usuario.trocaObrigatoria).toBe(false);

    // O token emitido antes da troca deixou de valer (versão do token mudou).
    await request(app.getHttpServer())
      .get('/api/v1/auth/eu')
      .set('Authorization', `Bearer ${acessoProvisorio}`)
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/pessoas')
      .set('Authorization', `Bearer ${trocada.body.acessoToken}`)
      .expect(200);
  });

  it('senha provisória vencida é recusada', async () => {
    const admin = await tokenDe(app, 'cti.admin');
    const u = await dono.usuario.findUniqueOrThrow({ where: { login: 'prof.teste' } });
    const nova = await request(app.getHttpServer())
      .post(`/api/v1/usuarios/${u.id}/senha-provisoria`)
      .set('Authorization', `Bearer ${admin}`)
      .expect(201);
    await dono.usuario.update({
      where: { id: u.id },
      data: { senhaProvisoriaExpiraEm: new Date(Date.now() - 1000) },
    });
    const r = await entrarMobile(app, 'prof.teste', nova.body.senhaProvisoria);
    expect(r.status).toBe(401);
    expect(r.body.codigo).toBe('SENHA_PROVISORIA_VENCIDA');
  });

  it('perfil sem permissão: ESCOLA não lista usuários (403 SEM_PERMISSAO)', async () => {
    const escola = await tokenDe(app, 'escola.custodio');
    const r = await request(app.getHttpServer())
      .get('/api/v1/usuarios')
      .set('Authorization', `Bearer ${escola}`)
      .expect(403);
    expect(r.body.codigo).toBe('SEM_PERMISSAO');
  });

  it('escopo: ESCOLA vê a própria escola e recebe 403 FORA_DO_ESCOPO na outra', async () => {
    const escola = await tokenDe(app, 'escola.custodio');
    const propria = await request(app.getHttpServer())
      .get('/api/v1/escolas/11005165/pessoas')
      .set('Authorization', `Bearer ${escola}`)
      .expect(200);
    expect(propria.body).toHaveLength(4);
    expect(propria.body[0].iniciais).toMatch(/^[A-ZÀ-Ú]\. /);
    expect(JSON.stringify(propria.body)).not.toMatch(/Fictícia/);

    const outra = await request(app.getHttpServer())
      .get('/api/v1/escolas/11005378/pessoas')
      .set('Authorization', `Bearer ${escola}`)
      .expect(403);
    expect(outra.body.codigo).toBe('FORA_DO_ESCOPO');
  });
});

describe('Row-Level Security pela API', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await criarApp();
  });
  afterAll(() => app.close());

  it.each([
    ['escola.custodio', 4],
    ['acs.area01', 5],
    ['cras.tecnico', 10],
    ['pcf.visitador', 2],
    ['semed.gestor', 12],
    ['saude.gestor', 12],
    ['comite.gestor', 12],
  ])('RLS pela API: %s vê %i pessoas', async (login, total) => {
    const token = await tokenDe(app, login);
    const r = await request(app.getHttpServer())
      .get('/api/v1/pessoas')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(r.body).toHaveLength(total);
  });

  it('AUDITOR_TCE não lista pessoas, mas lê o agregado com supressão de <5', async () => {
    const tce = await tokenDe(app, 'tce.auditor');
    await request(app.getHttpServer())
      .get('/api/v1/pessoas')
      .set('Authorization', `Bearer ${tce}`)
      .expect(403);
    const agregado = await request(app.getHttpServer())
      .get('/api/v1/agregados/pessoas-por-setor')
      .set('Authorization', `Bearer ${tce}`)
      .expect(200);
    expect(agregado.body).toEqual([
      { setor_codigo: 'S01', total: '6' },
      { setor_codigo: 'S02', total: '<5' },
      { setor_codigo: 'S03', total: '<5' },
    ]);
  });
});

describe('Row-Level Security direto no banco', () => {
  let prisma: PrismaService;
  beforeAll(() => {
    // PrismaService fora do Nest: só o construtor precisa da URL.
    prisma = new PrismaService({ get: () => url } as never);
  });
  afterAll(() => prisma.$disconnect());

  const ctx = (
    perfil: Parameters<PrismaService['comoUsuario']>[0]['perfil'],
    escopos: { tipo: 'ESCOLA' | 'MICROAREA' | 'CRAS' | 'FAMILIA_PCF'; valor: string }[] = [],
  ) => ({
    id: 999,
    perfil,
    escopos,
  });

  it('AUDITOR_TCE com o papel dele: permission denied em pessoas e em casos', async () => {
    await expect(
      prisma.comoUsuario(ctx('AUDITOR_TCE'), (tx) => tx.pessoaMestra.count()),
    ).rejects.toThrow(/permission denied/i);
    await expect(prisma.comoUsuario(ctx('AUDITOR_TCE'), (tx) => tx.caso.count())).rejects.toThrow(
      /permission denied/i,
    );
    await expect(
      prisma.comoUsuario(
        ctx('AUDITOR_TCE'),
        (tx) => tx.$queryRaw`SELECT nome FROM pessoas.pessoa_mestra`,
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('AUDITOR_TCE também não lê o schema de acesso (hash de senha)', async () => {
    await expect(
      prisma.comoUsuario(
        ctx('AUDITOR_TCE'),
        (tx) => tx.$queryRaw`SELECT senha_hash FROM acesso.usuario`,
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('nenhum perfil lê o schema de acesso pelo papel sii_app', async () => {
    await expect(
      prisma.comoUsuario(
        ctx('ADMIN_CTI'),
        (tx) => tx.$queryRaw`SELECT senha_hash FROM acesso.usuario`,
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('FAZENDA e DPO não enxergam nenhuma pessoa', async () => {
    expect(await prisma.comoUsuario(ctx('FAZENDA'), (tx) => tx.pessoaMestra.count())).toBe(0);
    expect(await prisma.comoUsuario(ctx('DPO'), (tx) => tx.pessoaMestra.count())).toBe(0);
  });

  it('escopo de outro tipo não abre a linha (ESCOLA com escopo de microárea vê 0)', async () => {
    const n = await prisma.comoUsuario(
      ctx('ESCOLA', [{ tipo: 'MICROAREA', valor: 'area01' }]),
      (tx) => tx.pessoaMestra.count(),
    );
    expect(n).toBe(0);
  });

  it('caso herda a visibilidade da pessoa', async () => {
    const custodio = ctx('ESCOLA', [{ tipo: 'ESCOLA', valor: '11005165' }]);
    const pequeno = ctx('ESCOLA', [{ tipo: 'ESCOLA', valor: '11005378' }]);
    expect(await prisma.comoUsuario(custodio, (tx) => tx.caso.count())).toBe(0);
    expect(await prisma.comoUsuario(pequeno, (tx) => tx.caso.count())).toBe(1);
    expect(
      await prisma.comoUsuario(
        ctx('CRAS_TECNICO', [{ tipo: 'CRAS', valor: '11011015018' }]),
        (tx) => tx.caso.count(),
      ),
    ).toBe(1);
  });

  it('o contexto não vaza entre transações', async () => {
    await prisma.comoUsuario(ctx('SEMED_GESTOR'), (tx) => tx.pessoaMestra.count());
    const depois = await prisma.$queryRaw<{ perfil: string | null; papel: string }[]>`
      SELECT nullif(current_setting('sii.perfil', true), '') AS perfil, current_user AS papel`;
    expect(depois[0]?.perfil).toBeNull();
    expect(depois[0]?.papel).not.toMatch(/^sii_(app|auditor)$/);
  });
});
