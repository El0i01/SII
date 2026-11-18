/**
 * Preparo do E2E do web (P11): banco de TESTE migrado e semeado, e um aluno fictício da escola de
 * teste escolhido para o fluxo falta → notificação → parecer → aviso. Escreve o JSON no caminho do
 * 1º argumento. Recusa rodar sem DATABASE_URL_TESTE (nunca no banco de desenvolvimento).
 *   pnpm --filter @sii/api exec tsx test/e2e-preparar.ts <saida.json>
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { hojeEmPortoVelho } from '@sii/shared';
import Redis from 'ioredis';
import { aplicarGeoportal, importarCamadas } from '../scripts/geo/carregar';
import { executarIndicadores } from '../../worker/src/indicadores/snapshots';
import { semearPrototipo } from '../prisma/seed/prototipo/persistir';
import { semearUsuarios } from '../prisma/seed/usuarios';
import { chaveDeHex } from '../src/cripto/cifra';
import { aplicarMigrations, clienteDono, usarBancoDeTeste } from './apoio-integracao';

const CUSTODIO = '11005165';

/**
 * Geometria do território (P15): o mapa precisa de quadras e pontos. Usa o geoportal da máquina
 * (GEOPORTAL_DIR) e limpa o cache do mapa no Redis do teste (os ids mudam a cada seed).
 */
async function carregarGeoportal(url: string, dono: ReturnType<typeof clienteDono>) {
  const dir =
    process.env.GEOPORTAL_DIR ??
    path.join(os.homedir(), 'geoportal_itapua-main(1)/geoportal_itapua-main');
  if (!fs.existsSync(dir)) {
    process.stderr.write(`Geoportal não encontrado em ${dir}: o mapa do E2E fica sem geometria.\n`);
    return;
  }
  importarCamadas(dir, url);
  await aplicarGeoportal(dono);
  if (process.env.REDIS_URL) {
    const redis = new Redis(process.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
    try {
      await redis.connect();
      const chaves = await redis.keys('geo:*');
      if (chaves.length) await redis.del(...chaves);
    } finally {
      redis.disconnect();
    }
  }
}

async function principal() {
  const saida = process.argv[2];
  if (!saida) throw new Error('informe o arquivo de saída');
  const { url, senhaSeed } = usarBancoDeTeste();
  aplicarMigrations(url);
  const dono = clienteDono(url);
  await semearUsuarios(dono, senhaSeed);
  await semearPrototipo(dono, {
    cifra: chaveDeHex(process.env.CHAVE_CIFRA ?? '', 'CHAVE_CIFRA'),
    hmac: chaveDeHex(process.env.CHAVE_HMAC ?? '', 'CHAVE_HMAC'),
  });

  await carregarGeoportal(url, dono);
  // Indicadores do controle externo (P16): o job mensal, já com o geoportal (ponto preciso).
  await executarIndicadores(dono as never, { referencia: hojeEmPortoVelho() });

  const hoje = hojeEmPortoVelho();
  const escola = await dono.escola.findUniqueOrThrow({ where: { inep: CUSTODIO } });
  // Os 5 últimos dias letivos antes de hoje (o job conta até o dia letivo anterior a hoje).
  const dias = (
    await dono.calendarioEscolar.findMany({
      where: { escolaId: escola.id, dia: { lt: new Date(`${hoje}T00:00:00Z`) } },
      orderBy: { dia: 'desc' },
      take: 5,
    })
  )
    .map((c) => c.dia.toISOString().slice(0, 10))
    .reverse();
  if (dias.length < 5) throw new Error('calendário da escola de teste sem 5 dias letivos');

  const m = await dono.matricula.findFirstOrThrow({
    where: {
      escolaId: escola.id,
      situacao: 'ATIVA',
      turmaId: { not: null },
      pessoa: { escolaInep: CUSTODIO, casos: { none: { tipo: 'INFREQUENCIA' } } },
    },
    orderBy: { id: 'asc' },
    select: { id: true, turma: true, pessoa: { select: { nome: true } } },
  });
  // Nada lançado nesses dias para o aluno: o teste lança as 5 faltas pela tela.
  await dono.frequencia.deleteMany({
    where: { matriculaId: m.id, dia: { in: dias.map((d) => new Date(`${d}T00:00:00Z`)) } },
  });
  // O dia letivo anterior ao 1º fica como presença, para a sequência ser exatamente de 5.
  const antes = await dono.calendarioEscolar.findFirst({
    where: { escolaId: escola.id, dia: { lt: new Date(`${dias[0]}T00:00:00Z`) } },
    orderBy: { dia: 'desc' },
  });
  if (antes)
    await dono.frequencia.upsert({
      where: { matriculaId_dia: { matriculaId: m.id, dia: antes.dia } },
      create: { matriculaId: m.id, dia: antes.dia, situacao: 'PRESENTE' },
      update: { situacao: 'PRESENTE' },
    });

  fs.mkdirSync(path.dirname(saida), { recursive: true });
  fs.writeFileSync(
    saida,
    JSON.stringify({
      inep: CUSTODIO,
      turma: m.turma?.nome,
      matriculaId: m.id,
      aluno: m.pessoa.nome,
      dias,
      hoje,
    }),
  );
  await dono.$disconnect();
}

principal().catch((e: unknown) => {
  process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
