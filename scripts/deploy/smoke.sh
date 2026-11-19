#!/usr/bin/env bash
set -euo pipefail

: "${API_DIR:?API_DIR yayinlanmis API klasorunu gostermeli}"
: "${SMOKE_DB_CONNECTION:?SMOKE_DB_CONNECTION tanimli degil}"
: "${SMOKE_STORAGE_CONNECTION:?SMOKE_STORAGE_CONNECTION tanimli degil}"

PORT="${SMOKE_PORT:-5099}"
BASE="http://127.0.0.1:${PORT}"
LOG_FILE="${SMOKE_LOG:-${RUNNER_TEMP:-/tmp}/api-smoke.log}"
WORK_DIR="$(mktemp -d)"
API_PID=""

cleanup() {
  if [ -n "${API_PID}" ] && kill -0 "${API_PID}" 2>/dev/null; then
    kill "${API_PID}" 2>/dev/null || true
    wait "${API_PID}" 2>/dev/null || true
  fi
  rm -rf "${WORK_DIR}"
}
trap cleanup EXIT

fail() {
  echo "SMOKE BASARISIZ: $*" >&2
  echo "---- API gunlugu (son 80 satir) ----" >&2
  tail -n 80 "${LOG_FILE}" >&2 || true
  exit 1
}

rand_b64() { openssl rand -base64 "$1" | tr -d '\r\n'; }
rand_hex() { openssl rand -hex "$1" | tr -d '\r\n'; }

json_get() {
  node -e 'const o=JSON.parse(require("fs").readFileSync(0,"utf8"));const v=process.argv[1].split(".").reduce((a,k)=>a==null?a:a[k],o);process.stdout.write(v==null?"":String(v));' "$1"
}

export ASPNETCORE_ENVIRONMENT="${SMOKE_ENVIRONMENT:-Production}"
export ASPNETCORE_URLS="${BASE}"
export ConnectionStrings__DefaultConnection="${SMOKE_DB_CONNECTION}"
export Storage__ConnectionString="${SMOKE_STORAGE_CONNECTION}"
export Storage__CreateContainerIfMissing=true
export Jwt__Key="$(rand_b64 64)"
export RecoveryCodes__Pepper="$(rand_b64 48)"
export Bff__ProxyKey="$(rand_hex 32)"
export HttpsRedirection__Enabled=false
export Ai__Provider=None

SEED_USER="smokemudur"
SEED_PASSWORD="Sm$(rand_hex 6)Qz9"
NEW_PASSWORD="Nw$(rand_hex 6)Kx7"

echo "== seed-reference-data --dry-run"
(cd "${API_DIR}" && dotnet LGSApp.Api.dll seed-reference-data --dry-run)

echo "== seed-reference-data"
(cd "${API_DIR}" && dotnet LGSApp.Api.dll seed-reference-data)

echo "== API Production ortaminda baslatiliyor"
export Seed__Enabled=true
export Seed__AdminUserName="${SEED_USER}"
export Seed__AdminPassword="${SEED_PASSWORD}"
(cd "${API_DIR}" && exec dotnet LGSApp.Api.dll) >"${LOG_FILE}" 2>&1 &
API_PID=$!

ready=""
for _ in $(seq 1 60); do
  if ! kill -0 "${API_PID}" 2>/dev/null; then
    fail "API sureci beklenmedik sekilde kapandi"
  fi
  code="$(curl -s -o /dev/null -w '%{http_code}' "${BASE}/health/ready" || true)"
  if [ "${code}" = "200" ]; then ready="yes"; break; fi
  sleep 2
done
[ -n "${ready}" ] || fail "/health/ready 200 donmedi"
echo "health/ready: 200"

live="$(curl -s -o /dev/null -w '%{http_code}' "${BASE}/health/live")"
[ "${live}" = "200" ] || fail "/health/live ${live} dondu"

unset Seed__AdminPassword Seed__AdminUserName Seed__Enabled

echo "== login"
login_body="$(node -e 'process.stdout.write(JSON.stringify({userName:process.argv[1],password:process.argv[2]}))' "${SEED_USER}" "${SEED_PASSWORD}")"
login="$(curl -s -w '\n%{http_code}' -H 'Content-Type: application/json' -d "${login_body}" "${BASE}/api/auth/login")"
login_code="$(printf '%s' "${login}" | tail -n 1)"
login_json="$(printf '%s' "${login}" | sed '$d')"
[ "${login_code}" = "200" ] || fail "login ${login_code} dondu"
token="$(printf '%s' "${login_json}" | json_get token)"
must_change="$(printf '%s' "${login_json}" | json_get mustChangePassword)"
[ -n "${token}" ] || fail "login yanitinda token yok"
echo "login: 200 (mustChangePassword=${must_change})"

if [ "${must_change}" = "true" ]; then
  echo "== sifre degistirme"
  change_body="$(node -e 'process.stdout.write(JSON.stringify({currentPassword:process.argv[1],newPassword:process.argv[2]}))' "${SEED_PASSWORD}" "${NEW_PASSWORD}")"
  change="$(curl -s -w '\n%{http_code}' -H "Authorization: Bearer ${token}" -H 'Content-Type: application/json' -d "${change_body}" "${BASE}/api/auth/change-password")"
  change_code="$(printf '%s' "${change}" | tail -n 1)"
  [ "${change_code}" = "200" ] || fail "change-password ${change_code} dondu: $(printf '%s' "${change}" | sed '$d')"
  token="$(printf '%s' "${change}" | sed '$d' | json_get token)"
  [ -n "${token}" ] || fail "change-password yanitinda token yok"
fi

echo "== zamanlayici durumu (Europe/Istanbul saat dilimi, ICU)"
status_code="$(curl -s -o "${WORK_DIR}/status.json" -w '%{http_code}' -H "Authorization: Bearer ${token}" "${BASE}/api/admin/scheduler/status")"
[ "${status_code}" = "200" ] || fail "scheduler/status ${status_code} dondu"
echo "scheduler/status: 200"

echo "== kucuk JPEG yukleme"
if [ -n "${SMOKE_JPEG:-}" ]; then
  cp "${SMOKE_JPEG}" "${WORK_DIR}/smoke.jpg"
elif command -v magick >/dev/null 2>&1; then
  magick -size 320x320 gradient:steelblue-orange -quality 70 "${WORK_DIR}/smoke.jpg"
elif command -v convert >/dev/null 2>&1; then
  convert -size 320x320 gradient:steelblue-orange -quality 70 "${WORK_DIR}/smoke.jpg"
else
  fail "JPEG uretilemedi: ImageMagick (magick/convert) kurun veya SMOKE_JPEG ile bir dosya verin"
fi
[ -s "${WORK_DIR}/smoke.jpg" ] || fail "test JPEG dosyasi bos"

upload="$(curl -s -w '\n%{http_code}' -H "Authorization: Bearer ${token}" \
  --form-string 'purpose=questionimage' \
  --form-string "clientUploadId=$(node -e 'process.stdout.write(require("crypto").randomUUID())')" \
  -F "file=@${WORK_DIR}/smoke.jpg;type=image/jpeg" \
  "${BASE}/api/files")"
upload_code="$(printf '%s' "${upload}" | tail -n 1)"
upload_json="$(printf '%s' "${upload}" | sed '$d')"
[ "${upload_code}" = "201" ] || fail "POST /api/files ${upload_code} dondu: ${upload_json}"
file_url="$(printf '%s' "${upload_json}" | json_get url)"
file_type="$(printf '%s' "${upload_json}" | json_get contentType)"
echo "yukleme: 201 (contentType=${file_type})"

echo "== yuklenen dosyanin SAS adresinden okunmasi"
blob_code="$(curl -s -o "${WORK_DIR}/blob.bin" -w '%{http_code}' "${file_url}")"
[ "${blob_code}" = "200" ] || fail "yuklenen dosya okunamadi (${blob_code})"
[ -s "${WORK_DIR}/blob.bin" ] || fail "okunan dosya bos"
echo "blob okuma: 200"

echo "SMOKE BASARILI"
