/** Data sem hora, `AAAA-MM-DD`. Datas de calendário não têm fuso: tudo é calculado em UTC. */
export type DataISO = string;

const FORMATO = /^(\d{4})-(\d{2})-(\d{2})$/;

function paraUtc(data: DataISO): Date {
  const m = FORMATO.exec(data);
  if (m) {
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    if (d.toISOString().slice(0, 10) === data) return d;
  }
  throw new RangeError(`Data inválida: ${data} (use AAAA-MM-DD)`);
}

export function ehDataISO(valor: string): boolean {
  try {
    paraUtc(valor);
    return true;
  } catch {
    return false;
  }
}

/** 0 = domingo … 6 = sábado. */
export function diaDaSemana(data: DataISO): number {
  return paraUtc(data).getUTCDay();
}

export function adicionarDias(data: DataISO, dias: number): DataISO {
  const d = paraUtc(data);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function ehUtil(data: DataISO, feriados: ReadonlySet<DataISO>): boolean {
  const dia = diaDaSemana(data);
  return dia !== 0 && dia !== 6 && !feriados.has(data);
}

/**
 * Dias úteis depois de `inicio` até `fim`, inclusive (o dia do alerta não conta).
 * Úteis = segunda a sexta, fora os feriados informados. `fim` ≤ `inicio` dá 0.
 */
export function diasUteisEntre(
  inicio: DataISO,
  fim: DataISO,
  feriados: Iterable<DataISO> = [],
): number {
  const conjunto = new Set(feriados);
  paraUtc(fim);
  let n = 0;
  for (let d = adicionarDias(inicio, 1); d <= fim; d = adicionarDias(d, 1)) {
    if (ehUtil(d, conjunto)) n += 1;
  }
  return n;
}

/** Data que fica `dias` dias úteis depois de `inicio` (prazo do parecer, por exemplo). */
export function somarDiasUteis(
  inicio: DataISO,
  dias: number,
  feriados: Iterable<DataISO> = [],
): DataISO {
  if (!Number.isInteger(dias) || dias < 0) throw new RangeError('dias precisa ser inteiro ≥ 0');
  const conjunto = new Set(feriados);
  let d = inicio;
  paraUtc(d);
  for (let faltam = dias; faltam > 0;) {
    d = adicionarDias(d, 1);
    if (ehUtil(d, conjunto)) faltam -= 1;
  }
  return d;
}
