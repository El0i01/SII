import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { CRAS_CADSUAS } from '../prisma/referencia/cadastro';
import { semearPrototipo } from '../prisma/seed/prototipo/persistir';
import { semearUsuarios } from '../prisma/seed/usuarios';
import { chaveDeHex } from '../src/cripto/cifra';
import type { PrismaClient } from '../src/generated/prisma/client';
import { aplicarMigrations, clienteDono, criarApp, usarBancoDeTeste } from './apoio-integracao';

const { url, senhaSeed } = usarBancoDeTeste();
const MOBILE = { 'x-sii-cliente': 'mobile' };
const CUSTODIO = '11005165';
const PARECER_OK =
  'Visita realizada com a mãe. A criança volta às aulas na segunda; a família foi orientada sobre o transporte.';

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

/** Notificação nova de um aluno da escola de teste (para conferir o aviso à escola). */
async function notificacaoNova(inep: string | null = CUSTODIO) {
  const n = await dono.notificacao.findFirst({
    where: {
      status: 'NOVA',
      caso: { pessoa: inep ? { escolaInep: inep } : {}, encerradoEm: null },
    },
    orderBy: { id: 'asc' },
    select: { codigo: true, caso: { select: { id: true, codigo: true } } },
  });
  if (!n) throw new Error('seed sem notificação nova para o teste');
  return n;
}

describe('caixa de entrada (P11)', () => {
  it('o CRAS vê as notificações do próprio CRAS, sem CPF, com prazo e contagens', async () => {
    const r = await http()
      .get('/api/v1/notificacoes')
      .set(await como('cras.tecnico'))
      .expect(200);
    const total = await dono.notificacao.count({ where: { destinoCrasCodigo: CRAS_CADSUAS } });
    expect(r.body.notificacoes).toHaveLength(total);
    expect(r.body.podeResponder).toBe(true);
    const { novas, emAnalise, pareceres } = r.body.contagens;
    expect(novas + emAnalise + pareceres).toBe(total);
    const texto = JSON.stringify(r.body);
    expect(texto).not.toMatch(/cpf|\d{3}\.\d{3}\.\d{3}-\d{2}/i);
    expect(r.body.notificacoes[0].crianca.iniciais).toMatch(/^[A-Z]\./);
    expect(r.body.notificacoes[0].prazo).toHaveProperty('rotulo');

    const so = await http()
      .get('/api/v1/notificacoes?situacao=NOVA')
      .set(await como('cras.tecnico'))
      .expect(200);
    expect(so.body.notificacoes.every((n: { status: string }) => n.status === 'NOVA')).toBe(true);
  });

  it('a escola vê só os próprios alunos e não pode responder; auditor e ACS não entram', async () => {
    const r = await http()
      .get('/api/v1/notificacoes')
      .set(await como('escola.custodio'))
      .expect(200);
    const daEscola = await dono.notificacao.count({
      where: { caso: { pessoa: { escolaInep: CUSTODIO } } },
    });
    expect(r.body.notificacoes).toHaveLength(daEscola);
    expect(r.body.podeResponder).toBe(false);
    await http()
      .get('/api/v1/notificacoes')
      .set(await como('tce.auditor'))
      .expect(403);
    await http()
      .get('/api/v1/notificacoes')
      .set(await como('acs.area01'))
      .expect(403);
  });

  it('CRAS de outro território não acha a notificação', async () => {
    const n = await notificacaoNova(null);
    await dono.notificacao.update({
      where: { codigo: n.codigo },
      data: { destinoCrasCodigo: '99999999999' },
    });
    await http()
      .get(`/api/v1/notificacoes/${n.codigo}`)
      .set(await como('cras.tecnico'))
      .expect(404);
    await dono.notificacao.update({
      where: { codigo: n.codigo },
      data: { destinoCrasCodigo: CRAS_CADSUAS },
    });
  });
});

describe('parecer (P11)', () => {
  let alvo: Awaited<ReturnType<typeof notificacaoNova>>;
  beforeAll(async () => {
    alvo = await notificacaoNova();
  });

  it('a escola não emite parecer nem marca em análise', async () => {
    const escola = await como('escola.custodio');
    await http()
      .post(`/api/v1/notificacoes/${alvo.codigo}/parecer`)
      .set(escola)
      .send({ desfecho: 'RETORNO_ESCOLA_COMBINADO', texto: PARECER_OK })
      .expect(403);
    await http().post(`/api/v1/notificacoes/${alvo.codigo}/em-analise`).set(escola).expect(403);
  });

  it('marca em análise uma vez só', async () => {
    const cras = await como('cras.tecnico');
    const r = await http()
      .post(`/api/v1/notificacoes/${alvo.codigo}/em-analise`)
      .set(cras)
      .expect(200);
    expect(r.body.status).toBe('EM_ANALISE');
    await http().post(`/api/v1/notificacoes/${alvo.codigo}/em-analise`).set(cras).expect(409);
  });

  it('valida com o schema do shared: 30 caracteres, desfecho obrigatório, sem CID, data da nova visita', async () => {
    const cras = await como('cras.tecnico');
    const enviar = (corpo: object) =>
      http().post(`/api/v1/notificacoes/${alvo.codigo}/parecer`).set(cras).send(corpo).expect(422);
    expect(
      (await enviar({ desfecho: 'RETORNO_ESCOLA_COMBINADO', texto: 'curto' })).body.campos,
    ).toHaveProperty('texto');
    expect((await enviar({ texto: PARECER_OK })).body.campos).toHaveProperty('desfecho');
    expect(
      (await enviar({ desfecho: 'AUSENCIA_JUSTIFICADA_SAUDE', texto: `${PARECER_OK} CID F32.1` }))
        .body.campos.texto[0],
    ).toContain('CID');
    expect(
      (await enviar({ desfecho: 'RETORNO_ESCOLA_COMBINADO', texto: PARECER_OK, novaVisita: true }))
        .body.campos,
    ).toHaveProperty('dataNovaVisita');
  });

  it('parecer fecha o caso, entra na trilha encadeada e avisa a escola e a SEMED', async () => {
    const r = await http()
      .post(`/api/v1/notificacoes/${alvo.codigo}/parecer`)
      .set(await como('cras.tecnico'))
      .send({ desfecho: 'RETORNO_ESCOLA_COMBINADO', texto: PARECER_OK })
      .expect(200);
    expect(r.body.status).toBe('PARECER_EMITIDO');
    expect(r.body.parecer.rotuloDesfecho).toBe('Retorno à escola combinado');
    expect(r.body.casoEncerrado).toBe(true);
    const tipos = r.body.trilha.eventos.map((e: { tipo: string }) => e.tipo);
    expect(tipos.slice(-2)).toEqual(['EM_ANALISE', 'PARECER_EMITIDO']);
    expect(r.body.trilha.verificador).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
    const [t] = await dono.$queryRaw<{ integra: boolean }[]>`
      SELECT integra FROM casos.verificar_trilha(${alvo.caso.id})`;
    expect(t?.integra).toBe(true);

    for (const login of ['escola.custodio', 'semed.gestor']) {
      const a = await http()
        .get('/api/v1/avisos')
        .set(await como(login))
        .expect(200);
      const aviso = a.body.avisos.find((x: { caso: string }) => x.caso === alvo.caso.codigo);
      expect(aviso).toMatchObject({ tipo: 'PARECER_EMITIDO', notificacao: alvo.codigo });
      expect(aviso.texto).toBe(
        `O CRAS emitiu o parecer do caso ${alvo.caso.codigo}: Retorno à escola combinado.`,
      );
      expect(a.body.naoLidos).toBeGreaterThan(0);
    }
    // A escola lê o parecer.
    const lido = await http()
      .get(`/api/v1/notificacoes/${alvo.codigo}`)
      .set(await como('escola.custodio'))
      .expect(200);
    expect(lido.body.parecer.texto).toBe(PARECER_OK);
    expect(lido.body.podeResponder).toBe(false);
  });

  it('parecer duplicado → 409', async () => {
    await http()
      .post(`/api/v1/notificacoes/${alvo.codigo}/parecer`)
      .set(await como('cras.tecnico'))
      .send({ desfecho: 'RETORNO_ESCOLA_COMBINADO', texto: PARECER_OK })
      .expect(409);
  });

  it('Conselho Tutelar ou nova visita mantêm o caso aberto; o Comitê também emite parecer', async () => {
    const ct = await notificacaoNova(null);
    const r = await http()
      .post(`/api/v1/notificacoes/${ct.codigo}/parecer`)
      .set(await como('cras.tecnico'))
      .send({ desfecho: 'ENCAMINHADO_CONSELHO_TUTELAR', texto: PARECER_OK })
      .expect(200);
    expect(r.body.casoEncerrado).toBe(false);
    expect(r.body.trilha.eventos.at(-1).tipo).toBe('ENCAMINHADO_CONSELHO_TUTELAR');

    const visita = await notificacaoNova(null);
    const v = await http()
      .post(`/api/v1/notificacoes/${visita.codigo}/parecer`)
      .set(await como('comite.gestor'))
      .send({
        desfecho: 'RETORNO_ESCOLA_COMBINADO',
        texto: PARECER_OK,
        novaVisita: true,
        dataNovaVisita: '2026-12-02',
      })
      .expect(200);
    expect(v.body.casoEncerrado).toBe(false);
    expect(v.body.parecer).toMatchObject({
      novaVisita: true,
      dataNovaVisita: '2026-12-02',
      autor: 'Comitê Gestor',
    });
  });

  it('marcar aviso como lido', async () => {
    const escola = await como('escola.custodio');
    const a = await http().get('/api/v1/avisos').set(escola).expect(200);
    const id = a.body.avisos[0].id;
    await http().post(`/api/v1/avisos/${id}/lido`).set(escola).expect(204);
    const outro = await dono.aviso.findFirst({ where: { destinoTipo: 'SECRETARIA' } });
    await http().post(`/api/v1/avisos/${outro?.id}/lido`).set(escola).expect(404);
  });
});

describe('encaminhamento manual e pauta (P11)', () => {
  it('a escola encaminha um aluno à SEMED; segundo encaminhamento do mesmo tipo → 409', async () => {
    const aluno = await dono.pessoaMestra.findFirstOrThrow({
      where: { escolaInep: CUSTODIO, casos: { none: { tipo: 'INCLUSAO_SEM_ATENDIMENTO' } } },
      select: { id: true },
    });
    const escola = await como('escola.custodio');
    const corpo = {
      pessoaId: aluno.id,
      tipoCaso: 'INCLUSAO_SEM_ATENDIMENTO',
      destino: 'SEMED',
      motivo: 'Precisa de sala de recursos; a família pediu avaliação.',
    };
    const r = await http()
      .post('/api/v1/casos/encaminhamentos')
      .set(escola)
      .send(corpo)
      .expect(201);
    expect(r.body.codigo).toMatch(/^IN-2026-\d{4}$/);
    expect(r.body.notificacao).toBeNull();
    const caso = await dono.caso.findUniqueOrThrow({
      where: { codigo: r.body.codigo },
      include: { eventos: true, avisos: true },
    });
    expect(caso.motivo).toBe(corpo.motivo);
    expect(caso.eventos.map((e) => e.tipo)).toEqual(['ENCAMINHADO']);
    expect(caso.avisos.map((a) => [a.destinoTipo, a.destinoValor])).toEqual([
      ['SECRETARIA', 'SEMED'],
    ]);
    const de = await http()
      .post('/api/v1/casos/encaminhamentos')
      .set(escola)
      .send(corpo)
      .expect(409);
    expect(de.body.mensagem).toContain(r.body.codigo);
  });

  it('encaminhar à Assistência cria notificação ao CRAS', async () => {
    const pessoa = await dono.pessoaMestra.findFirstOrThrow({
      where: { casos: { none: { tipo: 'PRIMEIRA_INFANCIA_SEM_CUIDADO' } } },
      select: { id: true },
    });
    const r = await http()
      .post('/api/v1/casos/encaminhamentos')
      .set(await como('semed.gestor'))
      .send({
        pessoaId: pessoa.id,
        tipoCaso: 'PRIMEIRA_INFANCIA_SEM_CUIDADO',
        destino: 'ASSISTENCIA',
        motivo: 'Família sem vaga na creche e sem acompanhamento do CRAS.',
      })
      .expect(201);
    expect(r.body.notificacao).toMatch(/^NT-2026-\d{4}$/);
    const n = await dono.notificacao.findUniqueOrThrow({ where: { codigo: r.body.notificacao } });
    expect(n.destinoCrasCodigo).toBe(CRAS_CADSUAS);
    expect(
      await dono.aviso.count({ where: { destinoTipo: 'CRAS', destinoValor: CRAS_CADSUAS } }),
    ).toBeGreaterThan(0);
  });

  it('a escola não encaminha pessoa que não é aluna dela (404) e o CRAS não encaminha (403)', async () => {
    const outra = await dono.pessoaMestra.findFirstOrThrow({
      where: { OR: [{ escolaInep: null }, { escolaInep: { not: CUSTODIO } }] },
      select: { id: true },
    });
    const corpo = {
      pessoaId: outra.id,
      tipoCaso: 'IDOSO_SEM_VISITA',
      destino: 'SEMSAU',
      motivo: 'Sem visita do ACS há muitos meses.',
    };
    await http()
      .post('/api/v1/casos/encaminhamentos')
      .set(await como('escola.custodio'))
      .send(corpo)
      .expect(404);
    await http()
      .post('/api/v1/casos/encaminhamentos')
      .set(await como('cras.tecnico'))
      .send(corpo)
      .expect(403);
  });

  it('pauta do Comitê: casos em nível 3, do mais atrasado; escola não acessa', async () => {
    const caso = await dono.caso.findFirstOrThrow({
      where: { tipo: 'BUSCA_ATIVA_ESCOLAR', encerradoEm: null, status: 'ENCAMINHADO' },
    });
    await dono.caso.update({
      where: { id: caso.id },
      data: { nivel: 3, alertaEm: new Date(Date.now() - 60 * 86_400_000) },
    });
    const r = await http()
      .get('/api/v1/casos/pauta')
      .set(await como('comite.gestor'))
      .expect(200);
    const item = r.body.find((c: { codigo: string }) => c.codigo === caso.codigo);
    expect(item).toMatchObject({ tipo: 'BUSCA_ATIVA_ESCOLAR', etapa: 'ENCAMINHADO' });
    expect(item.diasDeAtraso).toBeGreaterThan(30);
    const atrasos = r.body.map((c: { diasDeAtraso: number | null }) => c.diasDeAtraso ?? 0);
    expect(atrasos).toEqual([...atrasos].sort((a: number, b: number) => b - a));
    expect(JSON.stringify(r.body)).not.toMatch(/nome|cpf/i);
    await http()
      .get('/api/v1/casos/pauta')
      .set(await como('escola.custodio'))
      .expect(403);
  });
});
