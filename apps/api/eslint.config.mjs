import base from '@sii/config/eslint';

export default [
  { ignores: ['src/generated/**'] },
  ...base,
  {
    // Os decorators do Nest precisam dos tipos em runtime (emitDecoratorMetadata):
    // `import type` quebraria a injeção de dependência.
    rules: { '@typescript-eslint/consistent-type-imports': 'off' },
  },
];
