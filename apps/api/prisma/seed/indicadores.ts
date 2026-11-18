import type { Prisma } from '../../src/generated/prisma/client';

type Tx = Prisma.TransactionClient;

/**
 * Metas e linhas de base dos objetivos OE1 a OE6 como no protótipo (Plano Estratégico), versão 1.
 * A CTI e o Comitê ajustam pela API (PUT /indicadores/metas/:indicador), que cria uma versão nova.
 */
export const METAS_PROTOTIPO: {
  indicador: string;
  linhaBase: number | null;
  dataBase: string | null;
  meta: number;
  metaTexto: string | null;
  prazo: string | null;
}[] = [
  {
    indicador: 'ENCAMINHADOS_30D',
    linhaBase: null,
    dataBase: null,
    meta: 100,
    metaTexto: null,
    prazo: null,
  },
  {
    indicador: 'VACINACAO_0_6',
    linhaBase: 71.4,
    dataBase: '2025-11-01',
    meta: 85,
    metaTexto: null,
    prazo: '2028-12-31',
  },
  {
    indicador: 'CRECHE_0_3',
    linhaBase: 29.1,
    dataBase: '2025-11-01',
    meta: 40,
    metaTexto: null,
    prazo: '2026-12-31',
  },
  {
    indicador: 'PBF_EDUCACAO',
    linhaBase: 89,
    dataBase: '2025-12-31',
    meta: 89,
    metaTexto: 'Crescer por vigência',
    prazo: null,
  },
  {
    indicador: 'PBF_SAUDE',
    linhaBase: 72.3,
    dataBase: '2025-12-31',
    meta: 72.3,
    metaTexto: 'Crescer por vigência',
    prazo: null,
  },
  {
    indicador: 'PONTO_PRECISO',
    linhaBase: 58,
    dataBase: '2026-03-01',
    meta: 90,
    metaTexto: '90% (2028)',
    prazo: '2028-12-31',
  },
  {
    indicador: 'RELATORIOS_ENTREGUES',
    linhaBase: null,
    dataBase: null,
    meta: 1,
    metaTexto: 'Semestral',
    prazo: null,
  },
  {
    indicador: 'ACESSOS_REGISTRADOS',
    linhaBase: null,
    dataBase: null,
    meta: 100,
    metaTexto: null,
    prazo: null,
  },
];

/** Despesa liquidada fictícia de 2026 (protótipo: 3,9 mi, 2,1 mi, 1,6 mi, 0,9 mi), em 10 meses. */
const DESPESA_ANUAL: Record<string, number> = {
  ATENCAO_PRIMARIA: 3_900_000,
  CRECHE: 2_100_000,
  TRANSPORTE_ESCOLAR: 1_600_000,
  CRAS_PAIF: 900_000,
};

export async function semearIndicadores(tx: Tx): Promise<void> {
  for (const m of METAS_PROTOTIPO) {
    await tx.metaIndicador.create({
      data: {
        indicador: m.indicador,
        versao: 1,
        linhaBase: m.linhaBase,
        dataBase: m.dataBase ? new Date(`${m.dataBase}T00:00:00Z`) : null,
        meta: m.meta,
        metaTexto: m.metaTexto,
        prazo: m.prazo ? new Date(`${m.prazo}T00:00:00Z`) : null,
      },
    });
  }
  const linhas = Object.entries(DESPESA_ANUAL).flatMap(([programa, total]) =>
    Array.from({ length: 10 }, (_, i) => ({
      ano: 2026,
      mes: i + 1,
      programa,
      valorLiquidado: total / 10,
      fonte: 'CSV' as const,
    })),
  );
  await tx.despesaPrograma.createMany({ data: linhas });
}
