/**
 * pnpm --filter @sii/worker busca-ativa:rodar [AAAA-MM-DD]
 * Roda o job de busca ativa agora (P13). Com data, calcula idades e quarentenas como se hoje fosse
 * ela. Grava o LogCarga(BUSCA_ATIVA), visível em /cargas. Só imprime contagens.
 */
import { ehDataISO } from '@sii/shared';
import { clienteMinio, configMinio } from '../../api/src/cargas/armazenamento';
import { criarPrisma } from '../src/banco';
import { executarCarga } from '../src/cargas/pipeline';
import { lerEnv } from '../src/config';
import { criarProcessadorBuscaAtiva } from '../src/educacao/busca-ativa';

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
    data: { fonte: 'BUSCA_ATIVA', status: 'AGUARDANDO' },
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
      consultas: { BUSCA_ATIVA: criarProcessadorBuscaAtiva(hoje ? { hoje } : {}) },
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
