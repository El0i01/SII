const SECRETARIAS: ReadonlyArray<{ nome: string; sigla?: string }> = [
  { nome: 'Educação', sigla: 'SEMED' },
  { nome: 'Saúde', sigla: 'SEMSAU' },
  { nome: 'Assistência Social' },
  { nome: 'Fazenda', sigla: 'SEMFAZ' },
];

export default function Inicio() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-texto-forte sm:text-3xl">
          Sistema Integrado Intersecretarial
        </h1>
        <p className="max-w-prose text-texto-suave">
          Uma base única de pessoas, famílias, domicílios e lotes para acompanhar cada criança, agir
          antes do problema crescer e prestar contas ao TCE-RO.
        </p>
      </div>

      <section aria-labelledby="secretarias">
        <h2 id="secretarias" className="mb-3 text-lg font-semibold text-texto-forte">
          Secretarias integradas
        </h2>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {SECRETARIAS.map((s) => (
            <li key={s.nome} className="rounded-md border border-borda-suave bg-superficie p-4">
              <p className="font-semibold text-texto-forte">{s.nome}</p>
              {s.sigla && <p className="text-sm text-texto-suave">{s.sigla}</p>}
            </li>
          ))}
        </ul>
      </section>

      <nav aria-labelledby="atalhos">
        <h2 id="atalhos" className="mb-3 text-lg font-semibold text-texto-forte">
          Atalhos
        </h2>
        <ul className="flex flex-wrap gap-3">
          {[
            { href: '/frequencia', rotulo: 'Lançar frequência da turma' },
            { href: '/cargas', rotulo: 'Enviar cargas de dados' },
            { href: '/identidade/revisao', rotulo: 'Revisar vínculos de pessoas' },
          ].map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                className="inline-flex min-h-[var(--spacing-alvo)] items-center rounded-md border border-primaria px-4 font-semibold text-primaria"
              >
                {l.rotulo}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <p className="rounded-md border-l-4 border-primaria bg-primaria-clara p-4 text-texto-forte">
        Em construção. Os painéis entram nas próximas etapas.
      </p>
    </div>
  );
}
