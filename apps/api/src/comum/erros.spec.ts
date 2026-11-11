import { NotFoundException } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { z } from 'zod';
import { erros, FiltroErros } from './erros';
import { ZodPipe } from './zod.pipe';

describe('FiltroErros', () => {
  const filtro = new FiltroErros();

  it('mantém código e mensagem dos erros da API', () => {
    expect(filtro.converter(erros.semPermissao())).toEqual({
      status: 403,
      corpo: { codigo: 'SEM_PERMISSAO', mensagem: 'Seu perfil não tem acesso a esta informação.' },
    });
  });

  it('traduz exceções HTTP do Nest para o formato do SII', () => {
    expect(filtro.converter(new NotFoundException()).corpo).toEqual({
      codigo: 'NAO_ENCONTRADO',
      mensagem: 'Não encontramos o que você procurou.',
    });
  });

  it('traduz o limite de tentativas para 429 em português', () => {
    const { status, corpo } = filtro.converter(new ThrottlerException());
    expect(status).toBe(429);
    expect(corpo.codigo).toBe('MUITAS_TENTATIVAS');
  });

  it('esconde o detalhe de erros inesperados', () => {
    const { status, corpo } = filtro.converter(
      new Error('duplicate key value (cpf)=(12345678900)'),
    );
    expect(status).toBe(500);
    expect(JSON.stringify(corpo)).not.toMatch(/12345678900/);
  });
});

describe('ZodPipe', () => {
  const pipe = new ZodPipe(z.object({ login: z.string().min(1, 'Informe o login.') }));

  it('devolve o valor validado', () => {
    expect(pipe.transform({ login: 'ana' })).toEqual({ login: 'ana' });
  });

  it('agrupa as mensagens por campo em um 422', () => {
    try {
      pipe.transform({ login: '' });
      throw new Error('deveria ter falhado');
    } catch (e) {
      const { status, corpo } = new FiltroErros().converter(e);
      expect(status).toBe(422);
      expect(corpo.campos).toEqual({ login: ['Informe o login.'] });
    }
  });
});
