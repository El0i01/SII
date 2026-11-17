'use client';

import {
  BOM_UTF8,
  ORIGENS_ALERTA,
  type RevelarCpf,
  ROTULO_SECRETARIA_BUSCA_ATIVA,
  ROTULO_STATUS_BUSCA_ATIVA,
  SECRETARIAS_BUSCA_ATIVA,
  STATUS_BUSCA_ATIVA,
  VisitaBuscaAtiva,
} from '@sii/shared';
import { useRouter } from 'next/navigation';
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { type ErrosRevelar, FormularioRevelarCpf } from '@/components/revelar-cpf';
import { api, ErroApi } from '@/lib/api';
import {
  atendeBuscaCaso,
  atendeSituacao,
  type ColunaOrdem,
  csvDosCasos,
  type DetalheBuscaAtiva,
  type FiltroSituacao,
  type ItemBuscaAtiva,
  ordenar,
  type PainelBuscaAtiva,
} from '@/lib/busca-ativa';
import { COR_PRAZO, dataBr, ROTULO_EVENTO } from '@/lib/casos';

const POR_PAGINA = 10;
const BOTAO =
  'inline-flex min-h-[var(--spacing-alvo)] items-center rounded-md border border-primaria px-4 font-semibold text-primaria disabled:opacity-60';
const BOTAO_PRIMARIO =
  'min-h-[var(--spacing-alvo)] rounded-md bg-primaria px-4 font-semibold text-fundo hover:bg-primaria-escura disabled:opacity-70';
const CAMPO =
  'min-h-[var(--spacing-alvo)] rounded-md border border-borda bg-fundo px-3 text-texto-forte';

const COR_STATUS: Record<string, string> = {
  IDENTIFICADO: 'bg-superficie text-texto-forte',
  ENCAMINHADO: 'bg-primaria-clara text-primaria-escura',
  VISITA_REALIZADA: 'bg-alerta-claro text-texto-forte',
  MATRICULADO: 'bg-sucesso-claro text-texto-forte',
  NAO_LOCALIZADO: 'bg-erro-claro text-erro',
};
const Pill = ({ cor, children }: { cor: string; children: ReactNode }) => (
  <span className={`rounded px-2 py-0.5 text-sm font-semibold whitespace-nowrap ${cor}`}>
    {children}
  </span>
);
const numero = (n: number | null) => (n === null ? '< 5' : n.toLocaleString('pt-BR'));

function Kpi({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe: string }) {
  return (
    <div className="rounded-md border border-borda-suave bg-superficie p-4">
      <p className="text-sm text-texto-suave">{rotulo}</p>
      <p className="text-3xl font-semibold text-texto-forte">{valor}</p>
      <p className="text-sm text-texto-suave">{detalhe}</p>
    </div>
  );
}

/** Barras horizontais com o número escrito: legível sem cor e por leitor de tela. */
function Barras({
  titulo,
  itens,
}: {
  titulo: string;
  itens: { rotulo: string; valor: number | null }[];
}) {
  const max = Math.max(1, ...itens.map((i) => i.valor ?? 0));
  return (
    <ul aria-label={titulo} className="flex flex-col gap-2">
      {itens.map((i) => (
        <li key={i.rotulo} className="grid grid-cols-[8.5rem_1fr_3rem] items-center gap-2">
          <span className="text-sm text-texto">{i.rotulo}</span>
          <span className="h-4 rounded bg-borda-suave" aria-hidden="true">
            <span
              className="block h-4 rounded bg-primaria"
              style={{ width: `${((i.valor ?? 0) * 100) / max}%` }}
            />
          </span>
          <span className="text-right font-semibold text-texto-forte">{numero(i.valor)}</span>
        </li>
      ))}
    </ul>
  );
}

function Card({
  titulo,
  subtitulo,
  children,
}: {
  titulo: string;
  subtitulo?: string;
  children: ReactNode;
}) {
  const id = titulo.replace(/\W+/g, '-').toLowerCase();
  return (
    <section aria-labelledby={id} className="rounded-md border border-borda-suave bg-fundo p-4">
      <h2 id={id} className="text-lg font-semibold text-texto-forte">
        {titulo}
      </h2>
      {subtitulo && <p className="mb-3 text-sm text-texto-suave">{subtitulo}</p>}
      {children}
    </section>
  );
}

type EstadoLista =
  | { tipo: 'carregando' }
  | { tipo: 'erro'; mensagem: string }
  | { tipo: 'sem-permissao' }
  | { tipo: 'pronto'; itens: ItemBuscaAtiva[] };

const COLUNAS: [ColunaOrdem | 'cpf', string][] = [
  ['codigo', 'Caso'],
  ['iniciais', 'Criança'],
  ['cpf', 'CPF'],
  ['idade', 'Idade'],
  ['localidade', 'Quadra/Linha'],
  ['origem', 'Origem'],
  ['responsavel', 'Responsável'],
  ['status', 'Situação'],
  ['dias', 'Dias'],
  ['prazo', 'Prazo'],
];

/**
 * Busca ativa escolar (§4.2, P13), como no protótipo: KPIs, funil, origem do alerta, prazos e a lista
 * de casos (CPF mascarado, exportação sem CPF nem nome). O auditor vê só os números.
 */
export default function BuscaAtiva() {
  const router = useRouter();
  const [painel, setPainel] = useState<PainelBuscaAtiva | null>(null);
  const [erroPainel, setErroPainel] = useState<string | null>(null);
  const [lista, setLista] = useState<EstadoLista>({ tipo: 'carregando' });
  const [busca, setBusca] = useState('');
  const [situacao, setSituacao] = useState<FiltroSituacao>('todos');
  const [ordem, setOrdem] = useState<{ coluna: ColunaOrdem; direcao: 1 | -1 }>({
    coluna: 'dias',
    direcao: -1,
  });
  const [pagina, setPagina] = useState(0);
  const [aberto, setAberto] = useState<string | null>(null);
  const [revelados, setRevelados] = useState<Record<string, string>>({});
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setBusca(p.get('busca') ?? '');
    const s = p.get('situacao') as FiltroSituacao | null;
    if (s && (s === 'escalonados' || (STATUS_BUSCA_ATIVA as readonly string[]).includes(s)))
      setSituacao(s);
    setAberto(p.get('caso'));
    setPronto(true);
  }, []);
  useEffect(() => {
    if (!pronto) return;
    const p = new URLSearchParams();
    if (busca.trim()) p.set('busca', busca.trim());
    if (situacao !== 'todos') p.set('situacao', situacao);
    if (aberto) p.set('caso', aberto);
    const q = p.toString();
    window.history.replaceState(null, '', q ? `/busca-ativa?${q}` : '/busca-ativa');
  }, [pronto, busca, situacao, aberto]);

  const carregar = useCallback(async () => {
    try {
      setPainel(await api<PainelBuscaAtiva>('/busca-ativa/painel'));
    } catch (e) {
      if (e instanceof ErroApi && e.status === 401)
        return router.push('/entrar?proximo=/busca-ativa');
      setErroPainel(
        e instanceof ErroApi && e.status === 403
          ? 'Seu perfil não acompanha a busca ativa.'
          : e instanceof Error
            ? e.message
            : 'Não foi possível carregar.',
      );
    }
    try {
      setLista({
        tipo: 'pronto',
        itens: (await api<{ itens: ItemBuscaAtiva[] }>('/busca-ativa')).itens,
      });
    } catch (e) {
      if (e instanceof ErroApi && e.status === 403) setLista({ tipo: 'sem-permissao' });
      else if (!(e instanceof ErroApi && e.status === 401))
        setLista({
          tipo: 'erro',
          mensagem: e instanceof Error ? e.message : 'Não foi possível carregar.',
        });
    }
  }, [router]);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  const filtrados = useMemo(() => {
    if (lista.tipo !== 'pronto') return [];
    return ordenar(
      lista.itens.filter((i) => atendeSituacao(i, situacao) && atendeBuscaCaso(i, busca)),
      ordem.coluna,
      ordem.direcao,
    );
  }, [lista, situacao, busca, ordem]);
  const paginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, paginas - 1);
  const fatia = filtrados.slice(paginaAtual * POR_PAGINA, paginaAtual * POR_PAGINA + POR_PAGINA);

  function baixarCsv() {
    const blob = new Blob([BOM_UTF8 + csvDosCasos(filtrados)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `busca-ativa-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const p = painel;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-texto-forte">Busca ativa escolar</h1>
        <p className="max-w-prose text-texto-suave">
          Crianças e adolescentes de 4 a 17 anos que aparecem no CadÚnico, no e-SUS ou no Censo
          Municipal sem matrícula na rede municipal nem na estadual.
        </p>
        <p className="text-sm text-texto-suave">
          Fontes: CadÚnico, e-SUS PEC, gestão escolar, SEDUC-RO
        </p>
      </div>

      {erroPainel && (
        <p role="alert" className="rounded-md border-l-4 border-erro bg-erro-claro p-3">
          {erroPainel}
        </p>
      )}
      {!p && !erroPainel && (
        <div
          aria-busy="true"
          aria-label="Carregando o painel"
          className="h-24 animate-pulse rounded-md bg-borda-suave"
        />
      )}
      {p && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Kpi rotulo="Identificados" valor={numero(p.identificados)} detalhe="desde jan/2026" />
            <Kpi
              rotulo="Encaminhados em até 30 dias"
              valor={p.encaminhadosEm30 === null ? '—' : `${p.encaminhadosEm30}%`}
              detalhe="meta: 100%"
            />
            <Kpi
              rotulo="Matriculados"
              valor={numero(p.matriculados)}
              detalhe={
                p.identificados && p.matriculados !== null
                  ? `${Math.round((p.matriculados * 100) / p.identificados)}% dos identificados`
                  : 'dos identificados'
              }
            />
            <Kpi
              rotulo="Não localizados"
              valor={numero(p.naoLocalizados)}
              detalhe="seguem para o Conselho Tutelar"
            />
            <Kpi
              rotulo="Escalonados ao Comitê"
              valor={numero(p.escalonados)}
              detalhe="vencidos há mais de 7 dias"
            />
          </div>
          {p.suprimido && (
            <p className="text-sm text-texto-suave">
              Contagens menores que 5 aparecem como &quot;&lt; 5&quot; para proteger as crianças.
            </p>
          )}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card titulo="Do alerta à matrícula" subtitulo="Quantos casos avançam em cada etapa">
              <Barras
                titulo="Casos por etapa"
                itens={[
                  { rotulo: 'identificados', valor: p.identificados },
                  { rotulo: 'encaminhados', valor: p.encaminhados },
                  { rotulo: 'visitados', valor: p.visitados },
                  { rotulo: 'matriculados', valor: p.matriculados },
                ]}
              />
            </Card>
            <Card titulo="Origem do alerta" subtitulo="Base que revelou a criança fora da escola">
              <Barras
                titulo="Casos por origem do alerta"
                itens={ORIGENS_ALERTA.filter(
                  (o) => o !== 'Outra base' || (p.porOrigem[o] ?? 0) !== 0,
                ).map((o) => ({
                  rotulo: o,
                  valor: p.porOrigem[o] ?? 0,
                }))}
              />
            </Card>
          </div>
        </>
      )}

      <Card
        titulo="Prazos e escalonamento"
        subtitulo="Cada etapa tem um prazo contado a partir do alerta. Quando o prazo estoura, o caso sobe de nível sozinho."
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-borda">
                <th scope="col" className="p-2 text-sm text-texto-suave">
                  Etapa atual
                </th>
                <th scope="col" className="p-2 text-sm text-texto-suave">
                  Próximo passo
                </th>
                <th scope="col" className="p-2 text-right text-sm text-texto-suave">
                  Prazo desde o alerta
                </th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Identificado', 'Encaminhar à secretaria responsável', '5 dias'],
                ['Encaminhado', 'Fazer a visita domiciliar', '20 dias'],
                ['Visita realizada', 'Efetivar a matrícula', '30 dias'],
                ['Não localizado', 'Comunicar o Conselho Tutelar', '30 dias'],
              ].map(([a, b, c]) => (
                <tr key={a} className="border-b border-borda-suave">
                  <td className="p-2">{a}</td>
                  <td className="p-2">{b}</td>
                  <td className="p-2 text-right">{c}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="flex flex-col gap-2">
            {[
              [
                'Faltam 3 dias ou menos',
                'Aviso ao responsável pelo caso e ao ponto focal',
                'Nível 1',
                COR_PRAZO.alerta,
              ],
              [
                'Prazo vencido',
                'Caso vai para a coordenação da secretaria',
                'Nível 2',
                COR_PRAZO.critico,
              ],
              [
                'Vencido há mais de 7 dias',
                'Entra na pauta da próxima reunião do Comitê Gestor',
                'Nível 3',
                COR_PRAZO.critico,
              ],
            ].map(([t, d, n, cor]) => (
              <li
                key={t}
                className="flex items-center justify-between gap-3 rounded-md border border-borda-suave p-3"
              >
                <span>
                  <b className="text-texto-forte">{t}</b>
                  <span className="block text-sm text-texto-suave">{d}</span>
                </span>
                <Pill cor={cor as string}>{n}</Pill>
              </li>
            ))}
          </ul>
        </div>
      </Card>

      <Card
        titulo="Casos"
        subtitulo="Lista de ação para as equipes, ordenada pelos casos mais antigos."
      >
        {lista.tipo === 'carregando' && (
          <div
            aria-busy="true"
            aria-label="Carregando os casos"
            className="h-64 animate-pulse rounded-md bg-borda-suave"
          />
        )}
        {lista.tipo === 'erro' && (
          <div
            role="alert"
            className="flex flex-col items-start gap-3 rounded-md border-l-4 border-erro bg-erro-claro p-4"
          >
            <p>{lista.mensagem}</p>
            <button type="button" onClick={() => void carregar()} className={BOTAO_PRIMARIO}>
              Tentar de novo
            </button>
          </div>
        )}
        {lista.tipo === 'sem-permissao' && (
          <p className="rounded-md border-l-4 border-alerta-destaque bg-alerta-claro p-4 text-texto-forte">
            Seu perfil vê só os números agregados da busca ativa. A lista nominal é das equipes.
          </p>
        )}
        {lista.tipo === 'pronto' && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex grow flex-col gap-1">
                <label htmlFor="busca" className="font-semibold text-texto-forte">
                  Buscar por caso, quadra, escola ou responsável
                </label>
                <input
                  id="busca"
                  type="search"
                  value={busca}
                  onChange={(e) => {
                    setBusca(e.target.value);
                    setPagina(0);
                  }}
                  placeholder="Ex.: BA-2026-0329 ou Q052"
                  className={CAMPO}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="situacao" className="font-semibold text-texto-forte">
                  Situação
                </label>
                <select
                  id="situacao"
                  value={situacao}
                  onChange={(e) => {
                    setSituacao(e.target.value as FiltroSituacao);
                    setPagina(0);
                  }}
                  className={CAMPO}
                >
                  <option value="todos">Todas</option>
                  <option value="escalonados">Escalonados ao Comitê</option>
                  {STATUS_BUSCA_ATIVA.map((s) => (
                    <option key={s} value={s}>
                      {ROTULO_STATUS_BUSCA_ATIVA[s]}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={baixarCsv}
                disabled={filtrados.length === 0}
                className={BOTAO}
              >
                Baixar CSV
              </button>
            </div>

            {filtrados.length === 0 ? (
              <div className="flex flex-col items-start gap-3 rounded-md border border-borda-suave bg-superficie p-4">
                <p>
                  Nenhum caso corresponde à busca e aos filtros. Limpe a busca ou escolha outra
                  situação.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setBusca('');
                    setSituacao('todos');
                  }}
                  className={BOTAO}
                >
                  Limpar filtros
                </button>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left">
                    <caption className="mb-2 text-left text-sm text-texto-suave">
                      CPF mascarado por padrão. Revelar o CPF registra o acesso (quem, quando e
                      finalidade).
                    </caption>
                    <thead>
                      <tr className="border-b border-borda">
                        {COLUNAS.map(([k, rotulo]) => {
                          const ativa = ordem.coluna === k;
                          return (
                            <th
                              key={k}
                              scope="col"
                              aria-sort={
                                ativa ? (ordem.direcao > 0 ? 'ascending' : 'descending') : 'none'
                              }
                              className="p-2 text-sm whitespace-nowrap text-texto-suave"
                            >
                              {k === 'cpf' ? (
                                rotulo
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setOrdem((o) => ({
                                      coluna: k,
                                      direcao: o.coluna === k ? (o.direcao === 1 ? -1 : 1) : 1,
                                    }))
                                  }
                                  className="min-h-[var(--spacing-alvo)] font-semibold"
                                >
                                  {rotulo}
                                  {ativa ? (ordem.direcao > 0 ? ' ↑' : ' ↓') : ''}
                                </button>
                              )}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {fatia.map((i) => (
                        <tr
                          key={i.codigo}
                          className={`border-b border-borda-suave ${aberto === i.codigo ? 'bg-primaria-clara' : ''}`}
                        >
                          <td className="p-2 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => setAberto(i.codigo)}
                              aria-label={`Abrir o caso ${i.codigo}`}
                              className="min-h-[var(--spacing-alvo)] font-semibold text-primaria underline"
                            >
                              {i.codigo}
                            </button>
                          </td>
                          <td className="p-2 whitespace-nowrap">{i.iniciais}</td>
                          <td className="p-2 font-mono text-sm whitespace-nowrap">
                            {revelados[i.codigo] ?? i.cpf ?? '—'}
                          </td>
                          <td className="p-2 text-right">{i.idade ?? '—'}</td>
                          <td className="p-2">
                            {i.localidade ?? '—'}
                            {i.setor && (
                              <span className="block text-sm text-texto-suave">{i.setor}</span>
                            )}
                          </td>
                          <td className="p-2">{i.origem ?? '—'}</td>
                          <td className="p-2">{i.rotuloResponsavel}</td>
                          <td className="p-2">
                            <Pill cor={COR_STATUS[i.status] as string}>
                              {ROTULO_STATUS_BUSCA_ATIVA[i.status]}
                            </Pill>
                          </td>
                          <td className="p-2 text-right">{i.dias}</td>
                          <td className="p-2">
                            <Pill cor={COR_PRAZO[i.prazo.tom]}>{i.prazo.rotulo}</Pill>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm text-texto-suave">
                    {paginaAtual * POR_PAGINA + 1}–
                    {Math.min(filtrados.length, paginaAtual * POR_PAGINA + POR_PAGINA)} de{' '}
                    {filtrados.length}
                  </span>
                  <button
                    type="button"
                    disabled={paginaAtual === 0}
                    onClick={() => setPagina(paginaAtual - 1)}
                    className={BOTAO}
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    disabled={paginaAtual >= paginas - 1}
                    onClick={() => setPagina(paginaAtual + 1)}
                    className={BOTAO}
                  >
                    Próxima
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </Card>

      {aberto && lista.tipo === 'pronto' && (
        <PainelCaso
          key={aberto}
          codigo={aberto}
          onFechar={() => setAberto(null)}
          onRevelado={(cpf) => setRevelados((r) => ({ ...r, [aberto]: cpf }))}
          onMudou={() => void carregar()}
        />
      )}
    </div>
  );
}

function PainelCaso({
  codigo,
  onFechar,
  onRevelado,
  onMudou,
}: {
  codigo: string;
  onFechar: () => void;
  onRevelado: (cpf: string) => void;
  onMudou: () => void;
}) {
  const [d, setD] = useState<DetalheBuscaAtiva | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [revelando, setRevelando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);

  useEffect(() => {
    api<DetalheBuscaAtiva>(`/busca-ativa/${codigo}`)
      .then(setD)
      .catch((e: unknown) =>
        setErro(e instanceof Error ? e.message : 'Não foi possível abrir o caso.'),
      );
  }, [codigo]);

  async function agir(
    caminho: string,
    corpo: object,
    texto: string,
  ): Promise<Record<string, string> | null> {
    try {
      setD(
        await api<DetalheBuscaAtiva>(`/busca-ativa/${codigo}/${caminho}`, {
          method: 'POST',
          body: JSON.stringify(corpo),
        }),
      );
      setMensagem(texto);
      onMudou();
      return null;
    } catch (e) {
      if (e instanceof ErroApi && Object.keys(e.campos).length) {
        return Object.fromEntries(Object.entries(e.campos).map(([k, v]) => [k, v[0] ?? '']));
      }
      return { geral: e instanceof Error ? e.message : 'Não foi possível registrar.' };
    }
  }

  async function revelar(r: RevelarCpf): Promise<ErrosRevelar | null> {
    if (!d) return null;
    try {
      const resp = await api<{ cpf: string }>(`/fichas/${d.pessoaId}/revelar-cpf`, {
        method: 'POST',
        body: JSON.stringify(r),
      });
      onRevelado(resp.cpf);
      setRevelando(false);
      setMensagem(
        'CPF revelado na tabela. O acesso foi registrado no painel do encarregado de dados.',
      );
      return null;
    } catch (e) {
      const finalidade = e instanceof ErroApi ? e.campos.finalidade?.[0] : undefined;
      if (finalidade) return { finalidade };
      return { geral: e instanceof Error ? e.message : 'Não foi possível revelar o CPF.' };
    }
  }

  return (
    <section
      aria-labelledby="caso-titulo"
      aria-live="polite"
      className="flex flex-col gap-4 rounded-md border border-primaria bg-fundo p-4"
    >
      {erro && (
        <p role="alert" className="rounded-md border-l-4 border-erro bg-erro-claro p-3">
          {erro}
        </p>
      )}
      {!d && !erro && (
        <div
          aria-busy="true"
          aria-label="Carregando o caso"
          className="h-40 animate-pulse rounded-md bg-borda-suave"
        />
      )}
      {d && (
        <>
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="caso-titulo" className="text-xl font-semibold text-texto-forte">
                {d.codigo} · {d.iniciais}
              </h2>
              <p className="text-texto-suave">
                {ROTULO_STATUS_BUSCA_ATIVA[d.status]} ·{' '}
                {ROTULO_SECRETARIA_BUSCA_ATIVA[d.responsavel] ?? d.responsavel} · origem{' '}
                {d.origem ?? '—'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Pill cor={COR_PRAZO[d.prazo.tom]}>{d.prazo.rotulo}</Pill>
              <a href={`/fichas?ficha=${d.pessoaId}`} className={BOTAO}>
                Abrir ficha
              </a>
              {!revelando && (
                <button type="button" onClick={() => setRevelando(true)} className={BOTAO}>
                  Revelar CPF
                </button>
              )}
              <button type="button" onClick={onFechar} className={BOTAO}>
                Fechar
              </button>
            </div>
          </header>
          {mensagem && (
            <p role="status" className="rounded-md border-l-4 border-sucesso bg-sucesso-claro p-3">
              {mensagem}
            </p>
          )}
          {revelando && (
            <FormularioRevelarCpf onRevelar={revelar} onCancelar={() => setRevelando(false)} />
          )}

          {d.acoes.includes('ENCAMINHAR') && (
            <FormEncaminhar onEnviar={(c) => agir('encaminhar', c, 'Caso encaminhado.')} />
          )}
          {d.acoes.includes('VISITA') && (
            <FormVisita onEnviar={(c) => agir('visita', c, 'Visita registrada.')} />
          )}
          {d.acoes.includes('MATRICULAR') && (
            <FormMatricula
              onEnviar={(c) => agir('matricula', c, 'Matrícula registrada. O caso foi concluído.')}
            />
          )}
          {d.acoes.includes('CONSELHO') && (
            <FormConselho
              onEnviar={() =>
                agir('conselho-tutelar', {}, 'Conselho Tutelar comunicado. O caso foi encerrado.')
              }
            />
          )}
          {d.acoes.length === 0 && !d.encerrado && (
            <p className="text-texto">
              Seu perfil acompanha este caso; a próxima etapa é de outra equipe.
            </p>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <section aria-labelledby="trilha-ba">
              <h3 id="trilha-ba" className="mb-2 font-semibold text-texto-forte">
                Trilha do caso
              </h3>
              <ol className="flex flex-col gap-1 border-l-2 border-borda pl-4">
                {d.trilha.eventos.map((e) => (
                  <li key={e.seq}>
                    <span className="font-semibold text-texto-forte">
                      {ROTULO_EVENTO[e.tipo] ?? e.tipo}
                    </span>
                    {e.destino && ` · ${ROTULO_SECRETARIA_BUSCA_ATIVA[e.destino] ?? e.destino}`}
                    {e.familiaLocalizada !== null &&
                      ` · ${e.familiaLocalizada ? 'família localizada' : 'família não localizada'}`}{' '}
                    · {dataBr(e.ocorridoEm)}
                  </li>
                ))}
              </ol>
              {d.trilha.verificador && (
                <p className="mt-2 text-sm text-texto-suave">
                  Código verificador da trilha:{' '}
                  <span className="font-mono">{d.trilha.verificador}</span>
                </p>
              )}
            </section>
            <section aria-labelledby="visitas-ba">
              <h3 id="visitas-ba" className="mb-2 font-semibold text-texto-forte">
                Relatos de visita
              </h3>
              {d.visitas.length === 0 ? (
                <p className="text-texto">Nenhuma visita registrada no sistema.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {d.visitas.map((v, i) => (
                    <li key={i} className="border-l-4 border-primaria pl-3">
                      <span className="block text-sm text-texto-suave">{dataBr(v.quando)}</span>
                      <p className="whitespace-pre-line">{v.relato}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </section>
  );
}

type Enviar<T> = (c: T) => Promise<Record<string, string> | null>;

function Erro({ id, texto }: { id: string; texto: string | undefined }) {
  return texto ? (
    <p id={id} className="text-sm text-erro">
      {texto}
    </p>
  ) : null;
}

function FormEncaminhar({ onEnviar }: { onEnviar: Enviar<{ secretaria: string }> }) {
  const [erros, setErros] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  async function enviar(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    setEnviando(true);
    setErros(
      (await onEnviar({ secretaria: String(new FormData(ev.currentTarget).get('secretaria')) })) ??
        {},
    );
    setEnviando(false);
  }
  return (
    <form
      onSubmit={enviar}
      className="flex flex-wrap items-end gap-3 rounded-md border border-borda-suave bg-superficie p-3"
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="secretaria" className="font-semibold text-texto-forte">
          Encaminhar à secretaria
        </label>
        <select
          id="secretaria"
          name="secretaria"
          className={CAMPO}
          aria-describedby={erros.secretaria ? 'secretaria-erro' : undefined}
        >
          {SECRETARIAS_BUSCA_ATIVA.map((s) => (
            <option key={s} value={s}>
              {ROTULO_SECRETARIA_BUSCA_ATIVA[s]}
            </option>
          ))}
        </select>
        <Erro id="secretaria-erro" texto={erros.secretaria} />
      </div>
      <button type="submit" disabled={enviando} className={BOTAO_PRIMARIO}>
        {enviando ? 'Encaminhando…' : 'Encaminhar'}
      </button>
      {erros.geral && (
        <p role="alert" className="w-full text-erro">
          {erros.geral}
        </p>
      )}
    </form>
  );
}

function FormVisita({ onEnviar }: { onEnviar: Enviar<{ localizada: boolean; relato: string }> }) {
  const [erros, setErros] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  async function enviar(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    const r = VisitaBuscaAtiva.safeParse({
      localizada: f.get('localizada') === null ? undefined : f.get('localizada') === 'sim',
      relato: String(f.get('relato') ?? ''),
    });
    if (!r.success) {
      const e: Record<string, string> = {};
      for (const i of r.error.issues) e[String(i.path[0])] ??= i.message;
      setErros(e);
      document.getElementById(e.localizada ? 'localizada-sim' : 'relato')?.focus();
      return;
    }
    setEnviando(true);
    setErros((await onEnviar(r.data)) ?? {});
    setEnviando(false);
  }
  return (
    <form
      onSubmit={enviar}
      noValidate
      className="flex flex-col gap-3 rounded-md border border-borda-suave bg-superficie p-3"
    >
      <fieldset aria-describedby={erros.localizada ? 'localizada-erro' : undefined}>
        <legend className="font-semibold text-texto-forte">A família foi localizada?</legend>
        <div className="flex gap-4">
          <label className="flex min-h-[var(--spacing-alvo)] items-center gap-2">
            <input
              id="localizada-sim"
              type="radio"
              name="localizada"
              value="sim"
              className="h-5 w-5"
            />{' '}
            Sim
          </label>
          <label className="flex min-h-[var(--spacing-alvo)] items-center gap-2">
            <input type="radio" name="localizada" value="nao" className="h-5 w-5" /> Não
          </label>
        </div>
        <Erro id="localizada-erro" texto={erros.localizada} />
      </fieldset>
      <div className="flex flex-col gap-1">
        <label htmlFor="relato" className="font-semibold text-texto-forte">
          Relato da visita
        </label>
        <textarea
          id="relato"
          name="relato"
          rows={3}
          className={`${CAMPO} py-2`}
          aria-invalid={!!erros.relato}
          aria-describedby={erros.relato ? 'relato-ajuda relato-erro' : 'relato-ajuda'}
        />
        <p id="relato-ajuda" className="text-sm text-texto-suave">
          O que foi visto e combinado com a família. Não registre diagnóstico nem código CID.
        </p>
        <Erro id="relato-erro" texto={erros.relato} />
      </div>
      <button type="submit" disabled={enviando} className={`${BOTAO_PRIMARIO} self-start`}>
        {enviando ? 'Registrando…' : 'Registrar visita'}
      </button>
      {erros.geral && (
        <p role="alert" className="text-erro">
          {erros.geral}
        </p>
      )}
    </form>
  );
}

function FormMatricula({ onEnviar }: { onEnviar: Enviar<{ inep: string }> }) {
  const [escolas, setEscolas] = useState<{ inep: string; nome: string }[]>([]);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  useEffect(() => {
    api<{ inep: string; nome: string }[]>('/escolas')
      .then(setEscolas)
      .catch(() => setEscolas([]));
  }, []);
  async function enviar(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const inep = String(new FormData(ev.currentTarget).get('inep') ?? '');
    if (!inep) {
      setErros({ inep: 'Escolha a escola.' });
      document.getElementById('inep')?.focus();
      return;
    }
    setEnviando(true);
    setErros((await onEnviar({ inep })) ?? {});
    setEnviando(false);
  }
  return (
    <form
      onSubmit={enviar}
      noValidate
      className="flex flex-wrap items-end gap-3 rounded-md border border-borda-suave bg-superficie p-3"
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="inep" className="font-semibold text-texto-forte">
          Registrar matrícula na escola
        </label>
        <select
          id="inep"
          name="inep"
          defaultValue=""
          className={CAMPO}
          aria-invalid={!!erros.inep}
          aria-describedby={erros.inep ? 'inep-erro' : undefined}
        >
          <option value="">Selecione a escola</option>
          {escolas.map((e) => (
            <option key={e.inep} value={e.inep}>
              {e.nome}
            </option>
          ))}
        </select>
        <Erro id="inep-erro" texto={erros.inep} />
      </div>
      <button type="submit" disabled={enviando} className={BOTAO_PRIMARIO}>
        {enviando ? 'Registrando…' : 'Registrar matrícula'}
      </button>
      {erros.geral && (
        <p role="alert" className="w-full text-erro">
          {erros.geral}
        </p>
      )}
    </form>
  );
}

function FormConselho({ onEnviar }: { onEnviar: Enviar<object> }) {
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-borda-suave bg-superficie p-3">
      <p className="text-texto">
        A família não foi localizada. Comunique o Conselho Tutelar: o caso será encerrado e fica na
        trilha.
      </p>
      <button
        type="button"
        disabled={enviando}
        onClick={async () => {
          setEnviando(true);
          const r = await onEnviar({});
          setErro(r?.geral ?? null);
          setEnviando(false);
        }}
        className={BOTAO_PRIMARIO}
      >
        {enviando ? 'Registrando…' : 'Comunicar o Conselho Tutelar'}
      </button>
      {erro && (
        <p role="alert" className="w-full text-erro">
          {erro}
        </p>
      )}
    </div>
  );
}
