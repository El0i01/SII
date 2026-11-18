import type { DataISO } from '../calendario/dias';
import { rotuloMesCurto } from '../painel/visao-geral';
import {
  type CodigoIndicador,
  INDICADORES,
  ROTULO_SITUACAO_INDICADOR,
  type SituacaoIndicador,
  situacaoIndicador,
  unidadeIndicador,
} from './indicadores';

/**
 * Linha do painel "Controle externo" e do relatório semestral (P16): linha de base, valor atual e
 * meta, já em texto, com a situação. Uma regra só para a tela, o PDF e o XLSX.
 */

export interface SnapshotLido {
  periodo: string;
  numerador: number | null;
  denominador: number | null;
  valor: number | null;
  suprimido: boolean;
}

export interface MetaLida {
  linhaBase: number | null;
  dataBase: DataISO | null;
  meta: number;
  metaTexto: string | null;
  prazo: DataISO | null;
  versao: number;
}

export interface LinhaIndicador {
  codigo: CodigoIndicador;
  objetivo: string;
  eixo: string;
  nome: string;
  linhaBase: string;
  atual: string;
  meta: string;
  situacao: SituacaoIndicador;
  rotuloSituacao: string;
  /** Números crus, para o XLSX e para quem quiser recalcular. */
  valores: {
    linhaBase: number | null;
    atual: number | null;
    meta: number | null;
    periodo: string | null;
    numerador: number | null;
    denominador: number | null;
    suprimido: boolean;
  };
}

const pct = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

/** "nov/25" a partir de AAAA-MM ou AAAA-MM-DD; "2ª vigência de 2026" a partir de AAAA-V2. */
export function rotuloPeriodo(p: string): string {
  const v = /^(\d{4})-V([12])$/.exec(p);
  if (v) return `${v[2]}ª vigência de ${v[1]}`;
  return rotuloMesCurto(p.slice(0, 7));
}

/** Texto do valor: "78,9%", "1 de 1", "< 5" (suprimido) ou "—" (sem dado). */
export function textoValor(
  codigo: CodigoIndicador,
  s: Pick<SnapshotLido, 'valor' | 'denominador' | 'suprimido'> | null,
): string {
  if (!s) return '—';
  if (s.suprimido) return '< 5';
  if (s.valor === null) return '—';
  return unidadeIndicador(codigo) === 'contagem'
    ? `${s.valor} de ${s.denominador ?? 0}`
    : pct(s.valor);
}

export function montarLinhaIndicador(
  codigo: CodigoIndicador,
  atual: SnapshotLido | null,
  primeiro: SnapshotLido | null,
  meta: MetaLida | null,
  hoje: DataISO,
): LinhaIndicador {
  const def = INDICADORES.find((i) => i.codigo === codigo) as (typeof INDICADORES)[number];
  const contagem = unidadeIndicador(codigo) === 'contagem';
  // Linha de base: a cadastrada; sem ela, o primeiro snapshot (quando é outro período que o atual).
  const base =
    meta?.linhaBase !== null && meta?.linhaBase !== undefined
      ? { valor: meta.linhaBase, rotulo: meta.dataBase ? rotuloPeriodo(meta.dataBase) : null }
      : primeiro && atual && primeiro.periodo !== atual.periodo && primeiro.valor !== null
        ? { valor: primeiro.valor, rotulo: rotuloPeriodo(primeiro.periodo) }
        : null;
  const textoBase = base
    ? `${contagem ? base.valor.toLocaleString('pt-BR') : pct(base.valor)}${base.rotulo ? ` (${base.rotulo})` : ''}`
    : '—';
  const textoMeta = meta
    ? (meta.metaTexto ?? (contagem ? String(meta.meta) : pct(meta.meta)))
    : '—';
  // OE5 compara entregues com devidos; os outros, o valor com a meta.
  const valorAtual =
    contagem && atual && !atual.suprimido && atual.denominador
      ? ((atual.numerador ?? 0) * 100) / atual.denominador
      : (atual?.valor ?? null);
  const situacao =
    contagem && atual && atual.denominador === 0
      ? 'EM_DIA'
      : situacaoIndicador({
          atual: valorAtual,
          meta: meta ? (contagem ? 100 : meta.meta) : null,
          base: contagem ? null : (base?.valor ?? null),
          dataBase: meta?.dataBase ?? null,
          prazo: meta?.prazo ?? null,
          hoje,
        });
  return {
    codigo,
    objetivo: def.objetivo,
    eixo: def.eixo,
    nome: def.nome,
    linhaBase: textoBase,
    atual: textoValor(codigo, atual),
    meta: textoMeta,
    situacao,
    rotuloSituacao: ROTULO_SITUACAO_INDICADOR[situacao],
    valores: {
      linhaBase: base?.valor ?? null,
      atual: atual?.valor ?? null,
      meta: meta?.meta ?? null,
      periodo: atual?.periodo ?? null,
      numerador: atual?.numerador ?? null,
      denominador: atual?.denominador ?? null,
      suprimido: atual?.suprimido ?? false,
    },
  };
}
