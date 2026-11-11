import { describe, expect, it } from 'vitest';
import { DESFECHOS, ROTULO_DESFECHO } from '../enums/dominio';
import { Encaminhamento, Parecer, UploadCarga, Visita } from './entrada';

const textoOk = 'Família visitada pelo CRAS. O retorno à escola foi combinado para segunda.';

const campos = (r: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) =>
  r.error?.issues.map((i) => i.path.join('.')) ?? [];

describe('Parecer (§3.7)', () => {
  it('seis desfechos com o rótulo do protótipo', () => {
    expect(DESFECHOS).toHaveLength(6);
    expect(ROTULO_DESFECHO.ENCAMINHADO_SEMED_TRANSPORTE).toBe('Encaminhado à SEMED (transporte)');
  });

  it('aceita parecer válido e assume nova visita = não', () => {
    const r = Parecer.parse({ desfecho: 'RETORNO_ESCOLA_COMBINADO', texto: textoOk });
    expect(r.novaVisita).toBe(false);
  });

  it('texto com menos de 30 caracteres e desfecho fora da lista são recusados', () => {
    const r = Parecer.safeParse({ desfecho: 'OUTRO', texto: 'curto' });
    expect(campos(r)).toEqual(['desfecho', 'texto']);
  });

  it('recusa código CID no texto (dado de saúde não entra na base)', () => {
    for (const t of [
      `${textoOk} Diagnóstico F32.1 informado pela mãe.`,
      `${textoOk} CID: F32`,
      `${textoOk} cid-10 g40`,
    ]) {
      const r = Parecer.safeParse({ desfecho: 'AUSENCIA_JUSTIFICADA_SAUDE', texto: t });
      expect(r.success).toBe(false);
    }
  });

  it('endereço rural tipo "Linha B40" não é confundido com CID', () => {
    const r = Parecer.safeParse({
      desfecho: 'FAMILIA_NAO_LOCALIZADA',
      texto: 'Visita na Linha B40, km 10: a família mudou e não foi encontrada.',
    });
    expect(r.success).toBe(true);
  });

  it('nova visita exige a data', () => {
    const r = Parecer.safeParse({
      desfecho: 'ENCAMINHADO_CREAS',
      texto: textoOk,
      novaVisita: true,
    });
    expect(campos(r)).toEqual(['dataNovaVisita']);
    expect(
      Parecer.safeParse({
        desfecho: 'ENCAMINHADO_CREAS',
        texto: textoOk,
        novaVisita: true,
        dataNovaVisita: '2026-11-20',
      }).success,
    ).toBe(true);
  });
});

describe('Visita (§6.5)', () => {
  const base = {
    idLocal: '6f1c1e3a-1b2c-4d5e-8f90-123456789abc',
    tipo: 'ACS',
    pessoaIds: [10],
    realizadaEm: '2026-11-11T14:00:00Z',
    situacao: 'Família em casa, criança com cartão de vacina em dia.',
    ponto: { latitude: -9.1875, longitude: -63.1875, precisaoM: 6 },
    pinoConfirmado: true,
  };

  it('aceita visita completa e assume sem encaminhamentos', () => {
    expect(Visita.parse(base).encaminhamentos).toEqual([]);
  });

  it('a chave de idempotência precisa ser uuid', () => {
    expect(campos(Visita.safeParse({ ...base, idLocal: '123' }))).toEqual(['idLocal']);
  });

  it('ponto fora de Rondônia é recusado', () => {
    const r = Visita.safeParse({
      ...base,
      ponto: { latitude: -23.5, longitude: -46.6, precisaoM: 5 },
    });
    expect(campos(r)).toEqual(['ponto.latitude', 'ponto.longitude']);
  });

  it('pino confirmado exige ponto; sem GPS a visita vale sem pino', () => {
    const { ponto: _ponto, ...semPonto } = base;
    expect(campos(Visita.safeParse(semPonto))).toEqual(['ponto']);
    expect(Visita.safeParse({ ...semPonto, pinoConfirmado: false }).success).toBe(true);
  });

  it('situação também não aceita CID', () => {
    expect(
      campos(Visita.safeParse({ ...base, situacao: 'Criança com CID J45.0, acamada.' })),
    ).toEqual(['situacao']);
  });
});

describe('Encaminhamento', () => {
  it('pessoa, tipo de caso, destino e motivo', () => {
    expect(
      Encaminhamento.safeParse({
        pessoaId: 1,
        tipoCaso: 'INFREQUENCIA',
        destino: 'ASSISTENCIA',
        motivo: 'Aluno faltando desde a semana passada.',
      }).success,
    ).toBe(true);
    expect(
      campos(
        Encaminhamento.safeParse({
          pessoaId: 0,
          tipoCaso: 'X',
          destino: 'PREFEITO',
          motivo: 'curto',
        }),
      ),
    ).toEqual(['pessoaId', 'tipoCaso', 'destino', 'motivo']);
  });
});

describe('UploadCarga (§5)', () => {
  const base = {
    fonte: 'CADUNICO',
    mesReferencia: '2026-10',
    nomeArquivo: 'cecad_out.csv',
    tamanhoBytes: 1_200_000,
  };

  it('aceita CSV ou XLSX de fonte que chega por upload', () => {
    expect(UploadCarga.safeParse(base).success).toBe(true);
    expect(
      UploadCarga.safeParse({ ...base, nomeArquivo: 'sicon.XLSX', fonte: 'SICON' }).success,
    ).toBe(true);
  });

  it('fonte lida direto do banco (e-SUS) não aceita upload', () => {
    expect(campos(UploadCarga.safeParse({ ...base, fonte: 'ESUS_PEC' }))).toEqual(['fonte']);
  });

  it('mês, extensão e tamanho', () => {
    const r = UploadCarga.safeParse({
      ...base,
      mesReferencia: '2026-13',
      nomeArquivo: 'dados.pdf',
      tamanhoBytes: 0,
    });
    expect(campos(r)).toEqual(['mesReferencia', 'nomeArquivo', 'tamanhoBytes']);
    expect(campos(UploadCarga.safeParse({ ...base, tamanhoBytes: 200 * 1024 * 1024 }))).toEqual([
      'tamanhoBytes',
    ]);
  });
});
