'use client';

import {
  ORIGENS_ALERTA,
  type RevelarCpf,
  ROTULO_SECRETARIA_BUSCA_ATIVA,
  ROTULO_STATUS_BUSCA_ATIVA,
  SECRETARIAS_BUSCA_ATIVA,
  STATUS_BUSCA_ATIVA,
  type StatusBuscaAtiva,
  VisitaBuscaAtiva,
} from '@sii/shared';
import Link from 'next/link';
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { type ErrosRevelar, FormularioRevelarCpf } from '@/components/revelar-cpf';
import { Barras } from '@/components/ui/barras';
import { Botao } from '@/components/ui/button';
import { CabecalhoPagina } from '@/components/ui/cabecalho-pagina';
import { Card } from '@/components/ui/card';
import { Carregando, Erro as ErroTela, SemPermissao, Sucesso } from '@/components/ui/estado';
import { GradeKpis, Kpi } from '@/components/ui/kpi';
import { Pill, type Tom, tomDoPrazo } from '@/components/ui/pill';
import { type Coluna, Tabela } from '@/components/ui/tabela';
import { api, ErroApi } from '@/lib/api';
import {
  atendeBuscaCaso,
  atendeSituacao,
  csvDosCasos,
  type DetalheBuscaAtiva,
  type FiltroSituacao,
  type ItemBuscaAtiva,
  type PainelBuscaAtiva,
} from '@/lib/busca-ativa';
import { dataBr, ROTULO_EVENTO } from '@/lib/casos';
import { gravarParametrosDaTela, useFiltrosGlobais } from '@/lib/filtros-url';

const CAMPO =
  'min-h-[var(--spacing-alvo)] rounded-md border border-borda bg-fundo px-3 text-texto-forte';

const TOM_STATUS: Record<StatusBuscaAtiva, Tom> = {
  IDENTIFICADO: 'neutro',
  ENCAMINHADO: 'info',
  VISITA_REALIZADA: 'alerta',
  MATRICULADO: 'bom',
  NAO_LOCALIZADO: 'critico',
};

type EstadoLista =
  | { tipo: 'carregando' }
  | { tipo: 'erro'; mensagem: string }
  | { tipo: 'sem-permissao' }
  | { tipo: 'pronto'; itens: ItemBuscaAtiva[] };

function colunas(
  abrir: (codigo: string) => void,
  revelados: Record<string, string>,
): Coluna<ItemBuscaAtiva>[] {
  return [
    {
      accessorKey: 'codigo',
      header: 'Caso',
      cell: (c) => (
        <Botao
          variante="link"
          onClick={() => abrir(c.row.original.codigo)}
          aria-label={`Abrir o caso ${c.row.original.codigo}`}
          className="whitespace-nowrap"
        >
          {c.row.original.codigo}
        </Botao>
      ),
    },
    {
      accessorKey: 'iniciais',
      header: 'Criança',
      cell: (c) => <span className="whitespace-nowrap">{c.getValue<string>()}</span>,
    },
    {
      id: 'cpf',
      header: 'CPF',
      enableSorting: false,
      cell: (c) => (
        <span className="font-mono text-sm whitespace-nowrap">
          {revelados[c.row.original.codigo] ?? c.row.original.cpf ?? '—'}
        </span>
      ),
    },
    { accessorKey: 'idade', header: 'Idade', numerica: true },
    {
      id: 'localidade',
      header: 'Quadra/Linha',
      accessorFn: (i) => i.localidade ?? '',
      cell: (c) => (
        <>
          {c.row.original.localidade ?? '—'}
          {c.row.original.setor && (
            <span className="block text-sm text-texto-suave">{c.row.original.setor}</span>
          )}
        </>
      ),
    },
    { id: 'origem', header: 'Origem', accessorFn: (i) => i.origem ?? '—' },
    { accessorKey: 'rotuloResponsavel', header: 'Responsável' },
    {
      id: 'status',
      header: 'Situação',
      accessorFn: (i) => ROTULO_STATUS_BUSCA_ATIVA[i.status],
      cell: (c) => <Pill tom={TOM_STATUS[c.row.original.status]}>{c.getValue<string>()}</Pill>,
    },
    { accessorKey: 'dias', header: 'Dias', numerica: true },
    {
      id: 'prazo',
      header: 'Prazo',
      accessorFn: (i) => i.prazo.restante ?? 99,
      cell: (c) => (
        <Pill tom={tomDoPrazo(c.row.original.prazo.tom)}>{c.row.original.prazo.rotulo}</Pill>
      ),
    },
  ];
}

/**
 * Busca ativa escolar (§4.2, P13), como no protótipo: KPIs, funil, origem do alerta, prazos e a lista
 * de casos (CPF mascarado, exportação sem CPF nem nome). O auditor vê só os números.
 */
export default function BuscaAtiva() {
  const [filtros] = useFiltrosGlobais();
  const [painel, setPainel] = useState<PainelBuscaAtiva | null>(null);
  const [erroPainel, setErroPainel] = useState<string | null>(null);
  const [lista, setLista] = useState<EstadoLista>({ tipo: 'carregando' });
  const [situacao, setSituacao] = useState<FiltroSituacao>('todos');
  const [aberto, setAberto] = useState<string | null>(null);
  const [revelados, setRevelados] = useState<Record<string, string>>({});
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const s = p.get('situacao') as FiltroSituacao | null;
    if (s && (s === 'escalonados' || (STATUS_BUSCA_ATIVA as readonly string[]).includes(s)))
      setSituacao(s);
    setAberto(p.get('caso'));
    setPronto(true);
  }, []);
  useEffect(() => {
    if (pronto)
      gravarParametrosDaTela({ situacao: situacao === 'todos' ? null : situacao, caso: aberto });
  }, [pronto, situacao, aberto]);

  const territorio = filtros?.territorio ?? null;
  const carregar = useCallback(async () => {
    if (!filtros) return;
    try {
      setPainel(
        await api<PainelBuscaAtiva>(
          `/busca-ativa/painel${territorio ? `?territorio=${territorio}` : ''}`,
        ),
      );
      setErroPainel(null);
    } catch (e) {
      if (e instanceof ErroApi && e.status === 401) return;
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
  }, [filtros, territorio]);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  const filtrados = useMemo(
    () =>
      lista.tipo === 'pronto'
        ? lista.itens.filter(
            (i) => atendeSituacao(i, situacao) && (!territorio || i.setorCodigo === territorio),
          )
        : [],
    [lista, situacao, territorio],
  );
  const cols = useMemo(() => colunas(setAberto, revelados), [revelados]);

  const p = painel;
  return (
    <div className="flex flex-col gap-6">
      <CabecalhoPagina
        titulo="Busca ativa escolar"
        descricao="Crianças e adolescentes de 4 a 17 anos que aparecem no CadÚnico, no e-SUS ou no Censo Municipal sem matrícula na rede municipal nem na estadual."
        fontes="Fontes: CadÚnico, e-SUS PEC, gestão escolar, SEDUC-RO"
      />

      {erroPainel && <ErroTela mensagem={erroPainel} />}
      {!p && !erroPainel && <Carregando rotulo="Carregando o painel" altura="h-24" />}
      {p && (
        <>
          <GradeKpis>
            <Kpi
              rotulo="Identificados"
              valor={p.identificados}
              detalhe="desde jan/2026"
              tom="info"
            />
            <Kpi
              rotulo="Encaminhados em até 30 dias"
              valor={p.encaminhadosEm30 === null ? '—' : `${p.encaminhadosEm30}%`}
              detalhe="meta: 100%"
              tom="alerta"
            />
            <Kpi
              rotulo="Matriculados"
              valor={p.matriculados}
              detalhe={
                p.identificados && p.matriculados !== null
                  ? `${Math.round((p.matriculados * 100) / p.identificados)}% dos identificados`
                  : 'dos identificados'
              }
              tom="bom"
            />
            <Kpi
              rotulo="Não localizados"
              valor={p.naoLocalizados}
              detalhe="seguem para o Conselho Tutelar"
              tom="critico"
            />
            <Kpi
              rotulo="Escalonados ao Comitê"
              valor={p.escalonados}
              detalhe="vencidos há mais de 7 dias"
              tom="critico"
            />
          </GradeKpis>
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
          <div className="overflow-x-auto" tabIndex={0} aria-label="Prazos por etapa">
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">Prazos por etapa</caption>
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
          </div>
          <ul className="flex flex-col gap-2">
            {(
              [
                [
                  'Faltam 3 dias ou menos',
                  'Aviso ao responsável pelo caso e ao ponto focal',
                  'Nível 1',
                  'alerta',
                ],
                [
                  'Prazo vencido',
                  'Caso vai para a coordenação da secretaria',
                  'Nível 2',
                  'critico',
                ],
                [
                  'Vencido há mais de 7 dias',
                  'Entra na pauta da próxima reunião do Comitê Gestor',
                  'Nível 3',
                  'critico',
                ],
              ] as const
            ).map(([t, d, n, tom]) => (
              <li
                key={t}
                className="flex items-center justify-between gap-3 rounded-md border border-borda-suave p-3"
              >
                <span>
                  <b className="text-texto-forte">{t}</b>
                  <span className="block text-sm text-texto-suave">{d}</span>
                </span>
                <Pill tom={tom}>{n}</Pill>
              </li>
            ))}
          </ul>
        </div>
      </Card>

      <Card
        titulo="Casos"
        subtitulo="Lista de ação para as equipes, ordenada pelos casos mais antigos."
      >
        {lista.tipo === 'carregando' && <Carregando rotulo="Carregando os casos" altura="h-64" />}
        {lista.tipo === 'erro' && (
          <ErroTela mensagem={lista.mensagem} onTentar={() => void carregar()} />
        )}
        {lista.tipo === 'sem-permissao' && (
          <SemPermissao>
            Seu perfil vê só os números agregados da busca ativa. A lista nominal é das equipes.
          </SemPermissao>
        )}
        {lista.tipo === 'pronto' && (
          <Tabela
            dados={filtrados}
            colunas={cols}
            legenda="CPF mascarado por padrão. Revelar o CPF registra o acesso (quem, quando e finalidade)."
            legendaVisivel
            densa
            ordemInicial={[{ id: 'dias', desc: true }]}
            idLinha={(i) => i.codigo}
            destacar={(i) => i.codigo === aberto}
            busca={{
              rotulo: 'Buscar por caso, quadra, escola ou responsável',
              placeholder: 'Ex.: BA-2026-0329 ou Q052',
              atende: (i, q) => atendeBuscaCaso(i, q),
            }}
            filtros={
              <div className="flex flex-col gap-1">
                <label htmlFor="situacao" className="font-semibold text-texto-forte">
                  Situação
                </label>
                <select
                  id="situacao"
                  value={situacao}
                  onChange={(e) => setSituacao(e.target.value as FiltroSituacao)}
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
            }
            exportar={{
              arquivo: `busca-ativa-${new Date().toISOString().slice(0, 10)}.csv`,
              gerar: csvDosCasos,
            }}
            vazio={{
              titulo: 'Nenhum caso encontrado',
              texto:
                'Nenhum caso corresponde à busca e aos filtros. Limpe a busca, escolha outra situação ou outro território.',
              acao: (
                <Botao variante="contorno" onClick={() => setSituacao('todos')}>
                  Limpar filtros
                </Botao>
              ),
            }}
          />
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

const BOTAO =
  'inline-flex min-h-[var(--spacing-alvo)] items-center rounded-md border border-primaria px-4 font-semibold text-primaria disabled:opacity-60';
const BOTAO_PRIMARIO =
  'min-h-[var(--spacing-alvo)] rounded-md bg-primaria px-4 font-semibold text-fundo hover:bg-primaria-escura disabled:opacity-70';

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
              <Pill tom={tomDoPrazo(d.prazo.tom)}>{d.prazo.rotulo}</Pill>
              <Link href={`/fichas?ficha=${d.pessoaId}`} className={BOTAO}>
                Abrir ficha
              </Link>
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
          {mensagem && <Sucesso>{mensagem}</Sucesso>}
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
