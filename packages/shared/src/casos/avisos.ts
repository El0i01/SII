import type { Escopo } from '../acesso/acesso';
import type { Perfil } from '../enums/perfil';

export const DESTINOS_AVISO = ['ESCOLA', 'SECRETARIA', 'CRAS', 'COMITE'] as const;
export type DestinoAviso = (typeof DESTINOS_AVISO)[number];

export interface EnderecoAviso {
  tipo: DestinoAviso;
  valor: string;
}

const SECRETARIA_DO_PERFIL: Partial<Record<Perfil, string>> = {
  SEMED_GESTOR: 'SEMED',
  SAUDE_GESTOR: 'SEMSAU',
  ASSISTENCIA_GESTOR: 'ASSISTENCIA',
  FAZENDA: 'SEMFAZ',
};

/**
 * Caixas de aviso interno que o usuário lê (P11, ADR 0010):
 * - escola: o INEP de cada escopo ESCOLA;
 * - técnico do CRAS: o CadSUAS de cada escopo CRAS e a secretaria da Assistência;
 * - gestores: a própria secretaria; Comitê: a pauta do Comitê;
 * - CTI: tudo (`null`), para dar suporte. Os demais não recebem avisos.
 */
export function destinosDoUsuario(
  perfil: Perfil,
  escopos: readonly Escopo[],
): EnderecoAviso[] | null {
  if (perfil === 'ADMIN_CTI') return null;
  if (perfil === 'COMITE_GESTOR') return [{ tipo: 'COMITE', valor: 'COMITE' }];
  if (perfil === 'ESCOLA')
    return escopos
      .filter((e) => e.tipo === 'ESCOLA')
      .map((e) => ({ tipo: 'ESCOLA', valor: e.valor }));
  if (perfil === 'CRAS_TECNICO')
    return [
      ...escopos
        .filter((e) => e.tipo === 'CRAS')
        .map((e) => ({ tipo: 'CRAS' as const, valor: e.valor })),
      { tipo: 'SECRETARIA', valor: 'ASSISTENCIA' },
    ];
  const secretaria = SECRETARIA_DO_PERFIL[perfil];
  return secretaria ? [{ tipo: 'SECRETARIA', valor: secretaria }] : [];
}

/** Para onde vai o aviso de um caso encaminhado à secretaria (`Encaminhamento.destino`). */
export function enderecoDaSecretaria(destino: string, cras: string | null): EnderecoAviso {
  if (destino === 'ASSISTENCIA' && cras) return { tipo: 'CRAS', valor: cras };
  return { tipo: 'SECRETARIA', valor: destino };
}
