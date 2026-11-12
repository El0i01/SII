import { Client } from 'minio';

/** Configuração do MinIO comum à API e ao worker (o worker importa este arquivo). */
export interface ConfigMinio {
  url: string;
  usuario: string;
  senha: string;
  bucket: string;
}

export function configMinio(env: {
  MINIO_URL?: string | undefined;
  MINIO_USUARIO?: string | undefined;
  MINIO_SENHA?: string | undefined;
  MINIO_ROOT_USER?: string | undefined;
  MINIO_ROOT_PASSWORD?: string | undefined;
  MINIO_BUCKET_CARGAS?: string | undefined;
}): ConfigMinio {
  const usuario = env.MINIO_USUARIO ?? env.MINIO_ROOT_USER;
  const senha = env.MINIO_SENHA ?? env.MINIO_ROOT_PASSWORD;
  if (!usuario || !senha)
    throw new Error('defina MINIO_USUARIO e MINIO_SENHA (ou MINIO_ROOT_*) no .env');
  return {
    url: env.MINIO_URL ?? 'http://localhost:9010',
    usuario,
    senha,
    bucket: env.MINIO_BUCKET_CARGAS ?? 'sii-cargas',
  };
}

export function clienteMinio(c: ConfigMinio): Client {
  const u = new URL(c.url);
  const ssl = u.protocol === 'https:';
  return new Client({
    endPoint: u.hostname,
    port: u.port ? Number(u.port) : ssl ? 443 : 80,
    useSSL: ssl,
    accessKey: c.usuario,
    secretKey: c.senha,
  });
}

/** Chave do arquivo no bucket: só o id da carga, nunca o nome original (pode ter dado pessoal). */
export const chaveObjeto = (fonte: string, cargaId: number) =>
  `${fonte.toLowerCase()}/${cargaId}.csv`;

export async function garantirBucket(cliente: Client, bucket: string): Promise<void> {
  if (!(await cliente.bucketExists(bucket))) await cliente.makeBucket(bucket);
}

export async function lerObjeto(cliente: Client, bucket: string, chave: string): Promise<Buffer> {
  const fluxo = await cliente.getObject(bucket, chave);
  const partes: Buffer[] = [];
  for await (const p of fluxo) partes.push(p as Buffer);
  return Buffer.concat(partes);
}
