/**
 * Carga do geoportal (pnpm geo:carregar), P06. Ver docs/adr/0005-territorio-grade-geocodificacao.md.
 *
 * 1. Importa cada camada para stg_geoportal (infra/scripts/import-shapefile.sh: tudo em 4674).
 * 2. Grava a geometria no cadastro de referência: limite, setores, zona rural (limite − urbanos),
 *    equipamentos (pela tabela infra/geo/mapeamento.json), microáreas e logradouros.
 * 3. Gera a grade provisória: as quadras de cada setor viram células giradas no ângulo das ruas;
 *    cada quadra é dividida em 4 × 3 lotes. Tudo marcado provisória.
 * 4. Posiciona os domicílios sem ponto confirmado (dentro do lote; na zona rural, no polígono rural).
 * 5. Devolve o relatório de carga.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  anguloDominante,
  gradeGirada,
  normalizarEndereco,
  ordemDeLeitura,
  type Ponto,
  retanguloOrientado,
  subdividir,
} from '@sii/shared';
import type { PrismaClient } from '../../src/generated/prisma/client';
import { garantirCadastro } from '../../prisma/referencia/cadastro';

const RAIZ = path.resolve(__dirname, '../../../..');
const UTM = 31980; // SIRGAS 2000 / UTM zona 20S: metros, para a grade e as áreas.

interface Mapeamento {
  camadas: { tabela: string; arquivo: string; encoding?: string }[];
  equipamentos: { camada: string; campo: string; valor: string; codigo: string }[];
  setores: { codigo: string; camada: string }[];
  grade: {
    tamanhoInicialM: number;
    coberturaMinima: number;
    colunasLote: number;
    linhasLote: number;
  };
}

export function lerMapeamento(): Mapeamento {
  return JSON.parse(
    fs.readFileSync(path.join(RAIZ, 'infra/geo/mapeamento.json'), 'utf8'),
  ) as Mapeamento;
}

export interface RelatorioCarga {
  camadas: Record<string, number>;
  setoresComGeometria: number;
  equipamentosComGeometria: number;
  equipamentosSemFeicao: string[];
  microareasComGeometria: number;
  microareasDuplicadas: string[];
  logradouros: number;
  quadras: Record<
    string,
    { quadras: number; comGeometria: number; anguloGraus: number; tamanhoCelulaM: number }
  >;
  lotesComGeometria: number;
  domiciliosPosicionados: number;
}

type Anel = Ponto[];
type GeoJsonPoligono = { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown };

function aneisDe(g: GeoJsonPoligono): Anel[] {
  if (g.type === 'Polygon') return g.coordinates as Anel[];
  return (g.coordinates as Anel[][]).flat();
}

const anelParaGeoJson = (anel: Anel) => ({ type: 'Polygon', coordinates: [anel] });

/** Importa as camadas com o script do P02 (stg_geoportal.<tabela>). */
export function importarCamadas(
  dirGeoportal: string,
  databaseUrl: string,
  m = lerMapeamento(),
): void {
  const script = path.join(RAIZ, 'infra/scripts/import-shapefile.sh');
  for (const c of m.camadas) {
    const args = [
      path.join(dirGeoportal, c.arquivo),
      c.tabela,
      ...(c.encoding ? ['--encoding', c.encoding] : []),
    ];
    execFileSync(script, args, {
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'pipe',
    });
  }
}

/** Passos 2 a 5 (o banco já tem stg_geoportal carregado). */
export async function aplicarGeoportal(
  prisma: PrismaClient,
  m = lerMapeamento(),
): Promise<RelatorioCarga> {
  const rel: RelatorioCarga = {
    camadas: {},
    setoresComGeometria: 0,
    equipamentosComGeometria: 0,
    equipamentosSemFeicao: [],
    microareasComGeometria: 0,
    microareasDuplicadas: [],
    logradouros: 0,
    quadras: {},
    lotesComGeometria: 0,
    domiciliosPosicionados: 0,
  };

  for (const c of m.camadas) {
    const [l] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM stg_geoportal."${c.tabela}"`,
    );
    rel.camadas[c.tabela] = Number(l?.n ?? 0);
  }

  await prisma.$transaction(
    async (tx) => {
      await garantirCadastro(tx);

      // Limite municipal (IBGE).
      await tx.$executeRawUnsafe(`
        INSERT INTO territorio.limite_municipal (id, codigo_ibge, nome, geom)
        SELECT 1, cd_mun, nm_mun, ST_Multi(geom) FROM stg_geoportal.limite LIMIT 1
        ON CONFLICT (id) DO UPDATE SET codigo_ibge = EXCLUDED.codigo_ibge, nome = EXCLUDED.nome, geom = EXCLUDED.geom`);

      // Setores urbanos e industrial; zona rural = limite − urbanos.
      for (const s of m.setores) {
        await tx.$executeRawUnsafe(
          `UPDATE territorio.setor SET geom = (SELECT ST_Multi(ST_Union(geom)) FROM stg_geoportal."${s.camada}") WHERE codigo = $1`,
          s.codigo,
        );
      }
      await tx.$executeRawUnsafe(`
        UPDATE territorio.setor SET geom = (
          SELECT ST_Multi(ST_CollectionExtract(ST_Difference(l.geom, u.geom), 3))
          FROM territorio.limite_municipal l,
               (SELECT ST_Union(geom) AS geom FROM territorio.setor WHERE tipo = 'URBANO' AND geom IS NOT NULL) u)
        WHERE codigo = 'RUR'`);
      const [s] = await tx.$queryRaw<
        { n: bigint }[]
      >`SELECT count(*) AS n FROM territorio.setor WHERE geom IS NOT NULL`;
      rel.setoresComGeometria = Number(s?.n ?? 0);

      // Equipamentos pela tabela de mapeamento.
      for (const e of m.equipamentos) {
        const n = await tx.$executeRawUnsafe(
          `UPDATE territorio.equipamento SET geom = (
             SELECT ST_Union(geom) FROM stg_geoportal."${e.camada}" WHERE "${e.campo}"::text = $1
           ) WHERE codigo = $2 AND EXISTS (SELECT 1 FROM stg_geoportal."${e.camada}" WHERE "${e.campo}"::text = $1)`,
          e.valor,
          e.codigo,
        );
        if (n === 0)
          rel.equipamentosSemFeicao.push(`${e.codigo} (${e.camada}.${e.campo} = ${e.valor})`);
      }
      const [eq] = await tx.$queryRaw<
        { n: bigint }[]
      >`SELECT count(*) AS n FROM territorio.equipamento WHERE geom IS NOT NULL`;
      rel.equipamentosComGeometria = Number(eq?.n ?? 0);

      // Microáreas de ACS (arquivos trocados já resolvidos no mapeamento: acs_sede e acs_rural).
      for (const t of ['acs_sede', 'acs_rural']) {
        const dup = await tx.$queryRawUnsafe<{ regiao: string; n: bigint }[]>(
          `SELECT lower(regiao) AS regiao, count(*) AS n FROM stg_geoportal."${t}" GROUP BY 1 HAVING count(*) > 1`,
        );
        rel.microareasDuplicadas.push(...dup.map((d) => `${d.regiao} (${d.n} polígonos, unidos)`));
        await tx.$executeRawUnsafe(`
          UPDATE territorio.area_referencia a SET geom = x.geom
          FROM (SELECT lower(regiao) AS codigo, ST_Multi(ST_Union(geom)) AS geom FROM stg_geoportal."${t}" GROUP BY 1) x
          WHERE a.tipo = 'MICROAREA' AND a.codigo = x.codigo`);
      }
      const [ma] = await tx.$queryRaw<{ n: bigint }[]>`
        SELECT count(*) AS n FROM territorio.area_referencia WHERE tipo = 'MICROAREA' AND geom IS NOT NULL`;
      rel.microareasComGeometria = Number(ma?.n ?? 0);
      // Território do CRAS: o município inteiro (há um CRAS só).
      await tx.$executeRaw`
        UPDATE territorio.area_referencia SET geom = (SELECT geom FROM territorio.limite_municipal WHERE id = 1)
        WHERE tipo = 'TERRITORIO_CRAS'`;

      // Logradouros, com o nome normalizado pela mesma regra do shared.
      const ruas = await tx.$queryRaw<
        { gid: number; nome: string | null }[]
      >`SELECT gid, nome FROM stg_geoportal.ruas`;
      const normalizados = ruas.map((r) => ({
        gid: r.gid,
        nome: (r.nome ?? '').trim() || 'Sem nome',
        norm: normalizarEndereco(r.nome ?? '') || 'SEM NOME',
      }));
      await tx.$executeRaw`DELETE FROM territorio.logradouro`;
      rel.logradouros = await tx.$executeRawUnsafe(
        `INSERT INTO territorio.logradouro (nome, nome_normalizado, tipo, extensao_km, geom)
         SELECT x.nome, x.norm, r.rua, r.km, ST_Multi(ST_CollectionExtract(r.geom, 2))
         FROM stg_geoportal.ruas r JOIN json_to_recordset($1::json) AS x(gid int, nome text, norm text) ON x.gid = r.gid`,
        JSON.stringify(normalizados),
      );

      // Grade provisória por setor urbano, com o número de quadras que o setor já tem.
      const setores = await tx.$queryRaw<{ id: number; codigo: string; geojson: string }[]>`
        SELECT id, codigo, ST_AsGeoJSON(ST_Transform(geom, ${UTM}::int)) AS geojson
        FROM territorio.setor WHERE tipo = 'URBANO' AND geom IS NOT NULL ORDER BY codigo`;
      for (const setor of setores) {
        const quadras = await tx.quadra.findMany({
          where: { setorId: setor.id },
          orderBy: { codigo: 'asc' },
          select: { id: true },
        });
        if (quadras.length === 0) continue;
        const aneis = aneisDe(JSON.parse(setor.geojson) as GeoJsonPoligono);
        const angulo = anguloDominante(aneis);
        const resultado = await gerarCelulas(tx, setor.id, aneis, angulo, quadras.length, m.grade);
        const ordem = ordemDeLeitura(
          resultado.celulas.map((c) => c.centro),
          angulo,
          resultado.tamanho,
        );
        for (const [k, idx] of ordem.entries()) {
          const quadra = quadras[k];
          const celula = resultado.celulas[idx];
          if (!quadra || !celula) continue;
          await tx.$executeRaw`
            UPDATE territorio.quadra SET provisoria = true,
              geom = ST_Transform(ST_SetSRID(ST_Multi(ST_GeomFromGeoJSON(${celula.geojson})), ${UTM}::int), 4674)
            WHERE id = ${quadra.id}`;
          // Lotes: o retângulo orientado da quadra dividido em 4 × 3, recortado pela quadra.
          const partes = subdividir(
            retanguloOrientado(aneisDe(JSON.parse(celula.geojson) as GeoJsonPoligono), angulo),
            m.grade.colunasLote,
            m.grade.linhasLote,
          );
          await tx.$executeRawUnsafe(
            `UPDATE territorio.lote l SET geom = CASE WHEN ST_IsEmpty(x.g) THEN NULL ELSE ST_Transform(x.g, 4674) END
             FROM (
               SELECT p.numero, ST_Multi(ST_CollectionExtract(ST_Intersection(
                        ST_SetSRID(ST_GeomFromGeoJSON($2), ${UTM}),
                        ST_SetSRID(ST_GeomFromGeoJSON(p.parte::text), ${UTM})), 3)) AS g
               FROM json_to_recordset($3::json) AS p(numero int, parte json)
             ) x
             WHERE l.quadra_id = $1 AND l.numero = x.numero`,
            quadra.id,
            celula.geojson,
            JSON.stringify(
              partes.map((parte, i) => ({ numero: i + 1, parte: anelParaGeoJson(parte) })),
            ),
          );
        }
        rel.quadras[setor.codigo] = {
          quadras: quadras.length,
          comGeometria: Math.min(quadras.length, resultado.celulas.length),
          anguloGraus: Math.round(angulo * 10) / 10,
          tamanhoCelulaM: resultado.tamanho,
        };
      }
      const [lt] = await tx.$queryRaw<
        { n: bigint }[]
      >`SELECT count(*) AS n FROM territorio.lote WHERE geom IS NOT NULL`;
      rel.lotesComGeometria = Number(lt?.n ?? 0);

      // Domicílios sem ponto confirmado: ponto sorteado (determinístico) dentro do lote; sem lote
      // com geometria, dentro da quadra; na zona rural, dentro do polígono rural.
      rel.domiciliosPosicionados = await tx.$executeRaw`
        UPDATE territorio.domicilio d SET ponto = sub.ponto
        FROM (
          SELECT d2.id, (ST_Dump(ST_GeneratePoints(coalesce(l.geom, q.geom, s.geom), 1, d2.id))).geom AS ponto
          FROM territorio.domicilio d2
          JOIN territorio.setor s ON s.id = d2.setor_id
          LEFT JOIN territorio.lote l ON l.id = d2.lote_id
          LEFT JOIN territorio.quadra q ON q.id = l.quadra_id
          WHERE d2.geo_fonte IS DISTINCT FROM 'CONFIRMADO_USUARIO'
            AND coalesce(l.geom, q.geom, s.geom) IS NOT NULL
        ) sub
        WHERE d.id = sub.id`;
    },
    { timeout: 600_000, maxWait: 30_000 },
  );

  return rel;
}

interface CelulaRecortada {
  geojson: string;
  area: number;
  centro: Ponto;
}

/**
 * Células giradas recortadas pelo setor, ficando as que cobrem ao menos `coberturaMinima` da
 * célula. Se sobrar, ficam as `n` maiores; se faltar, a célula diminui (216 → 205 → …) até caber.
 */
async function gerarCelulas(
  tx: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0],
  setorId: number,
  aneis: Anel[],
  angulo: number,
  n: number,
  cfg: Mapeamento['grade'],
): Promise<{ tamanho: number; celulas: CelulaRecortada[] }> {
  let melhor: { tamanho: number; celulas: CelulaRecortada[] } = {
    tamanho: cfg.tamanhoInicialM,
    celulas: [],
  };
  for (
    let tamanho = cfg.tamanhoInicialM;
    tamanho >= cfg.tamanhoInicialM / 2;
    tamanho = Math.round(tamanho * 0.95)
  ) {
    const celulas = gradeGirada(aneis, angulo, tamanho).map(anelParaGeoJson);
    const linhas = await tx.$queryRawUnsafe<
      { geojson: string; area: number; x: number; y: number }[]
    >(
      `WITH s AS (SELECT ST_Transform(geom, ${UTM}) AS g FROM territorio.setor WHERE id = $1),
            c AS (SELECT ST_CollectionExtract(ST_Intersection(s.g, ST_SetSRID(ST_GeomFromGeoJSON(cel::text), ${UTM})), 3) AS g
                  FROM s, json_array_elements($2::json) AS cel)
       SELECT ST_AsGeoJSON(g) AS geojson, ST_Area(g) AS area, ST_X(ST_PointOnSurface(g)) AS x, ST_Y(ST_PointOnSurface(g)) AS y
       FROM c WHERE NOT ST_IsEmpty(g) AND ST_Area(g) >= $3`,
      setorId,
      JSON.stringify(celulas),
      cfg.coberturaMinima * tamanho * tamanho,
    );
    const recortadas = linhas
      .map((l) => ({
        geojson: l.geojson,
        area: Number(l.area),
        centro: [Number(l.x), Number(l.y)] as Ponto,
      }))
      .sort((a, b) => b.area - a.area);
    if (recortadas.length > melhor.celulas.length) melhor = { tamanho, celulas: recortadas };
    if (recortadas.length >= n) return { tamanho, celulas: recortadas.slice(0, n) };
  }
  return melhor;
}
