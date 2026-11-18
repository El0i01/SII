import type { INestApplication } from '@nestjs/common';
import { inflateSync } from 'node:zlib';
import { hojeEmPortoVelho, INDICADORES, normalizarCpf, semestre as semestreDe } from '@sii/shared';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { semearPrototipo } from '../prisma/seed/prototipo/persistir';
import { semearUsuarios } from '../prisma/seed/usuarios';
import { chaveDeHex, decifrar } from '../src/cripto/cifra';
import type { PrismaClient } from '../src/generated/prisma/client';
import { executarIndicadores } from '../../worker/src/indicadores/snapshots';
import { aplicarMigrations, clienteDono, criarApp, usarBancoDeTeste } from './apoio-integracao';

const { url, senhaSeed } = usarBancoDeTeste();
const MOBILE = { 'x-sii-cliente': 'mobile' };

let dono: PrismaClient;
let app: INestApplication;
const tokens = new Map<string, string>();

async function token(login: string) {
  const guardado = tokens.get(login);
  if (guardado) return guardado;
  const r = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .set(MOBILE)
    .send({ login, senha: senhaSeed });
  tokens.set(login, r.body.acessoToken);
  return r.body.acessoToken as string;
}
const como = async (login: string) => ({ Authorization: `Bearer ${await token(login)}` });
const http = () => request(app.getHttpServer());

beforeAll(async () => {
  aplicarMigrations(url);
  dono = clienteDono(url);
  await semearUsuarios(dono, senhaSeed);
  await semearPrototipo(dono, {
    cifra: chaveDeHex(process.env.CHAVE_CIFRA ?? '', 'CHAVE_CIFRA'),
    hmac: chaveDeHex(process.env.CHAVE_HMAC ?? '', 'CHAVE_HMAC'),
  });
  await executarIndicadores(dono as never, { referencia: hojeEmPortoVelho() });
  app = await criarApp();
}, 180_000);

afterAll(async () => {
  await app?.close();
  await dono?.$disconnect();
});

/** Texto do PDF: descomprime os streams e junta as strings dos operadores TJ/Tj (pdfkit). */
function textoDoPdf(pdf: Buffer): string {
  const bin = pdf.toString('latin1');
  const textos: string[] = [];
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  for (let m = re.exec(bin); m; m = re.exec(bin)) {
    let conteudo: string;
    try {
      conteudo = inflateSync(Buffer.from(m[1] as string, 'latin1')).toString('latin1');
    } catch {
      continue;
    }
    for (const tj of conteudo.matchAll(/\[(.*?)\]\s*TJ/g)) {
      const partes = [...(tj[1] as string).matchAll(/<([0-9a-fA-F]+)>/g)].map((h) =>
        new TextDecoder('windows-1252').decode(Buffer.from(h[1] as string, 'hex')),
      );
      textos.push(partes.join(''));
    }
  }
  return textos.join('\n');
}

const binario = (res: request.Response, cb: (e: Error | null, b: Buffer) => void) => {
  const partes: Buffer[] = [];
  res.on('data', (p: Buffer) => partes.push(p));
  res.on('end', () => cb(null, Buffer.concat(partes)));
};

const SEMESTRE = semestreDe(hojeEmPortoVelho());

describe('controle externo (P16)', () => {
  it('o auditor vê os indicadores com linha de base, atual e meta, sem dado pessoal', async () => {
    const r = await http()
      .get('/api/v1/indicadores/controle-externo')
      .set(await como('tce.auditor'))
      .expect(200);
    expect(r.body.semestre).toBe(SEMESTRE);
    expect(r.body.indicadores.map((i: { codigo: string }) => i.codigo)).toEqual(
      INDICADORES.map((i) => i.codigo),
    );
    const vac = r.body.indicadores.find((i: { codigo: string }) => i.codigo === 'VACINACAO_0_6');
    expect(vac).toMatchObject({ linhaBase: '71,4% (nov/25)', meta: '85%' });
    expect(vac.atual).toMatch(/^\d+(,\d)?%$/);
    expect(r.body.gasto.programas).toHaveLength(4);
    expect(r.body.gasto.programas[0]).toMatchObject({ nome: 'Atenção primária', valor: 3_900_000 });
    expect(r.body.trilhas.length).toBeGreaterThan(0);
    expect(r.body.trilhas[0].verificador).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
    const texto = JSON.stringify(r.body);
    // "nome" aqui é o nome do indicador; dado de pessoa teria cpf, nis, cns, iniciais ou pessoa*.
    expect(texto).not.toMatch(/"(cpf|nis|cns|iniciais|pessoa[A-Za-z]*|nascimento)"/i);
    expect(texto).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/);
  });

  it('o auditor só navega por agregados: rotas nominais 403 e o papel do banco não lê tabela nominal', async () => {
    const h = await como('tce.auditor');
    for (const rota of [
      '/api/v1/fichas',
      '/api/v1/busca-ativa',
      '/api/v1/notificacoes',
      '/api/v1/casos/pauta',
      '/api/v1/mapa/pontos',
      '/api/v1/auditoria/acessos',
      '/api/v1/identidade/revisoes',
    ])
      expect({ rota, status: (await http().get(rota).set(h)).status }).toEqual({
        rota,
        status: 403,
      });
    for (const tabela of [
      'casos.caso',
      'casos.evento_caso',
      'pessoas.pessoa_mestra',
      'auditoria.acesso_dado_pessoal',
    ])
      await expect(
        dono.$transaction(async (tx) => {
          await tx.$executeRawUnsafe('SET LOCAL ROLE sii_auditor');
          return tx.$queryRawUnsafe(`SELECT count(*) FROM ${tabela}`);
        }),
      ).rejects.toThrow(/permission denied/);
    await expect(
      dono.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET LOCAL ROLE sii_auditor');
        return tx.$queryRawUnsafe('SELECT count(*)::int AS n FROM indicadores.indicador_snapshot');
      }),
    ).resolves.toEqual([{ n: expect.any(Number) }]);
  });

  it('relatório em PDF com linha de base, valor atual e meta de cada indicador', async () => {
    const r = await http()
      .get('/api/v1/indicadores/relatorio?formato=pdf')
      .set(await como('tce.auditor'))
      .buffer(true)
      .parse(binario)
      .expect(200);
    expect(r.headers['content-type']).toBe('application/pdf');
    const pdf = r.body as Buffer;
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    const painel = await http()
      .get('/api/v1/indicadores/controle-externo')
      .set(await como('tce.auditor'));
    // O pdfkit quebra as linhas dentro das células: compara sem espaços.
    const semEspaco = (t: string) => t.replace(/[\s\u00b7]+/g, '');
    const texto = semEspaco(textoDoPdf(pdf));
    expect(texto).toContain(semEspaco('Relatório semestral ao TCE-RO'));
    for (const i of painel.body.indicadores) {
      for (const campo of [i.nome, i.linhaBase, i.atual, i.meta])
        expect(texto).toContain(semEspaco(campo));
    }
    expect(texto).toContain(painel.body.trilhas[0].verificador);
    const registro = await dono.relatorioSemestral.findUniqueOrThrow({
      where: { id: Number(r.headers['x-relatorio-id']) },
    });
    const { createHash } = await import('node:crypto');
    expect(registro.sha256).toBe(createHash('sha256').update(pdf).digest('hex'));
    expect(registro.sha256).toBe(r.headers['x-relatorio-sha256']);
  });

  it('relatório em XLSX com as mesmas colunas', async () => {
    const r = await http()
      .get('/api/v1/indicadores/relatorio?formato=xlsx')
      .set(await como('comite.gestor'))
      .buffer(true)
      .parse(binario)
      .expect(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(r.body as never);
    const ws = wb.getWorksheet('Indicadores');
    expect(ws?.getRow(1).values).toEqual(
      expect.arrayContaining(['Linha de base', 'Atual', 'Meta']),
    );
    const linhas = (ws?.getRows(2, INDICADORES.length) ?? []).map((l) => l.getCell(3).value);
    expect(linhas).toEqual(INDICADORES.map((i) => i.nome));
    const vac = ws
      ?.getRows(2, INDICADORES.length)
      ?.find((l) => l.getCell(3).value === 'Vacinação em dia, 0 a 6 anos');
    expect(vac?.getCell(4).value).toBe('71,4% (nov/25)');
    expect(vac?.getCell(6).value).toBe('85%');
    expect(wb.getWorksheet('Trilhas')?.rowCount).toBeGreaterThan(1);
  });

  it('semestre inválido ou futuro: 422; formato inválido: 422', async () => {
    const h = await como('comite.gestor');
    expect(
      (await http().get('/api/v1/indicadores/controle-externo?semestre=2099-S1').set(h)).status,
    ).toBe(422);
    expect(
      (await http().get('/api/v1/indicadores/controle-externo?semestre=abc').set(h)).status,
    ).toBe(422);
    expect((await http().get('/api/v1/indicadores/relatorio?formato=doc').set(h)).status).toBe(422);
  });

  it('OE5: relatório do semestre anterior entregue pela CTI conta no indicador', async () => {
    const anterior = `${SEMESTRE.slice(0, 4)}-S1`;
    const r = await http()
      .get(`/api/v1/indicadores/relatorio?semestre=${anterior}&formato=pdf`)
      .set(await como('cti.admin'))
      .buffer(true)
      .parse(binario)
      .expect(200);
    const id = Number(r.headers['x-relatorio-id']);
    await http()
      .post(`/api/v1/indicadores/relatorios/${id}/entregar`)
      .set(await como('tce.auditor'))
      .expect(403);
    await http()
      .post(`/api/v1/indicadores/relatorios/${id}/entregar`)
      .set(await como('cti.admin'))
      .expect(200);
    await executarIndicadores(dono as never, { referencia: hojeEmPortoVelho() });
    const painel = await http()
      .get('/api/v1/indicadores/controle-externo')
      .set(await como('comite.gestor'));
    const oe5 = painel.body.indicadores.find(
      (i: { codigo: string }) => i.codigo === 'RELATORIOS_ENTREGUES',
    );
    expect(oe5).toMatchObject({ atual: '1 de 1', situacao: 'EM_DIA' });
  });

  it('metas: o Comitê cria uma versão nova; o auditor não', async () => {
    const corpo = {
      linhaBase: 29.1,
      dataBase: '2025-11-01',
      meta: 45,
      metaTexto: null,
      prazo: '2028-12-31',
    };
    await http()
      .put('/api/v1/indicadores/metas/CRECHE_0_3')
      .set(await como('tce.auditor'))
      .send(corpo)
      .expect(403);
    const r = await http()
      .put('/api/v1/indicadores/metas/CRECHE_0_3')
      .set(await como('comite.gestor'))
      .send(corpo)
      .expect(200);
    expect(r.body).toEqual({ indicador: 'CRECHE_0_3', versao: 2 });
    await http()
      .put('/api/v1/indicadores/metas/XYZ')
      .set(await como('comite.gestor'))
      .send(corpo)
      .expect(404);
    const sem = await http()
      .put('/api/v1/indicadores/metas/CRECHE_0_3')
      .set(await como('comite.gestor'))
      .send({ ...corpo, dataBase: null });
    expect(sem.status).toBe(422);
    const painel = await http()
      .get('/api/v1/indicadores/controle-externo')
      .set(await como('tce.auditor'));
    expect(
      painel.body.indicadores.find((i: { codigo: string }) => i.codigo === 'CRECHE_0_3').meta,
    ).toBe('45%');
  });
});

describe('trilha verificada pelo código verificador (P16)', () => {
  it('confere com o verificador certo e não confere com outro; mostra só tipo e data', async () => {
    const h = await como('tce.auditor');
    const painel = await http().get('/api/v1/indicadores/controle-externo').set(h);
    const t = painel.body.trilhas[0];
    const ok = await http()
      .post('/api/v1/auditoria/verificar-trilha')
      .set(h)
      .send({ caso: t.codigo.toLowerCase(), verificador: t.verificador.replace(/-/g, ' ') })
      .expect(200);
    expect(ok.body).toMatchObject({
      caso: t.codigo,
      integra: true,
      confere: true,
      eventos: t.eventos,
    });
    expect(Object.keys(ok.body.linhaDoTempo[0]).sort()).toEqual(['quando', 'seq', 'tipo']);
    const errado = await http()
      .post('/api/v1/auditoria/verificar-trilha')
      .set(h)
      .send({ caso: t.codigo, verificador: 'AAAA-BBBB-CCCC' })
      .expect(200);
    expect(errado.body).toMatchObject({ integra: true, confere: false });
    await http()
      .post('/api/v1/auditoria/verificar-trilha')
      .set(h)
      .send({ caso: 'BA-1999-0001', verificador: 'AAAA-BBBB-CCCC' })
      .expect(404);
    const invalido = await http()
      .post('/api/v1/auditoria/verificar-trilha')
      .set(h)
      .send({ caso: 'x', verificador: '1' });
    expect(invalido.status).toBe(422);
    expect(Object.keys(invalido.body.campos).sort()).toEqual(['caso', 'verificador']);
    await http()
      .post('/api/v1/auditoria/verificar-trilha')
      .set(await como('escola.custodio'))
      .send({ caso: t.codigo, verificador: t.verificador })
      .expect(403);
  });
});

describe('painel do DPO (P16)', () => {
  it('filtra por pessoa (código da ficha), usuário, período e CPF por POST; exporta CSV sem o número', async () => {
    // CPF fictício do seed é sorteado: escolhe uma criança cujo CPF tenha dígitos verificadores válidos.
    const chave = chaveDeHex(process.env.CHAVE_CIFRA ?? '', 'CHAVE_CIFRA');
    const candidatas = await dono.pessoaMestra.findMany({
      where: { cpfCifrado: { not: null }, dataNascimento: { gt: new Date('2010-01-01') } },
      select: { id: true, cpfCifrado: true },
      orderBy: { id: 'asc' },
    });
    const aluno = candidatas.find((p) =>
      normalizarCpf(decifrar(p.cpfCifrado as Uint8Array, chave)),
    );
    if (!aluno) throw new Error('seed sem criança com CPF válido');
    // A trilha de acessos acumula entre execuções do teste: começa limpa para esta pessoa.
    await dono.acessoDadoPessoal.deleteMany({ where: { pessoaId: aluno.id } });
    const revelado = await http()
      .post(`/api/v1/fichas/${aluno.id}/revelar-cpf`)
      .set(await como('comite.gestor'))
      .send({ finalidade: 'ENCAMINHAMENTO_REDE' })
      .expect(200);
    const cpf = revelado.body.cpf as string;
    const dpo = await como('dpo.encarregado');
    const hoje = hojeEmPortoVelho();

    const porRegistro = await http()
      .get(`/api/v1/auditoria/acessos?registro=ci-${aluno.id}`)
      .set(dpo)
      .expect(200);
    expect(porRegistro.body.total).toBe(1);
    expect(porRegistro.body.acessos[0]).toMatchObject({
      registro: `CI-${aluno.id}`,
      perfil: 'COMITE_GESTOR',
    });
    const porUsuario = await http()
      .get(`/api/v1/auditoria/acessos?usuario=comite.gestor&de=${hoje}&ate=${hoje}`)
      .set(dpo);
    expect(porUsuario.body.total).toBeGreaterThanOrEqual(1);
    const outroDia = await http()
      .get('/api/v1/auditoria/acessos?usuario=comite.gestor&de=2020-01-01&ate=2020-01-02')
      .set(dpo);
    expect(outroDia.body.total).toBe(0);

    const porCpf = await http()
      .post('/api/v1/auditoria/acessos/por-cpf')
      .set(dpo)
      .send({ cpf })
      .expect(200);
    expect(porCpf.body).toMatchObject({ encontrada: true, registro: `CI-${aluno.id}` });
    // O acesso do Comitê e a própria consulta do DPO.
    expect(porCpf.body.acessos.map((a: { perfil: string }) => a.perfil).sort()).toEqual([
      'COMITE_GESTOR',
      'DPO',
    ]);
    expect(JSON.stringify(porCpf.body)).not.toContain(cpf.replace(/\D/g, ''));
    const naoExiste = await http()
      .post('/api/v1/auditoria/acessos/por-cpf')
      .set(dpo)
      .send({ cpf: '529.982.247-25' });
    expect(naoExiste.body).toMatchObject({ encontrada: false, total: 0 });
    const ruim = await http()
      .post('/api/v1/auditoria/acessos/por-cpf')
      .set(dpo)
      .send({ cpf: '123' });
    expect(ruim.status).toBe(422);
    expect(JSON.stringify(ruim.body)).not.toContain('123');
    await http()
      .post('/api/v1/auditoria/acessos/por-cpf')
      .set(await como('tce.auditor'))
      .send({ cpf })
      .expect(403);

    const csv = await http()
      .get(`/api/v1/auditoria/acessos.csv?registro=CI-${aluno.id}`)
      .set(dpo)
      .expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain(
      '"Quando";"Login";"Nome";"Perfil";"Registro";"Campo";"Finalidade";"IP"',
    );
    expect(csv.text).toContain(`CI-${aluno.id}`);
    expect(csv.text).not.toContain(cpf.replace(/\D/g, ''));
  });
});
