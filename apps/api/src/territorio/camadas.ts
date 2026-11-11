/**
 * Camadas do mapa servidas em GeoJSON. Só território e equipamentos: nenhuma propriedade traz dado
 * pessoal (o mapa de pessoas e famílias vem dos painéis, respeitando perfil e escopo).
 */
export const CAMADAS = [
  'limite',
  'setores',
  'quadras',
  'lotes',
  'equipamentos',
  'microareas',
] as const;
export type Camada = (typeof CAMADAS)[number];

/** Tolerância de simplificação (graus) por nível de zoom do mapa: menos detalhe de longe. */
export function toleranciaPorZoom(zoom: number): { faixa: string; tolerancia: number } {
  if (zoom >= 17) return { faixa: 'z17', tolerancia: 0 };
  if (zoom >= 15) return { faixa: 'z15', tolerancia: 0.00001 };
  if (zoom >= 13) return { faixa: 'z13', tolerancia: 0.00005 };
  if (zoom >= 11) return { faixa: 'z11', tolerancia: 0.0002 };
  return { faixa: 'z0', tolerancia: 0.001 };
}

/** SELECT que devolve (geom, props jsonb) de cada camada. */
export const CONSULTA_CAMADA: Record<Camada, string> = {
  limite: `SELECT geom, jsonb_build_object('nome', nome, 'codigoIbge', codigo_ibge) AS props
           FROM territorio.limite_municipal`,
  setores: `SELECT geom, jsonb_build_object('codigo', codigo, 'nome', nome, 'tipo', tipo) AS props
            FROM territorio.setor WHERE geom IS NOT NULL`,
  quadras: `WITH p AS (SELECT pesos FROM indicadores.pesos_ivm ORDER BY versao DESC LIMIT 1)
            SELECT q.geom, jsonb_build_object(
                     'codigo', q.codigo, 'setor', s.codigo, 'provisoria', q.provisoria,
                     'ivm', round((
                       (d.renda * (p.pesos->>'renda')::numeric + d.saude * (p.pesos->>'saude')::numeric
                        + d.escola * (p.pesos->>'escola')::numeric + d.imovel * (p.pesos->>'imovel')::numeric
                        + d.regularizacao * (p.pesos->>'regularizacao')::numeric)
                       / nullif((p.pesos->>'renda')::numeric + (p.pesos->>'saude')::numeric
                        + (p.pesos->>'escola')::numeric + (p.pesos->>'imovel')::numeric
                        + (p.pesos->>'regularizacao')::numeric, 0))::numeric, 3)) AS props
            FROM territorio.quadra q
            JOIN territorio.setor s ON s.id = q.setor_id
            LEFT JOIN LATERAL (SELECT * FROM indicadores.dimensao_ivm_quadra x
                               WHERE x.quadra_id = q.id ORDER BY periodo DESC LIMIT 1) d ON true
            LEFT JOIN p ON true
            WHERE q.geom IS NOT NULL`,
  lotes: `SELECT l.geom, jsonb_build_object('quadra', q.codigo, 'numero', l.numero, 'situacao', l.situacao) AS props
          FROM territorio.lote l JOIN territorio.quadra q ON q.id = l.quadra_id WHERE l.geom IS NOT NULL`,
  equipamentos: `SELECT e.geom, jsonb_strip_nulls(jsonb_build_object(
                   'codigo', e.codigo, 'tipo', e.tipo, 'nome', e.nome, 'inep', e.codigo_inep,
                   'cnes', e.codigo_cnes, 'cadsuas', e.codigo_cadsuas, 'principal', p.codigo)) AS props
                 FROM territorio.equipamento e LEFT JOIN territorio.equipamento p ON p.id = e.principal_id
                 WHERE e.geom IS NOT NULL`,
  microareas: `SELECT geom, jsonb_build_object('codigo', codigo, 'nome', nome) AS props
               FROM territorio.area_referencia WHERE tipo = 'MICROAREA' AND geom IS NOT NULL`,
};
