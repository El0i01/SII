'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Botao } from '@/components/ui/button';
import { CabecalhoPagina } from '@/components/ui/cabecalho-pagina';
import { Carregando, Erro, Vazio } from '@/components/ui/estado';
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
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' });

  const carregar = useCallback(async () => {
    try {
      const r = await api<{ naoLidos: number; avisos: Aviso[] }>('/avisos');
      setEstado({ tipo: 'pronto', ...r });
    } catch (e) {
      if (!(e instanceof ErroApi && e.status === 401))
        setEstado({ tipo: 'erro', mensagem: e instanceof Error ? e.message : 'Erro ao carregar.' });
    }
  }, []);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function marcar(id: number) {
    await api(`/avisos/${id}/lido`, { method: 'POST' }).catch(() => undefined);
    await carregar();
  }

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoPagina titulo="Avisos">
        {estado.tipo === 'pronto' && (
          <p className="text-texto-suave" aria-live="polite">
            {estado.naoLidos === 0
              ? 'Nenhum aviso novo.'
              : `${estado.naoLidos} ${estado.naoLidos === 1 ? 'aviso novo' : 'avisos novos'}.`}
          </p>
        )}
      </CabecalhoPagina>
      {estado.tipo === 'carregando' && <Carregando rotulo="Carregando os avisos" altura="h-48" />}
      {estado.tipo === 'erro' && (
        <Erro mensagem={estado.mensagem} onTentar={() => void carregar()} />
      )}
      {estado.tipo === 'pronto' && estado.avisos.length === 0 && (
        <Vazio titulo="Você ainda não recebeu avisos">
          Eles chegam quando o CRAS responde a uma notificação, quando um prazo vence ou quando um
          caso é encaminhado para você.
        </Vazio>
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
                  <Botao asChild variante="contorno" tamanho="pequeno">
                    <Link href={`/notificacoes?codigo=${a.notificacao}`}>
                      Ver notificação {a.notificacao}
                    </Link>
                  </Botao>
                )}
                {!a.lidoEm && (
                  <Botao variante="link" onClick={() => void marcar(a.id)}>
                    Marcar como lido
                  </Botao>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
