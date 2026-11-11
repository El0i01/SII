/**
 * Cliente da API do SII para o web. A sessão vive em cookies httpOnly (a API grava e o navegador
 * envia): o JavaScript nunca vê token. Acesso vencido → tenta renovar uma vez → senão, NAO_AUTENTICADO.
 */
export const URL_API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api/v1';

export class ErroApi extends Error {
  constructor(
    readonly status: number,
    readonly codigo: string,
    mensagem: string,
    readonly campos: Record<string, string[]> = {},
  ) {
    super(mensagem);
  }
}

async function chamar(caminho: string, init: RequestInit): Promise<Response> {
  return fetch(`${URL_API}${caminho}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
}

export async function api<T>(caminho: string, init: RequestInit = {}): Promise<T> {
  let resposta: Response;
  try {
    resposta = await chamar(caminho, init);
    if (resposta.status === 401 && !caminho.startsWith('/auth/')) {
      const renovou = await chamar('/auth/refresh', { method: 'POST' });
      if (renovou.ok) resposta = await chamar(caminho, init);
    }
  } catch {
    throw new ErroApi(
      0,
      'SEM_CONEXAO',
      'Não foi possível falar com o servidor. Confira a internet e tente de novo.',
    );
  }
  if (resposta.status === 204) return undefined as T;
  const corpo = (await resposta.json().catch(() => ({}))) as {
    codigo?: string;
    mensagem?: string;
    campos?: Record<string, string[]>;
  };
  if (!resposta.ok) {
    throw new ErroApi(
      resposta.status,
      corpo.codigo ?? 'ERRO',
      corpo.mensagem ?? 'Não foi possível concluir a operação.',
      corpo.campos ?? {},
    );
  }
  return corpo as T;
}
