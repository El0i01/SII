import { HttpStatus, Injectable } from '@nestjs/common';
import {
  diasCorridosEntre,
  type FonteGeo,
  hojeEmPortoVelho,
  idadeEm,
  idosoSozinhoSemVisita,
  iniciais,
  type IndicadoresQuadra,
  loteIrregular,
  pcfAtrasada,
  type PessoaNaQuadra,
  perfilVeDadoNominal,
  somarPessoas,
  suprimirIndicadores,
} from '@sii/shared';
import { PrismaService } from '../banco/prisma.service';
import { ErroApi } from '../comum/erros';
import type { UsuarioAutenticado } from '../comum/usuario-autenticado';
import { avaliar } from '../fichas/fichas.service';
import { consultaFichas, type LinhaFicha } from '../fichas/consulta-fichas';
import { Prisma } from '../generated/prisma/client';
import { consultaQuadras } from '../territorio/camadas';

type Consulta = Pick<Prisma.TransactionClient, '$queryRaw'>;

/** Uma pessoa que mora numa quadra, só com o que o mapa precisa (nunca CPF, NIS ou CNS). */
interface LinhaPessoa {
  id: number;
  nome: string;
  nascimento: Date | null;
  quadra_id: number;
  lote: number;
  moradores: number | null;
  ultima_visita_acs: Date | null;
  pcf: boolean;
  pcf_ultima: Date | null;
  busca_ativa: boolean;
  lon: number | null;
  lat: number | null;
}

interface PessoaAvaliada extends PessoaNaQuadra {
  linha: LinhaPessoa;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
/** 5 casas (~1 m): o suficiente para o calor, sem fingir precisão que a fonte não tem. */
const coord = (v: number) => Math.round(v * 1e5) / 1e5;

const quadraNaoEncontrada = () =>
  new ErroApi(HttpStatus.NOT_FOUND, 'QUADRA_NAO_ENCONTRADA', 'Quadra não encontrada.');

/**
 * Mapa do Território (P15). Os indicadores de todas as camadas saem num pedido só, para a troca de
 * camada ficar no navegador. Perfis nominais contam pelo `comoUsuario` (a RLS recorta); auditor do
 * TCE e Fazenda contam pelo cliente dono e recebem contagens < 5 suprimidas, sem ponto individual
 * e sem morador.
 */
@Injectable()
export class MapaService {
  constructor(private readonly prisma: PrismaService) {}

  /** Pessoas com domicílio em lote, já avaliadas (motivos de visita da ficha para 0 a 17). */
  private async pessoas(db: Consulta, hoje: string, quadraId?: number): Promise<PessoaAvaliada[]> {
    const filtro = quadraId ? Prisma.sql`AND l.quadra_id = ${quadraId}` : Prisma.empty;
    const linhas = await db.$queryRaw<LinhaPessoa[]>`
      SELECT p.id, p.nome, p.data_nascimento AS nascimento, l.quadra_id, l.numero::int AS lote,
             d.moradores::int AS moradores, s.ultima_visita_acs,
             (pcf.pessoa_id IS NOT NULL) AS pcf, pcf.ultima_visita_em AS pcf_ultima,
             EXISTS (SELECT 1 FROM casos.caso c WHERE c.pessoa_id = p.id
                      AND c.tipo = 'BUSCA_ATIVA_ESCOLAR' AND c.encerrado_em IS NULL) AS busca_ativa,
             ST_X(d.ponto) AS lon, ST_Y(d.ponto) AS lat
      FROM pessoas.pessoa_mestra p
      JOIN territorio.domicilio d ON d.id = p.domicilio_id
      JOIN territorio.lote l ON l.id = d.lote_id
      LEFT JOIN saude.sinalizador_saude s ON s.pessoa_id = p.id
      LEFT JOIN LATERAL (SELECT x.pessoa_id, x.ultima_visita_em FROM assistencia.crianca_feliz x
                         WHERE x.pessoa_id = p.id AND x.ativo
                         ORDER BY x.ultima_visita_em DESC NULLS LAST LIMIT 1) pcf ON true
      WHERE true ${filtro}`;
    // "Precisa de visita" é o mesmo da ficha da criança (motivosVisitaCrianca, P12).
    const fichas = await db.$queryRaw<LinhaFicha[]>(consultaFichas(hoje));
    const comMotivo = new Set(
      fichas
        .map((f) => avaliar(f, hoje))
        .filter((a) => a.motivos.length > 0)
        .map((a) => a.linha.id),
    );
    const dias = (d: Date | null) => (d ? diasCorridosEntre(iso(d), hoje) : null);
    return linhas.map((l) => ({
      linha: l,
      quadraId: l.quadra_id,
      idade: l.nascimento ? idadeEm(iso(l.nascimento), hoje) : null,
      moradores: l.moradores,
      diasSemVisitaAcs: dias(l.ultima_visita_acs),
      pcf: l.pcf ? { diasSemVisita: dias(l.pcf_ultima) } : null,
      precisaVisita: comMotivo.has(l.id),
      buscaAtivaAberta: l.busca_ativa,
    }));
  }

  /** O que não é dado pessoal: quadra, IVM, lotes e domicílios por fonte. */
  private async territorio(territorio: string | null, quadraId?: number) {
    const quadras = await this.prisma.$queryRawUnsafe<
      {
        id: number;
        codigo: string;
        setor: string;
        provisoria: boolean;
        ivm: number | null;
        lon: number | null;
        lat: number | null;
      }[]
    >(
      `SELECT (c.props->>'id')::int AS id, c.props->>'codigo' AS codigo, c.props->>'setor' AS setor,
              (c.props->>'provisoria')::boolean AS provisoria, (c.props->>'ivm')::float AS ivm,
              ST_X(ST_PointOnSurface(c.geom)) AS lon, ST_Y(ST_PointOnSurface(c.geom)) AS lat
       FROM (${consultaQuadras(false)}) c
       WHERE ($1::text IS NULL OR c.props->>'setor' = $1) AND ($2::int IS NULL OR (c.props->>'id')::int = $2)
       ORDER BY c.props->>'setor', c.props->>'codigo'`,
      territorio,
      quadraId ?? null,
    );
    const lotes = await this.prisma.$queryRaw<{ quadra_id: number; situacao: string; n: number }[]>`
      SELECT quadra_id, situacao::text AS situacao, count(*)::int AS n
      FROM territorio.lote GROUP BY 1, 2`;
    const dom = await this.prisma.$queryRaw<
      { quadra_id: number; fonte: FonteGeo | null; n: number }[]
    >`
      SELECT l.quadra_id, d.geo_fonte::text AS fonte, count(*)::int AS n
      FROM territorio.domicilio d JOIN territorio.lote l ON l.id = d.lote_id GROUP BY 1, 2`;
    return { quadras, lotes, dom };
  }

  private montar(
    t: Awaited<ReturnType<MapaService['territorio']>>,
    pessoas: PessoaAvaliada[],
    agregado: boolean,
  ): IndicadoresQuadra[] {
    const somas = somarPessoas(pessoas);
    return t.quadras.map((q) => {
      const lotes = t.lotes.filter((l) => l.quadra_id === q.id);
      const dom = t.dom.filter((d) => d.quadra_id === q.id);
      const porFonte: Partial<Record<FonteGeo, number>> = {};
      for (const d of dom) if (d.fonte) porFonte[d.fonte] = d.n;
      const s = somas.get(q.id);
      const ind: IndicadoresQuadra = {
        id: q.id,
        codigo: q.codigo,
        setor: q.setor,
        provisoria: q.provisoria,
        centro: q.lon === null || q.lat === null ? null : [coord(q.lon), coord(q.lat)],
        ivm: q.ivm,
        lotes: lotes.reduce((a, l) => a + l.n, 0),
        lotesIrregulares: lotes
          .filter((l) => loteIrregular(l.situacao))
          .reduce((a, l) => a + l.n, 0),
        domicilios: dom.reduce((a, d) => a + d.n, 0),
        domiciliosPorFonte: porFonte,
        criancas03: s?.criancas03 ?? 0,
        criancasVisita: s?.criancasVisita ?? 0,
        familiasPcf: s?.familiasPcf ?? 0,
        pcfAtrasadas: s?.pcfAtrasadas ?? 0,
        idosos: s?.idosos ?? 0,
        idososSozinhos: s?.idososSozinhos ?? 0,
        idososSozinhosSemVisita: s?.idososSozinhosSemVisita ?? 0,
        casosBuscaAtiva: s?.casosBuscaAtiva ?? 0,
      };
      return agregado ? suprimirIndicadores(ind) : ind;
    });
  }

  /** Pessoas do jeito certo para o perfil: RLS para os nominais, cliente dono para os agregados. */
  private avaliarPessoas(u: UsuarioAutenticado, hoje: string, quadraId?: number) {
    return perfilVeDadoNominal(u.perfil)
      ? this.prisma.comoUsuario(u, (tx) => this.pessoas(tx, hoje, quadraId))
      : this.pessoas(this.prisma, hoje, quadraId);
  }

  /** Zona rural: domicílios do setor rural, por fonte (não é dado pessoal; contagem suprimida). */
  private async rural(agregado: boolean) {
    const [r] = await this.prisma.$queryRaw<
      { domicilios: number; sigef: number; baixa: number; escolas: number }[]
    >`
      SELECT (SELECT count(*)::int FROM territorio.domicilio d JOIN territorio.setor s ON s.id = d.setor_id
               WHERE s.tipo = 'RURAL') AS domicilios,
             (SELECT count(*)::int FROM territorio.domicilio d JOIN territorio.setor s ON s.id = d.setor_id
               WHERE s.tipo = 'RURAL' AND d.geo_fonte = 'SIGEF_CAR') AS sigef,
             (SELECT count(*)::int FROM territorio.domicilio d JOIN territorio.setor s ON s.id = d.setor_id
               WHERE s.tipo = 'RURAL' AND d.geo_fonte = 'SETOR') AS baixa,
             (SELECT count(*)::int FROM territorio.equipamento e JOIN territorio.setor s ON ST_Intersects(s.geom, e.geom)
               WHERE s.tipo = 'RURAL' AND e.tipo::text LIKE 'ESCOLA%') AS escolas`;
    const base = r ?? { domicilios: 0, sigef: 0, baixa: 0, escolas: 0 };
    const pct = (n: number) =>
      base.domicilios === 0 || (agregado && base.domicilios < 5)
        ? null
        : Math.round((n * 100) / base.domicilios);
    return {
      domicilios: agregado && base.domicilios > 0 && base.domicilios < 5 ? null : base.domicilios,
      escolas: base.escolas,
      sigefPct: pct(base.sigef),
      baixaPrecisaoPct: pct(base.baixa),
    };
  }

  async quadras(u: UsuarioAutenticado, territorio: string | null) {
    const hoje = hojeEmPortoVelho();
    const agregado = !perfilVeDadoNominal(u.perfil);
    const [t, pessoas, rural, casosRurais] = await Promise.all([
      this.territorio(territorio),
      this.avaliarPessoas(u, hoje),
      this.rural(agregado),
      this.casosRurais(u),
    ]);
    return {
      agregado,
      quadras: this.montar(t, pessoas, agregado),
      rural: { ...rural, casosBuscaAtiva: agregado ? null : casosRurais },
    };
  }

  /** Casos de busca ativa abertos na zona rural (perfis nominais, pela RLS). */
  private async casosRurais(u: UsuarioAutenticado): Promise<number> {
    if (!perfilVeDadoNominal(u.perfil)) return 0;
    const [r] = await this.prisma.comoUsuario(
      u,
      (tx) =>
        tx.$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS n FROM casos.caso c JOIN territorio.setor s ON s.codigo = c.setor_codigo
        WHERE c.tipo = 'BUSCA_ATIVA_ESCOLAR' AND c.encerrado_em IS NULL AND s.tipo = 'RURAL'`,
    );
    return r?.n ?? 0;
  }

  /**
   * Pontos dos mapas de calor e do Criança Feliz, **só para perfis nominais** (a rota já barra os
   * outros). Nenhuma propriedade de pessoa: só coordenadas (e o atraso do PCF).
   */
  async pontos(u: UsuarioAutenticado, territorio: string | null) {
    const hoje = hojeEmPortoVelho();
    const [pessoas, quadras] = await Promise.all([
      this.prisma.comoUsuario(u, (tx) => this.pessoas(tx, hoje)),
      territorio
        ? this.territorio(territorio).then((t) => new Set(t.quadras.map((q) => q.id)))
        : null,
    ]);
    const visiveis = pessoas.filter(
      (p) => p.linha.lon !== null && p.linha.lat !== null && (!quadras || quadras.has(p.quadraId)),
    );
    const ponto = (p: PessoaAvaliada): [number, number] => [
      coord(p.linha.lon as number),
      coord(p.linha.lat as number),
    ];
    return {
      calor03: visiveis.filter((p) => p.idade !== null && p.idade <= 3).map(ponto),
      calorIdosos: visiveis
        .filter((p) => p.idade !== null && idosoSozinhoSemVisita({ ...p, idade: p.idade }))
        .map(ponto),
      pcf: visiveis
        .filter((p) => p.pcf)
        .map((p) => ({ c: ponto(p), atrasada: pcfAtrasada(p.pcf?.diasSemVisita ?? null) })),
    };
  }

  /** Detalhe da quadra: indicadores, lotes e (só perfis nominais) quem mora em cada lote. */
  async detalhe(u: UsuarioAutenticado, quadraId: number) {
    const hoje = hojeEmPortoVelho();
    const agregado = !perfilVeDadoNominal(u.perfil);
    const t = await this.territorio(null, quadraId);
    if (t.quadras.length === 0) throw quadraNaoEncontrada();
    const pessoas = await this.avaliarPessoas(u, hoje, quadraId);
    const [indicadores] = this.montar(t, pessoas, agregado);
    const lotes = await this.prisma.lote.findMany({
      where: { quadraId },
      select: { numero: true, situacao: true },
      orderBy: { numero: 'asc' },
    });
    return {
      indicadores,
      lotes: lotes.map((l) => ({
        numero: l.numero,
        situacao: l.situacao,
        moradores: agregado
          ? undefined
          : pessoas
              .filter((p) => p.linha.lote === l.numero)
              .sort((a, b) => (a.idade ?? 999) - (b.idade ?? 999))
              .map((p) => ({
                iniciais: iniciais(p.linha.nome),
                idade: p.idade,
                crianca: p.idade !== null && p.idade <= 17,
                idosa: p.idade !== null && p.idade >= 60,
                sozinha: p.idade !== null && p.idade >= 60 && p.moradores === 1,
                criancaFeliz: p.pcf !== null,
                precisaVisita: p.precisaVisita,
                buscaAtiva: p.buscaAtivaAberta,
                ...(p.idade !== null && p.idade <= 17 ? { fichaId: p.linha.id } : {}),
              })),
      })),
    };
  }
}
