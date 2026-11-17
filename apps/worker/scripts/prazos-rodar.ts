/**
 * pnpm --filter @sii/worker prazos:rodar [AAAA-MM-DD]
 * Roda o job de prazos e escalonamento agora (P11). Com data, calcula os prazos como se hoje fosse
 * ela. Grava o LogCarga(PRAZOS), visível em /cargas. Só imprime contagens.
 */
import { ehDataISO } from '@sii/shared';
import { clienteMinio, configMinio } from '../../api/src/cargas/armazenamento';
import { criarPrisma } from '../src/banco';
import { executarCarga } from '../src/cargas/pipeline';
import { lerEnv } from '../src/config';
import { criarProcessadorPrazos } from '../src/casos/prazos';

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
    data: { fonte: 'PRAZOS', status: 'AGUARDANDO' },
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
      consultas: { PRAZOS: criarProcessadorPrazos(hoje ? { hoje } : {}) },
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
