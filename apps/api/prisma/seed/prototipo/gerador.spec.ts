import { createHash } from 'node:crypto';
import { gerarPrototipo } from './gerador';

/**
 * Digests calculados rodando o JS ORIGINAL de docs/prototipo/index.html no Node (11/11/2026),
 * com a mesma normalização abaixo. Se o protótipo mudar, recalcule; se o porte mudar, o teste acusa.
 */
const ESPERADO = {
  quadras: 'd3f4a59bd6e38b1a8f80592623b1bb60e19a11ac453d06184534c643939ebca0',
  casos: '6c21ecb40ac1192b52d954444e4f06ce08a390024245218a1670c7902211741c',
  lotes: '3dc5cc183da13eac1469975ddb8dda7ef01dc6ca4a97ee327eb4de55178af0c2',
  criancas: 'b8cda266744848e640780433294f173d6478ee8ee62ad3276139dad3fc0ac22d',
  notif: '2022acfa6095cbde46ac9e7e186bc37807952fa4d1c0672ad498384a0945680b',
  idosos: 'e84ed0c83540947429feeb0d3b39e0f33c8e6fc71496c16561bdaa8cfb06d0d1',
};

const sha = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');

describe('porte do gerador do protótipo', () => {
  const g = gerarPrototipo();

  it('reproduz o protótipo registro a registro', () => {
    expect({
      quadras: sha(
        g.quadras.map((q) => [
          q.id,
          q.setor,
          q.vul,
          q.prec,
          q.dom,
          q.d.renda,
          q.d.saude,
          q.d.escola,
          q.d.imovel,
          q.d.reg,
        ]),
      ),
      casos: sha(
        g.casos.map((c) => [
          c.id,
          c.ini,
          c.cpf,
          c.idade,
          c.setor,
          c.quadra,
          c.origem,
          c.status,
          c.dias,
          c.resp,
          c.escola,
        ]),
      ),
      lotes: sha(g.quadras.map((q) => g.lotes[q.id])),
      criancas: sha(
        g.criancas.map((c) => [
          c.id,
          c.ini,
          c.cpf,
          c.idade,
          c.setor,
          c.quadra,
          c.lote,
          c.cad,
          c.pbf,
          c.cadDias,
          c.matric,
          c.escola,
          c.turma,
          c.matDias,
          c.freq,
          c.faltas,
          c.vac,
          c.acs,
          `Unidade de saúde ${c.ubs}`,
          c.cras,
          c.crasUlt,
          c.pcf,
          c.pcfUlt,
          c.visitador,
          c.aee,
          c.apae,
          c.bpc,
          c.sala,
          c.ct,
          c.ctDias,
        ]),
      ),
      notif: sha(
        g.notificacoes.map((n) => [n.id, n.criancaId, n.status, n.criada, n.desfecho, n.pDias]),
      ),
      idosos: sha(
        g.idosos.map((p) => [
          p.id,
          p.ini,
          p.idade,
          p.setor,
          p.quadra,
          p.lote,
          p.so,
          p.bpc,
          p.acam,
          p.scfv,
          p.gripe,
          p.cad,
          p.cras,
          p.cron,
          p.cronA,
          p.acs,
        ]),
      ),
    }).toEqual(ESPERADO);
  });

  it('tem os totais do protótipo', () => {
    expect(g.quadras).toHaveLength(79);
    expect(g.casos).toHaveLength(74);
    expect(g.criancas).toHaveLength(620);
    expect(g.criancas.filter((c) => c.faltas >= 5)).toHaveLength(37);
    expect(g.notificacoes).toHaveLength(37);
    expect(g.idosos).toHaveLength(1048);
    expect(Object.values(g.lotes).flat()).toHaveLength(948);
  });

  it('é determinístico', () => {
    expect(gerarPrototipo().criancas[0]).toEqual(g.criancas[0]);
  });
});
