'use client';

import type { Escopo, Perfil } from '@sii/shared';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { api, ErroApi } from '@/lib/api';

export interface Usuario {
  id: number;
  login: string;
  nome: string;
  perfil: Perfil;
  escopos: Escopo[];
  trocaObrigatoria: boolean;
}

interface Sessao {
  usuario: Usuario | null;
  carregando: boolean;
  sair: () => Promise<void>;
}

const Contexto = createContext<Sessao>({
  usuario: null,
  carregando: true,
  sair: async () => undefined,
});

/** Rotas que funcionam sem login. */
export const ROTAS_PUBLICAS = ['/entrar'];

/** Quem está logado (GET /auth/eu). Sem sessão numa rota protegida → /entrar?proximo=. */
export function ProvedorSessao({ children }: { children: ReactNode }) {
  const caminho = usePathname();
  const router = useRouter();
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [carregando, setCarregando] = useState(true);
  const publica = ROTAS_PUBLICAS.includes(caminho);

  useEffect(() => {
    if (publica) {
      setCarregando(false);
      return;
    }
    let vivo = true;
    api<Usuario>('/auth/eu')
      .then((u) => vivo && setUsuario(u))
      .catch((e: unknown) => {
        if (vivo && e instanceof ErroApi && e.status === 401)
          router.push(`/entrar?proximo=${encodeURIComponent(caminho)}`);
      })
      .finally(() => vivo && setCarregando(false));
    return () => {
      vivo = false;
    };
  }, [caminho, publica, router]);

  const sair = useCallback(async () => {
    await api('/auth/sair', { method: 'POST' }).catch(() => undefined);
    setUsuario(null);
    router.push('/entrar');
  }, [router]);

  return <Contexto.Provider value={{ usuario, carregando, sair }}>{children}</Contexto.Provider>;
}

export const useSessao = () => useContext(Contexto);
