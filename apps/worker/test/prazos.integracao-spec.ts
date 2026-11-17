import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { hojeEmPortoVelho, prazoHoje, textoAviso } from '@sii/shared';
import { semearPrototipo } from '../../api/prisma/seed/prototipo/persistir';
import { semearUsuarios } from '../../api/prisma/seed/usuarios';
import { feriadosDoAno } from '../../api/src/casos/criar-caso';
import { chaveDeHex } from '../../api/src/cripto/cifra';
import { criarPrisma, type PrismaClient } from '../src/banco';
import { lerEnv } from '../src/config';
import { executarPrazos } from '../src/casos/prazos';

/** Job de prazos (P11) contra o seed: níveis = prazoHoje; rodar de novo não repete aviso. */
const base = lerEnv();
const url = process.env.DATABASE_URL_TESTE ?? '';
if (!url) throw new Error('defina DATABASE_URL_TESTE no .env da raiz');
const HOJE = '2026-11-20';

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
  // Zera os níveis do seed: o job recalcula tudo e avisa cada subida.
  await prisma.caso.updateMany({ data: { nivel: 0 } });
}, 180_000);

afterAll(async () => {
  await prisma?.$disconnect();
});

describe('job de prazos (P11)', () => {
  it('grava o nível de cada caso aberto igual a prazoHoje e avisa as subidas', async () => {
    const r = await executarPrazos(prisma, { hoje: HOJE });
    expect(r.avaliados).toBeGreaterThan(0);
    expect(r.subiram).toBeGreaterThan(0);
    expect(r.avisos).toBe(r.subiram);

    const feriados = (await feriadosDoAno(prisma, 2026)).get('MUNICIPAL') ?? [];
    const casos = await prisma.caso.findMany({
      where: { tipo: { in: ['INFREQUENCIA', 'BUSCA_ATIVA_ESCOLAR'] }, encerradoEm: null },
      select: { codigo: true, tipo: true, status: true, nivel: true, alertaEm: true, avisos: true },
    });
    for (const c of casos) {
      const p = prazoHoje(
        {
          tipo: c.tipo as 'INFREQUENCIA',
          status: c.status,
          alertaEm: hojeEmPortoVelho(c.alertaEm),
        },
        HOJE,
        feriados,
      );
      expect(c.nivel).toBe(p?.nivel ?? 0);
      if (c.nivel === 3) expect(c.avisos.map((a) => a.destinoTipo)).toContain('COMITE');
      // Aviso só com o código do caso e texto fixo (sem dado pessoal).
      for (const a of c.avisos) expect(a.texto).toBe(textoAviso(a.tipo as 'NIVEL_1', c.codigo));
    }
    expect(r.nivel3).toBe(casos.filter((c) => c.nivel === 3).length);
  });

  it('rodar duas vezes no mesmo dia não muda nada nem repete aviso', async () => {
    const avisos = await prisma.aviso.count();
    const r = await executarPrazos(prisma, { hoje: HOJE });
    expect(r.subiram).toBe(0);
    expect(r.desceram).toBe(0);
    expect(await prisma.aviso.count()).toBe(avisos);
  });
});
