import { z } from 'zod';

/**
 * Dicionário de layout de uma fonte de carga (§5). O conteúdo (nomes de coluna do MDS etc.) fica
 * num arquivo de configuração do worker; aqui só o formato e a conferência do cabeçalho.
 */
export const CampoDicionario = z.object({
  /** Como a Assistência reconhece o campo ("NIS", "Data de nascimento"). */
  rotulo: z.string().min(1),
  /** Nomes aceitos para a coluna (CECAD, Portal de Gestão…). O primeiro é o oficial. */
  colunas: z.array(z.string().min(1)).min(1),
  obrigatorio: z.boolean().default(false),
});
export type CampoDicionario = z.infer<typeof CampoDicionario>;

export const Dicionario = z.object({
  fonte: z.string().min(1),
  versao: z.string().min(1),
  campos: z.record(z.string(), CampoDicionario),
  /** Grupos em que basta um dos campos (ex.: faixa de renda pronta ou renda per capita). */
  algumDe: z.array(z.array(z.string()).min(2)).default([]),
});
export type Dicionario = z.infer<typeof Dicionario>;

/** Minúsculas, sem acento, sem aspas e sem o prefixo de tabela do CECAD (`p.`, `d.`). */
export function normalizarColuna(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/"/g, '')
    .trim()
    .toLowerCase()
    .replace(/^[a-z]\./, '');
}

export interface CabecalhoMapeado {
  /** Campo do dicionário → posição da coluna no arquivo. */
  mapa: Record<string, number>;
  /** Campos (ou grupos) obrigatórios que não estão no arquivo. */
  faltando: { campos: string[]; rotulo: string; coluna: string }[];
}

export function mapearCabecalho(colunas: string[], dic: Dicionario): CabecalhoMapeado {
  const posicao = new Map<string, number>();
  colunas.forEach((c, i) => {
    const n = normalizarColuna(c);
    if (!posicao.has(n)) posicao.set(n, i);
  });
  const mapa: Record<string, number> = {};
  for (const [chave, campo] of Object.entries(dic.campos)) {
    const achada = campo.colunas.map(normalizarColuna).find((c) => posicao.has(c));
    if (achada !== undefined) mapa[chave] = posicao.get(achada) as number;
  }
  const faltando: CabecalhoMapeado['faltando'] = [];
  const emGrupo = new Set(dic.algumDe.flat());
  for (const [chave, campo] of Object.entries(dic.campos)) {
    if (campo.obrigatorio && !emGrupo.has(chave) && !(chave in mapa))
      faltando.push({ campos: [chave], rotulo: campo.rotulo, coluna: campo.colunas[0] as string });
  }
  for (const grupo of dic.algumDe) {
    if (grupo.some((c) => c in mapa)) continue;
    const campos = grupo.map((c) => dic.campos[c]).filter((c) => c !== undefined);
    faltando.push({
      campos: grupo,
      rotulo: campos.map((c) => c.rotulo).join(' ou '),
      coluna: campos.map((c) => c.colunas[0]).join(' ou '),
    });
  }
  return { mapa, faltando };
}

/** Mensagem para a tela: diz o que falta, com o nome oficial, e o que conferir. */
export function mensagemColunasFaltando(
  faltando: CabecalhoMapeado['faltando'],
  fonte: string,
): string {
  const itens = faltando.map((f) => `${f.rotulo} (${f.coluna})`).join('; ');
  const plural = faltando.length > 1;
  return (
    `O arquivo não tem ${plural ? 'as colunas obrigatórias' : 'a coluna obrigatória'} do layout ` +
    `${fonte}: ${itens}. Confira se exportou a base completa, com o cabeçalho na primeira linha, ` +
    `e envie de novo.`
  );
}
