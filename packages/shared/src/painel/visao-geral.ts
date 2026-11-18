import { z } from 'zod';
import { type DataISO, diasCorridosEntre } from '../calendario/dias';

/** Mês de referência dos painéis: AAAA-MM. */
export type Mes = string;

const MESES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

export function ehMes(v: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

/** "Outubro de 2026". */
export function rotuloMes(mes: Mes): string {
  return `${MESES[Number(mes.slice(5, 7)) - 1]} de ${mes.slice(0, 4)}`;
}

/** "out/26" (eixo de gráfico). */
export function rotuloMesCurto(mes: Mes): string {
  return `${(MESES[Number(mes.slice(5, 7)) - 1] as string).slice(0, 3).toLowerCase()}/${mes.slice(2, 4)}`;
}

export function somarMeses(mes: Mes, n: number): Mes {
  const total = Number(mes.slice(0, 4)) * 12 + Number(mes.slice(5, 7)) - 1 + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/** Os `n` meses que terminam em `ate`, do mais antigo ao mais recente. */
export function mesesAte(ate: Mes, n = 12): Mes[] {
  return Array.from({ length: n }, (_, i) => somarMeses(ate, i - n + 1));
}

/** Opções do seletor "Período": os 12 meses até o atual, do mais recente ao mais antigo. */
export function periodosDisponiveis(hoje: DataISO, n = 12): Mes[] {
  return mesesAte(hoje.slice(0, 7), n).reverse();
}

/** Filtros persistentes dos painéis (na URL): território (código do setor) e período. */
export const FiltroPainel = z.object({
  territorio: z
    .string()
    .trim()
    .regex(/^[A-Z0-9]{2,10}$/, 'Território inválido.')
    .optional(),
  periodo: z.string().refine(ehMes, 'Período inválido (use AAAA-MM).').optional(),
});
export type FiltroPainel = z.infer<typeof FiltroPainel>;

/** Último dia do mês (AAAA-MM-DD). */
export function fimDoMes(mes: Mes): DataISO {
  const proximo = somarMeses(mes, 1);
  const d = new Date(Date.UTC(Number(proximo.slice(0, 4)), Number(proximo.slice(5, 7)) - 1, 0));
  return d.toISOString().slice(0, 10);
}

export interface CasoSerie {
  /** Dia do alerta (Porto Velho). */
  alertaEm: DataISO;
  /** Dia do encerramento, se houver. */
  encerradoEm: DataISO | null;
}

export interface PontoSerie {
  mes: Mes;
  /** Casos abertos no último dia do mês. */
  abertos: number;
  /** Casos resolvidos (encerrados) dentro do mês. */
  resolvidos: number;
}

/** Série "casos abertos e resolvidos por mês" da Visão geral (12 meses até o período). */
export function serieCasosPorMes(casos: readonly CasoSerie[], ate: Mes, n = 12): PontoSerie[] {
  return mesesAte(ate, n).map((mes) => {
    const fim = fimDoMes(mes);
    let abertos = 0;
    let resolvidos = 0;
    for (const c of casos) {
      if (c.alertaEm <= fim && (c.encerradoEm === null || c.encerradoEm > fim)) abertos++;
      if (c.encerradoEm && c.encerradoEm.slice(0, 7) === mes) resolvidos++;
    }
    return { mes, abertos, resolvidos };
  });
}

/** Percentual inteiro; sem base, null. */
export function percentual(parte: number, total: number): number | null {
  return total > 0 ? Math.round((parte * 100) / total) : null;
}

export type TomAtencao = 'critico' | 'alerta' | 'info';
export interface ItemAtencao {
  tom: TomAtencao;
  titulo: string;
  detalhe: string;
  /** Rota do web com a lista. */
  link: string;
  acao: string;
}

/** Dias sem lista da SEDUC a partir dos quais as matrículas estaduais ficam desatualizadas. */
export const DIAS_SEDUC_DESATUALIZADA = 45;

export interface EntradaAtencao {
  hoje: DataISO;
  /** Cargas que falharam e não voltaram a dar certo (só a CTI recebe; null para os outros). */
  cargasComFalha: number | null;
  notificacoesAguardando: number;
  escalonados: number;
  /** Dia da última carga da SEDUC que deu certo (null = nunca). */
  ultimaSeduc: DataISO | null;
}

/** "Precisa de atenção" da Visão geral, na ordem de gravidade do protótipo. */
export function precisaDeAtencao(e: EntradaAtencao): ItemAtencao[] {
  const itens: ItemAtencao[] = [];
  if (e.cargasComFalha) {
    itens.push({
      tom: 'critico',
      titulo: `${e.cargasComFalha} ${e.cargasComFalha === 1 ? 'carga falhou' : 'cargas falharam'}`,
      detalhe: 'Os dados dessas fontes estão sem atualização',
      link: '/cargas',
      acao: 'Ver cargas',
    });
  }
  if (e.escalonados > 0) {
    itens.push({
      tom: 'critico',
      titulo: `${e.escalonados} ${e.escalonados === 1 ? 'caso escalonado' : 'casos escalonados'} ao Comitê Gestor`,
      detalhe: 'Prazo vencido há mais de 7 dias',
      link: '/busca-ativa?situacao=escalonados',
      acao: 'Ver casos',
    });
  }
  if (e.notificacoesAguardando > 0) {
    itens.push({
      tom: 'alerta',
      titulo: `${e.notificacoesAguardando} ${e.notificacoesAguardando === 1 ? 'notificação aguardando' : 'notificações aguardando'} parecer da Assistência`,
      detalhe: 'Alunos com 5 dias letivos seguidos sem frequência',
      link: '/notificacoes',
      acao: 'Ver',
    });
  }
  if (
    e.ultimaSeduc === null ||
    diasCorridosEntre(e.ultimaSeduc, e.hoje) > DIAS_SEDUC_DESATUALIZADA
  ) {
    itens.push({
      tom: 'info',
      titulo: 'Matrículas estaduais desatualizadas',
      detalhe:
        e.ultimaSeduc === null
          ? 'Nenhuma lista da SEDUC-RO recebida'
          : `Última lista da SEDUC-RO há ${diasCorridosEntre(e.ultimaSeduc, e.hoje)} dias`,
      link: '/cargas',
      acao: 'Ver fontes',
    });
  }
  return itens;
}
