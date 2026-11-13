/**
 * pnpm --filter @sii/worker esus:dry-run
 * Confere a estrutura do PEC e lista as contagens por tabela, sem gravar nada (P09).
 */
import { criarPrisma } from '../src/banco';
import { lerEnv } from '../src/config';
import { executarDryRun, formatarDryRun } from '../src/esus/dry-run';
import { carregarContratoPec, conectarPec, configPec } from '../src/esus/pec';
import { decidirModo } from '../src/esus/processador';

async function main() {
  const env = lerEnv();
  const cfg = configPec(env);
  if (!cfg) {
    console.error(
      'e-SUS não configurado: defina ESUS_PEC_HOST, ESUS_PEC_USUARIO e ESUS_PEC_SENHA no .env.',
    );
    process.exit(2);
  }
  const prisma = criarPrisma(env.DATABASE_URL);
  const pec = conectarPec(cfg);
  try {
    // Só leitura no SII também: a marca da última carga decide completa × incremental.
    const { modo, desde } = await decidirModo(prisma);
    const r = await executarDryRun(pec, cfg.schema, carregarContratoPec(env.CONTRATO_ESUS), desde);
    process.stdout.write(`${formatarDryRun(r, modo, desde)}\n`);
    process.exitCode = r.relatorio ? 0 : 1;
  } catch (e) {
    // Sem a mensagem do driver (pode trazer host/usuário): só o código do PostgreSQL.
    const codigo = (e as { code?: string }).code ?? (e as Error).name;
    console.error(
      `Não foi possível ler o PEC (código ${codigo}). Confira host, porta, usuário e senha no .env.`,
    );
    process.exitCode = 1;
  } finally {
    await pec.end();
    await prisma.$disconnect();
  }
}

void main();
