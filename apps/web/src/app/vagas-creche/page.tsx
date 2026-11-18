'use client';

import {
  ondeAbrirPrimeiro,
  simularCreche,
  type SetorCrecheEntrada,
  TAMANHOS_UNIDADE,
  totaisCreche,
} from '@sii/shared';
import { type FormEvent, useMemo, useState } from 'react';
import { useSessao } from '@/components/layout/sessao';
import { Barras } from '@/components/ui/barras';
import { BarraMeta } from '@/components/ui/barra-meta';
import { Botao } from '@/components/ui/button';
import { CabecalhoPagina } from '@/components/ui/cabecalho-pagina';
import { Card } from '@/components/ui/card';
import { Carregando, Erro, SemPermissao, Sucesso, Vazio } from '@/components/ui/estado';
import { GradeKpis, Kpi } from '@/components/ui/kpi';
import { Pill } from '@/components/ui/pill';
import { type Coluna, Tabela } from '@/components/ui/tabela';
import { api } from '@/lib/api';
import { textoN, textoPct, usePainel } from '@/lib/painel';

interface Setor extends Omit<SetorCrecheEntrada, 'coortes' | 'fila'> {
  coortes: Record<string, number | null>;
  fila: number | null;
  suprimido: boolean;
}
interface Dados {
  ano: number;
  coortes: number[];
  agregado: boolean;
  setores: Setor[];
  escolas: { inep: string; nome: string; setor: string | null; vagas: number }[];
}

const CAMPO =
  'min-h-[var(--spacing-alvo)] rounded-md border border-borda bg-fundo px-3 text-texto-forte';
const n0 = (v: number | null) => v ?? 0;

/** Simulador de vagas de creche (§3.9, P19): coortes de 0 a 3 anos × vagas × fila × índice. */
export default function VagasCreche() {
  const { usuario } = useSessao();
  const { estado, carregar } = usePainel<Dados>('/ciclos/vagas-creche');
  const [meta, setMeta] = useState(50);
  const [setor, setSetor] = useState<string>('');
  const [novas, setNovas] = useState<number>(0);
  const [salvo, setSalvo] = useState<string | null>(null);
  const [erroVagas, setErroVagas] = useState<string | null>(null);
  const d = estado.tipo === 'pronto' ? estado.dados : null;
  const podeEditar = usuario?.perfil === 'SEMED_GESTOR' || usuario?.perfil === 'ADMIN_CTI';

  const linhas = useMemo(
    () =>
      d
        ? simularCreche(
            d.setores.map((s) => ({
              ...s,
              coortes: Object.fromEntries(Object.entries(s.coortes).map(([k, v]) => [k, n0(v)])),
              fila: n0(s.fila),
            })),
            { metaPct: meta, setor: setor || null, novasVagas: novas },
          )
        : [],
    [d, meta, setor, novas],
  );
  const tot = totaisCreche(linhas);
  const primeiro = ondeAbrirPrimeiro(linhas);
  const alvo = linhas.find((l) => l.setor === setor);

  async function salvarVagas(ev: FormEvent<HTMLFormElement>, inep: string) {
    ev.preventDefault();
    const vagas = Number(new FormData(ev.currentTarget).get('vagas'));
    setErroVagas(null);
    setSalvo(null);
    try {
      await api(`/ciclos/vagas-creche/oferta/${inep}`, {
        method: 'PUT',
        body: JSON.stringify({ vagas }),
      });
      setSalvo(inep);
      void carregar();
    } catch (e) {
      setErroVagas(e instanceof Error ? e.message : 'Não foi possível salvar.');
    }
  }

  const colunas: Coluna<(typeof linhas)[number]>[] = [
    { accessorKey: 'nome', header: 'Território', cell: (c) => <b>{c.getValue<string>()}</b> },
    ...(d?.coortes ?? []).map((a) => ({
      id: String(a),
      header: String(a),
      numerica: true,
      enableSorting: false,
      cell: (c: { row: { original: (typeof linhas)[number] } }) =>
        textoN(d?.setores.find((s) => s.setor === c.row.original.setor)?.coortes[a] ?? 0),
    })),
    {
      accessorKey: 'criancas',
      header: '0 a 3 anos',
      numerica: true,
      cell: (c) => <b>{c.getValue<number>()}</b>,
    },
    {
      accessorKey: 'vagas',
      header: 'Vagas',
      numerica: true,
      cell: (c) => (
        <span className="whitespace-nowrap">
          {c.row.original.vagas}
          {c.row.original.novas > 0 && <Pill tom="info"> +{c.row.original.novas}</Pill>}
        </span>
      ),
    },
    { accessorKey: 'fila', header: 'Fila', numerica: true },
    {
      id: 'cobA',
      header: 'Cobertura atual',
      accessorFn: (l) => l.coberturaAtual ?? -1,
      cell: (c) => <BarraMeta valor={c.row.original.coberturaAtual} meta={meta} />,
    },
    {
      id: 'cobS',
      header: 'Com a simulação',
      accessorFn: (l) => l.coberturaSimulada ?? -1,
      cell: (c) => <BarraMeta valor={c.row.original.coberturaSimulada} meta={meta} />,
    },
    {
      accessorKey: 'deficit',
      header: 'Déficit',
      numerica: true,
      cell: (c) => (
        <b className={c.getValue<number>() ? 'text-erro' : ''}>{c.getValue<number>()}</b>
      ),
    },
    {
      accessorKey: 'ivmMedio',
      header: 'Índice médio',
      numerica: true,
      cell: (c) => c.getValue<number>().toFixed(2).replace('.', ','),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoPagina
        titulo="Simulador de vagas de creche"
        descricao="Crianças de 0 a 3 anos por território, contadas na base única por ano de nascimento, comparadas com as vagas existentes e a fila. Simule a abertura de uma unidade e veja o efeito na cobertura."
        fontes="Fontes: base única (nascimentos; o SINASC entra quando a carga estiver pronta), SEMED (vagas e fila), índice de vulnerabilidade"
      />
      {estado.tipo === 'carregando' && <Carregando rotulo="Carregando o simulador" altura="h-96" />}
      {estado.tipo === 'erro' && (
        <Erro mensagem={estado.mensagem} onTentar={() => void carregar()} />
      )}
      {estado.tipo === 'sem-permissao' && (
        <SemPermissao>
          Este painel é das equipes das secretarias, do Comitê e do controle externo.
        </SemPermissao>
      )}
      {d && tot.criancas === 0 && (
        <Vazio titulo="Nenhuma criança de 0 a 3 anos neste território">
          Escolha &quot;Todo o município&quot; no cabeçalho.
        </Vazio>
      )}
      {d && tot.criancas > 0 && (
        <>
          <GradeKpis>
            <Kpi
              rotulo="Crianças de 0 a 3 anos"
              valor={tot.criancas}
              detalhe={`nascidos de ${d.coortes[0]} a ${d.coortes[3]}`}
              tom="info"
            />
            <Kpi
              rotulo="Vagas em creche hoje"
              valor={tot.vagas}
              detalhe={`${textoPct(tot.coberturaAtual)} de cobertura`}
              tom={(tot.coberturaAtual ?? 0) >= meta ? 'bom' : 'critico'}
            />
            <Kpi
              rotulo="Fila de espera"
              valor={tot.fila}
              detalhe="pedidos de vaga em aberto"
              tom="alerta"
            />
            <Kpi
              rotulo="Cobertura com a simulação"
              valor={textoPct(tot.coberturaSimulada)}
              detalhe={`+${tot.novas} vagas`}
              tom={(tot.coberturaSimulada ?? 0) >= meta ? 'bom' : 'alerta'}
            />
            <Kpi
              rotulo="Déficit para a meta"
              valor={`${tot.deficit} vagas`}
              detalhe={`meta de ${meta}% de cobertura`}
              tom={tot.deficit ? 'critico' : 'bom'}
            />
          </GradeKpis>
          {d.agregado && (
            <p className="text-sm text-texto-suave">
              Coortes menores que 5 aparecem como &quot;&lt; 5&quot; e entram como zero na
              simulação.
            </p>
          )}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[3fr_2fr]">
            <Card
              titulo="Déficit de vagas por território"
              subtitulo="Vagas que faltam para atingir a meta, já considerando a unidade simulada"
            >
              <Barras
                titulo="Déficit de vagas por território"
                itens={linhas.map((l) => ({ rotulo: l.nome, valor: l.deficit }))}
              />
              {primeiro && (
                <div
                  className="mt-3 rounded-md border-l-4 border-primaria bg-primaria-clara p-3 text-texto-forte"
                  aria-live="polite"
                >
                  <b>Onde abrir primeiro: {primeiro.nome}</b>
                  <p className="text-sm">
                    Maior déficit ponderado pela vulnerabilidade: faltam{' '}
                    {Math.max(0, primeiro.demanda - primeiro.vagas)} vagas para a meta e o índice
                    médio é {primeiro.ivmMedio.toFixed(2).replace('.', ',')}.
                    {alvo && alvo.novas > 0
                      ? ` Com ${alvo.novas} vagas em ${alvo.nome}, a cobertura ali passa de ${textoPct(alvo.coberturaAtual)} para ${textoPct(alvo.coberturaSimulada)}.`
                      : ' Escolha um território e o tamanho da unidade para simular.'}
                  </p>
                </div>
              )}
            </Card>
            <Card titulo="Simulação" subtitulo="Os valores mudam o painel na hora">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <label htmlFor="meta" className="font-semibold text-texto-forte">
                    Meta de cobertura · {meta}%
                  </label>
                  <input
                    id="meta"
                    type="range"
                    min={30}
                    max={70}
                    step={5}
                    value={meta}
                    onChange={(e) => setMeta(Number(e.target.value))}
                    aria-describedby="meta-d"
                    className="min-h-[var(--spacing-alvo)]"
                  />
                  <span id="meta-d" className="text-sm text-texto-suave">
                    O PNE fixa 50% de atendimento em creche.
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="setor-unidade" className="font-semibold text-texto-forte">
                    Território da nova unidade
                  </label>
                  <select
                    id="setor-unidade"
                    className={CAMPO}
                    value={setor}
                    onChange={(e) => setSetor(e.target.value)}
                  >
                    <option value="">Nenhum</option>
                    {d.setores.map((s) => (
                      <option key={s.setor} value={s.setor}>
                        {s.nome}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="tamanho" className="font-semibold text-texto-forte">
                    Tamanho da unidade
                  </label>
                  <select
                    id="tamanho"
                    className={CAMPO}
                    value={novas}
                    onChange={(e) => setNovas(Number(e.target.value))}
                  >
                    {TAMANHOS_UNIDADE.map((v) => (
                      <option key={v} value={v}>
                        {v ? `${v} vagas` : 'Sem nova unidade'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </Card>
          </div>
          <Card
            titulo="Detalhe por território"
            subtitulo={`Nascidos de ${d.coortes[3]}: contagem até hoje.`}
          >
            <Tabela
              dados={linhas}
              colunas={colunas}
              legenda="Creche por território"
              contagem={false}
              idLinha={(l) => l.setor}
              densa
            />
          </Card>
          <Card
            titulo="Vagas de creche por escola"
            subtitulo={
              podeEditar
                ? `Informe as vagas de ${d.ano}; o simulador usa a soma por território.`
                : `Vagas de ${d.ano} informadas pela SEMED.`
            }
          >
            {d.escolas.length === 0 ? (
              <Vazio titulo="Nenhuma escola com creche neste território" />
            ) : (
              <ul className="flex flex-col gap-2">
                {d.escolas.map((e) => (
                  <li
                    key={e.inep}
                    className="flex flex-wrap items-end justify-between gap-3 rounded-md border border-borda-suave p-3"
                  >
                    <span>
                      <b className="text-texto-forte">{e.nome}</b>
                      <span className="block text-sm text-texto-suave">
                        INEP {e.inep} ·{' '}
                        {d.setores.find((s) => s.setor === e.setor)?.nome ?? 'território a definir'}
                      </span>
                    </span>
                    {podeEditar ? (
                      <form
                        onSubmit={(ev) => void salvarVagas(ev, e.inep)}
                        className="flex items-end gap-2"
                      >
                        <div className="flex flex-col gap-1">
                          <label
                            htmlFor={`vagas-${e.inep}`}
                            className="text-sm font-semibold text-texto-forte"
                          >
                            Vagas
                          </label>
                          <input
                            id={`vagas-${e.inep}`}
                            name="vagas"
                            type="number"
                            min={0}
                            max={2000}
                            defaultValue={e.vagas}
                            key={e.vagas}
                            className={`${CAMPO} w-24`}
                          />
                        </div>
                        <Botao type="submit" variante="contorno">
                          Salvar<span className="sr-only"> as vagas de {e.nome}</span>
                        </Botao>
                      </form>
                    ) : (
                      <b className="text-texto-forte">{e.vagas} vagas</b>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <div aria-live="polite" className="mt-2">
              {salvo && <Sucesso>Vagas salvas. O simulador já usa o número novo.</Sucesso>}
              {erroVagas && <Erro mensagem={erroVagas} />}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
