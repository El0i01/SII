'use client';

import { FiltroPainel, hojeEmPortoVelho } from '@sii/shared';
import { useCallback, useEffect, useState } from 'react';

/** Filtros persistentes do cabeçalho: território (código do setor) e período (AAAA-MM). */
export interface FiltrosGlobais {
  territorio: string | null;
  periodo: string;
}

const EVENTO = 'sii:filtros';

export function lerFiltros(
  busca = typeof window === 'undefined' ? '' : window.location.search,
): FiltrosGlobais {
  const p = new URLSearchParams(busca);
  const r = FiltroPainel.safeParse({
    territorio: p.get('territorio') ?? undefined,
    periodo: p.get('periodo') ?? undefined,
  });
  return {
    territorio: (r.success && r.data.territorio) || null,
    periodo: (r.success && r.data.periodo) || hojeEmPortoVelho().slice(0, 7),
  };
}

/** Grava os filtros na URL atual (mantendo os parâmetros da tela) e avisa quem escuta. */
export function gravarFiltros(f: Partial<FiltrosGlobais>): void {
  const p = new URLSearchParams(window.location.search);
  const atual = lerFiltros();
  const novo = { ...atual, ...f };
  if (novo.territorio) p.set('territorio', novo.territorio);
  else p.delete('territorio');
  if (novo.periodo !== hojeEmPortoVelho().slice(0, 7)) p.set('periodo', novo.periodo);
  else p.delete('periodo');
  const q = p.toString();
  window.history.replaceState(null, '', `${window.location.pathname}${q ? `?${q}` : ''}`);
  window.dispatchEvent(new Event(EVENTO));
}

/** Parâmetros a levar nos links do menu (território e período continuam valendo). */
export function sufixoFiltros(f: FiltrosGlobais): string {
  const p = new URLSearchParams();
  if (f.territorio) p.set('territorio', f.territorio);
  if (f.periodo !== hojeEmPortoVelho().slice(0, 7)) p.set('periodo', f.periodo);
  const q = p.toString();
  return q ? `?${q}` : '';
}

/** Lê e acompanha os filtros (o cabeçalho muda; a tela recarrega). */
export function useFiltrosGlobais(): [FiltrosGlobais | null, (f: Partial<FiltrosGlobais>) => void] {
  const [f, setF] = useState<FiltrosGlobais | null>(null);
  useEffect(() => {
    const atualizar = () => setF(lerFiltros());
    atualizar();
    window.addEventListener(EVENTO, atualizar);
    window.addEventListener('popstate', atualizar);
    return () => {
      window.removeEventListener(EVENTO, atualizar);
      window.removeEventListener('popstate', atualizar);
    };
  }, []);
  return [f, useCallback((novo) => gravarFiltros(novo), [])];
}

/** Grava parâmetros da própria tela (busca, filtro, item aberto) sem perder os globais. */
export function gravarParametrosDaTela(params: Record<string, string | null | undefined>): void {
  const p = new URLSearchParams(window.location.search);
  for (const [k, v] of Object.entries(params)) {
    if (v) p.set(k, v);
    else p.delete(k);
  }
  const q = p.toString();
  window.history.replaceState(null, '', `${window.location.pathname}${q ? `?${q}` : ''}`);
}
