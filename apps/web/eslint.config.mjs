import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';
import base from '@sii/config/eslint';

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
  { ignores: ['.next/**', 'next-env.d.ts'] },
  // Regras do Next (react, react-hooks, jsx-a11y). Vêm antes do base para que o parser
  // do typescript-eslint (do base) prevaleça sobre o do Next.
  ...compat.extends('next/core-web-vitals'),
  ...base,
];

export default config;
