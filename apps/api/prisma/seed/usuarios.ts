/** Usuários fictícios de desenvolvimento: um por perfil, todos com a senha SEED_SENHA do .env. */
import bcrypt from 'bcryptjs';
import type { Perfil, PrismaClient, TipoEscopo } from '../../src/generated/prisma/client';

const INEP_CUSTODIO = '11005165';
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
    login: 'assistencia.gestor',
    nome: 'Ponto focal do CadÚnico, Assistência Social (fictício)',
    perfil: 'ASSISTENCIA_GESTOR',
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

export async function semearUsuarios(prisma: PrismaClient, senha: string): Promise<void> {
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
}
