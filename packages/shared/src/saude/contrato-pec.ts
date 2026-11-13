import { z } from 'zod';

/**
 * Contrato de estrutura do e-SUS APS PEC (P09, ADR 0008): o que o conector lê, com o nome lógico
 * usado no código e o nome físico no banco do PEC. Os nomes físicos ficam num arquivo de
 * configuração do worker, porque mudam com a versão do PEC e ainda estão "a confirmar".
 *
 * Antes de cada carga o conector confere se tudo isto existe. Se faltar algo (atualização do PEC),
 * a carga falha visível e nada é gravado.
 */

/** Só identificador simples em minúsculas: o nome entra numa consulta SQL (entre aspas). */
const Identificador = z
  .string()
  .regex(/^[a-z_][a-z0-9_]*$/, 'use só letras minúsculas, números e _ (identificador simples)');

/** Colunas lógicas de cada tabela. Nada de CID, CIAP ou diagnóstico aqui. */
export const COLUNAS_PEC = {
  cidadao: ['id', 'nome', 'mae', 'nascimento', 'sexo', 'cpf', 'cns', 'ativo', 'atualizado'],
  fatCidadao: ['id', 'cidadao'],
  cadIndividual: [
    'fatCidadao',
    'tempo',
    'microarea',
    'unidade',
    'profissional',
    'gestante',
    'acamado',
    'domiciliado',
  ],
  cadDomiciliar: ['id', 'tempo', 'microarea', 'unidade', 'latitude', 'longitude'],
  visita: ['fatCidadao', 'tempo', 'profissional'],
  atendimento: ['fatCidadao', 'tempo'],
  vacinacao: ['fatCidadao', 'tempo', 'imunobiologico'],
  unidade: ['id', 'cnes'],
  profissional: ['id', 'nome'],
} as const;

export type TabelaPec = keyof typeof COLUNAS_PEC;
export const TABELAS_PEC = Object.keys(COLUNAS_PEC) as TabelaPec[];

type ColunasDe<T extends TabelaPec> = (typeof COLUNAS_PEC)[T][number];
export interface MapaTabela<T extends TabelaPec> {
  tabela: string;
  colunas: Record<ColunasDe<T>, string>;
}

function schemaTabela<T extends TabelaPec>(t: T) {
  const colunas = Object.fromEntries(COLUNAS_PEC[t].map((c) => [c, Identificador]));
  return z.object({
    tabela: Identificador,
    colunas: z.object(colunas).strict(),
  }) as unknown as z.ZodType<MapaTabela<T>>;
}

export const ContratoPec = z.object({
  /** Versão do PEC em que os nomes foram conferidos. */
  versaoTestada: z.string().min(1),
  tabelas: z.object({
    cidadao: schemaTabela('cidadao'),
    fatCidadao: schemaTabela('fatCidadao'),
    cadIndividual: schemaTabela('cadIndividual'),
    cadDomiciliar: schemaTabela('cadDomiciliar'),
    visita: schemaTabela('visita'),
    atendimento: schemaTabela('atendimento'),
    vacinacao: schemaTabela('vacinacao'),
    unidade: schemaTabela('unidade'),
    profissional: schemaTabela('profissional'),
  }),
  /**
   * Colunas do cadastro individual que marcam condição crônica (hipertensão, diabetes…). Saem do
   * PEC já combinadas num único booleano: qual condição a pessoa tem nunca chega ao SII.
   */
  colunasCronicas: z.array(Identificador).min(1),
  /** Códigos do imunobiológico da vacina da gripe (influenza) no PEC. */
  imunobiologicosGripe: z.array(z.string().min(1)).min(1),
});
export type ContratoPec = z.infer<typeof ContratoPec>;

/** Tabela física → colunas físicas que o conector usa. */
export function colunasDoContrato(c: ContratoPec): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const t of TABELAS_PEC) {
    const mapa = c.tabelas[t] as MapaTabela<TabelaPec>;
    const cols = Object.values(mapa.colunas) as string[];
    if (t === 'cadIndividual') cols.push(...c.colunasCronicas);
    m.set(mapa.tabela, cols);
  }
  return m;
}

/** Compara o contrato com a estrutura lida do `information_schema` do PEC. */
export function verificarEstrutura(
  c: ContratoPec,
  encontradas: ReadonlyMap<string, ReadonlySet<string>>,
): { faltando: string[] } {
  const faltando: string[] = [];
  for (const [tabela, colunas] of colunasDoContrato(c)) {
    const achadas = encontradas.get(tabela);
    if (!achadas) {
      faltando.push(`${tabela} (tabela inteira)`);
      continue;
    }
    for (const col of colunas) if (!achadas.has(col)) faltando.push(`${tabela}.${col}`);
  }
  return { faltando };
}

const MAXIMO_NA_MENSAGEM = 10;

/** Mensagem da carga que falhou por mudança de estrutura. Só nomes de tabela e coluna. */
export function mensagemEstruturaMudou(faltando: readonly string[]): string {
  const lista = faltando.slice(0, MAXIMO_NA_MENSAGEM).join(', ');
  const resto = faltando.length - MAXIMO_NA_MENSAGEM;
  return (
    `A estrutura do banco do e-SUS mudou (provável atualização do PEC): falta ${lista}` +
    (resto > 0 ? ` e mais ${resto}` : '') +
    '. Nada foi gravado. Confira os nomes em apps/worker/config/esus/contrato.json com a versão ' +
    'instalada do PEC e rode a carga de novo.'
  );
}
