'use client';

import { type ItemAtencao, percentual, rotuloMesCurto } from '@sii/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useSessao } from '@/components/layout/sessao';
import { Barras } from '@/components/ui/barras';
import { Botao } from '@/components/ui/button';
import { CabecalhoPagina } from '@/components/ui/cabecalho-pagina';
import { Card } from '@/components/ui/card';
import { Carregando, Erro, SemPermissao, Vazio } from '@/components/ui/estado';
import { GraficoLinha } from '@/components/ui/grafico-linha';
import { GradeKpis, Kpi } from '@/components/ui/kpi';
import { Pill, type Tom } from '@/components/ui/pill';
import { type Coluna, Tabela } from '@/components/ui/tabela';
import { api, ErroApi } from '@/lib/api';
import { ROTULO_TIPO_CASO } from '@/lib/casos';
import { useFiltrosGlobais } from '@/lib/filtros-url';
import { telaInicial } from '@/lib/menu';

interface ItemPauta {
  codigo: string;
  tipo: string;
  etapa: string;
  setor: string | null;
  responsavel: string;
  diasDesdeAlerta: number;
  diasDeAtraso: number | null;
}

interface VisaoGeral {
  referencia: string;
  territorio: { codigo: string; nome: string } | null;
  suprimido: boolean;
  kpis: {
    pessoas: number | null;
    familias: number | null;
    domicilios: number | null;
    casosAbertos: number | null;
    casosMaisDe30Dias: number | null;
    rematriculas: number | null;
    vacinacaoEmDia: number | null;
    pontoPreciso: number | null;
  };
  serie: { mes: string; abertos: number | null; resolvidos: number | null }[];
  atencao: ItemAtencao[];
  porResponsavel: { rotulo: string; valor: number | null }[];
  porTerritorio: { codigo: string; rotulo: string; valor: number | null }[];
  pauta: { total: number; itens: ItemPauta[] } | null;
}

type Estado =
  | { tipo: 'carregando' }
  | { tipo: 'erro'; mensagem: string }
  | { tipo: 'sem-permissao' }
  | { tipo: 'pronto'; v: VisaoGeral };

const TOM_ATENCAO: Record<ItemAtencao['tom'], Tom> = {
  critico: 'critico',
  alerta: 'alerta',
  info: 'info',
};
const ROTULO_TOM: Record<ItemAtencao['tom'], string> = {
  critico: 'Urgente',
  alerta: 'Atenção',
  info: 'Informação',
};
const etapa = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ');
const pct = (v: number | null) => (v === null ? '—' : `${v}%`);

const COLUNAS_PAUTA: Coluna<ItemPauta>[] = [
  { accessorKey: 'codigo', header: 'Caso', enableSorting: false },
  {
    id: 'tipo',
    header: 'Tipo',
    accessorFn: (i) => ROTULO_TIPO_CASO[i.tipo] ?? i.tipo,
    enableSorting: false,
  },
  {
    accessorKey: 'setor',
    header: 'Território',
    enableSorting: false,
    cell: (c) => c.getValue<string | null>() ?? '—',
  },
  { id: 'etapa', header: 'Etapa parada', accessorFn: (i) => etapa(i.etapa), enableSorting: false },
  {
    accessorKey: 'diasDesdeAlerta',
    header: 'Dias desde o alerta',
    numerica: true,
    enableSorting: false,
  },
  {
    accessorKey: 'diasDeAtraso',
    header: 'Dias de atraso',
    numerica: true,
    enableSorting: false,
    cell: (c) => <b className="text-erro">{c.getValue<number | null>() ?? '—'}</b>,
  },
];

/** Visão geral (P14), como no protótipo: KPIs, casos por mês, atenção, responsáveis, território e pauta. */
export default function VisaoGeralPagina() {
  const router = useRouter();
  const { usuario } = useSessao();
  const [filtros] = useFiltrosGlobais();
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' });

  const carregar = useCallback(async () => {
    if (!filtros) return;
    const p = new URLSearchParams({ periodo: filtros.periodo });
    if (filtros.territorio) p.set('territorio', filtros.territorio);
    try {
      setEstado({ tipo: 'pronto', v: await api<VisaoGeral>(`/painel/visao-geral?${p}`) });
    } catch (e) {
      if (e instanceof ErroApi && e.status === 403) setEstado({ tipo: 'sem-permissao' });
      else if (!(e instanceof ErroApi && e.status === 401))
        setEstado({
          tipo: 'erro',
          mensagem: e instanceof Error ? e.message : 'Não foi possível carregar.',
        });
    }
  }, [filtros]);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  const v = estado.tipo === 'pronto' ? estado.v : null;
  const lugar = v?.territorio ? v.territorio.nome : 'todo o município';

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoPagina
        titulo="Visão geral"
        descricao={`Situação dos casos intersetoriais e das bases em ${lugar}. Os números vêm do cruzamento entre as quatro secretarias.`}
        fontes={v ? `Referência: ${v.referencia.toLowerCase()}` : undefined}
      />

      {estado.tipo === 'carregando' && (
        <Carregando rotulo="Carregando a visão geral" altura="h-96" />
      )}
      {estado.tipo === 'erro' && (
        <Erro mensagem={estado.mensagem} onTentar={() => void carregar()} />
      )}
      {estado.tipo === 'sem-permissao' && (
        <SemPermissao>
          <p>
            A visão geral mostra números das pessoas acompanhadas, e o seu perfil não vê esses
            dados.
          </p>
          {usuario && (
            <Botao
              variante="link"
              className="mt-1"
              onClick={() => router.push(telaInicial(usuario.perfil, usuario.escopos))}
            >
              Ir para a sua tela
            </Botao>
          )}
        </SemPermissao>
      )}

      {v && (
        <>
          <GradeKpis>
            <Kpi
              rotulo="Pessoas na base única"
              valor={v.kpis.pessoas}
              detalhe={`${v.kpis.familias === null ? '< 5' : v.kpis.familias.toLocaleString('pt-BR')} famílias · ${v.kpis.domicilios === null ? '< 5' : v.kpis.domicilios.toLocaleString('pt-BR')} domicílios`}
              tom="info"
            />
            <Kpi
              rotulo="Casos abertos"
              valor={v.kpis.casosAbertos}
              detalhe={`${v.kpis.casosMaisDe30Dias ?? '< 5'} com mais de 30 dias`}
              tom={v.kpis.casosMaisDe30Dias ? 'alerta' : 'bom'}
            />
            <Kpi
              rotulo="Rematrículas no ano"
              valor={v.kpis.rematriculas}
              detalhe="crianças e adolescentes de volta à escola"
              tom="bom"
            />
            <Kpi
              rotulo="Vacinação em dia (0 a 6 anos)"
              valor={pct(v.kpis.vacinacaoEmDia)}
              detalhe="meta 85%"
              tom={(v.kpis.vacinacaoEmDia ?? 0) >= 85 ? 'bom' : 'alerta'}
            />
            <Kpi
              rotulo="Domicílios com ponto preciso"
              valor={pct(v.kpis.pontoPreciso)}
              detalhe="lote ou melhor · meta 90% em 2028"
              tom={(v.kpis.pontoPreciso ?? 0) >= 90 ? 'bom' : 'alerta'}
            />
          </GradeKpis>
          {v.suprimido && (
            <p className="text-sm text-texto-suave">
              Contagens menores que 5 aparecem como &quot;&lt; 5&quot; para proteger as pessoas.
            </p>
          )}

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[3fr_2fr]">
            <Card
              titulo="Casos abertos e resolvidos por mês"
              subtitulo="Todos os alertas intersetoriais nos 12 meses até o período"
            >
              <GraficoLinha
                titulo="Casos abertos e resolvidos por mês"
                rotulos={v.serie.map((p) => rotuloMesCurto(p.mes))}
                series={[
                  {
                    nome: 'Casos abertos no fim do mês',
                    cor: 'stroke-primaria',
                    corLegenda: 'bg-primaria',
                    valores: v.serie.map((p) => p.abertos),
                  },
                  {
                    nome: 'Resolvidos no mês',
                    cor: 'stroke-sucesso',
                    corLegenda: 'bg-sucesso',
                    valores: v.serie.map((p) => p.resolvidos),
                  },
                ]}
              />
            </Card>
            <Card titulo="Precisa de atenção">
              {v.atencao.length === 0 ? (
                <Vazio titulo="Nada pendente">Os prazos e as cargas estão em dia.</Vazio>
              ) : (
                <ul className="flex flex-col gap-2">
                  {v.atencao.map((a) => (
                    <li
                      key={a.titulo}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-borda-suave p-3"
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="flex items-center gap-2">
                          <Pill tom={TOM_ATENCAO[a.tom]}>{ROTULO_TOM[a.tom]}</Pill>
                          <b className="text-texto-forte">{a.titulo}</b>
                        </span>
                        <span className="text-sm text-texto-suave">{a.detalhe}</span>
                      </span>
                      <Botao asChild variante="contorno" tamanho="pequeno">
                        <Link href={a.link} aria-label={`${a.acao}: ${a.titulo}`}>
                          {a.acao}
                        </Link>
                      </Botao>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card titulo="Casos abertos por responsável" subtitulo="Quem está com cada caso agora">
              {v.porResponsavel.length === 0 ? (
                <Vazio titulo="Nenhum caso aberto" />
              ) : (
                <Barras titulo="Casos abertos por responsável" itens={v.porResponsavel} />
              )}
            </Card>
            <Card titulo="Casos abertos por território" subtitulo="Onde estão os casos abertos">
              <Barras
                titulo="Casos abertos por território"
                itens={v.porTerritorio.map((t) => ({
                  rotulo: t.rotulo,
                  valor: t.valor,
                  destaque: !v.territorio || v.territorio.codigo === t.codigo,
                }))}
              />
            </Card>
          </div>

          {v.pauta && (
            <Card
              titulo="Pauta do Comitê Gestor"
              subtitulo="Casos com prazo vencido há mais de 7 dias, levados automaticamente à próxima reunião mensal"
              acao={
                <Botao asChild variante="contorno" tamanho="pequeno">
                  <Link href="/pauta">Ver a pauta completa</Link>
                </Botao>
              }
            >
              {v.pauta.total === 0 ? (
                <Vazio titulo="Nenhum caso escalonado">
                  Todos os casos estão dentro do prazo ou com a coordenação da secretaria.
                </Vazio>
              ) : (
                <>
                  <Tabela
                    legenda="Pauta do Comitê Gestor (os casos mais atrasados)"
                    dados={v.pauta.itens}
                    colunas={COLUNAS_PAUTA}
                    porPagina={8}
                    contagem={false}
                    idLinha={(i) => i.codigo}
                  />
                  {v.pauta.total > v.pauta.itens.length && (
                    <p className="text-sm text-texto-suave">
                      Mostrando {v.pauta.itens.length} de {v.pauta.total} (
                      {percentual(v.pauta.itens.length, v.pauta.total)}%). A lista completa está na
                      pauta.
                    </p>
                  )}
                </>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
