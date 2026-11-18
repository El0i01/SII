import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/** Botão do SII (shadcn/ui "new-york" com os tokens gov.br). Alvo mínimo de 44 px. */
export const variantesBotao = cva(
  'inline-flex min-h-[var(--spacing-alvo)] items-center justify-center gap-2 rounded-md px-4 font-semibold disabled:cursor-not-allowed disabled:opacity-60',
  {
    variants: {
      variante: {
        primario: 'bg-primaria text-fundo hover:bg-primaria-escura',
        contorno: 'border border-primaria bg-fundo text-primaria hover:bg-primaria-clara',
        link: 'px-1 text-primaria underline underline-offset-4',
      },
      tamanho: { normal: '', pequeno: 'px-3 text-sm' },
    },
    defaultVariants: { variante: 'primario', tamanho: 'normal' },
  },
);

export interface BotaoProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof variantesBotao> {
  /** Renderiza o filho (ex.: `<a>`) com o visual do botão. */
  asChild?: boolean;
}

export function Botao({ className, variante, tamanho, asChild, type, ...props }: BotaoProps) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      className={cn(variantesBotao({ variante, tamanho }), className)}
      {...(asChild ? {} : { type: type ?? 'button' })}
      {...props}
    />
  );
}
