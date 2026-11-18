# Primeira instalação do SII no Portainer

A stack `sii` usa o Docker standalone de `reurb@192.168.1.22`. O proxy publica somente `192.168.1.22:8888`, com a web em `/` e a API em `/api/v1`. O PostgreSQL, o Redis, o MinIO, a API e o worker usam a rede da própria stack.

## Construir localmente

A partir da raiz do repositório, em um checkout limpo. API, worker e migrador compartilham as camadas de execução, que incluem os artefatos compilados, as dependências de produção e a CLI do Prisma para aplicar as migrations.

```bash
set -euo pipefail
REV=$(git rev-parse --short HEAD)
docker build -f infra/producao/Dockerfile --target backend -t "sii/api:$REV" .
docker tag "sii/api:$REV" "sii/worker:$REV"
docker build -f infra/producao/Dockerfile --target web -t "sii/web:$REV" .

MINIO=minio/minio@sha256:14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e
docker pull "$MINIO"
docker pull postgis/postgis:16-3.4-alpine
docker pull redis:7-alpine
docker pull caddy:2-alpine
docker tag "$MINIO" "sii/minio:$REV"
docker tag postgis/postgis:16-3.4-alpine "sii/postgis:$REV"
docker tag redis:7-alpine "sii/redis:$REV"
docker tag caddy:2-alpine "sii/proxy:$REV"

docker save sii/{api,worker,web,postgis,redis,minio,proxy}:"$REV" | gzip -1 |
  ssh -i ~/.ssh/reurb_prod -o BatchMode=yes -o StrictHostKeyChecking=yes reurb@192.168.1.22 \
    'bash -o pipefail -c "gunzip | docker load"'
```

## Criar no Portainer

`python3 infra/producao/portainer.py "$REV"` identifica o ambiente e consulta a stack. Com `--criar`, gera `~/sii-prod-segredos.env` com permissão 600 e cria a stack. O script usa as credenciais operacionais do Portainer de `~/reurb-prod-segredos.env` e confirma o certificado do Portainer por SSH antes de autenticar. A criação recusa uma stack `sii` existente.

O serviço `migrar` aplica as migrations no banco do SII. A base começa vazia. Para criar a primeira conta CTI, leia apenas `ADMIN_SENHA` do arquivo local e passe o valor pela entrada padrão de `docker exec -i sii-api-1 node apps/api/criar-admin.mjs`, executado no servidor por SSH. A conta `cti.admin` exige troca no primeiro acesso e a senha provisória expira em 24 horas.

## Verificar

- Confira a saída de `docker ps -a --filter label=com.docker.compose.project=sii`. O migrador deve terminar com código zero e os serviços permanentes devem ficar ativos.
- Obtenha a CA do proxy por SSH com `docker exec sii-proxy-1 cat /data/caddy/pki/authorities/local/root.crt`. Confie nessa CA para acessar `https://192.168.1.22:8888/entrar` e consultar `/api/v1/health`.
- Valide o login e a troca da senha temporária antes de cadastrar os demais usuários.
- Preserve o volume `sii_proxy`, que guarda a CA usada pelos clientes. Preserve também `sii_db`, `sii_minio` e o arquivo local de segredos em caso de atualização.
