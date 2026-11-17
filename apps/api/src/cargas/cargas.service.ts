import path from 'node:path';
import { HttpStatus, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  FILA_CARGAS,
  FONTES_AGENDADAS,
  FONTES_UPLOAD,
  type JobCarga,
  UploadCarga,
} from '@sii/shared';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import type { Client } from 'minio';
import { PrismaService } from '../banco/prisma.service';
import { ErroApi, erros } from '../comum/erros';
import { Env } from '../config/env';
import { buscarAlertasCarga } from './alertas';
import { chaveObjeto, clienteMinio, configMinio, garantirBucket } from './armazenamento';

export interface ArquivoEnviado {
  originalname: string;
  size: number;
  buffer: Buffer;
}

const SELECAO = {
  id: true,
  fonte: true,
  status: true,
  etapa: true,
  arquivo: true,
  mesReferencia: true,
  inicioEm: true,
  fimEm: true,
  total: true,
  processados: true,
  lidos: true,
  inseridos: true,
  rejeitados: true,
  ligados: true,
  novos: true,
  revisao: true,
  avisos: true,
  erro: true,
  codificacao: true,
  separador: true,
  modo: true,
} as const;

/** Fontes com processador no worker (P08 e P10). */
const FONTES_DISPONIVEIS: readonly string[] = ['CADUNICO', 'GESTAO_ESCOLAR', 'SEDUC'];

export type PerfilQueEnvia = 'ADMIN_CTI' | 'ASSISTENCIA_GESTOR' | 'SEMED_GESTOR';
/** A Assistência envia o CadÚnico; a SEMED, as cargas da Educação; a CTI, todas. */
const FONTES_POR_PERFIL: Record<PerfilQueEnvia, readonly string[]> = {
  ADMIN_CTI: FONTES_DISPONIVEIS,
  ASSISTENCIA_GESTOR: ['CADUNICO'],
  SEMED_GESTOR: ['GESTAO_ESCOLAR', 'SEDUC'],
};

/**
 * Recebe o arquivo, guarda no MinIO, cria o LogCarga e põe o job na fila (§5, P08). O processamento
 * é do worker. O job leva só o id da carga.
 */
@Injectable()
export class CargasService implements OnModuleDestroy {
  private readonly minio: Client;
  private readonly bucket: string;
  private readonly redis: Redis;
  private readonly fila: Queue<JobCarga>;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    const c = configMinio({
      MINIO_URL: config.get('MINIO_URL', { infer: true }),
      MINIO_USUARIO: config.get('MINIO_USUARIO', { infer: true }),
      MINIO_SENHA: config.get('MINIO_SENHA', { infer: true }),
      MINIO_ROOT_USER: config.get('MINIO_ROOT_USER', { infer: true }),
      MINIO_ROOT_PASSWORD: config.get('MINIO_ROOT_PASSWORD', { infer: true }),
      MINIO_BUCKET_CARGAS: config.get('MINIO_BUCKET_CARGAS', { infer: true }),
    });
    this.minio = clienteMinio(c);
    this.bucket = c.bucket;
    this.redis = new Redis(config.get('REDIS_URL', { infer: true }), {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 2_000,
    });
    this.redis.on('error', () => undefined);
    this.fila = new Queue<JobCarga>(FILA_CARGAS, { connection: this.redis });
  }

  async enviar(
    corpo: { fonte?: unknown; mesReferencia?: unknown },
    arquivo: ArquivoEnviado | undefined,
    usuarioId: number,
    perfil: PerfilQueEnvia,
  ) {
    if (!arquivo) throw erros.validacao({ arquivo: ['Escolha o arquivo para enviar.'] });
    // O multer entrega o nome em latin1; o navegador manda em UTF-8.
    const nome = path.basename(Buffer.from(arquivo.originalname, 'latin1').toString('utf8'));
    const r = UploadCarga.safeParse({
      fonte: corpo.fonte,
      mesReferencia: corpo.mesReferencia,
      nomeArquivo: nome,
      tamanhoBytes: arquivo.size,
    });
    if (!r.success) {
      const campos: Record<string, string[]> = {};
      for (const p of r.error.issues) {
        const chave =
          p.path[0] === 'nomeArquivo' || p.path[0] === 'tamanhoBytes'
            ? 'arquivo'
            : String(p.path[0]);
        (campos[chave] ??= []).push(p.message);
      }
      throw erros.validacao(campos);
    }
    if (!FONTES_DISPONIVEIS.includes(r.data.fonte))
      throw new ErroApi(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'FONTE_AINDA_NAO_DISPONIVEL',
        'Esta fonte ainda não tem carga. Por enquanto: CadÚnico, gestão escolar e SEDUC-RO.',
      );
    if (!FONTES_POR_PERFIL[perfil].includes(r.data.fonte))
      throw new ErroApi(
        HttpStatus.FORBIDDEN,
        'SEM_PERMISSAO',
        'Seu perfil não envia arquivos desta fonte.',
      );

    const carga = await this.prisma.logCarga.create({
      data: {
        fonte: r.data.fonte,
        status: 'AGUARDANDO',
        arquivo: nome.slice(0, 200),
        mesReferencia: r.data.mesReferencia,
        usuarioId,
      },
      select: { id: true },
    });
    const chave = chaveObjeto(r.data.fonte, carga.id);
    try {
      await garantirBucket(this.minio, this.bucket);
      await this.minio.putObject(this.bucket, chave, arquivo.buffer, arquivo.size);
      await this.prisma.logCarga.update({ where: { id: carga.id }, data: { objeto: chave } });
      await this.fila.add(
        'carga',
        { cargaId: carga.id },
        {
          jobId: `carga-${carga.id}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 10_000 },
          removeOnComplete: 100,
          removeOnFail: 100,
        },
      );
    } catch {
      await this.prisma.logCarga.update({
        where: { id: carga.id },
        data: {
          status: 'FALHOU',
          fimEm: new Date(),
          erro: 'Não foi possível guardar o arquivo ou colocá-lo na fila. Tente de novo; se continuar, avise a CTI.',
        },
      });
      throw new ErroApi(
        HttpStatus.SERVICE_UNAVAILABLE,
        'ARMAZENAMENTO_INDISPONIVEL',
        'Não foi possível receber o arquivo agora. Tente de novo em alguns minutos.',
      );
    }
    return this.obter(carga.id);
  }

  listar() {
    return this.prisma.logCarga.findMany({
      where: { fonte: { in: [...FONTES_UPLOAD, ...FONTES_AGENDADAS] } },
      orderBy: { id: 'desc' },
      take: 20,
      select: SELECAO,
    });
  }

  /** Falhas ainda não resolvidas por uma carga OK da mesma fonte (faixa de alerta da CTI). */
  alertas() {
    return buscarAlertasCarga(this.prisma);
  }

  async obter(id: number) {
    const c = await this.prisma.logCarga.findUnique({ where: { id }, select: SELECAO });
    if (!c) throw new ErroApi(HttpStatus.NOT_FOUND, 'NAO_ENCONTRADO', 'Carga não encontrada.');
    return c;
  }

  async erros(id: number, pagina: number) {
    await this.obter(id);
    const tamanho = 50;
    const [total, itens] = await Promise.all([
      this.prisma.erroCarga.count({ where: { cargaId: id } }),
      this.prisma.erroCarga.findMany({
        where: { cargaId: id },
        orderBy: [{ linha: 'asc' }, { id: 'asc' }],
        skip: (pagina - 1) * tamanho,
        take: tamanho,
        select: { linha: true, campo: true, gravidade: true, mensagem: true },
      }),
    ]);
    return { total, pagina, tamanho, itens };
  }

  async onModuleDestroy(): Promise<void> {
    await this.fila.close();
    this.redis.disconnect();
  }
}
