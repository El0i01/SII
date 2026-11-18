'use client';

import { AcessosPorCpf, FiltroAcessos, type Perfil, ROTULO_PERFIL } from '@sii/shared';
import { Download } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { Botao } from '@/components/ui/button';
import { CabecalhoPagina } from '@/components/ui/cabecalho-pagina';
import { Card } from '@/components/ui/card';
import { Carregando, Erro, SemPermissao, Vazio } from '@/components/ui/estado';
import { type Coluna, Tabela } from '@/components/ui/tabela';
import { api, baixar, ErroApi } from '@/lib/api';
import { gravarParametrosDaTela } from '@/lib/filtros-url';
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

const FILTROS = ['de', 'ate', 'usuario', 'registro'] as const;

/** Busca dos acessos de uma pessoa pelo CPF: o número vai só no corpo do POST (nunca na URL). */
function BuscaPorCpf() {
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [r, setR] = useState<(PainelAcessos & { encontrada: boolean; registro?: string }) | null>(
    null,
  );

  async function buscar(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const form = ev.currentTarget;
    const v = AcessosPorCpf.safeParse({ cpf: String(new FormData(form).get('cpf') ?? '') });
    if (!v.success) {
      setErro(v.error.issues[0]?.message ?? 'Confira o CPF.');
      document.getElementById('cpf-titular')?.focus();
      return;
    }
    setErro(null);
    setEnviando(true);
    try {
      setR(
        await api('/auditoria/acessos/por-cpf', { method: 'POST', body: JSON.stringify(v.data) }),
      );
      form.reset();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível buscar.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Card
      titulo="Acessos de uma pessoa pelo CPF"
      subtitulo="Para atender o titular. O CPF não fica na tela, no endereço nem no registro; a consulta também é registrada."
    >
      <form onSubmit={buscar} noValidate className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="cpf-titular" className="font-semibold text-texto-forte">
            CPF do titular
          </label>
          <input
            id="cpf-titular"
            name="cpf"
            inputMode="numeric"
            autoComplete="off"
            className={CAMPO}
            aria-invalid={!!erro}
            aria-describedby={erro ? 'cpf-erro' : undefined}
          />
        </div>
        <Botao type="submit" disabled={enviando}>
          {enviando ? 'Buscando…' : 'Buscar acessos'}
        </Botao>
        {erro && (
          <p id="cpf-erro" className="w-full text-sm text-erro">
            {erro}
          </p>
        )}
      </form>
      <div aria-live="polite" className="mt-3">
        {r && !r.encontrada && <Vazio titulo="Nenhuma pessoa com esse CPF na base" />}
        {r?.encontrada && (
          <Tabela
            dados={r.acessos}
            colunas={COLUNAS}
            legenda={`Acessos à ficha ${r.registro} (${r.total})`}
            legendaVisivel
            porPagina={r.porPagina}
            idLinha={(a) => String(a.id)}
          />
        )}
      </div>
    </Card>
  );
}

/**
 * Painel do encarregado de dados (§3.12, P12, P16): quem revelou dado pessoal, quando e para quê.
 * Filtros por período, login e código da ficha (na URL); por CPF, só por POST. Exporta CSV. Nunca
 * mostra o dado revelado.
 */
export default function Acessos() {
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' });
  const [filtro, setFiltro] = useState<Record<string, string>>({});
  const [pagina, setPagina] = useState(1);
  const [erroFiltro, setErroFiltro] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const inicial: Record<string, string> = {};
    for (const k of FILTROS) {
      const v = p.get(k);
      if (v) inicial[k] = v;
    }
    setFiltro(inicial);
    setPronto(true);
  }, []);
  useEffect(() => {
    if (pronto)
      gravarParametrosDaTela(Object.fromEntries(FILTROS.map((k) => [k, filtro[k] ?? null])));
  }, [pronto, filtro]);

  const carregar = useCallback(async () => {
    if (!pronto) return;
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
  }, [filtro, pagina, pronto]);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  function aplicar(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const d = new FormData(ev.currentTarget);
    const novo: Record<string, string> = {};
    for (const k of FILTROS) {
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
          <input
            id="de"
            name="de"
            type="date"
            className={CAMPO}
            defaultValue={filtro.de}
            key={`d${filtro.de}`}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="ate" className="font-semibold text-texto-forte">
            Até
          </label>
          <input
            id="ate"
            name="ate"
            type="date"
            defaultValue={filtro.ate}
            key={`a${filtro.ate}`}
            className={CAMPO}
            aria-invalid={!!erroFiltro}
            aria-describedby={erroFiltro ? 'filtro-erro' : undefined}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="usuario" className="font-semibold text-texto-forte">
            Login do usuário
          </label>
          <input
            id="usuario"
            name="usuario"
            className={CAMPO}
            defaultValue={filtro.usuario}
            key={`u${filtro.usuario}`}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="registro" className="font-semibold text-texto-forte">
            Código da ficha
          </label>
          <input
            id="registro"
            name="registro"
            placeholder="Ex.: CI-10237"
            className={CAMPO}
            defaultValue={filtro.registro}
            key={`r${filtro.registro}`}
          />
        </div>
        <Botao type="submit">Filtrar</Botao>
        <Botao
          type="button"
          variante="contorno"
          onClick={() => {
            const p = new URLSearchParams(Object.entries(filtro).filter(([, v]) => v));
            void baixar(`/auditoria/acessos.csv?${p}`, 'acessos-dado-pessoal.csv');
          }}
        >
          <Download aria-hidden="true" className="h-4 w-4" /> Baixar CSV
        </Botao>
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
            contagem={false}
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
      {estado.tipo !== 'sem-permissao' && <BuscaPorCpf />}
    </div>
  );
}
