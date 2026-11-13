import type { Logger } from '@nestjs/common';
import { type EtapaCarga, type ProblemaLinha } from '@sii/shared';
import type { Client } from 'minio';
import { lerObjeto } from '../../../api/src/cargas/armazenamento';
import type { PrismaClient } from '../banco';

/**
 * Padrão de carga (§5, P08): arquivo no MinIO → processador da fonte (layout, stg_<fonte>, ligação,
 * domínio) → LogCarga. Este arquivo é igual para toda fonte; o que muda é o `ProcessadorFonte`.
 *
 * Regra de ouro: nada de dado pessoal no log. O log do processo recebe só o id da carga, contagens e
 * o tipo do erro (nunca a mensagem, que pode vir do banco com valores de coluna).
 */

/** Rejeição por layout ou arquivo ilegível. A mensagem é fixa e vai para a tela. */
export class RejeicaoCarga extends Error {}

/**
 * Falha que não adianta tentar de novo (ex.: a estrutura do banco do e-SUS mudou, P09). A carga
 * fica FALHOU na hora, com esta mensagem (fixa, sem dado pessoal), e a CTI vê o alerta.
 */
export class FalhaDefinitiva extends Error {
  override name = 'FalhaDefinitiva';
}

export interface Contagens {
  total: number;
  lidos: number;
  inseridos: number;
  rejeitados: number;
  ligados: number;
  novos: number;
  revisao: number;
  avisos: number;
  /** Cargas lidas direto da fonte (P09). */
  modo?: 'COMPLETA' | 'INCREMENTAL';
  marca?: string;
  resumo?: Record<string, number>;
}

export interface ContextoCarga {
  carga: { id: number; fonte: string; mesReferencia: string | null };
  prisma: PrismaClient;
  etapa(
    etapa: EtapaCarga,
    extra?: { total?: number; codificacao?: string; separador?: string },
  ): Promise<void>;
  progresso(processados: number): Promise<void>;
  problema(linha: number, p: ProblemaLinha): void;
}

export type ProcessadorFonte = (ctx: ContextoCarga, arquivo: Buffer) => Promise<Contagens>;
/** Fonte lida direto do sistema de origem (e-SUS PEC), sem arquivo no MinIO. */
export type ProcessadorConsulta = (ctx: ContextoCarga) => Promise<Contagens>;

export interface DependenciasCarga {
  prisma: PrismaClient;
  minio: Client;
  bucket: string;
  logger: Pick<Logger, 'log' | 'warn' | 'error'>;
  processadores: Record<string, ProcessadorFonte>;
  consultas?: Record<string, ProcessadorConsulta>;
}

/** Até quantos problemas por carga ficam guardados (o total vai em `rejeitados` e `avisos`). */
export const LIMITE_ERROS_GUARDADOS = 1000;
const INTERVALO_PROGRESSO = 250;

export const MENSAGEM_FALHA =
  'A carga parou por um problema técnico. A CTI foi avisada pelo registro da carga; envie o arquivo de novo mais tarde.';

export async function executarCarga(
  d: DependenciasCarga,
  cargaId: number,
  ultimaTentativa: boolean,
): Promise<void> {
  const carga = await d.prisma.logCarga.findUnique({ where: { id: cargaId } });
  if (!carga) {
    d.logger.warn(`carga ${cargaId}: não existe, job ignorado`);
    return;
  }
  if (carga.status === 'OK' || carga.status === 'REJEITADA') return;
  const fim = async (dados: Parameters<PrismaClient['logCarga']['update']>[0]['data']) => {
    await apagarArquivo(d, cargaId, carga.objeto);
    await d.prisma.logCarga.update({
      where: { id: cargaId },
      data: { ...dados, fimEm: new Date() },
    });
  };
  const consulta = d.consultas?.[carga.fonte];
  if (!consulta && !carga.objeto) {
    await fim({
      status: 'FALHOU',
      erro: 'O arquivo da carga não está mais disponível. Envie de novo.',
    });
    return;
  }
  const processador = d.processadores[carga.fonte];
  if (!processador && !consulta) {
    await fim({ status: 'FALHOU', erro: 'Esta fonte ainda não tem carga implementada.' });
    return;
  }

  // Nova tentativa começa do zero (a carga é idempotente).
  await d.prisma.erroCarga.deleteMany({ where: { cargaId } });
  await d.prisma.logCarga.update({
    where: { id: cargaId },
    data: { status: 'EXECUTANDO', etapa: 'BAIXANDO', erro: null, processados: 0 },
  });

  const problemas: {
    cargaId: number;
    linha: number;
    campo: string;
    gravidade: string;
    mensagem: string;
  }[] = [];
  let guardados = 0;
  let ultimoProgresso = 0;
  const gravarProblemas = async () => {
    if (problemas.length === 0) return;
    await d.prisma.erroCarga.createMany({ data: problemas.splice(0) });
  };
  const ctx: ContextoCarga = {
    carga: { id: carga.id, fonte: carga.fonte, mesReferencia: carga.mesReferencia },
    prisma: d.prisma,
    async etapa(etapa, extra = {}) {
      await gravarProblemas();
      await d.prisma.logCarga.update({ where: { id: cargaId }, data: { etapa, ...extra } });
    },
    async progresso(processados) {
      if (processados - ultimoProgresso < INTERVALO_PROGRESSO) return;
      ultimoProgresso = processados;
      await gravarProblemas();
      await d.prisma.logCarga.update({ where: { id: cargaId }, data: { processados } });
    },
    problema(linha, p) {
      if (guardados >= LIMITE_ERROS_GUARDADOS) return;
      guardados++;
      problemas.push({
        cargaId,
        linha,
        campo: p.campo,
        gravidade: p.gravidade,
        mensagem: p.mensagem,
      });
    },
  };

  const inicio = Date.now();
  try {
    const c = consulta
      ? await consulta(ctx)
      : await (processador as ProcessadorFonte)(
          ctx,
          await lerObjeto(d.minio, d.bucket, carga.objeto as string),
        );
    await gravarProblemas();
    await fim({ status: 'OK', etapa: 'FIM', processados: c.inseridos, ...c });
    d.logger.log(
      `carga ${cargaId} (${carga.fonte}) ok em ${((Date.now() - inicio) / 1000).toFixed(1)} s: ` +
        `${c.lidos} linhas, ${c.inseridos} carregadas, ${c.rejeitados} rejeitadas, ` +
        `${c.ligados} ligadas, ${c.novos} novas, ${c.revisao} em revisão`,
    );
  } catch (e) {
    await gravarProblemas().catch(() => undefined);
    if (e instanceof RejeicaoCarga) {
      await fim({ status: 'REJEITADA', erro: e.message.slice(0, 1000) });
      d.logger.warn(`carga ${cargaId} (${carga.fonte}) rejeitada no layout`);
      return;
    }
    if (e instanceof FalhaDefinitiva) {
      await fim({ status: 'FALHOU', erro: e.message.slice(0, 1000) });
      d.logger.error(`carga ${cargaId} (${carga.fonte}) falhou: ${e.name}, sem nova tentativa`);
      return;
    }
    const tipo = e instanceof Error ? e.name : 'Erro';
    d.logger.error(`carga ${cargaId} (${carga.fonte}) falhou: ${tipo}`);
    if (ultimaTentativa) {
      await fim({ status: 'FALHOU', erro: MENSAGEM_FALHA });
      return;
    }
    await d.prisma.logCarga.update({
      where: { id: cargaId },
      data: { status: 'AGUARDANDO', erro: 'Falha temporária: a carga vai ser tentada de novo.' },
    });
    throw new Error(`carga ${cargaId} falhou (${tipo}); nova tentativa`);
  }
}

/** O arquivo original tem CPF e NIS em texto: sai do MinIO assim que a carga termina (12/11/2026). */
async function apagarArquivo(d: DependenciasCarga, cargaId: number, objeto: string | null) {
  if (!objeto) return;
  try {
    await d.minio.removeObject(d.bucket, objeto);
    await d.prisma.logCarga.update({ where: { id: cargaId }, data: { objeto: null } });
  } catch (e) {
    d.logger.error(`carga ${cargaId}: não foi possível apagar o arquivo (${(e as Error).name})`);
  }
}
