import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FormularioCarga } from './formulario-carga';

const csv = (nome = 'cecad.csv') => new File(['a;b\n1;2\n'], nome, { type: 'text/csv' });

describe('FormularioCarga', () => {
  it('sem arquivo: erro ligado ao campo e foco nele', () => {
    render(<FormularioCarga onEnviar={vi.fn()} mesSugerido="2026-10" />);
    fireEvent.click(screen.getByRole('button', { name: 'Enviar arquivo' }));
    const arquivo = screen.getByLabelText('Arquivo .csv');
    expect(arquivo).toHaveAttribute('aria-invalid', 'true');
    expect(arquivo.getAttribute('aria-describedby')).toContain('arquivo-erro');
    expect(screen.getByText(/Escolha o arquivo \.csv/)).toBeInTheDocument();
    expect(arquivo).toHaveFocus();
  });

  it('planilha do Excel é recusada antes de enviar', () => {
    const onEnviar = vi.fn();
    render(<FormularioCarga onEnviar={onEnviar} mesSugerido="2026-10" />);
    fireEvent.change(screen.getByLabelText('Arquivo .csv'), {
      target: { files: [csv('base.xlsx')] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar arquivo' }));
    expect(screen.getByText(/não a planilha do Excel/)).toBeInTheDocument();
    expect(onEnviar).not.toHaveBeenCalled();
  });

  it('envia mês e arquivo; erro da API no campo volta para o campo', async () => {
    const onEnviar = vi
      .fn()
      .mockResolvedValue({ mesReferencia: 'Mês de referência inválido (AAAA-MM).' });
    render(<FormularioCarga onEnviar={onEnviar} mesSugerido="2026-10" />);
    const arquivo = csv();
    fireEvent.change(screen.getByLabelText('Arquivo .csv'), { target: { files: [arquivo] } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar arquivo' }));
    await waitFor(() =>
      expect(screen.getByText('Mês de referência inválido (AAAA-MM).')).toBeInTheDocument(),
    );
    expect(onEnviar).toHaveBeenCalledWith({ fonte: 'CADUNICO', mesReferencia: '2026-10', arquivo });
    expect(screen.getByLabelText('Mês de referência')).toHaveFocus();
  });

  it('erro geral vira alerta', async () => {
    const onEnviar = vi
      .fn()
      .mockResolvedValue({ geral: 'Não foi possível receber o arquivo agora.' });
    render(<FormularioCarga onEnviar={onEnviar} mesSugerido="2026-10" />);
    fireEvent.change(screen.getByLabelText('Arquivo .csv'), { target: { files: [csv()] } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar arquivo' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível receber'),
    );
  });

  it('com mais de uma fonte, escolhe a fonte e a envia junto (P10)', async () => {
    const onEnviar = vi.fn().mockResolvedValue(null);
    render(
      <FormularioCarga
        onEnviar={onEnviar}
        mesSugerido="2026-10"
        fontes={['GESTAO_ESCOLAR', 'SEDUC']}
      />,
    );
    fireEvent.change(screen.getByLabelText('Fonte'), { target: { value: 'SEDUC' } });
    const arquivo = csv('seduc.csv');
    fireEvent.change(screen.getByLabelText('Arquivo .csv'), { target: { files: [arquivo] } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar arquivo' }));
    await waitFor(() =>
      expect(onEnviar).toHaveBeenCalledWith({ fonte: 'SEDUC', mesReferencia: '2026-10', arquivo }),
    );
  });
});
