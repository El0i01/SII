'use client';

import type { CRITERIOS_EJA } from '@sii/shared';
import { type ContagemPorSetor, META_COBERTURA_EJA, pctContagem } from '@sii/shared';
import { BarraMeta } from '@/components/ui/barra-meta';
import { CabecalhoPagina } from '@/components/ui/cabecalho-pagina';
import { Card } from '@/components/ui/card';
import { Carregando, Erro, SemPermissao, Vazio } from '@/components/ui/estado';
import { GradeKpis, Kpi } from '@/components/ui/kpi';
import { Pill } from '@/components/ui/pill';
import { type Coluna, Tabela } from '@/components/ui/tabela';
import { textoN, textoPct, usePainel } from '@/lib/painel';

type Chave = keyof typeof CRITERIOS_EJA;
interface Dados {
  agregado: boolean;
  setores: { codigo: string; nome: string }[];
  contagens: ContagemPorSetor<Chave>;
  frequenciaMedia: number | null;
  evasao: number | null;
}
type Linha = { setor: string; nome: string; v: Record<Chave, number | null> };

const META_EVASAO = 10;
const COLUNAS: Coluna<Linha>[] = [
  { accessorKey: 'nome', header: 'Território', cell: (c) => <b>{c.getValue<string>()}</b> },
  {
    id: 'pot',
    header: 'Público potencial',
    numerica: true,
    accessorFn: (l) => l.v.potencial ?? -1,
    cell: (c) => textoN(c.row.original.v.potencial),
  },
  {
    id: 'alf',
    header: 'Sem alfabetização',
    numerica: true,
    accessorFn: (l) => l.v.semAlfabetizacao ?? -1,
    cell: (c) => textoN(c.row.original.v.semAlfabetizacao),
  },
  {
    id: 'mat',
    header: 'Matriculados',
    numerica: true,
    accessorFn: (l) => l.v.matriculados ?? -1,
    cell: (c) => textoN(c.row.original.v.matriculados),
  },
  {
    id: 'cob',
    header: 'Cobertura',
    accessorFn: (l) => pctContagem(l.v.matriculados, l.v.potencial) ?? -1,
    cell: (c) => (
      <BarraMeta
        valor={pctContagem(c.row.original.v.matriculados, c.row.original.v.potencial)}
        meta={META_COBERTURA_EJA}
        max={40}
      />
    ),
  },
];

const CONVITES = [
  [
    'conviteResponsavel',
    'responsáveis familiares no CadÚnico sem fundamental completo',
    'Convite no atendimento do CRAS',
    'Assistência',
  ],
  [
    'convitePais',
    'pais de alunos da rede sem fundamental completo',
    'Convite pela escola dos filhos',
    'SEMED',
  ],
  [
    'conviteJovens',
    'jovens de 15 a 17 anos fora da escola',
    'Encaminhar à EJA ou à rede estadual',
    'Busca ativa',
  ],
  [
    'conviteIdososScfv',
    'pessoas idosas sem alfabetização no Serviço de Convivência',
    'Turma de alfabetização no CRAS',
    'Assistência',
  ],
] as const;

/** EJA (§3.9, P19): público potencial pela escolaridade do CadÚnico × matrículas nas turmas de EJA. */
export default function Eja() {
  const { estado, carregar } = usePainel<Dados>('/ciclos/eja');
  const d = estado.tipo === 'pronto' ? estado.dados : null;
  const t = d?.contagens.total;
  const nome = (s: string) => d?.setores.find((x) => x.codigo === s)?.nome ?? s;
  return (
    <div className="flex flex-col gap-6">
      <CabecalhoPagina
        titulo="Educação de Jovens e Adultos (EJA)"
        descricao="Pessoas com 15 anos ou mais sem o ensino fundamental completo, identificadas pela escolaridade do CadÚnico, comparadas com as matrículas na EJA."
        fontes="Fontes: CadÚnico (escolaridade), gestão escolar"
      />
      {estado.tipo === 'carregando' && <Carregando rotulo="Carregando a EJA" altura="h-96" />}
      {estado.tipo === 'erro' && (
        <Erro mensagem={estado.mensagem} onTentar={() => void carregar()} />
      )}
      {estado.tipo === 'sem-permissao' && (
        <SemPermissao>
          Este painel é das equipes das secretarias, do Comitê e do controle externo.
        </SemPermissao>
      )}
      {d && t && t.potencial === 0 && (
        <Vazio titulo="Nenhuma pessoa no público da EJA neste território">
          A escolaridade vem da carga do CadÚnico. Escolha &quot;Todo o município&quot; ou envie a
          base atualizada.
        </Vazio>
      )}
      {d && t && t.potencial !== 0 && (
        <>
          <GradeKpis>
            <Kpi
              rotulo="Público potencial"
              valor={t.potencial}
              detalhe="15 anos ou mais sem fundamental"
              tom="info"
            />
            <Kpi
              rotulo="Sem alfabetização"
              valor={t.semAlfabetizacao}
              detalhe="prioridade para alfabetização"
              tom="critico"
            />
            <Kpi
              rotulo="Matriculados na EJA"
              valor={t.matriculados}
              detalhe={`${textoPct(pctContagem(t.matriculados, t.potencial))} do público potencial`}
              tom="alerta"
            />
            <Kpi
              rotulo="Frequência média"
              valor={textoPct(d.frequenciaMedia)}
              detalhe="no mês"
              tom="alerta"
            />
            <Kpi
              rotulo="Evasão no ano"
              valor={textoPct(d.evasao)}
              detalhe={`meta: abaixo de ${META_EVASAO}%`}
              tom={d.evasao === null ? 'neutro' : d.evasao < META_EVASAO ? 'bom' : 'critico'}
            />
          </GradeKpis>
          <Card titulo="Busca ativa da EJA" subtitulo="Cruzamentos que geram convites">
            <ul className="flex flex-col gap-2">
              {CONVITES.map(([k, titulo, detalhe, quem]) => (
                <li
                  key={k}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-borda-suave p-3"
                >
                  <span>
                    <b className="text-texto-forte">
                      {textoN(t[k])} {titulo}
                    </b>
                    <span className="block text-sm text-texto-suave">{detalhe}</span>
                  </span>
                  <Pill tom="info">{quem}</Pill>
                </li>
              ))}
            </ul>
          </Card>
          <Card
            titulo="Detalhe por território"
            subtitulo={`A marca preta é a meta de ${META_COBERTURA_EJA}% de cobertura do público potencial.`}
          >
            <Tabela
              dados={d.contagens.porSetor.map((p) => ({
                setor: p.setor,
                nome: nome(p.setor),
                v: p.valores,
              }))}
              colunas={COLUNAS}
              legenda="EJA por território"
              contagem={false}
              idLinha={(l) => l.setor}
            />
          </Card>
        </>
      )}
    </div>
  );
}
