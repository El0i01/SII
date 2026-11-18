/** Barras horizontais com o número escrito: legíveis sem cor e por leitor de tela. null = "< 5". */
export function Barras({
  titulo,
  itens,
  formatar,
}: {
  titulo: string;
  itens: { rotulo: string; valor: number | null; destaque?: boolean }[];
  /** Texto do valor (ex.: reais); sem ele, o número em pt-BR. */
  formatar?: (v: number) => string;
}) {
  const max = Math.max(1, ...itens.map((i) => i.valor ?? 0));
  return (
    <ul aria-label={titulo} className="flex flex-col gap-2">
      {itens.map((i) => (
        <li
          key={i.rotulo}
          className={`grid items-center gap-2 ${formatar ? 'grid-cols-[minmax(0,8.5rem)_1fr_auto]' : 'grid-cols-[minmax(0,8.5rem)_1fr_3rem]'}`}
        >
          <span className="truncate text-sm text-texto" title={i.rotulo}>
            {i.rotulo}
          </span>
          <span className="h-4 rounded bg-borda-suave" aria-hidden="true">
            <span
              className={`block h-4 rounded ${i.destaque === false ? 'bg-borda' : 'bg-primaria'}`}
              style={{ width: `${((i.valor ?? 0) * 100) / max}%` }}
            />
          </span>
          <span className="text-right font-semibold text-texto-forte">
            {i.valor === null
              ? '< 5'
              : formatar
                ? formatar(i.valor)
                : i.valor.toLocaleString('pt-BR')}
          </span>
        </li>
      ))}
    </ul>
  );
}
