import { AlertTriangle, Inbox, Lock } from 'lucide-react';
import type { ReactNode } from 'react';
import { Botao } from './button';

/**
 * Estados de toda tela (CLAUDE.md): carregando (skeleton), vazio (dizendo o que fazer), erro (com
 * ação de recuperar) e sem permissão.
 */
export function Carregando({ rotulo, altura = 'h-40' }: { rotulo: string; altura?: string }) {
  return (
    <div aria-busy="true" aria-label={rotulo} className="flex flex-col gap-3">
      <div className={`${altura} animate-pulse rounded-md bg-borda-suave`} />
    </div>
  );
}

export function Vazio({
  titulo,
  children,
  acao,
}: {
  titulo: string;
  children?: ReactNode;
  acao?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-md border border-borda-suave bg-superficie p-4">
      <p className="flex items-center gap-2 font-semibold text-texto-forte">
        <Inbox aria-hidden="true" className="h-5 w-5" /> {titulo}
      </p>
      {children && <div className="text-texto">{children}</div>}
      {acao}
    </div>
  );
}

export function Erro({ mensagem, onTentar }: { mensagem: string; onTentar?: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-md border-l-4 border-erro bg-erro-claro p-4"
    >
      <p className="flex items-center gap-2 text-texto-forte">
        <AlertTriangle aria-hidden="true" className="h-5 w-5 text-erro" /> {mensagem}
      </p>
      {onTentar && <Botao onClick={onTentar}>Tentar de novo</Botao>}
    </div>
  );
}

export function SemPermissao({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-md border-l-4 border-alerta-destaque bg-alerta-claro p-4 text-texto-forte">
      <Lock aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

/** Aviso de sucesso depois de uma ação. */
export function Sucesso({ children }: { children: ReactNode }) {
  return (
    <p
      role="status"
      className="rounded-md border-l-4 border-sucesso bg-sucesso-claro p-3 text-texto-forte"
    >
      {children}
    </p>
  );
}
