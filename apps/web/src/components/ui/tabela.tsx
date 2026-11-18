'use client';

import { BOM_UTF8 } from '@sii/shared';
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, Download } from 'lucide-react';
import { type ReactNode, useEffect, useId, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { Botao } from './button';
import { Vazio } from './estado';

/** Coluna da tabela: TanStack + alinhamento numérico. */
export type Coluna<T> = ColumnDef<T, unknown> & { numerica?: boolean };

export interface PropsTabela<T> {
  dados: T[];
  colunas: Coluna<T>[];
  /** Legenda da tabela (lida pelos leitores de tela). */
  legenda: string;
  /** Legenda visível? Padrão: só para leitor de tela. */
  legendaVisivel?: boolean;
  /** Busca de texto; a tela diz em que campos procurar. */
  busca?: { rotulo: string; placeholder?: string; atende: (linha: T, q: string) => boolean };
  /** Filtros da tela (selects), ao lado da busca. */
  filtros?: ReactNode;
  porPagina?: number;
  ordemInicial?: SortingState;
  /** Exportação CSV: a tela gera o texto (nunca com CPF). */
  exportar?: { arquivo: string; gerar: (linhas: T[]) => string };
  vazio?: { titulo: string; texto?: string; acao?: ReactNode };
  /** Destaque da linha (ex.: a aberta no detalhe). */
  destacar?: (linha: T) => boolean;
  idLinha?: (linha: T) => string;
  /** Mostra "N registros" quando cabe tudo numa página. Padrão: sim. */
  contagem?: boolean;
  /** Letra menor e menos espaço, para tabelas com muitas colunas. */
  densa?: boolean;
}

/**
 * Tabela dos painéis (CLAUDE.md): busca, ordenação por coluna (`aria-sort`, botão no cabeçalho),
 * paginação e exportação CSV. Rola dentro do próprio contêiner em telas estreitas.
 */
export function Tabela<T>({
  dados,
  colunas,
  legenda,
  legendaVisivel,
  busca,
  filtros,
  porPagina = 10,
  ordemInicial = [],
  exportar,
  vazio,
  destacar,
  idLinha,
  contagem = true,
  densa = false,
}: PropsTabela<T>) {
  const idBusca = useId();
  const [q, setQ] = useState('');
  const [ordem, setOrdem] = useState<SortingState>(ordemInicial);
  const filtrados = useMemo(
    () =>
      busca && q.trim() ? dados.filter((d) => busca.atende(d, q.trim().toLowerCase())) : dados,
    [dados, busca, q],
  );
  const tabela = useReactTable({
    data: filtrados,
    columns: colunas,
    state: { sorting: ordem },
    onSortingChange: setOrdem,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: porPagina } },
    ...(idLinha ? { getRowId: idLinha } : {}),
    autoResetPageIndex: false,
    // Primeiro clique sempre em ordem crescente (o TanStack começa decrescente em números).
    sortDescFirst: false,
  });
  // Filtro novo volta para a primeira página.
  useEffect(() => tabela.setPageIndex(0), [q, dados.length, tabela]);

  const { pageIndex, pageSize } = tabela.getState().pagination;
  const total = filtrados.length;

  function baixar() {
    if (!exportar) return;
    const linhas = tabela.getSortedRowModel().rows.map((r) => r.original);
    const blob = new Blob([BOM_UTF8 + exportar.gerar(linhas)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = exportar.arquivo;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {(busca || filtros || exportar) && (
        <div className="flex flex-wrap items-end gap-3">
          {busca && (
            <div className="flex min-w-0 grow flex-col gap-1">
              <label htmlFor={idBusca} className="font-semibold text-texto-forte">
                {busca.rotulo}
              </label>
              <input
                id={idBusca}
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={busca.placeholder}
                className="min-h-[var(--spacing-alvo)] w-full rounded-md border border-borda bg-fundo px-3 text-texto-forte"
              />
            </div>
          )}
          {filtros}
          {exportar && (
            <Botao variante="contorno" onClick={baixar} disabled={total === 0}>
              <Download aria-hidden="true" className="h-4 w-4" /> Baixar CSV
            </Botao>
          )}
        </div>
      )}

      {total === 0 ? (
        <Vazio titulo={vazio?.titulo ?? 'Nada para mostrar'} acao={vazio?.acao}>
          {vazio?.texto}
        </Vazio>
      ) : (
        <>
          <div
            className="max-w-full overflow-x-auto"
            tabIndex={0}
            aria-label={`${legenda} (role para o lado em telas pequenas)`}
          >
            <table className={cn('w-full border-collapse text-left', densa && 'text-sm')}>
              <caption
                className={cn(
                  'mb-2 text-left text-sm text-texto-suave',
                  !legendaVisivel && 'sr-only',
                )}
              >
                {legenda}
              </caption>
              <thead>
                {tabela.getHeaderGroups().map((g) => (
                  <tr key={g.id} className="border-b border-borda">
                    {g.headers.map((h) => {
                      const col = h.column.columnDef as Coluna<T>;
                      const ordenada = h.column.getIsSorted();
                      const titulo = flexRender(h.column.columnDef.header, h.getContext());
                      return (
                        <th
                          key={h.id}
                          scope="col"
                          aria-sort={
                            ordenada === 'asc'
                              ? 'ascending'
                              : ordenada === 'desc'
                                ? 'descending'
                                : h.column.getCanSort()
                                  ? 'none'
                                  : undefined
                          }
                          className={cn(
                            densa ? 'px-1.5 py-2' : 'p-2',
                            'text-sm whitespace-nowrap text-texto-suave',
                            col.numerica && 'text-right',
                          )}
                        >
                          {h.column.getCanSort() ? (
                            <button
                              type="button"
                              onClick={h.column.getToggleSortingHandler()}
                              className="inline-flex min-h-[var(--spacing-alvo)] items-center gap-1 font-semibold text-texto-forte"
                            >
                              {titulo}
                              {ordenada === 'asc' ? (
                                <ArrowUp aria-hidden="true" className="h-4 w-4" />
                              ) : ordenada === 'desc' ? (
                                <ArrowDown aria-hidden="true" className="h-4 w-4" />
                              ) : (
                                <ArrowUpDown aria-hidden="true" className="h-4 w-4 opacity-50" />
                              )}
                            </button>
                          ) : (
                            titulo
                          )}
                        </th>
                      );
                    })}
                  </tr>
                ))}
              </thead>
              <tbody>
                {tabela.getRowModel().rows.map((r) => (
                  <tr
                    key={r.id}
                    className={cn(
                      'border-b border-borda-suave',
                      destacar?.(r.original) && 'bg-primaria-clara',
                    )}
                  >
                    {r.getVisibleCells().map((c) => (
                      <td
                        key={c.id}
                        className={cn(
                          densa ? 'px-1.5 py-1 align-top' : 'p-2 align-top',
                          (c.column.columnDef as Coluna<T>).numerica && 'text-right',
                        )}
                      >
                        {flexRender(c.column.columnDef.cell, c.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {total > pageSize && (
            <nav aria-label={`Páginas de ${legenda}`} className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-texto-suave">
                {pageIndex * pageSize + 1}–{Math.min(total, pageIndex * pageSize + pageSize)} de{' '}
                {total}
              </span>
              <Botao
                variante="contorno"
                tamanho="pequeno"
                disabled={!tabela.getCanPreviousPage()}
                onClick={() => tabela.previousPage()}
              >
                Anterior
              </Botao>
              <Botao
                variante="contorno"
                tamanho="pequeno"
                disabled={!tabela.getCanNextPage()}
                onClick={() => tabela.nextPage()}
              >
                Próxima
              </Botao>
            </nav>
          )}
          {contagem && total <= pageSize && (
            <span className="text-sm text-texto-suave">
              {total} {total === 1 ? 'registro' : 'registros'}
            </span>
          )}
        </>
      )}
    </div>
  );
}
