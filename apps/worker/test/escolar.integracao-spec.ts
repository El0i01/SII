import { cargaTerminou, FILA_CARGAS, type JobCarga, type StatusCarga } from '@sii/shared';
import { Queue, type Worker } from 'bullmq';
import Redis from 'ioredis';
import type { Client } from 'minio';
import {
  chaveObjeto,
  clienteMinio,
  configMinio,
  garantirBucket,
} from '../../api/src/cargas/armazenamento';
import { chaveDeHex } from '../../api/src/cripto/cifra';
import { criarPrisma, type PrismaClient } from '../src/banco';
import { criarConsumidor } from '../src/cargas/cargas.worker';
import { carregarDicionarioEscolar } from '../src/cargas/dicionario';
import { criarProcessadorEscolar } from '../src/cargas/escolar';
import {
  CABECALHO_GESTAO_ESCOLAR,
  gerarGestaoEscolarFicticia,
} from '../src/cargas/ficticio-escolar';
import type { DependenciasCarga } from '../src/cargas/pipeline';
import { lerEnv } from '../src/config';

/**
 * Cargas da Educação (P10) contra a infra real: gestão escolar (matrícula + frequência) e SEDUC.
 * Precisa do seed no banco de teste (escolas e calendário): rode antes o teste da infrequência ou
 * os testes de integração da API.
 */
const base = lerEnv();
const env = {
  ...base,
  DATABASE_URL: process.env.DATABASE_URL_TESTE ?? '',
  REDIS_URL: base.REDIS_URL.replace(/\/\d*$/, '') + '/15',
};
if (!env.DATABASE_URL) throw new Error('defina DATABASE_URL_TESTE no .env da raiz');
const minioCfg = { ...configMinio(env), bucket: 'sii-cargas-teste' };
const chaves = {
  cifra: chaveDeHex(env.CHAVE_CIFRA, 'CHAVE_CIFRA'),
  hmac: chaveDeHex(env.CHAVE_HMAC, 'CHAVE_HMAC'),
};
const CUSTODIO = '11005165';
const MES = '2026-11';

let prisma: PrismaClient;
let minio: Client;
let redisFila: Redis;
let redisWorker: Redis;
let fila: Queue<JobCarga>;
let worker: Worker<JobCarga>;
const cargas: number[] = [];
const logs: string[] = [];

async function enviar(fonte: 'GESTAO_ESCOLAR' | 'SEDUC', bytes: Buffer) {
  const c = await prisma.logCarga.create({
    data: { fonte, status: 'AGUARDANDO', arquivo: 'teste.csv', mesReferencia: MES },
  });
  cargas.push(c.id);
  const objeto = chaveObjeto(fonte, c.id);
  await minio.putObject(minioCfg.bucket, objeto, bytes, bytes.length);
  await prisma.logCarga.update({ where: { id: c.id }, data: { objeto } });
  await fila.add('carga', { cargaId: c.id }, { jobId: `carga-${c.id}`, attempts: 1 });
  return c.id;
}

async function esperar(id: number) {
  const inicio = Date.now();
  for (;;) {
    const c = await prisma.logCarga.findUniqueOrThrow({ where: { id } });
    if (cargaTerminou(c.status as StatusCarga)) return c;
    if (Date.now() - inicio > 120_000) throw new Error(`carga ${id} não terminou`);
    await new Promise((r) => setTimeout(r, 200));
  }
}

let dias: string[];

beforeAll(async () => {
  prisma = criarPrisma(env.DATABASE_URL);
  minio = clienteMinio(minioCfg);
  await garantirBucket(minio, minioCfg.bucket);
  redisFila = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  redisWorker = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  fila = new Queue<JobCarga>(FILA_CARGAS, { connection: redisFila });
  await fila.obliterate({ force: true });
  const registrar = (m: unknown) => logs.push(String(m));
  const deps: DependenciasCarga = {
    prisma,
    minio,
    bucket: minioCfg.bucket,
    logger: { log: registrar, warn: registrar, error: registrar },
    processadores: {
      GESTAO_ESCOLAR: criarProcessadorEscolar(
        'GESTAO_ESCOLAR',
        carregarDicionarioEscolar('GESTAO_ESCOLAR'),
        chaves,
      ),
      SEDUC: criarProcessadorEscolar('SEDUC', carregarDicionarioEscolar('SEDUC'), chaves),
    },
  };
  worker = criarConsumidor(deps, redisWorker);
  const cal = await prisma.calendarioEscolar.findMany({
    where: {
      escola: { inep: CUSTODIO },
      dia: { gte: new Date('2026-11-09T00:00:00Z'), lte: new Date('2026-11-13T00:00:00Z') },
    },
    orderBy: { dia: 'asc' },
    select: { dia: true },
  });
  dias = cal.map((c) => c.dia.toISOString().slice(0, 10)).slice(0, 3);
  if (dias.length < 3) throw new Error('seed sem calendário na escola de teste');
});

afterAll(async () => {
  await worker?.close();
  if (prisma && cargas.length) {
    const afetadas = await prisma.vinculoFonte.findMany({
      where: { cargaId: { in: cargas } },
      select: { pessoaId: true },
    });
    const ids = [...new Set(afetadas.map((a) => a.pessoaId))];
    await prisma.matricula.deleteMany({
      where: { pessoaId: { in: ids }, inicioEm: { gte: new Date('2026-11-01') } },
    });
    await prisma.vinculoFonte.deleteMany({ where: { cargaId: { in: cargas } } });
    await prisma.eventoIdentidade.deleteMany({ where: { pessoaId: { in: ids } } });
    await prisma.revisaoVinculo.deleteMany({
      where: { OR: [{ pessoaAId: { in: ids } }, { pessoaBId: { in: ids } }] },
    });
    await prisma.pessoaMestra.deleteMany({ where: { id: { in: ids }, vinculos: { none: {} } } });
    // O staging só existe se alguma carga chegou a rodar.
    for (const schema of ['stg_gestao_escolar', 'stg_seduc'])
      await prisma
        .$executeRawUnsafe(`DELETE FROM ${schema}.linha WHERE carga_id = ANY($1)`, cargas)
        .catch(() => undefined);
    await prisma.logCarga.deleteMany({ where: { id: { in: cargas } } });
  }
  await fila?.obliterate({ force: true });
  await fila?.close();
  redisFila?.disconnect();
  redisWorker?.disconnect();
  await prisma?.$disconnect();
});

describe('carga da gestão escolar (P10)', () => {
  let primeira: number;
  let arquivo: ReturnType<typeof gerarGestaoEscolarFicticia>;

  it('grava matrículas na turma e a frequência; sábado vira aviso e é ignorado', async () => {
    arquivo = gerarGestaoEscolarFicticia({
      inep: CUSTODIO,
      dias: [...dias, '2026-11-14'],
      alunos: 30,
      prefixo: 'TGE',
      turmas: ['Turma teste P10 A', 'Turma teste P10 B'],
    });
    primeira = await enviar('GESTAO_ESCOLAR', arquivo.bytes);
    const c = await esperar(primeira);
    expect(c.status).toBe('OK');
    expect(c.total).toBe(120);
    expect(c.rejeitados).toBe(0);
    expect(c.avisos).toBeGreaterThanOrEqual(30); // 30 linhas de sábado
    expect(c.inseridos).toBe(90);
    expect(c.novos + c.ligados + c.revisao).toBe(30);

    const turmas = await prisma.turma.findMany({
      where: { nome: { startsWith: 'Turma teste P10' }, escola: { inep: CUSTODIO } },
      include: { matriculas: { include: { frequencias: true, pessoa: true } } },
    });
    expect(turmas).toHaveLength(2);
    const matriculas = turmas.flatMap((t) => t.matriculas);
    expect(matriculas).toHaveLength(30);
    expect(matriculas.every((m) => m.situacao === 'ATIVA' && m.ano === 2026)).toBe(true);
    expect(matriculas.every((m) => m.pessoa.escolaInep === CUSTODIO)).toBe(true);
    expect(matriculas.every((m) => m.frequencias.length === 3)).toBe(true);
    expect(
      matriculas.some((m) =>
        m.frequencias.some((f) => f.dia.toISOString().startsWith('2026-11-14')),
      ),
    ).toBe(false);
    const avisos = await prisma.erroCarga.findMany({ where: { cargaId: primeira, campo: 'data' } });
    expect(avisos).toHaveLength(30);
  });

  it('reenviar com uma falta corrigida só regrava a situação (idempotente)', async () => {
    const id = await enviar('GESTAO_ESCOLAR', arquivo.bytes);
    const c = await esperar(id);
    expect(c.status).toBe('OK');
    expect(c.novos).toBe(0);
    expect(c.revisao).toBe(0);
    expect(
      await prisma.matricula.count({
        where: { turma: { nome: { startsWith: 'Turma teste P10' } } },
      }),
    ).toBe(30);
  });

  it('INEP desconhecido rejeita só a linha', async () => {
    const outro = gerarGestaoEscolarFicticia({
      inep: '99999998',
      dias: dias.slice(0, 1),
      alunos: 2,
      prefixo: 'TGX',
    });
    const id = await enviar('GESTAO_ESCOLAR', outro.bytes);
    const c = await esperar(id);
    expect(c.status).toBe('OK');
    expect(c.rejeitados).toBe(2);
    expect(c.inseridos).toBe(0);
  });

  it('arquivo sem a coluna da data é rejeitado com mensagem clara', async () => {
    const semData = gerarGestaoEscolarFicticia({
      inep: CUSTODIO,
      dias: dias.slice(0, 1),
      alunos: 2,
      prefixo: 'TGS',
      colunas: CABECALHO_GESTAO_ESCOLAR.filter((x) => x !== 'data_frequencia'),
    });
    const id = await enviar('GESTAO_ESCOLAR', semData.bytes);
    const c = await esperar(id);
    expect(c.status).toBe('REJEITADA');
    expect(c.erro).toContain('Data da frequência (data_frequencia)');
  });

  it('nenhum CPF do arquivo vai para log, erros ou staging', async () => {
    const cpfs = [...arquivo.bytes.toString('utf8').matchAll(/;(\d{11});[FM];/g)].map((m) => m[1]);
    expect(cpfs.length).toBeGreaterThan(0);
    const erros = await prisma.erroCarga.findMany({
      where: { cargaId: { in: cargas } },
      select: { linha: true, campo: true, mensagem: true },
    });
    const stg = await prisma.$queryRaw<{ dados: unknown }[]>`
      SELECT dados FROM stg_gestao_escolar.linha WHERE carga_id = ANY(${cargas})`;
    const textos = [logs.join('\n'), JSON.stringify(erros), JSON.stringify(stg)].join('\n');
    for (const cpf of cpfs) expect(textos).not.toContain(cpf as string);
    expect(stg.every((l) => !('cpf' in (l.dados as object)))).toBe(true);
  });
});

describe('carga da SEDUC-RO (P10)', () => {
  it('grava as matrículas na rede estadual com a situação', async () => {
    const estadual = await prisma.escola.findFirst({ where: { rede: 'ESTADUAL' } });
    expect(estadual).not.toBeNull();
    const csv = [
      'inep_escola;serie;codigo_aluno;nome_aluno;data_nascimento;nome_mae;situacao_matricula',
      `${estadual?.inep};8º ano;TSE001;Aluna Teste Seduc Um;02/04/2012;Mãe Teste Um;Cursando`,
      `${estadual?.inep};9º ano;TSE002;Aluno Teste Seduc Dois;15/08/2011;Mãe Teste Dois;Transferido`,
      `${estadual?.inep};9º ano;TSE003;Aluno Teste Seduc Três;15/08/2011;Mãe Teste Três;remanejado`,
    ].join('\n');
    const id = await enviar('SEDUC', Buffer.from(csv, 'utf8'));
    const c = await esperar(id);
    expect(c.status).toBe('OK');
    expect(c.inseridos).toBe(2);
    expect(c.rejeitados).toBe(1);
    const ms = await prisma.matricula.findMany({
      where: {
        escolaId: estadual?.id,
        pessoa: { nome: { startsWith: 'Alun' }, vinculos: { some: { cargaId: id } } },
      },
      select: { situacao: true },
    });
    expect(ms.map((m) => m.situacao).sort()).toEqual(['ATIVA', 'TRANSFERIDA']);
  });
});
