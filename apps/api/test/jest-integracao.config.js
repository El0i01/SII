// Testes contra a infra real (pnpm infra:up). Fora do `pnpm test`: rode `pnpm --filter @sii/api test:integracao`.
module.exports = {
  rootDir: '.',
  testRegex: '.*\\.integracao-spec\\.ts$',
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.json' }] },
  moduleFileExtensions: ['ts', 'js', 'json'],
  testEnvironment: 'node',
};
