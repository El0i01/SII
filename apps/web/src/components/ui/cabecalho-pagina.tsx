import type { ReactNode } from 'react';

/** Título da tela (h1), descrição em linguagem simples e as fontes dos dados. */
export function CabecalhoPagina({
  titulo,
  descricao,
  fontes,
  children,
}: {
  titulo: string;
  descricao?: ReactNode;
  fontes?: string | undefined;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold text-texto-forte">{titulo}</h1>
      {descricao && <p className="max-w-prose text-texto-suave">{descricao}</p>}
      {fontes && <p className="text-sm text-texto-suave">{fontes}</p>}
      {children}
    </div>
  );
}
