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
import { criarProcessadorCadunico } from '../src/cargas/cadunico';
import { criarConsumidor } from '../src/cargas/cargas.worker';
import { carregarDicionarioCadunico } from '../src/cargas/dicionario';
import { CABECALHO_CECAD, gerarCadunicoFicticio } from '../src/cargas/ficticio';
import type { DependenciasCarga } from '../src/cargas/pipeline';
import { lerEnv } from '../src/config';

/**
 * Critérios de aceite do P08, contra a infra real (sii_teste, Redis, MinIO):
 * 5 mil linhas em menos de 2 min; coluna faltando → rejeição clara; nenhum CPF em log.
 * Redis no banco 15 e bucket próprio: um worker de desenvolvimento rodando não pega estes jobs.
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

let prisma: PrismaClient;
let minio: Client;
let redisFila: Redis;
let redisWorker: Redis;
let fila: Queue<JobCarga>;
let worker: Worker<JobCarga>;
const cargas: number[] = [];
const logs: string[] = [];

const MES = '2026-10';
const grande = gerarCadunicoFicticio(5000, { semente: 7, prefixoFamilia: '9' });

async function enviar(bytes: Buffer, mes = MES) {
  const c = await prisma.logCarga.create({
    data: { fonte: 'CADUNICO', status: 'AGUARDANDO', arquivo: 'teste.csv', mesReferencia: mes },
  });
  cargas.push(c.id);
  const objeto = chaveObjeto('CADUNICO', c.id);
  await minio.putObject(minioCfg.bucket, objeto, bytes, bytes.length);
  await prisma.logCarga.update({ where: { id: c.id }, data: { objeto } });
  await fila.add('carga', { cargaId: c.id }, { jobId: `carga-${c.id}`, attempts: 1 });
  return c.id;
}

async function esperar(id: number, limiteMs = 180_000) {
  const inicio = Date.now();
  for (;;) {
    const c = await prisma.logCarga.findUniqueOrThrow({ where: { id } });
    if (cargaTerminou(c.status as StatusCarga)) return { ...c, ms: Date.now() - inicio };
    if (Date.now() - inicio > limiteMs) throw new Error(`carga ${id} não terminou`);
    await new Promise((r) => setTimeout(r, 200));
  }
}

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
    processadores: { CADUNICO: criarProcessadorCadunico(carregarDicionarioCadunico(), chaves) },
  };
  worker = criarConsumidor(deps, redisWorker);
});

afterAll(async () => {
  await worker?.close();
  // Limpeza por carga: o banco de teste volta a ter só o seed (a trava do seed exige isso).
  if (prisma && cargas.length) {
    const afetadas = await prisma.vinculoFonte.findMany({
      where: { cargaId: { in: cargas } },
      select: { pessoaId: true },
    });
    const ids = [...new Set(afetadas.map((a) => a.pessoaId))];
    await prisma.vinculoFonte.deleteMany({ where: { cargaId: { in: cargas } } });
    await prisma.eventoIdentidade.deleteMany({ where: { pessoaId: { in: ids } } });
    await prisma.revisaoVinculo.deleteMany({
      where: { OR: [{ pessoaAId: { in: ids } }, { pessoaBId: { in: ids } }] },
    });
    await prisma.pessoaMestra.deleteMany({ where: { id: { in: ids }, vinculos: { none: {} } } });
    await prisma.familia.deleteMany({
      where: {
        OR: [{ codigoFamiliar: { startsWith: '9' } }, { codigoFamiliar: { startsWith: '8' } }],
      },
    });
    await prisma.$executeRaw`DELETE FROM stg_cadunico.pessoa WHERE carga_id = ANY(${cargas})`;
    await prisma.logCarga.deleteMany({ where: { id: { in: cargas } } });
  }
  await fila?.obliterate({ force: true });
  await fila?.close();
  redisFila?.disconnect();
  redisWorker?.disconnect();
  await prisma?.$disconnect();
});

describe('carga do CadÚnico (P08)', () => {
  let primeira: number;

  it('5 mil linhas em menos de 2 minutos, com famílias, retrato do mês e erros por linha', async () => {
    primeira = await enviar(grande.bytes);
    const c = await esperar(primeira);
    expect(c.status).toBe('OK');
    expect(c.ms).toBeLessThan(120_000);
    expect(c.codificacao).toBe('windows-1252');
    expect(c.separador).toBe(';');
    expect(c.total).toBe(5000);
    expect(c.lidos).toBe(5000);
    expect(c.rejeitados).toBe(grande.comErro);
    expect(c.inseridos).toBe(5000 - grande.comErro);
    expect(c.novos + c.ligados + c.revisao).toBe(c.inseridos);
    expect(c.avisos).toBeGreaterThan(0);

    const familias = await prisma.familia.count({ where: { codigoFamiliar: { startsWith: '9' } } });
    expect(familias).toBeGreaterThan(1000);
    const retratos = await prisma.cadunicoFamilia.count({
      where: { mesReferencia: MES, familia: { codigoFamiliar: { startsWith: '9' } } },
    });
    expect(retratos).toBe(familias);
    const vinculos = await prisma.vinculoFonte.count({ where: { cargaId: primeira } });
    expect(vinculos).toBe(c.novos + c.revisao + c.ligados);

    const erros = await prisma.erroCarga.findMany({ where: { cargaId: primeira } });
    const linhasComErro = new Set(erros.filter((e) => e.gravidade === 'ERRO').map((e) => e.linha));
    expect(linhasComErro.size).toBe(grande.comErro);
    expect(erros.every((e) => e.linha >= 2 && e.linha <= 5001)).toBe(true);

    // O arquivo original sai do MinIO.
    expect(c.objeto).toBeNull();
    await expect(
      minio.statObject(minioCfg.bucket, chaveObjeto('CADUNICO', primeira)),
    ).rejects.toThrow();
  });

  it('reenviar o mesmo arquivo não cria nada de novo (idempotente)', async () => {
    const id = await enviar(grande.bytes);
    const c = await esperar(id);
    expect(c.status).toBe('OK');
    expect(c.novos).toBe(0);
    expect(c.revisao).toBe(0);
    expect(c.ligados).toBe(5000 - grande.comErro);
    const retratos = await prisma.cadunicoFamilia.count({
      where: { mesReferencia: MES, familia: { codigoFamiliar: { startsWith: '9' } } },
    });
    expect(retratos).toBe(
      await prisma.familia.count({ where: { codigoFamiliar: { startsWith: '9' } } }),
    );
  });

  it('arquivo sem a coluna do NIS é rejeitado com mensagem clara e nada é gravado', async () => {
    const semNis = gerarCadunicoFicticio(50, {
      semente: 8,
      prefixoFamilia: '8',
      colunas: CABECALHO_CECAD.filter((c) => c !== 'p.num_nis_pessoa_atual'),
    });
    const id = await enviar(semNis.bytes);
    const c = await esperar(id);
    expect(c.status).toBe('REJEITADA');
    expect(c.erro).toContain(
      'a coluna obrigatória do layout CadÚnico: NIS (p.num_nis_pessoa_atual)',
    );
    expect(c.objeto).toBeNull();
    expect(await prisma.familia.count({ where: { codigoFamiliar: { startsWith: '8' } } })).toBe(0);
    expect(await prisma.vinculoFonte.count({ where: { cargaId: id } })).toBe(0);
  });

  it('arquivo sem separador reconhecível é rejeitado', async () => {
    const id = await enviar(Buffer.from('coluna_unica\nvalor\n'));
    const c = await esperar(id);
    expect(c.status).toBe('REJEITADA');
    expect(c.erro).toContain('separador');
  });

  it('nenhum CPF ou NIS do arquivo aparece em log, LogCarga, erros, staging, vínculo ou job', async () => {
    const job = await fila.getJob(`carga-${primeira}`);
    const textos = [
      ...logs,
      JSON.stringify(job?.data ?? {}),
      JSON.stringify(await prisma.logCarga.findMany({ where: { id: { in: cargas } } })),
      JSON.stringify(
        await prisma.erroCarga.findMany({ where: { cargaId: { in: cargas } } }),
        (_k, v) => (typeof v === 'bigint' ? v.toString() : v),
      ),
      JSON.stringify(
        await prisma.$queryRaw`SELECT dados::text FROM stg_cadunico.pessoa WHERE carga_id = ANY(${cargas})`,
      ),
      JSON.stringify(
        await prisma.vinculoFonte.findMany({
          where: { cargaId: { in: cargas } },
          select: { idExterno: true, dados: true },
        }),
      ),
    ].join('\n');
    expect(job?.data).toEqual({ cargaId: primeira });
    expect(logs.length).toBeGreaterThan(0);
    // Tira a máscara de CPF (000.000.000-00) e pega toda janela de 11 dígitos seguidos.
    const semMascara = textos.replace(/(\d{3})\.(\d{3})\.(\d{3})-(\d{2})/g, '$1$2$3$4');
    const achados = new Set<string>();
    for (const [run] of semMascara.matchAll(/\d{11,}/g))
      for (let i = 0; i + 11 <= run.length; i++) achados.add(run.slice(i, i + 11));
    const vazados = grande.documentos.filter((d) => achados.has(d));
    expect(vazados).toEqual([]);
  });
});
