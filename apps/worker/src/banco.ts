import { PrismaPg } from '@prisma/adapter-pg';
// Mesmo cliente Prisma da API (CLAUDE.md: "mesmo Prisma da API"). Ver ADR 0007.
import { PrismaClient } from '../../api/src/generated/prisma/client';

export type { Prisma } from '../../api/src/generated/prisma/client';
export { PrismaClient };

export function criarPrisma(url: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}
