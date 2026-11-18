'use client';

import { cargaTerminou, ROTULO_STATUS_CARGA } from '@sii/shared';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  type ErrosCarga,
  FormularioCarga,
  type FonteFormulario,
} from '@/components/formulario-carga';
import { AlertasCarga, type AlertaCarga } from '@/components/alertas-carga';
import { type Carga, nomeCarga, ProgressoCarga } from '@/components/progresso-carga';
import { TabelaErrosCarga } from '@/components/tabela-erros-carga';
import { CabecalhoPagina } from '@/components/ui/cabecalho-pagina';
import { Carregando, Erro, SemPermissao } from '@/components/ui/estado';
import { api, ErroApi } from '@/lib/api';

type Estado =
  | { tipo: 'carregando' }
  | { tipo: 'erro'; mensagem: string }
  | { tipo: 'sem-permissao' }
  | { tipo: 'pronto'; cargas: Carga[] };

/** Quem envia o quê (igual à API): a Assistência o CadÚnico, a SEMED as cargas da Educação. */
const FONTES_POR_PERFIL: Record<string, FonteFormulario[]> = {
  ADMIN_CTI: ['CADUNICO', 'GESTAO_ESCOLAR', 'SEDUC'],
  ASSISTENCIA_GESTOR: ['CADUNICO'],
  SEMED_GESTOR: ['GESTAO_ESCOLAR', 'SEDUC'],
};

function mesAnterior(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function Cargas() {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' });
  const [selecionada, setSelecionada] = useState<number | null>(null);
  const [alertas, setAlertas] = useState<AlertaCarga[]>([]);
  const [fontes, setFontes] = useState<FonteFormulario[]>(['CADUNICO']);

  const tratarErro = useCallback(
    (e: unknown) => {
      if (e instanceof ErroApi && e.status === 401) {
        router.push('/entrar?proximo=/cargas');
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
    try {
      const [cargas, eu] = await Promise.all([
        api<Carga[]>('/cargas'),
        api<{ perfil: string }>('/auth/eu').catch(() => null),
      ]);
      setFontes(FONTES_POR_PERFIL[eu?.perfil ?? ''] ?? ['CADUNICO']);
      setEstado({ tipo: 'pronto', cargas });
      // Só a CTI recebe os alertas; para os outros perfis a API responde 403 e a faixa não aparece.
      setAlertas(await api<AlertaCarga[]>('/cargas/alertas').catch(() => []));
      setSelecionada((s) => s ?? cargas[0]?.id ?? null);
    } catch (e) {
      tratarErro(e);
    }
  }, [tratarErro]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Enquanto houver carga em andamento, consulta a cada 2 s.
  const emAndamento =
    estado.tipo === 'pronto' && estado.cargas.some((c) => !cargaTerminou(c.status));
  useEffect(() => {
    if (!emAndamento) return;
    const t = setInterval(() => void carregar(), 2_000);
    return () => clearInterval(t);
  }, [emAndamento, carregar]);

  async function enviar(d: {
    fonte: FonteFormulario;
    mesReferencia: string;
    arquivo: File;
  }): Promise<ErrosCarga | null> {
    const corpo = new FormData();
    corpo.set('fonte', d.fonte);
    corpo.set('mesReferencia', d.mesReferencia);
    corpo.set('arquivo', d.arquivo);
    try {
      const c = await api<Carga>('/cargas', { method: 'POST', body: corpo });
      setSelecionada(c.id);
      await carregar();
      return null;
    } catch (e) {
      if (e instanceof ErroApi && e.status !== 401 && e.status !== 403) {
        const r: ErrosCarga = {};
        if (e.campos.mesReferencia?.[0]) r.mesReferencia = e.campos.mesReferencia[0];
        if (e.campos.arquivo?.[0]) r.arquivo = e.campos.arquivo[0];
        if (!r.mesReferencia && !r.arquivo) r.geral = e.message;
        return r;
      }
      tratarErro(e);
      return null;
    }
  }

  const atual =
    estado.tipo === 'pronto' ? estado.cargas.find((c) => c.id === selecionada) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoPagina
        titulo="Cargas de dados"
        descricao="Envie a base do CadÚnico (Assistência) ou os arquivos da gestão escolar e da SEDUC-RO (SEMED). O sistema confere as colunas, liga cada pessoa à ficha única e atualiza o que cada fonte traz. Você acompanha o andamento e os problemas linha a linha. A leitura do e-SUS PEC e a conferência diária das faltas rodam sozinhas e também aparecem no histórico."
      />

      {alertas.length > 0 && <AlertasCarga alertas={alertas} />}

      {estado.tipo === 'carregando' && <Carregando rotulo="Carregando as cargas" altura="h-72" />}

      {estado.tipo === 'erro' && (
        <Erro
          mensagem={estado.mensagem}
          onTentar={() => {
            setEstado({ tipo: 'carregando' });
            void carregar();
          }}
        />
      )}

      {estado.tipo === 'sem-permissao' && (
        <SemPermissao>
          Enviam cargas o ponto focal do CadÚnico na Assistência Social, a coordenação da SEMED e a
          equipe da CTI. Se você acha que deveria ter acesso, fale com a CTI.
        </SemPermissao>
      )}

      {estado.tipo === 'pronto' && (
        <>
          <section aria-labelledby="enviar" className="flex flex-col gap-3">
            <h2 id="enviar" className="text-lg font-semibold text-texto-forte">
              Enviar arquivo
            </h2>
            <FormularioCarga onEnviar={enviar} mesSugerido={mesAnterior()} fontes={fontes} />
          </section>

          {atual && (
            <div className="flex flex-col gap-3" aria-live="polite">
              <ProgressoCarga carga={atual} />
              {cargaTerminou(atual.status) && (atual.rejeitados > 0 || atual.avisos > 0) && (
                <TabelaErrosCarga cargaId={atual.id} fonte={atual.fonte} />
              )}
            </div>
          )}

          <section aria-labelledby="historico" className="flex flex-col gap-3">
            <h2 id="historico" className="text-lg font-semibold text-texto-forte">
              Últimas cargas
            </h2>
            {estado.cargas.length === 0 ? (
              <p className="rounded-md border border-borda-suave bg-superficie p-4 text-texto">
                Nenhuma carga enviada ainda.
              </p>
            ) : (
              <div className="relative overflow-x-auto">
                <table className="w-full min-w-[36rem] text-left">
                  <thead>
                    <tr className="border-b border-borda text-sm text-texto-suave">
                      <th scope="col" className="py-2 pr-3">
                        Arquivo
                      </th>
                      <th scope="col" className="py-2 pr-3">
                        Mês
                      </th>
                      <th scope="col" className="py-2 pr-3">
                        Enviada em
                      </th>
                      <th scope="col" className="py-2 pr-3">
                        Situação
                      </th>
                      <th scope="col" className="py-2">
                        <span className="sr-only">Ações</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {estado.cargas.map((c) => (
                      <tr key={c.id} className="border-b border-borda-suave">
                        <td className="py-2 pr-3 text-texto-forte">{nomeCarga(c)}</td>
                        <td className="py-2 pr-3">{c.mesReferencia ?? '—'}</td>
                        <td className="py-2 pr-3">
                          {new Date(c.inicioEm).toLocaleString('pt-BR', {
                            timeZone: 'America/Porto_Velho',
                          })}
                        </td>
                        <td className="py-2 pr-3">{ROTULO_STATUS_CARGA[c.status]}</td>
                        <td className="py-2">
                          <button
                            type="button"
                            onClick={() => setSelecionada(c.id)}
                            aria-pressed={selecionada === c.id}
                            className="min-h-[var(--spacing-alvo)] rounded-md px-3 font-semibold text-primaria underline"
                          >
                            Ver detalhes
                            <span className="sr-only">
                              {' '}
                              da carga {nomeCarga(c)}, {c.id}
                            </span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
