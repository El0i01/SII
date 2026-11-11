#!/usr/bin/env bash
# Testes do import-shapefile.sh. Precisam da infra no ar (pnpm infra:up) e do geoportal na máquina.
# Usa o banco de teste (DATABASE_URL_TESTE do .env) e uma pasta temporária; não altera o geoportal.
set -uo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$RAIZ/infra/scripts/import-shapefile.sh"
GEOPORTAL="${GEOPORTAL:-$HOME/geoportal_itapua-main(1)/geoportal_itapua-main}"
TMP="$(mktemp -d)"
trap 'rm -rf -- "$TMP"' EXIT

DATABASE_URL="${DATABASE_URL_TESTE:-$(grep -E '^DATABASE_URL_TESTE=' "$RAIZ/.env" | cut -d= -f2-)}"
export DATABASE_URL

falhas=0
ok() { echo "ok   - $1"; }
falha() { echo "FALHA - $1"; falhas=$((falhas + 1)); }

copiar() { # copiar <origem-sem-extensao> <destino-sem-extensao> <extensoes...>
  local origem="$1" destino="$2"
  shift 2
  for ext in "$@"; do cp "$origem.$ext" "$destino.$ext"; done
}

SETOR="$GEOPORTAL/setores/setor1"
[[ -f "$SETOR.shp" ]] || { echo "geoportal não encontrado em $GEOPORTAL (defina GEOPORTAL)"; exit 1; }

# 1. Falta .prj → recusa com saída 2
copiar "$SETOR" "$TMP/sem_prj" shp shx dbf
saida="$("$SCRIPT" "$TMP/sem_prj.shp" teste_sem_prj 2>&1)"; codigo=$?
[[ $codigo -eq 2 && "$saida" == *"falta .prj"* ]] && ok "recusa sem .prj" || falha "recusa sem .prj (saída $codigo: $saida)"

# 2. Falta .dbf e .shx → recusa listando os dois
copiar "$SETOR" "$TMP/sem_dbf" shp prj
saida="$("$SCRIPT" "$TMP/sem_dbf.shp" teste_sem_dbf 2>&1)"; codigo=$?
[[ $codigo -eq 2 && "$saida" == *".shx .dbf"* ]] && ok "recusa sem .shx e .dbf" || falha "recusa sem .shx/.dbf (saída $codigo: $saida)"

# 3. Nome de tabela inválido → recusa
saida="$("$SCRIPT" "$SETOR.shp" 'Setor; DROP TABLE x' 2>&1)"; codigo=$?
[[ $codigo -eq 2 ]] && ok "recusa nome de tabela inválido" || falha "aceitou nome de tabela inválido"

# 4. Dry-run não grava e mostra a origem Web Mercator
saida="$("$SCRIPT" "$SETOR.shp" teste_dry --dry-run 2>&1)"; codigo=$?
[[ $codigo -eq 0 && "$saida" == *"Web_Mercator"* && "$saida" == *"Dry-run"* ]] && ok "dry-run" || falha "dry-run ($saida)"

# 5. Importa um setor (origem 3857) e confere SRID 4674, tipo Multi e área plausível
copiar "$SETOR" "$TMP/setor1" shp shx dbf prj
if "$SCRIPT" "$TMP/setor1.shp" teste_setor1 --carga-id 11111111-2222-3333-4444-555555555555 >/dev/null 2>&1; then
  eval "$(
    python3 -I - <<'PY'
import os, shlex
from urllib.parse import urlparse, unquote
u = urlparse(os.environ["DATABASE_URL"])
print(f"export PGHOST={shlex.quote(u.hostname)} PGPORT={u.port} PGUSER={shlex.quote(unquote(u.username))} "
      f"PGPASSWORD={shlex.quote(unquote(u.password))} PGDATABASE={shlex.quote(u.path.lstrip('/'))}")
PY
  )"
  linha="$(ogrinfo "PG:dbname=$PGDATABASE" -q -sql "SELECT ST_SRID(geom) AS srid, GeometryType(geom) AS tipo, round((ST_Area(geom::geography)/10000)::numeric) AS hectares, carga_id::text AS carga FROM stg_geoportal.teste_setor1" 2>/dev/null)"
  [[ "$linha" == *"srid (Integer) = 4674"* ]] && ok "SRID 4674" || falha "SRID ($linha)"
  [[ "$linha" == *"MULTIPOLYGON"* ]] && ok "geometria Multi" || falha "tipo ($linha)"
  hectares="$(sed -n 's/^ *hectares (Real[^)]*) = //p; s/^ *hectares (Integer[^)]*) = //p' <<<"$linha" | head -1)"
  # Setor urbano da sede: dezenas a centenas de hectares. Se a reprojeção falhar, a área explode ou zera.
  [[ -n "$hectares" ]] && python3 -c "import sys; sys.exit(0 if 5 < float('$hectares') < 2000 else 1)" \
    && ok "área plausível (${hectares} ha)" || falha "área implausível (${hectares:-?} ha)"
  [[ "$linha" == *"11111111-2222-3333-4444-555555555555"* ]] && ok "carga_id gravado" || falha "carga_id ($linha)"
  ogrinfo "PG:dbname=$PGDATABASE" -q -sql "DROP TABLE stg_geoportal.teste_setor1" >/dev/null 2>&1
else
  falha "importação do setor1"
fi

echo
if [[ $falhas -eq 0 ]]; then echo "Todos os testes passaram."; else echo "$falhas teste(s) falharam."; exit 1; fi
