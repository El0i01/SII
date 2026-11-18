import { z } from 'zod';

/** Tipos de caso da v1 (§3.7). */
export const TIPOS_CASO = [
  'BUSCA_ATIVA_ESCOLAR',
  'INFREQUENCIA',
  'PRIMEIRA_INFANCIA_SEM_CUIDADO',
  'INCLUSAO_SEM_ATENDIMENTO',
  'IDOSO_SEM_VISITA',
] as const;
export const TipoCaso = z.enum(TIPOS_CASO);
export type TipoCaso = z.infer<typeof TipoCaso>;

/** Etapas da busca ativa escolar (§4.2). */
export const STATUS_BUSCA_ATIVA = [
  'IDENTIFICADO',
  'ENCAMINHADO',
  'VISITA_REALIZADA',
  'MATRICULADO',
  'NAO_LOCALIZADO',
] as const;
export const StatusBuscaAtiva = z.enum(STATUS_BUSCA_ATIVA);
export type StatusBuscaAtiva = z.infer<typeof StatusBuscaAtiva>;

/** Situação da notificação ao CRAS (§3.7). */
export const STATUS_NOTIFICACAO = ['NOVA', 'EM_ANALISE', 'PARECER_EMITIDO'] as const;
export const StatusNotificacao = z.enum(STATUS_NOTIFICACAO);
export type StatusNotificacao = z.infer<typeof StatusNotificacao>;

/** Desfechos do parecer da Assistência (§3.7), com o texto do protótipo. */
export const DESFECHOS = [
  'RETORNO_ESCOLA_COMBINADO',
  'ENCAMINHADO_SEMED_TRANSPORTE',
  'AUSENCIA_JUSTIFICADA_SAUDE',
  'ENCAMINHADO_CREAS',
  'ENCAMINHADO_CONSELHO_TUTELAR',
  'FAMILIA_NAO_LOCALIZADA',
] as const;
export const Desfecho = z.enum(DESFECHOS);
export type Desfecho = z.infer<typeof Desfecho>;
export const ROTULO_DESFECHO: Record<Desfecho, string> = {
  RETORNO_ESCOLA_COMBINADO: 'Retorno à escola combinado',
  ENCAMINHADO_SEMED_TRANSPORTE: 'Encaminhado à SEMED (transporte)',
  AUSENCIA_JUSTIFICADA_SAUDE: 'Ausência justificada (saúde)',
  ENCAMINHADO_CREAS: 'Encaminhado ao CREAS',
  ENCAMINHADO_CONSELHO_TUTELAR: 'Encaminhado ao Conselho Tutelar',
  FAMILIA_NAO_LOCALIZADA: 'Família não localizada',
};

/** Situação do lote (§3.1). */
export const SITUACOES_LOTE = [
  'REGULAR',
  'SEM_INSCRICAO',
  'REURB_EM_ANALISE',
  'TITULADO',
  'VAZIO',
] as const;
export const SituacaoLote = z.enum(SITUACOES_LOTE);
export type SituacaoLote = z.infer<typeof SituacaoLote>;
export const ROTULO_SITUACAO_LOTE: Record<SituacaoLote, string> = {
  REGULAR: 'Regular',
  SEM_INSCRICAO: 'Sem inscrição',
  REURB_EM_ANALISE: 'Reurb em análise',
  TITULADO: 'Titulado',
  VAZIO: 'Vazio',
};

/** Fontes de vínculo da pessoa (§3.3). */
export const FONTES_VINCULO = [
  'ESUS',
  'CADUNICO',
  'GESTAO_ESCOLAR',
  'CENSO',
  'SEDUC',
  'SINASC',
] as const;
export const FonteVinculo = z.enum(FONTES_VINCULO);
export type FonteVinculo = z.infer<typeof FonteVinculo>;

/** Fontes de carga do worker (§5). */
export const FONTES_CARGA = [
  'ESUS_PEC',
  'CADUNICO',
  'SICON',
  'PRESENCA',
  'PBF_SAUDE',
  'GESTAO_ESCOLAR',
  'SEDUC',
  'SINASC',
  'CADASTRO_IMOBILIARIO',
  'PROTOCOLO',
  'PORTAL_TRANSPARENCIA',
  'GEOPORTAL',
  'DESPESA',
] as const;
export const FonteCarga = z.enum(FONTES_CARGA);
export type FonteCarga = z.infer<typeof FonteCarga>;

/** As fontes que chegam por arquivo enviado na tela de upload (§5). As outras são lidas direto. */
export const FONTES_UPLOAD = [
  'CADUNICO',
  'SICON',
  'PRESENCA',
  'PBF_SAUDE',
  'GESTAO_ESCOLAR',
  'SEDUC',
  'SINASC',
  'DESPESA',
] as const satisfies readonly FonteCarga[];
export const FonteUpload = z.enum(FONTES_UPLOAD);
export type FonteUpload = z.infer<typeof FonteUpload>;

/** Quem faz a visita de campo (§6). */
export const TIPOS_VISITA = ['ACS', 'CRAS', 'CRIANCA_FELIZ', 'BUSCA_ATIVA'] as const;
export const TipoVisita = z.enum(TIPOS_VISITA);
export type TipoVisita = z.infer<typeof TipoVisita>;

/** Secretarias e órgão de destino de encaminhamentos. */
export const SECRETARIAS = [
  'SEMED',
  'SEMSAU',
  'ASSISTENCIA',
  'SEMFAZ',
  'CONSELHO_TUTELAR',
] as const;
export const Secretaria = z.enum(SECRETARIAS);
export type Secretaria = z.infer<typeof Secretaria>;
