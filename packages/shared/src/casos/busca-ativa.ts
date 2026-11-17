import { z } from 'zod';
import { type DataISO, diasCorridosEntre } from '../calendario/dias';
import type { StatusBuscaAtiva } from '../enums/dominio';
import type { Perfil } from '../enums/perfil';
import { contemCid } from '../schemas/entrada';
import { prazoHoje } from './escalonamento';

/** Faixa da busca ativa (§4.2): 4 a 17 anos. */
export const IDADE_MINIMA_BUSCA_ATIVA = 4;
export const IDADE_MAXIMA_BUSCA_ATIVA = 17;
/**
 * Depois de comunicar o Conselho Tutelar, o job não reabre o caso da mesma criança por este prazo
 * (decisão do P13, ADR 0012): senão o caso que acabou de ir ao CT voltaria no dia seguinte.
 */
export const QUARENTENA_POS_CONSELHO_DIAS = 180;

export interface CandidatoBuscaAtiva {
  idade: number;
  /** Tem domicílio no município. */
  residente: boolean;
  /** Matrícula ATIVA na rede municipal ou estadual. */
  matriculaAtiva: boolean;
  casoAberto: boolean;
  /** Último encaminhamento ao Conselho Tutelar num caso de busca ativa, se houver. */
  ultimoConselhoEm: DataISO | null;
}

/** Gatilho do job (§4.2). */
export function deveAbrirBuscaAtiva(c: CandidatoBuscaAtiva, hoje: DataISO): boolean {
  if (c.idade < IDADE_MINIMA_BUSCA_ATIVA || c.idade > IDADE_MAXIMA_BUSCA_ATIVA) return false;
  if (!c.residente || c.matriculaAtiva || c.casoAberto) return false;
  if (
    c.ultimoConselhoEm &&
    diasCorridosEntre(c.ultimoConselhoEm, hoje) < QUARENTENA_POS_CONSELHO_DIAS
  )
    return false;
  return true;
}

/** Faixa etária gravada na trilha (sem idade exata nem nascimento). */
export function faixaEtariaBuscaAtiva(idade: number): '4-5' | '6-14' | '15-17' {
  return idade < 6 ? '4-5' : idade < 15 ? '6-14' : '15-17';
}

const ORIGENS: [string, string][] = [
  ['CADUNICO', 'CadÚnico'],
  ['ESUS', 'e-SUS'],
  ['CENSO', 'Censo Municipal'],
];

/** Base que revelou a criança fora da escola, pela ordem de preferência do protótipo. */
export function origemDoAlerta(fontes: readonly string[]): string {
  for (const [fonte, rotulo] of ORIGENS) if (fontes.includes(fonte)) return rotulo;
  return 'Outra base';
}
export const ORIGENS_ALERTA = [...ORIGENS.map(([, r]) => r), 'Outra base'] as const;

// ─── Etapas ────────────────────────────────────────────────────────────────────────────────────

export const ACOES_BUSCA_ATIVA = ['ENCAMINHAR', 'VISITA', 'MATRICULAR', 'CONSELHO'] as const;
export type AcaoBuscaAtiva = (typeof ACOES_BUSCA_ATIVA)[number];

/** Secretarias que recebem o caso no encaminhamento. */
export const SECRETARIAS_BUSCA_ATIVA = ['SEMED', 'ASSISTENCIA', 'SEMSAU'] as const;
export type SecretariaBuscaAtiva = (typeof SECRETARIAS_BUSCA_ATIVA)[number];
export const ROTULO_SECRETARIA_BUSCA_ATIVA: Record<string, string> = {
  SEMED: 'SEMED',
  ASSISTENCIA: 'Assistência Social',
  SEMSAU: 'Saúde (ACS)',
};

export const ROTULO_STATUS_BUSCA_ATIVA: Record<StatusBuscaAtiva, string> = {
  IDENTIFICADO: 'Identificado',
  ENCAMINHADO: 'Encaminhado',
  VISITA_REALIZADA: 'Visita realizada',
  MATRICULADO: 'Matriculado',
  NAO_LOCALIZADO: 'Não localizado',
};

export interface Transicao {
  status: StatusBuscaAtiva;
  encerra: boolean;
}

/**
 * Próxima etapa (§4.2): identificado → encaminhado → visita (realizada ou não localizado) →
 * matriculado, ou não localizado → Conselho Tutelar (encerra). Etapa errada → null (409 na API).
 * - A matrícula pode ser registrada em qualquer etapa aberta (a criança pode aparecer matriculada).
 * - Nova visita a quem não foi localizado é permitida.
 */
export function proximaEtapa(
  status: StatusBuscaAtiva,
  acao: AcaoBuscaAtiva,
  localizada = true,
): Transicao | null {
  switch (acao) {
    case 'ENCAMINHAR':
      return status === 'IDENTIFICADO' ? { status: 'ENCAMINHADO', encerra: false } : null;
    case 'VISITA':
      return status === 'ENCAMINHADO' || status === 'NAO_LOCALIZADO'
        ? { status: localizada ? 'VISITA_REALIZADA' : 'NAO_LOCALIZADO', encerra: false }
        : null;
    case 'MATRICULAR':
      return status === 'MATRICULADO' ? null : { status: 'MATRICULADO', encerra: true };
    case 'CONSELHO':
      return status === 'NAO_LOCALIZADO' ? { status: 'NAO_LOCALIZADO', encerra: true } : null;
  }
}

const VISITAM: Record<SecretariaBuscaAtiva, readonly Perfil[]> = {
  SEMED: ['SEMED_GESTOR'],
  ASSISTENCIA: ['CRAS_TECNICO', 'ASSISTENCIA_GESTOR'],
  SEMSAU: ['SAUDE_GESTOR', 'ACS'],
};

/**
 * Quem pode cada ação (decisão de 17/11/2026): CTI e Comitê, tudo; a SEMED encaminha, registra
 * matrícula e comunica o Conselho Tutelar; a visita é da secretaria responsável pelo caso.
 */
export function quemPode(acao: AcaoBuscaAtiva, perfil: Perfil, secretariaDoCaso: string): boolean {
  if (perfil === 'ADMIN_CTI' || perfil === 'COMITE_GESTOR') return true;
  if (acao === 'VISITA') {
    return (VISITAM[secretariaDoCaso as SecretariaBuscaAtiva] ?? []).includes(perfil);
  }
  return perfil === 'SEMED_GESTOR';
}

/** Ações que o usuário pode fazer agora no caso (etapa + perfil). */
export function acoesPermitidas(
  status: StatusBuscaAtiva,
  encerrado: boolean,
  perfil: Perfil,
  secretariaDoCaso: string,
): AcaoBuscaAtiva[] {
  if (encerrado) return [];
  return ACOES_BUSCA_ATIVA.filter(
    (a) => proximaEtapa(status, a) !== null && quemPode(a, perfil, secretariaDoCaso),
  );
}

// ─── Entradas ──────────────────────────────────────────────────────────────────────────────────

export const EncaminharBuscaAtiva = z.object({
  secretaria: z.enum(SECRETARIAS_BUSCA_ATIVA, { error: 'Escolha a secretaria.' }),
});
export type EncaminharBuscaAtiva = z.infer<typeof EncaminharBuscaAtiva>;

export const VisitaBuscaAtiva = z.object({
  localizada: z.boolean({ error: 'Informe se a família foi localizada.' }),
  relato: z
    .string()
    .trim()
    .min(20, 'Conte o que foi visto na visita (20 caracteres ou mais).')
    .max(2000, 'Use no máximo 2000 caracteres.')
    .refine((t) => !contemCid(t), 'Não registre diagnóstico nem código CID.'),
});
export type VisitaBuscaAtiva = z.infer<typeof VisitaBuscaAtiva>;

export const MatriculaBuscaAtiva = z.object({
  inep: z.string().regex(/^\d{8}$/, 'Escolha a escola.'),
});
export type MatriculaBuscaAtiva = z.infer<typeof MatriculaBuscaAtiva>;

// ─── Painel ────────────────────────────────────────────────────────────────────────────────────

export interface CasoPainel {
  status: StatusBuscaAtiva;
  alertaEm: DataISO;
  /** Dia do evento ENCAMINHADO, se houver. */
  encaminhadoEm: DataISO | null;
  origem: string | null;
  encerrado: boolean;
}

export interface ResumoBuscaAtiva {
  identificados: number;
  encaminhados: number;
  visitados: number;
  matriculados: number;
  naoLocalizados: number;
  escalonados: number;
  /** % encaminhados em até 30 dias do alerta, sobre os que já deviam ter sido (null sem base). */
  encaminhadosEm30: number | null;
  porOrigem: Record<string, number>;
}

export const PRAZO_ENCAMINHAR_INDICADOR = 30;

/** KPIs, funil e origem do painel, com as fórmulas do protótipo. */
export function resumoBuscaAtiva(casos: readonly CasoPainel[], hoje: DataISO): ResumoBuscaAtiva {
  const r: ResumoBuscaAtiva = {
    identificados: casos.length,
    encaminhados: 0,
    visitados: 0,
    matriculados: 0,
    naoLocalizados: 0,
    escalonados: 0,
    encaminhadosEm30: null,
    porOrigem: Object.fromEntries(ORIGENS_ALERTA.map((o) => [o, 0])),
  };
  let base = 0;
  let noPrazo = 0;
  for (const c of casos) {
    if (c.status !== 'IDENTIFICADO') r.encaminhados++;
    if (c.status === 'VISITA_REALIZADA' || c.status === 'MATRICULADO') r.visitados++;
    if (c.status === 'MATRICULADO') r.matriculados++;
    if (c.status === 'NAO_LOCALIZADO') r.naoLocalizados++;
    if (!c.encerrado) {
      const p = prazoHoje(
        { tipo: 'BUSCA_ATIVA_ESCOLAR', status: c.status, alertaEm: c.alertaEm },
        hoje,
      );
      if (p?.nivel === 3) r.escalonados++;
    }
    const origem = c.origem && c.origem in r.porOrigem ? c.origem : 'Outra base';
    r.porOrigem[origem] = (r.porOrigem[origem] ?? 0) + 1;
    if (c.encaminhadoEm) {
      base++;
      if (diasCorridosEntre(c.alertaEm, c.encaminhadoEm) <= PRAZO_ENCAMINHAR_INDICADOR) noPrazo++;
    } else if (
      c.status === 'IDENTIFICADO' &&
      diasCorridosEntre(c.alertaEm, hoje) > PRAZO_ENCAMINHAR_INDICADOR
    ) {
      base++;
    }
  }
  r.encaminhadosEm30 = base ? Math.round((noPrazo * 100) / base) : null;
  return r;
}

/** Contagem para o auditor: menor que 5 vira null (exibido "< 5"). Zero continua zero. */
export function suprimirContagem(n: number): number | null {
  return n > 0 && n < 5 ? null : n;
}

/** Linha do CSV da busca ativa: nunca CPF nem nome (só iniciais). */
export interface LinhaCsvBuscaAtiva {
  codigo: string;
  iniciais: string;
  idade: number | null;
  setor: string | null;
  localidade: string | null;
  origem: string | null;
  responsavel: string;
  status: StatusBuscaAtiva;
  dias: number;
  prazo: string;
}

/** Marca de UTF-8: o Excel abre os acentos certo. */
export const BOM_UTF8 = String.fromCharCode(0xfeff);

export function gerarCsv(linhas: readonly (readonly string[])[]): string {
  return linhas.map((l) => l.map((c) => `"${c.replace(/"/g, '""')}"`).join(';')).join('\r\n');
}

export function csvBuscaAtiva(itens: readonly LinhaCsvBuscaAtiva[]): string {
  return gerarCsv([
    [
      'Caso',
      'Criança',
      'Idade',
      'Território',
      'Quadra/Linha',
      'Origem',
      'Responsável',
      'Situação',
      'Dias',
      'Prazo',
    ],
    ...itens.map((i) => [
      i.codigo,
      i.iniciais,
      i.idade === null ? '' : String(i.idade),
      i.setor ?? '',
      i.localidade ?? '',
      i.origem ?? '',
      ROTULO_SECRETARIA_BUSCA_ATIVA[i.responsavel] ?? i.responsavel,
      ROTULO_STATUS_BUSCA_ATIVA[i.status],
      String(i.dias),
      i.prazo,
    ]),
  ]);
}
