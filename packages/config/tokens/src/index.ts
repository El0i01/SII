/**
 * Tokens visuais do SII para quem não usa CSS (app mobile).
 * Espelho de tokens/tokens.css: mudou um, mude o outro.
 */
export const cores = {
  primaria: '#1351B4',
  primariaEscura: '#0C326F',
  primariaClara: '#DBE8FB',
  fundo: '#FFFFFF',
  superficie: '#F8F8F8',
  borda: '#CCCCCC',
  bordaSuave: '#EDEDED',
  texto: '#333333',
  textoSuave: '#555555',
  textoForte: '#1B1B1B',
  sucesso: '#168821',
  sucessoClaro: '#E3F5E1',
  alerta: '#8A6D00',
  alertaDestaque: '#F2B705',
  alertaClaro: '#FFF5C2',
  erro: '#C41C00',
  erroClaro: '#FDE0DB',
  foco: '#C2850C',
} as const;

export const fonte = {
  familia: 'Rawline',
  alternativas: ['Raleway', 'System'],
} as const;

/** Alvo mínimo de toque, em px (WCAG 2.5.5 / eMAG). */
export const ALVO_MINIMO = 44;

export type Cor = keyof typeof cores;
