import { cn } from '@/lib/utils';

/**
 * Valor em % com barra e a marca da meta (o `barCell` do protótipo). Verde: meta atingida;
 * amarelo: até 10 pontos abaixo; vermelho: mais longe. O número sempre escrito (a cor não é a
 * única informação).
 */
export function BarraMeta({
  valor,
  meta,
  max = 100,
}: {
  valor: number | null;
  meta: number;
  max?: number;
}) {
  if (valor === null) return <span className="text-texto-suave">—</span>;
  const tom = valor >= meta ? 'bg-sucesso' : valor >= meta - 10 ? 'bg-alerta-destaque' : 'bg-erro';
  const pct = (v: number) => `${Math.min(100, (v * 100) / max)}%`;
  return (
    <span className="flex min-w-32 items-center gap-2">
      <span className="relative h-3 grow rounded bg-borda-suave" aria-hidden="true">
        <span className={cn('block h-3 rounded', tom)} style={{ width: pct(valor) }} />
        <span className="absolute -top-1 h-5 w-0.5 bg-texto-forte" style={{ left: pct(meta) }} />
      </span>
      <span className="w-14 text-right font-semibold text-texto-forte">
        {valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
      </span>
    </span>
  );
}
