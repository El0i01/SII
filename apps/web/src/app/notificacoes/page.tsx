'use client';

import type { Parecer, StatusNotificacao } from '@sii/shared';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { type ErrosParecer, FormularioParecer } from '@/components/formulario-parecer';
import { CabecalhoPagina } from '@/components/ui/cabecalho-pagina';
import { Carregando, Erro, SemPermissao, Vazio } from '@/components/ui/estado';
import { GradeKpis, Kpi } from '@/components/ui/kpi';
import { Pill, type Tom, tomDoPrazo } from '@/components/ui/pill';
import { api, ErroApi } from '@/lib/api';
import {
  type CaixaNotificacoes,
  dataBr,
  type NotificacaoDetalhe,
  ROTULO_EVENTO,
  ROTULO_STATUS_NOTIFICACAO,
} from '@/lib/casos';

type Estado =
  | { tipo: 'carregando' }
  | { tipo: 'erro'; mensagem: string }
  | { tipo: 'sem-permissao' }
  | { tipo: 'pronto'; caixa: CaixaNotificacoes };

const SITUACOES: (StatusNotificacao | '')[] = ['', 'NOVA', 'EM_ANALISE', 'PARECER_EMITIDO'];

const TOM_NOTIFICACAO: Record<StatusNotificacao, Tom> = {
  NOVA: 'alerta',
  EM_ANALISE: 'info',
  PARECER_EMITIDO: 'bom',
};

function Etiqueta({ status }: { status: StatusNotificacao }) {
  return <Pill tom={TOM_NOTIFICACAO[status]}>{ROTULO_STATUS_NOTIFICACAO[status]}</Pill>;
}

/**
 * Notificações à Assistência Social (P11), como no protótipo: KPIs, caixa de entrada com filtro,
 * detalhe com a trilha do caso e o parecer. A criança aparece só pelas iniciais.
 */
export default function Notificacoes() {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' });
  const [situacao, setSituacao] = useState<StatusNotificacao | ''>('');
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<NotificacaoDetalhe | null>(null);
  const [erroDetalhe, setErroDetalhe] = useState<string | null>(null);

  const tratarErro = useCallback(
    (e: unknown) => {
      if (e instanceof ErroApi && e.status === 401) router.push('/entrar?proximo=/notificacoes');
      else if (e instanceof ErroApi && e.status === 403) setEstado({ tipo: 'sem-permissao' });
      else
        setEstado({
          tipo: 'erro',
          mensagem: e instanceof Error ? e.message : 'Não foi possível carregar.',
        });
    },
    [router],
  );

  const carregar = useCallback(async () => {
    try {
      const caixa = await api<CaixaNotificacoes>(
        `/notificacoes${situacao ? `?situacao=${situacao}` : ''}`,
      );
      setEstado({ tipo: 'pronto', caixa });
      setSelecionada((s) => {
        const pedida = new URLSearchParams(window.location.search).get('codigo');
        // A selecionada continua aberta mesmo se sair do filtro (ex.: acabou de receber parecer).
        if (s) return s;
        if (pedida && caixa.notificacoes.some((n) => n.codigo === pedida)) return pedida;
        return caixa.notificacoes[0]?.codigo ?? null;
      });
    } catch (e) {
      tratarErro(e);
    }
  }, [situacao, tratarErro]);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    if (!selecionada) {
      setDetalhe(null);
      return;
    }
    setErroDetalhe(null);
    api<NotificacaoDetalhe>(`/notificacoes/${selecionada}`)
      .then(setDetalhe)
      .catch((e: unknown) => setErroDetalhe(e instanceof Error ? e.message : 'Erro ao abrir.'));
  }, [selecionada]);

  async function emAnalise() {
    if (!detalhe) return;
    try {
      setDetalhe(
        await api<NotificacaoDetalhe>(`/notificacoes/${detalhe.codigo}/em-analise`, {
          method: 'POST',
        }),
      );
      await carregar();
    } catch (e) {
      setErroDetalhe(e instanceof Error ? e.message : 'Não foi possível marcar.');
    }
  }

  async function enviarParecer(p: Parecer): Promise<ErrosParecer | null> {
    if (!detalhe) return null;
    try {
      setDetalhe(
        await api<NotificacaoDetalhe>(`/notificacoes/${detalhe.codigo}/parecer`, {
          method: 'POST',
          body: JSON.stringify(p),
        }),
      );
      await carregar();
      return null;
    } catch (e) {
      if (e instanceof ErroApi && e.status === 401) {
        tratarErro(e);
        return null;
      }
      if (e instanceof ErroApi && Object.keys(e.campos).length > 0) {
        const r: ErrosParecer = {};
        for (const c of ['desfecho', 'texto', 'dataNovaVisita'] as const) {
          const m = e.campos[c]?.[0];
          if (m) r[c] = m;
        }
        if (Object.keys(r).length > 0) return r;
      }
      return { geral: e instanceof Error ? e.message : 'Não foi possível enviar o parecer.' };
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoPagina
        titulo="Notificações à Assistência Social"
        descricao="Quando um aluno completa 5 dias letivos seguidos sem frequência, o sistema notifica o CRAS do território. A Assistência registra um parecer, que volta para a escola e fica na trilha do caso. Prazo do parecer: 5 dias úteis."
      />

      {estado.tipo === 'carregando' && (
        <Carregando rotulo="Carregando as notificações" altura="h-96" />
      )}
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
          As notificações são acompanhadas pelo CRAS, pela escola do aluno, pela SEMED e pelo Comitê
          Gestor. Se você precisa de acesso, fale com a CTI.
        </SemPermissao>
      )}

      {estado.tipo === 'pronto' && (
        <>
          <GradeKpis>
            <Kpi
              tom="alerta"
              rotulo="Novas"
              valor={estado.caixa.contagens.novas}
              detalhe="aguardando o CRAS"
            />
            <Kpi
              rotulo="Em análise"
              valor={estado.caixa.contagens.emAnalise}
              detalhe="visita em andamento"
            />
            <Kpi
              rotulo="Pareceres emitidos"
              valor={estado.caixa.contagens.pareceres}
              detalhe="devolvidos à escola"
            />
            <Kpi
              rotulo="Fora do prazo"
              valor={estado.caixa.contagens.foraDoPrazo}
              detalhe="mais de 5 dias úteis sem parecer"
              tom="critico"
            />
          </GradeKpis>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[22rem_1fr]">
            <section aria-labelledby="caixa" className="flex flex-col gap-3">
              <h2 id="caixa" className="text-lg font-semibold text-texto-forte">
                Caixa de entrada
              </h2>
              <div className="flex flex-col gap-1">
                <label htmlFor="situacao" className="font-semibold text-texto-forte">
                  Situação
                </label>
                <select
                  id="situacao"
                  value={situacao}
                  onChange={(e) => setSituacao(e.target.value as StatusNotificacao | '')}
                  className="min-h-[var(--spacing-alvo)] rounded-md border border-borda bg-fundo px-3 text-texto-forte"
                >
                  {SITUACOES.map((s) => (
                    <option key={s} value={s}>
                      {s ? ROTULO_STATUS_NOTIFICACAO[s] : 'Todas'}
                    </option>
                  ))}
                </select>
              </div>
              {estado.caixa.notificacoes.length === 0 ? (
                <Vazio titulo="Nenhuma notificação nesta situação">Escolha outra no filtro.</Vazio>
              ) : (
                <ul className="flex max-h-[32rem] flex-col gap-2 overflow-y-auto">
                  {estado.caixa.notificacoes.map((n) => (
                    <li key={n.codigo}>
                      <button
                        type="button"
                        aria-pressed={n.codigo === selecionada}
                        onClick={() => setSelecionada(n.codigo)}
                        className="flex min-h-[var(--spacing-alvo)] w-full items-start justify-between gap-2 rounded-md border border-borda-suave bg-fundo p-3 text-left aria-pressed:border-primaria aria-pressed:bg-primaria-clara"
                      >
                        <span className="flex flex-col">
                          <span className="font-semibold text-texto-forte">
                            {n.codigo} · {n.crianca.iniciais}
                          </span>
                          <span className="text-sm text-texto-suave">
                            {n.escola?.nome ?? 'Sem escola'} · {dataBr(n.criadaEm)}
                          </span>
                        </span>
                        <Etiqueta status={n.status} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-live="polite" aria-label="Notificação selecionada">
              {erroDetalhe && (
                <p
                  role="alert"
                  className="mb-3 rounded-md border-l-4 border-erro bg-erro-claro p-3"
                >
                  {erroDetalhe}
                </p>
              )}
              {!detalhe && !erroDetalhe && (
                <p className="rounded-md border border-borda-suave bg-superficie p-4 text-texto">
                  Escolha uma notificação na caixa de entrada.
                </p>
              )}
              {detalhe && <Detalhe d={detalhe} onEmAnalise={emAnalise} onParecer={enviarParecer} />}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function Detalhe({
  d,
  onEmAnalise,
  onParecer,
}: {
  d: NotificacaoDetalhe;
  onEmAnalise: () => Promise<void>;
  onParecer: (p: Parecer) => Promise<ErrosParecer | null>;
}) {
  return (
    <article className="flex flex-col gap-4 rounded-md border border-borda-suave bg-fundo p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold text-texto-forte">{d.codigo}</h2>
          <p className="text-texto-suave">
            {d.motivo} · recebida em {dataBr(d.criadaEm)} · caso {d.caso}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Etiqueta status={d.status} />
          {d.prazo && <Pill tom={tomDoPrazo(d.prazo.tom)}>{d.prazo.rotulo}</Pill>}
        </div>
      </header>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-texto-suave">Criança</dt>
          <dd className="text-texto-forte">
            {d.crianca.iniciais}
            {d.crianca.idade !== null && ` · ${d.crianca.idade} anos`}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-texto-suave">Escola</dt>
          <dd className="text-texto-forte">{d.escola?.nome ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-sm text-texto-suave">Território</dt>
          <dd className="text-texto-forte">
            {[d.territorio.localidade, d.territorio.setor].filter(Boolean).join(' · ') || '—'}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-texto-suave">Prazo do parecer</dt>
          <dd className="text-texto-forte">{dataBr(d.prazoEm)}</dd>
        </div>
      </dl>

      {d.parecer && (
        <div className="rounded-md border-l-4 border-sucesso bg-sucesso-claro p-4">
          <h3 className="font-semibold text-texto-forte">Parecer: {d.parecer.rotuloDesfecho}</h3>
          <p className="mt-1 whitespace-pre-line text-texto-forte">{d.parecer.texto}</p>
          <p className="mt-2 text-sm text-texto-suave">
            {d.parecer.autor} · {dataBr(d.parecer.emitidoEm)}
            {d.parecer.novaVisita &&
              ` · nova visita em ${d.parecer.dataNovaVisita ? dataBr(d.parecer.dataNovaVisita) : 'data a definir'}`}
            . A escola e a SEMED foram avisadas.
          </p>
        </div>
      )}
      {!d.parecer && d.podeResponder && (
        <FormularioParecer
          key={d.codigo}
          onEnviar={onParecer}
          {...(d.status === 'NOVA' ? { onEmAnalise } : {})}
        />
      )}
      {!d.parecer && !d.podeResponder && (
        <p className="rounded-md border border-borda-suave bg-superficie p-4 text-texto">
          Aguardando o parecer da Assistência Social. A escola recebe um aviso quando o CRAS
          registrar a visita.
        </p>
      )}

      <section aria-labelledby="trilha">
        <h3 id="trilha" className="mb-2 font-semibold text-texto-forte">
          Trilha do caso
        </h3>
        <ol className="flex flex-col gap-1 border-l-2 border-borda pl-4">
          {d.trilha.eventos.map((e) => (
            <li key={e.seq} className="text-texto">
              <span className="font-semibold text-texto-forte">
                {ROTULO_EVENTO[e.tipo] ?? e.tipo}
              </span>{' '}
              · {dataBr(e.ocorridoEm)}
            </li>
          ))}
        </ol>
        {d.trilha.verificador && (
          <p className="mt-2 text-sm text-texto-suave">
            Código verificador da trilha: <span className="font-mono">{d.trilha.verificador}</span>
          </p>
        )}
      </section>
    </article>
  );
}
