import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

/**
 * Cifragem de documentos (CPF, NIS, CNS) na aplicação, CLAUDE.md "Segurança e LGPD".
 *
 * - AES-256-GCM, com IV aleatório de 12 bytes por valor. Formato gravado (bytea):
 *   `versão (1) | iv (12) | tag (16) | texto cifrado`. A versão permite trocar a chave sem
 *   recifrar tudo de uma vez.
 * - HMAC-SHA256 com chave SEPARADA, sobre os dígitos normalizados: o mesmo documento dá sempre o
 *   mesmo hash, o que permite busca e ligação entre fontes sem decifrar. Sem a chave HMAC, o hash
 *   não pode ser atacado por dicionário de CPFs.
 */
export const VERSAO_CIFRA = 1;
const TAM_IV = 12;
const TAM_TAG = 16;

export type TipoDocumento = 'CPF' | 'NIS' | 'CNS';
const TAMANHO: Record<TipoDocumento, number> = { CPF: 11, NIS: 11, CNS: 15 };

export class DocumentoInvalido extends Error {
  constructor(readonly tipo: TipoDocumento) {
    // A mensagem nunca leva o valor.
    super(`${tipo} inválido`);
  }
}

/** Só dígitos, com o tamanho do tipo. Erro não expõe o valor. */
export function normalizarDocumento(tipo: TipoDocumento, valor: string): string {
  const d = valor.replace(/\D/g, '');
  if (d.length !== TAMANHO[tipo]) throw new DocumentoInvalido(tipo);
  return d;
}

export function chaveDeHex(hex: string, nome: string): Buffer {
  if (!/^[0-9a-fA-F]{64}$/.test(hex))
    throw new Error(`${nome} precisa ter 32 bytes em hex (64 caracteres)`);
  return Buffer.from(hex, 'hex');
}

export function cifrar(texto: string, chave: Buffer): Buffer {
  const iv = randomBytes(TAM_IV);
  const c = createCipheriv('aes-256-gcm', chave, iv);
  const corpo = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return Buffer.concat([Buffer.from([VERSAO_CIFRA]), iv, c.getAuthTag(), corpo]);
}

export function decifrar(dado: Uint8Array, chave: Buffer): string {
  const b = Buffer.from(dado);
  if (b.length < 1 + TAM_IV + TAM_TAG || b[0] !== VERSAO_CIFRA) {
    throw new Error('Dado cifrado em formato desconhecido');
  }
  const iv = b.subarray(1, 1 + TAM_IV);
  const tag = b.subarray(1 + TAM_IV, 1 + TAM_IV + TAM_TAG);
  const d = createDecipheriv('aes-256-gcm', chave, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(b.subarray(1 + TAM_IV + TAM_TAG)), d.final()]).toString('utf8');
}

/** HMAC do documento normalizado, prefixado pelo tipo (um NIS nunca colide com um CPF). */
export function hashDocumento(tipo: TipoDocumento, valor: string, chaveHmac: Buffer): Buffer {
  const d = normalizarDocumento(tipo, valor);
  return createHmac('sha256', chaveHmac).update(`${tipo}:${d}`).digest();
}

export interface DocumentoProtegido {
  cifrado: Buffer;
  hash: Buffer;
}

/** Cifra e calcula o hash de um documento já validado. */
export function protegerDocumento(
  tipo: TipoDocumento,
  valor: string,
  chaves: { cifra: Buffer; hmac: Buffer },
): DocumentoProtegido {
  const d = normalizarDocumento(tipo, valor);
  return { cifrado: cifrar(d, chaves.cifra), hash: hashDocumento(tipo, d, chaves.hmac) };
}
