/**
 * pnpm --filter @sii/worker indicadores:rodar [AAAA-MM-DD]
 * Calcula os indicadores do controle externo agora (P16). A data é a referência (padrão: ontem):
 * grava o mês dela e, para o Bolsa Família, a vigência. LogCarga(INDICADORES) em /cargas.
 */
import { ehDataISO } from '@sii/shared';
import { clienteMinio, configMinio } from '../../api/src/cargas/armazenamento';
import { criarPrisma } from '../src/banco';
import { executarCarga } from '../src/cargas/pipeline';
import { lerEnv } from '../src/config';
import { criarProcessadorIndicadores } from '../src/indicadores/snapshots';

async function main() {
  const hoje = process.argv[2];
  if (hoje !== undefined && !ehDataISO(hoje)) {
    console.error('Data inválida: use AAAA-MM-DD.');
    process.exit(2);
  }
  const env = lerEnv();
  const prisma = criarPrisma(env.DATABASE_URL);
  const minio = configMinio(env);
  const carga = await prisma.logCarga.create({
    data: { fonte: 'INDICADORES', status: 'AGUARDANDO' },
  });
  await executarCarga(
    {
      prisma,
      minio: clienteMinio(minio),
      bucket: minio.bucket,
      logger: {
        log: (m) => process.stdout.write(`${m}\n`),
        warn: console.warn,
        error: console.error,
      },
      processadores: {},
      consultas: { INDICADORES: criarProcessadorIndicadores(hoje ? { referencia: hoje } : {}) },
    },
    carga.id,
    true,
  );
  const fim = await prisma.logCarga.findUniqueOrThrow({ where: { id: carga.id } });
  process.stdout.write(
    `Execução ${fim.id}: ${fim.status} ${JSON.stringify(fim.resumo ?? fim.erro ?? '')}\n`,
  );
  await prisma.$disconnect();
}

void main();
