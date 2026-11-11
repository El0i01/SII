import { PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { erros } from './erros';

/**
 * Valida o corpo com o schema zod do @sii/shared (o mesmo dos formulários web e mobile).
 * Erro vira 422 com as mensagens agrupadas por campo.
 */
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(valor: unknown): T {
    const resultado = this.schema.safeParse(valor);
    if (resultado.success) return resultado.data;

    const campos: Record<string, string[]> = {};
    for (const problema of resultado.error.issues) {
      const chave = problema.path.join('.') || '_';
      (campos[chave] ??= []).push(problema.message);
    }
    throw erros.validacao(campos);
  }
}
