'use client';

import { FiltroAcessos } from '@sii/shared';
import { useRouter } from 'next/navigation';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { api, ErroApi } from '@/lib/api';
import type { PainelAcessos } from '@/lib/fichas';

type Estado =
  | { tipo: 'carregando' }
  | { tipo: 'erro'; mensagem: string }
  | { tipo: 'sem-permissao' }
  | { tipo: 'pronto'; painel: PainelAcessos };

const quandoBr = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Porto_Velho',
    dateStyle: 'short',
    timeStyle: 'short',
  });

/**
 * Painel do encarregado de dados (§3.12, P12): quem revelou dado pessoal, quando e para quê.
 * Versão mínima; o P16 amplia (filtro por pessoa, exportação). Nunca mostra o dado revelado.
 */
export default function Acessos() {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' });
  const [filtro, setFiltro] = useState<Record<string, string>>({});
  const [pagina, setPagina] = useState(1);
  const [erroFiltro, setErroFiltro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const p = new URLSearchParams({ pagina: String(pagina) });
    for (const [k, v] of Object.entries(filtro)) if (v) p.set(k, v);
    try {
      setEstado({ tipo: 'pronto', painel: await api<PainelAcessos>(`/auditoria/acessos?${p}`) });
    } catch (e) {
      if (e instanceof ErroApi && e.status === 401) router.push('/entrar?proximo=/acessos');
      else if (e instanceof ErroApi && e.status === 403) setEstado({ tipo: 'sem-permissao' });
      else
        setEstado({
          tipo: 'erro',
          mensagem: e instanceof Error ? e.message : 'Não foi possível carregar.',
        });
    }
  }, [filtro, pagina, router]);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  function aplicar(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const d = new FormData(ev.currentTarget);
    const novo: Record<string, string> = {};
    for (const k of ['de', 'ate', 'usuario']) {
      const v = String(d.get(k) ?? '').trim();
      if (v) novo[k] = v;
    }
    const r = FiltroAcessos.safeParse(novo);
    if (!r.success) {
      setErroFiltro(r.error.issues[0]?.message ?? 'Confira o filtro.');
      return;
    }
    setErroFiltro(null);
    setPagina(1);
    setFiltro(novo);
  }

  const campo =
    'min-h-[var(--spacing-alvo)] rounded-md border border-borda bg-fundo px-3 text-texto-forte';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-texto-forte">Acessos a dado pessoal</h1>
        <p className="max-w-prose text-texto-suave">
          Cada CPF revelado fica registrado com quem revelou, o perfil, a data, a ficha e a
          finalidade informada. O número revelado nunca aparece aqui.
        </p>
      </div>

      <form onSubmit={aplicar} noValidate className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="de" className="font-semibold text-texto-forte">
            De
          </label>
          <input id="de" name="de" type="date" className={campo} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="ate" className="font-semibold text-texto-forte">
            Até
          </label>
          <input
            id="ate"
            name="ate"
            type="date"
            className={campo}
            aria-invalid={!!erroFiltro}
            aria-describedby={erroFiltro ? 'filtro-erro' : undefined}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="usuario" className="font-semibold text-texto-forte">
            Login do usuário
          </label>
          <input id="usuario" name="usuario" className={campo} />
        </div>
        <button
          type="submit"
          className="min-h-[var(--spacing-alvo)] rounded-md bg-primaria px-4 font-semibold text-fundo"
        >
          Filtrar
        </button>
        {erroFiltro && (
          <p id="filtro-erro" className="w-full text-sm text-erro">
            {erroFiltro}
          </p>
        )}
      </form>

      {estado.tipo === 'carregando' && (
        <div
          aria-busy="true"
          aria-label="Carregando os acessos"
          className="h-64 animate-pulse rounded-md bg-borda-suave"
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
      {estado.tipo === 'sem-permissao' && (
        <div className="rounded-md border-l-4 border-alerta-destaque bg-alerta-claro p-4 text-texto-forte">
          Este painel é do encarregado de dados (DPO) e da CTI.
        </div>
      )}
      {estado.tipo === 'pronto' && estado.painel.acessos.length === 0 && (
        <p className="rounded-md border border-borda-suave bg-superficie p-4 text-texto">
          Nenhum acesso registrado neste filtro. Mude o período ou limpe o login.
        </p>
      )}
      {estado.tipo === 'pronto' && estado.painel.acessos.length > 0 && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">Acessos a dado pessoal</caption>
              <thead>
                <tr className="border-b border-borda">
                  {['Quando', 'Quem', 'Perfil', 'Registro', 'Campo', 'Finalidade', 'IP'].map(
                    (c) => (
                      <th key={c} scope="col" className="p-2 text-sm text-texto-suave">
                        {c}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {estado.painel.acessos.map((a) => (
                  <tr key={a.id} className="border-b border-borda-suave">
                    <td className="p-2 whitespace-nowrap">{quandoBr(a.quando)}</td>
                    <td className="p-2">
                      {a.usuario.nome ?? '—'}
                      <span className="block text-sm text-texto-suave">{a.usuario.login}</span>
                    </td>
                    <td className="p-2">{a.perfil}</td>
                    <td className="p-2 whitespace-nowrap">{a.registro ?? '—'}</td>
                    <td className="p-2">{a.campo}</td>
                    <td className="p-2">{a.finalidade}</td>
                    <td className="p-2 font-mono text-sm">{a.ip ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-texto-suave">
              {estado.painel.total} acesso{estado.painel.total === 1 ? '' : 's'} · página{' '}
              {estado.painel.pagina}
            </p>
            {pagina > 1 && (
              <button
                type="button"
                onClick={() => setPagina(pagina - 1)}
                className="min-h-[var(--spacing-alvo)] rounded-md border border-primaria px-4 font-semibold text-primaria"
              >
                Página anterior
              </button>
            )}
            {pagina * estado.painel.porPagina < estado.painel.total && (
              <button
                type="button"
                onClick={() => setPagina(pagina + 1)}
                className="min-h-[var(--spacing-alvo)] rounded-md border border-primaria px-4 font-semibold text-primaria"
              >
                Próxima página
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
