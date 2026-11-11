import { render, screen } from '@testing-library/react-native';
import Inicio from '../../app/index';

jest.mock('expo-router', () => ({ Stack: { Screen: () => null } }));

describe('Tela inicial', () => {
  it('mostra o título SII · Campo como cabeçalho', async () => {
    await render(<Inicio />);
    expect(screen.getByRole('header')).toHaveTextContent('SII · Campo');
  });
});
