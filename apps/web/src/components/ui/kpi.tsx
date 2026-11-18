import { cn } from '@/lib/utils';
import type { Tom } from './pill';

const BORDA: Record<Tom, string> = {
  bom: 'border-l-sucesso',
  alerta: 'border-l-alerta-destaque',
  critico: 'border-l-erro',
  info: 'border-l-primaria',
  neutro: 'border-l-borda',
};

/** Indicador do topo dos painéis: rótulo, valor e detalhe. Valor null = suprimido (< 5). */
export function Kpi({
  rotulo,
  valor,
  detalhe,
  tom = 'neutro',
}: {
  rotulo: string;
  valor: string | number | null;
  detalhe?: string;
  tom?: Tom;
}) {
  const texto =
    valor === null ? '< 5' : typeof valor === 'number' ? valor.toLocaleString('pt-BR') : valor;
  return (
    <div
      className={cn(
        'rounded-md border border-l-4 border-borda-suave bg-superficie p-4',
        BORDA[tom],
      )}
    >
      <p className="text-sm text-texto-suave">{rotulo}</p>
      <p className="text-3xl font-semibold text-texto-forte">{texto}</p>
      {detalhe && <p className="text-sm text-texto-suave">{detalhe}</p>}
    </div>
  );
}

export function GradeKpis({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
      {children}
    </div>
  );
}
