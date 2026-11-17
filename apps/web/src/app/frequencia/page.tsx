'use client';

import { hojeEmPortoVelho, MAXIMO_LANCAMENTOS } from '@sii/shared';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GradeFrequencia, LegendaFrequencia } from '@/components/grade-frequencia';
import { api, ErroApi } from '@/lib/api';
import {
  type Alteracao,
  type Armazem,
  celula,
  chaveGuardado,
  enfileirar,
  type Grade,
  gravarGuardado,
  type Guardado,
  lerGuardado,
  removerEnviados,
  type Situacao,
  valoresDaGrade,
} from '@/lib/fila-frequencia';

interface Eu {
  id: number;
  perfil: string;
}
interface Escola {
  inep: string;
  nome: string;
}
interface Turma {
  id: number;
  nome: string;
}
interface Resultado {
  salvos: number;
  apagados: number;
  recusados: { matriculaId: number; dia: string; motivo: string }[];
}

type Estado =
  | { tipo: 'carregando' }
  | { tipo: 'erro'; mensagem: string }
  | { tipo: 'sem-permissao' }
  | { tipo: 'pronto' };

type Envio =
  | { tipo: 'ocioso' }
  | { tipo: 'salvando' }
  | { tipo: 'salvo'; as: string }
  | { tipo: 'sem-conexao' }
  | { tipo: 'erro'; mensagem: string };

const LANCAM = ['ADMIN_CTI', 'SEMED_GESTOR', 'ESCOLA'];
const ESPERA_MS = 1_500;
const MOTIVO: Record<string, string> = {
  DIA_NAO_LETIVO: 'o dia não é letivo no calendário da escola',
  DIA_FUTURO: 'o dia ainda não chegou',
  MATRICULA_FORA_DA_TURMA: 'o aluno não está mais nesta turma',
};

function armazem(): Armazem | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const horaAgora = () =>
  new Date().toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Porto_Velho',
  });

export default function Frequencia() {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' });
  const [eu, setEu] = useState<Eu | null>(null);
  const [escolas, setEscolas] = useState<Escola[]>([]);
  const [inep, setInep] = useState('');
  const [turmas, setTurmas] = useState<Turma[] | null>(null);
  const [turmaId, setTurmaId] = useState<number | null>(null);
  const [mes, setMes] = useState(hojeEmPortoVelho().slice(0, 7));
  const [grade, setGrade] = useState<Grade | null>(null);
  const [carregandoGrade, setCarregandoGrade] = useState(false);
  const [offline, setOffline] = useState(false);
  const [fila, setFila] = useState<Alteracao[]>([]);
  const [envio, setEnvio] = useState<Envio>({ tipo: 'ocioso' });
  const [recusas, setRecusas] = useState<string | null>(null);
  const filaRef = useRef<Alteracao[]>([]);
  const enviando = useRef(false);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  const chave = eu && inep && turmaId ? chaveGuardado(eu.id, inep, turmaId) : null;
  const leitura = eu ? !LANCAM.includes(eu.perfil) : true;

  const tratarErro = useCallback(
    (e: unknown) => {
      if (e instanceof ErroApi && e.status === 401) {
        router.push('/entrar?proximo=/frequencia');
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

  // Quem sou eu e quais escolas posso abrir.
  const iniciar = useCallback(async () => {
    try {
      const [u, lista] = await Promise.all([api<Eu>('/auth/eu'), api<Escola[]>('/escolas')]);
      setEu(u);
      setEscolas(lista);
      if (lista.length === 1) setInep((lista[0] as Escola).inep);
      setEstado({ tipo: 'pronto' });
    } catch (e) {
      tratarErro(e);
    }
  }, [tratarErro]);
  useEffect(() => {
    void iniciar();
  }, [iniciar]);

  // Turmas da escola.
  useEffect(() => {
    if (!inep) return;
    setTurmas(null);
    setTurmaId(null);
    setGrade(null);
    api<Turma[]>(`/escolas/${inep}/turmas?ano=${mes.slice(0, 4)}`)
      .then((t) => {
        setTurmas(t);
        if (t.length === 1) setTurmaId((t[0] as Turma).id);
      })
      .catch(tratarErro);
    // O ano vem do mês escolhido; trocar só o mês dentro do ano não recarrega as turmas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inep, mes.slice(0, 4), tratarErro]);

  const guardar = useCallback(
    (mudar: (g: Guardado) => Guardado) => {
      const a = armazem();
      if (!a || !chave) return;
      const atual = lerGuardado(a, chave) ?? { salvoEm: Date.now(), fila: [], grades: {} };
      gravarGuardado(a, chave, { ...mudar(atual), salvoEm: Date.now() });
    },
    [chave],
  );

  const atualizarFila = useCallback(
    (nova: Alteracao[]) => {
      filaRef.current = nova;
      setFila(nova);
      guardar((g) => ({ ...g, fila: nova }));
    },
    [guardar],
  );

  // Grade do mês: do servidor; sem conexão, a última guardada neste navegador.
  useEffect(() => {
    if (!inep || !turmaId || !chave) return;
    setCarregandoGrade(true);
    const a = armazem();
    const guardado = a ? lerGuardado(a, chave) : null;
    filaRef.current = guardado?.fila ?? [];
    setFila(filaRef.current);
    api<Grade>(`/escolas/${inep}/turmas/${turmaId}/frequencia?mes=${mes}`)
      .then((g) => {
        setGrade(g);
        setOffline(false);
        guardar((x) => ({ ...x, grades: { [mes]: g } }));
      })
      .catch((e: unknown) => {
        if (e instanceof ErroApi && e.codigo === 'SEM_CONEXAO' && guardado?.grades[mes]) {
          setGrade(guardado.grades[mes] as Grade);
          setOffline(true);
          setEnvio({ tipo: 'sem-conexao' });
        } else tratarErro(e);
      })
      .finally(() => setCarregandoGrade(false));
  }, [inep, turmaId, mes, chave, guardar, tratarErro]);

  const sincronizar = useCallback(async () => {
    if (enviando.current || !inep || !turmaId) return;
    const lote = filaRef.current.slice(0, MAXIMO_LANCAMENTOS);
    if (lote.length === 0) return;
    enviando.current = true;
    setEnvio({ tipo: 'salvando' });
    try {
      const r = await api<Resultado>(`/escolas/${inep}/turmas/${turmaId}/frequencia`, {
        method: 'PUT',
        body: JSON.stringify({ lancamentos: lote }),
      });
      atualizarFila(removerEnviados(filaRef.current, lote));
      setOffline(false);
      // O que foi gravado vira o estado do servidor (para recarregar a grade guardada certa).
      const recusadas = new Set(r.recusados.map((x) => celula(x.matriculaId, x.dia)));
      setGrade((g) => (g ? aplicarNoServidor(g, lote, recusadas) : g));
      if (r.recusados.length > 0) {
        const motivos = [...new Set(r.recusados.map((x) => MOTIVO[x.motivo] ?? x.motivo))];
        setRecusas(
          `${r.recusados.length} ${r.recusados.length === 1 ? 'lançamento não foi aceito' : 'lançamentos não foram aceitos'}: ${motivos.join('; ')}.`,
        );
      }
      setEnvio({ tipo: 'salvo', as: horaAgora() });
    } catch (e) {
      if (e instanceof ErroApi && e.codigo === 'SEM_CONEXAO') setEnvio({ tipo: 'sem-conexao' });
      else if (e instanceof ErroApi && e.status === 401) tratarErro(e);
      else setEnvio({ tipo: 'erro', mensagem: e instanceof Error ? e.message : 'Erro ao salvar.' });
    } finally {
      enviando.current = false;
      if (filaRef.current.length > 0 && temporizador.current === null)
        temporizador.current = setTimeout(() => {
          temporizador.current = null;
          void sincronizar();
        }, ESPERA_MS);
    }
  }, [inep, turmaId, atualizarFila, tratarErro]);

  // Volta da conexão e nova tentativa periódica enquanto houver fila.
  useEffect(() => {
    const voltar = () => void sincronizar();
    window.addEventListener('online', voltar);
    const t = setInterval(() => {
      if (filaRef.current.length > 0) void sincronizar();
    }, 30_000);
    return () => {
      window.removeEventListener('online', voltar);
      clearInterval(t);
    };
  }, [sincronizar]);

  function alterar(matriculaId: number, dia: string, situacao: Situacao) {
    setRecusas(null);
    atualizarFila(enfileirar(filaRef.current, { matriculaId, dia, situacao }));
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => {
      temporizador.current = null;
      void sincronizar();
    }, ESPERA_MS);
  }

  const valores = useMemo(
    () => (grade ? valoresDaGrade(grade.lancamentos, fila) : new Map<string, Situacao>()),
    [grade, fila],
  );
  const pendentes = useMemo(() => new Set(fila.map((f) => celula(f.matriculaId, f.dia))), [fila]);

  const campo =
    'min-h-[var(--spacing-alvo)] rounded-md border border-borda bg-fundo px-3 text-texto-forte';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-texto-forte">Frequência da turma</h1>
        <p className="max-w-prose text-texto-suave">
          Lance a chamada de cada dia letivo. O que você marca é salvo sozinho; sem internet, fica
          guardado neste computador e é enviado quando a conexão voltar. Cinco faltas seguidas em
          dias letivos geram uma notificação ao CRAS no dia seguinte.
        </p>
      </div>

      {estado.tipo === 'carregando' && (
        <div aria-busy="true" aria-label="Carregando" className="flex flex-col gap-3">
          <div className="h-12 w-80 animate-pulse rounded-md bg-borda-suave" />
          <div className="h-72 animate-pulse rounded-md bg-borda-suave" />
        </div>
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
              void iniciar();
            }}
            className="min-h-[var(--spacing-alvo)] rounded-md bg-primaria px-4 font-semibold text-fundo"
          >
            Tentar de novo
          </button>
        </div>
      )}

      {estado.tipo === 'sem-permissao' && (
        <div className="rounded-md border-l-4 border-alerta-destaque bg-alerta-claro p-4 text-texto-forte">
          A frequência é lançada pela secretaria da escola, com acompanhamento da SEMED. Se você
          precisa de acesso, fale com a CTI.
        </div>
      )}

      {estado.tipo === 'pronto' && (
        <>
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="escola" className="font-semibold text-texto-forte">
                Escola
              </label>
              {escolas.length === 1 ? (
                <p id="escola" className="min-h-[var(--spacing-alvo)] content-center">
                  {escolas[0]?.nome}
                </p>
              ) : (
                <select
                  id="escola"
                  value={inep}
                  onChange={(e) => setInep(e.target.value)}
                  className={campo}
                >
                  <option value="">Escolha a escola</option>
                  {escolas.map((e) => (
                    <option key={e.inep} value={e.inep}>
                      {e.nome}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="turma" className="font-semibold text-texto-forte">
                Turma
              </label>
              <select
                id="turma"
                value={turmaId ?? ''}
                disabled={!turmas || turmas.length === 0}
                onChange={(e) => setTurmaId(e.target.value ? Number(e.target.value) : null)}
                className={campo}
              >
                <option value="">Escolha a turma</option>
                {(turmas ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="mes" className="font-semibold text-texto-forte">
                Mês
              </label>
              <input
                id="mes"
                type="month"
                value={mes}
                onChange={(e) => e.target.value && setMes(e.target.value)}
                className={campo}
              />
            </div>
          </div>

          {inep && turmas?.length === 0 && (
            <p className="rounded-md border border-borda-suave bg-superficie p-4 text-texto">
              Esta escola ainda não tem turmas em {mes.slice(0, 4)}. As turmas chegam pela carga da
              gestão escolar; fale com a SEMED.
            </p>
          )}

          <p aria-live="polite" className="min-h-6 text-sm font-semibold">
            <StatusEnvio envio={envio} pendentes={fila.length} offline={offline} />
          </p>
          {recusas && (
            <p
              role="alert"
              className="rounded-md border-l-4 border-alerta-destaque bg-alerta-claro p-3"
            >
              {recusas}
            </p>
          )}

          {carregandoGrade && (
            <div
              aria-busy="true"
              aria-label="Carregando a grade"
              className="h-72 animate-pulse rounded-md bg-borda-suave"
            />
          )}
          {!carregandoGrade && grade && grade.dias.length === 0 && (
            <p className="rounded-md border border-borda-suave bg-superficie p-4 text-texto">
              Não há dias letivos em {mes} no calendário desta escola. Confira o mês ou peça à SEMED
              para revisar o calendário.
            </p>
          )}
          {!carregandoGrade && grade && grade.dias.length > 0 && grade.alunos.length === 0 && (
            <p className="rounded-md border border-borda-suave bg-superficie p-4 text-texto">
              Nenhum aluno com matrícula ativa nesta turma.
            </p>
          )}
          {!carregandoGrade && grade && grade.dias.length > 0 && grade.alunos.length > 0 && (
            <>
              <LegendaFrequencia />
              <GradeFrequencia
                grade={grade}
                valores={valores}
                pendentes={pendentes}
                leitura={leitura}
                onAlterar={alterar}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}

function StatusEnvio({
  envio,
  pendentes,
  offline,
}: {
  envio: Envio;
  pendentes: number;
  offline: boolean;
}) {
  if (envio.tipo === 'sem-conexao' || offline)
    return (
      <span className="text-alerta">
        Sem conexão
        {pendentes > 0
          ? `: ${pendentes} ${pendentes === 1 ? 'alteração guardada' : 'alterações guardadas'} neste computador. Vamos enviar quando a internet voltar.`
          : '. Mostrando a última grade guardada neste computador.'}
      </span>
    );
  if (envio.tipo === 'salvando') return <span className="text-texto-suave">Salvando…</span>;
  if (envio.tipo === 'erro')
    return (
      <span className="text-erro">
        Não foi possível salvar: {envio.mensagem} Vamos tentar de novo.
      </span>
    );
  if (pendentes > 0) return <span className="text-texto-suave">Alterações por salvar…</span>;
  if (envio.tipo === 'salvo') return <span className="text-sucesso">Salvo às {envio.as}</span>;
  return null;
}

/** Aplica no estado do servidor o que foi aceito no envio. */
function aplicarNoServidor(g: Grade, enviados: Alteracao[], recusadas: Set<string>): Grade {
  const m = new Map(g.lancamentos.map((l) => [celula(l.matriculaId, l.dia), l]));
  for (const e of enviados) {
    const k = celula(e.matriculaId, e.dia);
    if (recusadas.has(k)) continue;
    if (e.situacao === null) m.delete(k);
    else m.set(k, { matriculaId: e.matriculaId, dia: e.dia, situacao: e.situacao });
  }
  return { ...g, lancamentos: [...m.values()] };
}
