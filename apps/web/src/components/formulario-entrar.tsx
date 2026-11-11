'use client';

import { type FormEvent, useRef, useState } from 'react';

export interface ErrosEntrar {
  geral?: string;
  login?: string;
  senha?: string;
}

interface Props {
  onEntrar: (login: string, senha: string) => Promise<ErrosEntrar | null>;
}

/** Formulário de login acessível: rótulo em todo campo, erro ligado ao campo, foco no primeiro erro. */
export function FormularioEntrar({ onEntrar }: Props) {
  const [erros, setErros] = useState<ErrosEntrar>({});
  const [enviando, setEnviando] = useState(false);
  const refLogin = useRef<HTMLInputElement>(null);
  const refSenha = useRef<HTMLInputElement>(null);
  const refGeral = useRef<HTMLParagraphElement>(null);

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const dados = new FormData(e.currentTarget);
    const login = String(dados.get('login') ?? '').trim();
    const senha = String(dados.get('senha') ?? '');
    const locais: ErrosEntrar = {};
    if (!login) locais.login = 'Informe o login.';
    if (!senha) locais.senha = 'Informe a senha.';
    if (locais.login || locais.senha) {
      setErros(locais);
      (locais.login ? refLogin : refSenha).current?.focus();
      return;
    }
    setEnviando(true);
    setErros({});
    const r = await onEntrar(login, senha);
    setEnviando(false);
    if (r) {
      setErros(r);
      if (r.login) refLogin.current?.focus();
      else if (r.senha) refSenha.current?.focus();
      else refGeral.current?.focus();
    }
  }

  const campo =
    'min-h-[var(--spacing-alvo)] w-full rounded-md border border-borda bg-fundo px-3 text-texto-forte';
  return (
    <form onSubmit={enviar} noValidate className="flex max-w-sm flex-col gap-4">
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
        <label htmlFor="login" className="font-semibold text-texto-forte">
          Login
        </label>
        <input
          ref={refLogin}
          id="login"
          name="login"
          autoComplete="username"
          className={campo}
          aria-invalid={!!erros.login}
          aria-describedby={erros.login ? 'login-erro' : undefined}
        />
        {erros.login && (
          <p id="login-erro" className="text-sm text-erro">
            {erros.login}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="senha" className="font-semibold text-texto-forte">
          Senha
        </label>
        <input
          ref={refSenha}
          id="senha"
          name="senha"
          type="password"
          autoComplete="current-password"
          className={campo}
          aria-invalid={!!erros.senha}
          aria-describedby={erros.senha ? 'senha-erro' : undefined}
        />
        {erros.senha && (
          <p id="senha-erro" className="text-sm text-erro">
            {erros.senha}
          </p>
        )}
      </div>
      <button
        type="submit"
        disabled={enviando}
        className="min-h-[var(--spacing-alvo)] rounded-md bg-primaria px-4 font-semibold text-fundo hover:bg-primaria-escura disabled:opacity-70"
      >
        {enviando ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  );
}
