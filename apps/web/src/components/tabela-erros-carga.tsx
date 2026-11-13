'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface Pagina {
  total: number;
  pagina: number;
  tamanho: number;
  itens: { linha: number; campo: string; gravidade: 'ERRO' | 'AVISO'; mensagem: string }[];
}

/** Problemas por linha de uma carga, 50 por página. As mensagens nunca trazem o valor da célula. */
export function TabelaErrosCarga({ cargaId, fonte }: { cargaId: number; fonte?: string }) {
  // No e-SUS não há arquivo: o número é o do cidadão no PEC, para a Saúde achar e corrigir.
  const doPec = fonte === 'ESUS_PEC';
  const [pagina, setPagina] = useState(1);
  const [dados, setDados] = useState<Pagina | null>(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let vivo = true;
    setErro('');
    api<Pagina>(`/cargas/${cargaId}/erros?pagina=${pagina}`)
      .then((d) => vivo && setDados(d))
      .catch((e: Error) => vivo && setErro(e.message));
    return () => {
      vivo = false;
    };
  }, [cargaId, pagina]);

  if (erro)
    return (
      <p role="alert" className="text-erro">
        {erro}
      </p>
    );
  if (!dados) return <p aria-busy="true">Carregando os problemas por linha…</p>;
  const paginas = Math.max(1, Math.ceil(dados.total / dados.tamanho));
  return (
    <section aria-labelledby={`erros-${cargaId}`} className="flex flex-col gap-3">
      <h3 id={`erros-${cargaId}`} className="font-semibold text-texto-forte">
        Problemas por linha ({dados.total.toLocaleString('pt-BR')})
      </h3>
      <p className="text-sm text-texto-suave">
        Linhas com <strong>erro</strong> não entraram; corrija no sistema de origem e elas entram na
        próxima carga. Linhas com <strong>aviso</strong> entraram sem o dado indicado.{' '}
        {doPec
          ? 'O número do cidadão é o código dele no PEC, para a Saúde localizar e corrigir o cadastro.'
          : 'O número da linha é o do arquivo (a linha 1 é o cabeçalho).'}
      </p>
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[32rem] text-left">
          <thead>
            <tr className="border-b border-borda text-sm text-texto-suave">
              <th scope="col" className="py-2 pr-3">
                {doPec ? 'Cidadão no PEC' : 'Linha'}
              </th>
              <th scope="col" className="py-2 pr-3">
                Tipo
              </th>
              <th scope="col" className="py-2">
                O que aconteceu
              </th>
            </tr>
          </thead>
          <tbody>
            {dados.itens.map((e, i) => (
              <tr key={`${e.linha}-${e.campo}-${i}`} className="border-b border-borda-suave">
                <td className="py-2 pr-3 tabular-nums">{e.linha}</td>
                <td className="py-2 pr-3">
                  <span
                    className={e.gravidade === 'ERRO' ? 'font-semibold text-erro' : 'text-texto'}
                  >
                    {e.gravidade === 'ERRO' ? 'Erro' : 'Aviso'}
                  </span>
                </td>
                <td className="py-2">{e.mensagem}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {paginas > 1 && (
        <nav aria-label="Páginas de problemas" className="flex items-center gap-3">
          <button
            type="button"
            disabled={pagina <= 1}
            onClick={() => setPagina((p) => p - 1)}
            className="min-h-[var(--spacing-alvo)] rounded-md border border-borda px-3 disabled:opacity-50"
          >
            Anterior
          </button>
          <span>
            Página {pagina} de {paginas}
          </span>
          <button
            type="button"
            disabled={pagina >= paginas}
            onClick={() => setPagina((p) => p + 1)}
            className="min-h-[var(--spacing-alvo)] rounded-md border border-borda px-3 disabled:opacity-50"
          >
            Próxima
          </button>
        </nav>
      )}
    </section>
  );
}
