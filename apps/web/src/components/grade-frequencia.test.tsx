import { fireEvent, render, screen } from '@testing-library/react';
import type { Grade } from '@/lib/fila-frequencia';
import { GradeFrequencia } from './grade-frequencia';

const grade: Grade = {
  escola: { inep: '11005165', nome: 'Escola fictícia' },
  turma: { id: 3, nome: '1º ano A', ano: 2026 },
  mes: '2026-11',
  hoje: '2026-11-17',
  dias: ['2026-11-16', '2026-11-17', '2026-11-18'],
  alunos: [
    { matriculaId: 1, nome: 'Aluna Um' },
    { matriculaId: 2, nome: 'Aluno Dois' },
  ],
  lancamentos: [{ matriculaId: 1, dia: '2026-11-16', situacao: 'FALTA' }],
};

const valores = new Map([['1|2026-11-16', 'FALTA' as const]]);

describe('GradeFrequencia', () => {
  it('cada célula diz aluno, dia e situação; só uma entra no Tab', () => {
    render(
      <GradeFrequencia grade={grade} valores={valores} pendentes={new Set()} onAlterar={vi.fn()} />,
    );
    const celula = screen.getByRole('button', { name: 'Aluna Um, 16/11: falta' });
    expect(celula).toHaveTextContent('F');
    expect(celula).toHaveAttribute('tabindex', '0');
    expect(
      screen.getByRole('button', { name: 'Aluno Dois, 16/11: sem lançamento' }),
    ).toHaveAttribute('tabindex', '-1');
  });

  it('tecla P lança presença e desce para o próximo aluno', () => {
    const onAlterar = vi.fn();
    render(
      <GradeFrequencia
        grade={grade}
        valores={valores}
        pendentes={new Set()}
        onAlterar={onAlterar}
      />,
    );
    fireEvent.keyDown(screen.getByRole('button', { name: /Aluna Um, 16\/11/ }), { key: 'p' });
    expect(onAlterar).toHaveBeenCalledWith(1, '2026-11-16', 'PRESENTE');
    expect(screen.getByRole('button', { name: /Aluno Dois, 16\/11/ })).toHaveFocus();
  });

  it('setas andam; clique alterna; dia futuro não aceita lançamento', () => {
    const onAlterar = vi.fn();
    render(
      <GradeFrequencia
        grade={grade}
        valores={valores}
        pendentes={new Set(['2|2026-11-17'])}
        onAlterar={onAlterar}
      />,
    );
    fireEvent.keyDown(screen.getByRole('button', { name: /Aluna Um, 16\/11/ }), {
      key: 'ArrowRight',
    });
    expect(screen.getByRole('button', { name: /Aluna Um, 17\/11/ })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: /Aluna Um, 16\/11/ }));
    expect(onAlterar).toHaveBeenLastCalledWith(1, '2026-11-16', 'JUSTIFICADA');
    expect(
      screen.getByRole('button', { name: /Aluno Dois, 17\/11.*ainda não salvo/ }),
    ).toBeInTheDocument();

    const futuro = screen.getByRole('button', { name: /Aluna Um, 18\/11.*dia futuro/ });
    expect(futuro).toHaveAttribute('aria-disabled', 'true');
    onAlterar.mockClear();
    fireEvent.click(futuro);
    fireEvent.keyDown(futuro, { key: 'f' });
    expect(onAlterar).not.toHaveBeenCalled();
  });

  it('somente leitura não lança', () => {
    const onAlterar = vi.fn();
    render(
      <GradeFrequencia
        grade={grade}
        valores={valores}
        pendentes={new Set()}
        leitura
        onAlterar={onAlterar}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Aluna Um, 16\/11/ }));
    expect(onAlterar).not.toHaveBeenCalled();
  });
});
