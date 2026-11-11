interface CabecalhoProps {
  /** Mostra a faixa "Ambiente de homologação". Em produção, false. */
  homologacao: boolean;
}

export function Cabecalho({ homologacao }: CabecalhoProps) {
  return (
    <>
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-fundo focus:px-4 focus:py-3 focus:text-primaria"
      >
        Ir para o conteúdo
      </a>
      {homologacao && (
        <div
          role="note"
          className="bg-alerta-destaque px-4 py-1 text-center text-sm font-semibold text-texto-forte"
        >
          Ambiente de homologação: os dados exibidos são fictícios.
        </div>
      )}
      <header className="border-b border-borda-suave bg-fundo">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-4">
          <p className="text-sm text-texto-suave">Prefeitura Municipal de Itapuã do Oeste · RO</p>
          <p className="text-xl font-semibold text-primaria">
            SII · Sistema Integrado Intersecretarial
          </p>
        </div>
      </header>
    </>
  );
}
