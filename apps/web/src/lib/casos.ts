import type { Desfecho, StatusNotificacao } from '@sii/shared';

/** Tipos das respostas da API de casos (P11) e rótulos de tela. */
export interface PrazoApi {
  restante: number | null;
  nivel: number;
  rotulo: string;
  tom: 'neutro' | 'ok' | 'alerta' | 'critico';
}

export interface NotificacaoResumo {
  codigo: string;
  caso: string;
  status: StatusNotificacao;
  motivo: string;
  criadaEm: string;
  prazoEm: string;
  prazo: PrazoApi | null;
  crianca: { iniciais: string; idade: number | null };
  escola: { inep: string; nome: string | null } | null;
  territorio: { setor: string | null; localidade: string | null };
  desfecho: Desfecho | null;
}

export interface CaixaNotificacoes {
  contagens: { novas: number; emAnalise: number; pareceres: number; foraDoPrazo: number };
  podeResponder: boolean;
  notificacoes: NotificacaoResumo[];
}

export interface NotificacaoDetalhe extends NotificacaoResumo {
  podeResponder: boolean;
  casoEncerrado: boolean;
  parecer: {
    desfecho: Desfecho;
    rotuloDesfecho: string;
    texto: string;
    novaVisita: boolean;
    dataNovaVisita: string | null;
    emitidoEm: string;
    autor: string;
  } | null;
  trilha: {
    eventos: { seq: number; tipo: string; ocorridoEm: string; desfecho: string | null }[];
    verificador: string | null;
  };
}

export const ROTULO_STATUS_NOTIFICACAO: Record<StatusNotificacao, string> = {
  NOVA: 'Nova',
  EM_ANALISE: 'Em análise',
  PARECER_EMITIDO: 'Parecer emitido',
};

export const ROTULO_EVENTO: Record<string, string> = {
  ALERTA_GERADO: 'Alerta gerado pela frequência',
  ENCAMINHADO: 'Caso encaminhado',
  NOTIFICACAO_ENVIADA: 'Notificação enviada ao CRAS',
  EM_ANALISE: 'Em análise pelo CRAS',
  VISITA_REALIZADA: 'Visita realizada',
  PARECER_EMITIDO: 'Parecer emitido',
  ENCAMINHADO_CONSELHO_TUTELAR: 'Encaminhado ao Conselho Tutelar',
  DESFECHO: 'Desfecho registrado',
};

export const ROTULO_TIPO_CASO: Record<string, string> = {
  BUSCA_ATIVA_ESCOLAR: 'Busca ativa escolar',
  INFREQUENCIA: 'Infrequência',
  PRIMEIRA_INFANCIA_SEM_CUIDADO: 'Primeira infância sem cuidado',
  INCLUSAO_SEM_ATENDIMENTO: 'Inclusão sem atendimento',
  IDOSO_SEM_VISITA: 'Pessoa idosa sem visita',
};

export const dataBr = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString('pt-BR', {
    timeZone: 'America/Porto_Velho',
  });
