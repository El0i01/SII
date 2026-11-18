'use client';

import { FiltroAcessos, type Perfil, ROTULO_PERFIL } from '@sii/shared';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { Botao } from '@/components/ui/button';
import { CabecalhoPagina } from '@/components/ui/cabecalho-pagina';
import { Carregando, Erro, SemPermissao, Vazio } from '@/components/ui/estado';
import { type Coluna, Tabela } from '@/components/ui/tabela';
import { api, ErroApi } from '@/lib/api';
import type { PainelAcessos } from '@/lib/fichas';

type Acesso = PainelAcessos['acessos'][number];
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

const COLUNAS: Coluna<Acesso>[] = [
  {
    id: 'quando',
    header: 'Quando',
    accessorKey: 'quando',
    cell: (c) => <span className="whitespace-nowrap">{quandoBr(c.getValue<string>())}</span>,
  },
  {
    id: 'quem',
    header: 'Quem',
    accessorFn: (a) => a.usuario.nome ?? '',
    cell: (c) => (
      <>
        {c.row.original.usuario.nome ?? '—'}
        <span className="block text-sm text-texto-suave">{c.row.original.usuario.login}</span>
      </>
    ),
  },
  {
    id: 'perfil',
    header: 'Perfil',
    accessorFn: (a) => ROTULO_PERFIL[a.perfil as Perfil] ?? a.perfil,
  },
  { id: 'registro', header: 'Registro', accessorFn: (a) => a.registro ?? '—' },
  { accessorKey: 'campo', header: 'Campo' },
  { accessorKey: 'finalidade', header: 'Finalidade', enableSorting: false },
  {
    id: 'ip',
    header: 'IP',
    accessorFn: (a) => a.ip ?? '—',
    enableSorting: false,
    cell: (c) => <span className="font-mono text-sm">{c.getValue<string>()}</span>,
  },
];

const CAMPO =
  'min-h-[var(--spacing-alvo)] rounded-md border border-borda bg-fundo px-3 text-texto-forte';

/**
 * Painel do encarregado de dados (§3.12, P12): quem revelou dado pessoal, quando e para quê.
 * Versão mínima; o P16 amplia (filtro por pessoa, exportação). Nunca mostra o dado revelado.
 */
export default function Acessos() {
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
      if (e instanceof ErroApi && e.status === 403) setEstado({ tipo: 'sem-permissao' });
      else if (!(e instanceof ErroApi && e.status === 401))
        setEstado({
          tipo: 'erro',
          mensagem: e instanceof Error ? e.message : 'Não foi possível carregar.',
        });
    }
  }, [filtro, pagina]);
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
      document.getElementById('ate')?.focus();
      return;
    }
    setErroFiltro(null);
    setPagina(1);
    setFiltro(novo);
  }

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoPagina
        titulo="Acessos a dado pessoal"
        descricao="Cada CPF revelado fica registrado com quem revelou, o perfil, a data, a ficha e a finalidade informada. O número revelado nunca aparece aqui."
      />

      <form onSubmit={aplicar} noValidate className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="de" className="font-semibold text-texto-forte">
            De
          </label>
          <input id="de" name="de" type="date" className={CAMPO} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="ate" className="font-semibold text-texto-forte">
            Até
          </label>
          <input
            id="ate"
            name="ate"
            type="date"
            className={CAMPO}
            aria-invalid={!!erroFiltro}
            aria-describedby={erroFiltro ? 'filtro-erro' : undefined}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="usuario" className="font-semibold text-texto-forte">
            Login do usuário
          </label>
          <input id="usuario" name="usuario" className={CAMPO} />
        </div>
        <Botao type="submit">Filtrar</Botao>
        {erroFiltro && (
          <p id="filtro-erro" className="w-full text-sm text-erro">
            {erroFiltro}
          </p>
        )}
      </form>

      {estado.tipo === 'carregando' && <Carregando rotulo="Carregando os acessos" altura="h-64" />}
      {estado.tipo === 'erro' && (
        <Erro mensagem={estado.mensagem} onTentar={() => void carregar()} />
      )}
      {estado.tipo === 'sem-permissao' && (
        <SemPermissao>Este painel é do encarregado de dados (DPO) e da CTI.</SemPermissao>
      )}
      {estado.tipo === 'pronto' && estado.painel.acessos.length === 0 && (
        <Vazio titulo="Nenhum acesso registrado neste filtro">
          Mude o período ou limpe o login.
        </Vazio>
      )}
      {estado.tipo === 'pronto' && estado.painel.acessos.length > 0 && (
        <>
          <Tabela
            dados={estado.painel.acessos}
            colunas={COLUNAS}
            legenda="Acessos a dado pessoal"
            porPagina={estado.painel.porPagina}
            idLinha={(a) => String(a.id)}
          />
          <nav aria-label="Páginas dos acessos" className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-texto-suave">
              {estado.painel.total} acesso{estado.painel.total === 1 ? '' : 's'} · página{' '}
              {estado.painel.pagina}
            </p>
            {pagina > 1 && (
              <Botao variante="contorno" onClick={() => setPagina(pagina - 1)}>
                Página anterior
              </Botao>
            )}
            {pagina * estado.painel.porPagina < estado.painel.total && (
              <Botao variante="contorno" onClick={() => setPagina(pagina + 1)}>
                Próxima página
              </Botao>
            )}
          </nav>
        </>
      )}
    </div>
  );
}
