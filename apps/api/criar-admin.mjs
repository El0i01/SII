import fs from 'node:fs';
import bcrypt from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './dist/generated/prisma/client.js';

async function criar() {
  const senha = fs.readFileSync(0, 'utf8').trim();
  if (senha.length < 24) throw new Error('Informe uma senha temporária forte pela entrada padrão.');
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  try {
    const senhaHash = await bcrypt.hash(senha, 12);
    const criado = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`LOCK TABLE acesso.usuario IN SHARE ROW EXCLUSIVE MODE`;
      if (await tx.usuario.findFirst({ where: { perfil: 'ADMIN_CTI' }, select: { id: true } })) {
        return false;
      }
      await tx.usuario.create({
        data: {
          login: 'cti.admin',
          nome: 'Administração CTI',
          perfil: 'ADMIN_CTI',
          senhaHash,
          trocaObrigatoria: true,
          senhaProvisoriaExpiraEm: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
      return true;
    });
    process.stdout.write(criado ? 'Primeiro administrador criado.\n' : 'Já existe um administrador.\n');
  } finally {
    await prisma.$disconnect();
  }
}

criar().catch(() => {
  console.error('Falha ao preparar o primeiro administrador.');
  process.exitCode = 1;
});
