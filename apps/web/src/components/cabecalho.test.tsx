import { render, screen } from '@testing-library/react';
import { Cabecalho } from './cabecalho';

describe('Cabecalho', () => {
  it('identifica o órgão e oferece o atalho para o conteúdo', () => {
    render(<Cabecalho homologacao={false} />);
    expect(screen.getByText(/Prefeitura Municipal de Itapuã do Oeste/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir para o conteúdo' })).toHaveAttribute(
      'href',
      '#conteudo',
    );
  });

  it('mostra a faixa de homologação só fora de produção', () => {
    const { rerender } = render(<Cabecalho homologacao />);
    expect(screen.getByRole('note')).toHaveTextContent('Ambiente de homologação');

    rerender(<Cabecalho homologacao={false} />);
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });
});
