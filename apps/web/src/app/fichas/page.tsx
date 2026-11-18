'use client';

import {
  Encaminhamento,
  FILTROS_FICHA,
  type FiltroFicha,
  ROTULO_FILTRO_FICHA,
  type RevelarCpf,
  type TipoCaso,
} from '@sii/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { type ErrosRevelar, FormularioRevelarCpf } from '@/components/revelar-cpf';
import { CabecalhoPagina } from '@/components/ui/cabecalho-pagina';
import { Carregando, Erro, SemPermissao, Sucesso } from '@/components/ui/estado';
import { GradeKpis, Kpi } from '@/components/ui/kpi';
import { Pill } from '@/components/ui/pill';
import { gravarParametrosDaTela, useFiltrosGlobais } from '@/lib/filtros-url';
import { api, ErroApi } from '@/lib/api';
import { dataBr, ROTULO_TIPO_CASO } from '@/lib/casos';
import { anos, enderecoFicha, type Ficha, type ListaFichas } from '@/lib/fichas';

type Estado =
  | { tipo: 'carregando' }
  | { tipo: 'erro'; mensagem: string }
  | { tipo: 'sem-permissao' }
  | { tipo: 'pronto'; lista: ListaFichas };

const BOTAO =
  'inline-flex min-h-[var(--spacing-alvo)] items-center rounded-md border border-primaria px-4 font-semibold text-primaria';

const SimNao = ({ v }: { v: boolean }) => (
  <Pill tom={v ? 'bom' : 'neutro'}>{v ? 'Sim' : 'Não'}</Pill>
);

function lerUrl(): { busca: string; filtro: FiltroFicha; ficha: number | null } {
  const p = new URLSearchParams(window.location.search);
  const f = p.get('filtro') as FiltroFicha | null;
  const id = Number(p.get('ficha'));
  return {
    busca: p.get('busca') ?? '',
    filtro: f && FILTROS_FICHA.includes(f) ? f : 'todas',
    ficha: Number.isInteger(id) && id > 0 ? id : null,
  };
}

/**
 * Ficha da criança (§3.8, P12), como no protótipo: KPIs, lista ordenada pela necessidade de
 * acompanhamento (busca e filtro na URL) e a ficha ao lado. A criança aparece pelas iniciais; o CPF,
 * mascarado, só é revelado com finalidade registrada.
 */
export default function Fichas() {
  const router = useRouter();
  const [filtrosGlobais] = useFiltrosGlobais();
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' });
  const [busca, setBusca] = useState('');
  const [buscaAplicada, setBuscaAplicada] = useState('');
  const [filtro, setFiltro] = useState<FiltroFicha>('todas');
  const [selecionada, setSelecionada] = useState<number | null>(null);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    const u = lerUrl();
    setBusca(u.busca);
    setBuscaAplicada(u.busca);
    setFiltro(u.filtro);
    setSelecionada(u.ficha);
    setPronto(true);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setBuscaAplicada(busca.trim()), 300);
    return () => clearTimeout(t);
  }, [busca]);

  // Filtros persistentes na URL (dá para voltar e compartilhar o link sem dado pessoal).
  useEffect(() => {
    if (!pronto) return;
    gravarParametrosDaTela({
      busca: buscaAplicada || null,
      filtro: filtro === 'todas' ? null : filtro,
      ficha: selecionada ? String(selecionada) : null,
    });
  }, [pronto, buscaAplicada, filtro, selecionada]);

  const territorio = filtrosGlobais?.territorio ?? null;
  const carregar = useCallback(async () => {
    if (!filtrosGlobais) return;
    const p = new URLSearchParams({ filtro });
    if (buscaAplicada) p.set('busca', buscaAplicada);
    if (territorio) p.set('territorio', territorio);
    try {
      const lista = await api<ListaFichas>(`/fichas?${p.toString()}`);
      setEstado({ tipo: 'pronto', lista });
      setSelecionada((s) => s ?? lista.fichas[0]?.id ?? null);
    } catch (e) {
      if (e instanceof ErroApi && e.status === 401) router.push('/entrar?proximo=/fichas');
      else if (e instanceof ErroApi && e.status === 403) setEstado({ tipo: 'sem-permissao' });
      else
        setEstado({
          tipo: 'erro',
          mensagem: e instanceof Error ? e.message : 'Não foi possível carregar.',
        });
    }
  }, [filtro, buscaAplicada, router, filtrosGlobais, territorio]);
  useEffect(() => {
    if (pronto) void carregar();
  }, [pronto, carregar]);

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoPagina
        titulo="Ficha da criança"
        descricao="Uma ficha por criança e adolescente, com o histórico nas três secretarias: escola e frequência, vacinação e visitas do ACS, CRAS, Criança Feliz e encaminhamentos."
        fontes="Fontes: gestão escolar, e-SUS PEC, CadÚnico, CRAS, Criança Feliz"
      />

      {estado.tipo === 'carregando' && <Carregando rotulo="Carregando as fichas" altura="h-96" />}
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
          Seu perfil não vê dados nominais. Os indicadores agregados ficam no painel de controle
          externo. Se você precisa de acesso, fale com a CTI.
        </SemPermissao>
      )}

      {estado.tipo === 'pronto' && (
        <>
          <GradeKpis>
            <Kpi
              tom="info"
              rotulo="Fichas no território"
              valor={estado.lista.kpis.fichas}
              detalhe="0 a 17 anos"
            />
            <Kpi
              rotulo="Precisam de visita"
              valor={estado.lista.kpis.precisamVisita}
              detalhe={`${estado.lista.kpis.fichas ? Math.round((estado.lista.kpis.precisamVisita * 100) / estado.lista.kpis.fichas) : 0}% das fichas`}
            />
            <Kpi
              rotulo="Acompanhadas pelo CRAS"
              valor={estado.lista.kpis.acompanhadasCras}
              detalhe="PAIF"
            />
            <Kpi
              rotulo="No Criança Feliz"
              valor={estado.lista.kpis.criancaFeliz}
              detalhe="0 a 3 anos"
            />
          </GradeKpis>

          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(16rem,21rem)_1fr]">
            <section aria-labelledby="lista" className="flex flex-col gap-3">
              <div>
                <h2 id="lista" className="text-lg font-semibold text-texto-forte">
                  Crianças
                </h2>
                <p className="text-sm text-texto-suave">
                  Ordenadas pela necessidade de acompanhamento
                </p>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="busca" className="font-semibold text-texto-forte">
                  Buscar por código, iniciais, quadra ou escola
                </label>
                <input
                  id="busca"
                  type="search"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Ex.: CI-1023 ou Q052"
                  className="min-h-[var(--spacing-alvo)] rounded-md border border-borda bg-fundo px-3 text-texto-forte"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="filtro" className="font-semibold text-texto-forte">
                  Mostrar
                </label>
                <select
                  id="filtro"
                  value={filtro}
                  onChange={(e) => setFiltro(e.target.value as FiltroFicha)}
                  className="min-h-[var(--spacing-alvo)] rounded-md border border-borda bg-fundo px-3 text-texto-forte"
                >
                  {FILTROS_FICHA.map((f) => (
                    <option key={f} value={f}>
                      {ROTULO_FILTRO_FICHA[f]}
                    </option>
                  ))}
                </select>
              </div>
              {estado.lista.fichas.length === 0 ? (
                <p className="rounded-md border border-borda-suave bg-superficie p-4 text-texto">
                  Nenhuma criança corresponde à busca. Limpe a busca ou escolha outro filtro.
                </p>
              ) : (
                <>
                  <ul className="flex max-h-[48rem] flex-col gap-1 overflow-y-auto">
                    {estado.lista.fichas.map((f) => (
                      <li key={f.id}>
                        <button
                          type="button"
                          aria-pressed={f.id === selecionada}
                          onClick={() => setSelecionada(f.id)}
                          className="flex min-h-[var(--spacing-alvo)] w-full items-center justify-between gap-2 rounded-md border border-borda-suave bg-fundo px-3 py-2 text-left aria-pressed:border-primaria aria-pressed:bg-primaria-clara"
                        >
                          <span className="flex flex-col">
                            <span className="text-texto-forte">
                              <b>{f.iniciais}</b> · {anos(f.idade)}
                            </span>
                            <span className="text-sm text-texto-suave">
                              {[f.codigo, f.localidade, f.setor].filter(Boolean).join(' · ')}
                            </span>
                          </span>
                          {f.motivos > 0 ? (
                            <Pill tom="alerta">
                              {f.motivos} {f.motivos > 1 ? 'alertas' : 'alerta'}
                            </Pill>
                          ) : (
                            <Pill tom="bom">Em dia</Pill>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                  {estado.lista.total > estado.lista.fichas.length && (
                    <p className="text-sm text-texto-suave">
                      Mostrando {estado.lista.fichas.length} de {estado.lista.total}. Refine a
                      busca.
                    </p>
                  )}
                </>
              )}
            </section>

            <section aria-live="polite" aria-label="Ficha selecionada">
              {selecionada ? (
                <PainelFicha key={selecionada} id={selecionada} />
              ) : (
                <p className="rounded-md border border-borda-suave bg-superficie p-4 text-texto">
                  Escolha uma criança na lista.
                </p>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function PainelFicha({ id }: { id: number }) {
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [revelando, setRevelando] = useState(false);
  const [cpf, setCpf] = useState<string | null>(null);
  const [encaminhando, setEncaminhando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const botaoRevelar = useRef<HTMLButtonElement>(null);

  const carregar = useCallback(() => {
    setErro(null);
    api<Ficha>(`/fichas/${id}`)
      .then(setFicha)
      .catch((e: unknown) =>
        setErro(
          e instanceof ErroApi && e.status === 404
            ? 'Esta ficha não está no seu território ou não existe mais.'
            : e instanceof Error
              ? e.message
              : 'Não foi possível abrir a ficha.',
        ),
      );
  }, [id]);
  useEffect(carregar, [carregar]);

  async function revelar(r: RevelarCpf): Promise<ErrosRevelar | null> {
    try {
      const resp = await api<{ cpf: string }>(`/fichas/${id}/revelar-cpf`, {
        method: 'POST',
        body: JSON.stringify(r),
      });
      setCpf(resp.cpf);
      setRevelando(false);
      return null;
    } catch (e) {
      if (e instanceof ErroApi) {
        const finalidade = e.campos.finalidade?.[0];
        const detalhe = e.campos.detalhe?.[0];
        if (finalidade || detalhe)
          return { ...(finalidade ? { finalidade } : {}), ...(detalhe ? { detalhe } : {}) };
      }
      return { geral: e instanceof Error ? e.message : 'Não foi possível revelar o CPF.' };
    }
  }

  if (erro)
    return (
      <p role="alert" className="rounded-md border-l-4 border-erro bg-erro-claro p-3">
        {erro}
      </p>
    );
  if (!ficha)
    return (
      <div aria-busy="true" aria-label="Carregando a ficha" className="flex flex-col gap-3">
        <div className="h-40 animate-pulse rounded-md bg-borda-suave" />
        <div className="h-64 animate-pulse rounded-md bg-borda-suave" />
      </div>
    );

  const f = ficha;
  return (
    <div className="flex flex-col gap-4">
      <article className="flex flex-col gap-4 rounded-md border border-borda-suave bg-fundo p-4">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-texto-forte">
              {f.iniciais} · {anos(f.idade)}
            </h2>
            <p className="text-texto-suave">
              {f.codigo} · CPF{' '}
              <span className="font-mono text-texto-forte" aria-live="polite">
                {cpf ?? f.cpf ?? 'não informado'}
              </span>{' '}
              · {enderecoFicha(f.endereco)}
            </p>
            {cpf && (
              <p className="text-sm text-texto-suave">
                CPF revelado. O acesso foi registrado no painel do encarregado de dados.
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {f.cpf && !cpf && !revelando && (
              <button
                ref={botaoRevelar}
                type="button"
                onClick={() => setRevelando(true)}
                className={BOTAO}
              >
                Revelar CPF
              </button>
            )}
            {f.notificacaoAberta ? (
              <Link href={`/notificacoes?codigo=${f.notificacaoAberta}`} className={BOTAO}>
                Ver notificação {f.notificacaoAberta}
              </Link>
            ) : (
              f.podeEncaminhar &&
              !encaminhando && (
                <button
                  type="button"
                  onClick={() => setEncaminhando(true)}
                  className="min-h-[var(--spacing-alvo)] rounded-md bg-primaria px-4 font-semibold text-fundo"
                >
                  Encaminhar à Assistência
                </button>
              )
            )}
          </div>
        </header>

        {revelando && (
          <FormularioRevelarCpf
            onRevelar={revelar}
            onCancelar={() => {
              setRevelando(false);
              setTimeout(() => botaoRevelar.current?.focus(), 0);
            }}
          />
        )}
        {encaminhando && (
          <FormularioEncaminhar
            pessoaId={f.id}
            onCancelar={() => setEncaminhando(false)}
            onEncaminhado={(m) => {
              setEncaminhando(false);
              setMensagem(m);
              carregar();
            }}
          />
        )}
        {mensagem && <Sucesso>{mensagem}</Sucesso>}

        {f.motivos.length > 0 ? (
          <div className="rounded-md border-l-4 border-alerta-destaque bg-alerta-claro p-3">
            <h3 className="font-semibold text-texto-forte">Precisa de visita</h3>
            <p className="text-texto-forte">{f.motivos.map((m) => m.rotulo).join(' · ')}</p>
          </div>
        ) : (
          <div className="rounded-md border-l-4 border-sucesso bg-sucesso-claro p-3">
            <h3 className="font-semibold text-texto-forte">Acompanhamento em dia</h3>
            <p className="text-texto-forte">Nenhum alerta aberto para esta criança.</p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {f.educacao && (
            <Bloco
              titulo="Educação"
              fonte="SEMED"
              linhas={[
                [
                  'Situação',
                  f.educacao.situacao === 'MATRICULADA' ? (
                    'Matriculada'
                  ) : f.educacao.situacao === 'FORA_DA_ESCOLA' ? (
                    <Pill tom="critico">Fora da escola</Pill>
                  ) : (
                    'Sem matrícula em creche'
                  ),
                ],
                ['Escola', f.educacao.escola ?? '—'],
                ['Turma', f.educacao.turma ?? '—'],
                [
                  'Frequência no mês',
                  f.educacao.frequenciaMes === null ? '—' : `${f.educacao.frequenciaMes}%`,
                ],
                [
                  'Faltas seguidas',
                  f.educacao.faltasSeguidas === null ? (
                    '—'
                  ) : f.educacao.faltasSeguidas >= 5 ? (
                    <b className="text-erro">{f.educacao.faltasSeguidas} dias</b>
                  ) : (
                    String(f.educacao.faltasSeguidas)
                  ),
                ],
              ]}
            />
          )}
          {f.saude && (
            <Bloco
              titulo="Saúde"
              fonte="SEMSAU"
              linhas={[
                ['Unidade de referência', f.saude.ubs ?? '—'],
                [
                  'Vacinação',
                  f.saude.vacinacaoEmDia === null ? (
                    'Sem informação'
                  ) : f.saude.vacinacaoEmDia ? (
                    <Pill tom="bom">Em dia</Pill>
                  ) : (
                    <Pill tom="critico">Atrasada</Pill>
                  ),
                ],
                [
                  'Última visita do ACS',
                  f.saude.ultimaVisitaAcs
                    ? `${dataBr(f.saude.ultimaVisitaAcs)} (${f.saude.diasSemVisitaAcs} dias)`
                    : 'Sem registro',
                ],
              ]}
            />
          )}
          {f.assistencia && (
            <Bloco
              titulo="Assistência Social"
              fonte="CRAS"
              linhas={[
                [
                  'CadÚnico',
                  f.assistencia.cadunicoAtualizadoEm
                    ? `Atualizado em ${dataBr(f.assistencia.cadunicoAtualizadoEm)}`
                    : 'Não cadastrada',
                ],
                ['Bolsa Família', <SimNao key="pbf" v={f.assistencia.bolsaFamilia} />],
                [
                  'Acompanhada pelo CRAS',
                  f.assistencia.cras
                    ? `Sim (${f.assistencia.cras.tipo})${f.assistencia.cras.ultimoAtendimento ? `, em ${dataBr(f.assistencia.cras.ultimoAtendimento)}` : ''}`
                    : 'Não',
                ],
                [
                  'Criança Feliz',
                  f.assistencia.criancaFeliz
                    ? `Sim${f.assistencia.criancaFeliz.ultimaVisita ? `, visita em ${dataBr(f.assistencia.criancaFeliz.ultimaVisita)}` : ''}`
                    : f.idade <= 3
                      ? 'Não'
                      : 'Fora da faixa etária',
                ],
              ]}
            />
          )}
          {f.protecao && (
            <Bloco
              titulo="Proteção e inclusão"
              fonte="Acesso restrito"
              linhas={[
                [
                  'Conselho Tutelar',
                  f.protecao.conselhoTutelarEm
                    ? `Encaminhada em ${dataBr(f.protecao.conselhoTutelarEm)}`
                    : 'Sem encaminhamento',
                ],
                [
                  'Atendimento especializado',
                  !f.protecao.necessitaAee ? (
                    'Não indicado'
                  ) : f.protecao.atendimento === 'SALA_RECURSOS' ? (
                    'Sala de recursos'
                  ) : f.protecao.atendimento === 'APAE' ? (
                    'APAE'
                  ) : (
                    <Pill tom="critico">Necessita, sem atendimento</Pill>
                  ),
                ],
                ['BPC', f.protecao.necessitaAee ? <SimNao key="bpc" v={f.protecao.bpc} /> : '—'],
              ]}
            />
          )}
        </div>
        <p className="text-sm text-texto-suave">
          Laudo e CID não aparecem na ficha. A Educação e a Assistência veem só a necessidade de
          atendimento.
        </p>
      </article>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {f.historico && (
          <section
            aria-labelledby="historico"
            className="rounded-md border border-borda-suave bg-fundo p-4"
          >
            <h3 id="historico" className="font-semibold text-texto-forte">
              Histórico no município
            </h3>
            <p className="mb-3 text-sm text-texto-suave">
              Eventos das três secretarias, do mais recente ao mais antigo
            </p>
            {f.historico.length === 0 ? (
              <p className="text-texto">Nenhum evento registrado.</p>
            ) : (
              <ol className="flex flex-col gap-2 border-l-2 border-borda pl-4">
                {f.historico.map((e, i) => (
                  <li key={i}>
                    <span className="font-semibold text-texto-forte">{e.texto}</span>
                    <span className="block text-sm text-texto-suave">
                      {[dataBr(e.quando), e.origem, e.detalhe].filter(Boolean).join(' · ')}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}
        {f.visitas && (
          <section
            aria-labelledby="visitas"
            className="rounded-md border border-borda-suave bg-fundo p-4"
          >
            <h3 id="visitas" className="font-semibold text-texto-forte">
              Relatórios de visita
            </h3>
            <p className="mb-3 text-sm text-texto-suave">Registrados pelas equipes de campo</p>
            {f.visitas.length === 0 ? (
              <p className="text-texto">Nenhuma visita registrada.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {f.visitas.map((v, i) => (
                  <li key={i} className="border-l-4 border-primaria pl-3">
                    <span className="block text-sm text-texto-suave">
                      {dataBr(v.quando)} · {v.autor}
                      {v.parecer && ` · parecer da notificação ${v.parecer.notificacao}`}
                    </span>
                    <p className="whitespace-pre-line text-texto">{v.texto}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function Bloco({
  titulo,
  fonte,
  linhas,
}: {
  titulo: string;
  fonte: string;
  linhas: [string, ReactNode][];
}) {
  return (
    <section className="rounded-md border border-borda-suave bg-superficie p-3">
      <h3 className="mb-2 flex justify-between gap-2 font-semibold text-texto-forte">
        {titulo} <span className="text-sm font-normal text-texto-suave">{fonte}</span>
      </h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
        {linhas.map(([rotulo, valor]) => (
          <div key={rotulo} className="contents">
            <dt className="text-sm text-texto-suave">{rotulo}</dt>
            <dd className="text-right text-texto-forte">{valor}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

const TIPOS_ENCAMINHAMENTO: TipoCaso[] = [
  'INFREQUENCIA',
  'BUSCA_ATIVA_ESCOLAR',
  'PRIMEIRA_INFANCIA_SEM_CUIDADO',
  'INCLUSAO_SEM_ATENDIMENTO',
];

/** Encaminhamento manual à Assistência (endpoint do P11), com o schema `Encaminhamento`. */
function FormularioEncaminhar({
  pessoaId,
  onCancelar,
  onEncaminhado,
}: {
  pessoaId: number;
  onCancelar: () => void;
  onEncaminhado: (mensagem: string) => void;
}) {
  const [erros, setErros] = useState<Partial<Record<'motivo' | 'geral', string>>>({});
  const [enviando, setEnviando] = useState(false);
  const motivo = useRef<HTMLTextAreaElement>(null);
  useEffect(() => motivo.current?.focus(), []);

  async function enviar(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const d = new FormData(ev.currentTarget);
    const r = Encaminhamento.safeParse({
      pessoaId,
      tipoCaso: d.get('tipoCaso'),
      destino: 'ASSISTENCIA',
      motivo: String(d.get('motivo') ?? ''),
    });
    if (!r.success) {
      setErros({ motivo: r.error.issues[0]?.message ?? 'Confira o motivo.' });
      motivo.current?.focus();
      return;
    }
    setEnviando(true);
    try {
      const resp = await api<{ codigo: string; notificacao?: string | null }>(
        '/casos/encaminhamentos',
        { method: 'POST', body: JSON.stringify(r.data) },
      );
      onEncaminhado(
        `Caso ${resp.codigo} aberto${resp.notificacao ? ` e notificação ${resp.notificacao} enviada ao CRAS` : ''}.`,
      );
    } catch (e) {
      setErros({ geral: e instanceof Error ? e.message : 'Não foi possível encaminhar.' });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form
      onSubmit={enviar}
      noValidate
      aria-labelledby="encaminhar-titulo"
      className="flex flex-col gap-3 rounded-md border border-primaria bg-primaria-clara p-4"
    >
      <h3 id="encaminhar-titulo" className="font-semibold text-texto-forte">
        Encaminhar à Assistência Social
      </h3>
      {erros.geral && (
        <p role="alert" className="rounded-md border-l-4 border-erro bg-erro-claro p-3">
          {erros.geral}
        </p>
      )}
      <div className="flex flex-col gap-1">
        <label htmlFor="tipoCaso" className="font-semibold text-texto-forte">
          Tipo de caso
        </label>
        <select
          id="tipoCaso"
          name="tipoCaso"
          className="min-h-[var(--spacing-alvo)] rounded-md border border-borda bg-fundo px-3 text-texto-forte"
        >
          {TIPOS_ENCAMINHAMENTO.map((t) => (
            <option key={t} value={t}>
              {ROTULO_TIPO_CASO[t]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="motivo" className="font-semibold text-texto-forte">
          Motivo
        </label>
        <textarea
          ref={motivo}
          id="motivo"
          name="motivo"
          rows={3}
          className="rounded-md border border-borda bg-fundo px-3 py-2 text-texto-forte aria-[invalid=true]:border-erro"
          aria-invalid={!!erros.motivo}
          aria-describedby={erros.motivo ? 'motivo-ajuda motivo-erro' : 'motivo-ajuda'}
        />
        <p id="motivo-ajuda" className="text-sm text-texto-suave">
          O que a escola observou. Não registre diagnóstico de saúde nem código CID.
        </p>
        {erros.motivo && (
          <p id="motivo-erro" className="text-sm text-erro">
            {erros.motivo}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={enviando}
          className="min-h-[var(--spacing-alvo)] rounded-md bg-primaria px-4 font-semibold text-fundo disabled:opacity-70"
        >
          {enviando ? 'Encaminhando…' : 'Encaminhar ao CRAS'}
        </button>
        <button type="button" onClick={onCancelar} className={BOTAO}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
