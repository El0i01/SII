// Testes do app de campo (jest-expo): src/**/*.test.ts(x)
module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/src/**/*.test.{ts,tsx}'],
  testPathIgnorePatterns: ['/node_modules/', '/.expo/'],
};
