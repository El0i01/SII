'use client';

import type { CRITERIOS_INCLUSIVA } from '@sii/shared';
import { type ContagemPorSetor } from '@sii/shared';
import Link from 'next/link';
import { Barras } from '@/components/ui/barras';
import { Botao } from '@/components/ui/button';
import { CabecalhoPagina } from '@/components/ui/cabecalho-pagina';
import { Card } from '@/components/ui/card';
import { Carregando, Erro, SemPermissao, Vazio } from '@/components/ui/estado';
import { GradeKpis, Kpi } from '@/components/ui/kpi';
import { Pill } from '@/components/ui/pill';
import { type Coluna, Tabela } from '@/components/ui/tabela';
import { textoN, usePainel } from '@/lib/painel';

type Chave = keyof typeof CRITERIOS_INCLUSIVA;
interface SemAtendimento {
  fichaId: number;
  codigo: string;
  iniciais: string;
  idade: number;
  endereco: string;
  escola: string | null;
  cras: boolean;
  bpc: boolean;
}
interface Dados {
  agregado: boolean;
  setores: { codigo: string; nome: string }[];
  contagens: ContagemPorSetor<Chave>;
  semAtendimento?: SemAtendimento[];
}

const simNao = (v: boolean) => <Pill tom={v ? 'bom' : 'neutro'}>{v ? 'Sim' : 'Não'}</Pill>;
const COLUNAS: Coluna<SemAtendimento>[] = [
  {
    accessorKey: 'codigo',
    header: 'Ficha',
    cell: (c) => <b className="whitespace-nowrap">{c.getValue<string>()}</b>,
  },
  { accessorKey: 'iniciais', header: 'Criança', enableSorting: false },
  { accessorKey: 'idade', header: 'Idade', numerica: true },
  { accessorKey: 'endereco', header: 'Endereço' },
  {
    id: 'escola',
    header: 'Escola',
    accessorFn: (c) => c.escola ?? '',
    cell: (c) => c.row.original.escola ?? <Pill tom="critico">Sem matrícula</Pill>,
  },
  { id: 'cras', header: 'CRAS', enableSorting: false, cell: (c) => simNao(c.row.original.cras) },
  { id: 'bpc', header: 'BPC', enableSorting: false, cell: (c) => simNao(c.row.original.bpc) },
  {
    id: 'acao',
    header: 'Ação',
    enableSorting: false,
    cell: (c) => (
      <Botao asChild variante="contorno" tamanho="pequeno">
        <Link href={`/fichas?ficha=${c.row.original.fichaId}`}>
          Abrir ficha<span className="sr-only"> {c.row.original.codigo}</span>
        </Link>
      </Botao>
    ),
  },
];

/** Educação inclusiva (§3.9, P19): só a necessidade de atendimento; laudo e CID ficam na Saúde. */
export default function EducacaoInclusiva() {
  const { estado, carregar } = usePainel<Dados>('/ciclos/educacao-inclusiva');
  const d = estado.tipo === 'pronto' ? estado.dados : null;
  const t = d?.contagens.total;
  return (
    <div className="flex flex-col gap-6">
      <CabecalhoPagina
        titulo="Educação inclusiva"
        descricao="Crianças e adolescentes com deficiência ou necessidade de atendimento educacional especializado. As secretarias compartilham só a necessidade de atendimento; laudo e CID ficam restritos à Saúde."
        fontes="Fontes: gestão escolar, e-SUS PEC (sinalizador), CadÚnico (BPC), APAE"
      />
      {estado.tipo === 'carregando' && (
        <Carregando rotulo="Carregando a educação inclusiva" altura="h-96" />
      )}
      {estado.tipo === 'erro' && (
        <Erro mensagem={estado.mensagem} onTentar={() => void carregar()} />
      )}
      {estado.tipo === 'sem-permissao' && (
        <SemPermissao>
          Este painel é das equipes das secretarias, do Comitê e do controle externo.
        </SemPermissao>
      )}
      {d && t && t.identificadas === 0 && (
        <Vazio titulo="Nenhuma criança com necessidade de atendimento especializado neste território">
          Escolha &quot;Todo o município&quot; no cabeçalho.
        </Vazio>
      )}
      {d && t && t.identificadas !== 0 && (
        <>
          <GradeKpis>
            <Kpi
              rotulo="Crianças identificadas"
              valor={t.identificadas}
              detalhe="0 a 17 anos"
              tom="info"
            />
            <Kpi rotulo="Em sala de recursos" valor={t.salaRecursos} tom="bom" />
            <Kpi
              rotulo="Atendidas pela APAE"
              valor={t.apae}
              detalhe="com professoras cedidas pela SEMED"
            />
            <Kpi rotulo="Recebem BPC" valor={t.bpc} />
            <Kpi
              rotulo="Sem nenhum atendimento"
              valor={t.semAtendimento}
              detalhe="prioridade"
              tom={t.semAtendimento ? 'critico' : 'bom'}
            />
          </GradeKpis>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card titulo="Sem atendimento especializado" subtitulo="Por território">
              <Barras
                titulo="Sem atendimento por território"
                itens={d.contagens.porSetor.map((p) => ({
                  rotulo: d.setores.find((s) => s.codigo === p.setor)?.nome ?? p.setor,
                  valor: p.valores.semAtendimento,
                }))}
              />
            </Card>
            <Card
              titulo="Primeira infância e inclusão"
              subtitulo="Quanto antes a estimulação começa, melhor o desenvolvimento"
            >
              <ul className="flex flex-col gap-2">
                <li className="rounded-md border border-borda-suave p-3">
                  <b className="text-texto-forte">
                    {textoN(t.de0a3)} crianças de 0 a 3 anos identificadas
                  </b>
                  <span className="block text-sm text-texto-suave">
                    Encaminhar à estimulação precoce e ao Criança Feliz
                  </span>
                </li>
                <li className="rounded-md border border-borda-suave p-3">
                  <b className="text-texto-forte">
                    {textoN(t.de0a3NoPcf)} delas já no Criança Feliz
                  </b>
                  <span className="block text-sm text-texto-suave">
                    O programa atende até 6 anos quando a criança recebe BPC
                  </span>
                </li>
                <li className="rounded-md border border-borda-suave p-3">
                  <b className="text-texto-forte">
                    {textoN(t.foraDaEscola)} em idade escolar fora da escola
                  </b>
                  <span className="block text-sm text-texto-suave">
                    Entram na busca ativa com prioridade
                  </span>
                </li>
              </ul>
            </Card>
          </div>
          <Card
            titulo="Crianças sem atendimento"
            subtitulo="Lista de ação, sem diagnóstico: só a necessidade."
          >
            {d.semAtendimento === undefined ? (
              <SemPermissao>
                Seu perfil vê só os números. A lista nominal é das equipes que acompanham as
                famílias.
              </SemPermissao>
            ) : d.semAtendimento.length === 0 ? (
              <Vazio titulo="Todas as crianças identificadas têm atendimento" />
            ) : (
              <Tabela
                dados={d.semAtendimento}
                colunas={COLUNAS}
                legenda="Crianças sem atendimento especializado (iniciais; nome e CPF só na ficha)"
                idLinha={(c) => c.codigo}
                busca={{
                  rotulo: 'Buscar por ficha, iniciais ou endereço',
                  atende: (c, q) =>
                    `${c.codigo} ${c.iniciais} ${c.endereco}`.toLowerCase().includes(q),
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
