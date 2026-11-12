'use client';

import { type FormEvent, useRef, useState } from 'react';

export interface ErrosCarga {
  geral?: string;
  mesReferencia?: string;
  arquivo?: string;
}

interface Props {
  onEnviar: (dados: { mesReferencia: string; arquivo: File }) => Promise<ErrosCarga | null>;
  /** Mês sugerido (AAAA-MM): o mês anterior ao atual, que é o da base mais recente do CECAD. */
  mesSugerido: string;
}

/** Envio do CSV do CadÚnico: rótulo em todo campo, erro ligado ao campo, foco no primeiro erro. */
export function FormularioCarga({ onEnviar, mesSugerido }: Props) {
  const [erros, setErros] = useState<ErrosCarga>({});
  const [enviando, setEnviando] = useState(false);
  const refMes = useRef<HTMLInputElement>(null);
  const refArquivo = useRef<HTMLInputElement>(null);
  const refGeral = useRef<HTMLParagraphElement>(null);

  function focar(e: ErrosCarga) {
    if (e.mesReferencia) refMes.current?.focus();
    else if (e.arquivo) refArquivo.current?.focus();
    else refGeral.current?.focus();
  }

  async function enviar(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const form = ev.currentTarget;
    const mesReferencia = String(new FormData(form).get('mesReferencia') ?? '');
    const arquivo = refArquivo.current?.files?.[0];
    const locais: ErrosCarga = {};
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mesReferencia))
      locais.mesReferencia = 'Informe o mês de referência da base.';
    if (!arquivo)
      locais.arquivo = 'Escolha o arquivo .csv exportado do CECAD ou do Portal de Gestão.';
    else if (!/\.csv$/i.test(arquivo.name))
      locais.arquivo = 'Para o CadÚnico, envie o arquivo .csv (não a planilha do Excel).';
    if (Object.keys(locais).length) {
      setErros(locais);
      focar(locais);
      return;
    }
    setEnviando(true);
    setErros({});
    const r = await onEnviar({ mesReferencia, arquivo: arquivo as File });
    setEnviando(false);
    if (r) {
      setErros(r);
      focar(r);
    } else form.reset();
  }

  const campo =
    'min-h-[var(--spacing-alvo)] w-full rounded-md border border-borda bg-fundo px-3 text-texto-forte';
  return (
    <form onSubmit={enviar} noValidate className="flex max-w-md flex-col gap-4">
      {erros.geral && (
        <p
          ref={refGeral}
          tabIndex={-1}
          role="alert"
          className="rounded-md border-l-4 border-erro bg-erro-claro p-3 text-texto-forte"
        >
          {erros.geral}
        </p>
      )}
      <div className="flex flex-col gap-1">
        <span className="font-semibold text-texto-forte">Fonte</span>
        <span className="text-texto">CadÚnico (CECAD ou base completa do Portal de Gestão)</span>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="mesReferencia" className="font-semibold text-texto-forte">
          Mês de referência
        </label>
        <p id="mes-ajuda" className="text-sm text-texto-suave">
          O mês da extração da base.
        </p>
        <input
          ref={refMes}
          id="mesReferencia"
          name="mesReferencia"
          type="month"
          defaultValue={mesSugerido}
          className={campo}
          aria-invalid={!!erros.mesReferencia}
          aria-describedby={erros.mesReferencia ? 'mes-ajuda mes-erro' : 'mes-ajuda'}
        />
        {erros.mesReferencia && (
          <p id="mes-erro" className="text-sm text-erro">
            {erros.mesReferencia}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="arquivo" className="font-semibold text-texto-forte">
          Arquivo .csv
        </label>
        <p id="arquivo-ajuda" className="text-sm text-texto-suave">
          Até 100 MB. O arquivo é apagado do servidor assim que a carga termina.
        </p>
        <input
          ref={refArquivo}
          id="arquivo"
          name="arquivo"
          type="file"
          accept=".csv,text/csv"
          className={`${campo} py-2`}
          aria-invalid={!!erros.arquivo}
          aria-describedby={erros.arquivo ? 'arquivo-ajuda arquivo-erro' : 'arquivo-ajuda'}
        />
        {erros.arquivo && (
          <p id="arquivo-erro" className="text-sm text-erro">
            {erros.arquivo}
          </p>
        )}
      </div>
      <button
        type="submit"
        disabled={enviando}
        className="min-h-[var(--spacing-alvo)] rounded-md bg-primaria px-4 font-semibold text-fundo hover:bg-primaria-escura disabled:opacity-70"
      >
        {enviando ? 'Enviando…' : 'Enviar arquivo'}
      </button>
    </form>
  );
}
