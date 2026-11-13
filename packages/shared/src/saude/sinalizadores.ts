import { adicionarDias, type DataISO, ehDataISO } from '../calendario/dias';

/**
 * Sinalizadores de saúde da §3.5, calculados do que o conector lê do e-SUS PEC (P09). Só datas e
 * booleanos: nunca CID, CIAP ou qual condição a pessoa tem.
 *
 * Decisão de 13/11/2026: `vacinacaoEmDia`, `preNatalAdequado` e
 * `necessitaAtendimentoEspecializado` ficam sem valor até a Saúde definir a regra (§9).
 */

/** Último cadastro individual do cidadão no PEC. */
export interface CadastroPec {
  cnes: string | null;
  /** Número da microárea no PEC (ex.: "04"). */
  microarea: string | null;
  acs: string | null;
  gestante: boolean;
  acamado: boolean;
  domiciliado: boolean;
  /** Alguma condição crônica marcada (o PEC já devolve só o booleano). */
  cronico: boolean;
}

export interface DadosSaudePec {
  nascimento: DataISO | null;
  cadastro: CadastroPec | null;
  /** Microárea já convertida para a área do Geoportal (`converterMicroarea`). */
  microareaSii: string | null;
  ultimaVisita: DataISO | null;
  ultimoAtendimento: DataISO | null;
  ultimaVacinaGripe: DataISO | null;
}

export interface SinalizadoresSaude {
  ubsCnes: string | null;
  microarea: string | null;
  acsResponsavel: string | null;
  ultimaVisitaAcs: DataISO | null;
  vacinacaoEmDia: boolean | null;
  vacinaGripeEmDia: boolean | null;
  preNatalAdequado: boolean | null;
  acamadoDomiciliado: boolean | null;
  condicaoCronica: boolean | null;
  condicaoCronicaAcompanhada: boolean | null;
  necessitaAtendimentoEspecializado: boolean | null;
}

/** Janela do acompanhamento da condição crônica (consulta no semestre, §4.4). */
export const DIAS_CRONICO_ACOMPANHADO = 180;
/** Janela da vacina da gripe (uma dose por ano). */
export const DIAS_VACINA_GRIPE = 365;
export const IDADE_IDOSO = 60;

/** `co_dim_tempo` do PEC (AAAAMMDD) → data. Valor inválido ou 0 → null. */
export function diaDeTempo(tempo: number | null): DataISO | null {
  if (!tempo) return null;
  const s = String(tempo);
  const data = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return s.length === 8 && ehDataISO(data) ? data : null;
}

export function tempoDeDia(dia: DataISO): number {
  return Number(dia.replace(/-/g, ''));
}

export function idadeEm(nascimento: DataISO, hoje: DataISO): number {
  const anos = Number(hoje.slice(0, 4)) - Number(nascimento.slice(0, 4));
  return hoje.slice(5) >= nascimento.slice(5) ? anos : anos - 1;
}

/** Microárea do PEC (CNES da UBS + número) → nome da área no Geoportal, pela tabela da CTI. */
export function converterMicroarea(
  cnes: string | null,
  numero: string | null,
  mapa: Readonly<Record<string, string>>,
): string | null {
  const n = numero?.trim();
  if (!cnes || !n) return null;
  return mapa[`${cnes}/${n.padStart(2, '0')}`] ?? null;
}

export function calcularSinalizadores(d: DadosSaudePec, hoje: DataISO): SinalizadoresSaude {
  const c = d.cadastro;
  const cronico = c ? c.cronico : null;
  let acompanhada: boolean | null = null;
  if (cronico)
    acompanhada =
      d.ultimoAtendimento !== null &&
      d.ultimoAtendimento >= adicionarDias(hoje, -DIAS_CRONICO_ACOMPANHADO);
  let gripe: boolean | null = null;
  if (d.nascimento && idadeEm(d.nascimento, hoje) >= IDADE_IDOSO)
    gripe =
      d.ultimaVacinaGripe !== null &&
      d.ultimaVacinaGripe >= adicionarDias(hoje, -DIAS_VACINA_GRIPE);
  return {
    ubsCnes: c?.cnes ?? null,
    microarea: d.microareaSii ?? c?.microarea ?? null,
    acsResponsavel: c?.acs ?? null,
    ultimaVisitaAcs: d.ultimaVisita,
    vacinacaoEmDia: null,
    vacinaGripeEmDia: gripe,
    preNatalAdequado: null,
    acamadoDomiciliado: c ? c.acamado || c.domiciliado : null,
    condicaoCronica: cronico,
    condicaoCronicaAcompanhada: acompanhada,
    necessitaAtendimentoEspecializado: null,
  };
}
