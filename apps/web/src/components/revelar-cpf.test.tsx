import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FormularioRevelarCpf } from './revelar-cpf';

describe('FormularioRevelarCpf', () => {
  it('abre com foco na finalidade; sem finalidade não envia e liga o erro ao campo', async () => {
    const onRevelar = vi.fn();
    render(<FormularioRevelarCpf onRevelar={onRevelar} onCancelar={vi.fn()} />);
    const finalidade = screen.getByLabelText('Finalidade');
    expect(finalidade).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Revelar e registrar acesso' }));
    expect(await screen.findByText('Escolha a finalidade.')).toBeInTheDocument();
    expect(finalidade).toHaveAttribute('aria-invalid', 'true');
    expect(finalidade.getAttribute('aria-describedby')).toBe('finalidade-erro');
    expect(onRevelar).not.toHaveBeenCalled();
  });

  it('"Outra" pede a descrição antes de enviar', async () => {
    const onRevelar = vi.fn();
    render(<FormularioRevelarCpf onRevelar={onRevelar} onCancelar={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Finalidade'), { target: { value: 'OUTRA' } });
    fireEvent.change(screen.getByLabelText('Descreva a finalidade'), {
      target: { value: 'curto' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Revelar e registrar acesso' }));
    await waitFor(() => expect(screen.getByLabelText('Descreva a finalidade')).toHaveFocus());
    expect(screen.getByText(/10 caracteres ou mais/)).toBeInTheDocument();
    expect(onRevelar).not.toHaveBeenCalled();
  });

  it('envia a finalidade e mostra o erro da API', async () => {
    const onRevelar = vi.fn().mockResolvedValue({ geral: 'Esta ficha não tem CPF registrado.' });
    render(<FormularioRevelarCpf onRevelar={onRevelar} onCancelar={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Finalidade'), {
      target: { value: 'CONTATO_MATRICULA' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Revelar e registrar acesso' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('não tem CPF');
    expect(onRevelar).toHaveBeenCalledWith({ finalidade: 'CONTATO_MATRICULA' });
  });

  it('cancelar fecha sem enviar', () => {
    const onCancelar = vi.fn();
    render(<FormularioRevelarCpf onRevelar={vi.fn()} onCancelar={onCancelar} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onCancelar).toHaveBeenCalled();
  });
});
