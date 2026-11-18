import { type ReactNode, useId } from 'react';
import { cn } from '@/lib/utils';

/** Cartão com título (vira o nome da região para leitores de tela), subtítulo e ação opcional. */
export function Card({
  titulo,
  subtitulo,
  acao,
  children,
  className,
  nivel = 2,
}: {
  titulo: string;
  subtitulo?: string;
  acao?: ReactNode;
  children: ReactNode;
  className?: string;
  nivel?: 2 | 3;
}) {
  const id = useId();
  const Titulo = nivel === 2 ? 'h2' : 'h3';
  return (
    <section
      aria-labelledby={id}
      className={cn('min-w-0 rounded-md border border-borda-suave bg-fundo p-4', className)}
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <Titulo id={id} className="text-lg font-semibold text-texto-forte">
            {titulo}
          </Titulo>
          {subtitulo && <p className="text-sm text-texto-suave">{subtitulo}</p>}
        </div>
        {acao}
      </div>
      {children}
    </section>
  );
}
