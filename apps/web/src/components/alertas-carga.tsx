export interface AlertaCarga {
  id: number;
  fonte: string;
  inicioEm: string;
  erro: string | null;
}

const NOME_FONTE: Record<string, string> = {
  ESUS_PEC: 'e-SUS PEC',
  CADUNICO: 'CadÚnico',
  PORTAL_TRANSPARENCIA: 'Portal da Transparência',
  INDICADORES: 'Indicadores',
};

/**
 * Faixa de alerta da CTI (P09): cargas que falharam e ainda não voltaram a dar certo. Some sozinha
 * quando a próxima carga da fonte termina bem. Só a mensagem fixa da carga, nenhum dado de pessoa.
 */
export function AlertasCarga({ alertas }: { alertas: AlertaCarga[] }) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-md border-l-4 border-erro bg-erro-claro p-4"
    >
      <h2 className="text-lg font-semibold text-texto-forte">
        {alertas.length === 1
          ? 'Uma carga precisa da CTI'
          : `${alertas.length} cargas precisam da CTI`}
      </h2>
      <ul className="flex flex-col gap-2">
        {alertas.map((a) => (
          <li key={a.id} className="text-texto-forte">
            <strong>{NOME_FONTE[a.fonte] ?? a.fonte}</strong>, falhou em{' '}
            {new Date(a.inicioEm).toLocaleString('pt-BR', { timeZone: 'America/Porto_Velho' })}:{' '}
            {a.erro ?? 'sem mensagem registrada.'}
          </li>
        ))}
      </ul>
      <p className="text-sm text-texto">
        Depois de corrigir, rode <code>pnpm --filter @sii/worker esus:carregar</code> ou espere a
        carga da noite. O aviso some quando a carga der certo.
      </p>
    </div>
  );
}
