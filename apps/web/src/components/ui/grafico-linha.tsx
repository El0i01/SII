import { useId } from 'react';

export interface SerieGrafico {
  nome: string;
  /** Classe de cor do traço (token): `stroke-primaria`, `stroke-sucesso`… */
  cor: string;
  /** Classe de cor do marcador da legenda: `bg-primaria`… */
  corLegenda: string;
  valores: (number | null)[];
}

/**
 * Gráfico de linhas em SVG com legenda e tabela alternativa (os mesmos números em texto),
 * legível sem cor e por leitor de tela. null = suprimido (< 5), sem ponto.
 */
export function GraficoLinha({
  titulo,
  rotulos,
  series,
}: {
  titulo: string;
  rotulos: string[];
  series: SerieGrafico[];
}) {
  const id = useId();
  const W = 640;
  const H = 220;
  const L = 36;
  const R = 28;
  const T = 12;
  const B = 28;
  const max = Math.max(1, ...series.flatMap((s) => s.valores.map((v) => v ?? 0)));
  const x = (i: number) => L + (i * (W - L - R)) / Math.max(1, rotulos.length - 1);
  const y = (v: number) => T + (H - T - B) - (v / max) * (H - T - B);
  const marcas = [0, Math.round(max / 2), max];
  return (
    <figure className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={id} className="h-auto w-full">
        <title id={id}>{titulo}</title>
        {marcas.map((m) => (
          <g key={m}>
            <line x1={L} x2={W - R} y1={y(m)} y2={y(m)} className="stroke-borda-suave" />
            <text x={L - 6} y={y(m) + 4} textAnchor="end" className="fill-texto-suave text-[11px]">
              {m}
            </text>
          </g>
        ))}
        {rotulos.map((r, i) => (
          <text
            key={r}
            x={x(i)}
            y={H - 8}
            textAnchor="middle"
            className="fill-texto-suave text-[11px]"
          >
            {r}
          </text>
        ))}
        {series.map((s) => (
          <g key={s.nome}>
            <polyline
              fill="none"
              strokeWidth={2.5}
              className={s.cor}
              points={s.valores
                .map((v, i) => (v === null ? null : `${x(i)},${y(v)}`))
                .filter(Boolean)
                .join(' ')}
            />
            {s.valores.map((v, i) =>
              v === null ? null : (
                <circle
                  key={i}
                  cx={x(i)}
                  cy={y(v)}
                  r={3}
                  className={`fill-fundo ${s.cor}`}
                  strokeWidth={2}
                />
              ),
            )}
          </g>
        ))}
      </svg>
      <figcaption className="flex flex-wrap gap-4 text-sm text-texto">
        {series.map((s) => (
          <span key={s.nome} className="inline-flex items-center gap-2">
            <i aria-hidden="true" className={`inline-block h-3 w-3 rounded-sm ${s.corLegenda}`} />{' '}
            {s.nome}
          </span>
        ))}
      </figcaption>
      <details>
        <summary className="min-h-[var(--spacing-alvo)] cursor-pointer py-2 font-semibold text-primaria">
          Ver os números em tabela
        </summary>
        <div className="overflow-x-auto" tabIndex={0} aria-label={`${titulo} em tabela`}>
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">{titulo}</caption>
            <thead>
              <tr className="border-b border-borda">
                <th scope="col" className="p-2">
                  Mês
                </th>
                {series.map((s) => (
                  <th key={s.nome} scope="col" className="p-2 text-right">
                    {s.nome}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rotulos.map((r, i) => (
                <tr key={r} className="border-b border-borda-suave">
                  <th scope="row" className="p-2 font-normal">
                    {r}
                  </th>
                  {series.map((s) => (
                    <td key={s.nome} className="p-2 text-right">
                      {s.valores[i] === null ? '< 5' : s.valores[i]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
