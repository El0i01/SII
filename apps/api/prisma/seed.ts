/**
 * Seed de DESENVOLVIMENTO (pnpm db:seed). Só dados fictícios (CLAUDE.md: dado real nunca entra
 * no repositório, nem em fixture).
 *
 * - Um usuário por perfil, todos com a senha SEED_SENHA do .env, já trocada (sem provisória).
 * - Pessoas e um caso fictícios no esqueleto do P03, para exercitar a Row-Level Security.
 *   O gerador completo, igual ao do protótipo, entra no P05.
 *
 * Idempotente: pode rodar de novo. Recusa rodar com NODE_ENV=production.
 */
import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
import { config } from 'dotenv';
import { type Perfil, PrismaClient, type TipoEscopo } from '../src/generated/prisma/client';

config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });

// Equipamentos reais do município (dados públicos do INEP e do CadSUAS); as PESSOAS são fictícias.
const INEP_CUSTODIO = '11005165';
const INEP_PEQUENO_PRINCIPE = '11005378';
const CRAS = '11011015018';

export const USUARIOS_SEED: {
  login: string;
  nome: string;
  perfil: Perfil;
  escopos: { tipo: TipoEscopo; valor: string }[];
}[] = [
  { login: 'cti.admin', nome: 'Administração CTI (fictício)', perfil: 'ADMIN_CTI', escopos: [] },
  {
    login: 'comite.gestor',
    nome: 'Membro do Comitê (fictício)',
    perfil: 'COMITE_GESTOR',
    escopos: [],
  },
  {
    login: 'semed.gestor',
    nome: 'Coordenação SEMED (fictício)',
    perfil: 'SEMED_GESTOR',
    escopos: [],
  },
  {
    login: 'escola.custodio',
    nome: 'Secretaria escolar Dr. Custódio (fictício)',
    perfil: 'ESCOLA',
    escopos: [{ tipo: 'ESCOLA', valor: INEP_CUSTODIO }],
  },
  {
    login: 'saude.gestor',
    nome: 'Coordenação da APS (fictício)',
    perfil: 'SAUDE_GESTOR',
    escopos: [],
  },
  {
    login: 'acs.area01',
    nome: 'Agente comunitário área 01 (fictício)',
    perfil: 'ACS',
    escopos: [{ tipo: 'MICROAREA', valor: 'area01' }],
  },
  {
    login: 'cras.tecnico',
    nome: 'Técnico do CRAS (fictício)',
    perfil: 'CRAS_TECNICO',
    escopos: [{ tipo: 'CRAS', valor: CRAS }],
  },
  {
    login: 'pcf.visitador',
    nome: 'Visitador Criança Feliz (fictício)',
    perfil: 'VISITADOR_PCF',
    escopos: [{ tipo: 'FAMILIA_PCF', valor: 'PCF-001' }],
  },
  {
    login: 'fazenda.cadastro',
    nome: 'Cadastro imobiliário (fictício)',
    perfil: 'FAZENDA',
    escopos: [],
  },
  { login: 'tce.auditor', nome: 'Auditor externo (fictício)', perfil: 'AUDITOR_TCE', escopos: [] },
  { login: 'dpo.encarregado', nome: 'Encarregado de dados (fictício)', perfil: 'DPO', escopos: [] },
];

const PREFIXO = 'Fictícia ';

/** 12 pessoas: S01 tem 6 (aparece no agregado), S02 e S03 têm menos de 5 (suprimidos). */
export const PESSOAS_SEED = [
  {
    nome: 'Ana Beatriz Lima',
    setor: 'S01',
    microarea: 'area01',
    escola: INEP_CUSTODIO,
    cras: CRAS,
    pcf: null,
  },
  {
    nome: 'Bruno Carvalho Dias',
    setor: 'S01',
    microarea: 'area01',
    escola: INEP_CUSTODIO,
    cras: CRAS,
    pcf: null,
  },
  {
    nome: 'Carla Mendes Rocha',
    setor: 'S01',
    microarea: 'area01',
    escola: INEP_CUSTODIO,
    cras: CRAS,
    pcf: 'PCF-001',
  },
  {
    nome: 'Davi Nogueira Alves',
    setor: 'S01',
    microarea: 'area01',
    escola: INEP_CUSTODIO,
    cras: CRAS,
    pcf: 'PCF-001',
  },
  {
    nome: 'Elisa Prado Moura',
    setor: 'S01',
    microarea: 'area01',
    escola: null,
    cras: CRAS,
    pcf: null,
  },
  {
    nome: 'Fábio Teixeira Cunha',
    setor: 'S01',
    microarea: 'area02',
    escola: INEP_PEQUENO_PRINCIPE,
    cras: CRAS,
    pcf: null,
  },
  {
    nome: 'Gabriela Santos Pires',
    setor: 'S02',
    microarea: 'area02',
    escola: INEP_PEQUENO_PRINCIPE,
    cras: CRAS,
    pcf: 'PCF-002',
  },
  {
    nome: 'Heitor Barbosa Reis',
    setor: 'S02',
    microarea: 'area02',
    escola: null,
    cras: CRAS,
    pcf: null,
  },
  {
    nome: 'Isabela Fonseca Melo',
    setor: 'S02',
    microarea: 'area03',
    escola: null,
    cras: CRAS,
    pcf: null,
  },
  {
    nome: 'João Pedro Farias',
    setor: 'S02',
    microarea: 'area03',
    escola: null,
    cras: CRAS,
    pcf: null,
  },
  {
    nome: 'Karina Duarte Costa',
    setor: 'S03',
    microarea: 'area04',
    escola: null,
    cras: null,
    pcf: null,
  },
  {
    nome: 'Lucas Martins Ribeiro',
    setor: 'S03',
    microarea: 'area04',
    escola: null,
    cras: null,
    pcf: null,
  },
];

export async function semear(prisma: PrismaClient, senha: string): Promise<void> {
  const senhaHash = await bcrypt.hash(senha, 12);

  for (const u of USUARIOS_SEED) {
    await prisma.usuario.upsert({
      where: { login: u.login },
      create: {
        login: u.login,
        nome: u.nome,
        perfil: u.perfil,
        senhaHash,
        trocaObrigatoria: false,
        escopos: { create: u.escopos },
      },
      update: {
        nome: u.nome,
        perfil: u.perfil,
        senhaHash,
        trocaObrigatoria: false,
        senhaProvisoriaExpiraEm: null,
        falhasSeguidas: 0,
        bloqueadoAte: null,
        ativo: true,
        escopos: { deleteMany: {}, create: u.escopos },
      },
    });
  }

  // Pessoas fictícias: recria do zero (só as marcadas como fictícias).
  const antigas = await prisma.pessoaMestra.findMany({
    where: { nome: { startsWith: PREFIXO } },
    select: { id: true },
  });
  const ids = antigas.map((p) => p.id);
  await prisma.caso.deleteMany({ where: { pessoaId: { in: ids } } });
  await prisma.pessoaMestra.deleteMany({ where: { id: { in: ids } } });

  for (const p of PESSOAS_SEED) {
    await prisma.pessoaMestra.create({
      data: {
        nome: PREFIXO + p.nome,
        setorCodigo: p.setor,
        microarea: p.microarea,
        escolaInep: p.escola,
        crasCodigo: p.cras,
        familiaPcf: p.pcf,
      },
    });
  }

  // Um caso de infrequência de aluno da Pequeno Príncipe: a escola Dr. Custódio não pode vê-lo.
  const fabio = await prisma.pessoaMestra.findFirstOrThrow({
    where: { nome: PREFIXO + 'Fábio Teixeira Cunha' },
  });
  await prisma.caso.create({
    data: {
      tipo: 'INFREQUENCIA',
      pessoaId: fabio.id,
      secretariaResponsavel: 'ASSISTENCIA',
      status: 'NOVA',
    },
  });
}

async function principal() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('O seed de desenvolvimento não roda em produção.');
  }
  const senha = process.env.SEED_SENHA;
  if (!senha || senha.length < 10) {
    throw new Error('Defina SEED_SENHA (10+ caracteres) no .env da raiz.');
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Defina DATABASE_URL no .env da raiz.');

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    await semear(prisma, senha);
    console.warn(
      `Seed ok: ${USUARIOS_SEED.length} usuários (senha = SEED_SENHA do .env) e ${PESSOAS_SEED.length} pessoas fictícias.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  principal().catch((erro: Error) => {
    console.error(erro.message);
    process.exit(1);
  });
}
