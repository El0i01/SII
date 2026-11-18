import { suprimirContagem } from '../casos/busca-ativa';

/**
 * Contagens dos painéis de ciclos de vida (P19): o município e cada setor, por critério. Só números;
 * a versão do auditor suprime de 1 a 4.
 */
export type Contagens<K extends string> = Record<K, number | null>;

export interface ContagemPorSetor<K extends string> {
  total: Contagens<K>;
  porSetor: { setor: string; valores: Contagens<K> }[];
}

export function contarPor<T, K extends string>(
  itens: readonly T[],
  setorDe: (x: T) => string | null,
  criterios: Record<K, (x: T) => boolean>,
  setores: readonly string[] = [],
): ContagemPorSetor<K> {
  const chaves = Object.keys(criterios) as K[];
  const zero = () => Object.fromEntries(chaves.map((k) => [k, 0])) as Record<K, number>;
  const total = zero();
  const mapa = new Map<string, Record<K, number>>(setores.map((s) => [s, zero()]));
  for (const x of itens) {
    const s = setorDe(x);
    let doSetor: Record<K, number> | undefined;
    if (s) {
      doSetor = mapa.get(s) ?? zero();
      mapa.set(s, doSetor);
    }
    for (const k of chaves)
      if (criterios[k](x)) {
        total[k]++;
        if (doSetor) doSetor[k]++;
      }
  }
  return {
    total,
    porSetor: [...mapa.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([setor, valores]) => ({ setor, valores })),
  };
}

/** Versão agregada (auditor): contagens de 1 a 4 viram `null` ("< 5"). */
export function suprimirContagens<K extends string>(c: ContagemPorSetor<K>): ContagemPorSetor<K> {
  const s = (v: Contagens<K>) =>
    Object.fromEntries(
      Object.entries(v).map(([k, n]) => [k, n === null ? null : suprimirContagem(n as number)]),
    ) as Contagens<K>;
  return {
    total: s(c.total),
    porSetor: c.porSetor.map((p) => ({ setor: p.setor, valores: s(p.valores) })),
  };
}

/** Percentual com contagens possivelmente suprimidas: sem número, sem percentual. */
export function pctContagem(parte: number | null, total: number | null): number | null {
  if (parte === null || total === null || total === 0) return null;
  return Math.round((parte * 1000) / total) / 10;
}
