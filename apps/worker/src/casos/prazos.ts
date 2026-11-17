import {
  type EnderecoAviso,
  hojeEmPortoVelho,
  type NivelEscalonamento,
  prazoHoje,
  subiuDeNivel,
  type DataISO,
} from '@sii/shared';
import { registrarAvisos } from '../../../api/src/casos/avisos.service';
import { feriadosDoAno } from '../../../api/src/casos/criar-caso';
import type { PrismaClient } from '../banco';
import type { Contagens, ProcessadorConsulta } from '../cargas/pipeline';

/**
 * Job diário de prazos (§4.1, §4.2, P11, ADR 0010). Para cada caso aberto de infrequência e de
 * busca ativa, calcula o prazo de hoje (`prazoHoje`, shared) e grava o nível de escalonamento.
 * Quando o nível **sobe**, avisa (sem dado pessoal):
 * - nível 1: o CRAS da notificação (infrequência) ou a secretaria responsável;
 * - nível 2: a coordenação da secretaria responsável;
 * - nível 3: o Comitê (o caso entra na pauta, que é a lista viva dos casos em nível 3).
 *
 * Idempotente: rodar de novo no mesmo dia não muda nível nem repete aviso.
 */

export interface ResumoPrazos {
  avaliados: number;
  subiram: number;
  desceram: number;
  nivel3: number;
  avisos: number;
}

const TIPOS = ['INFREQUENCIA', 'BUSCA_ATIVA_ESCOLAR'] as const;

export async function executarPrazos(
  prisma: PrismaClient,
  opcoes: { hoje?: DataISO } = {},
): Promise<ResumoPrazos> {
  const hoje = opcoes.hoje ?? hojeEmPortoVelho();
  const feriados = (await feriadosDoAno(prisma, Number(hoje.slice(0, 4)))).get('MUNICIPAL') ?? [];
  const casos = await prisma.caso.findMany({
    where: { tipo: { in: [...TIPOS] }, encerradoEm: null },
    select: {
      id: true,
      codigo: true,
      tipo: true,
      status: true,
      nivel: true,
      alertaEm: true,
      secretariaResponsavel: true,
      notificacoes: { orderBy: { criadaEm: 'desc' }, take: 1, select: { destinoCrasCodigo: true } },
    },
  });
  const r: ResumoPrazos = {
    avaliados: casos.length,
    subiram: 0,
    desceram: 0,
    nivel3: 0,
    avisos: 0,
  };
  for (const c of casos) {
    let nivel: NivelEscalonamento = 0;
    try {
      nivel =
        prazoHoje(
          {
            tipo: c.tipo as (typeof TIPOS)[number],
            status: c.status,
            alertaEm: hojeEmPortoVelho(c.alertaEm),
          },
          hoje,
          feriados,
        )?.nivel ?? 0;
    } catch {
      // Etapa que não é do tipo (dado antigo): não mexe no caso.
      continue;
    }
    if (nivel === 3) r.nivel3++;
    if (nivel === c.nivel) continue;
    const subiu = subiuDeNivel(c.nivel, nivel);
    await prisma.$transaction(async (tx) => {
      await tx.caso.update({ where: { id: c.id }, data: { nivel } });
      if (!subiu) return;
      const cras = c.notificacoes[0]?.destinoCrasCodigo;
      const destino: EnderecoAviso =
        nivel === 3
          ? { tipo: 'COMITE', valor: 'COMITE' }
          : nivel === 1 && cras
            ? { tipo: 'CRAS', valor: cras }
            : { tipo: 'SECRETARIA', valor: c.secretariaResponsavel };
      r.avisos += await registrarAvisos(tx, c.id, c.codigo, `NIVEL_${nivel}` as 'NIVEL_1', [
        destino,
      ]);
    });
    if (subiu) r.subiram++;
    else r.desceram++;
  }
  return r;
}

/** O job como "consulta" do padrão de carga: LogCarga(PRAZOS) com o resumo. */
export function criarProcessadorPrazos(opcoes: { hoje?: DataISO } = {}): ProcessadorConsulta {
  return async (ctx): Promise<Contagens> => {
    await ctx.etapa('PRAZOS');
    const r = await executarPrazos(ctx.prisma, opcoes);
    return {
      total: r.avaliados,
      lidos: r.avaliados,
      inseridos: r.avisos,
      rejeitados: 0,
      ligados: 0,
      novos: 0,
      revisao: 0,
      avisos: 0,
      resumo: { ...r },
    };
  };
}
