import type { INestApplication } from '@nestjs/common';
import { diasCorridosEntre, hojeEmPortoVelho } from '@sii/shared';
import request from 'supertest';
import { DATA_BASE, gerarPrototipo } from '../prisma/seed/prototipo/gerador';
import { semearPrototipo } from '../prisma/seed/prototipo/persistir';
import { semearUsuarios } from '../prisma/seed/usuarios';
import { chaveDeHex } from '../src/cripto/cifra';
import type { PrismaClient } from '../src/generated/prisma/client';
import { aplicarMigrations, clienteDono, criarApp, usarBancoDeTeste } from './apoio-integracao';

const { url, senhaSeed } = usarBancoDeTeste();
const MOBILE = { 'x-sii-cliente': 'mobile' };
const CPF_CLARO = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/;
const RELATO = 'Família visitada; a mãe disse que vai procurar a escola nesta semana.';

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

/** Fórmulas do protótipo (vBusca/prazo), com os dias deslocados de DATA_BASE para hoje. */
function numerosDoPrototipo() {
  const cs = gerarPrototipo().casos;
  const desloca = diasCorridosEntre(DATA_BASE, hojeEmPortoVelho());
  const LIM: Record<string, number> = {
    Identificado: 5,
    Encaminhado: 20,
    'Visita realizada': 30,
    'Não localizado': 30,
  };
  const por = (s: string) => cs.filter((c) => c.status === s).length;
  return {
    identificados: cs.length,
    encaminhados: cs.filter((c) => c.status !== 'Identificado').length,
    visitados: por('Visita realizada') + por('Matriculado'),
    matriculados: por('Matriculado'),
    naoLocalizados: por('Não localizado'),
    escalonados: cs.filter(
      (c) => c.status !== 'Matriculado' && (LIM[c.status] as number) - (c.dias + desloca) < -7,
    ).length,
    porOrigem: {
      CadÚnico: cs.filter((c) => c.origem === 'CadÚnico').length,
      'e-SUS': cs.filter((c) => c.origem === 'e-SUS').length,
      'Censo Municipal': cs.filter((c) => c.origem === 'Censo Municipal').length,
      'Outra base': 0,
    },
  };
}

describe('painel da busca ativa (P13)', () => {
  it('com o seed, os números batem com o protótipo', async () => {
    const r = await http()
      .get('/api/v1/busca-ativa/painel')
      .set(await como('semed.gestor'))
      .expect(200);
    const esperado = numerosDoPrototipo();
    expect(r.body).toMatchObject({ suprimido: false, ...esperado });
    expect(r.body.identificados).toBe(74);
    expect(r.body.encaminhadosEm30).toEqual(expect.any(Number));
  });

  it('o auditor recebe só agregados, com contagens < 5 suprimidas', async () => {
    const r = await http()
      .get('/api/v1/busca-ativa/painel')
      .set(await como('tce.auditor'))
      .expect(200);
    const esperado = numerosDoPrototipo();
    expect(r.body.suprimido).toBe(true);
    expect(r.body.identificados).toBe(74);
    expect(r.body.naoLocalizados).toBe(
      esperado.naoLocalizados < 5 ? null : esperado.naoLocalizados,
    );
    expect(r.body).not.toHaveProperty('itens');
    await http()
      .get('/api/v1/busca-ativa')
      .set(await como('tce.auditor'))
      .expect(403);
  });

  it('lista: 74 casos, CPF mascarado, sem nome; ações conforme etapa e perfil', async () => {
    const r = await http()
      .get('/api/v1/busca-ativa')
      .set(await como('semed.gestor'))
      .expect(200);
    expect(r.body.itens).toHaveLength(74);
    const texto = JSON.stringify(r.body);
    expect(texto).not.toMatch(CPF_CLARO);
    expect(r.body.itens[0]).not.toHaveProperty('nome');
    expect(r.body.itens[0].cpf).toMatch(/^\*\*\*\.\d{3}\.\d{3}-\*\*$/);
    const identificado = r.body.itens.find((i: { status: string }) => i.status === 'IDENTIFICADO');
    expect(identificado.acoes).toEqual(['ENCAMINHAR', 'MATRICULAR']);
    const matriculado = r.body.itens.find((i: { status: string }) => i.status === 'MATRICULADO');
    expect(matriculado.acoes).toEqual([]);
    expect(matriculado.prazo.rotulo).toBe('Concluído');
    expect(matriculado.escola).toEqual(expect.any(String));
  });
});

describe('etapas (P13)', () => {
  async function casoNa(status: string, secretaria?: string) {
    const c = await dono.caso.findFirst({
      where: {
        tipo: 'BUSCA_ATIVA_ESCOLAR',
        status,
        encerradoEm: null,
        ...(secretaria ? { secretariaResponsavel: secretaria } : {}),
      },
      orderBy: { id: 'asc' },
      select: { id: true, codigo: true, pessoaId: true },
    });
    if (!c) throw new Error(`seed sem caso ${status}`);
    return c;
  }

  it('encaminhar: SEMED leva à Assistência; etapa repetida 409; CRAS não encaminha (403)', async () => {
    const c = await casoNa('IDENTIFICADO');
    await http()
      .post(`/api/v1/busca-ativa/${c.codigo}/encaminhar`)
      .set(await como('cras.tecnico'))
      .send({ secretaria: 'ASSISTENCIA' })
      .expect(403);
    await http()
      .post(`/api/v1/busca-ativa/${c.codigo}/encaminhar`)
      .set(await como('semed.gestor'))
      .send({ secretaria: 'SEMFAZ' })
      .expect(422);
    const r = await http()
      .post(`/api/v1/busca-ativa/${c.codigo}/encaminhar`)
      .set(await como('semed.gestor'))
      .send({ secretaria: 'ASSISTENCIA' })
      .expect(200);
    expect(r.body).toMatchObject({ status: 'ENCAMINHADO', responsavel: 'ASSISTENCIA' });
    expect(r.body.trilha.eventos.at(-1)).toMatchObject({
      tipo: 'ENCAMINHADO',
      destino: 'ASSISTENCIA',
    });
    expect(r.body.trilha.verificador).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
    const aviso = await dono.aviso.findFirst({ where: { casoId: c.id, tipo: 'ENCAMINHAMENTO' } });
    expect(aviso?.destinoTipo).toBe('CRAS');
    const de_novo = await http()
      .post(`/api/v1/busca-ativa/${c.codigo}/encaminhar`)
      .set(await como('semed.gestor'))
      .send({ secretaria: 'SEMED' });
    expect(de_novo.status).toBe(409);
    expect(de_novo.body.codigo).toBe('ETAPA_INVALIDA');

    // A visita agora é da Assistência: a SEMED não registra; o CRAS sim.
    await http()
      .post(`/api/v1/busca-ativa/${c.codigo}/visita`)
      .set(await como('semed.gestor'))
      .send({ localizada: false, relato: RELATO })
      .expect(403);
    const v = await http()
      .post(`/api/v1/busca-ativa/${c.codigo}/visita`)
      .set(await como('cras.tecnico'))
      .send({ localizada: false, relato: RELATO })
      .expect(200);
    expect(v.body.status).toBe('NAO_LOCALIZADO');
    expect(v.body.visitas[0].relato).toBe(RELATO);

    // Não localizado → Conselho Tutelar fecha o caso, com a trilha íntegra.
    const ct = await http()
      .post(`/api/v1/busca-ativa/${c.codigo}/conselho-tutelar`)
      .set(await como('semed.gestor'))
      .expect(200);
    expect(ct.body).toMatchObject({ encerrado: true, acoes: [] });
    expect(ct.body.prazo.rotulo).toBe('Comunicado ao Conselho Tutelar');
    const [trilha] = await dono.$queryRaw<{ integra: boolean }[]>`
      SELECT integra FROM casos.verificar_trilha(${c.id}::int)`;
    expect(trilha?.integra).toBe(true);
  });

  it('visita com CID no relato é recusada (422)', async () => {
    const c = await casoNa('ENCAMINHADO', 'SEMED');
    await http()
      .post(`/api/v1/busca-ativa/${c.codigo}/visita`)
      .set(await como('semed.gestor'))
      .send({ localizada: true, relato: `${RELATO} CID F32.1` })
      .expect(422);
  });

  it('matrícula manual cria a matrícula e fecha o caso', async () => {
    const c = await casoNa('VISITA_REALIZADA');
    await http()
      .post(`/api/v1/busca-ativa/${c.codigo}/matricula`)
      .set(await como('semed.gestor'))
      .send({ inep: '00000000' })
      .expect(422);
    const r = await http()
      .post(`/api/v1/busca-ativa/${c.codigo}/matricula`)
      .set(await como('semed.gestor'))
      .send({ inep: '11005165' })
      .expect(200);
    expect(r.body).toMatchObject({ status: 'MATRICULADO', encerrado: true });
    const m = await dono.matricula.findFirst({
      where: { pessoaId: c.pessoaId, situacao: 'ATIVA', escola: { inep: '11005165' } },
    });
    expect(m).not.toBeNull();
    const caso = await dono.caso.findUniqueOrThrow({ where: { id: c.id } });
    expect(caso.nivel).toBe(0);
    expect(caso.encerradoEm).not.toBeNull();
  });

  it('caso inexistente: 404', async () => {
    await http()
      .get('/api/v1/busca-ativa/BA-1999-0001')
      .set(await como('semed.gestor'))
      .expect(404);
  });
});
