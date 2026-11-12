import { render, screen } from '@testing-library/react';
import { type Carga, ProgressoCarga } from './progresso-carga';

const base: Carga = {
  id: 7,
  fonte: 'CADUNICO',
  status: 'EXECUTANDO',
  etapa: 'LIGACAO',
  arquivo: 'cecad.csv',
  mesReferencia: '2026-10',
  inicioEm: '2026-11-12T10:00:00Z',
  fimEm: null,
  total: 5000,
  processados: 1250,
  lidos: 0,
  inseridos: 0,
  rejeitados: 0,
  ligados: 0,
  novos: 0,
  revisao: 0,
  avisos: 0,
  erro: null,
};

describe('ProgressoCarga', () => {
  it('em andamento: barra acessível com etapa em texto', () => {
    render(<ProgressoCarga carga={base} />);
    const barra = screen.getByRole('progressbar', { name: 'Progresso da carga' });
    expect(barra).toHaveAttribute('aria-valuenow', '25');
    expect(barra).toHaveAttribute(
      'aria-valuetext',
      '25% — Ligando as pessoas e gravando as famílias',
    );
    expect(screen.getByText(/1\.250 de 5\.000 linhas/)).toBeInTheDocument();
  });

  it('rejeitada: mostra a mensagem do layout como alerta, sem barra', () => {
    render(
      <ProgressoCarga
        carga={{
          ...base,
          status: 'REJEITADA',
          etapa: 'LAYOUT',
          erro: 'O arquivo não tem a coluna obrigatória NIS.',
        }}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('coluna obrigatória NIS');
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('concluída: contagens e avisos', () => {
    render(
      <ProgressoCarga
        carga={{
          ...base,
          status: 'OK',
          etapa: 'FIM',
          lidos: 5000,
          inseridos: 4850,
          novos: 4000,
          ligados: 840,
          revisao: 10,
          rejeitados: 150,
          avisos: 30,
        }}
      />,
    );
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    expect(screen.getByText('Pessoas novas').nextSibling).toHaveTextContent('4.000');
    expect(screen.getByText('Linhas rejeitadas').nextSibling).toHaveTextContent('150');
    expect(screen.getByText(/30 aviso/)).toBeInTheDocument();
  });
});
