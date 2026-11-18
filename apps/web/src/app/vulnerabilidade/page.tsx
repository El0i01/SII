'use client';

import {
  AprovarPesosIvm,
  calcularIvm,
  contarFaixas,
  DIMENSOES_IVM,
  type DimensaoIvm,
  type FaixaIvm,
  faixaIvm,
  PESOS_IVM_PADRAO,
  type ValoresIvm,
} from '@sii/shared';
import Link from 'next/link';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { useSessao } from '@/components/layout/sessao';
import { Barras } from '@/components/ui/barras';
import { Botao } from '@/components/ui/button';
import { CabecalhoPagina } from '@/components/ui/cabecalho-pagina';
import { Card } from '@/components/ui/card';
import { Carregando, Erro, SemPermissao, Sucesso, Vazio } from '@/components/ui/estado';
import { GradeKpis, Kpi } from '@/components/ui/kpi';
import { Pill, type Tom } from '@/components/ui/pill';
import { type Coluna, Tabela } from '@/components/ui/tabela';
import { api } from '@/lib/api';
import { usePainel } from '@/lib/painel';

interface Quadra {
  id: number;
  codigo: string;
  setor: string;
  domicilios: number;
  dimensoes: ValoresIvm;
  ivm: number;
  faixa: FaixaIvm;
}
interface Versao {
  versao: number;
  pesos: ValoresIvm;
  aprovadoEm: string | null;
  aprovadoPor: string | null;
  justificativa: string | null;
}
interface Dados {
  vigente: { versao: number | null; pesos: ValoresIvm; proposta: boolean };
  versoes: Versao[];
  quadras: Quadra[];
}

const TOM_FAIXA: Record<FaixaIvm['tom'], Tom> = {
  ok: 'bom',
  info: 'info',
  alerta: 'alerta',
  critico: 'critico',
};
const virgula = (v: number) => v.toFixed(2).replace('.', ',');
const dataBr = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Porto_Velho' });
const DESCRICAO: Record<DimensaoIvm, string> = {
  renda: 'Famílias com renda per capita até a linha do Bolsa Família',
  saude: 'Vacina atrasada e pré-natal inadequado',
  escola: 'Fora da escola e infrequência',
  imovel: 'Saneamento e material da casa',
  regularizacao: 'Lotes sem titulação',
};

/**
 * Índice de vulnerabilidade municipal (§3.10, P19). Os sliders simulam no navegador; só o Comitê
 * Gestor aprova uma nova versão dos pesos, que vira a vigente e recalcula o mapa do Território.
 */
export default function Vulnerabilidade() {
  const { usuario } = useSessao();
  const comite = usuario?.perfil === 'COMITE_GESTOR';
  const { estado, carregar } = usePainel<Dados>('/ivm');
  const d = estado.tipo === 'pronto' ? estado.dados : null;
  const [pesos, setPesos] = useState<ValoresIvm>(PESOS_IVM_PADRAO);
  const [justificativa, setJustificativa] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [aprovada, setAprovada] = useState<number | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (d) setPesos(d.vigente.pesos);
  }, [d]);

  const total = DIMENSOES_IVM.reduce((a, k) => a + pesos[k.codigo], 0);
  const ranking = useMemo(
    () =>
      (d?.quadras ?? [])
        .map((q) => {
          const ivm = total > 0 ? calcularIvm(q.dimensoes, pesos) : 0;
          return { ...q, ivm, faixa: faixaIvm(ivm) };
        })
        .sort((a, b) => b.ivm - a.ivm || a.codigo.localeCompare(b.codigo)),
    [d, pesos, total],
  );
  const faixas = contarFaixas(ranking);
  const media = ranking.length ? ranking.reduce((a, q) => a + q.ivm, 0) / ranking.length : 0;
  const mudou = d
    ? DIMENSOES_IVM.some((k) => pesos[k.codigo] !== d.vigente.pesos[k.codigo])
    : false;

  async function aprovar(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const r = AprovarPesosIvm.safeParse({ pesos, justificativa });
    if (!r.success) {
      setErro(r.error.issues[0]?.message ?? 'Confira os pesos e a justificativa.');
      document.getElementById('justificativa')?.focus();
      return;
    }
    setErro(null);
    setEnviando(true);
    try {
      const v = await api<{ versao: number }>('/ivm/pesos', {
        method: 'POST',
        body: JSON.stringify(r.data),
      });
      setAprovada(v.versao);
      setJustificativa('');
      void carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível aprovar.');
    } finally {
      setEnviando(false);
    }
  }

  const colunas: Coluna<(typeof ranking)[number]>[] = [
    { id: 'pos', header: '#', numerica: true, enableSorting: false, cell: (c) => c.row.index + 1 },
    {
      accessorKey: 'codigo',
      header: 'Quadra',
      cell: (c) => (
        <span className="whitespace-nowrap">
          <b>{c.row.original.codigo}</b>{' '}
          <span className="text-sm text-texto-suave">{c.row.original.setor}</span>
        </span>
      ),
    },
    {
      accessorKey: 'ivm',
      header: 'Índice',
      cell: (c) => (
        <Pill tom={TOM_FAIXA[c.row.original.faixa.tom]}>
          {virgula(c.row.original.ivm)} · {c.row.original.faixa.rotulo}
        </Pill>
      ),
    },
    ...DIMENSOES_IVM.map((k) => ({
      id: k.codigo,
      header: k.rotulo,
      numerica: true,
      enableSorting: false,
      cell: (c: { row: { original: Quadra } }) => virgula(c.row.original.dimensoes[k.codigo]),
    })),
    { accessorKey: 'domicilios', header: 'Domicílios', numerica: true },
  ];

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoPagina
        titulo="Índice de vulnerabilidade municipal"
        descricao="Um número de 0 a 1 por quadra, que soma renda, saúde, escola, condição do imóvel e regularização. Quanto maior, mais a quadra precisa de ação conjunta das secretarias."
        fontes="Atualizado a cada carga · zona urbana"
      />
      {estado.tipo === 'carregando' && <Carregando rotulo="Carregando o índice" altura="h-96" />}
      {estado.tipo === 'erro' && (
        <Erro mensagem={estado.mensagem} onTentar={() => void carregar()} />
      )}
      {estado.tipo === 'sem-permissao' && (
        <SemPermissao>
          Este painel é das equipes das secretarias, do Comitê e do controle externo.
        </SemPermissao>
      )}
      {d && d.quadras.length === 0 && (
        <Vazio titulo="Nenhuma quadra com índice neste território">
          As dimensões chegam com as cargas. Escolha &quot;Todo o município&quot; no cabeçalho.
        </Vazio>
      )}
      {d && d.quadras.length > 0 && (
        <>
          <GradeKpis>
            <Kpi
              rotulo="Quadras com vulnerabilidade muito alta"
              valor={faixas.MUITO_ALTA}
              detalhe="índice de 0,65 ou mais"
              tom="critico"
            />
            <Kpi
              rotulo="Quadras com vulnerabilidade alta"
              valor={faixas.ALTA}
              detalhe="de 0,50 a 0,65"
              tom="alerta"
            />
            <Kpi rotulo="Índice médio" valor={virgula(media)} tom="info" />
            <Kpi rotulo="Quadras avaliadas" valor={ranking.length} />
          </GradeKpis>
          <p className="text-sm text-texto-suave">
            {d.vigente.proposta
              ? 'Pesos vigentes: a proposta inicial (ainda sem aprovação do Comitê Gestor).'
              : `Pesos vigentes: versão ${d.vigente.versao}, aprovada pelo Comitê Gestor.`}
            {mudou && ' Você está simulando outros pesos: o ranking abaixo já usa a simulação.'}
          </p>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[3fr_2fr]">
            <Card
              titulo="Ranking das quadras"
              subtitulo="As 12 quadras com maior índice. As colunas mostram cada dimensão, de 0 a 1."
            >
              <Tabela
                dados={ranking.slice(0, 12)}
                colunas={colunas}
                legenda="Quadras com maior índice de vulnerabilidade"
                contagem={false}
                idLinha={(q) => String(q.id)}
                densa
              />
            </Card>
            <Card
              titulo="Pesos do índice"
              subtitulo="Ajuste e veja o ranking mudar. A nova versão dos pesos é aprovada pelo Comitê Gestor."
            >
              <form onSubmit={aprovar} noValidate className="flex flex-col gap-4">
                {DIMENSOES_IVM.map((k) => (
                  <div key={k.codigo} className="flex flex-col gap-1">
                    <label htmlFor={`peso-${k.codigo}`} className="font-semibold text-texto-forte">
                      {k.rotulo} · {total ? Math.round((pesos[k.codigo] * 100) / total) : 0}%
                    </label>
                    <input
                      id={`peso-${k.codigo}`}
                      type="range"
                      min={0}
                      max={60}
                      step={5}
                      value={pesos[k.codigo]}
                      onChange={(e) => setPesos({ ...pesos, [k.codigo]: Number(e.target.value) })}
                      aria-describedby={`peso-${k.codigo}-d`}
                      className="min-h-[var(--spacing-alvo)]"
                    />
                    <span id={`peso-${k.codigo}-d`} className="text-sm text-texto-suave">
                      {DESCRICAO[k.codigo]}. Fonte: {k.fonte}.
                    </span>
                  </div>
                ))}
                <div>
                  <Botao
                    type="button"
                    variante="contorno"
                    tamanho="pequeno"
                    onClick={() => setPesos(d.vigente.pesos)}
                  >
                    Voltar aos pesos vigentes
                  </Botao>
                </div>
                {comite ? (
                  <>
                    <div className="flex flex-col gap-1">
                      <label htmlFor="justificativa" className="font-semibold text-texto-forte">
                        Justificativa da nova versão
                      </label>
                      <textarea
                        id="justificativa"
                        value={justificativa}
                        onChange={(e) => setJustificativa(e.target.value)}
                        rows={3}
                        aria-invalid={!!erro}
                        aria-describedby={erro ? 'justificativa-erro' : undefined}
                        className="rounded-md border border-borda bg-fundo p-2 text-texto-forte"
                      />
                      {erro && (
                        <span id="justificativa-erro" className="text-sm text-erro">
                          {erro}
                        </span>
                      )}
                    </div>
                    <Botao type="submit" disabled={enviando || !mudou}>
                      {enviando ? 'Aprovando…' : 'Aprovar como nova versão'}
                    </Botao>
                  </>
                ) : (
                  <p className="text-sm text-texto-suave">
                    A simulação não é gravada. Só o Comitê Gestor aprova uma nova versão.
                  </p>
                )}
                <div aria-live="polite">
                  {aprovada && (
                    <Sucesso>
                      Versão {aprovada} aprovada. O mapa do{' '}
                      <Link href="/territorio" className="underline">
                        Território
                      </Link>{' '}
                      já usa os pesos novos.
                    </Sucesso>
                  )}
                </div>
              </form>
            </Card>
          </div>

          <Card titulo="Quadras por faixa de vulnerabilidade">
            <Barras
              titulo="Quadras por faixa"
              itens={[
                { rotulo: 'Muito alta', valor: faixas.MUITO_ALTA },
                { rotulo: 'Alta', valor: faixas.ALTA },
                { rotulo: 'Moderada', valor: faixas.MODERADA },
                { rotulo: 'Baixa', valor: faixas.BAIXA },
              ]}
            />
            <p className="mt-2 text-sm text-texto-suave">
              O mapa do Território usa este índice na camada &quot;Índice de vulnerabilidade&quot;.
            </p>
          </Card>

          <Card
            titulo="Histórico dos pesos"
            subtitulo="Cada versão aprovada pelo Comitê fica registrada com a justificativa."
          >
            <Tabela
              dados={d.versoes}
              colunas={[
                {
                  accessorKey: 'versao',
                  header: 'Versão',
                  numerica: true,
                  cell: (c) => <b>{c.getValue<number>()}</b>,
                },
                ...DIMENSOES_IVM.map((k) => ({
                  id: k.codigo,
                  header: k.rotulo,
                  numerica: true,
                  enableSorting: false,
                  cell: (c: { row: { original: Versao } }) => c.row.original.pesos[k.codigo],
                })),
                {
                  id: 'situacao',
                  header: 'Situação',
                  enableSorting: false,
                  cell: (c) =>
                    c.row.original.aprovadoEm ? (
                      <span>
                        <Pill tom="bom">Aprovada em {dataBr(c.row.original.aprovadoEm)}</Pill>
                        {c.row.original.aprovadoPor && (
                          <span className="block text-sm text-texto-suave">
                            {c.row.original.aprovadoPor}
                          </span>
                        )}
                      </span>
                    ) : (
                      <Pill tom="neutro">Proposta</Pill>
                    ),
                },
                {
                  id: 'justificativa',
                  header: 'Justificativa',
                  enableSorting: false,
                  accessorFn: (v) => v.justificativa ?? '—',
                },
              ]}
              legenda="Versões dos pesos do índice"
              contagem={false}
              idLinha={(v) => String(v.versao)}
            />
          </Card>
        </>
      )}
    </div>
  );
}
