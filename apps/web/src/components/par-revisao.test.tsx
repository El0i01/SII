import { fireEvent, render, screen } from '@testing-library/react';
import { ParRevisao, type Revisao } from './par-revisao';

const lado = {
  id: 1,
  nome: 'Ana Beatriz Lima',
  nascimento: '2015-03-14',
  mae: 'Maria Silva Oliveira',
  sexo: 'FEMININO',
  setor: 'S03',
  cpf: '***.959.953-**',
  nis: null,
  temCns: true,
  fontes: [{ fonte: 'CADUNICO', regra: 'SEED' }],
};
const revisao: Revisao = {
  id: 7,
  similaridade: 0.9,
  a: lado,
  b: { ...lado, id: 2, nascimento: '2015-03-17', cpf: null },
};

describe('ParRevisao', () => {
  it('mostra os dois lados, destaca o que difere também em texto e dispara as ações', () => {
    const onUnir = vi.fn();
    const onRejeitar = vi.fn();
    render(
      <ParRevisao revisao={revisao} ocupado={false} onUnir={onUnir} onRejeitar={onRejeitar} />,
    );
    expect(screen.getByRole('heading', { name: /semelhança 90%/ })).toBeInTheDocument();
    expect(screen.getByText('14/03/2015')).toBeInTheDocument();
    expect(screen.getAllByText('(diferente do outro registro)')).toHaveLength(2);
    expect(screen.getByText('***.959.953-**')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'São a mesma pessoa: unir' }));
    fireEvent.click(screen.getByRole('button', { name: 'São pessoas diferentes' }));
    expect(onUnir).toHaveBeenCalled();
    expect(onRejeitar).toHaveBeenCalled();
  });
});
