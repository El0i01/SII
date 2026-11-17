'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api, ErroApi } from '@/lib/api';
import { dataBr } from '@/lib/casos';

interface Aviso {
  id: number;
  tipo: string;
  texto: string;
  criadoEm: string;
  lidoEm: string | null;
  caso: string;
  notificacao: string | null;
}

type Estado =
  | { tipo: 'carregando' }
  | { tipo: 'erro'; mensagem: string }
  | { tipo: 'pronto'; naoLidos: number; avisos: Aviso[] };

/** Avisos internos (P11): parecer emitido, prazo escalonado, caso encaminhado. Sem dado pessoal. */
export default function Avisos() {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' });

  const carregar = useCallback(async () => {
    try {
      const r = await api<{ naoLidos: number; avisos: Aviso[] }>('/avisos');
      setEstado({ tipo: 'pronto', ...r });
    } catch (e) {
      if (e instanceof ErroApi && e.status === 401) router.push('/entrar?proximo=/avisos');
      else
        setEstado({ tipo: 'erro', mensagem: e instanceof Error ? e.message : 'Erro ao carregar.' });
    }
  }, [router]);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function marcar(id: number) {
    await api(`/avisos/${id}/lido`, { method: 'POST' }).catch(() => undefined);
    await carregar();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-texto-forte">Avisos</h1>
        {estado.tipo === 'pronto' && (
          <p className="text-texto-suave" aria-live="polite">
            {estado.naoLidos === 0
              ? 'Nenhum aviso novo.'
              : `${estado.naoLidos} ${estado.naoLidos === 1 ? 'aviso novo' : 'avisos novos'}.`}
          </p>
        )}
      </div>
      {estado.tipo === 'carregando' && (
        <div
          aria-busy="true"
          aria-label="Carregando os avisos"
          className="h-48 animate-pulse rounded-md bg-borda-suave"
        />
      )}
      {estado.tipo === 'erro' && (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-md border-l-4 border-erro bg-erro-claro p-4"
        >
          <p className="text-texto-forte">{estado.mensagem}</p>
          <button
            type="button"
            onClick={() => void carregar()}
            className="min-h-[var(--spacing-alvo)] rounded-md bg-primaria px-4 font-semibold text-fundo"
          >
            Tentar de novo
          </button>
        </div>
      )}
      {estado.tipo === 'pronto' && estado.avisos.length === 0 && (
        <p className="rounded-md border border-borda-suave bg-superficie p-4 text-texto">
          Você ainda não recebeu avisos. Eles chegam quando o CRAS responde a uma notificação,
          quando um prazo vence ou quando um caso é encaminhado para você.
        </p>
      )}
      {estado.tipo === 'pronto' && estado.avisos.length > 0 && (
        <ul className="flex flex-col gap-2">
          {estado.avisos.map((a) => (
            <li
              key={a.id}
              className={`flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 ${
                a.lidoEm ? 'border-borda-suave bg-fundo' : 'border-primaria bg-primaria-clara'
              }`}
            >
              <div className="flex flex-col">
                <span className="text-texto-forte">
                  {!a.lidoEm && <span className="sr-only">Novo: </span>}
                  {a.texto}
                </span>
                <span className="text-sm text-texto-suave">{dataBr(a.criadoEm)}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {a.notificacao && (
                  <a
                    href={`/notificacoes?codigo=${a.notificacao}`}
                    className="inline-flex min-h-[var(--spacing-alvo)] items-center rounded-md border border-primaria px-3 font-semibold text-primaria"
                  >
                    Ver notificação {a.notificacao}
                  </a>
                )}
                {!a.lidoEm && (
                  <button
                    type="button"
                    onClick={() => void marcar(a.id)}
                    className="min-h-[var(--spacing-alvo)] rounded-md px-3 font-semibold text-primaria underline"
                  >
                    Marcar como lido
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
