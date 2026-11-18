import { fireEvent, render, screen, within } from '@testing-library/react';
import { type Coluna, Tabela } from './tabela';

interface Linha {
  codigo: string;
  dias: number;
}
const dados: Linha[] = Array.from({ length: 12 }, (_, i) => ({
  codigo: `BA-${i + 1}`,
  dias: (i * 7) % 12,
}));
const colunas: Coluna<Linha>[] = [
  { accessorKey: 'codigo', header: 'Caso' },
  { accessorKey: 'dias', header: 'Dias', numerica: true },
];

describe('Tabela', () => {
  it('pagina de 10 em 10 e avança', () => {
    render(<Tabela dados={dados} colunas={colunas} legenda="Casos" />);
    expect(screen.getAllByRole('row')).toHaveLength(11);
    expect(screen.getByText('1–10 de 12')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Próxima' }));
    expect(screen.getByText('11–12 de 12')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Próxima' })).toBeDisabled();
  });

  it('ordena pelo cabeçalho com aria-sort', () => {
    render(<Tabela dados={dados} colunas={colunas} legenda="Casos" porPagina={20} />);
    const th = screen.getByRole('columnheader', { name: /Dias/ });
    expect(th).toHaveAttribute('aria-sort', 'none');
    fireEvent.click(within(th).getByRole('button'));
    expect(th).toHaveAttribute('aria-sort', 'ascending');
    const primeira = screen.getAllByRole('row')[1] as HTMLElement;
    expect(within(primeira).getAllByRole('cell')[1]).toHaveTextContent('0');
    fireEvent.click(within(th).getByRole('button'));
    expect(th).toHaveAttribute('aria-sort', 'descending');
  });

  it('busca, estado vazio e exportação', () => {
    const gerar = vi.fn(() => 'csv');
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    render(
      <Tabela
        dados={dados}
        colunas={colunas}
        legenda="Casos"
        busca={{ rotulo: 'Buscar caso', atende: (l, q) => l.codigo.toLowerCase().includes(q) }}
        exportar={{ arquivo: 'casos.csv', gerar }}
        vazio={{ titulo: 'Nenhum caso encontrado' }}
      />,
    );
    fireEvent.change(screen.getByLabelText('Buscar caso'), { target: { value: 'ba-1' } });
    expect(screen.getByText('4 registros')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Baixar CSV' }));
    expect(gerar).toHaveBeenCalledWith(expect.arrayContaining([{ codigo: 'BA-1', dias: 0 }]));
    fireEvent.change(screen.getByLabelText('Buscar caso'), { target: { value: 'xyz' } });
    expect(screen.getByText('Nenhum caso encontrado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Baixar CSV' })).toBeDisabled();
  });
});
