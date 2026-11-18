import { destinosDoUsuario, type Escopo, type Perfil, PERFIS_COM_DADO_NOMINAL } from '@sii/shared';

/** Grupos do menu lateral, como no protótipo. Grupo sem item some. */
export const GRUPOS_MENU = ['Acompanhamento', 'Ciclos de vida', 'Território', 'Gestão'] as const;
export type GrupoMenu = (typeof GRUPOS_MENU)[number];

export type IconeMenu =
  | 'inicio'
  | 'ficha'
  | 'sino'
  | 'calendario'
  | 'aviso'
  | 'pauta'
  | 'busca'
  | 'carga'
  | 'vinculo'
  | 'cadeado'
  | 'mapa'
  | 'escudo'
  | 'bebe'
  | 'berco'
  | 'inclusao'
  | 'livro'
  | 'idoso'
  | 'camadas';

export interface ItemMenu {
  href: string;
  rotulo: string;
  grupo: GrupoMenu;
  icone: IconeMenu;
  /** Perfis que a API deixa entrar (espelha os @Perfis dos controllers). */
  perfis: readonly Perfil[] | 'COM_AVISOS';
}

const NOMINAIS = PERFIS_COM_DADO_NOMINAL;

/**
 * Só telas prontas (decisão de 17/11/2026). Tela nova entra aqui com os mesmos perfis da rota da
 * API; o teste de `menuDoPerfil` confere a lista de cada perfil.
 */
export const ITENS_MENU: readonly ItemMenu[] = [
  {
    href: '/',
    rotulo: 'Visão geral',
    grupo: 'Acompanhamento',
    icone: 'inicio',
    perfis: [...NOMINAIS, 'AUDITOR_TCE'],
  },
  {
    href: '/fichas',
    rotulo: 'Ficha da criança',
    grupo: 'Acompanhamento',
    icone: 'ficha',
    perfis: NOMINAIS,
  },
  {
    href: '/notificacoes',
    rotulo: 'Notificações à Assistência',
    grupo: 'Acompanhamento',
    icone: 'sino',
    perfis: [
      'ADMIN_CTI',
      'COMITE_GESTOR',
      'SEMED_GESTOR',
      'ESCOLA',
      'CRAS_TECNICO',
      'ASSISTENCIA_GESTOR',
    ],
  },
  {
    href: '/frequencia',
    rotulo: 'Frequência da turma',
    grupo: 'Acompanhamento',
    icone: 'calendario',
    perfis: ['ADMIN_CTI', 'COMITE_GESTOR', 'SEMED_GESTOR', 'ESCOLA'],
  },
  {
    href: '/avisos',
    rotulo: 'Avisos',
    grupo: 'Acompanhamento',
    icone: 'aviso',
    perfis: 'COM_AVISOS',
  },
  {
    href: '/pauta',
    rotulo: 'Pauta do Comitê',
    grupo: 'Acompanhamento',
    icone: 'pauta',
    perfis: ['ADMIN_CTI', 'COMITE_GESTOR', 'SEMED_GESTOR'],
  },
  {
    href: '/primeira-infancia',
    rotulo: 'Primeira infância',
    grupo: 'Ciclos de vida',
    icone: 'bebe',
    perfis: [...NOMINAIS, 'AUDITOR_TCE'],
  },
  {
    href: '/vagas-creche',
    rotulo: 'Vagas de creche',
    grupo: 'Ciclos de vida',
    icone: 'berco',
    perfis: [...NOMINAIS, 'AUDITOR_TCE'],
  },
  {
    href: '/busca-ativa',
    rotulo: 'Busca ativa escolar',
    grupo: 'Ciclos de vida',
    icone: 'busca',
    perfis: [...NOMINAIS, 'AUDITOR_TCE'],
  },
  {
    href: '/educacao-inclusiva',
    rotulo: 'Educação inclusiva',
    grupo: 'Ciclos de vida',
    icone: 'inclusao',
    perfis: [...NOMINAIS, 'AUDITOR_TCE'],
  },
  {
    href: '/eja',
    rotulo: 'EJA',
    grupo: 'Ciclos de vida',
    icone: 'livro',
    perfis: [...NOMINAIS, 'AUDITOR_TCE'],
  },
  {
    href: '/pessoa-idosa',
    rotulo: 'Pessoa idosa',
    grupo: 'Ciclos de vida',
    icone: 'idoso',
    perfis: [...NOMINAIS, 'AUDITOR_TCE'],
  },
  {
    href: '/territorio',
    rotulo: 'Território',
    grupo: 'Território',
    icone: 'mapa',
    perfis: [...NOMINAIS, 'AUDITOR_TCE', 'FAZENDA'],
  },
  {
    href: '/vulnerabilidade',
    rotulo: 'Índice de vulnerabilidade',
    grupo: 'Território',
    icone: 'camadas',
    perfis: [...NOMINAIS, 'AUDITOR_TCE', 'FAZENDA'],
  },
  {
    href: '/cargas',
    rotulo: 'Cargas de dados',
    grupo: 'Gestão',
    icone: 'carga',
    perfis: ['ADMIN_CTI', 'ASSISTENCIA_GESTOR', 'SEMED_GESTOR', 'FAZENDA'],
  },
  {
    href: '/identidade/revisao',
    rotulo: 'Revisão de vínculos',
    grupo: 'Gestão',
    icone: 'vinculo',
    perfis: ['ADMIN_CTI'],
  },
  {
    href: '/acessos',
    rotulo: 'Acessos a dado pessoal',
    grupo: 'Gestão',
    icone: 'cadeado',
    perfis: ['DPO', 'ADMIN_CTI'],
  },
  {
    href: '/controle-externo',
    rotulo: 'Controle externo',
    grupo: 'Gestão',
    icone: 'escudo',
    perfis: ['ADMIN_CTI', 'COMITE_GESTOR', 'AUDITOR_TCE'],
  },
];

function permite(item: ItemMenu, perfil: Perfil, escopos: readonly Escopo[]): boolean {
  if (item.perfis === 'COM_AVISOS') {
    const d = destinosDoUsuario(perfil, escopos);
    return d === null || d.length > 0;
  }
  return item.perfis.includes(perfil);
}

/** Menu do usuário, agrupado e na ordem do protótipo. */
export function menuDoPerfil(
  perfil: Perfil,
  escopos: readonly Escopo[] = [],
): { grupo: GrupoMenu; itens: ItemMenu[] }[] {
  return GRUPOS_MENU.map((grupo) => ({
    grupo,
    itens: ITENS_MENU.filter((i) => i.grupo === grupo && permite(i, perfil, escopos)),
  })).filter((g) => g.itens.length > 0);
}

/** Primeira tela do perfil (para onde ir depois de entrar quando a Visão geral não é dele). */
export function telaInicial(perfil: Perfil, escopos: readonly Escopo[] = []): string {
  return menuDoPerfil(perfil, escopos)[0]?.itens[0]?.href ?? '/avisos';
}

/** O item está ativo para o caminho atual? (`/` só na raiz.) */
export function itemAtivo(href: string, caminho: string): boolean {
  return href === '/' ? caminho === '/' : caminho === href || caminho.startsWith(`${href}/`);
}
