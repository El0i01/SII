import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  cascataGeocodificacao,
  type CandidatoGeo,
  normalizarEndereco,
  type PontoGps,
} from '@sii/shared';
import { type ContextoBanco, PrismaService } from '../banco/prisma.service';
import { ErroApi } from '../comum/erros';
import { RedisService } from '../redis/redis.service';
import { type Camada, CONSULTA_CAMADA, toleranciaPorZoom } from './camadas';

const CACHE_SEGUNDOS = 24 * 3600;
const nomeChave = (camada: Camada, faixa: string) => `geo:${camada}:${faixa}`;

const domicilioNaoEncontrado = () =>
  new ErroApi(
    HttpStatus.NOT_FOUND,
    'DOMICILIO_NAO_ENCONTRADO',
    'Domicílio não encontrado no seu território.',
  );

@Injectable()
export class TerritorioService {
  private readonly logger = new Logger('territorio');

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** GeoJSON da camada, simplificado pelo zoom, com cache no Redis (24 h ou até a próxima carga). */
  async geojson(camada: Camada, zoom: number): Promise<{ corpo: string; cache: 'HIT' | 'MISS' }> {
    const { faixa, tolerancia } = toleranciaPorZoom(zoom);
    const chave = nomeChave(camada, faixa);
    const guardado = await this.redis.get(chave).catch(() => null);
    if (guardado) return { corpo: guardado, cache: 'HIT' };

    const [linha] = await this.prisma.$queryRawUnsafe<{ fc: string }[]>(
      `SELECT json_build_object('type', 'FeatureCollection', 'features', coalesce(json_agg(json_build_object(
                'type', 'Feature',
                'geometry', ST_AsGeoJSON(CASE WHEN $1::float8 > 0 THEN ST_SimplifyPreserveTopology(c.geom, $1::float8) ELSE c.geom END, 6)::json,
                'properties', c.props)), '[]'::json))::text AS fc
       FROM (${CONSULTA_CAMADA[camada]}) c`,
      tolerancia,
    );
    const corpo = linha?.fc ?? '{"type":"FeatureCollection","features":[]}';
    await this.redis.set(chave, corpo, 'EX', CACHE_SEGUNDOS).catch(() => {
      this.logger.warn(`sem cache para ${chave} (Redis fora do ar)`);
    });
    return { corpo, cache: 'MISS' };
  }

  /** Logradouros parecidos com o texto digitado (pg_trgm), opcionalmente só dentro de um setor. */
  async buscarLogradouros(texto: string, setor?: string) {
    const q = normalizarEndereco(texto);
    if (q.length < 3) return [];
    return this.prisma.$queryRaw<{ nome: string; tipo: string | null; similaridade: number }[]>`
      SELECT l.nome, l.tipo, round(similarity(l.nome_normalizado, ${q})::numeric, 2)::float AS similaridade
      FROM territorio.logradouro l
      WHERE similarity(l.nome_normalizado, ${q}) >= 0.3
        AND (${setor ?? null}::text IS NULL OR EXISTS (
              SELECT 1 FROM territorio.setor s WHERE s.codigo = ${setor ?? null} AND ST_Intersects(s.geom, l.geom)))
      ORDER BY similaridade DESC, l.nome
      LIMIT 10`;
  }

  /** Candidatos da cascata (§3.2) disponíveis hoje para um domicílio. */
  async candidatos(domicilioId: number): Promise<CandidatoGeo[]> {
    const linhas = await this.prisma.$queryRaw<
      { fonte: CandidatoGeo['fonte']; lon: number; lat: number; precisao: number | null }[]
    >`
      SELECT 'CONFIRMADO_USUARIO' AS fonte, ST_X(d.ponto) AS lon, ST_Y(d.ponto) AS lat, d.geo_precisao_m AS precisao
        FROM territorio.domicilio d
       WHERE d.id = ${domicilioId} AND d.geo_fonte = 'CONFIRMADO_USUARIO' AND d.ponto IS NOT NULL
      UNION ALL
      SELECT 'LOTE', ST_X(ST_PointOnSurface(l.geom)), ST_Y(ST_PointOnSurface(l.geom)), NULL
        FROM territorio.domicilio d JOIN territorio.lote l ON l.id = d.lote_id
       WHERE d.id = ${domicilioId} AND l.geom IS NOT NULL
      UNION ALL
      SELECT 'SETOR', ST_X(ST_PointOnSurface(s.geom)), ST_Y(ST_PointOnSurface(s.geom)),
             round(sqrt(ST_Area(s.geom::geography) / pi()))
        FROM territorio.domicilio d JOIN territorio.setor s ON s.id = d.setor_id
       WHERE d.id = ${domicilioId} AND s.geom IS NOT NULL`;
    // CENSO_GPS, ESUS_TERRITORIO, CNEFE e SIGEF_CAR entram quando as cargas existirem (P08, P09).
    return linhas.map((l) => ({
      fonte: l.fonte,
      lat: Number(l.lat),
      lon: Number(l.lon),
      ...(l.precisao !== null ? { precisaoM: Number(l.precisao) } : {}),
    }));
  }

  /** Aplica a cascata e grava o ponto escolhido. Ponto confirmado em campo nunca é sobrescrito. */
  async geocodificar(domicilioId: number) {
    const existe = await this.prisma.domicilio.findUnique({
      where: { id: domicilioId },
      select: { id: true },
    });
    if (!existe) throw domicilioNaoEncontrado();
    const escolhido = cascataGeocodificacao(await this.candidatos(domicilioId));
    if (!escolhido) return null;
    if (escolhido.fonte !== 'CONFIRMADO_USUARIO') {
      await this.prisma.$executeRaw`
        UPDATE territorio.domicilio
           SET ponto = ST_SetSRID(ST_MakePoint(${escolhido.lon}, ${escolhido.lat}), 4674),
               geo_fonte = ${escolhido.fonte}::territorio."FonteGeo", geo_precisao_m = ${escolhido.precisaoM}
         WHERE id = ${domicilioId}`;
    }
    return escolhido;
  }

  /**
   * O usuário confirma ou ajusta o pino em campo (§3.2): vira CONFIRMADO_USUARIO, com a precisão
   * do GPS. Só no próprio escopo (a RLS esconde domicílios de quem não pode ver ninguém lá).
   */
  async confirmarPonto(ctx: ContextoBanco, domicilioId: number, ponto: PontoGps) {
    const visivel = await this.prisma.comoUsuario(ctx, (tx) =>
      tx.pessoaMestra.findFirst({ where: { domicilioId }, select: { id: true } }),
    );
    if (!visivel) throw domicilioNaoEncontrado();

    const [dentro] = await this.prisma.$queryRaw<{ ok: boolean }[]>`
      SELECT ST_Intersects(geom, ST_SetSRID(ST_MakePoint(${ponto.longitude}, ${ponto.latitude}), 4674)) AS ok
      FROM territorio.limite_municipal WHERE id = 1`;
    if (dentro && !dentro.ok) {
      throw new ErroApi(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'VALIDACAO',
        'Confira os campos destacados.',
        {
          latitude: ['O ponto está fora de Itapuã do Oeste.'],
        },
      );
    }
    await this.prisma.$executeRaw`
      UPDATE territorio.domicilio
         SET ponto = ST_SetSRID(ST_MakePoint(${ponto.longitude}, ${ponto.latitude}), 4674),
             geo_fonte = 'CONFIRMADO_USUARIO', geo_precisao_m = ${ponto.precisaoM}, confirmado_em = now()
       WHERE id = ${domicilioId}`;
    return { domicilioId, geoFonte: 'CONFIRMADO_USUARIO' as const, precisaoM: ponto.precisaoM };
  }

  /** Cobertura por fonte e precisão por setor (agregado; contagens < 5 suprimidas). */
  async relatorioGeocodificacao() {
    const linhas = await this.prisma.$queryRaw<
      {
        setor: string;
        fonte: string | null;
        n: bigint;
        media: number | null;
        mediana: number | null;
      }[]
    >`
      SELECT s.codigo AS setor, d.geo_fonte::text AS fonte, count(*) AS n,
             round(avg(d.geo_precisao_m)::numeric, 1)::float AS media,
             round(percentile_cont(0.5) WITHIN GROUP (ORDER BY d.geo_precisao_m)::numeric, 1)::float AS mediana
      FROM territorio.domicilio d JOIN territorio.setor s ON s.id = d.setor_id
      GROUP BY GROUPING SETS ((s.codigo, d.geo_fonte), (s.codigo))
      ORDER BY 1, 2 NULLS FIRST`;
    const supr = (n: number) => (n < 5 ? '<5' : n);
    const porSetor = new Map<
      string,
      {
        setor: string;
        domicilios: number | '<5';
        precisaoMediaM: number | null;
        precisaoMedianaM: number | null;
        porFonte: Record<string, number | '<5'>;
      }
    >();
    for (const l of linhas) {
      const n = Number(l.n);
      if (l.fonte === null) {
        porSetor.set(l.setor, {
          setor: l.setor,
          domicilios: supr(n),
          precisaoMediaM: n < 5 ? null : l.media,
          precisaoMedianaM: n < 5 ? null : l.mediana,
          porFonte: {},
        });
      } else {
        const s = porSetor.get(l.setor);
        if (s) s.porFonte[l.fonte] = supr(n);
      }
    }
    return [...porSetor.values()];
  }
}
