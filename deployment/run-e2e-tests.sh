#!/usr/bin/env bash
#
# run-e2e-tests.sh — end-to-end assertions against a deployed endpoint.
# Counterpart of the AWS solution's post-deployment smoke tests.
#
# Usage:
#   BASE_URL=https://img.googledemo.com ./run-e2e-tests.sh
#
# Environment:
#   BASE_URL          (required) deployed endpoint, no trailing slash
#   TEST_IMAGE_KEY    object key of a JPEG that exists in the default source
#                     bucket (default: e2e/test.jpg)
#   PROJECT           GCP project for Secret Manager access (default: gcloud config)
#   SECRET_NAME       Secret Manager secret with the signature key JSON
#                     (default: dit-signature-secret)
#   SECRET_KEY_NAME   JSON key inside the secret (default: signatureKey)
#   CORS_ENABLED      Yes/No — whether the deployment has CORS on (default: Yes)
#   AUTO_WEBP         Yes/No — whether AUTO_WEBP is on (default: Yes)
#   ENABLE_SIGNATURE  Yes/No — whether signatures are enforced (default: No;
#                     signature tests are skipped when No)
#
# The suite is a set of small independent functions; add scenarios by writing
# a new test_* function and appending it to the TESTS array at the bottom.

set -uo pipefail

# ---------------------------------------------------------------------------
# configuration
# ---------------------------------------------------------------------------

BASE_URL="${BASE_URL:-}"
TEST_IMAGE_KEY="${TEST_IMAGE_KEY:-e2e/test.jpg}"
PROJECT="${PROJECT:-$(gcloud config get-value project 2>/dev/null || true)}"
SECRET_NAME="${SECRET_NAME:-dit-signature-secret}"
SECRET_KEY_NAME="${SECRET_KEY_NAME:-signatureKey}"
CORS_ENABLED="${CORS_ENABLED:-Yes}"
AUTO_WEBP="${AUTO_WEBP:-Yes}"
ENABLE_SIGNATURE="${ENABLE_SIGNATURE:-No}"

if [[ -z "${BASE_URL}" ]]; then
  echo "ERROR: BASE_URL is required, e.g. BASE_URL=https://img.googledemo.com $0" >&2
  exit 2
fi
for dep in curl jq openssl; do
  command -v "${dep}" >/dev/null 2>&1 || { echo "ERROR: ${dep} not found" >&2; exit 2; }
done

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "${WORK_DIR}"' EXIT

PASS=0
FAIL=0
SKIP=0
CURRENT_TEST=""
CURRENT_FAILED=0

# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

# request <url> [extra curl args...]
# Populates: RES_STATUS, RES_HEADERS (file), RES_BODY (file)
request() {
  local url="$1"; shift
  RES_HEADERS="${WORK_DIR}/headers"
  RES_BODY="${WORK_DIR}/body"
  RES_STATUS="$(curl -s -o "${RES_BODY}" -D "${RES_HEADERS}" -w '%{http_code}' "$@" "${url}")"
}

# header <name> -> prints the (last) value of a response header, lowercased name match
header() {
  awk -v h="$(echo "$1" | tr '[:upper:]' '[:lower:]')" '
    BEGIN { FS=": *" }
    { k=tolower($1); sub(/\r$/, "", $2) }
    k == h { v=$2 }
    END { print v }' "${RES_HEADERS}"
}

fail_msg() {
  CURRENT_FAILED=1
  echo "    FAIL: $*"
}

assert_status() { # expected
  [[ "${RES_STATUS}" == "$1" ]] || fail_msg "expected HTTP $1, got ${RES_STATUS}"
}

assert_header_eq() { # name expected
  local actual; actual="$(header "$1")"
  [[ "${actual}" == "$2" ]] || fail_msg "header $1: expected '$2', got '${actual}'"
}

assert_header_contains() { # name substring
  local actual; actual="$(header "$1")"
  [[ "${actual}" == *"$2"* ]] || fail_msg "header $1: expected to contain '$2', got '${actual}'"
}

assert_json_field() { # jq-path expected
  local actual
  actual="$(jq -r "$1" "${RES_BODY}" 2>/dev/null)"
  [[ "${actual}" == "$2" ]] || fail_msg "json $1: expected '$2', got '${actual}'"
}

assert_body_is_image() { # expected mime prefix, e.g. image/
  assert_header_contains "Content-Type" "$1"
  [[ -s "${RES_BODY}" ]] || fail_msg "response body is empty"
}

# base64 (no wrap) helper for DEFAULT (JSON) requests
b64() { printf '%s' "$1" | base64 -w0; }

# HMAC-SHA256 hex signature over "path[?sorted-query]" — byte-for-byte the AWS
# algorithm. The key is read from Secret Manager.
signature_key() {
  gcloud secrets versions access latest \
    --secret "${SECRET_NAME}" --project "${PROJECT}" 2>/dev/null \
    | jq -r ".${SECRET_KEY_NAME}"
}

sign() { # string-to-sign key
  printf '%s' "$1" | openssl dgst -sha256 -hmac "$2" -hex | awk '{print $NF}'
}

# Builds a full URL for a path (leading slash, no query). When the deployment
# enforces signatures (ENABLE_SIGNATURE=Yes), every request must carry a valid
# ?signature= — signature validation runs BEFORE the storage fetch, exactly as
# in AWS, so even 404/400 test cases need signing.
url_for() { # path-with-leading-slash
  if [[ "${ENABLE_SIGNATURE:-No}" == "Yes" ]]; then
    local key
    key="${_SIGNING_KEY:=$(signature_key)}"
    printf '%s%s?signature=%s' "${BASE_URL}" "$1" "$(sign "$1" "${key}")"
  else
    printf '%s%s' "${BASE_URL}" "$1"
  fi
}

run_test() { # test-function-name description
  CURRENT_TEST="$2"
  CURRENT_FAILED=0
  echo "==> ${CURRENT_TEST}"
  "$1"
  if [[ "${CURRENT_FAILED}" -eq 0 ]]; then
    PASS=$((PASS + 1))
    echo "    ok"
  else
    FAIL=$((FAIL + 1))
  fi
}

skip_test() { # description reason
  SKIP=$((SKIP + 1))
  echo "==> $1"
  echo "    SKIP: $2"
}

# ---------------------------------------------------------------------------
# test cases (skeleton — extend by adding test_* functions)
# ---------------------------------------------------------------------------

# DEFAULT request type: /<base64(JSON)> resize must return 200 + an image.
test_default_resize() {
  local req
  req="$(b64 "{\"key\":\"${TEST_IMAGE_KEY}\",\"edits\":{\"resize\":{\"width\":100,\"height\":100,\"fit\":\"inside\"}}}")"
  request "$(url_for "/${req}")" -H "Accept: */*"
  assert_status 200
  assert_body_is_image "image/"
}

# THUMBOR request type: fit-in resize on a raw key path.
test_thumbor_resize() {
  request "$(url_for "/fit-in/100x100/${TEST_IMAGE_KEY}")" -H "Accept: */*"
  assert_status 200
  assert_body_is_image "image/"
}

# Missing object must produce the AWS-shaped 404 NoSuchKey JSON.
test_404_no_such_key() {
  missing_path="/fit-in/100x100/definitely-not-there-$(date +%s).jpg"
  request "$(url_for "${missing_path}")" -H "Accept: */*"
  assert_status 404
  assert_header_contains "Content-Type" "application/json"
  assert_json_field ".code" "NoSuchKey"
  assert_json_field ".status" "404"
}

# Malformed request must produce the AWS-shaped 400 error JSON
# ({status,code,message} — all three fields present).
test_400_error_shape() {
  # A DEFAULT-type request whose base64 payload decodes to invalid JSON.
  bad_path="/$(b64 '{not-json')"
  request "$(url_for "${bad_path}")" -H "Accept: */*"
  assert_status 400
  assert_header_contains "Content-Type" "application/json"
  assert_json_field ".status" "400"
  local code msg
  code="$(jq -r '.code // empty' "${RES_BODY}" 2>/dev/null)"
  msg="$(jq -r '.message // empty' "${RES_BODY}" 2>/dev/null)"
  [[ -n "${code}" ]] || fail_msg "error JSON has no 'code' field"
  [[ -n "${msg}" ]] || fail_msg "error JSON has no 'message' field"
}

# CORS headers on success responses when CORS_ENABLED=Yes.
test_cors_headers() {
  request "$(url_for "/fit-in/100x100/${TEST_IMAGE_KEY}")" \
    -H "Accept: */*" -H "Origin: https://example.com"
  assert_status 200
  local origin; origin="$(header "Access-Control-Allow-Origin")"
  [[ -n "${origin}" ]] || fail_msg "Access-Control-Allow-Origin missing"
  assert_header_eq "Access-Control-Allow-Methods" "GET"
}

# AUTO_WEBP: Accept: image/webp must switch the output format to WebP.
test_auto_webp() {
  request "$(url_for "/fit-in/100x100/${TEST_IMAGE_KEY}")" \
    -H "Accept: image/webp,image/*;q=0.8"
  assert_status 200
  assert_header_contains "Content-Type" "image/webp"
  # And without the webp Accept value the origin format must come back.
  request "$(url_for "/fit-in/100x100/${TEST_IMAGE_KEY}")" -H "Accept: image/jpeg"
  assert_status 200
  local ct; ct="$(header "Content-Type")"
  [[ "${ct}" != *"image/webp"* ]] || fail_msg "got webp without webp in Accept"
}

# Signature enforcement: bad signature -> 403 SignatureDoesNotMatch,
# correct HMAC-SHA256(hex) over "path" -> 200.
test_signature() {
  local key path good_sig
  key="$(signature_key)"
  if [[ -z "${key}" || "${key}" == "null" ]]; then
    fail_msg "could not read '${SECRET_KEY_NAME}' from secret '${SECRET_NAME}'"
    return
  fi
  path="/fit-in/100x100/${TEST_IMAGE_KEY}"

  request "${BASE_URL}${path}?signature=deadbeef" -H "Accept: */*"
  assert_status 403
  assert_json_field ".code" "SignatureDoesNotMatch"

  good_sig="$(sign "${path}" "${key}")"
  request "${BASE_URL}${path}?signature=${good_sig}" -H "Accept: */*"
  assert_status 200
  assert_body_is_image "image/"
}

# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

echo "Running e2e tests against ${BASE_URL}"
echo "Test image key: ${TEST_IMAGE_KEY}"
echo

run_test test_default_resize  "DEFAULT (base64 JSON) resize returns 200 image"
run_test test_thumbor_resize  "THUMBOR fit-in resize returns 200 image"
run_test test_404_no_such_key "Missing key returns 404 NoSuchKey JSON"
run_test test_400_error_shape "Malformed request returns 400 error JSON"

if [[ "${CORS_ENABLED}" == "Yes" ]]; then
  run_test test_cors_headers "CORS headers present on responses"
else
  skip_test "CORS headers present on responses" "CORS_ENABLED=No"
fi

if [[ "${AUTO_WEBP}" == "Yes" ]]; then
  run_test test_auto_webp "AUTO_WEBP honours the Accept header"
else
  skip_test "AUTO_WEBP honours the Accept header" "AUTO_WEBP=No"
fi

if [[ "${ENABLE_SIGNATURE}" == "Yes" ]]; then
  run_test test_signature "Signature: wrong -> 403, correct HMAC -> 200"
else
  skip_test "Signature: wrong -> 403, correct HMAC -> 200" "ENABLE_SIGNATURE=No"
fi

echo
echo "Results: ${PASS} passed, ${FAIL} failed, ${SKIP} skipped"
[[ "${FAIL}" -eq 0 ]]
