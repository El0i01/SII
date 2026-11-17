/**
 * pnpm --filter @sii/worker infrequencia:rodar [AAAA-MM-DD]
 * Roda o job de infrequência agora, sem esperar o agendamento (P10). Com data, conta as faltas até
 * o último dia letivo até ela (reprocessar). Grava o LogCarga(INFREQUENCIA), visível em /cargas.
 * Só imprime contagens: nenhum dado de pessoa.
 */
import { ehDataISO } from '@sii/shared';
import { clienteMinio, configMinio } from '../../api/src/cargas/armazenamento';
import { criarPrisma } from '../src/banco';
import { executarCarga } from '../src/cargas/pipeline';
import { lerEnv } from '../src/config';
import { criarProcessadorInfrequencia } from '../src/educacao/infrequencia';

async function main() {
  const referencia = process.argv[2];
  if (referencia !== undefined && !ehDataISO(referencia)) {
    console.error('Data inválida: use AAAA-MM-DD.');
    process.exit(2);
  }
  const env = lerEnv();
  const prisma = criarPrisma(env.DATABASE_URL);
  const minio = configMinio(env);
  const carga = await prisma.logCarga.create({
    data: { fonte: 'INFREQUENCIA', status: 'AGUARDANDO' },
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
      consultas: { INFREQUENCIA: criarProcessadorInfrequencia(referencia ? { referencia } : {}) },
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
