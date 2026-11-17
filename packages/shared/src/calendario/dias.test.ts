import { describe, expect, it } from 'vitest';
import {
  adicionarDias,
  diaDaSemana,
  diasCorridosEntre,
  diasUteisEntre,
  ehDataISO,
  hojeEmPortoVelho,
  somarDiasUteis,
} from './dias';

describe('datas ISO', () => {
  it('reconhece AAAA-MM-DD válidas e recusa o resto', () => {
    expect(ehDataISO('2026-11-11')).toBe(true);
    expect(ehDataISO('2026-02-30')).toBe(false);
    expect(ehDataISO('11/11/2026')).toBe(false);
    expect(ehDataISO('2026-1-1')).toBe(false);
  });

  it('dia da semana sem depender do fuso (0 = domingo)', () => {
    expect(diaDaSemana('2026-11-11')).toBe(3); // quarta
    expect(diaDaSemana('2026-11-15')).toBe(0); // domingo
  });

  it('soma dias corridos atravessando mês e ano', () => {
    expect(adicionarDias('2026-12-30', 3)).toBe('2027-01-02');
    expect(adicionarDias('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('data inválida lança RangeError', () => {
    expect(() => diaDaSemana('2026-13-01')).toThrow(RangeError);
  });
});

describe('dias úteis', () => {
  const feriados = ['2026-11-20']; // Consciência Negra (sexta)

  it('conta seg a sex depois do dia inicial, até o final inclusive', () => {
    // qua 11/11 → ter 17/11: qui, sex, seg, ter = 4
    expect(diasUteisEntre('2026-11-11', '2026-11-17')).toBe(4);
  });

  it('feriado não conta', () => {
    // seg 16/11 → seg 23/11: 17,18,19,(20 feriado),23 = 4
    expect(diasUteisEntre('2026-11-16', '2026-11-23', feriados)).toBe(4);
  });

  it('mesmo dia ou fim antes do início dá 0', () => {
    expect(diasUteisEntre('2026-11-11', '2026-11-11')).toBe(0);
    expect(diasUteisEntre('2026-11-12', '2026-11-11')).toBe(0);
  });

  it('5 dias úteis a partir de uma quarta caem na quarta seguinte (sem feriado)', () => {
    expect(somarDiasUteis('2026-11-11', 5)).toBe('2026-11-18');
  });

  it('pula feriado e fim de semana ao somar', () => {
    // qui 19/11 + 2 úteis: (20 feriado, 21-22 fds) 23, 24
    expect(somarDiasUteis('2026-11-19', 2, feriados)).toBe('2026-11-24');
  });

  it('somar zero devolve o mesmo dia; negativo lança erro', () => {
    expect(somarDiasUteis('2026-11-14', 0)).toBe('2026-11-14');
    expect(() => somarDiasUteis('2026-11-14', -1)).toThrow(RangeError);
  });
});

describe('hojeEmPortoVelho', () => {
  it('às 2h UTC ainda é o dia anterior em Porto Velho', () => {
    expect(hojeEmPortoVelho(new Date('2026-11-17T02:00:00Z'))).toBe('2026-11-16');
    expect(hojeEmPortoVelho(new Date('2026-11-17T05:00:00Z'))).toBe('2026-11-17');
    expect(hojeEmPortoVelho()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('diasCorridosEntre', () => {
  it('conta dias corridos, inclusive atravessando o mês', () => {
    expect(diasCorridosEntre('2026-10-30', '2026-11-02')).toBe(3);
    expect(diasCorridosEntre('2026-11-02', '2026-10-30')).toBe(-3);
    expect(diasCorridosEntre('2026-11-02', '2026-11-02')).toBe(0);
  });
});
