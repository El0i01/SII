import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Junta classes Tailwind resolvendo conflitos (utilitário padrão do shadcn/ui). */
export function cn(...classes: ClassValue[]): string {
  return twMerge(clsx(classes));
}
