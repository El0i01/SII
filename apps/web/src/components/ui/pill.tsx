import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Tons de situação (um mapa só para prazos, etapas e alertas). */
export type Tom = 'bom' | 'alerta' | 'critico' | 'info' | 'neutro';

export const COR_TOM: Record<Tom, string> = {
  bom: 'bg-sucesso-claro text-texto-forte',
  alerta: 'bg-alerta-claro text-texto-forte',
  critico: 'bg-erro-claro text-erro',
  info: 'bg-primaria-clara text-primaria-escura',
  neutro: 'bg-superficie text-texto',
};

/** Tom do prazo da API (`neutro | ok | alerta | critico`). */
export function tomDoPrazo(t: 'neutro' | 'ok' | 'alerta' | 'critico'): Tom {
  return t === 'ok' ? 'bom' : t;
}

export function Pill({
  tom = 'neutro',
  children,
  className,
}: {
  tom?: Tom;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-block rounded px-2 py-0.5 text-sm font-semibold whitespace-nowrap',
        COR_TOM[tom],
        className,
      )}
    >
      {children}
    </span>
  );
}
