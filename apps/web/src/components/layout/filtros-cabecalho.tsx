'use client';

import { hojeEmPortoVelho, periodosDisponiveis, rotuloMes } from '@sii/shared';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useFiltrosGlobais } from '@/lib/filtros-url';

const CAMPO =
  'min-h-[var(--spacing-alvo)] w-full rounded-md border border-borda bg-fundo px-3 text-texto-forte';

/** Território e período do cabeçalho: persistem na URL e valem para os painéis. */
export function FiltrosCabecalho() {
  const [f, gravar] = useFiltrosGlobais();
  const [setores, setSetores] = useState<{ codigo: string; nome: string }[]>([]);
  useEffect(() => {
    api<{ codigo: string; nome: string }[]>('/territorio/setores')
      .then(setSetores)
      .catch(() => setSetores([]));
  }, []);
  if (!f) return null;
  return (
    <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2 sm:flex sm:items-end">
      <div className="flex flex-col gap-1">
        <label htmlFor="filtro-territorio" className="text-sm font-semibold text-texto-forte">
          Território
        </label>
        <select
          id="filtro-territorio"
          value={f.territorio ?? ''}
          onChange={(e) => gravar({ territorio: e.target.value || null })}
          className={CAMPO}
        >
          <option value="">Todo o município</option>
          {setores.map((s) => (
            <option key={s.codigo} value={s.codigo}>
              {s.nome}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="filtro-periodo" className="text-sm font-semibold text-texto-forte">
          Período
        </label>
        <select
          id="filtro-periodo"
          value={f.periodo}
          onChange={(e) => gravar({ periodo: e.target.value })}
          className={CAMPO}
        >
          {periodosDisponiveis(hojeEmPortoVelho()).map((m) => (
            <option key={m} value={m}>
              {rotuloMes(m)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
