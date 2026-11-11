import { z } from 'zod';

/** Variáveis de ambiente da API. Falta ou formato errado: a API não sobe. */
export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORTA: z.coerce.number().int().min(1).max(65535).default(3333),
  WEB_ORIGEM: z.url().default('http://localhost:3000'),
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, 'precisa começar com postgresql://'),
  REDIS_URL: z.string().regex(/^rediss?:\/\//, 'precisa começar com redis://'),
  JWT_SEGREDO: z.string().min(32, 'precisa ter pelo menos 32 caracteres'),
  REFRESH_HORAS_WEB: z.coerce
    .number()
    .int()
    .min(1)
    .max(24 * 30)
    .default(12),
  REFRESH_DIAS_MOBILE: z.coerce.number().int().min(1).max(90).default(7),
  LOGIN_LIMITE_POR_MINUTO: z.coerce.number().int().min(1).max(1000).default(10),
});

export type Env = z.infer<typeof EnvSchema>;

/**
 * Valida o ambiente para o ConfigModule. A mensagem cita só o nome da variável e o problema,
 * nunca o valor (que pode conter senha).
 */
export function validarEnv(bruto: Record<string, unknown>): Env {
  const resultado = EnvSchema.safeParse(bruto);
  if (!resultado.success) {
    const problemas = resultado.error.issues
      .map((i) => `- ${i.path.join('.') || '(raiz)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Variáveis de ambiente inválidas (confira o .env da raiz):\n${problemas}`);
  }
  return resultado.data;
}
