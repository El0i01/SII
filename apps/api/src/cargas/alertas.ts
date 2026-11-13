import type { PrismaClient } from '../generated/prisma/client';

/**
 * Alertas de carga para a CTI (P09): por fonte, a falha mais recente que ainda não foi seguida de
 * uma carga OK. O alerta some sozinho quando a carga da fonte volta a dar certo. Só id, fonte, data
 * e a mensagem fixa da carga (nenhum dado de pessoa).
 */
export interface AlertaCarga {
  id: number;
  fonte: string;
  inicioEm: Date;
  erro: string | null;
}

/** Falhas mais antigas que isto não viram alerta (já foram vistas ou a fonte foi desligada). */
export const DIAS_ALERTA_CARGA = 30;

export async function buscarAlertasCarga(
  prisma: Pick<PrismaClient, 'logCarga'>,
  agora = new Date(),
): Promise<AlertaCarga[]> {
  const falhas = await prisma.logCarga.findMany({
    where: {
      status: 'FALHOU',
      inicioEm: { gte: new Date(agora.getTime() - DIAS_ALERTA_CARGA * 86_400_000) },
    },
    orderBy: { id: 'desc' },
    select: { id: true, fonte: true, inicioEm: true, erro: true },
  });
  const alertas: AlertaCarga[] = [];
  const vistas = new Set<string>();
  for (const f of falhas) {
    if (vistas.has(f.fonte)) continue;
    vistas.add(f.fonte);
    const resolvida = await prisma.logCarga.count({
      where: { fonte: f.fonte, status: 'OK', id: { gt: f.id } },
    });
    if (resolvida === 0) alertas.push(f);
  }
  return alertas;
}
