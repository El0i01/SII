import type { INestApplication } from '@nestjs/common';
import { hojeEmPortoVelho } from '@sii/shared';
import request from 'supertest';
import { semearPrototipo } from '../prisma/seed/prototipo/persistir';
import { semearUsuarios } from '../prisma/seed/usuarios';
import { chaveDeHex, decifrar } from '../src/cripto/cifra';
import type { PrismaClient } from '../src/generated/prisma/client';
import { aplicarMigrations, clienteDono, criarApp, usarBancoDeTeste } from './apoio-integracao';

const { url, senhaSeed } = usarBancoDeTeste();
const MOBILE = { 'x-sii-cliente': 'mobile' };
const CUSTODIO = '11005165';
const CPF_CLARO = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\d{11}\b/;
const chaveCifra = chaveDeHex(process.env.CHAVE_CIFRA ?? '', 'CHAVE_CIFRA');

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

const hoje = hojeEmPortoVelho();
const nascidoHa18 = new Date(`${Number(hoje.slice(0, 4)) - 18}${hoje.slice(4)}T00:00:00Z`);

/** Crianças (0 a 17) do seed, pelo cliente dono. */
async function criancas(where: object = {}) {
  return dono.pessoaMestra.findMany({
    where: { dataNascimento: { gt: nascidoHa18 }, ...where },
    select: { id: true, escolaInep: true, microarea: true, cpfCifrado: true },
  });
}

beforeAll(async () => {
  aplicarMigrations(url);
  dono = clienteDono(url);
  await semearUsuarios(dono, senhaSeed);
  await semearPrototipo(dono, {
    cifra: chaveCifra,
    hmac: chaveDeHex(process.env.CHAVE_HMAC ?? '', 'CHAVE_HMAC'),
  });
  await dono.acessoDadoPessoal.deleteMany({});
  app = await criarApp();
}, 180_000);

afterAll(async () => {
  await dono?.acessoDadoPessoal.deleteMany({});
  await app?.close();
  await dono?.$disconnect();
});

describe('lista de fichas (P12)', () => {
  it('o Comitê vê todas as crianças, por prioridade, sem CPF nem nome', async () => {
    const r = await http()
      .get('/api/v1/fichas')
      .set(await como('comite.gestor'))
      .expect(200);
    const todas = await criancas();
    expect(r.body.kpis.fichas).toBe(todas.length);
    expect(r.body.total).toBe(todas.length);
    expect(r.body.fichas).toHaveLength(40);
    expect(r.body.kpis.precisamVisita).toBeGreaterThan(0);
    expect(r.body.kpis.criancaFeliz).toBeGreaterThan(0);
    const motivos = r.body.fichas.map((f: { motivos: number }) => f.motivos);
    expect(motivos).toEqual([...motivos].sort((a, b) => b - a));
    expect(JSON.stringify(r.body)).not.toMatch(CPF_CLARO);
    expect(r.body.fichas[0]).not.toHaveProperty('nome');
    expect(r.body.fichas[0].codigo).toBe(`CI-${r.body.fichas[0].id}`);
  });

  it('a escola vê só os próprios alunos; o ACS, só a microárea', async () => {
    const e = await http()
      .get('/api/v1/fichas?filtro=todas')
      .set(await como('escola.custodio'))
      .expect(200);
    expect(e.body.total).toBe((await criancas({ escolaInep: CUSTODIO })).length);
    const a = await http()
      .get('/api/v1/fichas')
      .set(await como('acs.area01'))
      .expect(200);
    expect(a.body.total).toBe((await criancas({ microarea: 'area01' })).length);
    expect(a.body.total).toBeGreaterThan(0);
  });

  it('TCE, Fazenda e DPO não acessam fichas', async () => {
    for (const login of ['tce.auditor', 'fazenda.cadastro', 'dpo.encarregado']) {
      await http()
        .get('/api/v1/fichas')
        .set(await como(login))
        .expect(403);
    }
  });

  it('filtros e busca', async () => {
    const h = await como('comite.gestor');
    const visita = await http().get('/api/v1/fichas?filtro=visita').set(h).expect(200);
    expect(visita.body.total).toBe(visita.body.kpis.precisamVisita);
    expect(visita.body.fichas.every((f: { motivos: number }) => f.motivos > 0)).toBe(true);
    const bebes = await http().get('/api/v1/fichas?filtro=0a3').set(h).expect(200);
    expect(bebes.body.fichas.every((f: { idade: number }) => f.idade <= 3)).toBe(true);
    const aee = await http().get('/api/v1/fichas?filtro=aee').set(h).expect(200);
    expect(aee.body.fichas.every((f: { necessitaAee: boolean }) => f.necessitaAee)).toBe(true);
    const notif = await http().get('/api/v1/fichas?filtro=notificacao').set(h).expect(200);
    expect(notif.body.total).toBeGreaterThan(0);
    const alvo = visita.body.fichas[0];
    const busca = await http().get(`/api/v1/fichas?busca=${alvo.codigo}`).set(h).expect(200);
    expect(busca.body.fichas.map((f: { id: number }) => f.id)).toContain(alvo.id);
    await http().get('/api/v1/fichas?filtro=xyz').set(h).expect(422);
  });
});

describe('ficha (P12)', () => {
  it('monta a ficha em menos de 1,5 s, com CPF mascarado, blocos, histórico e visitas', async () => {
    const comVisita = new Set(
      (await dono.visita.findMany({ select: { pessoaIds: true } })).flatMap((v) => v.pessoaIds),
    );
    const aluno = (await criancas({ escolaInep: CUSTODIO, cpfCifrado: { not: null } })).find((c) =>
      comVisita.has(c.id),
    );
    const h = await como('semed.gestor');
    const inicio = Date.now();
    const r = await http().get(`/api/v1/fichas/${aluno?.id}`).set(h).expect(200);
    expect(Date.now() - inicio).toBeLessThan(1500);
    expect(r.body.cpf).toMatch(/^\*\*\*\.\d{3}\.\d{3}-\*\*$/);
    expect(JSON.stringify(r.body)).not.toMatch(CPF_CLARO);
    expect(JSON.stringify(r.body)).not.toMatch(/\bCID\b|laudo/i);
    for (const k of ['educacao', 'saude', 'assistencia', 'protecao', 'historico', 'visitas']) {
      expect(r.body).toHaveProperty(k);
    }
    expect(r.body.educacao.situacao).toBe('MATRICULADA');
    expect(r.body.podeEncaminhar).toBe(true);
    expect(r.body.visitas.length).toBeGreaterThan(0);
    expect(r.body.visitas[0].autor).toBe('ACS · Saúde');
    const datas = r.body.historico.map((e: { quando: string }) => e.quando.slice(0, 10));
    expect(datas).toEqual([...datas].sort().reverse());
  });

  it('o parecer emitido aparece no histórico e nos relatórios de visita', async () => {
    const n = await dono.notificacao.findFirst({
      where: { status: 'PARECER_EMITIDO', parecer: { isNot: null } },
      select: { caso: { select: { pessoaId: true } }, parecer: { select: { texto: true } } },
    });
    const r = await http()
      .get(`/api/v1/fichas/${n?.caso.pessoaId}`)
      .set(await como('comite.gestor'))
      .expect(200);
    expect(r.body.visitas.some((v: { texto: string }) => v.texto === n?.parecer?.texto)).toBe(true);
    expect(
      r.body.historico.some((e: { texto: string }) => e.texto.startsWith('Parecer da Assistência')),
    ).toBe(true);
  });

  it('fora do escopo ou adulto: 404', async () => {
    const [outra] = await criancas({ escolaInep: { not: CUSTODIO }, microarea: { not: null } });
    await http()
      .get(`/api/v1/fichas/${outra?.id}`)
      .set(await como('escola.custodio'))
      .expect(404);
    const adulto = await dono.pessoaMestra.findFirst({
      where: { dataNascimento: { lt: nascidoHa18 } },
      select: { id: true },
    });
    await http()
      .get(`/api/v1/fichas/${adulto?.id}`)
      .set(await como('comite.gestor'))
      .expect(404);
  });
});

describe('revelar CPF (P12)', () => {
  it('sem finalidade: 422 e nenhum acesso gravado', async () => {
    const [aluno] = await criancas({ escolaInep: CUSTODIO, cpfCifrado: { not: null } });
    const h = await como('escola.custodio');
    const r = await http().post(`/api/v1/fichas/${aluno?.id}/revelar-cpf`).set(h).send({});
    expect(r.status).toBe(422);
    expect(r.body.campos.finalidade).toEqual(['Escolha a finalidade.']);
    const outra = await http()
      .post(`/api/v1/fichas/${aluno?.id}/revelar-cpf`)
      .set(h)
      .send({ finalidade: 'OUTRA', detalhe: 'curto' });
    expect(outra.status).toBe(422);
    expect(outra.body.campos).toHaveProperty('detalhe');
    expect(await dono.acessoDadoPessoal.count()).toBe(0);
  });

  it('com finalidade: devolve o CPF e grava o acesso, que o DPO vê', async () => {
    const [aluno] = await criancas({ escolaInep: CUSTODIO, cpfCifrado: { not: null } });
    const r = await http()
      .post(`/api/v1/fichas/${aluno?.id}/revelar-cpf`)
      .set(await como('escola.custodio'))
      .send({ finalidade: 'CONTATO_MATRICULA' })
      .expect(200);
    const claro = decifrar(aluno?.cpfCifrado as Uint8Array, chaveCifra);
    expect(r.body.cpf.replace(/\D/g, '')).toBe(claro);

    const acesso = await dono.acessoDadoPessoal.findFirstOrThrow({
      where: { pessoaId: aluno?.id },
    });
    expect(acesso).toMatchObject({
      perfil: 'ESCOLA',
      campo: 'CPF',
      registro: `CI-${aluno?.id}`,
      finalidade: 'Contato com a família para matrícula',
    });

    const painel = await http()
      .get('/api/v1/auditoria/acessos?usuario=escola')
      .set(await como('dpo.encarregado'))
      .expect(200);
    expect(painel.body.total).toBe(1);
    expect(painel.body.acessos[0]).toMatchObject({
      usuario: { login: 'escola.custodio' },
      registro: `CI-${aluno?.id}`,
      finalidade: 'Contato com a família para matrícula',
    });
    expect(JSON.stringify(painel.body)).not.toMatch(CPF_CLARO);
    const vazio = await http()
      .get(`/api/v1/auditoria/acessos?de=${hoje}&ate=${hoje}&usuario=cti`)
      .set(await como('cti.admin'))
      .expect(200);
    expect(vazio.body.total).toBe(0);
  });

  it('fora do escopo: 404 sem gravar acesso; painel só para DPO e CTI', async () => {
    const antes = await dono.acessoDadoPessoal.count();
    const [outra] = await criancas({ escolaInep: { not: CUSTODIO }, cpfCifrado: { not: null } });
    await http()
      .post(`/api/v1/fichas/${outra?.id}/revelar-cpf`)
      .set(await como('escola.custodio'))
      .send({ finalidade: 'CONTATO_MATRICULA' })
      .expect(404);
    expect(await dono.acessoDadoPessoal.count()).toBe(antes);
    await http()
      .get('/api/v1/auditoria/acessos')
      .set(await como('escola.custodio'))
      .expect(403);
    await http()
      .post(`/api/v1/fichas/${outra?.id}/revelar-cpf`)
      .set(await como('tce.auditor'))
      .send({ finalidade: 'CONTATO_MATRICULA' })
      .expect(403);
  });
});
