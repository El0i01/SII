import fs from 'node:fs';
import path from 'node:path';
import { Dicionario } from '@sii/shared';
import { z } from 'zod';
import { raizDoRepo } from '../config';

export const DicionarioCadunico = Dicionario.extend({
  linhasRenda: z.object({
    extremaPobreza: z.number().positive(),
    pobreza: z.number().positive(),
    meioSalarioMinimo: z.number().positive(),
  }),
});
export type DicionarioCadunico = z.infer<typeof DicionarioCadunico>;

export const CAMINHO_PADRAO_CADUNICO = 'apps/worker/config/dicionarios/cadunico.json';

/** Lê e valida o dicionário do CadÚnico (arquivo de configuração, P08). Inválido: o worker não sobe. */
export function carregarDicionarioCadunico(caminho?: string): DicionarioCadunico {
  const arquivo = caminho ?? path.join(raizDoRepo(), CAMINHO_PADRAO_CADUNICO);
  const r = DicionarioCadunico.safeParse(JSON.parse(fs.readFileSync(arquivo, 'utf8')));
  if (!r.success)
    throw new Error(
      `Dicionário do CadÚnico inválido (${path.basename(arquivo)}): ${r.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    );
  const l = r.data.linhasRenda;
  if (!(l.extremaPobreza < l.pobreza && l.pobreza < l.meioSalarioMinimo))
    throw new Error(
      'Dicionário do CadÚnico: as linhas de renda precisam estar em ordem crescente.',
    );
  return r.data;
}

export const CAMINHOS_ESCOLARES = {
  GESTAO_ESCOLAR: 'apps/worker/config/dicionarios/gestao-escolar.json',
  SEDUC: 'apps/worker/config/dicionarios/seduc.json',
} as const;

/** Lê e valida o dicionário de uma carga da Educação (P10). Inválido: o worker não sobe. */
export function carregarDicionarioEscolar(
  fonte: keyof typeof CAMINHOS_ESCOLARES,
  caminho?: string,
): Dicionario {
  const arquivo = caminho ?? path.join(raizDoRepo(), CAMINHOS_ESCOLARES[fonte]);
  const r = Dicionario.safeParse(JSON.parse(fs.readFileSync(arquivo, 'utf8')));
  if (!r.success)
    throw new Error(
      `Dicionário ${fonte} inválido (${path.basename(arquivo)}): ${r.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    );
  return r.data;
}
