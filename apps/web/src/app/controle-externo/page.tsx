'use client';

import {
  gerarCsv,
  type LinhaIndicador,
  ROTULO_EVENTO_CASO,
  rotuloSemestre,
  semestre as semestreDe,
  semestresAte,
  hojeEmPortoVelho,
  TOM_SITUACAO_INDICADOR,
  VerificarTrilha,
} from '@sii/shared';
import { Download } from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useSessao } from '@/components/layout/sessao';
import { Barras } from '@/components/ui/barras';
import { Botao } from '@/components/ui/button';
import { CabecalhoPagina } from '@/components/ui/cabecalho-pagina';
import { Card } from '@/components/ui/card';
import { Carregando, Erro, SemPermissao, Vazio } from '@/components/ui/estado';
import { GradeKpis, Kpi } from '@/components/ui/kpi';
import { Pill } from '@/components/ui/pill';
import { type Coluna, Tabela } from '@/components/ui/tabela';
import { api, baixar, ErroApi } from '@/lib/api';
import { gravarParametrosDaTela } from '@/lib/filtros-url';

interface Trilha {
  codigo: string;
  tipo: string;
  encerradoEm: string;
  eventos: number;
  verificador: string;
}

interface ControleExterno {
  semestre: string;
  rotuloSemestre: string;
  referencia: string;
  indicadores: LinhaIndicador[];
  gasto: {
    ano: number;
    programas: { codigo: string; nome: string; valor: number; resultado: string }[];
    fonte: 'API' | 'CSV' | null;
  };
  acessos: { registrados: number };
  trilhas: Trilha[];
  relatorios: { id: number; formato: string; geradoEm: string; entregueEm: string | null }[];
}

interface Verificacao {
  caso: string;
  integra: boolean;
  confere: boolean;
  eventos: number;
  linhaDoTempo: { seq: number; tipo: string; quando: string }[];
}

type Estado =
  | { tipo: 'carregando' }
  | { tipo: 'erro'; mensagem: string }
  | { tipo: 'sem-permissao' }
  | { tipo: 'pronto'; d: ControleExterno };

const PRIMEIRO_SEMESTRE = '2026-S1';
const CAMPO =
  'min-h-[var(--spacing-alvo)] rounded-md border border-borda bg-fundo px-3 text-texto-forte';
const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const dataBr = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Porto_Velho' });
const ROTULO_TIPO: Record<string, string> = {
  BUSCA_ATIVA_ESCOLAR: 'Busca ativa escolar',
  INFREQUENCIA: 'Infrequência',
};

const COLUNAS: Coluna<LinhaIndicador>[] = [
  { accessorKey: 'objetivo', header: 'Objetivo', cell: (c) => <b>{c.getValue<string>()}</b> },
  { accessorKey: 'eixo', header: 'Eixo' },
  { accessorKey: 'nome', header: 'Indicador' },
  { accessorKey: 'linhaBase', header: 'Linha de base', numerica: true, enableSorting: false },
  {
    accessorKey: 'atual',
    header: 'Atual',
    numerica: true,
    enableSorting: false,
    cell: (c) => <b className="text-texto-forte">{c.getValue<string>()}</b>,
  },
  { accessorKey: 'meta', header: 'Meta', numerica: true, enableSorting: false },
  {
    accessorKey: 'rotuloSituacao',
    header: 'Situação',
    cell: (c) => (
      <Pill tom={TOM_SITUACAO_INDICADOR[c.row.original.situacao]}>{c.getValue<string>()}</Pill>
    ),
  },
];

/** CSV dos indicadores (agregados: nunca dado pessoal). */
const csvIndicadores = (linhas: LinhaIndicador[]) =>
  gerarCsv([
    ['Objetivo', 'Eixo', 'Indicador', 'Linha de base', 'Atual', 'Meta', 'Situação'],
    ...linhas.map((l) => [
      l.objetivo,
      l.eixo,
      l.nome,
      l.linhaBase,
      l.atual,
      l.meta,
      l.rotuloSituacao,
    ]),
  ]);

/** Formulário "Verificar a trilha": código do caso + código verificador. */
function VerificarTrilhaForm({ sugestao }: { sugestao: Trilha | null }) {
  const [caso, setCaso] = useState('');
  const [verificador, setVerificador] = useState('');
  const [erros, setErros] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<Verificacao | null>(null);
  const refCaso = useRef<HTMLInputElement>(null);
  const refVerificador = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!sugestao) return;
    setCaso(sugestao.codigo);
    setVerificador(sugestao.verificador);
    setResultado(null);
    refVerificador.current?.focus();
  }, [sugestao]);

  async function enviar(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const r = VerificarTrilha.safeParse({ caso, verificador });
    if (!r.success) {
      const e: Record<string, string> = {};
      for (const i of r.error.issues) e[String(i.path[0])] ??= i.message;
      setErros(e);
      (e.caso ? refCaso : refVerificador).current?.focus();
      return;
    }
    setErros({});
    setEnviando(true);
    try {
      setResultado(
        await api<Verificacao>('/auditoria/verificar-trilha', {
          method: 'POST',
          body: JSON.stringify(r.data),
        }),
      );
    } catch (e) {
      setResultado(null);
      if (e instanceof ErroApi && e.campos.caso) {
        setErros({ caso: e.campos.caso[0] ?? e.message });
        refCaso.current?.focus();
      } else setErros({ geral: e instanceof Error ? e.message : 'Não foi possível verificar.' });
    } finally {
      setEnviando(false);
    }
  }

  const campo = (
    id: 'caso' | 'verificador',
    rotulo: string,
    ajuda: string,
    valor: string,
    mudar: (v: string) => void,
    ref: React.RefObject<HTMLInputElement | null>,
  ) => (
    <div className="flex min-w-0 grow flex-col gap-1">
      <label htmlFor={`trilha-${id}`} className="font-semibold text-texto-forte">
        {rotulo}
      </label>
      <span id={`trilha-${id}-ajuda`} className="text-sm text-texto-suave">
        {ajuda}
      </span>
      <input
        ref={ref}
        id={`trilha-${id}`}
        value={valor}
        onChange={(e) => mudar(e.target.value)}
        autoComplete="off"
        spellCheck={false}
        aria-invalid={!!erros[id]}
        aria-describedby={`trilha-${id}-ajuda${erros[id] ? ` trilha-${id}-erro` : ''}`}
        className={`${CAMPO} font-mono uppercase`}
      />
      {erros[id] && (
        <span id={`trilha-${id}-erro`} className="text-sm text-erro">
          {erros[id]}
        </span>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={enviar} noValidate className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-3">
          {campo('caso', 'Código do caso', 'Ex.: BA-2026-0329', caso, setCaso, refCaso)}
          {campo(
            'verificador',
            'Código verificador',
            'XXXX-XXXX-XXXX, no relatório',
            verificador,
            setVerificador,
            refVerificador,
          )}
        </div>
        <div>
          <Botao type="submit" disabled={enviando}>
            {enviando ? 'Verificando…' : 'Verificar a trilha'}
          </Botao>
        </div>
        {erros.geral && <Erro mensagem={erros.geral} />}
      </form>
      <div aria-live="polite">
        {resultado && (
          <div className="flex flex-col gap-2 rounded-md border border-borda-suave p-3">
            <p className="flex flex-wrap items-center gap-2">
              <b className="text-texto-forte">{resultado.caso}</b>
              {resultado.confere ? (
                <Pill tom="bom">Trilha íntegra e o código confere</Pill>
              ) : resultado.integra ? (
                <Pill tom="critico">O código verificador não confere</Pill>
              ) : (
                <Pill tom="critico">A trilha foi alterada</Pill>
              )}
              <span className="text-sm text-texto-suave">{resultado.eventos} eventos</span>
            </p>
            <ol className="flex flex-col gap-1 border-l-2 border-primaria pl-3">
              {resultado.linhaDoTempo.map((e) => (
                <li key={e.seq} className="text-sm">
                  <b className="text-texto-forte">{ROTULO_EVENTO_CASO[e.tipo] ?? e.tipo}</b>{' '}
                  <span className="text-texto-suave">· {dataBr(e.quando)}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Controle externo (§3.11, P16), como no protótipo: indicadores OE1–OE6 com linha de base, atual e
 * meta; gasto × resultado; trilha de evidências verificável; relatório semestral em PDF e XLSX.
 * Só números: o auditor do TCE lê pelo papel de agregados do banco.
 */
export default function ControleExterno() {
  const { usuario } = useSessao();
  const auditor = usuario?.perfil === 'AUDITOR_TCE';
  const cti = usuario?.perfil === 'ADMIN_CTI';
  const semestres = semestresAte(hojeEmPortoVelho(), PRIMEIRO_SEMESTRE).reverse();
  const [semestre, setSemestre] = useState<string | null>(null);
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' });
  const [baixando, setBaixando] = useState<string | null>(null);
  const [erroBaixar, setErroBaixar] = useState<string | null>(null);
  const [sugestao, setSugestao] = useState<Trilha | null>(null);

  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get('semestre');
    setSemestre(s && semestres.includes(s) ? s : semestreDe(hojeEmPortoVelho()));
    // Só na montagem: depois o seletor manda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (semestre)
      gravarParametrosDaTela({
        semestre: semestre === semestreDe(hojeEmPortoVelho()) ? null : semestre,
      });
  }, [semestre]);

  const carregar = useCallback(async () => {
    if (!semestre) return;
    try {
      setEstado({
        tipo: 'pronto',
        d: await api<ControleExterno>(`/indicadores/controle-externo?semestre=${semestre}`),
      });
    } catch (e) {
      if (e instanceof ErroApi && e.status === 403) setEstado({ tipo: 'sem-permissao' });
      else if (!(e instanceof ErroApi && e.status === 401))
        setEstado({
          tipo: 'erro',
          mensagem: e instanceof Error ? e.message : 'Não foi possível carregar.',
        });
    }
  }, [semestre]);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function relatorio(formato: 'pdf' | 'xlsx') {
    setBaixando(formato);
    setErroBaixar(null);
    try {
      await baixar(
        `/indicadores/relatorio?semestre=${semestre}&formato=${formato}`,
        `relatorio-tce-${semestre}.${formato}`,
      );
      void carregar();
    } catch (e) {
      setErroBaixar(e instanceof Error ? e.message : 'Não foi possível gerar o relatório.');
    } finally {
      setBaixando(null);
    }
  }

  async function entregar(id: number) {
    await api(`/indicadores/relatorios/${id}/entregar`, { method: 'POST' });
    void carregar();
  }

  const d = estado.tipo === 'pronto' ? estado.d : null;
  const conta = (s: LinhaIndicador['situacao']) =>
    d?.indicadores.filter((i) => i.situacao === s).length ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoPagina
        titulo="Controle externo"
        descricao="Indicadores agregados e desidentificados para o TCE-RO, a Controladoria e a Câmara, com trilha de evidências de cada caso e relação entre gasto e resultado."
        fontes={`Relatório semestral · ${semestre ? rotuloSemestre(semestre) : ''}`}
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="semestre" className="font-semibold text-texto-forte">
            Semestre
          </label>
          <select
            id="semestre"
            className={CAMPO}
            value={semestre ?? ''}
            onChange={(e) => setSemestre(e.target.value)}
          >
            {semestres.map((s) => (
              <option key={s} value={s}>
                {rotuloSemestre(s)}
              </option>
            ))}
          </select>
        </div>
        <Botao
          variante="contorno"
          onClick={() => void relatorio('pdf')}
          disabled={!d || !!baixando}
        >
          <Download aria-hidden="true" className="h-4 w-4" />
          {baixando === 'pdf' ? 'Gerando o PDF…' : 'Baixar relatório (PDF)'}
        </Botao>
        <Botao
          variante="contorno"
          onClick={() => void relatorio('xlsx')}
          disabled={!d || !!baixando}
        >
          <Download aria-hidden="true" className="h-4 w-4" />
          {baixando === 'xlsx' ? 'Gerando a planilha…' : 'Baixar relatório (XLSX)'}
        </Botao>
      </div>
      {erroBaixar && <Erro mensagem={erroBaixar} onTentar={() => setErroBaixar(null)} />}

      {estado.tipo === 'carregando' && (
        <Carregando rotulo="Carregando os indicadores" altura="h-96" />
      )}
      {estado.tipo === 'erro' && (
        <Erro mensagem={estado.mensagem} onTentar={() => void carregar()} />
      )}
      {estado.tipo === 'sem-permissao' && (
        <SemPermissao>
          O controle externo é da CTI, do Comitê Gestor e do auditor do TCE-RO.
        </SemPermissao>
      )}

      {d && (
        <>
          <GradeKpis>
            <Kpi
              rotulo="Indicadores em dia"
              valor={`${conta('EM_DIA')} de ${d.indicadores.length}`}
              tom="bom"
            />
            <Kpi rotulo="Em evolução" valor={conta('EM_EVOLUCAO')} tom="alerta" />
            <Kpi rotulo="Abaixo do esperado" valor={conta('ABAIXO')} tom="critico" />
            <Kpi
              rotulo="Acessos nominais registrados"
              valor={d.acessos.registrados}
              detalhe="neste semestre"
              tom="info"
            />
          </GradeKpis>

          <Card
            titulo="Indicadores dos objetivos estratégicos"
            subtitulo="Linha de base, valor atual e meta de cada objetivo do plano"
          >
            <Tabela
              dados={d.indicadores}
              colunas={COLUNAS}
              legenda={`Indicadores do ${d.rotuloSemestre}. Contagens menores que 5 aparecem como "< 5".`}
              legendaVisivel
              porPagina={10}
              contagem={false}
              idLinha={(i) => i.codigo}
              exportar={{ arquivo: `indicadores-${d.semestre}.csv`, gerar: csvIndicadores }}
            />
          </Card>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card
              titulo="Gasto × resultado"
              subtitulo={`Despesa liquidada em ${d.gasto.ano} por programa e o resultado associado`}
            >
              <div className="flex flex-col gap-3">
                <Barras
                  titulo="Despesa liquidada por programa"
                  itens={d.gasto.programas.map((p) => ({ rotulo: p.nome, valor: p.valor }))}
                  formatar={brl}
                />
                <Tabela
                  dados={d.gasto.programas}
                  colunas={[
                    { accessorKey: 'nome', header: 'Programa', enableSorting: false },
                    { accessorKey: 'resultado', header: 'Resultado', enableSorting: false },
                  ]}
                  legenda="Resultado associado a cada programa"
                  contagem={false}
                  idLinha={(p) => p.codigo}
                />
                <p className="text-sm text-texto-suave">
                  Despesa:{' '}
                  {d.gasto.fonte === 'API'
                    ? 'Portal da Transparência municipal (API de dados abertos).'
                    : d.gasto.fonte === 'CSV'
                      ? 'arquivo enviado pela Fazenda.'
                      : 'ainda não carregada.'}
                </p>
              </div>
            </Card>

            <Card
              titulo="Registro de acessos a dado pessoal"
              subtitulo="Cada CPF revelado ou dado nominal consultado gera um registro."
            >
              {auditor ? (
                <SemPermissao>
                  <p>
                    <b>Registro detalhado sob requisição.</b> O perfil de auditoria vê a contagem de
                    acessos ({d.acessos.registrados} neste semestre). O registro detalhado é
                    entregue pelo encarregado de dados mediante requisição formal.
                  </p>
                </SemPermissao>
              ) : (
                <p className="text-texto">
                  {d.acessos.registrados} acessos registrados neste semestre.{' '}
                  {cti && (
                    <Link className="text-primaria underline" href="/acessos">
                      Abrir o painel de acessos
                    </Link>
                  )}
                </p>
              )}
            </Card>
          </div>

          <Card
            titulo="Trilha de evidências"
            subtitulo="Cada caso tem uma trilha encadeada por hash. Confira um caso pelo código verificador do relatório."
          >
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[2fr_3fr]">
              <VerificarTrilhaForm sugestao={sugestao} />
              {d.trilhas.length === 0 ? (
                <Vazio titulo="Nenhum caso encerrado no semestre" />
              ) : (
                <Tabela
                  dados={d.trilhas}
                  colunas={[
                    {
                      accessorKey: 'codigo',
                      header: 'Caso',
                      cell: (c) => <b className="whitespace-nowrap">{c.getValue<string>()}</b>,
                    },
                    {
                      id: 'tipo',
                      header: 'Tipo',
                      accessorFn: (t) => ROTULO_TIPO[t.tipo] ?? t.tipo,
                    },
                    {
                      id: 'encerrado',
                      header: 'Encerrado em',
                      accessorFn: (t) => dataBr(t.encerradoEm),
                    },
                    {
                      accessorKey: 'verificador',
                      header: 'Código verificador',
                      enableSorting: false,
                      cell: (c) => (
                        <span className="font-mono whitespace-nowrap">{c.getValue<string>()}</span>
                      ),
                    },
                    {
                      id: 'usar',
                      header: 'Conferir',
                      enableSorting: false,
                      cell: (c) => (
                        <Botao
                          variante="contorno"
                          tamanho="pequeno"
                          onClick={() => setSugestao({ ...c.row.original })}
                        >
                          Conferir<span className="sr-only"> {c.row.original.codigo}</span>
                        </Botao>
                      ),
                    },
                  ]}
                  legenda="Casos encerrados no semestre com o código verificador"
                  porPagina={5}
                  densa
                  idLinha={(t) => t.codigo}
                />
              )}
            </div>
          </Card>

          {cti && (
            <Card
              titulo="Relatórios gerados"
              subtitulo="Marque a entrega ao TCE-RO: conta no objetivo OE5."
            >
              {d.relatorios.length === 0 ? (
                <Vazio titulo="Nenhum relatório gerado neste semestre">
                  Use &quot;Baixar relatório&quot; acima.
                </Vazio>
              ) : (
                <ul className="flex flex-col gap-2">
                  {d.relatorios.map((r) => (
                    <li
                      key={r.id}
                      className="flex flex-wrap items-center gap-3 rounded-md border border-borda-suave p-2"
                    >
                      <span>
                        {r.formato.toUpperCase()} · gerado em {dataBr(r.geradoEm)}
                      </span>
                      {r.entregueEm ? (
                        <Pill tom="bom">Entregue em {dataBr(r.entregueEm)}</Pill>
                      ) : (
                        <Botao
                          variante="contorno"
                          tamanho="pequeno"
                          onClick={() => void entregar(r.id)}
                        >
                          Marcar como entregue ao TCE
                        </Botao>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
