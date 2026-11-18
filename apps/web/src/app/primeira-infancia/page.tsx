'use client';

import type { CRITERIOS_PRIMEIRA_INFANCIA } from '@sii/shared';
import {
  type ContagemPorSetor,
  METAS_PRIMEIRA_INFANCIA,
  pctContagem,
  rotuloMesCurto,
} from '@sii/shared';
import Link from 'next/link';
import { Botao } from '@/components/ui/button';
import { BarraMeta } from '@/components/ui/barra-meta';
import { CabecalhoPagina } from '@/components/ui/cabecalho-pagina';
import { Card } from '@/components/ui/card';
import { Carregando, Erro, SemPermissao, Vazio } from '@/components/ui/estado';
import { GraficoLinha } from '@/components/ui/grafico-linha';
import { GradeKpis, Kpi } from '@/components/ui/kpi';
import { type Coluna, Tabela } from '@/components/ui/tabela';
import { textoN, textoPct, usePainel } from '@/lib/painel';

type Chave = keyof typeof CRITERIOS_PRIMEIRA_INFANCIA;
interface Dados {
  agregado: boolean;
  setores: { codigo: string; nome: string }[];
  contagens: ContagemPorSetor<Chave>;
  visitadores: number | null;
  preNatal: number | null;
  serieVacinacao: { mes: string; valor: number | null }[];
}
type Linha = { setor: string; nome: string; v: Record<Chave, number | null> };

const M = METAS_PRIMEIRA_INFANCIA;
const COLUNAS: Coluna<Linha>[] = [
  { accessorKey: 'nome', header: 'Território', cell: (c) => <b>{c.getValue<string>()}</b> },
  {
    id: 'criancas',
    header: 'Crianças',
    numerica: true,
    accessorFn: (l) => l.v.criancas ?? -1,
    cell: (c) => textoN(c.row.original.v.criancas),
  },
  {
    id: 'vac',
    header: 'Vacinação em dia',
    accessorFn: (l) => pctContagem(l.v.vacinadas, l.v.vacinaInformada) ?? -1,
    cell: (c) => (
      <BarraMeta
        valor={pctContagem(c.row.original.v.vacinadas, c.row.original.v.vacinaInformada)}
        meta={M.vacinacao}
      />
    ),
  },
  {
    id: 'creche',
    header: 'Creche 0–3',
    accessorFn: (l) => pctContagem(l.v.creche, l.v.de0a3) ?? -1,
    cell: (c) => (
      <BarraMeta
        valor={pctContagem(c.row.original.v.creche, c.row.original.v.de0a3)}
        meta={M.creche}
      />
    ),
  },
  {
    id: 'pre',
    header: 'Pré-escola 4–5',
    accessorFn: (l) => pctContagem(l.v.preEscola, l.v.de4a5) ?? -1,
    cell: (c) => (
      <BarraMeta
        valor={pctContagem(c.row.original.v.preEscola, c.row.original.v.de4a5)}
        meta={M.preEscola}
      />
    ),
  },
  {
    id: 'cad',
    header: 'No CadÚnico',
    numerica: true,
    accessorFn: (l) => pctContagem(l.v.noCadunico, l.v.criancas) ?? -1,
    cell: (c) => textoPct(pctContagem(c.row.original.v.noCadunico, c.row.original.v.criancas)),
  },
];

/** Primeira infância (0 a 6 anos, §3.9, P19), como no protótipo. */
export default function PrimeiraInfancia() {
  const { estado, carregar } = usePainel<Dados>('/ciclos/primeira-infancia');
  const d = estado.tipo === 'pronto' ? estado.dados : null;
  const t = d?.contagens.total;
  const lugar =
    (d && d.setores.length === 1 ? d.setores[0]?.nome : undefined) ?? 'todo o município';
  const linhas: Linha[] =
    d?.contagens.porSetor.map((p) => ({
      setor: p.setor,
      nome: d.setores.find((s) => s.codigo === p.setor)?.nome ?? p.setor,
      v: p.valores,
    })) ?? [];
  const vac = t ? pctContagem(t.vacinadas, t.vacinaInformada) : null;
  const creche = t ? pctContagem(t.creche, t.de0a3) : null;
  const pre = t ? pctContagem(t.preEscola, t.de4a5) : null;

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoPagina
        titulo="Primeira infância (0 a 6 anos)"
        descricao="Acompanhamento integrado de gestantes e crianças. Base para o Plano Municipal pela Primeira Infância e para a recomendação do TCE-RO de territorializar os indicadores."
        fontes="Fontes: e-SUS PEC, gestão escolar, CadÚnico, Criança Feliz"
      />
      {estado.tipo === 'carregando' && (
        <Carregando rotulo="Carregando a primeira infância" altura="h-96" />
      )}
      {estado.tipo === 'erro' && (
        <Erro mensagem={estado.mensagem} onTentar={() => void carregar()} />
      )}
      {estado.tipo === 'sem-permissao' && (
        <SemPermissao>
          Este painel é das equipes das secretarias, do Comitê e do controle externo.
        </SemPermissao>
      )}
      {d && t && t.criancas === 0 && (
        <Vazio titulo="Nenhuma criança de 0 a 6 anos neste território">
          Escolha &quot;Todo o município&quot; no cabeçalho.
        </Vazio>
      )}
      {d && t && t.criancas !== 0 && (
        <>
          <GradeKpis>
            <Kpi rotulo="Crianças de 0 a 6 anos" valor={t.criancas} detalhe={lugar} tom="info" />
            <Kpi
              rotulo="Vacinação em dia"
              valor={textoPct(vac)}
              detalhe={`meta ${M.vacinacao}%`}
              tom={(vac ?? 0) >= M.vacinacao ? 'bom' : 'alerta'}
            />
            <Kpi
              rotulo="Pré-natal com 6+ consultas"
              valor="—"
              detalhe="regra a definir com a Saúde"
              tom="neutro"
            />
            <Kpi
              rotulo="Creche (0 a 3 anos)"
              valor={textoPct(creche)}
              detalhe={`meta PNE 50% · local ${M.creche}%`}
              tom={(creche ?? 0) >= M.creche ? 'bom' : 'critico'}
            />
            <Kpi
              rotulo="Pré-escola (4 e 5 anos)"
              valor={textoPct(pre)}
              detalhe="meta: universalização"
              tom={(pre ?? 0) >= M.preEscola ? 'bom' : 'alerta'}
            />
          </GradeKpis>
          {d.agregado && (
            <p className="text-sm text-texto-suave">
              Contagens menores que 5 aparecem como &quot;&lt; 5&quot;.
            </p>
          )}

          <Card
            titulo="Vacinação em dia, 0 a 6 anos"
            subtitulo="Evolução mensal (indicador do controle externo)"
          >
            {d.serieVacinacao.length === 0 ? (
              <Vazio titulo="Ainda sem série mensal">
                O cálculo mensal dos indicadores roda no dia 1.
              </Vazio>
            ) : (
              <GraficoLinha
                titulo="Vacinação em dia por mês"
                rotulos={d.serieVacinacao.map((p) => rotuloMesCurto(p.mes))}
                series={[
                  {
                    nome: 'Vacinação em dia (%)',
                    cor: 'stroke-primaria',
                    corLegenda: 'bg-primaria',
                    valores: d.serieVacinacao.map((p) => p.valor),
                  },
                ]}
              />
            )}
          </Card>

          <Card
            titulo="Indicadores por território"
            subtitulo="A marca preta em cada barra é a meta. Verde: meta atingida · amarelo: até 10 pontos abaixo · vermelho: mais distante."
          >
            <Tabela
              dados={linhas}
              colunas={COLUNAS}
              legenda="Primeira infância por território"
              contagem={false}
              idLinha={(l) => l.setor}
              porPagina={10}
            />
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card
              titulo="Criança Feliz (Primeira Infância no SUAS)"
              subtitulo="Visitas domiciliares às famílias com crianças de 0 a 3 anos no CadÚnico"
            >
              <GradeKpis>
                <Kpi rotulo="Crianças acompanhadas" valor={t.pcf} tom="info" />
                <Kpi
                  rotulo="Visitas em dia"
                  valor={textoPct(pctContagem(t.pcfEmDia, t.pcf))}
                  detalhe="visita nos últimos 14 dias"
                  tom={t.pcfEmDia === t.pcf ? 'bom' : 'alerta'}
                />
                {d.visitadores !== null && <Kpi rotulo="Visitadores" valor={d.visitadores} />}
              </GradeKpis>
              <Botao asChild variante="contorno" tamanho="pequeno" className="mt-3">
                <Link href="/territorio?camada=pcf">Ver famílias no mapa</Link>
              </Botao>
            </Card>
            <Card
              titulo="De 0 a 3 anos sem cuidado"
              subtitulo="No CadÚnico, fora da creche e fora do Criança Feliz"
            >
              <GradeKpis>
                <Kpi
                  rotulo="Sem creche e sem Criança Feliz"
                  valor={t.semCuidado03}
                  detalhe="prioridade para inclusão no programa"
                  tom="critico"
                />
              </GradeKpis>
              <div className="mt-3 flex flex-wrap gap-2">
                <Botao asChild variante="contorno" tamanho="pequeno">
                  <Link href="/territorio?camada=calor03">Mapa de calor de 0 a 3 anos</Link>
                </Botao>
                {!d.agregado && (
                  <Botao asChild variante="contorno" tamanho="pequeno">
                    <Link href="/fichas?filtro=0a3">Ver fichas</Link>
                  </Botao>
                )}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
