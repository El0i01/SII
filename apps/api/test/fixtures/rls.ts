/**
 * Fixture pequena e fixa dos testes de RLS (P03): 12 pessoas fictícias e 1 caso, com contagens
 * conhecidas por perfil. Independente do seed grande do protótipo.
 */
import { randomBytes } from 'node:crypto';
import { protegerDocumento } from '../../src/cripto/cifra';
import type { PrismaClient } from '../../src/generated/prisma/client';
import { normalizarNome } from '../../prisma/seed/prototipo/complementos';
import { limparDadosFicticios } from '../../prisma/seed/prototipo/persistir';
import { semearUsuarios } from '../../prisma/seed/usuarios';

const CUSTODIO = '11005165';
const PEQUENO_PRINCIPE = '11005378';
const CRAS = '11011015018';

/** S01 tem 6 (aparece no agregado); S02 e S03 têm menos de 5 (suprimidos). */
export const PESSOAS_FIXTURE = [
  {
    nome: 'Ana Beatriz Lima',
    setor: 'S01',
    microarea: 'area01',
    escola: CUSTODIO,
    cras: CRAS,
    pcf: null,
  },
  {
    nome: 'Bruno Carvalho Dias',
    setor: 'S01',
    microarea: 'area01',
    escola: CUSTODIO,
    cras: CRAS,
    pcf: null,
  },
  {
    nome: 'Carla Mendes Rocha',
    setor: 'S01',
    microarea: 'area01',
    escola: CUSTODIO,
    cras: CRAS,
    pcf: 'PCF-001',
  },
  {
    nome: 'Davi Nogueira Alves',
    setor: 'S01',
    microarea: 'area01',
    escola: CUSTODIO,
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
    escola: PEQUENO_PRINCIPE,
    cras: CRAS,
    pcf: null,
  },
  {
    nome: 'Gabriela Santos Pires',
    setor: 'S02',
    microarea: 'area02',
    escola: PEQUENO_PRINCIPE,
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

export async function semearFixtureRls(prisma: PrismaClient, senha: string): Promise<void> {
  const chaves = { cifra: randomBytes(32), hmac: randomBytes(32) };
  await prisma.$transaction(async (tx) => {
    await limparDadosFicticios(tx);
    for (const [i, p] of PESSOAS_FIXTURE.entries()) {
      const cpf = protegerDocumento('CPF', String(10_000_000_000 + i), chaves);
      const pessoa = await tx.pessoaMestra.create({
        data: {
          nome: `Fictícia ${p.nome}`,
          nomeNormalizado: normalizarNome(`Fictícia ${p.nome}`),
          cpfCifrado: new Uint8Array(cpf.cifrado),
          cpfHash: new Uint8Array(cpf.hash),
          setorCodigo: p.setor,
          microarea: p.microarea,
          escolaInep: p.escola,
          crasCodigo: p.cras,
          familiaPcf: p.pcf,
        },
      });
      await tx.vinculoFonte.create({
        data: {
          pessoaId: pessoa.id,
          fonte: 'CENSO',
          idExterno: `FIX-${i}`,
          regra: 'SEED',
          confianca: 1,
        },
      });
      // Um caso de infrequência de aluno da Pequeno Príncipe: a escola Dr. Custódio não pode vê-lo.
      if (p.nome.startsWith('Fábio')) {
        await tx.caso.create({
          data: {
            codigo: 'IF-FIX-0001',
            tipo: 'INFREQUENCIA',
            pessoaId: pessoa.id,
            secretariaResponsavel: 'ASSISTENCIA',
            status: 'NOVA',
          },
        });
      }
    }
  });
  await semearUsuarios(prisma, senha);
}
