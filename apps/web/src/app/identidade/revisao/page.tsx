'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ParRevisao, type Revisao } from '@/components/par-revisao';
import { CabecalhoPagina } from '@/components/ui/cabecalho-pagina';
import { Carregando, Erro, SemPermissao } from '@/components/ui/estado';
import { api, ErroApi } from '@/lib/api';

type Estado =
  | { tipo: 'carregando' }
  | { tipo: 'erro'; mensagem: string }
  | { tipo: 'sem-permissao' }
  | { tipo: 'pronto'; revisoes: Revisao[] };

export default function RevisaoVinculos() {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' });
  const [ocupado, setOcupado] = useState<number | null>(null);
  const [aviso, setAviso] = useState('');

  const tratarErro = useCallback(
    (e: unknown) => {
      if (e instanceof ErroApi && e.status === 401) {
        router.push('/entrar?proximo=/identidade/revisao');
        return;
      }
      if (e instanceof ErroApi && e.status === 403) {
        setEstado({ tipo: 'sem-permissao' });
        return;
      }
      setEstado({
        tipo: 'erro',
        mensagem: e instanceof Error ? e.message : 'Não foi possível carregar.',
      });
    },
    [router],
  );

  const carregar = useCallback(async () => {
    setEstado({ tipo: 'carregando' });
    try {
      setEstado({ tipo: 'pronto', revisoes: await api<Revisao[]>('/identidade/revisoes') });
    } catch (e) {
      tratarErro(e);
    }
  }, [tratarErro]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function decidir(r: Revisao, acao: 'aceitar' | 'rejeitar') {
    setOcupado(r.id);
    try {
      await api(`/identidade/revisoes/${r.id}/${acao}`, { method: 'POST' });
      setEstado((s) =>
        s.tipo === 'pronto' ? { ...s, revisoes: s.revisoes.filter((x) => x.id !== r.id) } : s,
      );
      setAviso(
        acao === 'aceitar'
          ? `Registros de ${r.a.nome} unidos.`
          : 'Par marcado como pessoas diferentes.',
      );
    } catch (e) {
      if (e instanceof ErroApi && e.status !== 401 && e.status !== 403) setAviso(e.message);
      else tratarErro(e);
    } finally {
      setOcupado(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoPagina
        titulo="Revisão de pessoas duplicadas"
        descricao="Registros que chegaram de fontes diferentes e talvez sejam a mesma pessoa. Confira os dados e decida. Unir junta o histórico das duas fichas; a união fica registrada e pode ser desfeita pela CTI."
      />

      <p role="status" aria-live="polite" className="sr-only">
        {aviso}
      </p>
      {aviso && (
        <p className="rounded-md border-l-4 border-sucesso bg-sucesso-claro p-3 text-texto-forte">
          {aviso}
        </p>
      )}

      {estado.tipo === 'carregando' && (
        <Carregando rotulo="Carregando a fila de revisão" altura="h-72" />
      )}

      {estado.tipo === 'erro' && (
        <Erro mensagem={estado.mensagem} onTentar={() => void carregar()} />
      )}

      {estado.tipo === 'sem-permissao' && (
        <SemPermissao>
          Só a equipe da CTI revisa e une registros de pessoas. Se você acha que deveria ter acesso,
          fale com a CTI.
        </SemPermissao>
      )}

      {estado.tipo === 'pronto' && estado.revisoes.length === 0 && (
        <div className="rounded-md border border-borda-suave bg-superficie p-6 text-texto-forte">
          Nenhum par para revisar. Quando uma carga trouxer registros parecidos, eles aparecem aqui.
        </div>
      )}

      {estado.tipo === 'pronto' &&
        estado.revisoes.map((r) => (
          <ParRevisao
            key={r.id}
            revisao={r}
            ocupado={ocupado === r.id}
            onUnir={() => void decidir(r, 'aceitar')}
            onRejeitar={() => void decidir(r, 'rejeitar')}
          />
        ))}
    </div>
  );
}
