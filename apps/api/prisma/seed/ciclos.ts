import type { Prisma } from '../../src/generated/prisma/client';

type Tx = Prisma.TransactionClient;

/**
 * Dados fictícios dos painéis de ciclos de vida (P19), determinísticos (pelo id da pessoa):
 * - escolaridade do CadÚnico dos membros com 15 anos ou mais (grau de instrução e "sabe ler");
 * - duas turmas de EJA numa escola municipal, com matrículas de parte do público potencial e uma
 *   semana de frequência (nunca 5 faltas seguidas: a EJA não entra no job de infrequência);
 * - vagas de creche por escola: as matrículas nas turmas de creche mais uma folga.
 */
export async function semearCiclos(tx: Tx, ano: number, dataBase: string): Promise<void> {
  // 1. Escolaridade: distribuição parecida com a do CadÚnico de municípios pequenos de RO.
  await tx.$executeRaw`
    WITH m AS (
      SELECT mf.familia_id, mf.pessoa_id, (mf.pessoa_id * 7919) % 100 AS r
      FROM pessoas.membro_familia mf JOIN pessoas.pessoa_mestra p ON p.id = mf.pessoa_id
      WHERE p.data_nascimento <= ${new Date(`${dataBase}T00:00:00Z`)}::date - interval '15 years')
    UPDATE pessoas.membro_familia mf SET
      grau_instrucao = CASE WHEN m.r < 8 THEN 'SEM_INSTRUCAO' WHEN m.r < 38 THEN 'FUNDAMENTAL_INCOMPLETO'
                            WHEN m.r < 53 THEN 'FUNDAMENTAL_COMPLETO' WHEN m.r < 65 THEN 'MEDIO_INCOMPLETO'
                            WHEN m.r < 93 THEN 'MEDIO_COMPLETO' ELSE 'SUPERIOR' END,
      sabe_ler = CASE WHEN m.r < 5 THEN false WHEN m.r BETWEEN 8 AND 9 THEN false ELSE true END
    FROM m WHERE mf.familia_id = m.familia_id AND mf.pessoa_id = m.pessoa_id`;

  // 2. EJA: turmas na primeira escola municipal e matrícula de ~1 em 5 do público potencial.
  const escola = await tx.escola.findFirst({
    where: { rede: 'MUNICIPAL' },
    orderBy: { id: 'asc' },
  });
  if (escola) {
    const turmas = await Promise.all(
      ['EJA 1º segmento', 'EJA 2º segmento'].map((nome) =>
        tx.turma.create({ data: { escolaId: escola.id, ano, nome } }),
      ),
    );
    const alunos = await tx.$queryRaw<{ id: number; grau: string }[]>`
      SELECT DISTINCT ON (p.id) p.id, mf.grau_instrucao AS grau
      FROM pessoas.pessoa_mestra p JOIN pessoas.membro_familia mf ON mf.pessoa_id = p.id
      WHERE mf.grau_instrucao IN ('SEM_INSTRUCAO', 'FUNDAMENTAL_INCOMPLETO')
        AND p.data_nascimento <= ${new Date(`${dataBase}T00:00:00Z`)}::date - interval '18 years'
        AND p.data_nascimento > ${new Date(`${dataBase}T00:00:00Z`)}::date - interval '70 years'
        AND NOT EXISTS (SELECT 1 FROM educacao.matricula x WHERE x.pessoa_id = p.id AND x.ano = ${ano})
        AND p.id % 5 = 0
      ORDER BY p.id`;
    const dias = (
      await tx.calendarioEscolar.findMany({
        where: { escolaId: escola.id, dia: { lt: new Date(`${dataBase}T00:00:00Z`) } },
        orderBy: { dia: 'desc' },
        take: 5,
        select: { dia: true },
      })
    ).map((d) => d.dia);
    for (const a of alunos) {
      const turma = turmas[a.grau === 'SEM_INSTRUCAO' ? 0 : 1] as (typeof turmas)[number];
      const m = await tx.matricula.create({
        data: {
          pessoaId: a.id,
          escolaId: escola.id,
          turmaId: turma.id,
          ano,
          inicioEm: new Date(`${ano}-02-10T00:00:00Z`),
        },
      });
      // Uma falta a cada quatro dias, no máximo: nunca 5 seguidas.
      await tx.frequencia.createMany({
        data: dias.map((dia, i) => ({
          matriculaId: m.id,
          dia,
          situacao: (a.id + i) % 4 === 0 ? ('FALTA' as const) : ('PRESENTE' as const),
        })),
      });
    }
  }

  // 3. Vagas de creche: matrículas ativas nas turmas de creche + folga de 0 a 9 vagas.
  await tx.$executeRaw`
    INSERT INTO educacao.oferta_creche (escola_id, ano, vagas, atualizado_em)
    SELECT t.escola_id, ${ano}, count(m.id)::int + (t.escola_id * 13) % 10, now()
    FROM educacao.turma t LEFT JOIN educacao.matricula m ON m.turma_id = t.id AND m.situacao = 'ATIVA'
    WHERE t.ano = ${ano} AND (t.nome ILIKE 'berçário%' OR t.nome ILIKE 'maternal%' OR t.nome ILIKE 'creche%')
    GROUP BY t.escola_id`;
}
