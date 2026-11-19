#!/usr/bin/env bash
set -euo pipefail

NAME="${1:-lgs-azurite}"
PORT="${2:-10000}"
IMAGE="${AZURITE_IMAGE:-mcr.microsoft.com/azure-storage/azurite:latest}"

docker run -d --name "${NAME}" \
  -p "127.0.0.1:${PORT}:10000" \
  "${IMAGE}" \
  azurite-blob --blobHost 0.0.0.0 --blobPort 10000 --skipApiVersionCheck --loose >/dev/null

for attempt in $(seq 1 30); do
  if curl -s -o /dev/null "http://127.0.0.1:${PORT}/"; then
    echo "Azurite hazir (deneme ${attempt})."
    exit 0
  fi
  sleep 2
done

docker logs "${NAME}" | tail -n 40
echo "Azurite hazir olmadi." >&2
exit 1
