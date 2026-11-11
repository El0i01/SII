import { Global, Injectable, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Env } from '../config/env';
import {
  chaveDeHex,
  decifrar,
  type DocumentoProtegido,
  hashDocumento,
  protegerDocumento,
  type TipoDocumento,
} from './cifra';

/** Cifra e hash de documentos com as chaves do .env. Nunca logue o valor em claro. */
@Injectable()
export class CriptoService {
  private readonly chaves: { cifra: Buffer; hmac: Buffer };

  constructor(config: ConfigService<Env, true>) {
    this.chaves = {
      cifra: chaveDeHex(config.get('CHAVE_CIFRA', { infer: true }), 'CHAVE_CIFRA'),
      hmac: chaveDeHex(config.get('CHAVE_HMAC', { infer: true }), 'CHAVE_HMAC'),
    };
  }

  proteger(tipo: TipoDocumento, valor: string): DocumentoProtegido {
    return protegerDocumento(tipo, valor, this.chaves);
  }

  hash(tipo: TipoDocumento, valor: string): Buffer {
    return hashDocumento(tipo, valor, this.chaves.hmac);
  }

  /** Só para o fluxo de revelação com finalidade (P12), que grava auditoria.acesso_dado_pessoal. */
  revelar(cifrado: Uint8Array): string {
    return decifrar(cifrado, this.chaves.cifra);
  }
}

@Global()
@Module({ providers: [CriptoService], exports: [CriptoService] })
export class CriptoModule {}
