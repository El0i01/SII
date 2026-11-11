/**
 * Ligação do protótipo (nomes inventados) com o cadastro real de equipamentos (ESPECIFICACAO §3.1.2).
 * Decisão de 11/11/2026: o seed usa os equipamentos reais; as PESSOAS continuam fictícias.
 * Trocar o nome não muda nenhum sorteio, então os números dos painéis seguem iguais ao protótipo.
 */
import type { CodigoSetor } from './gerador';

export const CRAS_CADSUAS = '11011015018';
export const UBS_JACIR_BONI = '7327862';

/** Escola do protótipo → INEP real. */
export const INEP_POR_ESCOLA_PROTOTIPO: Record<string, string> = {
  'Creche Municipal Sementinha': '11048395', // Creche Municipal Pequeninos de Cristo
  'EMEIEF Pequeno Ipê': '11005378', // EMEI Pequeno Príncipe
  'EMEF Castanheira': '11005165', // EMEF Dr. Custódio
  'EMEF Rio Jamari': '11005300', // EMEIEF Sossego da Mamãe
  'EMEF Linha 45 (rural)': '11005122', // EMEIEF Cecília Meireles (rural)
  'Rede estadual': '11005360', // EEEFM Paulo Freire
};

export interface EquipamentoSeed {
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

/** Microárea de quem mora numa quadra da sede. S03 é o maior setor: metade das quadras é a área 06. */
export function microareaDaQuadra(
  setor: CodigoSetor,
  idxNoSetor: number,
  totalNoSetor: number,
): string {
  if (setor === 'S03') return idxNoSetor < totalNoSetor / 2 ? 'area03' : 'area06';
  return `area0${setor.slice(2)}`;
}

export const STATUS_BUSCA_ATIVA: Record<string, string> = {
  Identificado: 'IDENTIFICADO',
  Encaminhado: 'ENCAMINHADO',
  'Visita realizada': 'VISITA_REALIZADA',
  Matriculado: 'MATRICULADO',
  'Não localizado': 'NAO_LOCALIZADO',
};

export const SECRETARIA_POR_RESP: Record<string, string> = {
  SEMED: 'SEMED',
  'Assistência Social': 'ASSISTENCIA',
  'Saúde (ACS)': 'SEMSAU',
};

export const STATUS_NOTIFICACAO: Record<string, 'NOVA' | 'EM_ANALISE' | 'PARECER_EMITIDO'> = {
  Nova: 'NOVA',
  'Em análise': 'EM_ANALISE',
  'Parecer emitido': 'PARECER_EMITIDO',
};

export const DESFECHO_POR_ROTULO: Record<string, string> = {
  'Retorno à escola combinado': 'RETORNO_ESCOLA_COMBINADO',
  'Encaminhado à SEMED (transporte)': 'ENCAMINHADO_SEMED_TRANSPORTE',
  'Ausência justificada (saúde)': 'AUSENCIA_JUSTIFICADA_SAUDE',
  'Encaminhado ao CREAS': 'ENCAMINHADO_CREAS',
  'Encaminhado ao Conselho Tutelar': 'ENCAMINHADO_CONSELHO_TUTELAR',
  'Família não localizada': 'FAMILIA_NAO_LOCALIZADA',
};

export const SITUACAO_LOTE: Record<
  string,
  'REGULAR' | 'REURB_EM_ANALISE' | 'SEM_INSCRICAO' | 'VAZIO'
> = {
  Regular: 'REGULAR',
  'Reurb em análise': 'REURB_EM_ANALISE',
  'Sem inscrição': 'SEM_INSCRICAO',
  Vazio: 'VAZIO',
};

/** Fonte do ponto do domicílio por setor, em % (tabela GEO do protótipo). */
export const FONTES_GEO_POR_SETOR: Record<CodigoSetor, number[]> = {
  S01: [61, 25, 6, 5, 0, 3],
  S02: [55, 26, 8, 7, 0, 4],
  S03: [38, 26, 12, 15, 0, 9],
  S04: [50, 27, 9, 9, 0, 5],
  S05: [44, 26, 11, 12, 0, 7],
  RUR: [29, 0, 14, 22, 26, 9],
};
export const ORDEM_FONTES_GEO = [
  'CENSO_GPS',
  'LOTE',
  'ESUS_TERRITORIO',
  'CNEFE',
  'SIGEF_CAR',
  'SETOR',
] as const;
/** Precisão fictícia do seed (só Censo, lote e e-SUS têm número na especificação). */
export const PRECISAO_SEED_M: Record<(typeof ORDEM_FONTES_GEO)[number], number> = {
  CENSO_GPS: 5,
  LOTE: 10,
  ESUS_TERRITORIO: 30,
  CNEFE: 50,
  SIGEF_CAR: 200,
  SETOR: 800,
};

/**
 * Feriados nacionais e estaduais (RO) de 2026, usados na contagem de dias úteis dos prazos.
 * Feriado municipal: a SEMED inclui pela configuração do calendário (decisão de 11/11/2026).
 */
export const FERIADOS_2026 = [
  '2026-01-01',
  '2026-01-04',
  '2026-02-16',
  '2026-02-17',
  '2026-04-03',
  '2026-04-21',
  '2026-05-01',
  '2026-06-04',
  '2026-06-18',
  '2026-09-07',
  '2026-10-12',
  '2026-11-02',
  '2026-11-15',
  '2026-11-20',
  '2026-12-25',
];
/**
 * Calendário inicial de 2026 que o seed grava para todas as escolas. É só o ponto de partida: a
 * SEMED ajusta por escola ou por rede (PUT /escolas/:inep/calendario/:ano, PUT /calendarios/:ano).
 */
export const PARAMETROS_CALENDARIO_2026 = {
  inicio: '2026-02-09',
  fim: '2026-12-18',
  recessos: [{ inicio: '2026-07-06', fim: '2026-07-24' }],
  feriados: FERIADOS_2026,
  letivosExtras: [] as string[],
};
