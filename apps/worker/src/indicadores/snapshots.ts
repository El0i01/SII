import {
  calcularSnapshot,
  type CodigoIndicador,
  cumpreFrequenciaPbf,
  type DataISO,
  encaminhadoNoPrazo,
  hojeEmPortoVelho,
  indicadorDePessoas,
  INDICADORES_POR_VIGENCIA,
  intervaloSemestre,
  periodoMensal,
  semestre,
  semestresAte,
  TERRITORIO_MUNICIPIO,
  unidadeIndicador,
  vigenciaPbf,
} from '@sii/shared';
import type { PrismaClient } from '../banco';
import type { Contagens, ProcessadorConsulta } from '../cargas/pipeline';

/**
 * Job de indicadores (§3.11, P16, ADR 0015). Calcula OE1 a OE6 para o município (`MUN`) e cada
 * setor e grava `indicadores.indicador_snapshot` por upsert (indicador, território, período):
 * - período mensal (`AAAA-MM`) da data de referência;
 * - OE3 (Bolsa Família) também por vigência (`AAAA-V1`/`AAAA-V2`).
 * Só números: nenhuma linha nominal sai daqui, e contagens de pessoas de 1 a 4 são suprimidas.
 * Idempotente: rodar de novo no mesmo período substitui os valores.
 *
 * Referência padrão: ontem. O cron roda no dia 1 e fecha o mês anterior.
 */

/** Primeiro semestre com relatório esperado (início do SII em produção, a confirmar). */
export const PRIMEIRO_SEMESTRE = '2026-S1';

type Contagem = { territorio: string; num: number; den: number };
type Linha = { setor: string | null; num: number; den: number };

/** Linhas por setor + a soma do município (o setor nulo entra só no município). */
function comMunicipio(linhas: Linha[]): Contagem[] {
  const mun = { territorio: TERRITORIO_MUNICIPIO, num: 0, den: 0 };
  const r: Contagem[] = [];
  for (const l of linhas) {
    mun.num += Number(l.num);
    mun.den += Number(l.den);
    if (l.setor) r.push({ territorio: l.setor, num: Number(l.num), den: Number(l.den) });
  }
  return [mun, ...r];
}

const data = (d: DataISO) => new Date(`${d}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

async function encaminhados(prisma: PrismaClient, ref: DataISO): Promise<Contagem[]> {
  // Casos com alerta nos 12 meses até a referência; encaminhado = 1º ENCAMINHADO ou notificação.
  const casos = await prisma.$queryRaw<{ setor: string | null; alerta: Date; enc: Date | null }[]>`
    SELECT c.setor_codigo AS setor, c.alerta_em AS alerta,
           (SELECT min(e.ocorrido_em) FROM casos.evento_caso e
             WHERE e.caso_id = c.id AND e.tipo IN ('ENCAMINHADO', 'NOTIFICACAO_ENVIADA')) AS enc
    FROM casos.caso c
    WHERE c.tipo IN ('BUSCA_ATIVA_ESCOLAR', 'INFREQUENCIA')
      AND c.alerta_em <= ${data(ref)}::date + interval '1 day'
      AND c.alerta_em > ${data(ref)}::date - interval '12 months'`;
  const m = new Map<string | null, Linha>();
  for (const c of casos) {
    const alerta = hojeEmPortoVelho(c.alerta);
    const enc = c.enc && hojeEmPortoVelho(c.enc) <= ref ? hojeEmPortoVelho(c.enc) : null;
    const ok = encaminhadoNoPrazo(alerta, enc, ref);
    if (ok === null) continue;
    const l = m.get(c.setor) ?? { setor: c.setor, num: 0, den: 0 };
    l.den++;
    if (ok) l.num++;
    m.set(c.setor, l);
  }
  return comMunicipio([...m.values()]);
}

async function vacinacao(prisma: PrismaClient, ref: DataISO, soPbf: boolean): Promise<Contagem[]> {
  const pbf = soPbf ? prismaSqlPbf() : '';
  const linhas = await prisma.$queryRawUnsafe<Linha[]>(
    `SELECT p.setor_codigo AS setor,
            count(*) FILTER (WHERE s.vacinacao_em_dia)::int AS num,
            count(*)::int AS den
     FROM pessoas.pessoa_mestra p JOIN saude.sinalizador_saude s ON s.pessoa_id = p.id
     WHERE s.vacinacao_em_dia IS NOT NULL
       AND p.data_nascimento > $1::date - interval '7 years' AND p.data_nascimento <= $1::date
       ${pbf}
     GROUP BY 1`,
    data(ref),
  );
  return comMunicipio(linhas);
}

/** Pessoa de família que recebe o Bolsa Família (último mês do CadÚnico até a referência). */
function prismaSqlPbf(): string {
  return `AND EXISTS (
    SELECT 1 FROM pessoas.membro_familia mf
    JOIN LATERAL (SELECT cf.recebe_pbf FROM assistencia.cadunico_familia cf
                  WHERE cf.familia_id = mf.familia_id AND cf.mes_referencia <= to_char($1::date, 'YYYY-MM')
                  ORDER BY cf.mes_referencia DESC LIMIT 1) u ON true
    WHERE mf.pessoa_id = p.id AND u.recebe_pbf)`;
}

async function creche(prisma: PrismaClient, ref: DataISO): Promise<Contagem[]> {
  const linhas = await prisma.$queryRaw<Linha[]>`
    SELECT p.setor_codigo AS setor,
           count(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM educacao.matricula m WHERE m.pessoa_id = p.id AND m.situacao = 'ATIVA'
               AND m.ano = ${Number(ref.slice(0, 4))}))::int AS num,
           count(*)::int AS den
    FROM pessoas.pessoa_mestra p
    WHERE p.data_nascimento > ${data(ref)}::date - interval '4 years' AND p.data_nascimento <= ${data(ref)}::date
    GROUP BY 1`;
  return comMunicipio(linhas);
}

async function pbfEducacao(prisma: PrismaClient, de: DataISO, ate: DataISO): Promise<Contagem[]> {
  const alunos = await prisma.$queryRawUnsafe<
    { setor: string | null; presencas: number; lancamentos: number }[]
  >(
    `SELECT p.setor_codigo AS setor,
            count(*) FILTER (WHERE f.situacao <> 'FALTA')::int AS presencas,
            count(f.*)::int AS lancamentos
     FROM pessoas.pessoa_mestra p
     JOIN educacao.matricula m ON m.pessoa_id = p.id AND m.situacao = 'ATIVA'
     LEFT JOIN educacao.frequencia f ON f.matricula_id = m.id AND f.dia BETWEEN $2::date AND $1::date
     WHERE p.data_nascimento <= $1::date - interval '6 years'
       AND p.data_nascimento > $1::date - interval '18 years'
       ${prismaSqlPbf()}
     GROUP BY p.id, p.setor_codigo`,
    data(ate),
    data(de),
  );
  const m = new Map<string | null, Linha>();
  for (const a of alunos) {
    const ok = cumpreFrequenciaPbf(a.presencas, a.lancamentos);
    if (ok === null) continue;
    const l = m.get(a.setor) ?? { setor: a.setor, num: 0, den: 0 };
    l.den++;
    if (ok) l.num++;
    m.set(a.setor, l);
  }
  return comMunicipio([...m.values()]);
}

async function pontoPreciso(prisma: PrismaClient): Promise<Contagem[]> {
  const linhas = await prisma.$queryRaw<Linha[]>`
    SELECT s.codigo AS setor,
           count(*) FILTER (WHERE d.geo_fonte IN ('LOTE', 'CENSO_GPS') OR d.confirmado_em IS NOT NULL)::int AS num,
           count(*)::int AS den
    FROM territorio.domicilio d JOIN territorio.setor s ON s.id = d.setor_id
    GROUP BY 1`;
  return comMunicipio(linhas);
}

async function relatorios(prisma: PrismaClient, ref: DataISO): Promise<Contagem[]> {
  // Semestres já encerrados desde o primeiro (o semestre em curso ainda não tem relatório devido).
  const devidos = semestresAte(ref, PRIMEIRO_SEMESTRE).filter((s) => s !== semestre(ref));
  if (devidos.length === 0) return [{ territorio: TERRITORIO_MUNICIPIO, num: 0, den: 0 }];
  const entregues = await prisma.relatorioSemestral.findMany({
    where: { semestre: { in: devidos }, entregueEm: { not: null } },
    distinct: ['semestre'],
    select: { semestre: true },
  });
  return [{ territorio: TERRITORIO_MUNICIPIO, num: entregues.length, den: devidos.length }];
}

async function acessos(prisma: PrismaClient, de: DataISO, ate: DataISO): Promise<Contagem[]> {
  const [r] = await prisma.$queryRaw<{ num: number; den: number }[]>`
    SELECT count(*) FILTER (WHERE length(trim(finalidade)) > 0)::int AS num, count(*)::int AS den
    FROM auditoria.acesso_dado_pessoal
    WHERE quando >= ${data(de)} AND quando < ${data(ate)}::date + interval '1 day'`;
  return [{ territorio: TERRITORIO_MUNICIPIO, num: r?.num ?? 0, den: r?.den ?? 0 }];
}

export interface ResumoIndicadores {
  referencia: DataISO;
  periodos: string[];
  gravados: number;
  suprimidos: number;
}

/** Todos os setores aparecem em todo indicador de pessoas (setor sem ninguém = 0 de 0). */
async function completarSetores(prisma: PrismaClient, c: Contagem[]): Promise<Contagem[]> {
  const setores = await prisma.setor.findMany({ select: { codigo: true } });
  const tem = new Set(c.map((x) => x.territorio));
  return [
    ...c,
    ...setores
      .filter((s) => !tem.has(s.codigo))
      .map((s) => ({ territorio: s.codigo, num: 0, den: 0 })),
  ];
}

export async function executarIndicadores(
  prisma: PrismaClient,
  opcoes: { referencia?: DataISO } = {},
): Promise<ResumoIndicadores> {
  const ref =
    opcoes.referencia ?? iso(new Date(data(hojeEmPortoVelho()).getTime() - 24 * 3600 * 1000));
  const mes = periodoMensal(ref);
  const inicioMes = `${mes}-01` as DataISO;
  const vigencia = vigenciaPbf(ref);
  const inicioVigencia = intervaloSemestre(vigencia).inicio;

  const calculos: [CodigoIndicador, string, Promise<Contagem[]>][] = [
    ['ENCAMINHADOS_30D', mes, encaminhados(prisma, ref)],
    ['VACINACAO_0_6', mes, vacinacao(prisma, ref, false)],
    ['CRECHE_0_3', mes, creche(prisma, ref)],
    ['PBF_EDUCACAO', mes, pbfEducacao(prisma, inicioMes, ref)],
    ['PBF_EDUCACAO', vigencia, pbfEducacao(prisma, inicioVigencia, ref)],
    ['PBF_SAUDE', mes, vacinacao(prisma, ref, true)],
    ['PBF_SAUDE', vigencia, vacinacao(prisma, ref, true)],
    ['PONTO_PRECISO', mes, pontoPreciso(prisma)],
    ['RELATORIOS_ENTREGUES', mes, relatorios(prisma, ref)],
    ['ACESSOS_REGISTRADOS', mes, acessos(prisma, inicioMes, ref)],
  ];
  const r: ResumoIndicadores = {
    referencia: ref,
    periodos: [mes, vigencia],
    gravados: 0,
    suprimidos: 0,
  };
  for (const [indicador, periodo, promessa] of calculos) {
    if (periodo === vigencia && !INDICADORES_POR_VIGENCIA.includes(indicador)) continue;
    const pessoas = indicadorDePessoas(indicador);
    const contagens = pessoas ? await completarSetores(prisma, await promessa) : await promessa;
    for (const c of contagens) {
      const s = calcularSnapshot(c.num, c.den, unidadeIndicador(indicador), pessoas);
      const objetivo = INDICADOR_OBJETIVO[indicador];
      const valores = {
        objetivo,
        numerador: s.numerador,
        denominador: s.denominador,
        valor: s.valor,
        suprimido: s.suprimido,
        calculadoEm: new Date(),
      };
      await prisma.indicadorSnapshot.upsert({
        where: {
          indicador_territorioCodigo_periodo: {
            indicador,
            territorioCodigo: c.territorio,
            periodo,
          },
        },
        create: { indicador, territorioCodigo: c.territorio, periodo, ...valores },
        update: valores,
      });
      r.gravados++;
      if (s.suprimido) r.suprimidos++;
    }
  }
  return r;
}

const INDICADOR_OBJETIVO: Record<CodigoIndicador, string> = {
  ENCAMINHADOS_30D: 'OE1',
  VACINACAO_0_6: 'OE2',
  CRECHE_0_3: 'OE2',
  PBF_EDUCACAO: 'OE3',
  PBF_SAUDE: 'OE3',
  PONTO_PRECISO: 'OE4',
  RELATORIOS_ENTREGUES: 'OE5',
  ACESSOS_REGISTRADOS: 'OE6',
};

/** O job como "consulta" do padrão de carga: LogCarga(INDICADORES) com o resumo. */
export function criarProcessadorIndicadores(
  opcoes: { referencia?: DataISO } = {},
): ProcessadorConsulta {
  return async (ctx): Promise<Contagens> => {
    await ctx.etapa('INDICADORES');
    const r = await executarIndicadores(ctx.prisma, opcoes);
    return {
      total: r.gravados,
      lidos: r.gravados,
      inseridos: r.gravados,
      rejeitados: 0,
      ligados: 0,
      novos: 0,
      revisao: 0,
      avisos: 0,
      resumo: { gravados: r.gravados, suprimidos: r.suprimidos },
    };
  };
}
