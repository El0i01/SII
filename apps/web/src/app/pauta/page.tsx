'use client';

import { gerarCsv } from '@sii/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CabecalhoPagina } from '@/components/ui/cabecalho-pagina';
import { Carregando, Erro, SemPermissao, Vazio } from '@/components/ui/estado';
import { type Coluna, Tabela } from '@/components/ui/tabela';
import { api, ErroApi } from '@/lib/api';
import { ROTULO_TIPO_CASO } from '@/lib/casos';
import { useFiltrosGlobais } from '@/lib/filtros-url';

interface ItemPauta {
  codigo: string;
  tipo: string;
  etapa: string;
  setor: string | null;
  localidade: string | null;
  responsavel: string;
  diasDesdeAlerta: number;
  diasDeAtraso: number | null;
}

type Estado =
  | { tipo: 'carregando' }
  | { tipo: 'erro'; mensagem: string }
  | { tipo: 'sem-permissao' }
  | { tipo: 'pronto'; itens: ItemPauta[] };

const etapa = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ');
const territorio = (i: ItemPauta) => [i.localidade, i.setor].filter(Boolean).join(' · ') || '—';

const COLUNAS: Coluna<ItemPauta>[] = [
  {
    accessorKey: 'codigo',
    header: 'Caso',
    cell: (c) => <b className="text-texto-forte">{c.getValue<string>()}</b>,
  },
  { id: 'tipo', header: 'Tipo', accessorFn: (i) => ROTULO_TIPO_CASO[i.tipo] ?? i.tipo },
  { id: 'territorio', header: 'Território', accessorFn: territorio },
  { id: 'etapa', header: 'Etapa parada', accessorFn: (i) => etapa(i.etapa) },
  { accessorKey: 'responsavel', header: 'Responsável' },
  { accessorKey: 'diasDesdeAlerta', header: 'Dias desde o alerta', numerica: true },
  {
    accessorKey: 'diasDeAtraso',
    header: 'Dias de atraso',
    numerica: true,
    cell: (c) => <b className="text-erro">{c.getValue<number | null>() ?? '—'}</b>,
  },
];

/** CSV da pauta: só código, território e prazos (nunca CPF nem nome). */
function csv(itens: ItemPauta[]): string {
  return gerarCsv([
    [
      'Caso',
      'Tipo',
      'Território',
      'Etapa parada',
      'Responsável',
      'Dias desde o alerta',
      'Dias de atraso',
    ],
    ...itens.map((i) => [
      i.codigo,
      ROTULO_TIPO_CASO[i.tipo] ?? i.tipo,
      territorio(i),
      etapa(i.etapa),
      i.responsavel,
      String(i.diasDesdeAlerta),
      i.diasDeAtraso === null ? '' : String(i.diasDeAtraso),
    ]),
  ]);
}

/** Pauta do Comitê Gestor (P11): casos vencidos há mais de 7 dias, mantidos pelo job de prazos. */
export default function Pauta() {
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' });
  const [filtros] = useFiltrosGlobais();

  const carregar = useCallback(async () => {
    try {
      setEstado({ tipo: 'pronto', itens: await api<ItemPauta[]>('/casos/pauta') });
    } catch (e) {
      if (e instanceof ErroApi && e.status === 403) setEstado({ tipo: 'sem-permissao' });
      else if (!(e instanceof ErroApi && e.status === 401))
        setEstado({ tipo: 'erro', mensagem: e instanceof Error ? e.message : 'Erro ao carregar.' });
    }
  }, []);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  const itens = useMemo(
    () =>
      estado.tipo === 'pronto'
        ? estado.itens.filter((i) => !filtros?.territorio || i.setor === filtros.territorio)
        : [],
    [estado, filtros],
  );

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoPagina
        titulo="Pauta do Comitê Gestor"
        descricao="Casos com prazo vencido há mais de 7 dias entram aqui sozinhos e vão para a próxima reunião mensal. A lista é atualizada todo dia pela conferência dos prazos."
      />
      {estado.tipo === 'carregando' && <Carregando rotulo="Carregando a pauta" altura="h-64" />}
      {estado.tipo === 'erro' && (
        <Erro mensagem={estado.mensagem} onTentar={() => void carregar()} />
      )}
      {estado.tipo === 'sem-permissao' && (
        <SemPermissao>A pauta é do Comitê Gestor, da coordenação da SEMED e da CTI.</SemPermissao>
      )}
      {estado.tipo === 'pronto' && estado.itens.length === 0 && (
        <Vazio titulo="Nenhum caso escalonado">
          Todos os casos estão dentro do prazo ou com a coordenação da secretaria.
        </Vazio>
      )}
      {estado.tipo === 'pronto' && estado.itens.length > 0 && (
        <Tabela
          dados={itens}
          colunas={COLUNAS}
          legenda={`${itens.length} ${itens.length === 1 ? 'caso' : 'casos'} na pauta, do mais atrasado ao menos. Sem nome nem CPF.`}
          legendaVisivel
          porPagina={20}
          idLinha={(i) => i.codigo}
          busca={{
            rotulo: 'Buscar por caso, território ou responsável',
            atende: (i, q) =>
              `${i.codigo} ${territorio(i)} ${i.responsavel}`.toLowerCase().includes(q),
          }}
          exportar={{ arquivo: 'pauta-comite.csv', gerar: csv }}
          vazio={{
            titulo: 'Nenhum caso neste território',
            texto: 'Escolha "Todo o município" no cabeçalho.',
          }}
        />
      )}
    </div>
  );
}
