import { z } from 'zod';
import { ehDataISO } from '../calendario/dias';
import { Desfecho, FonteUpload, Secretaria, TipoCaso, TipoVisita } from '../enums/dominio';

/**
 * Diagnóstico não entra na base integrada (CLAUDE.md). Recusa código CID-10 no texto livre:
 * formato com ponto (F32.1) ou precedido de "CID". Não pega "B40" de "Linha B40" (endereço rural).
 */
const PADRAO_CID = /\b[A-Z]\d{2}\.\d\b|\bCID\s*[-:]?\s*(?:10\s*[-:]?\s*)?[A-Z]\d{2}/i;
export function contemCid(texto: string): boolean {
  return PADRAO_CID.test(texto);
}
const MENSAGEM_CID = 'Não registre diagnóstico nem código CID. Descreva a situação encontrada.';

const textoLivre = (min: number, max: number, mensagemMin: string) =>
  z
    .string()
    .trim()
    .min(min, mensagemMin)
    .max(max, `Use no máximo ${max} caracteres.`)
    .refine((t) => !contemCid(t), MENSAGEM_CID);

const dataISO = z.string().refine(ehDataISO, 'Data inválida (use AAAA-MM-DD).');

/** Parecer da Assistência sobre uma notificação (§3.7). */
export const Parecer = z
  .object({
    desfecho: Desfecho,
    texto: textoLivre(30, 4000, 'Escreva pelo menos 30 caracteres.'),
    novaVisita: z.boolean().default(false),
    dataNovaVisita: dataISO.optional(),
  })
  .superRefine((p, ctx) => {
    if (p.novaVisita && !p.dataNovaVisita) {
      ctx.addIssue({
        code: 'custom',
        path: ['dataNovaVisita'],
        message: 'Informe a data da nova visita.',
      });
    }
  });
export type Parecer = z.infer<typeof Parecer>;

// Caixa que contém Rondônia (com folga): pega GPS trocado ou zerado.
const RO = { lat: [-13.8, -7.8], lon: [-66.9, -59.7] } as const;

/** Ponto GPS dentro de Rondônia, com a precisão do aparelho (visita e confirmação do pino). */
export const PontoGps = z.object({
  latitude: z
    .number()
    .min(RO.lat[0], 'Ponto fora de Rondônia.')
    .max(RO.lat[1], 'Ponto fora de Rondônia.'),
  longitude: z
    .number()
    .min(RO.lon[0], 'Ponto fora de Rondônia.')
    .max(RO.lon[1], 'Ponto fora de Rondônia.'),
  precisaoM: z.number().positive().max(10_000),
});

/** Visita de campo registrada no app, inclusive offline (§6.5). */
export const Visita = z
  .object({
    /** Chave de idempotência gerada no aparelho: reenviar não duplica. */
    idLocal: z.uuid('Identificador local inválido.'),
    tipo: TipoVisita,
    pessoaIds: z.array(z.number().int().positive()).min(1, 'Informe quem foi atendido.').max(20),
    realizadaEm: z.iso.datetime({ offset: true, message: 'Data e hora inválidas.' }),
    situacao: textoLivre(10, 2000, 'Descreva a situação encontrada (10 caracteres ou mais).'),
    encaminhamentos: z
      .array(
        z.object({ destino: Secretaria, motivo: textoLivre(5, 500, 'Explique o encaminhamento.') }),
      )
      .max(10)
      .default([]),
    ponto: PontoGps.optional(),
    pinoConfirmado: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    if (v.pinoConfirmado && !v.ponto) {
      ctx.addIssue({
        code: 'custom',
        path: ['ponto'],
        message: 'Para confirmar o pino, capture o ponto.',
      });
    }
  });
export type Visita = z.infer<typeof Visita>;

/** Encaminhamento manual de um caso a partir da ficha. */
export const Encaminhamento = z.object({
  pessoaId: z.number().int().positive('Pessoa inválida.'),
  tipoCaso: TipoCaso,
  destino: Secretaria,
  motivo: textoLivre(10, 2000, 'Explique o motivo (10 caracteres ou mais).'),
});
export type Encaminhamento = z.infer<typeof Encaminhamento>;

export const TAMANHO_MAXIMO_CARGA = 100 * 1024 * 1024;

/** Envio de arquivo de carga pela tela de upload (§5). */
export const UploadCarga = z
  .object({
    fonte: FonteUpload,
    mesReferencia: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mês de referência inválido (AAAA-MM).'),
    nomeArquivo: z
      .string()
      .trim()
      .max(200)
      .regex(/\.(csv|xlsx)$/i, 'Envie um arquivo .csv ou .xlsx.'),
    tamanhoBytes: z
      .number()
      .int()
      .positive('O arquivo está vazio.')
      .max(TAMANHO_MAXIMO_CARGA, 'O arquivo passa de 100 MB.'),
  })
  // O CECAD e o Portal de Gestão exportam CSV; planilha do Excel muda datas e tira zeros do NIS.
  .refine((d) => d.fonte !== 'CADUNICO' || !/\.xlsx$/i.test(d.nomeArquivo), {
    path: ['nomeArquivo'],
    message: 'Para o CadÚnico, envie o arquivo .csv exportado do CECAD ou do Portal de Gestão.',
  })
  // As cargas da Educação (P10) também leem CSV.
  .refine(
    (d) => !['GESTAO_ESCOLAR', 'SEDUC'].includes(d.fonte) || !/\.xlsx$/i.test(d.nomeArquivo),
    {
      path: ['nomeArquivo'],
      message: 'Envie o arquivo .csv exportado do sistema (não a planilha do Excel).',
    },
  );
export type UploadCarga = z.infer<typeof UploadCarga>;

export type PontoGps = z.infer<typeof PontoGps>;
