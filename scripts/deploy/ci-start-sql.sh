#!/usr/bin/env bash
set -euo pipefail

NAME="${1:-lgs-mssql}"
PORT="${2:-1433}"
IMAGE="${MSSQL_IMAGE:-mcr.microsoft.com/mssql/server:2022-latest}"

SA_PASSWORD="Aa1$(openssl rand -hex 16)"
echo "::add-mask::${SA_PASSWORD}"

docker run -d --name "${NAME}" \
  -e ACCEPT_EULA=Y \
  -e "MSSQL_SA_PASSWORD=${SA_PASSWORD}" \
  -p "127.0.0.1:${PORT}:1433" \
  "${IMAGE}" >/dev/null

for attempt in $(seq 1 60); do
  if docker exec "${NAME}" /opt/mssql-tools18/bin/sqlcmd -C -S localhost -U sa -P "${SA_PASSWORD}" -Q "SELECT 1" -b >/dev/null 2>&1; then
    echo "SQL Server hazir (deneme ${attempt})."
    break
  fi
  if [ "${attempt}" = "60" ]; then
    docker logs "${NAME}" | tail -n 40
    echo "SQL Server hazir olmadi." >&2
    exit 1
  fi
  sleep 3
done

echo "SQL_SA_PASSWORD=${SA_PASSWORD}" >>"${GITHUB_ENV}"
echo "SQL_HOST_PORT=${PORT}" >>"${GITHUB_ENV}"
