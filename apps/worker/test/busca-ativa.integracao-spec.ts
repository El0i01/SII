import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { adicionarDias, idadeEm, ORIGENS_ALERTA, textoAviso } from '@sii/shared';
import { semearPrototipo } from '../../api/prisma/seed/prototipo/persistir';
import { semearUsuarios } from '../../api/prisma/seed/usuarios';
import { chaveDeHex } from '../../api/src/cripto/cifra';
import { criarPrisma, type PrismaClient } from '../src/banco';
import { lerEnv } from '../src/config';
import { executarBuscaAtiva } from '../src/educacao/busca-ativa';

/** Job de busca ativa (P13) contra o seed: abre quem está fora da escola, fecha quem matriculou. */
const base = lerEnv();
const url = process.env.DATABASE_URL_TESTE ?? '';
if (!url) throw new Error('defina DATABASE_URL_TESTE no .env da raiz');
const HOJE = '2026-11-20';
const iso = (d: Date) => d.toISOString().slice(0, 10);

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
  await prisma?.$disconnect();
});

/** Conferência independente: 4 a 17 anos, com domicílio, sem matrícula ativa e sem caso aberto. */
async function esperadas(hoje: string): Promise<number[]> {
  const pessoas = await prisma.pessoaMestra.findMany({
    where: {
      dataNascimento: { not: null },
      domicilioId: { not: null },
      matriculas: { none: { situacao: 'ATIVA' } },
      casos: { none: { tipo: 'BUSCA_ATIVA_ESCOLAR', encerradoEm: null } },
    },
    select: { id: true, dataNascimento: true },
  });
  return pessoas
    .filter((p) => {
      const idade = idadeEm(iso(p.dataNascimento as Date), hoje);
      return idade >= 4 && idade <= 17;
    })
    .map((p) => p.id)
    .sort((a, b) => a - b);
}

describe('job de busca ativa (P13)', () => {
  let novos: { id: number; pessoaId: number; codigo: string }[] = [];

  it('abre IDENTIFICADO para quem está fora da escola, com origem e aviso à SEMED', async () => {
    const antes = await esperadas(HOJE);
    expect(antes.length).toBeGreaterThan(0);
    const r = await executarBuscaAtiva(prisma, { hoje: HOJE });
    expect(r.abertos).toBe(antes.length);
    expect(r.matriculados).toBe(0);

    novos = await prisma.caso.findMany({
      where: {
        tipo: 'BUSCA_ATIVA_ESCOLAR',
        status: 'IDENTIFICADO',
        codigo: { startsWith: 'BA-2026-' },
        pessoaId: { in: antes },
      },
      select: { id: true, pessoaId: true, codigo: true },
      orderBy: { pessoaId: 'asc' },
    });
    expect(novos.map((c) => c.pessoaId)).toEqual(antes);

    const um = await prisma.caso.findUniqueOrThrow({
      where: { id: (novos[0] as { id: number }).id },
      select: {
        codigo: true,
        origem: true,
        secretariaResponsavel: true,
        eventos: { select: { tipo: true, dados: true } },
        avisos: { select: { destinoTipo: true, destinoValor: true, texto: true } },
      },
    });
    expect(ORIGENS_ALERTA).toContain(um.origem);
    expect(um.secretariaResponsavel).toBe('SEMED');
    expect(um.eventos).toEqual([
      { tipo: 'ALERTA_GERADO', dados: { origem: um.origem, faixaEtaria: expect.any(String) } },
    ]);
    expect(um.avisos).toEqual([
      {
        destinoTipo: 'SECRETARIA',
        destinoValor: 'SEMED',
        texto: textoAviso('IDENTIFICADO', um.codigo),
      },
    ]);
    expect(await esperadas(HOJE)).toEqual([]);
  });

  it('rodar de novo não duplica', async () => {
    const r = await executarBuscaAtiva(prisma, { hoje: HOJE });
    expect(r.abertos).toBe(0);
  });

  it('matrícula ativa fecha o caso como MATRICULADO, com a trilha íntegra', async () => {
    const alvo = novos[0] as { id: number; pessoaId: number };
    const escola = await prisma.escola.findUniqueOrThrow({ where: { inep: '11005165' } });
    await prisma.matricula.create({
      data: {
        pessoaId: alvo.pessoaId,
        escolaId: escola.id,
        ano: 2026,
        inicioEm: new Date(`${HOJE}T00:00:00Z`),
      },
    });
    const r = await executarBuscaAtiva(prisma, { hoje: HOJE });
    expect(r.matriculados).toBe(1);
    expect(r.abertos).toBe(0);
    const caso = await prisma.caso.findUniqueOrThrow({
      where: { id: alvo.id },
      select: {
        status: true,
        encerradoEm: true,
        eventos: { select: { tipo: true, dados: true }, orderBy: { seq: 'asc' } },
      },
    });
    expect(caso.status).toBe('MATRICULADO');
    expect(caso.encerradoEm).not.toBeNull();
    expect(caso.eventos.at(-1)).toEqual({
      tipo: 'DESFECHO',
      dados: { resultado: 'MATRICULADO', inep: '11005165', origem: 'CARGA_ESCOLAR' },
    });
    const [trilha] = await prisma.$queryRaw<{ integra: boolean }[]>`
      SELECT integra FROM casos.verificar_trilha(${alvo.id}::int)`;
    expect(trilha?.integra).toBe(true);
  });

  it('depois do Conselho Tutelar, só reabre passados 180 dias', async () => {
    const alvo = novos[1] as { id: number; pessoaId: number };
    const ct = new Date(`${HOJE}T15:00:00Z`);
    await prisma.eventoCaso.create({
      data: { casoId: alvo.id, tipo: 'ENCAMINHADO_CONSELHO_TUTELAR', ocorridoEm: ct, dados: {} },
    });
    await prisma.caso.update({
      where: { id: alvo.id },
      data: { status: 'NAO_LOCALIZADO', encerradoEm: ct },
    });
    expect((await executarBuscaAtiva(prisma, { hoje: HOJE })).abertos).toBe(0);
    // Em 179 dias abre quem entrou na faixa, mas não a criança que foi ao Conselho.
    const em179 = (await esperadas(adicionarDias(HOJE, 179))).filter((p) => p !== alvo.pessoaId);
    expect((await executarBuscaAtiva(prisma, { hoje: adicionarDias(HOJE, 179) })).abertos).toBe(
      em179.length,
    );
    const depois = adicionarDias(HOJE, 180);
    const pessoa = await prisma.pessoaMestra.findUniqueOrThrow({
      where: { id: alvo.pessoaId },
      select: { dataNascimento: true },
    });
    const aindaNaFaixa = idadeEm(iso(pessoa.dataNascimento as Date), depois) <= 17;
    await executarBuscaAtiva(prisma, { hoje: depois });
    const aberto = await prisma.caso.count({
      where: { pessoaId: alvo.pessoaId, tipo: 'BUSCA_ATIVA_ESCOLAR', encerradoEm: null },
    });
    expect(aberto).toBe(aindaNaFaixa ? 1 : 0);
  });
});
