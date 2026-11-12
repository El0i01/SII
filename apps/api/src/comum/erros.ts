import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Response } from 'express';

/** Formato único de erro da API (CLAUDE.md): mensagem em linguagem simples, nunca dado pessoal. */
export interface CorpoErro {
  codigo: string;
  mensagem: string;
  campos?: Record<string, string[]>;
}

/** Erro de negócio com código estável, que o web e o mobile podem tratar. */
export class ErroApi extends HttpException {
  constructor(
    status: HttpStatus,
    readonly codigo: string,
    readonly mensagem: string,
    readonly campos?: Record<string, string[]>,
  ) {
    super({ codigo, mensagem, ...(campos ? { campos } : {}) } satisfies CorpoErro, status);
  }
}

export const erros = {
  validacao: (campos: Record<string, string[]>) =>
    new ErroApi(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'VALIDACAO',
      'Confira os campos destacados.',
      campos,
    ),
  naoAutenticado: () =>
    new ErroApi(HttpStatus.UNAUTHORIZED, 'NAO_AUTENTICADO', 'Entre com seu login para continuar.'),
  semPermissao: () =>
    new ErroApi(
      HttpStatus.FORBIDDEN,
      'SEM_PERMISSAO',
      'Seu perfil não tem acesso a esta informação.',
    ),
  foraDoEscopo: () =>
    new ErroApi(
      HttpStatus.FORBIDDEN,
      'FORA_DO_ESCOPO',
      'Esta informação é de outra escola, microárea ou território.',
    ),
};

const CODIGO_POR_STATUS: Record<number, string> = {
  400: 'REQUISICAO_INVALIDA',
  401: 'NAO_AUTENTICADO',
  403: 'SEM_PERMISSAO',
  404: 'NAO_ENCONTRADO',
  405: 'METODO_NAO_PERMITIDO',
  409: 'CONFLITO',
  413: 'CONTEUDO_GRANDE_DEMAIS',
  415: 'FORMATO_NAO_ACEITO',
  422: 'VALIDACAO',
  423: 'BLOQUEADO',
  429: 'MUITAS_TENTATIVAS',
};

const MENSAGEM_POR_STATUS: Record<number, string> = {
  400: 'A requisição não pôde ser entendida.',
  401: 'Entre com seu login para continuar.',
  403: 'Seu perfil não tem acesso a esta informação.',
  404: 'Não encontramos o que você procurou.',
  413: 'O arquivo passa do limite de 100 MB.',
  429: 'Muitas tentativas em pouco tempo. Aguarde um minuto e tente de novo.',
};

/** Converte qualquer exceção no formato { codigo, mensagem, campos? }. */
@Catch()
export class FiltroErros implements ExceptionFilter {
  private readonly logger = new Logger('erro');

  catch(excecao: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const { status, corpo } = this.converter(excecao);
    if (status >= 500) {
      // Só o tipo e a pilha: a mensagem de erros do banco pode conter valores de colunas.
      const erro = excecao as Error;
      this.logger.error(`${erro?.name ?? 'Erro'} não tratado`, erro?.stack);
    }
    res.status(status).json(corpo);
  }

  converter(excecao: unknown): { status: number; corpo: CorpoErro } {
    if (excecao instanceof ErroApi) {
      return { status: excecao.getStatus(), corpo: excecao.getResponse() as CorpoErro };
    }
    if (excecao instanceof ThrottlerException) {
      return {
        status: HttpStatus.TOO_MANY_REQUESTS,
        corpo: { codigo: 'MUITAS_TENTATIVAS', mensagem: MENSAGEM_POR_STATUS[429] as string },
      };
    }
    if (excecao instanceof HttpException) {
      const status = excecao.getStatus();
      return {
        status,
        corpo: {
          codigo: CODIGO_POR_STATUS[status] ?? (status >= 500 ? 'ERRO_INTERNO' : 'ERRO'),
          mensagem: MENSAGEM_POR_STATUS[status] ?? 'Não foi possível concluir a operação.',
        },
      };
    }
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      corpo: {
        codigo: 'ERRO_INTERNO',
        mensagem: 'Algo deu errado do nosso lado. Tente de novo; se continuar, avise a CTI.',
      },
    };
  }
}
