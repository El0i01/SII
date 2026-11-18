'use client';

import {
  CAMADAS_MAPA,
  type CamadaMapa,
  COR_SITUACAO_LOTE,
  ehCamadaMapa,
  faixaIvm,
  type IndicadoresQuadra,
  LEGENDA_CAMADA_MAPA,
  ROTULO_CAMADA_MAPA,
  ROTULO_SITUACAO_LOTE,
  type SituacaoLote,
  valorCamada,
} from '@sii/shared';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GeoTerritorio } from '@/components/mapa/mapa';
import { Botao } from '@/components/ui/button';
import { CabecalhoPagina } from '@/components/ui/cabecalho-pagina';
import { Card } from '@/components/ui/card';
import { Carregando, Erro, SemPermissao, Vazio } from '@/components/ui/estado';
import { GradeKpis, Kpi } from '@/components/ui/kpi';
import { Pill } from '@/components/ui/pill';
import { type Coluna, Tabela } from '@/components/ui/tabela';
import { api, ErroApi } from '@/lib/api';
import { gravarParametrosDaTela, useFiltrosGlobais } from '@/lib/filtros-url';
import {
  type DetalheQuadra,
  FUNDO_TOKEN,
  idadeTexto,
  type RespostaPontos,
  type RespostaQuadras,
  sinaisDoMorador,
} from '@/lib/mapa';
import { cn } from '@/lib/utils';

const Mapa = dynamic(() => import('@/components/mapa/mapa'), {
  ssr: false,
  loading: () => <Carregando rotulo="Carregando o mapa" altura="h-[420px]" />,
});

type Estado =
  | { tipo: 'carregando' }
  | { tipo: 'erro'; mensagem: string }
  | { tipo: 'sem-permissao' }
  | { tipo: 'pronto'; dados: RespostaQuadras; geo: GeoTerritorio; pontos: RespostaPontos | null };

const CAMPO =
  'min-h-[var(--spacing-alvo)] rounded-md border border-borda bg-fundo px-3 text-texto-forte';
const fmt = (n: number | null) => (n === null ? '< 5' : n.toLocaleString('pt-BR'));

/** Camadas do P06 que o mapa desenha (zoom 16: quadras com detalhe; lotes no zoom de lote). */
async function carregarGeo(): Promise<GeoTerritorio> {
  const [limite, setores, quadras, lotes, ruas, equipamentos] = await Promise.all(
    (
      [
        ['limite', 12],
        ['setores', 14],
        ['quadras', 16],
        ['lotes', 17],
        ['ruas', 15],
        ['equipamentos', 17],
      ] as const
    ).map(([c, z]) => api<unknown>(`/territorio/${c}.geojson?zoom=${z}`)),
  );
  return { limite, setores, quadras, lotes, ruas, equipamentos };
}

function Legenda({ camada, equipamentos }: { camada: CamadaMapa; equipamentos: boolean }) {
  return (
    <ul
      aria-label={`Legenda: ${ROTULO_CAMADA_MAPA[camada]}`}
      className="flex flex-wrap gap-x-4 gap-y-1 text-sm"
    >
      {LEGENDA_CAMADA_MAPA[camada].map((i) => (
        <li key={i.classe} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={cn('h-3 w-3 rounded-sm border border-borda', FUNDO_TOKEN[i.cor])}
          />
          {i.rotulo}
        </li>
      ))}
      {equipamentos &&
        (['E Escola', 'S Saúde', 'A Assistência'] as const).map((t) => (
          <li key={t} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={cn(
                'marcador-equipamento marcador-legenda',
                t[0] === 'S' && 'marcador-saude',
                t[0] === 'A' && 'marcador-assistencia',
              )}
            >
              {t[0]}
            </span>
            {t.slice(2)}
          </li>
        ))}
    </ul>
  );
}

function Detalhe({
  quadra,
  agregado,
  onFechar,
}: {
  quadra: IndicadoresQuadra;
  agregado: boolean;
  onFechar: () => void;
}) {
  const [d, setD] = useState<DetalheQuadra | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const titulo = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    setD(null);
    setErro(null);
    api<DetalheQuadra>(`/mapa/quadras/${quadra.id}`)
      .then(setD)
      .catch((e) => setErro(e instanceof Error ? e.message : 'Não foi possível abrir a quadra.'));
    titulo.current?.focus();
  }, [quadra.id]);
  const i = d?.indicadores ?? quadra;
  const ivm =
    i.ivm === null
      ? 'Sem informação'
      : `${i.ivm.toFixed(2).replace('.', ',')} · ${faixaIvm(i.ivm).rotulo}`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 ref={titulo} tabIndex={-1} className="text-lg font-semibold text-texto-forte">
            Quadra {quadra.codigo}
          </h3>
          <p className="text-sm text-texto-suave">
            Setor {quadra.setor} · {quadra.lotes} lotes
            {quadra.provisoria ? ' (grade provisória)' : ''}
          </p>
        </div>
        <Botao variante="link" tamanho="pequeno" onClick={onFechar}>
          Fechar
        </Botao>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-texto-suave">Índice de vulnerabilidade</dt>
        <dd className="text-texto-forte">{ivm}</dd>
        <dt className="text-texto-suave">Lotes irregulares</dt>
        <dd className="text-texto-forte">
          {i.lotesIrregulares} de {i.lotes}
        </dd>
        <dt className="text-texto-suave">Crianças de 0 a 3 anos</dt>
        <dd className="text-texto-forte">{fmt(i.criancas03)}</dd>
        <dt className="text-texto-suave">Crianças que precisam de visita</dt>
        <dd className="text-texto-forte">{fmt(i.criancasVisita)}</dd>
        <dt className="text-texto-suave">Famílias no Criança Feliz</dt>
        <dd className="text-texto-forte">{fmt(i.familiasPcf)}</dd>
        <dt className="text-texto-suave">Pessoas idosas</dt>
        <dd className="text-texto-forte">
          {fmt(i.idosos)} ({fmt(i.idososSozinhos)} sozinhas)
        </dd>
        <dt className="text-texto-suave">Casos de busca ativa</dt>
        <dd className="text-texto-forte">{fmt(i.casosBuscaAtiva)}</dd>
      </dl>
      {erro && <Erro mensagem={erro} />}
      {!d && !erro && <Carregando rotulo="Carregando os lotes" altura="h-32" />}
      {d && (
        <>
          <h4 className="font-semibold text-texto-forte">Lotes</h4>
          {agregado && (
            <p className="text-sm text-texto-suave">
              Seu perfil vê só os números da quadra. Quem mora em cada lote aparece para as equipes
              que acompanham as famílias.
            </p>
          )}
          <ul className="flex flex-col gap-2">
            {d.lotes.map((l) => (
              <li key={l.numero} className="flex gap-2 rounded-md border border-borda-suave p-2">
                <span
                  aria-hidden="true"
                  className={cn(
                    'w-1.5 shrink-0 rounded-sm',
                    FUNDO_TOKEN[COR_SITUACAO_LOTE[l.situacao] ?? 'superficie'],
                  )}
                />
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-sm">
                    <b className="text-texto-forte">L{String(l.numero).padStart(2, '0')}</b> ·{' '}
                    {ROTULO_SITUACAO_LOTE[l.situacao as SituacaoLote] ?? l.situacao}
                  </span>
                  {l.moradores && l.moradores.length === 0 && (
                    <span className="text-sm text-texto-suave">Ninguém cadastrado neste lote.</span>
                  )}
                  {l.moradores && l.moradores.length > 0 && (
                    <ul className="flex flex-col gap-1">
                      {l.moradores.map((m, k) => (
                        <li key={k} className="flex flex-wrap items-center gap-1 text-sm">
                          <span className="text-texto-forte">
                            {m.iniciais}, {idadeTexto(m.idade)}
                          </span>
                          {sinaisDoMorador(m).map((s) => (
                            <Pill
                              key={s}
                              tom={
                                s === 'Precisa de visita' ||
                                s === 'Busca ativa' ||
                                s === 'Pessoa idosa sozinha'
                                  ? 'alerta'
                                  : 'info'
                              }
                            >
                              {s}
                            </Pill>
                          ))}
                          {m.fichaId && (
                            <Link
                              className="text-primaria underline"
                              href={`/fichas?ficha=${m.fichaId}`}
                            >
                              Abrir ficha<span className="sr-only"> de {m.iniciais}</span>
                            </Link>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/**
 * Território (§3.1, P15), como no protótipo: setores, quadras, lotes e equipamentos do geoportal,
 * 7 camadas e o detalhe da quadra. A lista de quadras é a alternativa ao mapa pelo teclado.
 */
export default function Territorio() {
  const [filtros] = useFiltrosGlobais();
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' });
  const [camada, setCamada] = useState<CamadaMapa>('vul');
  const [equip, setEquip] = useState(true);
  const [aberta, setAberta] = useState<number | null>(null);
  const [pronto, setPronto] = useState(false);
  const territorio = filtros?.territorio ?? null;

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const c = p.get('camada');
    if (ehCamadaMapa(c)) setCamada(c);
    if (p.get('equipamentos') === 'nao') setEquip(false);
    const q = Number(p.get('quadra'));
    if (q) setAberta(q);
    setPronto(true);
  }, []);
  useEffect(() => {
    if (pronto)
      gravarParametrosDaTela({
        camada: camada === 'vul' ? null : camada,
        equipamentos: equip ? null : 'nao',
        quadra: aberta ? String(aberta) : null,
      });
  }, [pronto, camada, equip, aberta]);

  const carregar = useCallback(async () => {
    if (!filtros) return;
    try {
      const sufixo = territorio ? `?territorio=${territorio}` : '';
      const [dados, geo] = await Promise.all([
        api<RespostaQuadras>(`/mapa/quadras${sufixo}`),
        carregarGeo(),
      ]);
      // Pontos individuais só para perfis nominais; o agregado usa o centro da quadra.
      const pontos = dados.agregado ? null : await api<RespostaPontos>(`/mapa/pontos${sufixo}`);
      setEstado({ tipo: 'pronto', dados, geo, pontos });
    } catch (e) {
      if (e instanceof ErroApi && e.status === 403) setEstado({ tipo: 'sem-permissao' });
      else if (!(e instanceof ErroApi && e.status === 401))
        setEstado({
          tipo: 'erro',
          mensagem: e instanceof Error ? e.message : 'Não foi possível carregar.',
        });
    }
  }, [filtros, territorio]);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  const dados = estado.tipo === 'pronto' ? estado.dados : null;
  const quadras = useMemo(() => dados?.quadras ?? [], [dados]);
  const quadraAberta = quadras.find((q) => q.id === aberta) ?? null;

  const colunas = useMemo<Coluna<IndicadoresQuadra>[]>(
    () => [
      {
        accessorKey: 'codigo',
        header: 'Quadra',
        cell: (c) => <b className="text-texto-forte">{c.getValue<string>()}</b>,
      },
      { accessorKey: 'setor', header: 'Setor' },
      {
        id: 'valor',
        header: ROTULO_CAMADA_MAPA[camada],
        accessorFn: (q) => valorCamada(camada, q).ordem,
        cell: (c) => valorCamada(camada, c.row.original).texto,
      },
      {
        id: 'abrir',
        header: 'Detalhe',
        enableSorting: false,
        cell: (c) => (
          <Botao
            variante="contorno"
            tamanho="pequeno"
            aria-pressed={aberta === c.row.original.id}
            onClick={() => setAberta(c.row.original.id)}
          >
            Ver quadra<span className="sr-only"> {c.row.original.codigo}</span>
          </Botao>
        ),
      },
    ],
    [camada, aberta],
  );

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoPagina
        titulo="Território"
        descricao="Setores da zona urbana e equipamentos públicos vindos do Geoportal. Escolha uma camada e clique em uma quadra (ou use a lista de quadras) para ver os lotes e quem mora neles."
        fontes="Fontes: Geoportal (setores, ruas, escolas, saúde, assistência), Censo Municipal, cadastro imobiliário"
      />
      {estado.tipo === 'carregando' && (
        <Carregando rotulo="Carregando o território" altura="h-96" />
      )}
      {estado.tipo === 'erro' && (
        <Erro mensagem={estado.mensagem} onTentar={() => void carregar()} />
      )}
      {estado.tipo === 'sem-permissao' && (
        <SemPermissao>
          O mapa do território é das equipes das secretarias, do Comitê e do controle externo.
        </SemPermissao>
      )}
      {estado.tipo === 'pronto' && dados && (
        <>
          <Card
            titulo="Mapa da zona urbana"
            subtitulo="Setores e equipamentos reais. As quadras são uma grade provisória alinhada às ruas, até a malha de quadras e lotes ser carregada."
          >
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-end gap-4">
                <div className="flex w-full min-w-0 flex-col gap-1 sm:w-auto">
                  <label htmlFor="camada" className="font-semibold text-texto-forte">
                    Camada
                  </label>
                  <select
                    id="camada"
                    className={cn(CAMPO, 'w-full max-w-full')}
                    value={camada}
                    onChange={(e) => setCamada(e.target.value as CamadaMapa)}
                  >
                    {CAMADAS_MAPA.map((c) => (
                      <option key={c} value={c}>
                        {ROTULO_CAMADA_MAPA[c]}
                      </option>
                    ))}
                  </select>
                </div>
                <label className="flex min-h-[var(--spacing-alvo)] items-center gap-2 text-texto-forte">
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    checked={equip}
                    onChange={(e) => setEquip(e.target.checked)}
                  />
                  Mostrar equipamentos públicos
                </label>
              </div>
              <Legenda camada={camada} equipamentos={equip} />
              {dados.agregado && (
                <p className="text-sm text-texto-suave">
                  Seu perfil vê só números por quadra: o calor sai do centro de cada quadra e
                  quadras com menos de 5 pessoas não entram.
                </p>
              )}
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[3fr_2fr]">
                <Mapa
                  geo={estado.geo}
                  quadras={quadras}
                  pontos={estado.pontos}
                  camada={camada}
                  equipamentos={equip}
                  territorio={territorio}
                  selecionada={aberta}
                  onSelecionar={setAberta}
                />
                <section aria-live="polite" aria-label="Detalhe da quadra" className="min-w-0">
                  {quadraAberta ? (
                    <Detalhe
                      quadra={quadraAberta}
                      agregado={dados.agregado}
                      onFechar={() => setAberta(null)}
                    />
                  ) : (
                    <Vazio titulo="Nenhuma quadra selecionada">
                      Clique em uma quadra do mapa, ou use &quot;Ver quadra&quot; na lista abaixo,
                      para ver os lotes e quem mora neles.
                    </Vazio>
                  )}
                </section>
              </div>
            </div>
          </Card>

          <Card
            titulo="Quadras"
            subtitulo="A mesma informação do mapa, em lista: ordene pela camada escolhida."
          >
            <Tabela
              dados={quadras}
              colunas={colunas}
              legenda={`Quadras e ${ROTULO_CAMADA_MAPA[camada].toLowerCase()}`}
              porPagina={15}
              idLinha={(q) => String(q.id)}
              destacar={(q) => q.id === aberta}
              busca={{
                rotulo: 'Buscar quadra ou setor',
                placeholder: 'Ex.: Q012 ou S02',
                atende: (q, t) => `${q.codigo} ${q.setor}`.toLowerCase().includes(t),
              }}
              vazio={{
                titulo: 'Nenhuma quadra neste território',
                texto: 'Escolha "Todo o município" no cabeçalho.',
              }}
            />
          </Card>

          <Card
            titulo="Zona rural"
            subtitulo="Endereços em Linha, Lote e Gleba, localizados pelos polígonos do SIGEF/INCRA e do CAR."
          >
            <GradeKpis>
              <Kpi rotulo="Domicílios rurais" valor={dados.rural.domicilios} tom="info" />
              <Kpi
                rotulo="Escolas rurais"
                valor={dados.rural.escolas}
                detalhe="fora da área do mapa"
              />
              <Kpi
                rotulo="Localizados por SIGEF/CAR"
                valor={dados.rural.sigefPct === null ? null : `${dados.rural.sigefPct}%`}
                detalhe="polígono do imóvel rural"
              />
              <Kpi
                rotulo="Ainda com baixa precisão"
                valor={
                  dados.rural.baixaPrecisaoPct === null ? null : `${dados.rural.baixaPrecisaoPct}%`
                }
                detalhe="centro do setor"
                tom="alerta"
              />
              {!dados.agregado && (
                <Kpi
                  rotulo="Casos de busca ativa"
                  valor={dados.rural.casosBuscaAtiva}
                  tom="critico"
                />
              )}
            </GradeKpis>
          </Card>
        </>
      )}
    </div>
  );
}
