import {
  adicionarDias,
  cargaTerminou,
  FILA_CARGAS,
  type JobCarga,
  type StatusCarga,
} from '@sii/shared';
import { Queue, type Worker } from 'bullmq';
import Redis from 'ioredis';
import { Client, Pool } from 'pg';
import { buscarAlertasCarga } from '../../api/src/cargas/alertas';
import { clienteMinio, configMinio } from '../../api/src/cargas/armazenamento';
import { chaveDeHex } from '../../api/src/cripto/cifra';
import { criarPrisma, type PrismaClient } from '../src/banco';
import { criarConsumidor } from '../src/cargas/cargas.worker';
import type { DependenciasCarga } from '../src/cargas/pipeline';
import { lerEnv } from '../src/config';
import { executarDryRun, formatarDryRun } from '../src/esus/dry-run';
import { ISCA_CID, type PecFicticio, popularPecFicticio } from '../src/esus/ficticio';
import { carregarContratoPec, conectarPec } from '../src/esus/pec';
import { criarProcessadorEsus, hojePortoVelho } from '../src/esus/processador';

/**
 * Critérios de aceite do P09, contra um PostgreSQL de teste com o schema mínimo do PEC:
 * - o banco `pec_teste` é criado aqui, com o papel `pec_leitura` (só SELECT);
 * - a carga vai pela fila (Redis /15), grava em sii_teste e é limpa no fim por carga.
 */
const base = lerEnv();
const env = {
  ...base,
  DATABASE_URL: process.env.DATABASE_URL_TESTE ?? '',
  REDIS_URL: base.REDIS_URL.replace(/\/\d*$/, '') + '/15',
};
if (!env.DATABASE_URL) throw new Error('defina DATABASE_URL_TESTE no .env da raiz');
const url = new URL(env.DATABASE_URL);
const BANCO_PEC = 'pec_teste';
const urlBanco = (banco: string) => {
  const u = new URL(env.DATABASE_URL);
  u.pathname = `/${banco}`;
  return u.toString();
};
const LEITURA = { usuario: 'pec_leitura', senha: 'pec-leitura-teste' };
const cfgPec = {
  host: url.hostname,
  porta: Number(url.port || 5432),
  banco: BANCO_PEC,
  schema: 'public',
  ...LEITURA,
};
const chaves = {
  cifra: chaveDeHex(env.CHAVE_CIFRA, 'CHAVE_CIFRA'),
  hmac: chaveDeHex(env.CHAVE_HMAC, 'CHAVE_HMAC'),
};
const contrato = carregarContratoPec();
const MICROAREAS = { '7327862/04': 'area04', '7327862/05': 'area05' };
const HOJE = hojePortoVelho();

let prisma: PrismaClient;
let adminPec: Pool;
let pec: Pool;
let redisFila: Redis;
let redisWorker: Redis;
let fila: Queue<JobCarga>;
let worker: Worker<JobCarga>;
let dados: PecFicticio;
const logs: string[] = [];
const jobs: unknown[] = [];

async function cargasEsus(): Promise<number[]> {
  const c = await prisma.logCarga.findMany({ where: { fonte: 'ESUS_PEC' }, select: { id: true } });
  return c.map((x) => x.id);
}

/** Desfaz o que as cargas do e-SUS gravaram em sii_teste (o seed continua rodando depois). */
async function limpar() {
  const cargas = await cargasEsus();
  if (!cargas.length) return;
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
  await prisma
    .$executeRawUnsafe('DELETE FROM stg_esus.cidadao WHERE carga_id = ANY($1::int[])', cargas)
    .catch(() => undefined);
  await prisma.logCarga.deleteMany({ where: { id: { in: cargas } } });
}

async function rodar(limiteMs = 120_000) {
  const job = await fila.add('esus', { fonte: 'ESUS_PEC' }, { attempts: 1 });
  const inicio = Date.now();
  for (;;) {
    const j = await fila.getJob(job.id as string);
    const cargaId = j?.data.cargaId;
    if (cargaId) {
      const c = await prisma.logCarga.findUniqueOrThrow({ where: { id: cargaId } });
      if (cargaTerminou(c.status as StatusCarga)) {
        jobs.push(j?.data);
        return c;
      }
    }
    if (Date.now() - inicio > limiteMs) throw new Error('a carga do e-SUS não terminou');
    await new Promise((r) => setTimeout(r, 200));
  }
}

async function pessoaDoCidadao(co: number) {
  const v = await prisma.vinculoFonte.findUnique({
    where: { fonte_idExterno: { fonte: 'ESUS', idExterno: `C${co}` } },
    include: { pessoa: { include: { sinalizador: true } } },
  });
  return v?.pessoa ?? null;
}

beforeAll(async () => {
  prisma = criarPrisma(env.DATABASE_URL);
  await limpar();

  // PEC de teste: banco próprio, papel só com SELECT.
  const admin = new Client({ connectionString: urlBanco('postgres') });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${BANCO_PEC} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${BANCO_PEC}`);
  await admin.query(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${LEITURA.usuario}') THEN
      CREATE ROLE ${LEITURA.usuario} LOGIN PASSWORD '${LEITURA.senha}';
    ELSE ALTER ROLE ${LEITURA.usuario} PASSWORD '${LEITURA.senha}';
    END IF; END $$`);
  await admin.end();
  adminPec = new Pool({ connectionString: urlBanco(BANCO_PEC) });
  dados = await popularPecFicticio(adminPec, { n: 300, semente: 9, hoje: HOJE });
  await adminPec.query(
    `GRANT USAGE ON SCHEMA public TO ${LEITURA.usuario};
     GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${LEITURA.usuario}`,
  );
  pec = conectarPec(cfgPec);

  redisFila = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  redisWorker = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  fila = new Queue<JobCarga>(FILA_CARGAS, { connection: redisFila });
  await fila.obliterate({ force: true });
  const registrar = (m: unknown) => logs.push(String(m));
  const minio = configMinio(env);
  const deps: DependenciasCarga = {
    prisma,
    minio: clienteMinio(minio),
    bucket: minio.bucket,
    logger: { log: registrar, warn: registrar, error: registrar },
    processadores: {},
    consultas: {
      ESUS_PEC: criarProcessadorEsus({
        pec,
        schema: 'public',
        contrato,
        microareas: MICROAREAS,
        chaves,
        hoje: () => HOJE,
      }),
    },
  };
  worker = criarConsumidor(deps, redisWorker);
}, 120_000);

afterAll(async () => {
  await worker?.close();
  if (prisma) await limpar();
  await fila?.obliterate({ force: true });
  await fila?.close();
  redisFila?.disconnect();
  redisWorker?.disconnect();
  await pec?.end();
  await adminPec?.end();
  const admin = new Client({ connectionString: urlBanco('postgres') });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${BANCO_PEC} WITH (FORCE)`);
  await admin.end();
  await prisma?.$disconnect();
});

describe('conector do e-SUS PEC (P09)', () => {
  it('dry-run lista as contagens por tabela e não grava nada', async () => {
    const antes = await prisma.logCarga.count();
    const vinculos = await prisma.vinculoFonte.count({ where: { fonte: 'ESUS' } });
    const r = await executarDryRun(pec, 'public', contrato, null);
    expect(r.faltando).toEqual([]);
    expect(r.relatorio?.tabelas).toEqual(dados.linhasPorTabela);
    expect(r.relatorio?.cidadaosALer).toBe(dados.validos + dados.semNascimento);
    const texto = formatarDryRun(r, 'COMPLETA', null);
    expect(texto).toContain('tb_fat_cad_individual');
    expect(texto).toContain('nada foi gravado');
    expect(await prisma.logCarga.count()).toBe(antes);
    expect(await prisma.vinculoFonte.count({ where: { fonte: 'ESUS' } })).toBe(vinculos);
  });

  it('a conexão do conector é somente leitura (papel só SELECT e sessão read only)', async () => {
    await expect(pec.query(`INSERT INTO tb_dim_profissional VALUES (99, 'x')`)).rejects.toThrow();
    // Mesmo com um usuário que pode escrever, a sessão aberta pelo conector recusa.
    const dono = conectarPec({
      ...cfgPec,
      usuario: url.username,
      senha: decodeURIComponent(url.password),
    });
    await expect(dono.query(`INSERT INTO tb_dim_profissional VALUES (99, 'x')`)).rejects.toThrow(
      /read-only/,
    );
    await dono.end();
  });

  it('carga completa: liga as pessoas e grava só os sinalizadores', async () => {
    const c = await rodar();
    expect(c.status).toBe('OK');
    expect(c.modo).toBe('COMPLETA');
    expect(c.marca).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(c.lidos).toBe(dados.validos + dados.semNascimento);
    expect(c.rejeitados).toBe(dados.semNascimento);
    expect(c.inseridos).toBe(dados.validos);
    expect(c.novos + c.ligados + c.revisao).toBe(dados.validos);
    expect(c.avisos).toBe(2); // CPF inválido + microárea sem conversão
    expect(c.resumo).toMatchObject(dados.linhasPorTabela);
    expect(await prisma.vinculoFonte.count({ where: { cargaId: c.id } })).toBe(dados.validos);

    const k = dados.casos;
    const p1 = await pessoaDoCidadao(k.idosoSemGripeCronicoAcompanhado);
    expect(p1?.sinalizador).toMatchObject({
      ubsCnes: '7327862',
      acsResponsavel: 'ACS Fictícia Um',
      vacinaGripeEmDia: false,
      condicaoCronica: true,
      condicaoCronicaAcompanhada: true,
      acamadoDomiciliado: false,
      vacinacaoEmDia: null,
      preNatalAdequado: null,
      necessitaAtendimentoEspecializado: null,
    });
    expect(['area04', 'area05']).toContain(p1?.sinalizador?.microarea);
    expect(p1?.microarea).toBe(p1?.sinalizador?.microarea);

    const p2 = await pessoaDoCidadao(k.idosoComGripeAcamado);
    expect(p2?.sinalizador).toMatchObject({ vacinaGripeEmDia: true, acamadoDomiciliado: true });

    const p3 = await pessoaDoCidadao(k.cronicoSemConsultaMicroareaSemConversao);
    expect(p3?.sinalizador).toMatchObject({
      microarea: '09',
      condicaoCronica: true,
      condicaoCronicaAcompanhada: false,
      vacinaGripeEmDia: null,
    });
    expect(p3?.microarea).not.toBe('09');

    const p4 = await pessoaDoCidadao(k.soVisita);
    expect(p4?.sinalizador).toMatchObject({
      ubsCnes: null,
      acamadoDomiciliado: null,
      condicaoCronica: null,
    });
    expect(p4?.sinalizador?.ultimaVisitaAcs?.toISOString().slice(0, 10)).toBe(
      adicionarDias(HOJE, -20),
    );

    const p5 = await pessoaDoCidadao(k.cpfInvalido);
    expect(p5?.cpfHash).toBeNull();
    expect(await pessoaDoCidadao(k.semNascimento)).toBeNull();
    expect(await pessoaDoCidadao(k.inativo)).toBeNull();

    const erros = await prisma.erroCarga.findMany({ where: { cargaId: c.id } });
    expect(erros.map((e) => [e.linha, e.campo]).sort()).toEqual(
      [
        [k.cpfInvalido, 'cpf'],
        [k.cronicoSemConsultaMicroareaSemConversao, 'microarea'],
        [k.semNascimento, 'nascimento'],
      ].sort(),
    );
  });

  it('incremental: só relê quem mudou no PEC e não duplica nada', async () => {
    const vinculos = await prisma.vinculoFonte.count({ where: { fonte: 'ESUS' } });
    await adminPec.query(
      `UPDATE tb_cidadao SET dt_atualizado = now() WHERE co_seq_cidadao IN (20, 21, 22)`,
    );
    await adminPec.query(`INSERT INTO tb_fat_visita_domiciliar VALUES (1030, $1, 1)`, [
      Number(HOJE.replace(/-/g, '')),
    ]);
    const c = await rodar();
    expect(c.status).toBe('OK');
    expect(c.modo).toBe('INCREMENTAL');
    expect(c.lidos).toBe(4);
    expect(c.novos).toBe(0);
    expect(c.ligados).toBe(4);
    const p30 = await pessoaDoCidadao(30);
    expect(p30?.sinalizador?.ultimaVisitaAcs?.toISOString().slice(0, 10)).toBe(HOJE);

    const deNovo = await rodar();
    expect(deNovo.modo).toBe('INCREMENTAL');
    expect(deNovo.novos).toBe(0);
    expect(await prisma.vinculoFonte.count({ where: { fonte: 'ESUS' } })).toBe(vinculos);
  });

  it('estrutura mudou: falha visível, sem gravar nada, alerta a CTI até a próxima carga OK', async () => {
    const antes = {
      sinalizadores: await prisma.sinalizadorSaude.count(),
      vinculos: await prisma.vinculoFonte.count(),
      pessoas: await prisma.pessoaMestra.count(),
    };
    await adminPec.query('ALTER TABLE tb_cidadao RENAME COLUMN dt_atualizado TO dt_atualizacao');

    const dry = await executarDryRun(pec, 'public', contrato, null);
    expect(dry.faltando).toEqual(['tb_cidadao.dt_atualizado']);
    expect(formatarDryRun(dry, 'COMPLETA', null)).toContain('- tb_cidadao.dt_atualizado');

    const c = await rodar();
    expect(c.status).toBe('FALHOU');
    expect(c.erro).toContain('A estrutura do banco do e-SUS mudou');
    expect(c.erro).toContain('tb_cidadao.dt_atualizado');
    expect(c.erro).toContain('Nada foi gravado');
    expect({
      sinalizadores: await prisma.sinalizadorSaude.count(),
      vinculos: await prisma.vinculoFonte.count(),
      pessoas: await prisma.pessoaMestra.count(),
    }).toEqual(antes);
    expect(logs.some((l) => l.includes(`carga ${c.id} (ESUS_PEC) falhou: FalhaDefinitiva`))).toBe(
      true,
    );

    const alertas = (await buscarAlertasCarga(prisma)).filter((a) => a.fonte === 'ESUS_PEC');
    expect(alertas).toEqual([expect.objectContaining({ id: c.id, erro: c.erro })]);

    await adminPec.query('ALTER TABLE tb_cidadao RENAME COLUMN dt_atualizacao TO dt_atualizado');
    const ok = await rodar();
    expect(ok.status).toBe('OK');
    expect((await buscarAlertasCarga(prisma)).filter((a) => a.fonte === 'ESUS_PEC')).toEqual([]);
  });

  it('nenhum CPF, CNS ou CID aparece em log, LogCarga, erros, staging, vínculo ou job', async () => {
    const cargas = await cargasEsus();
    const json = (v: unknown) =>
      JSON.stringify(v, (_, x) => (typeof x === 'bigint' ? String(x) : (x as unknown)));
    const textos: string[] = [...logs, JSON.stringify(jobs)];
    textos.push(json(await prisma.logCarga.findMany({ where: { id: { in: cargas } } })));
    textos.push(json(await prisma.erroCarga.findMany({ where: { cargaId: { in: cargas } } })));
    textos.push(
      JSON.stringify(
        await prisma.$queryRawUnsafe(
          'SELECT * FROM stg_esus.cidadao WHERE carga_id = ANY($1::int[])',
          cargas,
        ),
        (_, v) => (typeof v === 'bigint' ? String(v) : v),
      ),
    );
    textos.push(
      JSON.stringify(
        await prisma.vinculoFonte.findMany({ where: { cargaId: { in: cargas } } }),
        (_, v) => (typeof v === 'bigint' ? String(v) : v),
      ),
    );
    textos.push(json(await prisma.sinalizadorSaude.findMany()));
    const tudo = textos.join('\n');
    expect(tudo).not.toContain(ISCA_CID);
    // Janelas de 11 e 15 dígitos (com ou sem pontuação removida) contra os documentos do PEC.
    const docs = new Set([...dados.cpfs, ...dados.cnss]);
    const digitos = tudo.replace(/\D/g, ' ');
    const achados = [...digitos.matchAll(/\d{11,}/g)].flatMap((m) => {
      const s = m[0];
      const r: string[] = [];
      for (const n of [11, 15]) for (let i = 0; i + n <= s.length; i++) r.push(s.slice(i, i + n));
      return r.filter((x) => docs.has(x));
    });
    expect(achados).toEqual([]);
  });
});
