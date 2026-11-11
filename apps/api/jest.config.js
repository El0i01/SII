// Testes unitários: src/**/*.spec.ts e prisma/**/*.spec.ts (porte do gerador do seed)
module.exports = {
  rootDir: '.',
  roots: ['<rootDir>/src', '<rootDir>/prisma'],
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }] },
  moduleFileExtensions: ['ts', 'js', 'json'],
  testEnvironment: 'node',
};
