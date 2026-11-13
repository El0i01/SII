import { type ContratoPec, verificarEstrutura } from '@sii/shared';
import type { Pool } from 'pg';
import { contarTabelas, emLeitura, lerEstrutura, type RelatorioLeitura } from './pec';

/**
 * Dry-run do conector do e-SUS (P09): confere a estrutura e conta o que a carga leria. Não grava
 * nada em lugar nenhum (nem LogCarga) e não lê dado pessoal: só `count(*)`.
 */
export interface ResultadoDryRun {
  faltando: string[];
  relatorio: RelatorioLeitura | null;
}

export async function executarDryRun(
  pec: Pool,
  schema: string,
  contrato: ContratoPec,
  desde: string | null,
): Promise<ResultadoDryRun> {
  return emLeitura(pec, async (c) => {
    const { faltando } = verificarEstrutura(contrato, await lerEstrutura(c, schema));
    if (faltando.length > 0) return { faltando, relatorio: null };
    return { faltando, relatorio: await contarTabelas(c, contrato, schema, desde) };
  });
}

/** Texto do relatório para o terminal. */
export function formatarDryRun(r: ResultadoDryRun, modo: string, desde: string | null): string {
  if (!r.relatorio)
    return [
      'Estrutura do PEC NÃO confere com config/esus/contrato.json. Falta:',
      ...r.faltando.map((f) => `  - ${f}`),
      'A carga falharia sem gravar nada.',
    ].join('\n');
  const largura = Math.max(...Object.keys(r.relatorio.tabelas).map((t) => t.length));
  return [
    `Estrutura do PEC confere. Próxima carga: ${modo}${desde ? ` (desde ${desde})` : ''}.`,
    '',
    `${'Tabela'.padEnd(largura)}  Linhas`,
    ...Object.entries(r.relatorio.tabelas).map(
      ([t, n]) => `${t.padEnd(largura)}  ${n.toLocaleString('pt-BR')}`,
    ),
    '',
    `Cidadãos ativos que a carga leria: ${r.relatorio.cidadaosALer.toLocaleString('pt-BR')}`,
    'Dry-run: nada foi gravado.',
  ].join('\n');
}
