'use client';

import { adicionarDias, DESFECHOS, hojeEmPortoVelho, Parecer, ROTULO_DESFECHO } from '@sii/shared';
import { type FormEvent, useRef, useState } from 'react';

export type ErrosParecer = Partial<
  Record<'desfecho' | 'texto' | 'dataNovaVisita' | 'geral', string>
>;

interface Props {
  /** Envia o parecer; devolve erros (da API) ou null quando deu certo. */
  onEnviar: (p: Parecer) => Promise<ErrosParecer | null>;
  /** Mostra o botão "Marcar como em análise" (notificação nova). */
  onEmAnalise?: () => Promise<void>;
}

const ORDEM: (keyof ErrosParecer)[] = ['desfecho', 'texto', 'dataNovaVisita', 'geral'];

/**
 * Parecer da Assistência (§3.7): validado com o mesmo schema da API (`Parecer`, shared). Erro ligado
 * ao campo (`aria-describedby`), foco no primeiro erro, botão "Enviando…" durante o envio.
 */
export function FormularioParecer({ onEnviar, onEmAnalise }: Props) {
  const [erros, setErros] = useState<ErrosParecer>({});
  const [enviando, setEnviando] = useState(false);
  const [marcando, setMarcando] = useState(false);
  const [novaVisita, setNovaVisita] = useState(false);
  const refs = {
    desfecho: useRef<HTMLSelectElement>(null),
    texto: useRef<HTMLTextAreaElement>(null),
    dataNovaVisita: useRef<HTMLInputElement>(null),
    geral: useRef<HTMLParagraphElement>(null),
  };

  function mostrar(e: ErrosParecer) {
    setErros(e);
    const primeiro = ORDEM.find((k) => e[k]);
    // O campo aparece no próximo render; foca depois dele.
    if (primeiro) setTimeout(() => refs[primeiro].current?.focus(), 0);
  }

  async function enviar(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const dados = new FormData(ev.currentTarget);
    const r = Parecer.safeParse({
      desfecho: dados.get('desfecho') || undefined,
      texto: String(dados.get('texto') ?? ''),
      novaVisita,
      ...(novaVisita && dados.get('dataNovaVisita')
        ? { dataNovaVisita: String(dados.get('dataNovaVisita')) }
        : {}),
    });
    if (!r.success) {
      const e: ErrosParecer = {};
      for (const i of r.error.issues) {
        const campo = i.path[0] as keyof ErrosParecer;
        e[campo] ??= campo === 'desfecho' ? 'Selecione o desfecho.' : i.message;
      }
      mostrar(e);
      return;
    }
    setEnviando(true);
    setErros({});
    const resposta = await onEnviar(r.data);
    setEnviando(false);
    if (resposta) mostrar(resposta);
  }

  const campo =
    'min-h-[var(--spacing-alvo)] w-full rounded-md border border-borda bg-fundo px-3 text-texto-forte aria-[invalid=true]:border-erro';
  const descricao = (ajuda: string | null, nome: keyof ErrosParecer) =>
    [ajuda, erros[nome] ? `${nome}-erro` : null].filter(Boolean).join(' ') || undefined;

  return (
    <form
      onSubmit={enviar}
      noValidate
      className="flex flex-col gap-4"
      aria-labelledby="parecer-titulo"
    >
      <h3 id="parecer-titulo" className="text-lg font-semibold text-texto-forte">
        Registrar parecer
      </h3>
      {erros.geral && (
        <p
          ref={refs.geral}
          tabIndex={-1}
          role="alert"
          className="rounded-md border-l-4 border-erro bg-erro-claro p-3 text-texto-forte"
        >
          {erros.geral}
        </p>
      )}
      <div className="flex flex-col gap-1">
        <label htmlFor="desfecho" className="font-semibold text-texto-forte">
          Desfecho
        </label>
        <select
          ref={refs.desfecho}
          id="desfecho"
          name="desfecho"
          defaultValue=""
          className={campo}
          aria-invalid={!!erros.desfecho}
          aria-describedby={descricao(null, 'desfecho')}
        >
          <option value="">Selecione o desfecho</option>
          {DESFECHOS.map((d) => (
            <option key={d} value={d}>
              {ROTULO_DESFECHO[d]}
            </option>
          ))}
        </select>
        {erros.desfecho && (
          <p id="desfecho-erro" className="text-sm text-erro">
            {erros.desfecho}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="texto" className="font-semibold text-texto-forte">
          Parecer
        </label>
        <textarea
          ref={refs.texto}
          id="texto"
          name="texto"
          rows={5}
          placeholder="O que foi verificado na visita e o que foi combinado com a família"
          className={`${campo} py-2`}
          aria-invalid={!!erros.texto}
          aria-describedby={descricao('texto-ajuda', 'texto')}
        />
        <p id="texto-ajuda" className="text-sm text-texto-suave">
          Mínimo de 30 caracteres. Não registre diagnóstico de saúde nem código CID.
        </p>
        {erros.texto && (
          <p id="texto-erro" className="text-sm text-erro">
            {erros.texto}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <label className="flex min-h-[var(--spacing-alvo)] items-center gap-3 text-texto-forte">
          <input
            type="checkbox"
            name="novaVisita"
            checked={novaVisita}
            onChange={(e) => setNovaVisita(e.target.checked)}
            className="h-5 w-5"
          />
          Programar nova visita
        </label>
        {novaVisita && (
          <div className="flex flex-col gap-1">
            <label htmlFor="dataNovaVisita" className="font-semibold text-texto-forte">
              Data da nova visita
            </label>
            <input
              ref={refs.dataNovaVisita}
              id="dataNovaVisita"
              name="dataNovaVisita"
              type="date"
              defaultValue={adicionarDias(hojeEmPortoVelho(), 15)}
              className={`${campo} max-w-56`}
              aria-invalid={!!erros.dataNovaVisita}
              aria-describedby={descricao(null, 'dataNovaVisita')}
            />
            {erros.dataNovaVisita && (
              <p id="dataNovaVisita-erro" className="text-sm text-erro">
                {erros.dataNovaVisita}
              </p>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-3">
        {onEmAnalise && (
          <button
            type="button"
            disabled={marcando || enviando}
            onClick={async () => {
              setMarcando(true);
              await onEmAnalise();
              setMarcando(false);
            }}
            className="min-h-[var(--spacing-alvo)] rounded-md border border-primaria px-4 font-semibold text-primaria disabled:opacity-70"
          >
            {marcando ? 'Marcando…' : 'Marcar como em análise'}
          </button>
        )}
        <button
          type="submit"
          disabled={enviando}
          aria-disabled={enviando}
          className="min-h-[var(--spacing-alvo)] rounded-md bg-primaria px-4 font-semibold text-fundo hover:bg-primaria-escura disabled:opacity-70"
        >
          {enviando ? 'Enviando…' : 'Enviar parecer à escola'}
        </button>
      </div>
    </form>
  );
}
