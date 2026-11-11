import { z } from 'zod';
import { Perfil } from '../enums/perfil';

export const SENHA_MINIMA = 10;

/** Dimensões do ABAC (ESPECIFICACAO.md §2): por onde o acesso de um usuário é recortado. */
export const TIPOS_ESCOPO = [
  'SECRETARIA',
  'SETOR',
  'ESCOLA',
  'MICROAREA',
  'CRAS',
  'FAMILIA_PCF',
] as const;
export const TipoEscopo = z.enum(TIPOS_ESCOPO);
export type TipoEscopo = z.infer<typeof TipoEscopo>;

/**
 * Perfis que veem as pessoas do município inteiro (decisão de 11/11/2026). Cada um recebe só os
 * campos da própria secretaria: o recorte de campos é feito nos DTOs da API, não aqui.
 */
export const PERFIS_MUNICIPIO: readonly Perfil[] = [
  'ADMIN_CTI',
  'COMITE_GESTOR',
  'SEMED_GESTOR',
  'SAUDE_GESTOR',
];

export function veMunicipio(perfil: Perfil): boolean {
  return PERFIS_MUNICIPIO.includes(perfil);
}

/** Perfis de atendimento local: sem o escopo correspondente, não enxergam ninguém. */
export const ESCOPO_OBRIGATORIO: Partial<Record<Perfil, TipoEscopo>> = {
  ESCOLA: 'ESCOLA',
  ACS: 'MICROAREA',
  CRAS_TECNICO: 'CRAS',
  VISITADOR_PCF: 'FAMILIA_PCF',
};

const loginNormalizado = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Informe o login.')
  .max(60, 'O login tem no máximo 60 caracteres.');

export const Login = z.object({
  login: loginNormalizado,
  senha: z.string().min(1, 'Informe a senha.').max(200),
});
export type Login = z.infer<typeof Login>;

export const TrocarSenha = z
  .object({
    senhaAtual: z.string().min(1, 'Informe a senha atual.').max(200),
    senhaNova: z
      .string()
      .min(SENHA_MINIMA, `A senha nova precisa ter pelo menos ${SENHA_MINIMA} caracteres.`)
      .max(200),
  })
  .refine((d) => d.senhaNova !== d.senhaAtual, {
    path: ['senhaNova'],
    message: 'A senha nova precisa ser diferente da atual.',
  });
export type TrocarSenha = z.infer<typeof TrocarSenha>;

export const Escopo = z.object({
  tipo: TipoEscopo,
  valor: z.string().trim().min(1).max(40),
});
export type Escopo = z.infer<typeof Escopo>;

export const CriarUsuario = z
  .object({
    login: loginNormalizado.regex(
      /^[a-z0-9._-]+$/,
      'Use só letras sem acento, números, ponto, hífen ou sublinhado.',
    ),
    nome: z.string().trim().min(3, 'Informe o nome completo.').max(120),
    perfil: Perfil,
    escopos: z.array(Escopo).max(50).default([]),
  })
  .superRefine((d, ctx) => {
    const exigido = ESCOPO_OBRIGATORIO[d.perfil];
    if (exigido && !d.escopos.some((e) => e.tipo === exigido)) {
      ctx.addIssue({
        code: 'custom',
        path: ['escopos'],
        message: `O perfil ${d.perfil} precisa de pelo menos um escopo do tipo ${exigido}.`,
      });
    }
  });
export type CriarUsuario = z.infer<typeof CriarUsuario>;
