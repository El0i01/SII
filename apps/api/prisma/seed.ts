/**
 * Seed de DESENVOLVIMENTO (pnpm db:seed). Só dados fictícios (CLAUDE.md: dado real de pessoa nunca
 * entra no repositório). Os equipamentos (escolas, UBS, CRAS) são o cadastro público real.
 *
 * - 11 usuários, um por perfil (senha = SEED_SENHA do .env).
 * - O gerador do protótipo, com as mesmas sementes: os números batem com docs/prototipo/index.html.
 *
 * Idempotente. Recusa rodar em produção ou num banco com pessoas que não vieram do seed.
 */
import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';
import { chaveDeHex } from '../src/cripto/cifra';
import { PrismaClient } from '../src/generated/prisma/client';
import { semearPrototipo } from './seed/prototipo/persistir';
import { semearUsuarios } from './seed/usuarios';

config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });

async function principal() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('O seed de desenvolvimento não roda em produção.');
  }
  const senha = process.env.SEED_SENHA;
  if (!senha || senha.length < 10)
    throw new Error('Defina SEED_SENHA (10+ caracteres) no .env da raiz.');
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Defina DATABASE_URL no .env da raiz.');
  const chaves = {
    cifra: chaveDeHex(process.env.CHAVE_CIFRA ?? '', 'CHAVE_CIFRA'),
    hmac: chaveDeHex(process.env.CHAVE_HMAC ?? '', 'CHAVE_HMAC'),
  };

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const inicio = Date.now();
    await semearUsuarios(prisma, senha);
    const r = await semearPrototipo(prisma, chaves);
    console.warn(
      `Seed ok em ${((Date.now() - inicio) / 1000).toFixed(1)} s: 11 usuários; ${r.pessoas} pessoas ` +
        `(${r.criancas} crianças, ${r.idosos} idosos, ${r.casosBuscaAtiva} casos de busca ativa e responsáveis); ` +
        `${r.notificacoes} notificações; ${r.eventos} eventos de trilha; ${r.frequencias} lançamentos de frequência.` +
        (r.cpfsDuplicadosTrocados
          ? ` ${r.cpfsDuplicadosTrocados} CPF(s) sorteados em duplicidade foram trocados.`
          : ''),
    );
  } finally {
    await prisma.$disconnect();
  }
}

principal().catch((erro: Error) => {
  console.error(erro.message);
  process.exit(1);
});
