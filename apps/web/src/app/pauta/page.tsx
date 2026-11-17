'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api, ErroApi } from '@/lib/api';
import { ROTULO_TIPO_CASO } from '@/lib/casos';

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

/** Marca de UTF-8: o Excel abre os acentos certo. */
const BOM = String.fromCharCode(0xfeff);

/** CSV da pauta: só código, território e prazos (nunca CPF nem nome). */
function csv(itens: ItemPauta[]): string {
  const linhas = [
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
      [i.localidade, i.setor].filter(Boolean).join(' · '),
      etapa(i.etapa),
      i.responsavel,
      String(i.diasDesdeAlerta),
      i.diasDeAtraso === null ? '' : String(i.diasDeAtraso),
    ]),
  ];
  return linhas.map((l) => l.map((c) => `"${c.replace(/"/g, '""')}"`).join(';')).join('\r\n');
}

/** Pauta do Comitê Gestor (P11): casos vencidos há mais de 7 dias, mantidos pelo job de prazos. */
export default function Pauta() {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' });

  const carregar = useCallback(async () => {
    try {
      setEstado({ tipo: 'pronto', itens: await api<ItemPauta[]>('/casos/pauta') });
    } catch (e) {
      if (e instanceof ErroApi && e.status === 401) router.push('/entrar?proximo=/pauta');
      else if (e instanceof ErroApi && e.status === 403) setEstado({ tipo: 'sem-permissao' });
      else
        setEstado({ tipo: 'erro', mensagem: e instanceof Error ? e.message : 'Erro ao carregar.' });
    }
  }, [router]);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  function exportar(itens: ItemPauta[]) {
    const blob = new Blob([BOM + csv(itens)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'pauta-comite.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-texto-forte">Pauta do Comitê Gestor</h1>
        <p className="max-w-prose text-texto-suave">
          Casos com prazo vencido há mais de 7 dias entram aqui sozinhos e vão para a próxima
          reunião mensal. A lista é atualizada todo dia pela conferência dos prazos.
        </p>
      </div>
      {estado.tipo === 'carregando' && (
        <div
          aria-busy="true"
          aria-label="Carregando a pauta"
          className="h-64 animate-pulse rounded-md bg-borda-suave"
        />
      )}
      {estado.tipo === 'erro' && (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-md border-l-4 border-erro bg-erro-claro p-4"
        >
          <p className="text-texto-forte">{estado.mensagem}</p>
          <button
            type="button"
            onClick={() => {
              setEstado({ tipo: 'carregando' });
              void carregar();
            }}
            className="min-h-[var(--spacing-alvo)] rounded-md bg-primaria px-4 font-semibold text-fundo"
          >
            Tentar de novo
          </button>
        </div>
      )}
      {estado.tipo === 'sem-permissao' && (
        <div className="rounded-md border-l-4 border-alerta-destaque bg-alerta-claro p-4 text-texto-forte">
          A pauta é do Comitê Gestor, da coordenação da SEMED e da CTI.
        </div>
      )}
      {estado.tipo === 'pronto' && estado.itens.length === 0 && (
        <div className="rounded-md border-l-4 border-sucesso bg-sucesso-claro p-4 text-texto-forte">
          <p className="font-semibold">Nenhum caso escalonado</p>
          <p>Todos os casos estão dentro do prazo ou com a coordenação da secretaria.</p>
        </div>
      )}
      {estado.tipo === 'pronto' && estado.itens.length > 0 && (
        <>
          <div>
            <button
              type="button"
              onClick={() => exportar(estado.itens)}
              className="min-h-[var(--spacing-alvo)] rounded-md border border-primaria px-4 font-semibold text-primaria"
            >
              Exportar CSV
            </button>
          </div>
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[44rem] text-left">
              <caption className="pb-2 text-left text-sm text-texto-suave">
                {estado.itens.length} {estado.itens.length === 1 ? 'caso' : 'casos'} na pauta, do
                mais atrasado ao menos. Sem nome nem CPF.
              </caption>
              <thead>
                <tr className="border-b border-borda text-sm text-texto-suave">
                  <th scope="col" className="py-2 pr-3">
                    Caso
                  </th>
                  <th scope="col" className="py-2 pr-3">
                    Tipo
                  </th>
                  <th scope="col" className="py-2 pr-3">
                    Território
                  </th>
                  <th scope="col" className="py-2 pr-3">
                    Etapa parada
                  </th>
                  <th scope="col" className="py-2 pr-3">
                    Responsável
                  </th>
                  <th scope="col" className="py-2 pr-3 text-right">
                    Dias desde o alerta
                  </th>
                  <th scope="col" className="py-2 text-right">
                    Dias de atraso
                  </th>
                </tr>
              </thead>
              <tbody>
                {estado.itens.map((i) => (
                  <tr key={i.codigo} className="border-b border-borda-suave">
                    <td className="py-2 pr-3 font-semibold text-texto-forte">{i.codigo}</td>
                    <td className="py-2 pr-3">{ROTULO_TIPO_CASO[i.tipo] ?? i.tipo}</td>
                    <td className="py-2 pr-3">
                      {[i.localidade, i.setor].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td className="py-2 pr-3">{etapa(i.etapa)}</td>
                    <td className="py-2 pr-3">{i.responsavel}</td>
                    <td className="py-2 pr-3 text-right">{i.diasDesdeAlerta}</td>
                    <td className="py-2 text-right font-semibold text-erro">
                      {i.diasDeAtraso ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
