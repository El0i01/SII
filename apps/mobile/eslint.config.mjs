import base from '@sii/config/eslint';

const config = [
  { ignores: ['.expo/**', 'android/**', 'ios/**', 'expo-env.d.ts', 'jest.config.js'] },
  ...base,
];

export default config;
