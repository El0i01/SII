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

interface Grade {
  dias: string[];
  hoje: string;
  alunos: { matriculaId: number; nome: string }[];
  lancamentos: { matriculaId: number; dia: string; situacao: string }[];
}

async function turmaComAlunos(inep: string) {
  const escola = await token('escola.custodio');
  const turmas = await request(app.getHttpServer())
    .get(`/api/v1/escolas/${inep}/turmas?ano=2026`)
    .set('Authorization', `Bearer ${escola}`)
    .expect(200);
  for (const t of turmas.body as { id: number }[]) {
    const g = await request(app.getHttpServer())
      .get(`/api/v1/escolas/${inep}/turmas/${t.id}/frequencia?mes=2026-10`)
      .set('Authorization', `Bearer ${escola}`)
      .expect(200);
    if ((g.body as Grade).alunos.length >= 2) return { turmaId: t.id, grade: g.body as Grade };
  }
  throw new Error('seed sem turma com alunos na escola de teste');
}

describe('frequência da turma (P10)', () => {
  it('a escola vê só a própria escola e abre a grade do mês', async () => {
    const escola = await token('escola.custodio');
    const lista = await request(app.getHttpServer())
      .get('/api/v1/escolas')
      .set('Authorization', `Bearer ${escola}`)
      .expect(200);
    expect(lista.body.map((e: { inep: string }) => e.inep)).toEqual([CUSTODIO]);

    const { grade } = await turmaComAlunos(CUSTODIO);
    expect(grade.dias.length).toBeGreaterThan(15);
    expect(grade.dias.every((d) => d.startsWith('2026-10'))).toBe(true);
    expect(grade.lancamentos.length).toBeGreaterThan(0);
  });

  it('lança, corrige e apaga; recusa dia não letivo, dia futuro e aluno de outra turma', async () => {
    const escola = await token('escola.custodio');
    const { turmaId, grade } = await turmaComAlunos(CUSTODIO);
    const [a, b] = grade.alunos as [Grade['alunos'][0], Grade['alunos'][0]];
    const outra = await dono.matricula.findFirst({
      where: { turmaId: { not: turmaId }, escola: { inep: CUSTODIO }, situacao: 'ATIVA' },
      select: { id: true },
    });
    // Um dia com lançamento do aluno b (o seed lança os 20 últimos letivos antes de 08/11).
    const diaLetivo = grade.lancamentos.find((l) => l.matriculaId === b.matriculaId)?.dia as string;
    const r = await request(app.getHttpServer())
      .put(`/api/v1/escolas/${CUSTODIO}/turmas/${turmaId}/frequencia`)
      .set('Authorization', `Bearer ${escola}`)
      .send({
        lancamentos: [
          { matriculaId: a.matriculaId, dia: diaLetivo, situacao: 'FALTA' },
          { matriculaId: a.matriculaId, dia: diaLetivo, situacao: 'JUSTIFICADA' },
          { matriculaId: b.matriculaId, dia: diaLetivo, situacao: null },
          { matriculaId: a.matriculaId, dia: '2026-10-03', situacao: 'FALTA' },
          { matriculaId: a.matriculaId, dia: '2099-03-02', situacao: 'FALTA' },
          ...(outra ? [{ matriculaId: outra.id, dia: diaLetivo, situacao: 'FALTA' }] : []),
        ],
      })
      .expect(200);
    expect(r.body.salvos).toBe(1);
    expect(r.body.apagados).toBe(1);
    expect(r.body.recusados.map((x: { motivo: string }) => x.motivo).sort()).toEqual(
      ['DIA_FUTURO', 'DIA_NAO_LETIVO', ...(outra ? ['MATRICULA_FORA_DA_TURMA'] : [])].sort(),
    );
    const gravada = await dono.frequencia.findUnique({
      where: {
        matriculaId_dia: { matriculaId: a.matriculaId, dia: new Date(`${diaLetivo}T00:00:00Z`) },
      },
    });
    expect(gravada?.situacao).toBe('JUSTIFICADA');
    expect(gravada?.lancadoPor).not.toBeNull();
    const apagada = await dono.frequencia.findUnique({
      where: {
        matriculaId_dia: { matriculaId: b.matriculaId, dia: new Date(`${diaLetivo}T00:00:00Z`) },
      },
    });
    expect(apagada).toBeNull();
  });

  it('valida o corpo com o schema do shared', async () => {
    const { turmaId } = await turmaComAlunos(CUSTODIO);
    const r = await request(app.getHttpServer())
      .put(`/api/v1/escolas/${CUSTODIO}/turmas/${turmaId}/frequencia`)
      .set('Authorization', `Bearer ${await token('escola.custodio')}`)
      .send({ lancamentos: [{ matriculaId: 1, dia: '2026-02-30', situacao: 'FALTA' }] })
      .expect(422);
    expect(r.body.codigo).toBe('VALIDACAO');
  });

  it('a escola não abre outra escola; CRAS e auditor não acessam', async () => {
    const outraEscola = await dono.escola.findFirst({
      where: { inep: { not: CUSTODIO }, turmas: { some: {} } },
      select: { inep: true, turmas: { select: { id: true }, take: 1 } },
    });
    const turma = outraEscola?.turmas[0]?.id ?? 1;
    await request(app.getHttpServer())
      .get(`/api/v1/escolas/${outraEscola?.inep}/turmas/${turma}/frequencia?mes=2026-10`)
      .set('Authorization', `Bearer ${await token('escola.custodio')}`)
      .expect(403);
    for (const login of ['cras.tecnico', 'tce.auditor']) {
      await request(app.getHttpServer())
        .get(`/api/v1/escolas/${CUSTODIO}/turmas/${turma}/frequencia?mes=2026-10`)
        .set('Authorization', `Bearer ${await token(login)}`)
        .expect(403);
    }
  });

  it('o comitê lê, mas não lança', async () => {
    const { turmaId, grade } = await turmaComAlunos(CUSTODIO);
    const comite = await token('comite.gestor');
    await request(app.getHttpServer())
      .get(`/api/v1/escolas/${CUSTODIO}/turmas/${turmaId}/frequencia?mes=2026-10`)
      .set('Authorization', `Bearer ${comite}`)
      .expect(200);
    await request(app.getHttpServer())
      .put(`/api/v1/escolas/${CUSTODIO}/turmas/${turmaId}/frequencia`)
      .set('Authorization', `Bearer ${comite}`)
      .send({
        lancamentos: [
          { matriculaId: grade.alunos[0]?.matriculaId, dia: grade.dias[1], situacao: 'FALTA' },
        ],
      })
      .expect(403);
  });
});
