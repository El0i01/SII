import {
  type DataISO,
  PRAZO_PARECER_DIAS_UTEIS,
  type Secretaria,
  somarDiasUteis,
  type TipoCaso,
} from '@sii/shared';
import type { Prisma } from '../generated/prisma/client';

/**
 * Criação de caso intersetorial, usada pelo job de infrequência (worker, P10) e pelo encaminhamento
 * manual (API, P11). Uma rotina só (ADR 0010):
 *
 * - trava global (`pg_advisory_xact_lock`) + conferência de caso aberto do mesmo tipo para a
 *   pessoa, dentro da transação: um caso aberto por pessoa e tipo;
 * - código `<prefixo>-AAAA-NNNN`; com notificação ao CRAS, a notificação leva o mesmo número
 *   (`NT-AAAA-NNNN`), como no seed;
 * - trilha: ALERTA_GERADO ou ENCAMINHADO, e NOTIFICACAO_ENVIADA. `dados` sem dado pessoal.
 *
 * Quem chama passa um cliente de transação: o do dono (job) ou o de `comoUsuario` (API, que passa
 * pela RLS).
 */

export const PREFIXO_CASO: Record<TipoCaso, string> = {
  INFREQUENCIA: 'IF',
  BUSCA_ATIVA_ESCOLAR: 'BA',
  PRIMEIRA_INFANCIA_SEM_CUIDADO: 'PN',
  INCLUSAO_SEM_ATENDIMENTO: 'IN',
  IDOSO_SEM_VISITA: 'ID',
};

const TRAVA = 'sii:casos:criar';
const dia = (s: string) => new Date(`${s}T00:00:00Z`);

export interface DestinoPessoa {
  cras: string | null;
  setor: string | null;
  localidade: string | null;
}

type Consulta = Pick<Prisma.TransactionClient, '$queryRaw'>;

/**
 * CRAS do território do domicílio: o CRAS de referência da pessoa → a área TERRITORIO_CRAS que
 * contém o ponto do domicílio → a única área TERRITORIO_CRAS cadastrada (Itapuã tem um CRAS).
 * Também devolve o setor e a quadra (ou linha rural) do caso.
 */
export async function destinosCras(
  db: Consulta,
  pessoas: number[],
): Promise<Map<number, DestinoPessoa>> {
  if (pessoas.length === 0) return new Map();
  const linhas = await db.$queryRaw<
    { id: number; cras: string | null; setor: string | null; localidade: string | null }[]
  >`
    WITH unica AS (
      SELECT min(codigo) AS codigo FROM territorio.area_referencia
      WHERE tipo = 'TERRITORIO_CRAS' HAVING count(*) = 1
    )
    SELECT p.id,
           coalesce(
             p.cras_codigo,
             (SELECT a.codigo FROM territorio.area_referencia a
               WHERE a.tipo = 'TERRITORIO_CRAS' AND d.ponto IS NOT NULL AND a.geom IS NOT NULL
                 AND ST_Contains(a.geom, d.ponto)
               ORDER BY a.codigo LIMIT 1),
             (SELECT codigo FROM unica)
           ) AS cras,
           p.setor_codigo AS setor,
           coalesce(q.codigo, d.localidade) AS localidade
    FROM pessoas.pessoa_mestra p
    LEFT JOIN territorio.domicilio d ON d.id = p.domicilio_id
    LEFT JOIN territorio.lote l ON l.id = d.lote_id
    LEFT JOIN territorio.quadra q ON q.id = l.quadra_id
    WHERE p.id = ANY(${pessoas}::int[])`;
  return new Map(
    linhas.map((l) => [l.id, { cras: l.cras, setor: l.setor, localidade: l.localidade }]),
  );
}

/**
 * Feriados do ano para os dias úteis dos prazos: os do calendário das escolas informadas ou, sem
 * escola, os da rede municipal (o feriado municipal entra pelo calendário, §3.4).
 */
export async function feriadosDoAno(
  db: Pick<Prisma.TransactionClient, 'calendarioParametros'>,
  ano: number,
  escolaIds?: number[],
): Promise<Map<number | 'MUNICIPAL', DataISO[]>> {
  const params = await db.calendarioParametros.findMany({
    where: { ano, ...(escolaIds ? { escolaId: { in: escolaIds } } : {}) },
    select: { escolaId: true, parametros: true, escola: { select: { rede: true } } },
  });
  const m = new Map<number | 'MUNICIPAL', DataISO[]>();
  const municipais = new Set<DataISO>();
  for (const p of params) {
    const f = (p.parametros as { feriados?: unknown }).feriados;
    const lista = Array.isArray(f) ? f.filter((x): x is string => typeof x === 'string') : [];
    m.set(p.escolaId, lista);
    if (p.escola.rede === 'MUNICIPAL') for (const x of lista) municipais.add(x);
  }
  m.set('MUNICIPAL', [...municipais].sort());
  return m;
}

export interface NovoCaso {
  tipo: TipoCaso;
  pessoaId: number;
  origem: string;
  secretaria: Secretaria;
  destino: DestinoPessoa;
  hoje: DataISO;
  feriados: DataISO[];
  /** Evento de abertura: ALERTA_GERADO (job) ou ENCAMINHADO (manual), com dados sem dado pessoal. */
  abertura: { tipo: 'ALERTA_GERADO' | 'ENCAMINHADO'; dados: Prisma.InputJsonValue };
  /** Notificação ao CRAS (destino Assistência). */
  notificacao?: { motivo: string; origem: string };
  /** Status inicial do caso (busca ativa começa IDENTIFICADO). Padrão: NOVA na infrequência, ENCAMINHADO nos demais. */
  statusInicial?: string;
  autorId?: number | null;
}

export type ResultadoNovoCaso =
  | { criado: true; casoId: number; codigo: string; notificacao: string | null }
  | { criado: false; codigoExistente: string };

export async function criarCaso(
  tx: Prisma.TransactionClient,
  a: NovoCaso,
): Promise<ResultadoNovoCaso> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${TRAVA}))`;
  const aberto = await tx.caso.findFirst({
    where: { pessoaId: a.pessoaId, tipo: a.tipo, encerradoEm: null },
    select: { codigo: true },
  });
  if (aberto) return { criado: false, codigoExistente: aberto.codigo };
  if (a.notificacao && !a.destino.cras)
    throw new Error('notificação sem CRAS de destino: quem chama confere antes');

  const ano = a.hoje.slice(0, 4);
  const prefixo = PREFIXO_CASO[a.tipo];
  const [ultimo] = await tx.$queryRaw<{ n: number | null }[]>`
    SELECT max(split_part(codigo, '-', 3)::int) AS n FROM (
      SELECT codigo FROM casos.caso WHERE codigo ~ ${`^${prefixo}-${ano}-[0-9]+$`}
      UNION ALL
      SELECT codigo FROM casos.notificacao
      WHERE ${a.notificacao !== undefined} AND codigo ~ ${`^NT-${ano}-[0-9]+$`}
    ) x`;
  const numero = String((ultimo?.n ?? 0) + 1).padStart(4, '0');
  const prazo = dia(somarDiasUteis(a.hoje, PRAZO_PARECER_DIAS_UTEIS, a.feriados));
  const agora = new Date();
  // Infrequência segue a situação da notificação; os demais tipos começam encaminhados.
  const status = a.statusInicial ?? (a.tipo === 'INFREQUENCIA' ? 'NOVA' : 'ENCAMINHADO');

  const caso = await tx.caso.create({
    data: {
      codigo: `${prefixo}-${ano}-${numero}`,
      tipo: a.tipo,
      pessoaId: a.pessoaId,
      setorCodigo: a.destino.setor,
      localidade: a.destino.localidade?.slice(0, 40) ?? null,
      origem: a.origem,
      secretariaResponsavel: a.secretaria,
      status,
      nivel: 0,
      alertaEm: agora,
      prazoEm: a.notificacao ? prazo : null,
    },
    select: { id: true, codigo: true },
  });
  await tx.eventoCaso.create({
    data: {
      casoId: caso.id,
      tipo: a.abertura.tipo,
      ocorridoEm: agora,
      autorId: a.autorId ?? null,
      dados: a.abertura.dados,
    },
  });
  let notificacao: string | null = null;
  if (a.notificacao) {
    const n = await tx.notificacao.create({
      data: {
        codigo: `NT-${ano}-${numero}`,
        casoId: caso.id,
        origem: a.notificacao.origem,
        destinoCrasCodigo: a.destino.cras as string,
        motivo: a.notificacao.motivo,
        status: 'NOVA',
        criadaEm: agora,
        prazoEm: prazo,
      },
      select: { codigo: true },
    });
    notificacao = n.codigo;
    await tx.eventoCaso.create({
      data: {
        casoId: caso.id,
        tipo: 'NOTIFICACAO_ENVIADA',
        ocorridoEm: agora,
        autorId: a.autorId ?? null,
        dados: { notificacao: n.codigo, destino: 'CRAS' },
      },
    });
  }
  return { criado: true, casoId: caso.id, codigo: caso.codigo, notificacao };
}
