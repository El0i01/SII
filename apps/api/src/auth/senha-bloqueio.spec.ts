import { estaBloqueado, minutosRestantes, REGRA_BLOQUEIO, registrarFalha } from './bloqueio';
import {
  ALFABETO_PROVISORIA,
  conferirSenha,
  gerarSenhaProvisoria,
  HASH_FICTICIO,
  hashSenha,
  VALIDADE_PROVISORIA_HORAS,
} from './senha';

describe('senha', () => {
  it('usa bcrypt com custo 12 e confere a senha', async () => {
    const hash = await hashSenha('senha-de-teste-1');
    expect(hash).toMatch(/^\$2[aby]\$12\$/);
    await expect(conferirSenha('senha-de-teste-1', hash)).resolves.toBe(true);
    await expect(conferirSenha('outra', hash)).resolves.toBe(false);
  });

  it('o hash fictício também é bcrypt 12 (mesmo custo de tempo de um login real)', async () => {
    expect(HASH_FICTICIO).toMatch(/^\$2[aby]\$12\$/);
    await expect(conferirSenha('qualquer', HASH_FICTICIO)).resolves.toBe(false);
  });

  it('gera senha provisória xxxx-xxxx-xxxx sem caracteres ambíguos, válida por 24 h', () => {
    const agora = new Date('2026-11-11T12:00:00Z');
    const vistas = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const { senha, expiraEm } = gerarSenhaProvisoria(agora);
      expect(senha).toMatch(
        new RegExp(
          `^[${ALFABETO_PROVISORIA}]{4}-[${ALFABETO_PROVISORIA}]{4}-[${ALFABETO_PROVISORIA}]{4}$`,
        ),
      );
      expect(senha).not.toMatch(/[l1o0i]/);
      expect(expiraEm.getTime() - agora.getTime()).toBe(VALIDADE_PROVISORIA_HORAS * 3_600_000);
      vistas.add(senha);
    }
    expect(vistas.size).toBe(200);
  });
});

describe('bloqueio', () => {
  const agora = new Date('2026-11-11T12:00:00Z');

  it('conta as falhas até a 4ª sem bloquear', () => {
    let estado = { falhasSeguidas: 0, bloqueadoAte: null as Date | null };
    for (let i = 1; i < REGRA_BLOQUEIO.maxFalhas; i++) {
      const r = registrarFalha(estado, agora);
      expect(r.bloqueouAgora).toBe(false);
      expect(r.falhasSeguidas).toBe(i);
      estado = r;
    }
  });

  it('a 5ª falha bloqueia por 15 minutos e zera a contagem', () => {
    const r = registrarFalha({ falhasSeguidas: 4, bloqueadoAte: null }, agora);
    expect(r.bloqueouAgora).toBe(true);
    expect(r.falhasSeguidas).toBe(0);
    expect(r.bloqueadoAte?.getTime()).toBe(agora.getTime() + 15 * 60_000);
    expect(estaBloqueado(r.bloqueadoAte, agora)).toBe(true);
    expect(minutosRestantes(r.bloqueadoAte as Date, agora)).toBe(15);
  });

  it('o bloqueio vence sozinho e a contagem recomeça', () => {
    const vencido = new Date(agora.getTime() - 1);
    expect(estaBloqueado(vencido, agora)).toBe(false);
    expect(estaBloqueado(null, agora)).toBe(false);
    const r = registrarFalha({ falhasSeguidas: 3, bloqueadoAte: vencido }, agora);
    expect(r).toMatchObject({ falhasSeguidas: 1, bloqueouAgora: false, bloqueadoAte: null });
  });

  it('minutos restantes nunca é menor que 1', () => {
    expect(minutosRestantes(new Date(agora.getTime() + 5_000), agora)).toBe(1);
  });
});
