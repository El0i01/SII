import type { ReactNode } from 'react';

interface CabecalhoProps {
  /** Mostra a faixa "Ambiente de homologação". Em produção, false. */
  homologacao: boolean;
  /** Área à direita: usuário, sair e filtros (só com sessão). */
  children?: ReactNode;
  /** Botão "Menu" do celular. */
  menu?: ReactNode;
}

/** Cabeçalho do órgão, como no protótipo (gov.br): faixa do órgão, marca e controles. */
export function Cabecalho({ homologacao, children, menu }: CabecalhoProps) {
  return (
    <>
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:bg-fundo focus:px-4 focus:py-3 focus:text-primaria"
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
        <div className="bg-primaria-escura text-sm text-fundo">
          <div className="mx-auto flex max-w-7xl flex-wrap justify-between gap-x-6 gap-y-1 px-4 py-1.5">
            <span>
              <strong>Prefeitura Municipal de Itapuã do Oeste</strong> · Rondônia
            </span>
            <span className="hidden md:inline">
              Educação · Saúde · Assistência Social · Fazenda
            </span>
            <span className="hidden sm:inline">Coordenação técnica: CTI/SEMED</span>
          </div>
        </div>
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            {menu}
            <span
              aria-hidden="true"
              className="grid h-11 w-11 place-items-center rounded-md bg-primaria text-sm font-bold text-fundo"
            >
              SII
            </span>
            <div>
              <p className="text-lg font-semibold text-primaria sm:text-xl">
                Sistema Integrado Intersecretarial
              </p>
              <p className="text-sm text-texto-suave">Painéis de gestão e de controle externo</p>
            </div>
          </div>
          {children}
        </div>
      </header>
    </>
  );
}
