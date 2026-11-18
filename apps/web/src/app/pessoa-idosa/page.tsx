'use client';

import type { CRITERIOS_IDOSA } from '@sii/shared';
import { type ContagemPorSetor, CRUZAMENTOS_IDOSA, pctContagem } from '@sii/shared';
import Link from 'next/link';
import { Barras } from '@/components/ui/barras';
import { BarraMeta } from '@/components/ui/barra-meta';
import { Botao } from '@/components/ui/button';
import { CabecalhoPagina } from '@/components/ui/cabecalho-pagina';
import { Card } from '@/components/ui/card';
import { Carregando, Erro, SemPermissao, Vazio } from '@/components/ui/estado';
import { GradeKpis, Kpi } from '@/components/ui/kpi';
import { Pill } from '@/components/ui/pill';
import { type Coluna, Tabela } from '@/components/ui/tabela';
import { textoN, textoPct, usePainel } from '@/lib/painel';

type Chave = keyof typeof CRITERIOS_IDOSA;
interface Prioritaria {
  codigo: string;
  iniciais: string;
  idade: number;
  endereco: string;
  motivos: string[];
  diasSemVisitaAcs: number | null;
}
interface Dados {
  agregado: boolean;
  setores: { codigo: string; nome: string }[];
  contagens: ContagemPorSetor<Chave>;
  prioritarias?: Prioritaria[];
}
type Linha = { setor: string; nome: string; v: Record<Chave, number | null> };

const META_GRIPE = 90;
const COLUNAS: Coluna<Linha>[] = [
  { accessorKey: 'nome', header: 'Território', cell: (c) => <b>{c.getValue<string>()}</b> },
  ...(
    [
      ['pessoas', '60+'],
      ['sozinhas', 'Sozinhas'],
      ['bpc', 'BPC'],
      ['acamadas', 'Acamadas'],
      ['semVisita90', 'Sem visita 90+ dias'],
    ] as const
  ).map(([k, h]) => ({
    id: k,
    header: h,
    numerica: true,
    accessorFn: (l: Linha) => l.v[k] ?? -1,
    cell: (c: { row: { original: Linha } }) => textoN(c.row.original.v[k]),
  })),
  {
    id: 'gripe',
    header: 'Vacina da gripe',
    accessorFn: (l) => pctContagem(l.v.gripeEmDia, l.v.gripeInformada) ?? -1,
    cell: (c) => (
      <BarraMeta
        valor={pctContagem(c.row.original.v.gripeEmDia, c.row.original.v.gripeInformada)}
        meta={META_GRIPE}
      />
    ),
  },
  {
    id: 'cronicos',
    header: 'Crônicos acompanhados',
    enableSorting: false,
    cell: (c) =>
      `${textoN(c.row.original.v.cronicasAcompanhadas)} de ${textoN(c.row.original.v.cronicas)}`,
  },
  {
    id: 'scfv',
    header: 'Convivência',
    numerica: true,
    accessorFn: (l) => l.v.scfv ?? -1,
    cell: (c) => textoN(c.row.original.v.scfv),
  },
];

const COLUNAS_PRIORITARIAS: Coluna<Prioritaria>[] = [
  {
    accessorKey: 'codigo',
    header: 'Código',
    cell: (c) => <b className="whitespace-nowrap">{c.getValue<string>()}</b>,
  },
  { accessorKey: 'iniciais', header: 'Pessoa', enableSorting: false },
  { accessorKey: 'idade', header: 'Idade', numerica: true },
  { accessorKey: 'endereco', header: 'Endereço' },
  {
    id: 'motivos',
    header: 'Alertas',
    accessorFn: (p) => p.motivos.length,
    cell: (c) => (
      <span className="flex flex-wrap gap-1">
        {c.row.original.motivos.map((m) => (
          <Pill key={m} tom="alerta">
            {m}
          </Pill>
        ))}
      </span>
    ),
  },
];

const TOM: Record<string, 'critico' | 'alerta' | 'info'> = {
  critico: 'critico',
  alerta: 'alerta',
  info: 'info',
};

/** Pessoa idosa (60+, §3.9, P19): cruzamentos Saúde × Assistência e lista prioritária. */
export default function PessoaIdosa() {
  const { estado, carregar } = usePainel<Dados>('/ciclos/pessoa-idosa');
  const d = estado.tipo === 'pronto' ? estado.dados : null;
  const t = d?.contagens.total;
  const nome = (s: string) => d?.setores.find((x) => x.codigo === s)?.nome ?? s;
  const gripe = t ? pctContagem(t.gripeEmDia, t.gripeInformada) : null;
  return (
    <div className="flex flex-col gap-6">
      <CabecalhoPagina
        titulo="Pessoa idosa"
        descricao="Acompanhamento das pessoas com 60 anos ou mais, cruzando a Saúde (visitas do ACS, vacinação, condições crônicas) com a Assistência Social (BPC, CRAS e Serviço de Convivência)."
        fontes="Fontes: e-SUS PEC, CadÚnico, CRAS"
      />
      {estado.tipo === 'carregando' && (
        <Carregando rotulo="Carregando a pessoa idosa" altura="h-96" />
      )}
      {estado.tipo === 'erro' && (
        <Erro mensagem={estado.mensagem} onTentar={() => void carregar()} />
      )}
      {estado.tipo === 'sem-permissao' && (
        <SemPermissao>
          Este painel é das equipes das secretarias, do Comitê e do controle externo.
        </SemPermissao>
      )}
      {d && t && t.pessoas === 0 && (
        <Vazio titulo="Nenhuma pessoa com 60 anos ou mais neste território">
          Escolha &quot;Todo o município&quot; no cabeçalho.
        </Vazio>
      )}
      {d && t && t.pessoas !== 0 && (
        <>
          <GradeKpis>
            <Kpi rotulo="Pessoas com 60 anos ou mais" valor={t.pessoas} tom="info" />
            <Kpi
              rotulo="Moram sozinhas"
              valor={t.sozinhas}
              detalhe={`${textoPct(pctContagem(t.sozinhas, t.pessoas))} das pessoas idosas`}
              tom="alerta"
            />
            <Kpi rotulo="Sem visita do ACS há 90+ dias" valor={t.semVisita90} tom="critico" />
            <Kpi
              rotulo="Vacina da gripe em dia"
              valor={textoPct(gripe)}
              detalhe={`meta ${META_GRIPE}%`}
              tom={(gripe ?? 0) >= META_GRIPE ? 'bom' : 'alerta'}
            />
            <Kpi rotulo="No Serviço de Convivência" valor={t.scfv} detalhe="grupos do CRAS" />
          </GradeKpis>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[3fr_2fr]">
            <Card
              titulo="Cruzamentos Saúde × Assistência"
              subtitulo="Situações que pedem ação conjunta"
            >
              <ul className="flex flex-col gap-2">
                {CRUZAMENTOS_IDOSA.map((c) => (
                  <li
                    key={c.chave}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-borda-suave p-3"
                  >
                    <span>
                      <b className="text-texto-forte">
                        {textoN(t[c.chave])} {c.titulo}
                      </b>
                      <span className="block text-sm text-texto-suave">{c.detalhe}</span>
                    </span>
                    <Pill tom={TOM[c.tom] ?? 'info'}>{c.secretaria}</Pill>
                  </li>
                ))}
              </ul>
            </Card>
            <Card
              titulo="Sozinhas e sem visita, por território"
              subtitulo="Moram sozinhas e estão sem visita do ACS há mais de 90 dias"
            >
              <Barras
                titulo="Pessoas idosas sozinhas sem visita"
                itens={d.contagens.porSetor.map((p) => ({
                  rotulo: nome(p.setor),
                  valor: p.valores.sozinhaSemVisita,
                }))}
              />
              <Botao asChild variante="contorno" tamanho="pequeno" className="mt-3">
                <Link href="/territorio?camada=calorIdosos">Ver no mapa de calor</Link>
              </Botao>
            </Card>
          </div>
          <Card titulo="Indicadores por território">
            <Tabela
              dados={d.contagens.porSetor.map((p) => ({
                setor: p.setor,
                nome: nome(p.setor),
                v: p.valores,
              }))}
              colunas={COLUNAS}
              legenda="Pessoa idosa por território"
              contagem={false}
              idLinha={(l) => l.setor}
              densa
            />
          </Card>
          <Card
            titulo="Lista prioritária de visitas"
            subtitulo="Pessoas com três ou mais alertas. Nenhuma condição de saúde é exibida por nome."
          >
            {d.prioritarias === undefined ? (
              <SemPermissao>
                Seu perfil vê só os números. A lista nominal é das equipes que acompanham as
                famílias.
              </SemPermissao>
            ) : d.prioritarias.length === 0 ? (
              <Vazio titulo="Nenhuma pessoa com três ou mais alertas" />
            ) : (
              <Tabela
                dados={d.prioritarias}
                colunas={COLUNAS_PRIORITARIAS}
                legenda="Lista prioritária (iniciais; nome só na ficha)"
                idLinha={(p) => p.codigo}
                porPagina={12}
                busca={{
                  rotulo: 'Buscar por código, iniciais ou endereço',
                  atende: (p, q) =>
                    `${p.codigo} ${p.iniciais} ${p.endereco}`.toLowerCase().includes(q),
                }}
                densa
              />
            )}
          </Card>
        </>
      )}
    </div>
  );
}
