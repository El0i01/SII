/**
 * Cadastro de REFERÊNCIA (dado público real): setores, equipamentos (INEP, CNES, CadSUAS) e áreas
 * de referência. Usado pelo seed e pela carga do geoportal (pnpm geo:carregar). É gravado por
 * upsert pela chave estável (`codigo`, `inep`, `tipo + codigo`), nunca apagado e recriado, para não
 * perder a geometria carregada do geoportal. Fonte: ESPECIFICACAO §3.1.2.
 */
import type { Prisma } from '../../src/generated/prisma/client';

export const CRAS_CADSUAS = '11011015018';
export const UBS_JACIR_BONI = '7327862';

export interface EquipamentoSeed {
  /** Chave estável, gravada em equipamento.codigo. */
  chave: string;
  tipo: 'ESCOLA' | 'SAUDE' | 'ASSISTENCIA' | 'OUTRO';
  nome: string;
  inep?: string;
  cnes?: string;
  cadsuas?: string;
  endereco?: string;
  principal?: string;
  escola?: { rede: 'MUNICIPAL' | 'ESTADUAL'; rural: boolean };
}

/** Cadastro real (público) de equipamentos: INEP, CNES e CadSUAS informados pelas secretarias. */
export const EQUIPAMENTOS: EquipamentoSeed[] = [
  {
    chave: 'CRECHE',
    tipo: 'ESCOLA',
    nome: 'Creche Municipal Pequeninos de Cristo',
    inep: '11048395',
    endereco: 'Rua Ana Ferreira esq. c/ Presidente Médici, s/n',
    escola: { rede: 'MUNICIPAL', rural: false },
  },
  {
    chave: 'CUST',
    tipo: 'ESCOLA',
    nome: 'EMEF Dr. Custódio',
    inep: '11005165',
    endereco: 'Av. Costa e Silva, 2166, Centro',
    escola: { rede: 'MUNICIPAL', rural: false },
  },
  {
    chave: 'PEQ',
    tipo: 'ESCOLA',
    nome: 'EMEI Pequeno Príncipe',
    inep: '11005378',
    endereco: 'Av. Costa e Silva, 2166, Centro',
    escola: { rede: 'MUNICIPAL', rural: false },
  },
  {
    chave: 'SOG',
    tipo: 'ESCOLA',
    nome: 'EMEIEF Sossego da Mamãe',
    inep: '11005300',
    endereco: 'Rua Senador Olavo Pires, 1367',
    escola: { rede: 'MUNICIPAL', rural: false },
  },
  {
    chave: 'CECILIA',
    tipo: 'ESCOLA',
    nome: 'EMEIEF Cecília Meireles',
    inep: '11005122',
    endereco: 'Linha B-40-A, km 10, zona rural',
    escola: { rede: 'MUNICIPAL', rural: true },
  },
  {
    chave: 'JOAO_FRANCISCO',
    tipo: 'ESCOLA',
    nome: 'EEEF João Francisco Correia',
    inep: '11040882',
    endereco: 'Rua Senador Olavo Pires, 1363',
    escola: { rede: 'ESTADUAL', rural: false },
  },
  {
    chave: 'PAULO_FREIRE',
    tipo: 'ESCOLA',
    nome: 'EEEFM Paulo Freire',
    inep: '11005360',
    endereco: 'Av. Ayrton Senna, 1655',
    escola: { rede: 'ESTADUAL', rural: false },
  },
  { chave: 'AN_CUST', tipo: 'ESCOLA', nome: 'Anexo da EMEF Dr. Custódio', principal: 'CUST' },
  {
    chave: 'NOVO_PEQ',
    tipo: 'ESCOLA',
    nome: 'Prédio novo da EMEI Pequeno Príncipe',
    principal: 'PEQ',
  },
  { chave: 'HPP', tipo: 'SAUDE', nome: 'Hospital de Pequeno Porte José Baioco', cnes: '4002768' },
  { chave: 'UBS1', tipo: 'SAUDE', nome: 'UBS Edson Cavalheiro', cnes: '2806509' },
  { chave: 'UBS4', tipo: 'SAUDE', nome: 'UBS Jacir Boni', cnes: UBS_JACIR_BONI },
  { chave: 'ALMO', tipo: 'SAUDE', nome: 'Almoxarifado da Saúde' },
  { chave: 'VISA', tipo: 'SAUDE', nome: 'Vigilância Sanitária', cnes: '7121237' },
  {
    chave: 'VIGEP',
    tipo: 'SAUDE',
    nome: 'Unidade de Vigilância Epidemiológica e Endemias',
    cnes: '7346050',
  },
  { chave: 'FARMACIA', tipo: 'SAUDE', nome: 'Farmácia Básica Municipal', cnes: '0392553' },
  {
    chave: 'APAE',
    tipo: 'OUTRO',
    nome: 'APAE Itapuã (também Centro-Dia)',
    cnes: '2899418',
    cadsuas: '1101103503753',
  },
  {
    chave: 'CRAS',
    tipo: 'ASSISTENCIA',
    nome: 'CRAS · Centro de Referência de Assistência Social',
    cadsuas: CRAS_CADSUAS,
    endereco: 'Rua Maria Vitaliano de Souza, 1940, Centro',
  },
  {
    chave: 'CREAS',
    tipo: 'ASSISTENCIA',
    nome: 'CREAS · Centro de Referência Especializado de Assistência Social',
    cadsuas: '11101102797',
    endereco: 'Rua Moisés de Freitas, 2476, Centro',
  },
  { chave: 'CT', tipo: 'ASSISTENCIA', nome: 'Conselho Tutelar' },
];

/** Microáreas do geoportal (MalhaACS), todas da UBS Jacir Boni (SEMSAU, 11/11/2026). */
export const MICROAREAS_SEDE = ['area01', 'area02', 'area03', 'area04', 'area05', 'area06'];
export const MICROAREAS_RURAIS = [
  'urb1',
  'urb2',
  'urb3',
  'urb4',
  'urb6',
  'urb8',
  'urb9',
  'urb10',
  'urb11',
  'urb12',
  'urb13',
  'urb14',
  'urb16',
];

/** Setores do cadastro: os 5 urbanos e o industrial (geoportal) e a zona rural (o resto do município). */
export const SETORES_CADASTRO = [
  { codigo: 'S01', nome: 'Setor 01', tipo: 'URBANO' as const, arquivo: 'setor1' },
  { codigo: 'S02', nome: 'Setor 02', tipo: 'URBANO' as const, arquivo: 'setor2' },
  { codigo: 'S03', nome: 'Setor 03', tipo: 'URBANO' as const, arquivo: 'setor3' },
  { codigo: 'S04', nome: 'Setor 04', tipo: 'URBANO' as const, arquivo: 'setor4' },
  { codigo: 'S05', nome: 'Setor 05', tipo: 'URBANO' as const, arquivo: 'setor5' },
  { codigo: 'SIND', nome: 'Setor Industrial', tipo: 'URBANO' as const, arquivo: 'industrial' },
  { codigo: 'RUR', nome: 'Zona rural', tipo: 'RURAL' as const, arquivo: null },
];

export interface IdsCadastro {
  setor: Map<string, number>;
  equipamento: Map<string, number>;
  escola: Map<string, number>;
}

/** Garante o cadastro de referência (upsert). Não toca na geometria. */
export async function garantirCadastro(tx: Prisma.TransactionClient): Promise<IdsCadastro> {
  const setor = new Map<string, number>();
  for (const s of SETORES_CADASTRO) {
    const r = await tx.setor.upsert({
      where: { codigo: s.codigo },
      create: { codigo: s.codigo, nome: s.nome, tipo: s.tipo },
      update: { nome: s.nome, tipo: s.tipo },
      select: { id: true },
    });
    setor.set(s.codigo, r.id);
  }

  const equipamento = new Map<string, number>();
  for (const e of EQUIPAMENTOS) {
    const dados = {
      tipo: e.tipo,
      nome: e.nome,
      codigoInep: e.inep ?? null,
      codigoCnes: e.cnes ?? null,
      codigoCadsuas: e.cadsuas ?? null,
      endereco: e.endereco ?? null,
      principalId: e.principal ? (equipamento.get(e.principal) ?? null) : null,
    };
    // Adota a linha que já existir (criada antes de haver `codigo`): por código, INEP, CNES,
    // CadSUAS ou nome. Assim a geometria do geoportal, se já carregada, é preservada.
    const existente = await tx.equipamento.findFirst({
      where: {
        OR: [
          { codigo: e.chave },
          ...(e.inep ? [{ codigoInep: e.inep }] : []),
          ...(e.cnes ? [{ codigoCnes: e.cnes }] : []),
          ...(e.cadsuas ? [{ codigoCadsuas: e.cadsuas }] : []),
          { nome: e.nome, codigo: null },
        ],
      },
      select: { id: true },
    });
    const r = existente
      ? await tx.equipamento.update({
          where: { id: existente.id },
          data: { codigo: e.chave, ...dados },
          select: { id: true },
        })
      : await tx.equipamento.create({ data: { codigo: e.chave, ...dados }, select: { id: true } });
    equipamento.set(e.chave, r.id);
  }

  const escola = new Map<string, number>();
  for (const e of EQUIPAMENTOS.filter((x) => x.escola && x.inep)) {
    const dados = {
      nome: e.nome,
      rede: e.escola?.rede ?? ('MUNICIPAL' as const),
      rural: e.escola?.rural ?? false,
      equipamentoId: equipamento.get(e.chave) as number,
    };
    const r = await tx.escola.upsert({
      where: { inep: e.inep as string },
      create: { inep: e.inep as string, ...dados },
      update: dados,
      select: { id: true },
    });
    escola.set(e.inep as string, r.id);
  }

  const areas = [
    ...[...MICROAREAS_SEDE, ...MICROAREAS_RURAIS].map((codigo) => ({
      tipo: 'MICROAREA' as const,
      codigo,
      nome: `Microárea ${codigo}`,
      equipamentoId: equipamento.get('UBS4') as number,
    })),
    {
      tipo: 'TERRITORIO_CRAS' as const,
      codigo: CRAS_CADSUAS,
      nome: 'Território do CRAS (município inteiro)',
      equipamentoId: equipamento.get('CRAS') as number,
    },
  ];
  for (const a of areas) {
    await tx.areaReferencia.upsert({
      where: { tipo_codigo: { tipo: a.tipo, codigo: a.codigo } },
      create: a,
      update: { nome: a.nome, equipamentoId: a.equipamentoId },
    });
  }
  return { setor, equipamento, escola };
}
