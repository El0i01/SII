import { render, screen } from '@testing-library/react';
import { AlertasCarga } from './alertas-carga';
import { nomeCarga } from './progresso-carga';

describe('AlertasCarga', () => {
  it('anuncia a falha com a fonte, a data e a mensagem da carga', () => {
    render(
      <AlertasCarga
        alertas={[
          {
            id: 3,
            fonte: 'ESUS_PEC',
            inicioEm: '2026-11-13T06:00:00Z',
            erro: 'A estrutura do banco do e-SUS mudou: falta tb_cidadao.dt_atualizado.',
          },
        ]}
      />,
    );
    const alerta = screen.getByRole('alert');
    expect(alerta).toHaveTextContent('Uma carga precisa da CTI');
    expect(alerta).toHaveTextContent('e-SUS PEC');
    expect(alerta).toHaveTextContent('13/11/2026, 02:00:00');
    expect(alerta).toHaveTextContent('falta tb_cidadao.dt_atualizado');
  });

  it('várias falhas: conta no título e usa o código quando a fonte não tem nome', () => {
    render(
      <AlertasCarga
        alertas={[
          { id: 1, fonte: 'ESUS_PEC', inicioEm: '2026-11-13T06:00:00Z', erro: null },
          { id: 2, fonte: 'SICON', inicioEm: '2026-11-12T06:00:00Z', erro: 'x' },
        ]}
      />,
    );
    expect(screen.getByRole('heading')).toHaveTextContent('2 cargas precisam da CTI');
    expect(screen.getByRole('alert')).toHaveTextContent('SICON');
    expect(screen.getByRole('alert')).toHaveTextContent('sem mensagem registrada');
  });
});

describe('nomeCarga', () => {
  it('arquivo, leitura do e-SUS ou número da carga', () => {
    const b = { id: 9, fonte: 'CADUNICO', arquivo: null, modo: null };
    expect(nomeCarga({ ...b, arquivo: 'cecad.csv' })).toBe('cecad.csv');
    expect(nomeCarga({ ...b, fonte: 'ESUS_PEC', modo: 'INCREMENTAL' })).toBe(
      'e-SUS PEC · leitura incremental',
    );
    expect(nomeCarga({ ...b, fonte: 'ESUS_PEC', modo: 'COMPLETA' })).toBe(
      'e-SUS PEC · leitura completa',
    );
    expect(nomeCarga({ ...b, fonte: 'ESUS_PEC' })).toBe('e-SUS PEC');
    expect(nomeCarga(b)).toBe('Carga 9');
  });
});
