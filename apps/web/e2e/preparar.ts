import { execFileSync } from 'node:child_process';
import { DADOS, envTeste, RAIZ } from './ambiente';

/** Global setup: banco de teste semeado e aluno escolhido (apps/api/test/e2e-preparar.ts). */
export default function preparar() {
  execFileSync('pnpm', ['--filter', '@sii/api', 'exec', 'tsx', 'test/e2e-preparar.ts', DADOS], {
    cwd: RAIZ,
    env: envTeste(),
    stdio: 'inherit',
  });
}
