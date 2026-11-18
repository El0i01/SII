'use client';

import {
  Accessibility,
  Baby,
  BedSingle,
  BookOpen,
  Layers,
  PersonStanding,
  Bell,
  CalendarCheck,
  ClipboardList,
  GitMerge,
  House,
  IdCard,
  Lock,
  Map as IconeMapa,
  Megaphone,
  Search,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type IconeMenu, itemAtivo, menuDoPerfil } from '@/lib/menu';
import { sufixoFiltros, useFiltrosGlobais } from '@/lib/filtros-url';
import { cn } from '@/lib/utils';
import { useSessao } from './sessao';

const ICONES: Record<IconeMenu, typeof House> = {
  inicio: House,
  ficha: IdCard,
  sino: Bell,
  calendario: CalendarCheck,
  aviso: Megaphone,
  pauta: ClipboardList,
  busca: Search,
  carga: Upload,
  mapa: IconeMapa,
  escudo: ShieldCheck,
  bebe: Baby,
  berco: BedSingle,
  inclusao: Accessibility,
  livro: BookOpen,
  idoso: PersonStanding,
  camadas: Layers,
  vinculo: GitMerge,
  cadeado: Lock,
};

/** Menu agrupado do protótipo, só com as telas do perfil; os links levam território e período. */
export function MenuLateral({ aoNavegar }: { aoNavegar?: () => void }) {
  const { usuario } = useSessao();
  const caminho = usePathname();
  const [filtros] = useFiltrosGlobais();
  if (!usuario) return null;
  const sufixo = filtros ? sufixoFiltros(filtros) : '';
  return (
    <nav aria-label="Painéis" className="flex flex-col gap-4">
      {menuDoPerfil(usuario.perfil, usuario.escopos).map((g) => (
        <div key={g.grupo}>
          <p className="mb-1 px-3 text-xs font-semibold tracking-wide text-texto-suave uppercase">
            {g.grupo}
          </p>
          <ul className="flex flex-col gap-0.5">
            {g.itens.map((i) => {
              const Icone = ICONES[i.icone];
              const ativo = itemAtivo(i.href, caminho);
              return (
                <li key={i.href}>
                  <Link
                    href={`${i.href}${sufixo}`}
                    {...(aoNavegar ? { onClick: aoNavegar } : {})}
                    {...(ativo ? { 'aria-current': 'page' as const } : {})}
                    className={cn(
                      'flex min-h-[var(--spacing-alvo)] items-center gap-3 rounded-md px-3 text-texto-forte hover:bg-primaria-clara',
                      ativo &&
                        'bg-primaria-clara font-semibold text-primaria-escura shadow-[inset_3px_0_0_var(--color-primaria)]',
                    )}
                  >
                    <Icone aria-hidden="true" className="h-5 w-5 shrink-0" />
                    {i.rotulo}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <p className="px-3 text-sm text-texto-suave">Dados pessoais mascarados por padrão.</p>
    </nav>
  );
}
