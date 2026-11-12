/**
 * Leitura de CSV das cargas (§5). O CECAD e o Portal de Gestão exportam ora em UTF-8 (às vezes com
 * BOM), ora em Windows-1252, com `;` ou `,`. Tudo aqui é puro: recebe bytes ou texto, sem arquivo.
 */

// O shared não carrega os tipos do DOM nem do Node; TextDecoder existe nos dois ambientes.
declare const TextDecoder: new (
  rotulo: string,
  opcoes?: { fatal?: boolean },
) => { decode(bytes: Uint8Array): string };

export type Codificacao = 'utf-8' | 'windows-1252';
export const SEPARADORES = [';', ',', '\t', '|'] as const;
export type Separador = (typeof SEPARADORES)[number];

export interface TextoDecodificado {
  texto: string;
  codificacao: Codificacao;
}

/** UTF-8 estrito; se algum byte não for UTF-8 válido, o arquivo é Windows-1252 (latin1 do Excel). */
export function decodificar(bytes: Uint8Array): TextoDecodificado {
  const semBom =
    bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? bytes.subarray(3) : bytes;
  try {
    return {
      texto: new TextDecoder('utf-8', { fatal: true }).decode(semBom),
      codificacao: 'utf-8',
    };
  } catch {
    return { texto: new TextDecoder('windows-1252').decode(semBom), codificacao: 'windows-1252' };
  }
}

/** O separador mais frequente no cabeçalho, contando só fora de aspas. Empate: `;` vence. */
export function detectarSeparador(cabecalho: string): Separador | null {
  const contagem = new Map<Separador, number>(SEPARADORES.map((s) => [s, 0]));
  let emAspas = false;
  for (const c of cabecalho) {
    if (c === '"') emAspas = !emAspas;
    else if (!emAspas && contagem.has(c as Separador))
      contagem.set(c as Separador, (contagem.get(c as Separador) as number) + 1);
  }
  let melhor: Separador | null = null;
  for (const s of SEPARADORES) {
    const n = contagem.get(s) as number;
    if (n > 0 && (melhor === null || n > (contagem.get(melhor) as number))) melhor = s;
  }
  return melhor;
}

export interface LinhaCsv {
  /** Número da linha no arquivo (1 = cabeçalho), o que a Assistência vê no relatório de erros. */
  numero: number;
  campos: string[];
}

/**
 * Lê o CSV inteiro (RFC 4180): aspas, aspas duplicadas, quebra de linha dentro de aspas, CRLF.
 * Linhas vazias são puladas. O primeiro item é o cabeçalho.
 */
export function lerCsv(texto: string, separador: Separador): LinhaCsv[] {
  const linhas: LinhaCsv[] = [];
  let campos: string[] = [];
  let campo = '';
  let emAspas = false;
  let numero = 1;
  let inicio = 1;
  const fecharLinha = () => {
    campos.push(campo);
    if (!(campos.length === 1 && campos[0] === '')) linhas.push({ numero: inicio, campos });
    campos = [];
    campo = '';
  };
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (emAspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else emAspas = false;
      } else {
        if (c === '\n') numero++;
        campo += c;
      }
    } else if (c === '"') emAspas = true;
    else if (c === separador) {
      campos.push(campo);
      campo = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      fecharLinha();
      numero++;
      inicio = numero;
    } else campo += c;
  }
  if (campo !== '' || campos.length > 0) fecharLinha();
  return linhas;
}
