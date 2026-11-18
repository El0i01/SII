'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import {
  type CamadaMapa,
  COR_SITUACAO_LOTE,
  type IndicadoresQuadra,
  TIPO_CAMADA_MAPA,
  type TokenCor,
} from '@sii/shared';
import maplibregl, {
  type GeoJSONSource,
  type LngLatBoundsLike,
  type Map as MapaGl,
  type StyleSpecification,
} from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import {
  classesDasQuadras,
  corDoToken,
  expressaoCorQuadra,
  limites,
  pontosDaCamada,
  type RespostaPontos,
} from '@/lib/mapa';

/** GeoJSON das camadas de território do P06 (sem dado pessoal). */
export interface GeoTerritorio {
  limite: unknown;
  setores: unknown;
  quadras: unknown;
  lotes: unknown;
  ruas: unknown;
  equipamentos: unknown;
}

export interface PropsMapa {
  geo: GeoTerritorio;
  quadras: IndicadoresQuadra[];
  pontos: RespostaPontos | null;
  camada: CamadaMapa;
  equipamentos: boolean;
  /** Setor do cabeçalho: o mapa enquadra nele. */
  territorio: string | null;
  selecionada: number | null;
  onSelecionar: (id: number) => void;
}

const LETRA_EQUIPAMENTO: Record<string, string> = { ESCOLA: 'E', SAUDE: 'S', ASSISTENCIA: 'A' };
const NOME_EQUIPAMENTO: Record<string, string> = {
  ESCOLA: 'Escola',
  SAUDE: 'Unidade de saúde',
  ASSISTENCIA: 'Assistência Social',
};

/** Textos dos controles do MapLibre em português. */
const LOCALE = {
  'NavigationControl.ZoomIn': 'Aproximar',
  'NavigationControl.ZoomOut': 'Afastar',
  'NavigationControl.ResetBearing': 'Apontar para o norte',
  'Map.Title': 'Mapa',
};

const vazio = { type: 'FeatureCollection', features: [] } as const;

/**
 * Mapa da tela Território (P15). Só as camadas do SII: nenhum fundo de terceiro (decisão de
 * 18/11/2026). Trocar de camada muda só a pintura e a visibilidade, sem ir ao servidor; o tempo da
 * troca (até o quadro com a camada nova chegar à tela) fica em `data-troca-ms`, para o teste de aceite.
 */
export default function Mapa({
  geo,
  quadras,
  pontos,
  camada,
  equipamentos,
  territorio,
  selecionada,
  onSelecionar,
}: PropsMapa) {
  const caixa = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaGl | null>(null);
  const marcadores = useRef<maplibregl.Marker[]>([]);
  const [carregado, setCarregado] = useState(false);
  const aoSelecionar = useRef(onSelecionar);
  aoSelecionar.current = onSelecionar;

  // Cria o mapa uma vez.
  useEffect(() => {
    if (!caixa.current) return;
    const cor = (t: TokenCor | string) => corDoToken(t, caixa.current ?? undefined);
    const estilo: StyleSpecification = {
      version: 8,
      // Sem animação entre camadas: a troca é imediata (e respeita quem pede menos movimento).
      transition: { duration: 0, delay: 0 },
      sources: {
        limite: { type: 'geojson', data: geo.limite as never },
        setores: { type: 'geojson', data: geo.setores as never },
        quadras: { type: 'geojson', data: geo.quadras as never, promoteId: 'id' },
        lotes: { type: 'geojson', data: geo.lotes as never },
        ruas: { type: 'geojson', data: geo.ruas as never },
        calor03: { type: 'geojson', data: vazio as never },
        calorIdosos: { type: 'geojson', data: vazio as never },
        pcf: { type: 'geojson', data: vazio as never },
      },
      layers: [
        { id: 'fundo', type: 'background', paint: { 'background-color': cor('superficie') } },
        {
          id: 'limite',
          type: 'fill',
          source: 'limite',
          paint: { 'fill-color': cor('fundo'), 'fill-outline-color': cor('borda') },
        },
        {
          id: 'setores',
          type: 'line',
          source: 'setores',
          paint: { 'line-color': cor('texto-suave'), 'line-width': 1.5, 'line-dasharray': [3, 2] },
        },
        {
          id: 'quadras',
          type: 'fill',
          source: 'quadras',
          paint: { 'fill-color': cor('superficie'), 'fill-opacity': 0.85 },
        },
        {
          id: 'quadras-contorno',
          type: 'line',
          source: 'quadras',
          paint: { 'line-color': cor('borda'), 'line-width': 0.8 },
        },
        {
          id: 'lotes',
          type: 'fill',
          source: 'lotes',
          minzoom: 16,
          layout: { visibility: 'none' },
          paint: {
            'fill-color': [
              'match',
              ['get', 'situacao'],
              ...Object.entries(COR_SITUACAO_LOTE).flatMap(([k, t]) => [k, cor(t)]),
              cor('superficie'),
            ] as never,
            'fill-outline-color': cor('borda'),
          },
        },
        {
          id: 'lotes-contorno',
          type: 'line',
          source: 'lotes',
          minzoom: 16,
          paint: { 'line-color': cor('borda-suave'), 'line-width': 0.5 },
        },
        {
          id: 'ruas',
          type: 'line',
          source: 'ruas',
          paint: {
            'line-color': cor('borda'),
            'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.5, 17, 3],
          },
        },
        {
          id: 'quadra-selecionada',
          type: 'line',
          source: 'quadras',
          filter: ['==', ['get', 'id'], -1],
          paint: { 'line-color': cor('texto-forte'), 'line-width': 3 },
        },
        ...(['calor03', 'calorIdosos'] as const).map((id) => ({
          id,
          type: 'heatmap' as const,
          source: id,
          layout: { visibility: 'none' as const },
          paint: {
            'heatmap-weight': ['get', 'peso'],
            'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 12, 14, 17, 40],
            'heatmap-opacity': 0.8,
            'heatmap-color': [
              'interpolate',
              ['linear'],
              ['heatmap-density'],
              0,
              'rgba(0,0,0,0)',
              0.3,
              cor(id === 'calor03' ? 'mapa-4' : 'alerta-destaque'),
              1,
              cor(id === 'calor03' ? 'primaria' : 'erro'),
            ],
          } as never,
        })),
        {
          id: 'pcf',
          type: 'circle',
          source: 'pcf',
          layout: { visibility: 'none' },
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['get', 'peso'], 1, 5, 20, 14],
            'circle-color': [
              'case',
              ['==', ['get', 'atrasada'], true],
              cor('alerta-destaque'),
              cor('primaria'),
            ],
            'circle-stroke-color': cor('fundo'),
            'circle-stroke-width': 1.5,
          },
        },
      ],
    };
    const m = new maplibregl.Map({
      container: caixa.current,
      style: estilo,
      bounds: (limites(geo.quadras) ??
        limites(geo.setores) ?? [-63.2, -9.2, -63.1, -9.1]) as LngLatBoundsLike,
      fitBoundsOptions: { padding: 24 },
      attributionControl: { compact: true, customAttribution: 'Geoportal de Itapuã do Oeste' },
      locale: LOCALE,
      dragRotate: false,
      maxZoom: 19,
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    m.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
    m.on('click', 'quadras', (e) => {
      const id = Number(e.features?.[0]?.properties?.id);
      if (id) aoSelecionar.current(id);
    });
    m.on('mouseenter', 'quadras', () => (m.getCanvas().style.cursor = 'pointer'));
    m.on('mouseleave', 'quadras', () => (m.getCanvas().style.cursor = ''));
    m.on('load', () => setCarregado(true));
    mapa.current = m;
    return () => {
      for (const mk of marcadores.current) mk.remove();
      m.remove();
      mapa.current = null;
    };
    // O mapa é criado uma vez; as mudanças de dado entram pelos efeitos abaixo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pontos (individuais ou agregados): só quando os dados mudam.
  useEffect(() => {
    const m = mapa.current;
    if (!m || !carregado) return;
    for (const id of ['calor03', 'calorIdosos', 'pcf'] as const) {
      (m.getSource(id) as GeoJSONSource | undefined)?.setData(
        pontosDaCamada(id, quadras, pontos) as never,
      );
    }
  }, [carregado, quadras, pontos]);

  // Troca de camada: estado das quadras, cor e visibilidade.
  useEffect(() => {
    const m = mapa.current;
    if (!m || !carregado || !caixa.current) return;
    const inicio = performance.now();
    const el = caixa.current;
    const cor = (t: TokenCor) => corDoToken(t, el);
    for (const { id, classe } of classesDasQuadras(camada, quadras)) {
      m.setFeatureState({ source: 'quadras', id }, { classe });
    }
    m.setPaintProperty('quadras', 'fill-color', expressaoCorQuadra(camada, cor) as never);
    const tipo = TIPO_CAMADA_MAPA[camada];
    m.setPaintProperty('quadras', 'fill-opacity', tipo === 'quadra' ? 0.85 : 0.35);
    m.setLayoutProperty('lotes', 'visibility', camada === 'reurb' ? 'visible' : 'none');
    for (const id of ['calor03', 'calorIdosos', 'pcf'] as const) {
      m.setLayoutProperty(id, 'visibility', id === camada ? 'visible' : 'none');
    }
    el.dataset.camada = '';
    // Tempo da troca: até o quadro com a camada nova chegar à tela (o rAF seguinte ao desenho).
    m.once('render', () =>
      requestAnimationFrame(() => {
        el.dataset.trocaMs = String(Math.round(performance.now() - inicio));
      }),
    );
    // Parado (sem nada pendente): marca a camada pronta; o tempo fica registrado para comparação.
    m.once('idle', () => {
      el.dataset.paradoMs = String(Math.round(performance.now() - inicio));
      el.dataset.camada = camada;
    });
    m.triggerRepaint();
  }, [carregado, camada, quadras]);

  // Quadra selecionada.
  useEffect(() => {
    const m = mapa.current;
    if (!m || !carregado) return;
    m.setFilter('quadra-selecionada', ['==', ['get', 'id'], selecionada ?? -1]);
  }, [carregado, selecionada]);

  // Equipamentos: marcadores com letra (o estilo não carrega fontes de terceiros).
  useEffect(() => {
    const m = mapa.current;
    if (!m) return;
    for (const mk of marcadores.current) mk.remove();
    marcadores.current = [];
    if (!equipamentos) return;
    const feicoes =
      (
        geo.equipamentos as {
          features?: {
            geometry: { coordinates: unknown };
            properties: { tipo: string; nome: string };
          }[];
        }
      ).features ?? [];
    for (const f of feicoes) {
      const centro = limites({ features: [f] });
      if (!centro) continue;
      const tipo = f.properties.tipo;
      const div = document.createElement('div');
      div.className = `marcador-equipamento marcador-${tipo.toLowerCase()}`;
      div.textContent = LETRA_EQUIPAMENTO[tipo] ?? 'O';
      div.title = `${NOME_EQUIPAMENTO[tipo] ?? 'Equipamento'}: ${f.properties.nome}`;
      div.setAttribute('aria-hidden', 'true');
      marcadores.current.push(
        new maplibregl.Marker({ element: div })
          .setLngLat([(centro[0] + centro[2]) / 2, (centro[1] + centro[3]) / 2])
          .addTo(m),
      );
    }
  }, [equipamentos, geo.equipamentos]);

  // Território do cabeçalho: enquadra no setor.
  useEffect(() => {
    const m = mapa.current;
    if (!m || !carregado) return;
    const setores = geo.setores as { features?: { properties: { codigo: string } }[] };
    const alvo = territorio
      ? { features: (setores.features ?? []).filter((f) => f.properties.codigo === territorio) }
      : geo.quadras;
    // Sem território: a zona urbana (as quadras), como no protótipo.
    const b = limites(alvo) ?? limites(geo.setores);
    if (b) m.fitBounds(b, { padding: 24, duration: 0 });
  }, [carregado, territorio, geo.quadras, geo.setores]);

  return (
    <div
      ref={caixa}
      className="mapa-sii h-[420px] w-full overflow-hidden rounded-md border border-borda md:h-[520px]"
      role="region"
      aria-label="Mapa do território. Use a lista de quadras abaixo para navegar pelo teclado."
      data-testid="mapa"
    />
  );
}
