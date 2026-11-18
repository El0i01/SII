import type { INestApplication } from '@nestjs/common';
import { calcularIvm, hojeEmPortoVelho, PESOS_IVM_PADRAO } from '@sii/shared';
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

const HOJE = () => new Date(`${hojeEmPortoVelho()}T00:00:00Z`);
const sqlN = async (sql: TemplateStringsArray, ...v: unknown[]) =>
  Number((await dono.$queryRaw<{ n: number }[]>(sql, ...v))[0]?.n ?? 0);
/** Nenhum dado de identificação nas respostas (os setores têm "nome", que é do território). */
const semDadoPessoal = (corpo: { setores?: unknown }) => {
  const { setores: _setores, ...resto } = corpo;
  expect(JSON.stringify(resto)).not.toMatch(/"(nome|cpf|nis|cns|nomeMae|nascimento)"/);
};
const somaSetores = (c: { porSetor: { valores: Record<string, number | null> }[] }, k: string) =>
  c.porSetor.reduce((a, s) => a + (s.valores[k] ?? 0), 0);

describe('primeira infância (P19)', () => {
  it('números conferem com SQL e o território filtra', async () => {
    const r = await http()
      .get('/api/v1/ciclos/primeira-infancia')
      .set(await como('comite.gestor'))
      .expect(200);
    semDadoPessoal(r.body);
    const c = r.body.contagens;
    expect(c.total.criancas).toBe(
      await sqlN`SELECT count(*)::int AS n FROM pessoas.pessoa_mestra WHERE data_nascimento > ${HOJE()}::date - interval '7 years' AND data_nascimento <= ${HOJE()}::date`,
    );
    expect(c.total.vacinadas).toBe(
      await sqlN`SELECT count(*)::int AS n FROM pessoas.pessoa_mestra p JOIN saude.sinalizador_saude s ON s.pessoa_id = p.id
                 WHERE s.vacinacao_em_dia AND p.data_nascimento > ${HOJE()}::date - interval '7 years' AND p.data_nascimento <= ${HOJE()}::date`,
    );
    expect(c.total.pcf).toBe(
      await sqlN`SELECT count(DISTINCT x.pessoa_id)::int AS n FROM assistencia.crianca_feliz x JOIN pessoas.pessoa_mestra p ON p.id = x.pessoa_id
                 WHERE p.data_nascimento > ${HOJE()}::date - interval '7 years'`,
    );
    expect(somaSetores(c, 'criancas')).toBeLessThanOrEqual(c.total.criancas);
    expect(c.total.semCuidado03).toBeGreaterThan(0);
    expect(r.body.visitadores).toBeGreaterThan(0);
    const s2 = await http()
      .get('/api/v1/ciclos/primeira-infancia?territorio=S02')
      .set(await como('comite.gestor'))
      .expect(200);
    expect(s2.body.setores.map((s: { codigo: string }) => s.codigo)).toEqual(['S02']);
    expect(s2.body.contagens.total.criancas).toBeLessThan(c.total.criancas);
  });

  it('auditor: contagens com "< 5" e sem o nome dos visitadores', async () => {
    const r = await http()
      .get('/api/v1/ciclos/primeira-infancia')
      .set(await como('tce.auditor'))
      .expect(200);
    expect(r.body.agregado).toBe(true);
    expect(r.body.visitadores).toBeNull();
    for (const s of r.body.contagens.porSetor)
      for (const v of Object.values(s.valores) as (number | null)[])
        expect(v === null || v === 0 || v >= 5).toBe(true);
  });
});

describe('educação inclusiva (P19)', () => {
  it('lista de crianças sem atendimento só com iniciais e no escopo da escola', async () => {
    const r = await http()
      .get('/api/v1/ciclos/educacao-inclusiva')
      .set(await como('comite.gestor'))
      .expect(200);
    semDadoPessoal(r.body);
    expect(r.body.contagens.total.identificadas).toBe(
      await sqlN`SELECT count(*)::int AS n FROM pessoas.pessoa_mestra p JOIN saude.sinalizador_saude s ON s.pessoa_id = p.id
                 WHERE s.necessita_atendimento_especializado AND p.data_nascimento > ${HOJE()}::date - interval '18 years'`,
    );
    expect(r.body.semAtendimento).toHaveLength(r.body.contagens.total.semAtendimento);
    for (const c of r.body.semAtendimento) expect(c.iniciais).toMatch(/^([A-ZÀ-Ú]\. ?)+$/);

    const escola = await http()
      .get('/api/v1/ciclos/educacao-inclusiva')
      .set(await como('escola.custodio'))
      .expect(200);
    const ids = escola.body.semAtendimento.map((c: { fichaId: number }) => c.fichaId);
    const fora = await dono.pessoaMestra.count({
      where: { id: { in: ids }, NOT: { escolaInep: '11005165' } },
    });
    expect(fora).toBe(0);
    expect(escola.body.contagens.total.identificadas).toBeLessThan(
      r.body.contagens.total.identificadas,
    );

    const auditor = await http()
      .get('/api/v1/ciclos/educacao-inclusiva')
      .set(await como('tce.auditor'))
      .expect(200);
    expect(auditor.body.semAtendimento).toBeUndefined();
  });
});

describe('pessoa idosa (P19)', () => {
  it('cruzamentos conferem e a lista prioritária respeita a microárea do ACS', async () => {
    const r = await http()
      .get('/api/v1/ciclos/pessoa-idosa')
      .set(await como('comite.gestor'))
      .expect(200);
    semDadoPessoal(r.body);
    const c = r.body.contagens.total;
    expect(c.pessoas).toBe(
      await sqlN`SELECT count(*)::int AS n FROM pessoas.pessoa_mestra WHERE data_nascimento <= ${HOJE()}::date - interval '60 years'`,
    );
    expect(c.bpc).toBe(
      await sqlN`SELECT count(DISTINCT p.id)::int AS n FROM pessoas.pessoa_mestra p JOIN assistencia.bpc b ON b.pessoa_id = p.id AND b.ativo
                 WHERE p.data_nascimento <= ${HOJE()}::date - interval '60 years'`,
    );
    expect(r.body.prioritarias).toHaveLength(c.prioritarias);
    for (const p of r.body.prioritarias) expect(p.motivos.length).toBeGreaterThanOrEqual(3);

    const acs = await http()
      .get('/api/v1/ciclos/pessoa-idosa')
      .set(await como('acs.area01'))
      .expect(200);
    expect(acs.body.contagens.total.pessoas).toBeLessThan(c.pessoas);
    const codigos = acs.body.prioritarias.map((p: { codigo: string }) => Number(p.codigo.slice(3)));
    expect(
      await dono.pessoaMestra.count({
        where: { id: { in: codigos }, NOT: { microarea: 'area01' } },
      }),
    ).toBe(0);

    const auditor = await http()
      .get('/api/v1/ciclos/pessoa-idosa')
      .set(await como('tce.auditor'))
      .expect(200);
    expect(auditor.body.prioritarias).toBeUndefined();
    await http()
      .get('/api/v1/ciclos/pessoa-idosa')
      .set(await como('dpo.encarregado'))
      .expect(403);
  });
});

describe('EJA (P19)', () => {
  it('matrículas nas turmas de EJA e público potencial pela escolaridade do CadÚnico', async () => {
    const r = await http()
      .get('/api/v1/ciclos/eja')
      .set(await como('comite.gestor'))
      .expect(200);
    const c = r.body.contagens.total;
    expect(c.matriculados).toBe(
      await sqlN`SELECT count(*)::int AS n FROM educacao.matricula m JOIN educacao.turma t ON t.id = m.turma_id
                 WHERE t.nome ILIKE 'EJA%' AND m.situacao = 'ATIVA'`,
    );
    expect(c.matriculados).toBeGreaterThan(0);
    expect(c.potencial).toBeGreaterThan(c.matriculados);
    expect(c.semAlfabetizacao).toBeGreaterThan(0);
    expect(r.body.frequenciaMedia).toEqual(expect.any(Number));
  });
});

describe('vagas de creche (P19)', () => {
  it('coortes, vagas e fila conferem; a SEMED informa as vagas; a escola não', async () => {
    const r = await http()
      .get('/api/v1/ciclos/vagas-creche')
      .set(await como('semed.gestor'))
      .expect(200);
    const anos = r.body.coortes as number[];
    const somaCoortes = r.body.setores.reduce(
      (a: number, s: { coortes: Record<string, number> }) =>
        a + Object.values(s.coortes).reduce((x, n) => x + n, 0),
      0,
    );
    expect(somaCoortes).toBe(
      await sqlN`SELECT count(*)::int AS n FROM pessoas.pessoa_mestra WHERE setor_codigo IS NOT NULL
                 AND extract(year FROM data_nascimento)::int BETWEEN ${anos[0]} AND ${anos[3]}`,
    );
    const vagas = await sqlN`SELECT coalesce(sum(vagas), 0)::int AS n FROM educacao.oferta_creche`;
    expect(vagas).toBeGreaterThan(0);
    expect(r.body.escolas.reduce((a: number, e: { vagas: number }) => a + e.vagas, 0)).toBe(vagas);

    const alvo = r.body.escolas[0];
    await http()
      .put(`/api/v1/ciclos/vagas-creche/oferta/${alvo.inep}`)
      .set(await como('escola.custodio'))
      .send({ vagas: 1 })
      .expect(403);
    const bad = await http()
      .put(`/api/v1/ciclos/vagas-creche/oferta/${alvo.inep}`)
      .set(await como('semed.gestor'))
      .send({ vagas: -1 });
    expect(bad.status).toBe(422);
    await http()
      .put(`/api/v1/ciclos/vagas-creche/oferta/${alvo.inep}`)
      .set(await como('semed.gestor'))
      .send({ vagas: alvo.vagas + 30 })
      .expect(200);
    const depois = await http()
      .get('/api/v1/ciclos/vagas-creche')
      .set(await como('semed.gestor'));
    expect(depois.body.escolas.find((e: { inep: string }) => e.inep === alvo.inep).vagas).toBe(
      alvo.vagas + 30,
    );
  });
});

describe('índice de vulnerabilidade (P19)', () => {
  it('só o Comitê aprova; nova versão entra no histórico e recalcula o mapa', async () => {
    const antes = await http()
      .get('/api/v1/ivm')
      .set(await como('fazenda.cadastro'))
      .expect(200);
    expect(antes.body.vigente).toMatchObject({ proposta: true, pesos: PESOS_IVM_PADRAO });
    expect(antes.body.quadras[0].ivm).toBeGreaterThanOrEqual(antes.body.quadras.at(-1).ivm);

    const pesos = { renda: 10, saude: 10, escola: 10, imovel: 10, regularizacao: 60 };
    const corpo = {
      pesos,
      justificativa: 'Regularização fundiária é a prioridade de 2027 no Comitê.',
    };
    await http()
      .post('/api/v1/ivm/pesos')
      .set(await como('cti.admin'))
      .send(corpo)
      .expect(403);
    const curto = await http()
      .post('/api/v1/ivm/pesos')
      .set(await como('comite.gestor'))
      .send({ pesos, justificativa: 'curta' });
    expect(curto.status).toBe(422);
    const r = await http()
      .post('/api/v1/ivm/pesos')
      .set(await como('comite.gestor'))
      .send(corpo)
      .expect(200);
    expect(r.body.versao).toBe(2);

    const depois = await http()
      .get('/api/v1/ivm')
      .set(await como('tce.auditor'))
      .expect(200);
    expect(depois.body.vigente).toMatchObject({ versao: 2, proposta: false, pesos });
    expect(depois.body.versoes.map((v: { versao: number }) => v.versao)).toEqual([2, 1]);
    expect(depois.body.versoes[0]).toMatchObject({
      aprovadoPor: expect.any(String),
      justificativa: corpo.justificativa,
    });

    // O mapa (P15) usa os pesos aprovados.
    const mapa = await http()
      .get('/api/v1/mapa/quadras')
      .set(await como('comite.gestor'))
      .expect(200);
    const q = depois.body.quadras[0];
    const noMapa = mapa.body.quadras.find((x: { id: number }) => x.id === q.id);
    expect(noMapa.ivm).toBeCloseTo(calcularIvm(q.dimensoes, pesos), 3);
  });
});
