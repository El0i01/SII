import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FormularioEntrar } from './formulario-entrar';

describe('FormularioEntrar', () => {
  it('sem preencher: erro ligado ao campo e foco no primeiro erro', () => {
    render(<FormularioEntrar onEntrar={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    const login = screen.getByLabelText('Login');
    expect(login).toHaveAttribute('aria-invalid', 'true');
    expect(login).toHaveAttribute('aria-describedby', 'login-erro');
    expect(screen.getByText('Informe o login.')).toBeInTheDocument();
    expect(login).toHaveFocus();
  });

  it('erro geral da API vira alerta', async () => {
    const onEntrar = vi.fn().mockResolvedValue({ geral: 'Login ou senha incorretos.' });
    render(<FormularioEntrar onEntrar={onEntrar} />);
    fireEvent.change(screen.getByLabelText('Login'), { target: { value: 'cti.admin' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'errada' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Login ou senha incorretos.'),
    );
    expect(onEntrar).toHaveBeenCalledWith('cti.admin', 'errada');
  });
});
