/**
 * Grade provisória de quadras e lotes (P06), em coordenadas planas (metros, UTM 20S).
 * Enquanto a malha cadastral da Fazenda não chega, as quadras são células quadradas giradas no
 * ângulo dominante das ruas (aproximado pelas arestas do setor), como no protótipo.
 * O recorte pelo polígono do setor é feito no PostGIS.
 */
export type Ponto = [number, number];

const rad = (g: number) => (g * Math.PI) / 180;

function girar([x, y]: Ponto, graus: number, [cx, cy]: Ponto = [0, 0]): Ponto {
  const a = rad(graus);
  const dx = x - cx;
  const dy = y - cy;
  return [cx + dx * Math.cos(a) - dy * Math.sin(a), cy + dx * Math.sin(a) + dy * Math.cos(a)];
}

/**
 * Ângulo dominante das arestas, em graus no intervalo [0, 90): média circular com período de 90°
 * (o ângulo vezes 4 vira um vetor), ponderada pelo comprimento. Ruas em grade perpendicular dão o
 * mesmo ângulo nas duas direções.
 */
export function anguloDominante(aneis: readonly (readonly Ponto[])[]): number {
  let sx = 0;
  let sy = 0;
  for (const anel of aneis) {
    for (let i = 1; i < anel.length; i++) {
      const [x0, y0] = anel[i - 1] as Ponto;
      const [x1, y1] = anel[i] as Ponto;
      const comprimento = Math.hypot(x1 - x0, y1 - y0);
      const t = Math.atan2(y1 - y0, x1 - x0) * 4;
      sx += comprimento * Math.cos(t);
      sy += comprimento * Math.sin(t);
    }
  }
  if (sx === 0 && sy === 0) throw new RangeError('Polígono sem arestas para calcular o ângulo');
  const graus = (Math.atan2(sy, sx) * 180) / Math.PI / 4;
  return ((graus % 90) + 90) % 90;
}

/** Retângulo que envolve os anéis no sistema girado: origem, ângulo, largura e altura. */
export interface RetanguloOrientado {
  origem: Ponto;
  angulo: number;
  largura: number;
  altura: number;
}

export function retanguloOrientado(
  aneis: readonly (readonly Ponto[])[],
  angulo: number,
): RetanguloOrientado {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const anel of aneis) {
    for (const p of anel) {
      const [x, y] = girar(p, -angulo);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return { origem: girar([minX, minY], angulo), angulo, largura: maxX - minX, altura: maxY - minY };
}

/**
 * Divide o retângulo orientado em colunas × linhas partes iguais, numeradas linha a linha a partir
 * do canto de cima à esquerda (lote 1), como o `lotPos` do protótipo. Cada parte é um anel fechado.
 */
export function subdividir(r: RetanguloOrientado, colunas: number, linhas: number): Ponto[][] {
  const w = r.largura / colunas;
  const h = r.altura / linhas;
  const local = (x: number, y: number): Ponto => {
    const [px, py] = girar([x, y], r.angulo);
    return [r.origem[0] + px, r.origem[1] + py];
  };
  const partes: Ponto[][] = [];
  for (let l = 0; l < linhas; l++) {
    const topo = r.altura - l * h;
    for (let c = 0; c < colunas; c++) {
      const esq = c * w;
      partes.push([
        local(esq, topo),
        local(esq + w, topo),
        local(esq + w, topo - h),
        local(esq, topo - h),
        local(esq, topo),
      ]);
    }
  }
  return partes;
}

/** Células quadradas de `tamanho` metros, giradas em `angulo`, que cobrem os anéis. */
export function gradeGirada(
  aneis: readonly (readonly Ponto[])[],
  angulo: number,
  tamanho: number,
): Ponto[][] {
  const r = retanguloOrientado(aneis, angulo);
  const colunas = Math.max(1, Math.ceil(r.largura / tamanho - 1e-9));
  const linhas = Math.max(1, Math.ceil(r.altura / tamanho - 1e-9));
  return subdividir(
    { ...r, largura: colunas * tamanho, altura: linhas * tamanho },
    colunas,
    linhas,
  );
}

/**
 * Ordem de leitura dos centros (de cima para baixo, da esquerda para a direita) no sistema girado,
 * em faixas da altura de uma célula. Devolve os índices na nova ordem.
 */
export function ordemDeLeitura(
  centros: readonly Ponto[],
  angulo: number,
  tamanho: number,
): number[] {
  const locais = centros.map((c) => girar(c, -angulo));
  return locais
    .map((p, i) => ({ i, faixa: Math.round(-p[1] / tamanho), x: p[0] }))
    .sort((a, b) => a.faixa - b.faixa || a.x - b.x)
    .map((p) => p.i);
}
