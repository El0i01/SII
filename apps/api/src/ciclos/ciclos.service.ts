import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  type AprovarPesosIvm,
  codigoFicha,
  contarFaixas,
  contarPor,
  coortesCreche,
  CRITERIOS_EJA,
  CRITERIOS_IDOSA,
  CRITERIOS_INCLUSIVA,
  CRITERIOS_PRIMEIRA_INFANCIA,
  type CriancaInclusiva,
  type CriancaPrimeiraInfancia,
  dadosIdoso,
  diasCorridosEntre,
  ehTurmaEja,
  frequenciaMediaEja,
  type GrauInstrucao,
  hojeEmPortoVelho,
  idadeEm,
  type IdosoPainel,
  iniciais,
  motivosVisitaIdoso,
  ordenarPrioritarios,
  type PessoaEja,
  perfilVeDadoNominal,
  pesosVigentes,
  rankingIvm,
  type SetorCrecheEntrada,
  situacaoAee,
  suprimirContagens,
  type ValoresIvm,
} from '@sii/shared';
import { PrismaService } from '../banco/prisma.service';
import { ErroApi } from '../comum/erros';
import type { UsuarioAutenticado } from '../comum/usuario-autenticado';
import { avaliar } from '../fichas/fichas.service';
import { consultaFichas, type LinhaFicha } from '../fichas/consulta-fichas';
import type { Prisma } from '../generated/prisma/client';
import { RedisService } from '../redis/redis.service';
import { consultaQuadras } from '../territorio/camadas';

type Consulta = Pick<Prisma.TransactionClient, '$queryRaw' | '$queryRawUnsafe'>;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const dia = (s: string) => new Date(`${s}T00:00:00Z`);

/**
 * Painéis de ciclos de vida (§3.9, P19, ADR 0016). Perfis nominais leem por `comoUsuario` (a RLS
 * recorta o escopo, inclusive das listas); o auditor do TCE recebe só os agregados, pelo cliente
 * dono, com "< 5", e nunca as listas. As listas têm código da ficha, iniciais, idade, endereço e
 * sinais: nunca nome completo, CPF ou condição de saúde.
 */
@Injectable()
export class CiclosService {
  private readonly logger = new Logger('ciclos');

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  private async setores(t: string | null): Promise<{ codigo: string; nome: string }[]> {
    const s = await this.prisma.setor.findMany({
      select: { codigo: true, nome: true },
      orderBy: { codigo: 'asc' },
    });
    return t ? s.filter((x) => x.codigo === t) : s;
  }

  /** Executa a leitura no papel certo: RLS para os nominais, dono (e supressão) para o auditor. */
  private ler<T>(u: UsuarioAutenticado, fn: (db: Consulta) => Promise<T>): Promise<T> {
    return perfilVeDadoNominal(u.perfil) ? this.prisma.comoUsuario(u, fn) : fn(this.prisma);
  }

  private agregar<K extends string>(
    u: UsuarioAutenticado,
    c: ReturnType<typeof contarPor<unknown, K>>,
  ) {
    return perfilVeDadoNominal(u.perfil) ? c : suprimirContagens(c);
  }

  private async fichas(u: UsuarioAutenticado, hoje: string, t: string | null) {
    const linhas = await this.ler(u, (db) => db.$queryRaw<LinhaFicha[]>(consultaFichas(hoje)));
    return linhas.filter((l) => !t || l.setor_codigo === t).map((l) => avaliar(l, hoje));
  }

  // ─── Primeira infância ─────────────────────────────────────────────

  async primeiraInfancia(u: UsuarioAutenticado, t: string | null) {
    const hoje = hojeEmPortoVelho();
    const setores = await this.setores(t);
    const fichas = (await this.fichas(u, hoje, t)).filter((a) => a.idade <= 6);
    const dias = (d: Date | null) => (d ? diasCorridosEntre(iso(d), hoje) : null);
    const criancas: CriancaPrimeiraInfancia[] = fichas.map(({ linha: l, idade }) => ({
      setor: l.setor_codigo,
      idade,
      vacinacaoEmDia: l.vacinacao_em_dia,
      matriculada: l.matricula_id !== null,
      noCadunico: l.cad_atualizado !== null,
      pcf: l.pcf_visitador !== null ? { diasSemVisita: dias(l.pcf_ultima) } : null,
    }));
    const contagens = this.agregar(
      u,
      contarPor(
        criancas,
        (c) => c.setor,
        CRITERIOS_PRIMEIRA_INFANCIA,
        setores.map((s) => s.codigo),
      ),
    );
    const serie = await this.prisma.indicadorSnapshot.findMany({
      where: {
        indicador: 'VACINACAO_0_6',
        territorioCodigo: t ?? 'MUN',
        periodo: { contains: '-', not: { contains: 'V' } },
      },
      orderBy: { periodo: 'asc' },
      take: 12,
      select: { periodo: true, valor: true, suprimido: true },
    });
    const visitadores = new Set(fichas.map((a) => a.linha.pcf_visitador).filter(Boolean)).size;
    return {
      agregado: !perfilVeDadoNominal(u.perfil),
      setores,
      contagens,
      visitadores: perfilVeDadoNominal(u.perfil) ? visitadores : null,
      // Pré-natal adequado: a regra ainda depende da Saúde (§9); o sinalizador fica sem valor.
      preNatal: null,
      serieVacinacao: serie.map((s) => ({
        mes: s.periodo,
        valor: s.suprimido || s.valor === null ? null : Number(s.valor),
      })),
    };
  }

  // ─── Educação inclusiva ────────────────────────────────────────────

  async educacaoInclusiva(u: UsuarioAutenticado, t: string | null) {
    const hoje = hojeEmPortoVelho();
    const setores = await this.setores(t);
    const fichas = (await this.fichas(u, hoje, t)).filter((a) => a.linha.necessita_aee === true);
    const itens = fichas.map((a) => ({
      a,
      c: {
        setor: a.linha.setor_codigo,
        idade: a.idade,
        salaRecursos: a.linha.sala_recursos === true,
        apae: a.linha.apae === true,
        bpc: a.linha.bpc === true,
        matriculada: a.linha.matricula_id !== null,
        pcf: a.linha.pcf_visitador !== null,
      } satisfies CriancaInclusiva,
    }));
    const contagens = this.agregar(
      u,
      contarPor(
        itens.map((i) => i.c),
        (c) => c.setor,
        CRITERIOS_INCLUSIVA,
        setores.map((s) => s.codigo),
      ),
    );
    const semAtendimento = perfilVeDadoNominal(u.perfil)
      ? itens
          .filter((i) => situacaoAee(i.c) === 'SEM_ATENDIMENTO')
          .sort((x, y) => x.a.idade - y.a.idade)
          .map(({ a: { linha: l, idade } }) => ({
            fichaId: l.id,
            codigo: codigoFicha(l.id),
            iniciais: iniciais(l.nome),
            idade,
            endereco: [l.quadra ?? l.localidade, l.setor_nome ?? l.setor_codigo]
              .filter(Boolean)
              .join(' · '),
            escola: l.escola,
            cras: l.paif_tipo !== null,
            bpc: l.bpc === true,
          }))
      : undefined;
    return {
      agregado: !perfilVeDadoNominal(u.perfil),
      setores,
      contagens,
      ...(semAtendimento ? { semAtendimento } : {}),
    };
  }

  // ─── Pessoa idosa ──────────────────────────────────────────────────

  async pessoaIdosa(u: UsuarioAutenticado, t: string | null) {
    const hoje = hojeEmPortoVelho();
    const setores = await this.setores(t);
    const linhas = await this.ler(
      u,
      (db) =>
        db.$queryRaw<
          {
            id: number;
            nome: string;
            nascimento: Date;
            setor: string | null;
            setor_nome: string | null;
            quadra: string | null;
            localidade: string | null;
            moradores: number | null;
            ultima_visita_acs: Date | null;
            acamado: boolean | null;
            gripe: boolean | null;
            cronica: boolean | null;
            cronica_acomp: boolean | null;
            bpc: boolean;
            cras: boolean;
            scfv: boolean;
          }[]
        >`
        SELECT p.id, p.nome, p.data_nascimento AS nascimento, p.setor_codigo AS setor, st.nome AS setor_nome,
               q.codigo AS quadra, d.localidade, d.moradores::int AS moradores,
               s.ultima_visita_acs, s.acamado_domiciliado AS acamado, s.vacina_gripe_em_dia AS gripe,
               s.condicao_cronica AS cronica, s.condicao_cronica_acompanhada AS cronica_acomp,
               EXISTS (SELECT 1 FROM assistencia.bpc b WHERE b.pessoa_id = p.id AND b.ativo) AS bpc,
               EXISTS (SELECT 1 FROM pessoas.membro_familia mf JOIN assistencia.acompanhamento_paif a
                         ON a.familia_id = mf.familia_id AND a.fim_em IS NULL
                       WHERE mf.pessoa_id = p.id) AS cras,
               EXISTS (SELECT 1 FROM assistencia.scfv x WHERE x.pessoa_id = p.id) AS scfv
        FROM pessoas.pessoa_mestra p
        LEFT JOIN territorio.setor st ON st.codigo = p.setor_codigo
        LEFT JOIN territorio.domicilio d ON d.id = p.domicilio_id
        LEFT JOIN territorio.lote l ON l.id = d.lote_id
        LEFT JOIN territorio.quadra q ON q.id = l.quadra_id
        LEFT JOIN saude.sinalizador_saude s ON s.pessoa_id = p.id
        WHERE p.data_nascimento <= ${dia(hoje)}::date - interval '60 years'`,
    );
    const pessoas = linhas
      .filter((l) => !t || l.setor === t)
      .map((l) => {
        const p: IdosoPainel = {
          setor: l.setor,
          idade: idadeEm(iso(l.nascimento), hoje),
          sozinha: l.moradores === 1,
          diasSemVisitaAcs: l.ultima_visita_acs
            ? diasCorridosEntre(iso(l.ultima_visita_acs), hoje)
            : null,
          acamada: l.acamado === true,
          bpc: l.bpc,
          cras: l.cras,
          gripe: l.gripe,
          cronica: l.cronica === true,
          cronicaAcompanhada: l.cronica_acomp === true,
          scfv: l.scfv,
        };
        return { l, p };
      });
    const contagens = this.agregar(
      u,
      contarPor(
        pessoas.map((x) => x.p),
        (p) => p.setor,
        CRITERIOS_IDOSA,
        setores.map((s) => s.codigo),
      ),
    );
    const prioritarias = perfilVeDadoNominal(u.perfil)
      ? ordenarPrioritarios(
          pessoas.map(({ l, p }) => ({
            codigo: `PI-${l.id}`,
            iniciais: iniciais(l.nome),
            idade: p.idade,
            endereco: [l.quadra ?? l.localidade, l.setor_nome ?? l.setor]
              .filter(Boolean)
              .join(' · '),
            motivos: motivosVisitaIdoso(dadosIdoso(p)).map((m) => m.rotulo),
            diasSemVisitaAcs: p.diasSemVisitaAcs,
          })),
        )
      : undefined;
    return {
      agregado: !perfilVeDadoNominal(u.perfil),
      setores,
      contagens,
      ...(prioritarias ? { prioritarias } : {}),
    };
  }

  // ─── EJA ───────────────────────────────────────────────────────────

  async eja(u: UsuarioAutenticado, t: string | null) {
    const hoje = hojeEmPortoVelho();
    const ano = Number(hoje.slice(0, 4));
    const setores = await this.setores(t);
    const linhas = await this.ler(
      u,
      (db) =>
        db.$queryRaw<
          {
            setor: string | null;
            nascimento: Date;
            grau: string | null;
            sabe_ler: boolean | null;
            responsavel: boolean;
            turma: string | null;
            situacao: string | null;
            presencas: number;
            lancamentos: number;
            pai_de_aluno: boolean;
            scfv: boolean;
          }[]
        >`
        SELECT p.setor_codigo AS setor, p.data_nascimento AS nascimento, e.grau, e.sabe_ler,
               coalesce(e.responsavel, false) AS responsavel, m.turma, m.situacao,
               coalesce(f.presencas, 0)::int AS presencas, coalesce(f.lancamentos, 0)::int AS lancamentos,
               EXISTS (SELECT 1 FROM pessoas.membro_familia eu
                         JOIN pessoas.membro_familia filho ON filho.familia_id = eu.familia_id
                          AND filho.papel IN ('FILHO', 'NETO') AND filho.pessoa_id <> p.id
                         JOIN educacao.matricula mf ON mf.pessoa_id = filho.pessoa_id
                          AND mf.situacao = 'ATIVA' AND mf.ano = ${ano}
                       WHERE eu.pessoa_id = p.id AND eu.papel IN ('RESPONSAVEL', 'CONJUGE')) AS pai_de_aluno,
               EXISTS (SELECT 1 FROM assistencia.scfv x WHERE x.pessoa_id = p.id) AS scfv
        FROM pessoas.pessoa_mestra p
        LEFT JOIN LATERAL (SELECT mf.grau_instrucao AS grau, mf.sabe_ler, mf.papel = 'RESPONSAVEL' AS responsavel
                           FROM pessoas.membro_familia mf WHERE mf.pessoa_id = p.id
                           ORDER BY (mf.grau_instrucao IS NULL), mf.familia_id LIMIT 1) e ON true
        LEFT JOIN LATERAL (SELECT m.id, t.nome AS turma, m.situacao::text AS situacao
                           FROM educacao.matricula m LEFT JOIN educacao.turma t ON t.id = m.turma_id
                           WHERE m.pessoa_id = p.id AND m.ano = ${ano}
                           ORDER BY (m.situacao = 'ATIVA') DESC, m.id DESC LIMIT 1) m ON true
        LEFT JOIN LATERAL (SELECT count(*) FILTER (WHERE fr.situacao <> 'FALTA') AS presencas, count(*) AS lancamentos
                           FROM educacao.frequencia fr
                           WHERE fr.matricula_id = m.id AND fr.dia >= date_trunc('month', ${dia(hoje)}::date)) f ON true
        WHERE p.data_nascimento <= ${dia(hoje)}::date - interval '15 years'`,
    );
    const pessoas: (PessoaEja & { abandono: boolean })[] = linhas
      .filter((l) => !t || l.setor === t)
      .map((l) => {
        const eja = ehTurmaEja(l.turma);
        return {
          setor: l.setor,
          idade: idadeEm(iso(l.nascimento), hoje),
          grau: (l.grau as GrauInstrucao | null) ?? null,
          sabeLer: l.sabe_ler,
          matriculaRegular: !eja && l.situacao === 'ATIVA',
          matriculaEja: eja && l.situacao === 'ATIVA',
          frequenciaEja: eja && l.lancamentos > 0 ? (l.presencas * 100) / l.lancamentos : null,
          responsavelFamiliar: l.responsavel,
          paiDeAluno: l.pai_de_aluno,
          noScfv: l.scfv,
          abandono: eja && l.situacao === 'ABANDONO',
        };
      });
    const contagens = this.agregar(
      u,
      contarPor(
        pessoas,
        (p) => p.setor,
        CRITERIOS_EJA,
        setores.map((s) => s.codigo),
      ),
    );
    const ejaAno = pessoas.filter((p) => p.matriculaEja || p.abandono);
    const evasao =
      ejaAno.length >= 5
        ? Math.round((ejaAno.filter((p) => p.abandono).length * 1000) / ejaAno.length) / 10
        : null;
    const comFrequencia = pessoas.filter((p) => p.frequenciaEja !== null).length;
    return {
      agregado: !perfilVeDadoNominal(u.perfil),
      setores,
      contagens,
      frequenciaMedia:
        !perfilVeDadoNominal(u.perfil) && comFrequencia < 5 ? null : frequenciaMediaEja(pessoas),
      evasao,
    };
  }

  // ─── Vagas de creche ───────────────────────────────────────────────

  /** Setor de cada escola: pelo ponto do equipamento; sem ponto, pelo setor da maioria dos alunos. */
  private async escolas(ano: number) {
    return this.prisma.$queryRaw<
      {
        id: number;
        inep: string;
        nome: string;
        setor: string | null;
        vagas: number | null;
        turmas_creche: number;
      }[]
    >`
      SELECT e.id, e.inep, e.nome,
             coalesce(
               (SELECT s.codigo FROM territorio.setor s JOIN territorio.equipamento q ON q.id = e.equipamento_id
                 WHERE s.geom IS NOT NULL AND q.geom IS NOT NULL AND ST_Intersects(s.geom, q.geom) LIMIT 1),
               (SELECT p.setor_codigo FROM educacao.matricula m JOIN pessoas.pessoa_mestra p ON p.id = m.pessoa_id
                 WHERE m.escola_id = e.id AND p.setor_codigo IS NOT NULL
                 GROUP BY p.setor_codigo ORDER BY count(*) DESC, p.setor_codigo LIMIT 1)) AS setor,
             o.vagas,
             (SELECT count(*)::int FROM educacao.turma t WHERE t.escola_id = e.id AND t.ano = ${ano}
                AND (t.nome ILIKE 'berçário%' OR t.nome ILIKE 'maternal%' OR t.nome ILIKE 'creche%')) AS turmas_creche
      FROM educacao.escola e LEFT JOIN educacao.oferta_creche o ON o.escola_id = e.id AND o.ano = ${ano}
      ORDER BY e.nome`;
  }

  async vagasCreche(u: UsuarioAutenticado, t: string | null) {
    const hoje = hojeEmPortoVelho();
    const ano = Number(hoje.slice(0, 4));
    const anos = coortesCreche(ano);
    const setores = await this.setores(t);
    const [nascimentos, fila] = await this.ler(u, async (db) => [
      await db.$queryRaw<{ setor: string; ano: number; n: number }[]>`
        SELECT p.setor_codigo AS setor, extract(year FROM p.data_nascimento)::int AS ano, count(*)::int AS n
        FROM pessoas.pessoa_mestra p
        WHERE p.setor_codigo IS NOT NULL AND extract(year FROM p.data_nascimento)::int BETWEEN ${anos[0]} AND ${ano}
        GROUP BY 1, 2`,
      await db.$queryRaw<{ setor: string; n: number }[]>`
        SELECT p.setor_codigo AS setor, count(*)::int AS n
        FROM educacao.fila_creche f JOIN pessoas.pessoa_mestra p ON p.id = f.pessoa_id
        WHERE NOT f.atendida AND p.setor_codigo IS NOT NULL GROUP BY 1`,
    ]);
    const escolas = await this.escolas(ano);
    const ivm = await this.prisma.$queryRawUnsafe<{ setor: string; media: number | null }[]>(
      `SELECT c.props->>'setor' AS setor, avg((c.props->>'ivm')::float) AS media
       FROM (${consultaQuadras(false)}) c GROUP BY 1`,
    );
    const agregado = !perfilVeDadoNominal(u.perfil);
    const sup = (n: number) => (agregado && n > 0 && n < 5 ? null : n);
    const entrada: (SetorCrecheEntrada & { suprimido: boolean })[] = setores.map((s) => {
      const coortes = Object.fromEntries(
        anos.map((a) => [a, nascimentos.find((n) => n.setor === s.codigo && n.ano === a)?.n ?? 0]),
      );
      const suprimido = agregado && Object.values(coortes).some((n) => n > 0 && n < 5);
      return {
        setor: s.codigo,
        nome: s.nome,
        coortes,
        vagas: escolas.filter((e) => e.setor === s.codigo).reduce((a, e) => a + (e.vagas ?? 0), 0),
        fila: fila.find((f) => f.setor === s.codigo)?.n ?? 0,
        ivmMedio: Math.min(1, Math.max(0, ivm.find((i) => i.setor === s.codigo)?.media ?? 0)),
        suprimido,
      };
    });
    return {
      ano,
      coortes: anos,
      agregado,
      // O auditor recebe as coortes com "< 5" escondido: a simulação dele usa só os setores completos.
      setores: entrada.map((e) =>
        agregado
          ? {
              ...e,
              coortes: Object.fromEntries(Object.entries(e.coortes).map(([k, n]) => [k, sup(n)])),
              fila: sup(e.fila),
            }
          : e,
      ),
      escolas: escolas
        .filter((e) => (e.vagas ?? 0) > 0 || e.turmas_creche > 0)
        .filter((e) => !t || e.setor === t)
        .map((e) => ({ inep: e.inep, nome: e.nome, setor: e.setor, vagas: e.vagas ?? 0 })),
    };
  }

  /** A SEMED (ou a CTI) informa as vagas de creche da escola no ano. */
  async definirOferta(u: UsuarioAutenticado, inep: string, vagas: number) {
    const escola = await this.prisma.escola.findUnique({ where: { inep }, select: { id: true } });
    if (!escola)
      throw new ErroApi(HttpStatus.NOT_FOUND, 'ESCOLA_NAO_ENCONTRADA', 'Escola não encontrada.');
    const ano = Number(hojeEmPortoVelho().slice(0, 4));
    await this.prisma.ofertaCreche.upsert({
      where: { escolaId_ano: { escolaId: escola.id, ano } },
      create: { escolaId: escola.id, ano, vagas, atualizadoPorId: u.id },
      update: { vagas, atualizadoPorId: u.id },
    });
    return { inep, ano, vagas };
  }

  // ─── Índice de vulnerabilidade ─────────────────────────────────────

  private async versoesIvm() {
    const v = await this.prisma.pesosIvm.findMany({ orderBy: { versao: 'desc' } });
    const nomes = new Map(
      (
        await this.prisma.usuario.findMany({
          where: {
            id: { in: v.map((x) => x.aprovadoPorId).filter((x): x is number => x !== null) },
          },
          select: { id: true, nome: true },
        })
      ).map((x) => [x.id, x.nome]),
    );
    return v.map((x) => ({
      versao: x.versao,
      pesos: x.pesos as unknown as ValoresIvm,
      aprovadoEm: x.aprovadoEm?.toISOString() ?? null,
      aprovadoPor: x.aprovadoPorId ? (nomes.get(x.aprovadoPorId) ?? null) : null,
      justificativa: x.justificativa,
    }));
  }

  async ivm(t: string | null) {
    const linhas = await this.prisma.$queryRaw<
      {
        id: number;
        codigo: string;
        setor: string;
        domicilios: number;
        renda: number;
        saude: number;
        escola: number;
        imovel: number;
        regularizacao: number;
      }[]
    >`
      SELECT q.id, q.codigo, s.codigo AS setor,
             (SELECT count(*)::int FROM territorio.domicilio d JOIN territorio.lote l ON l.id = d.lote_id
               WHERE l.quadra_id = q.id) AS domicilios,
             d.renda::float AS renda, d.saude::float AS saude, d.escola::float AS escola,
             d.imovel::float AS imovel, d.regularizacao::float AS regularizacao
      FROM territorio.quadra q JOIN territorio.setor s ON s.id = q.setor_id
      JOIN LATERAL (SELECT * FROM indicadores.dimensao_ivm_quadra x WHERE x.quadra_id = q.id
                    ORDER BY x.periodo DESC LIMIT 1) d ON true
      WHERE ${t}::text IS NULL OR s.codigo = ${t}`;
    const versoes = await this.versoesIvm();
    const vigente = pesosVigentes(versoes);
    const quadras = linhas.map((l) => ({
      id: l.id,
      codigo: l.codigo,
      setor: l.setor,
      domicilios: l.domicilios,
      dimensoes: {
        renda: l.renda,
        saude: l.saude,
        escola: l.escola,
        imovel: l.imovel,
        regularizacao: l.regularizacao,
      },
    }));
    const ranking = rankingIvm(quadras, vigente.pesos);
    return { vigente, versoes, quadras: ranking, faixas: contarFaixas(ranking) };
  }

  /**
   * O Comitê aprova uma nova versão dos pesos: grava a versão n+1 já aprovada (por, em, por quê) e
   * apaga o cache do mapa, para a camada "Índice de vulnerabilidade" recalcular com os pesos novos.
   */
  async aprovarPesos(u: UsuarioAutenticado, a: AprovarPesosIvm) {
    const ultima = await this.prisma.pesosIvm.findFirst({
      orderBy: { versao: 'desc' },
      select: { versao: true },
    });
    const nova = await this.prisma.pesosIvm.create({
      data: {
        versao: (ultima?.versao ?? 0) + 1,
        pesos: a.pesos,
        aprovadoPorId: u.id,
        aprovadoEm: new Date(),
        justificativa: a.justificativa,
      },
    });
    try {
      const chaves = await this.redis.keys('geo:quadras:*');
      if (chaves.length) await this.redis.del(...chaves);
    } catch {
      this.logger.warn('cache do mapa não invalidado (Redis fora do ar): expira em 24 h');
    }
    return { versao: nova.versao, aprovadoEm: (nova.aprovadoEm as Date).toISOString() };
  }
}
