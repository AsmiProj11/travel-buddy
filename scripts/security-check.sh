#!/usr/bin/env bash
#
# Security check for a deployed Travel Buddy instance.
# Tests that the live endpoints actually REJECT what they should reject —
# not just that they exist. Run this after every deploy, and anytime you
# change api/claude.js, api/refresh-memory.js, or vercel.json.
#
# Usage: ./scripts/security-check.sh https://your-app.vercel.app

set -u
BASE="${1:-}"
if [ -z "$BASE" ]; then
  echo "Usage: $0 https://your-app.vercel.app"
  exit 1
fi
BASE="${BASE%/}"

PASS=0
FAIL=0

check() {
  local desc="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "  PASS  $desc (got $actual)"
    PASS=$((PASS+1))
  else
    echo "  FAIL  $desc (expected $expected, got $actual)"
    FAIL=$((FAIL+1))
  fi
}

echo "== Travel Buddy security check: $BASE =="
echo

echo "-- Security headers on the main page --"
HEADERS=$(curl -s -D - -o /dev/null "$BASE/")
for h in "content-security-policy" "x-frame-options" "x-content-type-options" "strict-transport-security" "permissions-policy"; do
  if echo "$HEADERS" | grep -qi "^$h:"; then
    echo "  PASS  $h header present"
    PASS=$((PASS+1))
  else
    echo "  FAIL  $h header MISSING"
    FAIL=$((FAIL+1))
  fi
done
echo

echo "-- /api/claude: unauthenticated / malformed requests should be rejected --"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$BASE/api/claude")
check "GET (wrong method) -> 405" "405" "$CODE"

CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/claude" \
  -H "Content-Type: application/json" -H "Origin: $BASE" \
  -d '{"messages":[{"role":"user","content":"hi"}]}')
check "POST with no auth token -> 401" "401" "$CODE"

CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/claude" \
  -H "Content-Type: application/json" -H "Origin: $BASE" \
  -H "Authorization: Bearer not-a-real-token" \
  -d '{"messages":[{"role":"user","content":"hi"}]}')
check "POST with forged/garbage token -> 401" "401" "$CODE"

CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/claude" \
  -H "Content-Type: application/json" -H "Origin: https://some-other-site.example" \
  -H "Authorization: Bearer not-a-real-token" \
  -d '{"messages":[{"role":"user","content":"hi"}]}')
check "POST from a different Origin -> 403 or 401" "403" "$CODE"
echo "        (401 is also acceptable here — either means it was rejected before reaching the AI)"
echo

echo "-- /api/refresh-memory: same checks, plus admin gating --"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/refresh-memory" \
  -H "Origin: $BASE")
check "POST with no auth token -> 401" "401" "$CODE"

CODE=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$BASE/api/refresh-memory" \
  -H "Origin: $BASE")
check "GET with no auth token -> 401" "401" "$CODE"
echo "        (Full admin-gating and once-per-day checks need a REAL logged-in token to test —"
echo "         see the manual step below.)"
echo

echo "-- Sensitive files should not be served --"
for path in ".env" ".env.local" "supabase/schema.sql" "package.json"; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/$path")
  check "$path -> 404 (not served)" "404" "$CODE"
done
echo

echo "== $PASS passed, $FAIL failed =="
if [ "$FAIL" -gt 0 ]; then
  echo "Review the FAILs above before treating this deployment as production-ready."
  exit 1
fi
