import { z } from 'zod';
import { type Perfil, perfilVeDadoNominal } from '../enums/perfil';

/**
 * Seções da ficha da criança (§3.8). A API só põe no JSON as seções que o perfil pode ver: a chave
 * fica **ausente**, nunca `null`. Decisão de 17/11/2026: todo perfil nominal vê todas as seções, como
 * no protótipo (só sinalizadores; laudo e CID nunca entram). Para recortar no futuro, mude só aqui.
 */
export const SECOES_FICHA = [
  'EDUCACAO',
  'SAUDE',
  'ASSISTENCIA',
  'PROTECAO',
  'HISTORICO',
  'VISITAS',
] as const;
export type SecaoFicha = (typeof SECOES_FICHA)[number];

const SECOES_POR_PERFIL: Partial<Record<Perfil, readonly SecaoFicha[]>> = {};

export function secoesDaFicha(perfil: Perfil): readonly SecaoFicha[] {
  if (!perfilVeDadoNominal(perfil)) return [];
  return SECOES_POR_PERFIL[perfil] ?? SECOES_FICHA;
}

/** Código legível da ficha (como no protótipo, `CI-10237`): é o id da pessoa. */
export function codigoFicha(pessoaId: number): string {
  return `CI-${pessoaId}`;
}

/** Filtros da lista de fichas ("Mostrar"), com o texto do protótipo. */
export const FILTROS_FICHA = ['todas', 'visita', 'notificacao', '0a3', 'aee'] as const;
export const FiltroFicha = z.enum(FILTROS_FICHA);
export type FiltroFicha = z.infer<typeof FiltroFicha>;
export const ROTULO_FILTRO_FICHA: Record<FiltroFicha, string> = {
  todas: 'Todas',
  visita: 'Precisam de visita',
  notificacao: 'Com notificação',
  '0a3': '0 a 3 anos',
  aee: 'Educação especial',
};

export const ConsultaFichas = z.object({
  busca: z.string().trim().max(60).optional(),
  /** Código do setor (filtro de território do cabeçalho). */
  territorio: z
    .string()
    .regex(/^[A-Z0-9]{2,10}$/)
    .optional(),
  filtro: FiltroFicha.default('todas'),
});
export type ConsultaFichas = z.infer<typeof ConsultaFichas>;

/** O mínimo de uma linha da lista para filtrar, buscar e ordenar. */
export interface ResumoFicha {
  codigo: string;
  iniciais: string;
  idade: number;
  localidade: string | null;
  escola: string | null;
  motivos: number;
  notificacaoAberta: boolean;
  necessitaAee: boolean;
}

export function atendeFiltro(f: ResumoFicha, filtro: FiltroFicha): boolean {
  switch (filtro) {
    case 'visita':
      return f.motivos > 0;
    case 'notificacao':
      return f.notificacaoAberta;
    case '0a3':
      return f.idade <= 3;
    case 'aee':
      return f.necessitaAee;
    default:
      return true;
  }
}

/** Busca por código, iniciais, quadra ou escola. Nunca por nome (a lista não carrega nome). */
export function atendeBusca(f: ResumoFicha, busca: string | undefined): boolean {
  const q = (busca ?? '').trim().toLowerCase();
  if (!q) return true;
  return [f.codigo, f.iniciais, f.localidade ?? '', f.escola ?? '']
    .join(' ')
    .toLowerCase()
    .includes(q);
}

/** Ordem da lista: necessidade de acompanhamento (motivos × 10 + notificação aberta × 5). */
export function prioridadeFicha(f: Pick<ResumoFicha, 'motivos' | 'notificacaoAberta'>): number {
  return f.motivos * 10 + (f.notificacaoAberta ? 5 : 0);
}

/** Item da linha do tempo da ficha: eventos das fontes e da trilha dos casos. */
export interface EventoFicha {
  /** AAAA-MM-DD ou ISO completo. */
  quando: string;
  texto: string;
  /** Secretaria ou origem ("SEMED", "Saúde", "Assistência Social", "Sistema"…). */
  origem: string;
  detalhe?: string;
}

/** Do mais recente ao mais antigo; empate mantém a ordem de entrada. */
export function montarLinhaDoTempo(...listas: EventoFicha[][]): EventoFicha[] {
  return listas
    .flat()
    .map((e, i) => ({ e, i }))
    .sort((a, b) => b.e.quando.slice(0, 10).localeCompare(a.e.quando.slice(0, 10)) || a.i - b.i)
    .map(({ e }) => e);
}

/** Rótulo dos eventos da trilha do caso na ficha. */
export const ROTULO_EVENTO_CASO: Record<string, string> = {
  ALERTA_GERADO: 'Alerta gerado',
  ENCAMINHADO: 'Caso encaminhado',
  NOTIFICACAO_ENVIADA: 'Notificação enviada ao CRAS',
  EM_ANALISE: 'Notificação em análise no CRAS',
  VISITA_REALIZADA: 'Visita realizada',
  PARECER_EMITIDO: 'Parecer da Assistência emitido',
  ENCAMINHADO_CONSELHO_TUTELAR: 'Encaminhada ao Conselho Tutelar',
  DESFECHO: 'Desfecho registrado',
};

/** Quem registrou a visita, pelo tipo (o relatório nunca leva o nome do servidor). */
export const ROTULO_AUTOR_VISITA: Record<string, string> = {
  ACS: 'ACS · Saúde',
  CRAS: 'Técnico(a) do CRAS',
  CRIANCA_FELIZ: 'Visitador(a) do Criança Feliz',
  BUSCA_ATIVA: 'Busca ativa · SEMED',
};
