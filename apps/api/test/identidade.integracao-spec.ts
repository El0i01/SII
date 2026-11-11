import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { chaveDeHex } from '../src/cripto/cifra';
import type { PrismaClient } from '../src/generated/prisma/client';
import { LigacaoPessoas } from '../src/pessoas/ligacao';
import { semearPrototipo } from '../prisma/seed/prototipo/persistir';
import { semearUsuarios } from '../prisma/seed/usuarios';
import { aplicarMigrations, clienteDono, criarApp, usarBancoDeTeste } from './apoio-integracao';

const { url, senhaSeed } = usarBancoDeTeste();
const chaves = {
  cifra: chaveDeHex(process.env.CHAVE_CIFRA ?? '', 'CHAVE_CIFRA'),
  hmac: chaveDeHex(process.env.CHAVE_HMAC ?? '', 'CHAVE_HMAC'),
};
const MOBILE = { 'x-sii-cliente': 'mobile' };

let dono: PrismaClient;
let app: INestApplication;
let ligacao: LigacaoPessoas;
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
const cti = async () => ({ Authorization: `Bearer ${await token('cti.admin')}` });

/** Dados da 1ª criança do protótipo (CI-10230), cujo CPF o protótipo sorteou: 587.959.953-56. */
async function primeiraCrianca(idExterno = 'CI-10230') {
  const [p] = await dono.$queryRaw<{ id: number; nome: string; nascimento: string; mae: string }[]>`
    SELECT p.id, p.nome, to_char(p.data_nascimento, 'YYYY-MM-DD') AS nascimento, p.nome_mae AS mae
    FROM pessoas.pessoa_mestra p JOIN pessoas.vinculo_fonte v ON v.pessoa_id = p.id WHERE v.id_externo = ${idExterno}`;
  return p as { id: number; nome: string; nascimento: string; mae: string };
}

beforeAll(async () => {
  aplicarMigrations(url);
  dono = clienteDono(url);
  await semearUsuarios(dono, senhaSeed);
  await semearPrototipo(dono, chaves);
  ligacao = new LigacaoPessoas(dono, chaves);
  app = await criarApp();
}, 180_000);

afterAll(async () => {
  await app?.close();
  await dono?.$disconnect();
});

describe('seed', () => {
  it('gera pelo menos 20 casos de revisão e ligações por todas as regras', async () => {
    const r = await request(app.getHttpServer())
      .get('/api/v1/identidade/resumo')
      .set(await cti())
      .expect(200);
    expect(r.body.revisoesPendentes).toBeGreaterThanOrEqual(20);
    expect(r.body.porRegra).toMatchObject({ CPF: 60, CNS_NIS: 30, NOME_NASCIMENTO_MAE: 25 });
  });
});

describe('ligação contra o banco', () => {
  it('CPF já cadastrado → liga por CPF; repetir o registro não duplica', async () => {
    const c = await primeiraCrianca();
    const registro = {
      fonte: 'SEDUC' as const,
      idExterno: 'T-CPF-1',
      cpf: '587.959.953-56',
      nome: 'Outro Nome Qualquer',
      nascimento: null,
      mae: null,
      doSeed: true,
    };
    const a = await ligacao.ligar(registro);
    expect(a).toMatchObject({ pessoaId: c.id, acao: 'LIGADA', regra: 'CPF', confianca: 1 });
    const b = await ligacao.ligar(registro);
    expect(b).toMatchObject({ pessoaId: c.id, acao: 'JA_LIGADA' });
  });

  it('mesmo nome, nascimento e mãe, mas CPF diferente → pessoa nova (nunca une)', async () => {
    const c = await primeiraCrianca();
    const r = await ligacao.ligar({
      fonte: 'SEDUC',
      idExterno: 'T-CPF-2',
      cpf: '12345678909',
      nome: c.nome,
      nascimento: c.nascimento,
      mae: c.mae,
      doSeed: true,
    });
    expect(r.acao).toBe('NOVA');
    expect(r.pessoaId).not.toBe(c.id);
  });

  it('homônimo (mesmo nome, nascimento distante, outra mãe) → pessoa nova', async () => {
    const c = await primeiraCrianca();
    const r = await ligacao.ligar({
      fonte: 'SEDUC',
      idExterno: 'T-HOM-1',
      nome: c.nome,
      nascimento: '1980-01-01',
      mae: 'Joana Teste',
      doSeed: true,
    });
    expect(r.acao).toBe('NOVA');
  });

  it('mãe abreviada, sem documento → liga por nome com confiança 0,85 e registra na auditoria', async () => {
    // Outra criança: a CI-10230 ganhou um "sósia" no teste do CPF diferente (dois candidatos fortes
    // seriam ambíguos e iriam, corretamente, para a revisão).
    const c = await primeiraCrianca('CI-10237');
    const partes = c.mae.split(' ');
    const abreviada = [
      partes[0],
      ...partes.slice(1, -1).map((p) => `${p[0]}.`),
      partes.at(-1),
    ].join(' ');
    const ok = await ligacao.ligar({
      fonte: 'GESTAO_ESCOLAR',
      idExterno: 'T-MAE-1',
      nome: c.nome.toUpperCase(),
      nascimento: c.nascimento,
      mae: abreviada,
      doSeed: true,
    });
    expect(ok).toMatchObject({
      pessoaId: c.id,
      acao: 'LIGADA',
      regra: 'NOME_NASCIMENTO_MAE',
      confianca: 0.85,
    });
    const ev = await dono.eventoIdentidade.findFirst({
      where: { pessoaId: c.id, tipo: 'LIGACAO_AUTOMATICA' },
      orderBy: { id: 'desc' },
    });
    expect(ev?.motivo).toMatch(/T-MAE-1/);
  });
});

describe('fila de revisão (só a CTI)', () => {
  it('ESCOLA não acessa (403)', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/identidade/revisoes')
      .set('Authorization', `Bearer ${await token('escola.custodio')}`)
      .expect(403);
  });

  it('lista os dois lados, com documentos sempre mascarados', async () => {
    const r = await request(app.getHttpServer())
      .get('/api/v1/identidade/revisoes')
      .set(await cti())
      .expect(200);
    expect(r.body.length).toBeGreaterThanOrEqual(20);
    const par = r.body[0];
    expect(par.a.nome).toBeTruthy();
    expect(par.b.fontes.length).toBeGreaterThan(0);
    for (const lado of [par.a, par.b]) {
      if (lado.cpf) expect(lado.cpf).toMatch(/^\*\*\*\.\d{3}\.\d{3}-\*\*$/);
      if (lado.nis) expect(lado.nis).toMatch(/^\*\*\*\.\d{4}\*\.\*\*-\*$/);
    }
    expect(JSON.stringify(r.body)).not.toMatch(/\d{11}/);
  });

  it('aceitar une o par: a pessoa nova some e o vínculo dela vai para a pessoa que já existia', async () => {
    const [par] = (
      await request(app.getHttpServer())
        .get('/api/v1/identidade/revisoes')
        .set(await cti())
    ).body;
    const r = await request(app.getHttpServer())
      .post(`/api/v1/identidade/revisoes/${par.id}/aceitar`)
      .set(await cti())
      .expect(200);
    expect(r.body).toMatchObject({ pessoaId: par.a.id, situacao: 'ACEITA', vinculosMovidos: 1 });
    expect(await dono.pessoaMestra.findUnique({ where: { id: par.b.id } })).toBeNull();
    const fontes = await dono.vinculoFonte.findMany({
      where: { pessoaId: par.a.id },
      select: { fonte: true },
    });
    expect(fontes.length).toBeGreaterThanOrEqual(2);
    const ev = await dono.eventoIdentidade.findFirst({
      where: { tipo: 'REVISAO_ACEITA', revisaoId: par.id },
    });
    expect(ev).toMatchObject({ pessoaId: par.a.id, outraPessoa: par.b.id });
  });

  it('rejeitar não mexe em ninguém; decidir de novo dá 409', async () => {
    const [par] = (
      await request(app.getHttpServer())
        .get('/api/v1/identidade/revisoes')
        .set(await cti())
    ).body;
    await request(app.getHttpServer())
      .post(`/api/v1/identidade/revisoes/${par.id}/rejeitar`)
      .set(await cti())
      .expect(200);
    expect(await dono.pessoaMestra.count({ where: { id: { in: [par.a.id, par.b.id] } } })).toBe(2);
    const r = await request(app.getHttpServer())
      .post(`/api/v1/identidade/revisoes/${par.id}/aceitar`)
      .set(await cti())
      .expect(409);
    expect(r.body.codigo).toBe('REVISAO_JA_DECIDIDA');
  });
});

describe('união manual e separação', () => {
  it('não une pessoas com CPFs diferentes (409)', async () => {
    const [a, b] = await dono.pessoaMestra.findMany({
      where: { cpfHash: { not: null } },
      take: 2,
      select: { id: true },
    });
    const r = await request(app.getHttpServer())
      .post('/api/v1/identidade/unir')
      .set(await cti())
      .send({ manterId: a?.id, absorverId: b?.id, motivo: 'Teste de conflito de CPF' })
      .expect(409);
    expect(r.body.codigo).toBe('CPF_DIFERENTE');
  });

  it('une e move caso, matrícula, frequência e família; separar desfaz o vínculo', async () => {
    // Pessoa sem CPF (homônimo criado acima) recebe a criança de um caso de busca ativa matriculada.
    const [semCpf] = await dono.$queryRaw<{ id: number }[]>`
      SELECT pessoa_id AS id FROM pessoas.vinculo_fonte WHERE id_externo = 'T-HOM-1'`;
    const [alvo] = await dono.$queryRaw<{ id: number }[]>`
      SELECT p.id FROM pessoas.pessoa_mestra p
      JOIN pessoas.vinculo_fonte v ON v.pessoa_id = p.id AND v.id_externo LIKE 'CI-%'
      WHERE EXISTS (SELECT 1 FROM educacao.matricula m JOIN educacao.frequencia f ON f.matricula_id = m.id WHERE m.pessoa_id = p.id)
        AND EXISTS (SELECT 1 FROM casos.caso c WHERE c.pessoa_id = p.id)
      LIMIT 1`;
    const antes = await dono.$queryRaw<{ casos: bigint; matriculas: bigint; familias: bigint }[]>`
      SELECT (SELECT count(*) FROM casos.caso WHERE pessoa_id = ${alvo?.id}) AS casos,
             (SELECT count(*) FROM educacao.matricula WHERE pessoa_id = ${alvo?.id}) AS matriculas,
             (SELECT count(*) FROM pessoas.membro_familia WHERE pessoa_id = ${alvo?.id}) AS familias`;

    await request(app.getHttpServer())
      .post('/api/v1/identidade/unir')
      .set(await cti())
      .send({
        manterId: semCpf?.id,
        absorverId: alvo?.id,
        motivo: 'Mesma criança cadastrada duas vezes',
      })
      .expect(200);

    const depois = await dono.$queryRaw<
      { casos: bigint; matriculas: bigint; familias: bigint; cpf: boolean }[]
    >`
      SELECT (SELECT count(*) FROM casos.caso WHERE pessoa_id = ${semCpf?.id}) AS casos,
             (SELECT count(*) FROM educacao.matricula WHERE pessoa_id = ${semCpf?.id}) AS matriculas,
             (SELECT count(*) FROM pessoas.membro_familia WHERE pessoa_id = ${semCpf?.id}) AS familias,
             (SELECT cpf_hash IS NOT NULL FROM pessoas.pessoa_mestra WHERE id = ${semCpf?.id}) AS cpf`;
    expect(Number(depois[0]?.casos)).toBe(Number(antes[0]?.casos));
    expect(Number(depois[0]?.matriculas)).toBe(Number(antes[0]?.matriculas));
    expect(Number(depois[0]?.familias)).toBe(Number(antes[0]?.familias));
    expect(depois[0]?.cpf).toBe(true); // o CPF da pessoa absorvida passou para a mantida
    expect(await dono.pessoaMestra.findUnique({ where: { id: alvo?.id } })).toBeNull();
    const uniao = await dono.eventoIdentidade.findFirst({
      where: { tipo: 'UNIAO_MANUAL', pessoaId: semCpf?.id },
    });
    expect(uniao?.motivo).toBe('Mesma criança cadastrada duas vezes');

    // Separar o registro CI-… de volta.
    const v = await dono.vinculoFonte.findFirstOrThrow({
      where: { pessoaId: semCpf?.id, idExterno: { startsWith: 'CI-' } },
    });
    const sep = await request(app.getHttpServer())
      .post(`/api/v1/identidade/vinculos/${v.id}/separar`)
      .set(await cti())
      .send({ motivo: 'União feita por engano no teste' })
      .expect(200);
    expect(sep.body.pessoaOriginal).toBe(semCpf?.id);
    expect((await dono.vinculoFonte.findUniqueOrThrow({ where: { id: v.id } })).pessoaId).toBe(
      sep.body.pessoaNova,
    );
    expect(
      await dono.eventoIdentidade.count({ where: { tipo: 'SEPARACAO', pessoaId: semCpf?.id } }),
    ).toBe(1);

    // Deixa o banco como encontrou: a pessoa separada (vínculo MANUAL, não veio do seed) volta a ser
    // unida; senão o próximo seed se recusa a limpar o banco de teste.
    await request(app.getHttpServer())
      .post('/api/v1/identidade/unir')
      .set(await cti())
      .send({
        manterId: semCpf?.id,
        absorverId: sep.body.pessoaNova,
        motivo: 'Limpeza do teste de separação',
      })
      .expect(200);
  });

  it('separar quem só tem um registro dá 422', async () => {
    const [so] = await dono.$queryRaw<{ id: number }[]>`
      SELECT min(v.id) AS id FROM pessoas.vinculo_fonte v GROUP BY v.pessoa_id HAVING count(*) = 1 LIMIT 1`;
    const r = await request(app.getHttpServer())
      .post(`/api/v1/identidade/vinculos/${so?.id}/separar`)
      .set(await cti())
      .send({ motivo: 'Tentativa sem sentido' })
      .expect(422);
    expect(r.body.codigo).toBe('NADA_A_SEPARAR');
  });

  it('busca por nome para a união manual não traz documento', async () => {
    const c = await primeiraCrianca();
    const r = await request(app.getHttpServer())
      .get(`/api/v1/identidade/pessoas?q=${encodeURIComponent(c.nome)}`)
      .set(await cti())
      .expect(200);
    expect(r.body[0]).toEqual(
      expect.objectContaining({ nome: expect.any(String), nascimento: expect.any(String) }),
    );
    expect(Object.keys(r.body[0])).not.toContain('cpf');
  });
});
