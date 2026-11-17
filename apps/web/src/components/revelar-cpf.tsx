'use client';

import {
  FINALIDADES_REVELACAO,
  type FinalidadeRevelacao,
  ROTULO_FINALIDADE,
  RevelarCpf,
} from '@sii/shared';
import { type FormEvent, useEffect, useRef, useState } from 'react';

export type ErrosRevelar = Partial<Record<'finalidade' | 'detalhe' | 'geral', string>>;

interface Props {
  /** Pede o CPF à API; devolve erros (da API) ou null quando revelou. */
  onRevelar: (r: RevelarCpf) => Promise<ErrosRevelar | null>;
  onCancelar: () => void;
}

/**
 * Revelar CPF com finalidade (§3.12). Validado com o mesmo schema da API (`RevelarCpf`, shared): sem
 * finalidade não envia; "Outra" exige descrição. Erro ligado ao campo e foco no primeiro erro.
 */
export function FormularioRevelarCpf({ onRevelar, onCancelar }: Props) {
  const [finalidade, setFinalidade] = useState<FinalidadeRevelacao | ''>('');
  const [erros, setErros] = useState<ErrosRevelar>({});
  const [enviando, setEnviando] = useState(false);
  const refs = {
    finalidade: useRef<HTMLSelectElement>(null),
    detalhe: useRef<HTMLInputElement>(null),
    geral: useRef<HTMLParagraphElement>(null),
  };

  useEffect(() => {
    refs.finalidade.current?.focus();
    // Só ao abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function mostrar(e: ErrosRevelar) {
    setErros(e);
    const primeiro = (['finalidade', 'detalhe', 'geral'] as const).find((k) => e[k]);
    if (primeiro) setTimeout(() => refs[primeiro].current?.focus(), 0);
  }

  async function enviar(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const dados = new FormData(ev.currentTarget);
    const detalhe = String(dados.get('detalhe') ?? '').trim();
    const r = RevelarCpf.safeParse({
      finalidade: finalidade || undefined,
      ...(detalhe ? { detalhe } : {}),
    });
    if (!r.success) {
      const e: ErrosRevelar = {};
      for (const i of r.error.issues) {
        const campo = i.path[0] as keyof ErrosRevelar;
        e[campo] ??= i.message;
      }
      mostrar(e);
      return;
    }
    setEnviando(true);
    setErros({});
    const resposta = await onRevelar(r.data);
    setEnviando(false);
    if (resposta) mostrar(resposta);
  }

  const campo =
    'min-h-[var(--spacing-alvo)] w-full rounded-md border border-borda bg-fundo px-3 text-texto-forte aria-[invalid=true]:border-erro';

  return (
    <form
      onSubmit={enviar}
      noValidate
      aria-labelledby="revelar-titulo"
      className="flex flex-col gap-3 rounded-md border border-primaria bg-primaria-clara p-4"
    >
      <h3 id="revelar-titulo" className="font-semibold text-texto-forte">
        Revelar CPF
      </h3>
      <p className="text-sm text-texto">
        O acesso fica registrado com o seu login, a data e a finalidade, e aparece no painel do
        encarregado de dados (DPO).
      </p>
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
        <label htmlFor="finalidade" className="font-semibold text-texto-forte">
          Finalidade
        </label>
        <select
          ref={refs.finalidade}
          id="finalidade"
          name="finalidade"
          value={finalidade}
          onChange={(e) => setFinalidade(e.target.value as FinalidadeRevelacao | '')}
          className={campo}
          aria-invalid={!!erros.finalidade}
          aria-describedby={erros.finalidade ? 'finalidade-erro' : undefined}
        >
          <option value="">Selecione a finalidade</option>
          {FINALIDADES_REVELACAO.map((f) => (
            <option key={f} value={f}>
              {ROTULO_FINALIDADE[f]}
            </option>
          ))}
        </select>
        {erros.finalidade && (
          <p id="finalidade-erro" className="text-sm text-erro">
            {erros.finalidade}
          </p>
        )}
      </div>
      {finalidade === 'OUTRA' && (
        <div className="flex flex-col gap-1">
          <label htmlFor="detalhe" className="font-semibold text-texto-forte">
            Descreva a finalidade
          </label>
          <input
            ref={refs.detalhe}
            id="detalhe"
            name="detalhe"
            maxLength={250}
            className={campo}
            aria-invalid={!!erros.detalhe}
            aria-describedby={erros.detalhe ? 'detalhe-erro' : undefined}
          />
          {erros.detalhe && (
            <p id="detalhe-erro" className="text-sm text-erro">
              {erros.detalhe}
            </p>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={enviando}
          className="min-h-[var(--spacing-alvo)] rounded-md bg-primaria px-4 font-semibold text-fundo hover:bg-primaria-escura disabled:opacity-70"
        >
          {enviando ? 'Revelando…' : 'Revelar e registrar acesso'}
        </button>
        <button
          type="button"
          onClick={onCancelar}
          className="min-h-[var(--spacing-alvo)] rounded-md border border-primaria px-4 font-semibold text-primaria"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
