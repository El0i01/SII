'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ErroApi } from './api';
import { useFiltrosGlobais } from './filtros-url';

/** Estados obrigatórios de toda tela (CLAUDE.md): carregando, erro, sem permissão e pronto. */
export type EstadoPainel<T> =
  | { tipo: 'carregando' }
  | { tipo: 'erro'; mensagem: string }
  | { tipo: 'sem-permissao' }
  | { tipo: 'pronto'; dados: T };

/**
 * Carrega um painel da API com o território do cabeçalho e devolve o estado e o "Tentar de novo".
 * 401 não vira erro: a sessão leva para o login.
 */
export function usePainel<T>(caminho: string) {
  const [filtros] = useFiltrosGlobais();
  const [estado, setEstado] = useState<EstadoPainel<T>>({ tipo: 'carregando' });
  const territorio = filtros?.territorio ?? null;

  const carregar = useCallback(async () => {
    if (!filtros) return;
    setEstado({ tipo: 'carregando' });
    try {
      const sufixo = territorio
        ? `${caminho.includes('?') ? '&' : '?'}territorio=${territorio}`
        : '';
      setEstado({ tipo: 'pronto', dados: await api<T>(`${caminho}${sufixo}`) });
    } catch (e) {
      if (e instanceof ErroApi && e.status === 403) setEstado({ tipo: 'sem-permissao' });
      else if (!(e instanceof ErroApi && e.status === 401))
        setEstado({
          tipo: 'erro',
          mensagem: e instanceof Error ? e.message : 'Não foi possível carregar.',
        });
    }
    // `filtros` muda de identidade a cada render da URL; o que importa é o território.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caminho, territorio, filtros === null]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return { estado, carregar, territorio };
}

/** "78,9%" ou "< 5" / "—". */
export const textoPct = (v: number | null | undefined, suprimido = false) =>
  suprimido
    ? '< 5'
    : v === null || v === undefined
      ? '—'
      : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
export const textoN = (v: number | null | undefined) =>
  v === null ? '< 5' : v === undefined ? '—' : v.toLocaleString('pt-BR');
