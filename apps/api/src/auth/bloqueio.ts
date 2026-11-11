/** Bloqueio por conta: a 5ª senha errada seguida bloqueia o login por 15 minutos. */
export const REGRA_BLOQUEIO = { maxFalhas: 5, bloqueioMin: 15 } as const;

export interface EstadoBloqueio {
  falhasSeguidas: number;
  bloqueadoAte: Date | null;
}

export function estaBloqueado(bloqueadoAte: Date | null, agora: Date = new Date()): boolean {
  return bloqueadoAte !== null && bloqueadoAte.getTime() > agora.getTime();
}

/** Minutos que faltam para o desbloqueio, arredondados para cima (mínimo 1). */
export function minutosRestantes(bloqueadoAte: Date, agora: Date = new Date()): number {
  return Math.max(1, Math.ceil((bloqueadoAte.getTime() - agora.getTime()) / 60_000));
}

/**
 * Nova contagem depois de uma senha errada. Ao atingir o limite, bloqueia e zera a contagem,
 * para que, vencido o bloqueio, a pessoa tenha de novo as 5 tentativas.
 */
export function registrarFalha(
  atual: EstadoBloqueio,
  agora: Date = new Date(),
): EstadoBloqueio & { bloqueouAgora: boolean } {
  // Uma falha depois de um bloqueio vencido recomeça a contagem.
  const base =
    atual.bloqueadoAte && !estaBloqueado(atual.bloqueadoAte, agora) ? 0 : atual.falhasSeguidas;
  const falhas = base + 1;
  if (falhas >= REGRA_BLOQUEIO.maxFalhas) {
    return {
      falhasSeguidas: 0,
      bloqueadoAte: new Date(agora.getTime() + REGRA_BLOQUEIO.bloqueioMin * 60_000),
      bloqueouAgora: true,
    };
  }
  return { falhasSeguidas: falhas, bloqueadoAte: null, bloqueouAgora: false };
}
