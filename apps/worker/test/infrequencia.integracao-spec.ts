import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { semearPrototipo } from '../../api/prisma/seed/prototipo/persistir';
import { semearUsuarios } from '../../api/prisma/seed/usuarios';
import { chaveDeHex } from '../../api/src/cripto/cifra';
import { criarPrisma, type PrismaClient } from '../src/banco';
import { lerEnv } from '../src/config';
import { executarInfrequencia } from '../src/educacao/infrequencia';

/**
 * Critérios de aceite do P10 (job de infrequência), contra o banco de teste com o seed:
 * com o seed, o job cria exatamente as notificações esperadas; rodar duas vezes não duplica;
 * feriado do calendário não conta como falta.
 */
const base = lerEnv();
const url = process.env.DATABASE_URL_TESTE ?? '';
if (!url) throw new Error('defina DATABASE_URL_TESTE no .env da raiz');

/** Data-base do seed (gerador do protótipo): 08/11/2026 é domingo; a referência é 06/11. */
const HOJE_SEED = '2026-11-08';
const REFERENCIA_SEED = '2026-11-06';
const INEP_TESTE = '99000010';

let prisma: PrismaClient;

beforeAll(async () => {
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: path.resolve(__dirname, '../../api'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
  prisma = criarPrisma(url);
  await semearUsuarios(prisma, process.env.SEED_SENHA ?? 'senha-de-teste');
  await semearPrototipo(prisma, {
    cifra: chaveDeHex(base.CHAVE_CIFRA, 'CHAVE_CIFRA'),
    hmac: chaveDeHex(base.CHAVE_HMAC, 'CHAVE_HMAC'),
  });
}, 180_000);

afterAll(async () => {
  // A escola fictícia sai (escola não é dado do seed). Os casos ficam até o próximo seed: a trilha
  // é append-only.
  if (prisma) await removerEscolaDeTeste();
  await prisma?.$disconnect();
});

async function removerEscolaDeTeste() {
  const escola = await prisma.escola.findUnique({ where: { inep: INEP_TESTE } });
  if (!escola) return;
  await prisma.matricula.deleteMany({ where: { escolaId: escola.id } });
  await prisma.calendarioEscolar.deleteMany({ where: { escolaId: escola.id } });
  await prisma.escola.delete({ where: { id: escola.id } });
}

/**
 * Esperado, calculado só em SQL e independente do código do job: pessoas com matrícula ativa cujos
 * 5 últimos dias letivos da escola (até a referência) estão todos lançados como FALTA, e que não
 * têm caso de infrequência aberto.
 */
async function esperadoPorSql(referencia: string): Promise<number> {
  const [r] = await prisma.$queryRaw<{ n: bigint }[]>`
    WITH ultimos AS (
      SELECT c.escola_id, c.dia,
             row_number() OVER (PARTITION BY c.escola_id ORDER BY c.dia DESC) AS ordem
      FROM educacao.calendario_escolar c
      WHERE c.dia <= ${referencia}::date
    ),
    cinco AS (
      SELECT m.pessoa_id
      FROM educacao.matricula m
      JOIN ultimos u ON u.escola_id = m.escola_id AND u.ordem <= 5
      JOIN educacao.frequencia f ON f.matricula_id = m.id AND f.dia = u.dia AND f.situacao = 'FALTA'
      WHERE m.situacao = 'ATIVA'
      GROUP BY m.id, m.pessoa_id
      HAVING count(*) = 5
    )
    SELECT count(DISTINCT pessoa_id) AS n FROM cinco
    WHERE NOT EXISTS (
      SELECT 1 FROM casos.caso k
      WHERE k.pessoa_id = cinco.pessoa_id AND k.tipo = 'INFREQUENCIA' AND k.encerrado_em IS NULL
    )`;
  return Number(r?.n ?? 0);
}

describe('job diário de infrequência (P10)', () => {
  it('com o seed, cria exatamente as notificações esperadas (inclui reabertura de casos encerrados)', async () => {
    const esperado = await esperadoPorSql(REFERENCIA_SEED);
    // O seed tem casos de infrequência encerrados com o aluno ainda faltando: reabrem.
    expect(esperado).toBeGreaterThan(0);
    const antes = await prisma.notificacao.count();

    const r = await executarInfrequencia(prisma, { hoje: HOJE_SEED });
    expect(r.criados).toBe(esperado);
    expect(r.semCras).toBe(0);
    expect(await prisma.notificacao.count()).toBe(antes + esperado);

    const novas = await prisma.notificacao.findMany({
      where: { criadaEm: { gte: new Date(Date.now() - 600_000) } },
      select: { codigo: true, motivo: true, destinoCrasCodigo: true, status: true, caso: true },
    });
    expect(novas).toHaveLength(esperado);
    for (const n of novas) {
      expect(n.codigo).toMatch(/^NT-2026-\d{4}$/);
      expect(n.caso.codigo).toBe(n.codigo.replace('NT-', 'IF-'));
      expect(n.motivo).toMatch(/^\d+ dias letivos seguidos sem frequência$/);
      expect(n.status).toBe('NOVA');
      expect(n.destinoCrasCodigo).toBeTruthy();
    }
    // Um caso aberto por aluno, e a trilha encadeada confere.
    const [dup] = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM (
        SELECT pessoa_id FROM casos.caso
        WHERE tipo = 'INFREQUENCIA' AND encerrado_em IS NULL
        GROUP BY pessoa_id HAVING count(*) > 1) x`;
    expect(Number(dup?.n)).toBe(0);
    const caso = novas[0]?.caso.id as number;
    const [trilha] = await prisma.$queryRaw<{ integra: boolean; eventos: number }[]>`
      SELECT integra, eventos FROM casos.verificar_trilha(${caso})`;
    expect(trilha).toEqual({ integra: true, eventos: 2 });
  });

  it('rodar duas vezes não duplica', async () => {
    const antes = await prisma.caso.count();
    const r = await executarInfrequencia(prisma, { hoje: HOJE_SEED });
    expect(r.criados).toBe(0);
    expect(r.atualizados).toBe(0);
    expect(await prisma.caso.count()).toBe(antes);
  });

  describe('escola com feriado no meio das faltas', () => {
    // 04/11 é feriado: não está no calendário desta escola de teste.
    const LETIVOS = [
      '2026-11-02',
      '2026-11-03',
      '2026-11-05',
      '2026-11-06',
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
    ];
    let matriculaId: number;
    let pessoaId: number;

    const lancar = (dia: string, situacao: 'FALTA' | 'PRESENTE' = 'FALTA') =>
      prisma.frequencia.upsert({
        where: { matriculaId_dia: { matriculaId, dia: new Date(`${dia}T00:00:00Z`) } },
        create: { matriculaId, dia: new Date(`${dia}T00:00:00Z`), situacao },
        update: { situacao },
      });
    const casosAbertos = () =>
      prisma.caso.findMany({
        where: { pessoaId, tipo: 'INFREQUENCIA', encerradoEm: null },
        include: { notificacoes: true },
      });

    beforeAll(async () => {
      const escola = await prisma.escola.upsert({
        where: { inep: INEP_TESTE },
        create: { inep: INEP_TESTE, nome: 'Escola de teste do P10 (fictícia)', rede: 'MUNICIPAL' },
        update: {},
      });
      await prisma.calendarioEscolar.createMany({
        data: LETIVOS.map((d) => ({ escolaId: escola.id, dia: new Date(`${d}T00:00:00Z`) })),
        skipDuplicates: true,
      });
      // Uma pessoa fictícia do seed sem matrícula nenhuma.
      const pessoa = await prisma.pessoaMestra.findFirstOrThrow({
        where: { matriculas: { none: {} }, casos: { none: {} } },
        select: { id: true },
      });
      pessoaId = pessoa.id;
      const m = await prisma.matricula.create({
        data: { pessoaId, escolaId: escola.id, ano: 2026, inicioEm: new Date('2026-02-09') },
      });
      matriculaId = m.id;
      await lancar('2026-11-02', 'PRESENTE');
      for (const d of ['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06']) await lancar(d);
    });

    it('4 letivos de falta + falta lançada no feriado: não notifica', async () => {
      await lancar('2026-11-09');
      // Referência 09/11: faltas em 03, 05, 06, 09 = 4 dias letivos (04/11 é ignorado).
      await executarInfrequencia(prisma, { hoje: '2026-11-10' });
      expect(await casosAbertos()).toHaveLength(0);
    });

    it('no 5º dia letivo de falta, notifica', async () => {
      await lancar('2026-11-10');
      const r = await executarInfrequencia(prisma, { hoje: '2026-11-11' });
      expect(r.criados).toBe(1);
      const [caso] = await casosAbertos();
      expect(caso?.notificacoes[0]?.motivo).toBe('5 dias letivos seguidos sem frequência');
    });

    it('nova falta com caso aberto só atualiza o motivo', async () => {
      await lancar('2026-11-11');
      const r = await executarInfrequencia(prisma, { hoje: '2026-11-12' });
      expect(r.criados).toBe(0);
      expect(r.atualizados).toBe(1);
      const abertos = await casosAbertos();
      expect(abertos).toHaveLength(1);
      expect(abertos[0]?.notificacoes[0]?.motivo).toBe('6 dias letivos seguidos sem frequência');
    });

    it('caso encerrado com o aluno ainda faltando: abre outro (decisão de 17/11/2026)', async () => {
      const [caso] = await casosAbertos();
      await prisma.caso.update({
        where: { id: caso?.id as number },
        data: { encerradoEm: new Date(), status: 'PARECER_EMITIDO' },
      });
      const r = await executarInfrequencia(prisma, { hoje: '2026-11-12' });
      expect(r.criados).toBe(1);
      const [novo] = await casosAbertos();
      expect(novo?.id).not.toBe(caso?.id);
    });

    it('referência forçada reprocessa uma data passada', async () => {
      const r = await executarInfrequencia(prisma, {
        hoje: '2026-11-30',
        referencia: '2026-11-11',
      });
      expect(r.criados).toBe(0);
    });
  });
});
