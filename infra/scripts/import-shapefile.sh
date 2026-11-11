#!/usr/bin/env bash
# Importa um shapefile para o schema de staging stg_geoportal, sempre em SIRGAS 2000 (EPSG:4674).
#
# Uso:
#   infra/scripts/import-shapefile.sh <arquivo.shp> <tabela> [--carga-id UUID] [--encoding ENC] [--dry-run]
#
# - Recusa (saída 2) se faltar .shx, .dbf ou .prj ao lado do .shp.
# - Lê a projeção de origem do .prj e reprojeta para 4674, seja WGS 84, Web Mercator ou SIRGAS.
# - Geometrias viram Multi*, inválidas são corrigidas (makevalid), coluna geométrica "geom", chave "gid".
# - Grava em stg_geoportal.<tabela> (substitui a tabela) com a coluna carga_id.
# - Conexão: DATABASE_URL do .env da raiz (ou do ambiente). A senha vai por PGPASSWORD, nunca na linha de comando.
# - Requer GDAL (ogr2ogr, ogrinfo, gdalsrsinfo) no host.
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCHEMA="stg_geoportal"

erro() { echo "ERRO: $*" >&2; }
uso() {
  sed -n '2,5p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2
  exit 2
}

[[ $# -ge 2 ]] || uso
SHP="$1"
TABELA="$2"
shift 2
CARGA_ID=""
ENCODING=""
DRY_RUN=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --carga-id) CARGA_ID="${2:-}"; shift 2 ;;
    --encoding) ENCODING="${2:-}"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    *) erro "opção desconhecida: $1"; uso ;;
  esac
done

for cmd in ogr2ogr ogrinfo gdalsrsinfo python3; do
  command -v "$cmd" >/dev/null || { erro "comando '$cmd' não encontrado. Instale o GDAL (apt install gdal-bin)."; exit 2; }
done

[[ "$SHP" == *.shp ]] || { erro "o arquivo precisa terminar em .shp: $SHP"; exit 2; }
[[ -f "$SHP" ]] || { erro "arquivo não encontrado: $SHP"; exit 2; }
[[ "$TABELA" =~ ^[a-z_][a-z0-9_]{0,62}$ ]] || {
  erro "nome de tabela inválido: '$TABELA' (use minúsculas, números e _)"
  exit 2
}
if [[ -n "$CARGA_ID" && ! "$CARGA_ID" =~ ^[0-9a-fA-F-]{36}$ ]]; then
  erro "--carga-id precisa ser um UUID"
  exit 2
fi

BASE="${SHP%.shp}"
FALTANDO=()
for ext in shx dbf prj; do
  [[ -f "$BASE.$ext" ]] || FALTANDO+=(".$ext")
done
if [[ ${#FALTANDO[@]} -gt 0 ]]; then
  erro "importação recusada: falta ${FALTANDO[*]} ao lado de $(basename "$SHP")."
  erro "Um shapefile só é completo com .shp, .shx, .dbf e .prj (a projeção vem do .prj)."
  exit 2
fi

# Encoding do .dbf: o informado, senão o do .cpg, senão o GDAL decide pelo cabeçalho do .dbf.
if [[ -z "$ENCODING" && -f "$BASE.cpg" ]]; then
  ENCODING="$(tr -d '\r\n' <"$BASE.cpg")"
fi

CAMADA="$(basename "$BASE")"
SRS_ORIGEM="$(gdalsrsinfo -o epsg "$BASE.prj" 2>/dev/null | tr -d '\r' | grep -m1 . || true)"
NOME_SRS="$(grep -oE '^(PROJCS|GEOGCS)\["[^"]+"' "$BASE.prj" | cut -d'"' -f2 || true)"
FEICOES="$(ogrinfo -ro -so -al "$SHP" 2>/dev/null | sed -n 's/^Feature Count: //p' | head -1)"

echo "Shapefile : $SHP"
echo "Origem    : ${NOME_SRS:-desconhecida} (${SRS_ORIGEM:-sem EPSG})"
echo "Feições   : ${FEICOES:-?}"
echo "Destino   : $SCHEMA.$TABELA em EPSG:4674"
[[ -n "$ENCODING" ]] && echo "Encoding  : $ENCODING"

if [[ $DRY_RUN -eq 1 ]]; then
  echo "Dry-run: nada foi gravado."
  exit 0
fi

# Conexão a partir de DATABASE_URL (ambiente ou .env da raiz).
if [[ -z "${DATABASE_URL:-}" && -f "$RAIZ/.env" ]]; then
  DATABASE_URL="$(grep -E '^DATABASE_URL=' "$RAIZ/.env" | head -1 | cut -d= -f2-)"
fi
[[ -n "${DATABASE_URL:-}" ]] || { erro "defina DATABASE_URL (no .env da raiz ou no ambiente)."; exit 2; }

eval "$(
  DATABASE_URL="$DATABASE_URL" python3 -I - <<'PY'
import os, shlex
from urllib.parse import urlparse, unquote
u = urlparse(os.environ["DATABASE_URL"])
for chave, valor in {
    "PGHOST": u.hostname or "localhost",
    "PGPORT": str(u.port or 5432),
    "PGUSER": unquote(u.username or ""),
    "PGPASSWORD": unquote(u.password or ""),
    "PGDATABASE": u.path.lstrip("/"),
}.items():
    print(f"export {chave}={shlex.quote(valor)}")
PY
)"
CONEXAO="PG:dbname=$PGDATABASE"

ogrinfo "$CONEXAO" -q -sql "CREATE SCHEMA IF NOT EXISTS $SCHEMA" >/dev/null

OPCOES=(
  -f PostgreSQL "$CONEXAO" "$SHP"
  -nln "$SCHEMA.$TABELA"
  -t_srs EPSG:4674
  -nlt PROMOTE_TO_MULTI
  -makevalid
  -lco GEOMETRY_NAME=geom
  -lco FID=gid
  -lco SPATIAL_INDEX=GIST
  -lco LAUNDER=YES
  -overwrite
  -dialect SQLITE
  -sql "SELECT *, '${CARGA_ID}' AS carga_id FROM \"$CAMADA\""
)
if [[ -n "$ENCODING" ]]; then
  ogr2ogr --config SHAPE_ENCODING "$ENCODING" "${OPCOES[@]}"
else
  ogr2ogr "${OPCOES[@]}"
fi

# carga_id vazio vira NULL (importação avulsa, fora do padrão de carga do worker).
ogrinfo "$CONEXAO" -q -sql "UPDATE $SCHEMA.$TABELA SET carga_id = NULL WHERE carga_id = ''" >/dev/null

IMPORTADAS="$(ogrinfo "$CONEXAO" -q -sql "SELECT count(*) AS n FROM $SCHEMA.$TABELA" | sed -n 's/^ *n (Integer[^)]*) = //p')"
echo "Importadas: ${IMPORTADAS:-?} feições em $SCHEMA.$TABELA"
