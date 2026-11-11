// Configuração ESLint compartilhada (flat config). Cada app importa e acrescenta o que precisar.
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export const ignorados = {
  ignores: ['**/dist/**', '**/.next/**', '**/.expo/**', '**/coverage/**', '**/*.d.ts'],
};

/** @type {import('typescript-eslint').ConfigArray} */
export const base = tseslint.config(
  ignorados,
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
    },
  },
  prettier,
);

export default base;
