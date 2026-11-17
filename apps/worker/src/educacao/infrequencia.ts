import {
  contarFaltasSeguidas,
  decidirInfrequencia,
  faltasDoMotivo,
  hojeEmPortoVelho,
  motivoInfrequencia,
  type DataISO,
  type RegistroFrequencia,
  referenciaInfrequencia,
} from '@sii/shared';
import { criarCaso, destinosCras, feriadosDoAno } from '../../../api/src/casos/criar-caso';
import type { PrismaClient } from '../banco';
import type { Contagens, ProcessadorConsulta } from '../cargas/pipeline';

/**
 * Job diário de infrequência (§4.1, P10, ADR 0009). Para cada matrícula ativa, conta as faltas
 * seguidas pelo calendário da escola (`contarFaltasSeguidas`) até o último dia letivo antes de hoje
 * e decide com `decidirInfrequencia`:
 *
 * - CRIAR: Caso(INFREQUENCIA) + Notificacao ao CRAS do território do domicílio + trilha;
 * - ATUALIZAR: só o motivo da notificação mais recente do caso aberto;
 * - caso encerrado não conta: com 5+ faltas, abre outro (decisão de 17/11/2026).
 *
 * Idempotente: a criação (`criarCaso`, API, ADR 0010) roda sob um advisory lock e confere de novo,
 * dentro da transação, se já existe caso aberto. O resumo não tem dado pessoal.
 */

/** Quantos dias letivos o job olha para trás. A contagem no motivo para aqui (40+ faltas). */
export const JANELA_LETIVOS = 40;

export interface OpcoesInfrequencia {
  /** Hoje em Porto Velho (injetável nos testes). */
  hoje?: DataISO;
  /** Força o dia de referência para todas as escolas (reprocessar uma data). */
  referencia?: DataISO;
}

export interface ResumoInfrequencia {
  avaliadas: number;
  comFaltas: number;
  criados: number;
  atualizados: number;
  semCras: number;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const dia = (s: string) => new Date(`${s}T00:00:00Z`);

export async function executarInfrequencia(
  prisma: PrismaClient,
  opcoes: OpcoesInfrequencia = {},
): Promise<ResumoInfrequencia> {
  const hoje = opcoes.hoje ?? hojeEmPortoVelho();
  const limite = opcoes.referencia ?? hoje;
  const resumo: ResumoInfrequencia = {
    avaliadas: 0,
    comFaltas: 0,
    criados: 0,
    atualizados: 0,
    semCras: 0,
  };

  const matriculas = await prisma.matricula.findMany({
    where: { situacao: 'ATIVA' },
    select: { id: true, pessoaId: true, escolaId: true, escola: { select: { inep: true } } },
  });
  resumo.avaliadas = matriculas.length;
  if (matriculas.length === 0) return resumo;

  // Dias letivos de cada escola (só a janela que importa).
  const escolaIds = [...new Set(matriculas.map((m) => m.escolaId))];
  const calendario = await prisma.calendarioEscolar.findMany({
    where: {
      escolaId: { in: escolaIds },
      dia: { lte: dia(limite), gte: new Date(dia(limite).getTime() - 120 * 86_400_000) },
    },
    select: { escolaId: true, dia: true },
  });
  const janela = new Map<number, { letivos: DataISO[]; referencia: DataISO }>();
  for (const escolaId of escolaIds) {
    const todos = calendario
      .filter((c) => c.escolaId === escolaId)
      .map((c) => iso(c.dia))
      .sort();
    // Com referência forçada, vale o último letivo até ela (inclusive).
    const referencia = referenciaInfrequencia(
      todos,
      opcoes.referencia ? adicionarUmDia(opcoes.referencia) : hoje,
    );
    if (!referencia) continue;
    const letivos = todos.filter((d) => d <= referencia).slice(-JANELA_LETIVOS);
    janela.set(escolaId, { letivos, referencia });
  }

  const inicioJanela = [...janela.values()].map((j) => j.letivos[0] as DataISO).sort()[0];
  if (!inicioJanela) return resumo;
  const frequencias = await prisma.frequencia.findMany({
    where: { matriculaId: { in: matriculas.map((m) => m.id) }, dia: { gte: dia(inicioJanela) } },
    select: { matriculaId: true, dia: true, situacao: true },
  });
  const porMatricula = new Map<number, RegistroFrequencia[]>();
  for (const f of frequencias) {
    const lista = porMatricula.get(f.matriculaId) ?? [];
    lista.push({ data: iso(f.dia), situacao: f.situacao });
    porMatricula.set(f.matriculaId, lista);
  }

  // Maior sequência por pessoa (aluno com duas matrículas ativas conta uma vez).
  const porPessoa = new Map<
    number,
    { faltas: number; escolaId: number; inep: string; referencia: DataISO }
  >();
  for (const m of matriculas) {
    const j = janela.get(m.escolaId);
    if (!j) continue;
    const faltas = contarFaltasSeguidas(porMatricula.get(m.id) ?? [], j.letivos, j.referencia);
    const atual = porPessoa.get(m.pessoaId);
    if (!atual || faltas > atual.faltas)
      porPessoa.set(m.pessoaId, {
        faltas,
        escolaId: m.escolaId,
        inep: m.escola.inep,
        referencia: j.referencia,
      });
  }
  const candidatos = [...porPessoa.entries()].filter(
    ([, s]) => decidirInfrequencia({ faltasSeguidas: s.faltas, casoAberto: null }) !== 'NADA',
  );
  resumo.comFaltas = candidatos.length;
  if (candidatos.length === 0) return resumo;

  const abertos = new Map(
    (
      await prisma.caso.findMany({
        where: {
          tipo: 'INFREQUENCIA',
          encerradoEm: null,
          pessoaId: { in: candidatos.map(([p]) => p) },
        },
        select: {
          pessoaId: true,
          notificacoes: {
            orderBy: { criadaEm: 'desc' },
            take: 1,
            select: { id: true, motivo: true },
          },
        },
      })
    ).map((c) => [c.pessoaId, c.notificacoes[0] ?? null]),
  );
  const destinos = await destinosCras(
    prisma,
    candidatos.map(([p]) => p),
  );
  const feriados = await feriadosDoAno(prisma, Number(hoje.slice(0, 4)), escolaIds);

  for (const [pessoaId, s] of candidatos) {
    const aberta = abertos.get(pessoaId);
    const acao = decidirInfrequencia({
      faltasSeguidas: s.faltas,
      casoAberto:
        aberta === undefined
          ? null
          : { faltasNoMotivo: aberta ? faltasDoMotivo(aberta.motivo) : null },
    });
    if (acao === 'ATUALIZAR') {
      if (aberta) {
        await prisma.notificacao.update({
          where: { id: aberta.id },
          data: { motivo: motivoInfrequencia(s.faltas) },
        });
        resumo.atualizados++;
      }
      continue;
    }
    if (acao !== 'CRIAR') continue;
    const destino = destinos.get(pessoaId);
    if (!destino?.cras) {
      resumo.semCras++;
      continue;
    }
    const r = await prisma.$transaction((tx) =>
      criarCaso(tx, {
        tipo: 'INFREQUENCIA',
        pessoaId,
        origem: 'Frequência escolar',
        secretaria: 'ASSISTENCIA',
        destino,
        hoje,
        feriados: feriados.get(s.escolaId) ?? feriados.get('MUNICIPAL') ?? [],
        abertura: {
          tipo: 'ALERTA_GERADO',
          dados: { faltasSeguidas: s.faltas, inep: s.inep, referencia: s.referencia },
        },
        notificacao: { motivo: motivoInfrequencia(s.faltas), origem: 'ESCOLA' },
      }),
    );
    if (r.criado) resumo.criados++;
  }
  return resumo;
}

function adicionarUmDia(d: DataISO): DataISO {
  return iso(new Date(dia(d).getTime() + 86_400_000));
}

/** O job como "consulta" do padrão de carga: grava LogCarga(INFREQUENCIA) com o resumo. */
export function criarProcessadorInfrequencia(opcoes: OpcoesInfrequencia = {}): ProcessadorConsulta {
  return async (ctx): Promise<Contagens> => {
    await ctx.etapa('FREQUENCIA');
    const r = await executarInfrequencia(ctx.prisma, opcoes);
    return {
      total: r.avaliadas,
      lidos: r.avaliadas,
      inseridos: r.criados,
      rejeitados: 0,
      ligados: 0,
      novos: r.criados,
      revisao: 0,
      avisos: r.semCras,
      resumo: { ...r },
    };
  };
}
