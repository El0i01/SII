import { fireEvent, render, screen } from '@testing-library/react';
import { Barras } from './barras';
import { Botao } from './button';
import { Card } from './card';
import { Erro, SemPermissao, Vazio } from './estado';
import { Kpi } from './kpi';
import { Pill, tomDoPrazo } from './pill';

describe('componentes base', () => {
  it('KPI mostra "< 5" para contagem suprimida e formata o número', () => {
    const { rerender } = render(<Kpi rotulo="Identificados" valor={null} />);
    expect(screen.getByText('< 5')).toBeInTheDocument();
    rerender(<Kpi rotulo="Pessoas" valor={9742} detalhe="na base" />);
    expect(screen.getByText('9.742')).toBeInTheDocument();
  });

  it('Card vira região com o título; Pill e tom do prazo', () => {
    render(
      <Card titulo="Casos">
        <Pill tom={tomDoPrazo('ok')}>No prazo</Pill>
      </Card>,
    );
    expect(screen.getByRole('region', { name: 'Casos' })).toBeInTheDocument();
    expect(screen.getByText('No prazo')).toHaveClass('bg-sucesso-claro');
    expect(tomDoPrazo('critico')).toBe('critico');
  });

  it('estados: erro com ação, vazio, sem permissão', () => {
    const tentar = vi.fn();
    render(
      <>
        <Erro mensagem="Sem conexão" onTentar={tentar} />
        <Vazio titulo="Nada aqui">Escolha outro filtro.</Vazio>
        <SemPermissao>Fale com a CTI.</SemPermissao>
      </>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Sem conexão');
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(tentar).toHaveBeenCalled();
    expect(screen.getByText('Nada aqui')).toBeInTheDocument();
    expect(screen.getByText('Fale com a CTI.')).toBeInTheDocument();
  });

  it('Botao como link (asChild) e barras com o número escrito', () => {
    render(
      <>
        <Botao asChild variante="contorno">
          <a href="/pauta">Ver pauta</a>
        </Botao>
        <Barras
          titulo="Por origem"
          itens={[
            { rotulo: 'CadÚnico', valor: 12 },
            { rotulo: 'Censo', valor: null },
          ]}
        />
      </>,
    );
    expect(screen.getByRole('link', { name: 'Ver pauta' })).toHaveAttribute('href', '/pauta');
    expect(screen.getByRole('list', { name: 'Por origem' })).toHaveTextContent('CadÚnico12');
    expect(screen.getByRole('list', { name: 'Por origem' })).toHaveTextContent('< 5');
  });
});
