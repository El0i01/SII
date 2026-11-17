import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FormularioParecer } from './formulario-parecer';

const TEXTO = 'Visita feita com a mãe; a criança volta às aulas na segunda-feira.';

describe('FormularioParecer', () => {
  it('sem desfecho e com texto curto: erros ligados aos campos e foco no primeiro', async () => {
    const onEnviar = vi.fn();
    render(<FormularioParecer onEnviar={onEnviar} />);
    fireEvent.change(screen.getByLabelText('Parecer'), { target: { value: 'curto' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar parecer à escola' }));
    const desfecho = screen.getByLabelText('Desfecho');
    await waitFor(() => expect(desfecho).toHaveFocus());
    expect(desfecho).toHaveAttribute('aria-invalid', 'true');
    expect(desfecho.getAttribute('aria-describedby')).toBe('desfecho-erro');
    expect(screen.getByText('Selecione o desfecho.')).toBeInTheDocument();
    const texto = screen.getByLabelText('Parecer');
    expect(texto.getAttribute('aria-describedby')).toBe('texto-ajuda texto-erro');
    expect(screen.getByText('Escreva pelo menos 30 caracteres.')).toBeInTheDocument();
    expect(onEnviar).not.toHaveBeenCalled();
  });

  it('CID no texto é recusado antes de enviar', async () => {
    render(<FormularioParecer onEnviar={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Desfecho'), {
      target: { value: 'AUSENCIA_JUSTIFICADA_SAUDE' },
    });
    fireEvent.change(screen.getByLabelText('Parecer'), { target: { value: `${TEXTO} CID F32.1` } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar parecer à escola' }));
    await waitFor(() => expect(screen.getByLabelText('Parecer')).toHaveFocus());
    expect(
      screen.getByText(/Não registre diagnóstico/, { selector: '#texto-erro' }),
    ).toBeInTheDocument();
  });

  it('envia com "Enviando…" e nova visita com data; erro da API volta para o campo', async () => {
    let resolver: (v: object | null) => void = () => undefined;
    const onEnviar = vi.fn(() => new Promise<object | null>((r) => (resolver = r)));
    render(<FormularioParecer onEnviar={onEnviar} />);
    fireEvent.change(screen.getByLabelText('Desfecho'), {
      target: { value: 'RETORNO_ESCOLA_COMBINADO' },
    });
    fireEvent.change(screen.getByLabelText('Parecer'), { target: { value: TEXTO } });
    fireEvent.click(screen.getByLabelText('Programar nova visita'));
    fireEvent.change(screen.getByLabelText('Data da nova visita'), {
      target: { value: '2026-12-02' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar parecer à escola' }));
    expect(await screen.findByRole('button', { name: 'Enviando…' })).toBeDisabled();
    expect(onEnviar).toHaveBeenCalledWith({
      desfecho: 'RETORNO_ESCOLA_COMBINADO',
      texto: TEXTO,
      novaVisita: true,
      dataNovaVisita: '2026-12-02',
    });
    resolver({ geral: 'Esta notificação já tem parecer.' });
    expect(await screen.findByRole('alert')).toHaveTextContent('já tem parecer');
  });

  it('botão de em análise aparece quando há a ação', async () => {
    const onEmAnalise = vi.fn().mockResolvedValue(undefined);
    render(<FormularioParecer onEnviar={vi.fn()} onEmAnalise={onEmAnalise} />);
    fireEvent.click(screen.getByRole('button', { name: 'Marcar como em análise' }));
    await waitFor(() => expect(onEmAnalise).toHaveBeenCalled());
  });
});
